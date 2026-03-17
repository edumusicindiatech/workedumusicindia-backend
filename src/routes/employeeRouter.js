const express = require('express');
const employeeRouter = express.Router();
const userAuth = require('../middleware/userAuth');
const DailyShift = require('../models/DailyShift');
const { sendShiftNotificationToAdmins } = require('../utils/emailService');
const Attendance = require('../models/Attendance');
const School = require('../models/School');
const { sendSchoolAttendanceAlert } = require('../utils/emailService');


employeeRouter.get('/me/profile', userAuth, async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            user: req.user
        });
    }
    catch (err) {
        console.log('Error fetching Profile', err);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching profile',
            error: err.message
        })

    }
});

employeeRouter.post('/shift/start', userAuth, async (req, res) => {
    try {
        const { latitude, longitude, territory } = req.body;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: "Location coordinates are required to start your day."
            });
        }

        // Format today's date as YYYY-MM-DD for easy lookup
        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Check if they already started a shift today
        const existingShift = await DailyShift.findOne({
            employee: req.user._id,
            date: todayStr
        });

        if (existingShift) {
            return res.status(400).json({
                success: false,
                message: "You have already started your day.",
                shift: existingShift
            });
        }
        const currentTime = new Date();
        // 2. Create the new shift record
        const newShift = new DailyShift({
            employee: req.user._id,
            date: todayStr,
            loginTime: new Date(),
            loginLocation: {
                type: 'Point',
                coordinates: [parseFloat(longitude), parseFloat(latitude)] // Longitude first!
            },
            territory: territory || "Unassigned"
        });

        await newShift.save();

        sendShiftNotificationToAdmins(req.user, 'Logged In', newShift.territory, currentTime);

        res.status(201).json({
            success: true,
            message: "Day started successfully",
            shift: newShift
        });

    } catch (error) {
        console.error('Error starting shift:', error);
        res.status(500).json({
            success: false,
            message: "Server error while starting the day",
            error: error.message
        });
    }
});

employeeRouter.post('/shift/end', userAuth, async (req, res) => {
    try {
        const { latitude, longitude } = req.body;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: "Location coordinates are required to end your day."
            });
        }

        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Find today's active shift
        const activeShift = await DailyShift.findOne({
            employee: req.user._id,
            date: todayStr,
            logoutTime: { $exists: false } // Make sure it hasn't been ended already
        });

        if (!activeShift) {
            return res.status(404).json({
                success: false,
                message: "No active shift found for today to end."
            });
        }
        const currentTime = new Date();
        // 2. Update the record with logout details
        activeShift.logoutTime = new Date();
        activeShift.logoutLocation = {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
        };

        await activeShift.save();
        sendShiftNotificationToAdmins(req.user, 'Logged Out', activeShift.territory, currentTime);

        res.status(200).json({
            success: true,
            message: "Day ended successfully",
            shift: activeShift
        });

    } catch (error) {
        console.error('Error ending shift:', error);
        res.status(500).json({
            success: false,
            message: "Server error while ending the day",
            error: error.message
        });
    }
});


// --- SCHOOL CHECK-IN ---
employeeRouter.post('/school/:schoolId/check-in', userAuth, async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        const { schoolId } = req.params;

        if (!latitude || !longitude) {
            return res.status(400).json({ success: false, message: "Location coordinates required." });
        }

        const lng = parseFloat(longitude);
        const lat = parseFloat(latitude);

        // 1. Geospatial Query: Find school ONLY IF within 100 meters
        const school = await School.findOne({
            _id: schoolId,
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [lng, lat]
                    },
                    $maxDistance: 100 // Geofenced to 100 meters
                }
            }
        });

        if (!school) {
            // Check if school exists at all to provide an accurate error
            const schoolExists = await School.findById(schoolId);
            if (schoolExists) {
                return res.status(403).json({ success: false, message: "Verification failed: You must be within 100 meters of the school to check in." });
            }
            return res.status(404).json({ success: false, message: "School not found." });
        }

        // 2. Prevent duplicate check-ins for the same day
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const existingAttendance = await Attendance.findOne({
            teacher: req.user._id,
            school: school._id,
            date: { $gte: startOfDay }
        });

        if (existingAttendance) {
            return res.status(400).json({ success: false, message: "You have already checked in to this school today." });
        }

        // 3. Calculate Lateness
        const currentTime = new Date();
        const scheduledStart = parseSchoolTime(school.startTime);
        const diffMins = Math.floor((currentTime - scheduledStart) / 60000);

        let status = 'Present';
        let remark = 'Checked in on time.';
        let isLate = false;

        if (diffMins > 0) {
            status = 'Late';
            isLate = true;
            remark = `Late by ${diffMins} minutes. (Scheduled for ${school.startTime})`;
        }

        // 4. Record Attendance
        const newAttendance = new Attendance({
            teacher: req.user._id,
            school: school._id,
            status: status,
            checkInTime: currentTime,
            locationVerified: true,
            clockInLocation: {
                type: 'Point',
                coordinates: [lng, lat]
            }
        });

        await newAttendance.save();

        // 5. Fire Email Alert
        await sendSchoolAttendanceAlert(req.user, school, 'Check-In', currentTime, remark, isLate);

        res.status(201).json({
            success: true,
            message: `Checked in successfully. ${isLate ? remark : ''}`,
            attendance: newAttendance
        });

    } catch (error) {
        console.error('Check-in Error:', error);
        res.status(500).json({ success: false, message: "Server error during check-in" });
    }
});

// --- SCHOOL CHECK-OUT ---
employeeRouter.post('/school/:schoolId/check-out', userAuth, async (req, res) => {
    try {
        const { latitude, longitude } = req.body;
        const { schoolId } = req.params;

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // 1. Find the active attendance record for today
        const attendance = await Attendance.findOne({
            teacher: req.user._id,
            school: schoolId,
            date: { $gte: startOfDay },
            checkOutTime: { $exists: false }
        }).populate('school');

        if (!attendance) {
            return res.status(404).json({ success: false, message: "Active check-in not found for this school today." });
        }

        // 2. Calculate working duration
        const currentTime = new Date();
        const durationMins = Math.floor((currentTime - attendance.checkInTime) / 60000);

        // 3. Update the record
        attendance.checkOutTime = currentTime;
        attendance.workDurationMinutes = durationMins;
        attendance.clockOutLocation = {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
        };

        await attendance.save();

        // 4. Configure remark (Highlighting if duration is > 30 mins per your request)
        let remark = `Completed visit. Total duration: ${durationMins} minutes.`;
        let highlightDuration = durationMins > 30;

        if (highlightDuration) {
            remark = `Extended Visit: Employee completed visit. Total duration was ${durationMins} minutes.`;
        }

        // 5. Fire Email Alert
        await sendSchoolAttendanceAlert(req.user, attendance.school, 'Check-Out', currentTime, remark, highlightDuration);

        res.status(200).json({
            success: true,
            message: "Checked out successfully",
            durationMinutes: durationMins,
            attendance
        });

    } catch (error) {
        console.error('Check-out Error:', error);
        res.status(500).json({ success: false, message: "Server error during check-out" });
    }
});
module.exports = employeeRouter