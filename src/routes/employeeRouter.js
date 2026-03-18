const express = require('express');
const employeeRouter = express.Router();
const userAuth = require('../middleware/userAuth');
const DailyShift = require('../models/DailyShift');
const { sendShiftNotificationToAdmins, sendTaskUpdateAlert } = require('../utils/emailService');
const Attendance = require('../models/Attendance');
const School = require('../models/School');
const { sendSchoolAttendanceAlert, sendDailyReportAlert } = require('../utils/emailService');
const OptionalTask = require('../models/OptionalTask');
const User = require('../models/User');
const DailyReport = require('../models/DailyReport');
const parseSchoolTime = require('../config/parseSchoolTime');


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

// --- GET TODAY'S ASSIGNED SCHOOLS & STATUS ---
employeeRouter.get('/my-itinerary', userAuth, async (req, res) => {
    try {
        // 1. Get user and heavily populate the assigned schools
        const user = await User.findById(req.user._id).populate('assignedSchools');

        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        // 2. Get today's attendance records for this specific employee
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const attendances = await Attendance.find({
            teacher: req.user._id,
            date: { $gte: startOfDay }
        });

        // 3. Map the real-time status to each assigned school
        const itinerary = user.assignedSchools.map(school => {
            // Find if there is an attendance record for this school today
            const record = attendances.find(a => a.school.toString() === school._id.toString());

            let currentStatus = 'pending';
            if (record) {
                currentStatus = record.checkOutTime ? 'completed' : 'in-progress';
            }

            return {
                _id: school._id,
                schoolName: school.schoolName,
                address: school.address,
                location: school.location, // Contains the [lng, lat] coordinates
                startTime: school.startTime,
                status: currentStatus,
                checkInTime: record?.checkInTime || null,
                checkOutTime: record?.checkOutTime || null
            };
        });

        res.status(200).json({
            success: true,
            schools: itinerary
        });

    } catch (error) {
        console.error('Itinerary Fetch Error:', error);
        res.status(500).json({ success: false, message: "Server error while fetching itinerary" });
    }
});

// --- GET PENDING OPTIONAL TASKS ---
employeeRouter.get('/optional-tasks', userAuth, async (req, res) => {
    try {
        // Find only pending tasks assigned to this specific teacher
        const tasks = await OptionalTask.find({
            teacher: req.user._id,
            status: 'Pending'
        }).populate('school', 'schoolName location address'); // Bring in school details

        res.status(200).json({
            success: true,
            tasks
        });
    } catch (error) {
        console.error('Error fetching optional tasks:', error);
        res.status(500).json({ success: false, message: "Server error while fetching tasks" });
    }
});

// --- ACCEPT OPTIONAL TASK ---
employeeRouter.post('/optional-tasks/:taskId/accept', userAuth, async (req, res) => {
    try {
        const { taskId } = req.params;

        // 1. Find the task and ensure it is pending
        const task = await OptionalTask.findOne({
            _id: taskId,
            teacher: req.user._id,
            status: 'Pending'
        });

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found or already processed." });
        }

        // 2. Update task status to officially mark it as Accepted
        task.status = 'Accepted';
        await task.save();

        // 3. TWO-WAY BINDING: Assign the school to the teacher, and the teacher to the school
        // Using Promise.all executes both database updates simultaneously for better performance
        await Promise.all([
            // Update User: Add this school to their assigned array
            User.findByIdAndUpdate(req.user._id, {
                $addToSet: { assignedSchools: task.school }
            }),

            // Update School: Set this teacher as the allotted employee
            School.findByIdAndUpdate(task.school, {
                allottedTeacher: req.user._id
            })
        ]);

        await sendTaskUpdateAlert(req.user, task.school, 'Accepted');

        res.status(200).json({
            success: true,
            message: "Task accepted! The school has been added to your assignments.",
            task
        });

    } catch (error) {
        console.error('Error accepting task:', error);
        res.status(500).json({ success: false, message: "Server error while accepting task" });
    }
});

// --- REJECT OPTIONAL TASK ---
employeeRouter.post('/optional-tasks/:taskId/reject', userAuth, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { rejectReason } = req.body;

        if (!rejectReason || rejectReason.trim() === "") {
            return res.status(400).json({ success: false, message: "A reason is required to reject a task." });
        }

        // 1. Find the task
        const task = await OptionalTask.findOne({
            _id: taskId,
            teacher: req.user._id,
            status: 'Pending'
        });

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found or already processed." });
        }

        // 2. Update status and save the reason
        task.status = 'Rejected';
        task.rejectReason = rejectReason;
        await task.save();

        await sendTaskUpdateAlert(req.user, task.school, 'Rejected', rejectReason);

        res.status(200).json({
            success: true,
            message: "Task rejected successfully.",
            task
        });

    } catch (error) {
        console.error('Error rejecting task:', error);
        res.status(500).json({ success: false, message: "Server error while rejecting task" });
    }
});

employeeRouter.post('/report/submit', userAuth, async (req, res) => {
    try {
        const { category, summary, actionItems, location } = req.body;

        if (!summary) {
            return res.status(400).json({ success: false, message: "Summary is required." });
        }

        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Check if they already submitted a report today to prevent duplicates
        const existingReport = await DailyReport.findOne({
            employee: req.user._id,
            date: todayStr
        });

        if (existingReport) {
            return res.status(400).json({ success: false, message: "You have already submitted a report for today." });
        }

        // 2. Create and save the report
        const newReport = new DailyReport({
            employee: req.user._id,
            date: todayStr,
            category: category || "Routine Visit",
            summary,
            actionItems,
            location
        });

        await newReport.save();

        // 3. Fire immediate email notification to Admins
        await sendDailyReportAlert(req.user, newReport);

        res.status(201).json({
            success: true,
            message: "Daily report submitted successfully",
            report: newReport
        });

    } catch (error) {
        console.error('Error submitting daily report:', error);
        res.status(500).json({ success: false, message: "Server error while submitting report" });
    }
});

module.exports = employeeRouter