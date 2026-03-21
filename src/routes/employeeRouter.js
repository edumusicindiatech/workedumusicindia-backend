const express = require('express');
const userAuth = require('../middleware/userAuth');
const School = require('../models/School');
const getCityFromCoordinates = require('../utils/getCityFromCoords');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const employeeRouter = express.Router();


// ==========================================
// GET CURRENT USER PROFILE (Redux Hydration)
// ==========================================
// Matches frontend: api.get('/employee/me/profile')
employeeRouter.get('/me/profile', userAuth, async (req, res) => {
    try {
        // req.user._id is automatically provided by your userAuth middleware
        const user = await User.findById(req.user._id).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User account no longer exists."
            });
        }

        // Return the exact object structure your Redux store expects
        res.status(200).json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                employeeId: user.employeeId,
                role: user.role,
                designation: user.designation,
                mobile: user.mobile,
                zone: user.zone,
                isFirstLogin: user.isFirstLogin,
                preferences: user.preferences
            }
        });

    } catch (error) {
        console.error("Profile Fetch Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error while fetching profile data."
        });
    }
});

// GET: Reverse Geocode Proxy (Bypasses CORS for the frontend)
employeeRouter.get('/get-city', userAuth, async (req, res) => {
    try {
        const { lat, lng } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ success: false, message: "Latitude and longitude are required." });
        }

        const city = await getCityFromCoordinates(lat, lng);

        res.status(200).json({ success: true, city });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching city." });
    }
});

// POST: Employee Check-In
employeeRouter.post('/check-in', userAuth, async (req, res) => {
    try {
        const { schoolId, band, latitude, longitude, lateReason, eventNote, eventDate } = req.body;
        const employeeId = req.user._id;

        // 1. GEOSPATIAL VERIFICATION
        // Use $nearSphere on the School collection to find the school ONLY if it's within 100m
        const schoolInRadius = await School.findOne({
            _id: schoolId,
            location: {
                $nearSphere: {
                    $geometry: {
                        type: "Point",
                        coordinates: [parseFloat(longitude), parseFloat(latitude)] // [lng, lat]
                    },
                    $maxDistance: 100 // 100 meters
                }
            }
        });

        if (!schoolInRadius) {
            return res.status(400).json({
                success: false,
                message: "Check-in failed. You must be within 100 meters of the school."
            });
        }

        // 2. FETCH ASSIGNMENT FOR TIME CHECK
        const user = await User.findById(employeeId);
        const assignment = user.assignments.find(
            a => a.school.toString() === schoolId && a.category === band
        );

        // 3. DETERMINE STATUS (Late vs Present)
        const now = new Date();
        const [time, modifier] = assignment.startTime.split(' ');
        let [hours, minutes] = time.split(':');
        if (hours === '12') hours = '00';
        if (modifier === 'PM') hours = parseInt(hours, 10) + 12;

        const scheduledStart = new Date(now);
        scheduledStart.setHours(hours, minutes, 0, 0);

        let status = 'Present';
        if (now.getTime() > (scheduledStart.getTime() + (5 * 60000))) {
            status = 'Late';
            if (!lateReason) {
                return res.status(400).json({ success: false, message: "Late reason is required." });
            }
        }

        const todayString = now.toISOString().split('T')[0];

        // 4. CREATE ATTENDANCE (No daily report here)
        const newAttendance = await Attendance.create({
            teacher: employeeId,
            school: schoolId,
            band: band,
            date: todayString,
            status: status,
            checkInTime: now,
            checkInCoordinates: [longitude, latitude],
            lateReason: lateReason || null,
            eventNote: eventNote || null,
            eventDate: eventDate || null
        });

        res.status(200).json({ success: true, message: `Checked in as ${status}`, data: newAttendance });

    } catch (error) {
        console.error("Check-in Error:", error);
        res.status(500).json({ success: false, message: "Server error during check-in" });
    }
});

// POST: Employee Check-Out
employeeRouter.post('/check-out', userAuth, async (req, res) => {
    try {
        // MATCHING YOUR FRONTEND PAYLOAD:
        const { schoolId, band, latitude, longitude, overtimeReason, dailyReport } = req.body;
        const employeeId = req.user._id;

        const now = new Date();
        const todayString = now.toISOString().split('T')[0];

        const attendanceRecord = await Attendance.findOne({
            teacher: employeeId, school: schoolId, band: band, date: todayString
        });

        if (!attendanceRecord || attendanceRecord.checkOutTime) {
            return res.status(400).json({ success: false, message: "Invalid check-out request." });
        }

        // Apply data from React modals
        attendanceRecord.checkOutTime = now;
        if (latitude && longitude) attendanceRecord.checkOutCoordinates = [longitude, latitude];
        if (overtimeReason) attendanceRecord.overtimeReason = overtimeReason;
        if (dailyReport) attendanceRecord.dailyReport = dailyReport;

        await attendanceRecord.save();

        res.status(200).json({ success: true, data: attendanceRecord });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error during check-out" });
    }
});

// POST: Mark Assignment as Absent or Holiday
employeeRouter.post('/mark-status', userAuth, async (req, res) => {
    try {
        const { schoolId, band, status, reason } = req.body;
        const employeeId = req.user._id;

        // Ensure they only send valid statuses for this route
        if (!['Absent', 'Holiday'].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status type." });
        }

        // 1. Determine "Today"
        const now = new Date();
        const todayString = now.toISOString().split('T')[0];

        // 2. Check if a record already exists (maybe they checked in earlier!)
        const existingRecord = await Attendance.findOne({
            teacher: employeeId,
            school: schoolId,
            band: band,
            date: todayString
        });

        if (existingRecord) {
            return res.status(400).json({
                success: false,
                message: `Cannot mark ${status}. You already have a record for this assignment today.`
            });
        }

        // 3. Create the 'Absent' or 'Holiday' Record
        const newRecord = await Attendance.create({
            teacher: employeeId,
            school: schoolId,
            band: band,
            date: todayString,
            status: status, // 'Absent' or 'Holiday'
            teacherNote: reason || "", // The text from the modal!

            // Note: We leave checkInTime and checkOutTime blank 
            // because they never actually went to the school.
        });

        res.status(200).json({
            success: true,
            message: `Successfully marked as ${status}.`,
            data: newRecord
        });

    } catch (error) {
        console.error("Mark Status Error:", error);
        res.status(500).json({ success: false, message: "Server error while updating status" });
    }
});

// POST: Global "Day Absent" or "Day Holiday"
employeeRouter.post('/mark-day-status', userAuth, async (req, res) => {
    try {
        const { status, reason } = req.body;
        const employeeId = req.user._id;

        if (!['Absent', 'Holiday'].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status type." });
        }

        // 1. Get Today's Date and Day of the Week (e.g., "Mon", "Tue")
        const now = new Date();
        const todayString = now.toISOString().split('T')[0];
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const todayDayOfWeek = days[now.getDay()];

        // 2. Fetch the User and their Assignments
        const user = await User.findById(employeeId);
        if (!user || !user.assignments || user.assignments.length === 0) {
            return res.status(400).json({ success: false, message: "No assignments found for this user." });
        }

        // 3. Filter assignments to ONLY find the ones scheduled for TODAY
        const todaysAssignments = user.assignments.filter(assignment =>
            assignment.allowedDays.includes(todayDayOfWeek)
        );

        if (todaysAssignments.length === 0) {
            return res.status(400).json({ success: false, message: "You have no schools scheduled for today." });
        }

        // 4. Check which assignments ALREADY have an attendance record today
        // (e.g., if they went to 1 school in the morning, but went home sick for the rest)
        const existingRecords = await Attendance.find({
            teacher: employeeId,
            date: todayString
        });

        // Create a lookup for easy matching
        const existingKeys = existingRecords.map(r => `${r.school.toString()}-${r.band}`);

        // 5. Prepare the new bulk records
        const recordsToCreate = [];

        todaysAssignments.forEach(assignment => {
            const assignmentKey = `${assignment.school.toString()}-${assignment.category}`;

            // Only create an 'Absent' record if they haven't already checked in/out of this specific one today
            if (!existingKeys.includes(assignmentKey)) {
                recordsToCreate.push({
                    teacher: employeeId,
                    school: assignment.school,
                    band: assignment.category,
                    date: todayString,
                    status: status, // 'Absent' or 'Holiday'
                    teacherNote: reason || "Marked globally via Day Absent feature"
                });
            }
        });

        // 6. Bulk Insert into the Database
        if (recordsToCreate.length > 0) {
            await Attendance.insertMany(recordsToCreate);
        }

        res.status(200).json({
            success: true,
            message: `Successfully marked ${recordsToCreate.length} remaining assignments as ${status} for today.`,
            data: recordsToCreate
        });

    } catch (error) {
        console.error("Global Day Status Error:", error);
        res.status(500).json({ success: false, message: "Server error while marking day status" });
    }
});

// GET: Fetch Employee's Daily Schedule
employeeRouter.get('/my-schedule', userAuth, async (req, res) => {
    try {
        const employeeId = req.user._id;

        // 1. Grab Live GPS from Query Params (e.g., /my-schedule?lat=26.2&lng=82.0)
        const { lat, lng } = req.query;
        const userLocation = (lat && lng) ? [parseFloat(lng), parseFloat(lat)] : null;

        // 2. Setup Time & Date
        const now = new Date();
        const todayString = now.toISOString().split('T')[0];
        const daysMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const todayDayOfWeek = daysMap[now.getDay()];

        // 3. Fetch User with populated School details
        const user = await User.findById(employeeId).populate({
            path: 'assignments.school',
            select: 'schoolName address location'
        });

        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        // 4. Filter for today's assigned schools only
        const todaysAssignments = user.assignments.filter(a =>
            a.allowedDays.includes(todayDayOfWeek)
        );

        // 5. Fetch all Attendance Logs already created today
        const todaysLogs = await Attendance.find({
            teacher: employeeId,
            date: todayString
        });

        // 6. Process Assignments into Dashboard Cards
        const processedVisits = await Promise.all(todaysAssignments.map(async (assignment) => {

            // Check if a log exists for this specific school + category
            const log = todaysLogs.find(l =>
                l.school.toString() === assignment.school._id.toString() &&
                l.band === assignment.category
            );

            // --- DISTANCE CALCULATION (MongoDB Way) ---
            let distanceStr = "---";
            if (userLocation) {
                // Correct MongoDB Aggregation: $geoNear MUST be the first stage!
                const distanceInMeters = await School.aggregate([
                    {
                        $geoNear: {
                            near: { type: "Point", coordinates: userLocation },
                            distanceField: "dist",
                            spherical: true,
                            query: { _id: assignment.school._id } // <-- The fix is right here
                        }
                    }
                ]);

                if (distanceInMeters.length > 0) {
                    const km = distanceInMeters[0].dist / 1000;
                    distanceStr = `${km.toFixed(1)} km`;
                }
            }

            // --- TIME & STATE CALCULATION ---
            let uiStatus = "pending";
            let minutesLate = 0;
            let overtimeMinutes = 0;

            if (log) {
                if (log.status === 'Absent') uiStatus = "absent";
                else if (log.status === 'Holiday') uiStatus = "holiday";
                else if (log.checkInTime && !log.checkOutTime) uiStatus = "checked_in";
                else if (log.checkInTime && log.checkOutTime) uiStatus = "completed";
            }

            // Helper to get diff between "now" and a time string "08:00 AM"
            const getTimeDiff = (timeStr) => {
                const [time, mod] = timeStr.split(' ');
                let [h, m] = time.split(':');
                if (h === '12') h = '00';
                if (mod === 'PM') h = parseInt(h) + 12;
                const d = new Date(now);
                d.setHours(h, m, 0, 0);
                return Math.floor((now - d) / 60000);
            };

            if (uiStatus === "pending") {
                minutesLate = getTimeDiff(assignment.startTime);
            } else if (uiStatus === "checked_in") {
                overtimeMinutes = getTimeDiff(assignment.endTime);
            }

            // --- RETURN OBJECT (Matches your React state perfectly) ---
            return {
                id: `${assignment.school._id}-${assignment.category}`,
                schoolId: assignment.school._id,
                schoolName: assignment.school.schoolName,
                category: assignment.category,
                address: assignment.school.address,
                scheduledTime: assignment.startTime,
                scheduledEndTime: assignment.endTime,
                status: uiStatus,
                distance: distanceStr,
                minutesLate: minutesLate > 0 ? minutesLate : 0,
                overtimeMinutes: overtimeMinutes > 0 ? overtimeMinutes : 0,
                attendanceId: log ? log._id : null
            };
        }));

        // 7. Sort by Scheduled Time (Soonest first)
        const timeToNum = (t) => {
            const [time, mod] = t.split(' ');
            let [h, m] = time.split(':');
            h = parseInt(h);
            if (h === 12) h = 0;
            if (mod === 'PM') h += 12;
            return h * 60 + parseInt(m);
        };

        processedVisits.sort((a, b) => timeToNum(a.scheduledTime) - timeToNum(b.scheduledTime));

        res.status(200).json({
            success: true,
            data: processedVisits,
            stats: {
                total: processedVisits.length,
                pending: processedVisits.filter(v => v.status === 'pending' || v.status === 'checked_in').length
            }
        });

    } catch (error) {
        console.error("Dashboard Fetch Error:", error);
        res.status(500).json({ success: false, message: "Error loading dashboard" });
    }
});


module.exports = employeeRouter