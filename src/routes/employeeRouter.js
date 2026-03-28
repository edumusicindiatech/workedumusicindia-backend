const express = require('express');
const userAuth = require('../middleware/userAuth');
const School = require('../models/School');
const getCityFromCoordinates = require('../utils/getCityFromCoords');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const bcrypt = require('bcrypt')
const isValidator = require('validator');
const Event = require('../models/Event')
const { canSendEmailToUser } = require('../utils/canSendEmailToUser')
const crypto = require("crypto");
const { PutObjectCommand, DeleteObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, AbortMultipartUploadCommand, CompleteMultipartUploadCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const s3Client = require("../config/s3");
const MediaLog = require("../models/MediaLog");
const { GetObjectCommand } = require('@aws-sdk/client-s3')
const WeeklyProgress = require('../models/WeeklyProgress');

// Import all specific email templates
const {
    sendAdminTaskResponseEmail,
    sendAdminCheckInAlert,
    sendAdminCheckOutAlert,
    sendAdminStatusAlert,
    sendAdminNewEventAlert,
    sendLeaveRequestEmailToAdmin,
    sendLeaveRevokedEmailToAdmin,
    sendMediaUploadFailureEmailToEmployee,
    sendNewMediaEmailToAdmin
} = require('../utils/emailService');
const DailyReports = require('../models/DailyReports');
const LeaveRequest = require('../models/LeaveRequest');
const path = require('path');

const employeeRouter = express.Router();

// ==========================================
// HELPERS
// ==========================================

// Convert "08:00 AM" to today's Date object for time math
const getScheduledDate = (timeStr) => {
    const now = new Date();
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':');
    hours = parseInt(hours, 10);
    if (hours === 12) hours = 0;
    if (modifier === 'PM') hours += 12;
    now.setHours(hours, parseInt(minutes, 10), 0, 0);
    return now;
};

// Handles In-App Notifications & Sockets, and returns the list of admins 
// so we can loop through them to send specific emails.
const notifyAdminsInApp = async (req, title, message, type = "System") => {
    const admins = await User.find({ role: { $in: ['Admin'] } });

    await Promise.all(admins.map(async (admin) => {
        const notif = await Notification.create({ recipient: admin._id, title, message, type });
        if (req.io) req.io.to(admin._id.toString()).emit('new_notification', notif);
    }));

    return admins; // Return the admins array to process emails sequentially
};

// ==========================================
// 1. GET CURRENT USER PROFILE (Redux Hydration)
// ==========================================
employeeRouter.get('/me/profile', userAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-password')
            .populate('assignments.school', 'schoolName address location');
        if (!user) {
            return res.status(404).json({ success: false, message: "User account no longer exists." });
        }
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
                preferences: user.preferences,
                assignments: user.assignments
            }
        });
    } catch (error) {
        console.error("Profile Fetch Error:", error);
        res.status(500).json({ success: false, message: "Server error while fetching profile data." });
    }
});

// ==========================================
// 2. GET REVERSE GEOCODE PROXY
// ==========================================
employeeRouter.get('/get-city', userAuth, async (req, res) => {
    try {
        const { lat, lng } = req.query;
        if (!lat || !lng) return res.status(400).json({ success: false, message: "Latitude and longitude required." });
        const city = await getCityFromCoordinates(lat, lng);
        res.status(200).json({ success: true, city });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching city." });
    }
});

// ==========================================
// 3. GET SCHEDULE (Filtered & Sorted)
// ==========================================
employeeRouter.get('/my-schedule', userAuth, async (req, res) => {
    try {
        const employeeId = req.user._id;
        const now = new Date();
        const todayString = now.toISOString().split('T')[0];
        const todayDayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];

        const user = await User.findById(employeeId).populate({
            path: 'assignments.school',
            select: 'schoolName address location'
        });

        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const todaysLogs = await Attendance.find({ teacher: employeeId, date: todayString });

        let activeAssignments = [];

        user.assignments.forEach(assignment => {
            if (!assignment?.allowedDays?.includes(todayDayOfWeek)) return;

            const log = todaysLogs.find(l =>
                l.school?.toString() === assignment?.school?._id.toString() && l?.band === assignment.category
            );

            // Hide completed shifts or marked absences/holidays
            if (log && (log.checkOutTime || ['Absent', 'Holiday'].includes(log.status))) return;

            let uiStatus = log ? "checked_in" : "pending";
            let minutesLate = 0;
            let overtimeMinutes = 0;

            const scheduledStart = getScheduledDate(assignment.startTime);
            const scheduledEnd = getScheduledDate(assignment.endTime);

            if (uiStatus === "pending" && now > scheduledStart) {
                minutesLate = Math.floor((now - scheduledStart) / 60000);
            } else if (uiStatus === "checked_in" && now > scheduledEnd) {
                overtimeMinutes = Math.floor((now - scheduledEnd) / 60000);
            }

            activeAssignments.push({
                id: `${assignment.school._id}-${assignment.category}`,
                schoolId: assignment.school._id,
                schoolName: assignment.school.schoolName,
                address: assignment.school.address,
                category: assignment.category,
                startTime: assignment.startTime,
                endTime: assignment.endTime,
                coordinates: assignment.school.location.coordinates, // [lng, lat] for maps
                status: uiStatus,
                minutesLate,
                overtimeMinutes
            });
        });

        // Sort by Scheduled Time (Earliest first)
        activeAssignments.sort((a, b) => getScheduledDate(a.startTime) - getScheduledDate(b.startTime));

        res.status(200).json({ success: true, data: activeAssignments });
    } catch (error) {
        console.error("Schedule Error:", error);
        res.status(500).json({ success: false, message: "Error loading schedule" });
    }
});

// ==========================================
// 4. CHECK-IN (100m Geofence)
// ==========================================
employeeRouter.post('/check-in', userAuth, async (req, res) => {
    try {
        const { schoolId, band, latitude, longitude, lateReason, eventNote } = req.body;
        const employee = await User.findById(req.user._id);

        const school = await School.findOne({
            _id: schoolId,
            location: {
                $nearSphere: {
                    $geometry: { type: "Point", coordinates: [parseFloat(longitude), parseFloat(latitude)] },
                    $maxDistance: 100
                }
            }
        });

        if (!school) return res.status(403).json({ success: false, message: "Check-in failed. You are far from alloted location." });

        let status = 'Present';
        if (lateReason) status = 'Late';
        if (eventNote) status = 'Late';

        await Attendance.create({
            teacher: employee._id,
            school: school._id,
            band: band,
            date: new Date().toISOString().split('T')[0],
            checkInTime: new Date(),
            status,
            lateReason: lateReason || null,
            eventNote: eventNote || null,
            checkInCoordinates: [longitude, latitude]
        });

        const assignment = employee.assignments.find(a => a.school.toString() === schoolId && a.category === band);
        const checkInTimeStr = new Date().toLocaleTimeString('en-US');

        // Notify Admins
        const admins = await notifyAdminsInApp(req, `Live Check-In: ${employee.name}`, `${employee.name} checked in at ${school.schoolName}`, status === 'Late' ? "Warning" : "System");

        for (const admin of admins) {
            // We now await the helper, which checks both the Global Settings and the Admin's personal toggle
            if (await canSendEmailToUser(admin)) {
                await sendAdminCheckInAlert(
                    admin.email, admin.name, employee.name, school.schoolName, band,
                    assignment?.startTime || 'N/A', checkInTimeStr, status, lateReason, eventNote
                );
            }
        }

        res.status(200).json({ success: true, message: "Checked in successfully." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error during check-in" });
    }
});

// ==========================================
// 5. CHECK-OUT (100m Geofence & Overtime)
// ==========================================
employeeRouter.post('/check-out', userAuth, async (req, res) => {
    try {
        const { schoolId, band, latitude, longitude, overtimeReason } = req.body;
        const employee = await User.findById(req.user._id);

        const school = await School.findOne({
            _id: schoolId,
            location: {
                $nearSphere: { $geometry: { type: "Point", coordinates: [parseFloat(longitude), parseFloat(latitude)] }, $maxDistance: 100 }
            }
        });

        if (!school) return res.status(403).json({ success: false, message: "You must be nearby alloted location for the check out." });

        const todayString = new Date().toISOString().split('T')[0];
        const record = await Attendance.findOne({ teacher: employee._id, school: schoolId, band, date: todayString, checkOutTime: null });

        if (!record) return res.status(400).json({ success: false, message: "No active check-in found." });

        record.checkOutTime = new Date();
        record.overtimeReason = overtimeReason || null;
        record.checkOutCoordinates = [longitude, latitude];
        await record.save();

        const checkOutTimeStr = new Date().toLocaleTimeString('en-US');

        // Notify Admins
        const admins = await notifyAdminsInApp(req, `Check-Out: ${employee.name}`, `${employee.name} checked out of ${school.schoolName}`, overtimeReason ? "Warning" : "System");

        for (const admin of admins) {
            if (await canSendEmailToUser(admin)) {
                await sendAdminCheckOutAlert(
                    admin.email, admin.name, employee.name, school.schoolName, band,
                    checkOutTimeStr, overtimeReason
                );
            }
        }

        res.status(200).json({ success: true, message: "Checked out successfully." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error during check-out" });
    }
});

// ==========================================
// 6. MARK STATUS (Absent / Holiday)
// ==========================================
employeeRouter.post('/mark-day-status', userAuth, async (req, res) => {
    try {
        const { status, reason } = req.body;
        const employeeId = req.user._id;

        // --- NEW: Require reason for Absent or Holiday ---
        if (['absent', 'holiday'].includes(status.toLowerCase()) && (!reason || reason.trim() === '')) {
            return res.status(400).json({
                success: false,
                message: "A reason is mandatory when marking Absent or Holiday."
            });
        }

        // Populate the assignments so we can grab the school details
        const employee = await User.findById(employeeId).populate('assignments.school');

        // Mirroring your exact working date logic
        const dateString = new Date().toISOString().split('T')[0];
        const todayDayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];

        // 1. Get today's assignments
        const todaysAssignments = employee.assignments.filter(a => a?.allowedDays?.includes(todayDayOfWeek));

        // 2. Find shifts that already have an attendance record so we skip them
        const existingRecords = await Attendance.find({ teacher: employeeId, date: dateString });
        const existingKeys = existingRecords.map(r => `${r?.school?.toString()}-${r?.band}`);

        const recordsToCreate = [];

        // 3. Prepare the exact same object structure as your working /mark-status route
        todaysAssignments.forEach(a => {
            if (!existingKeys.includes(`${a?.school?._id}-${a?.category}`)) {
                recordsToCreate.push({
                    teacher: employeeId,
                    school: a?.school?._id,
                    band: a?.category,
                    date: dateString,
                    status: status,
                    teacherNote: reason || "Marked from Dashboard" // Exact match to your working code
                });
            }
        });

        // 4. Create them all at once using insertMany (the bulk equivalent of .create)
        if (recordsToCreate.length > 0) {
            await Attendance.insertMany(recordsToCreate);

            // --- REAL-TIME SOCKET UPDATES START ---
            const io = req.io;
            if (io) {
                // Instantly refresh the employee's dashboard
                io.to(employeeId.toString()).emit("employee_schedule_refresh", {
                    type: "SCHEDULE_UPDATE",
                    message: `All remaining shifts marked as ${status}.`
                });
                io.emit('operations_update', { type: 'refresh_feed' });
            }
            // --- REAL-TIME SOCKET UPDATES END ---

            // Notify Admins (Exact same logic as your working route)
            const admins = await notifyAdminsInApp(req, `${status} Alert: ${employee.name}`, `${employee.name} marked full day ${status} for remaining schools`, "Warning");

            if (Array.isArray(admins)) {
                for (const admin of admins) {
                    // DELETED THE MANUAL "io.to(admin._id).emit" BLOCK HERE

                    // ONLY keep the email alert logic in this loop
                    if (await canSendEmailToUser(admin)) {
                        await sendAdminStatusAlert(admin.email, admin.name, employee.name, "All Remaining Schools", "N/A", status, reason);
                    }
                }
            }
        }

        res.status(200).json({ success: true, message: `All remaining shifts marked as ${status}.` });
    } catch (error) {
        console.error("Error in /mark-day-status:", error);
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ==========================================
// 7. GLOBAL DAY ABSENT / HOLIDAY
// ==========================================
employeeRouter.post('/mark-day-status', userAuth, async (req, res) => {
    try {
        const { status, reason } = req.body;
        const employeeId = req.user._id;

        // Populate the assignments so we can grab the school details
        const employee = await User.findById(employeeId).populate('assignments.school');

        // Mirroring your exact working date logic
        const dateString = new Date().toISOString().split('T')[0];
        const todayDayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];

        // 1. Get today's assignments
        const todaysAssignments = employee.assignments.filter(a => a?.allowedDays?.includes(todayDayOfWeek));

        // 2. Find shifts that already have an attendance record so we skip them
        const existingRecords = await Attendance.find({ teacher: employeeId, date: dateString });
        const existingKeys = existingRecords.map(r => `${r?.school?.toString()}-${r?.band}`);

        const recordsToCreate = [];

        // 3. Prepare the exact same object structure as your working /mark-status route
        todaysAssignments.forEach(a => {
            if (!existingKeys.includes(`${a?.school?._id}-${a?.category}`)) {
                recordsToCreate.push({
                    teacher: employeeId,
                    school: a?.school?._id,
                    band: a?.category,
                    date: dateString,
                    status: status,
                    teacherNote: reason || "Marked from Dashboard" // Exact match to your working code
                });
            }
        });

        // 4. Create them all at once using insertMany (the bulk equivalent of .create)
        if (recordsToCreate.length > 0) {
            await Attendance.insertMany(recordsToCreate);

            // --- REAL-TIME SOCKET UPDATES START ---
            const io = req.io;
            if (io) {
                // Instantly refresh the employee's dashboard
                io.to(employeeId.toString()).emit("employee_schedule_refresh", {
                    type: "SCHEDULE_UPDATE",
                    message: `All remaining shifts marked as ${status}.`
                });
                io.emit('operations_update', { type: 'refresh_feed' });
            }
            // --- REAL-TIME SOCKET UPDATES END ---

            // Notify Admins (Exact same logic as your working route)

            const admins = await notifyAdminsInApp(req, `${status} Alert: ${employee.name}`, `${employee.name} marked full day ${status} for remaining schools`, "Warning");

            if (Array.isArray(admins)) {
                for (const admin of admins) {
                    // DELETED THE MANUAL "io.to(admin._id).emit" BLOCK HERE

                    // ONLY keep the email alert logic in this loop
                    if (await canSendEmailToUser(admin)) {
                        await sendAdminStatusAlert(admin.email, admin.name, employee.name, "All Remaining Schools", "N/A", status, reason);
                    }
                }
            }
        }

        res.status(200).json({ success: true, message: `All remaining shifts marked as ${status}.` });
    } catch (error) {
        console.error("Error in /mark-day-status:", error);
        res.status(500).json({ success: false, message: "Server error." });
    }
});

// ==========================================
// 8. PUT : Change the Response of the Task
// ==========================================
employeeRouter.put('/tasks/:taskId/respond', userAuth, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { status, rejectReason } = req.body;

        const task = await Task.findById(taskId).populate('school');
        if (!task) return res.status(404).json({ success: false, message: "Task not found" });

        if (task.teacher.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        task.status = status;
        if (status === 'Rejected') {
            task.rejectReason = rejectReason;
        }
        await task.save();

        if (status === 'Accepted') {
            const employee = await User.findById(req.user._id);
            let startTime = "";
            let endTime = "";
            if (task.timing && task.timing.includes('-')) {
                const parts = task.timing.split('-');
                startTime = parts[0].trim();
                endTime = parts[1].trim();
            }

            const coords = task.school?.location?.coordinates || [0, 0];
            const newAssignment = {
                school: task.school._id,
                category: task.category || "Junior Band",
                startDate: new Date(),
                startTime: startTime,
                endTime: endTime,
                allowedDays: task.daysAllotted,
                geofence: {
                    latitude: parseFloat(coords[1] || 0),
                    longitude: parseFloat(coords[0] || 0)
                }
            };
            employee.assignments.push(newAssignment);
            await employee.save();
        }

        const taskTitle = `Assignment at ${task.school.schoolName}`;
        const admins = await notifyAdminsInApp(req, `Task ${status}`, `${req.user.name} has ${status.toLowerCase()} the task at ${task.school.schoolName}.`, "System");

        for (const admin of admins) {
            if (await canSendEmailToUser(admin)) {
                await sendAdminTaskResponseEmail(
                    admin.email, admin.name, req.user.name, taskTitle, status, rejectReason
                );
            }
        }

        res.status(200).json({ success: true, message: `Task marked as ${status}` });
    } catch (error) {
        console.error("Task Response Error:", error);
        res.status(500).json({ success: false, message: "Server error responding to task." });
    }
});

// ==========================================
// 9. GET ASSIGNED SCHOOLS & 30-DAY HISTORY
// ==========================================
employeeRouter.get('/assigned-schools', userAuth, async (req, res) => {
    try {
        const employeeId = req.user._id;

        // Calculate the date 30 days ago
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoString = thirtyDaysAgo.toISOString().split('T')[0];

        const user = await User.findById(employeeId).populate('assignments.school');
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        // Get all attendance for the last 30 days
        const attendances = await Attendance.find({
            teacher: employeeId,
            date: { $gte: thirtyDaysAgoString }
        }).sort({ date: -1 });

        // Group assignments by School ID
        const schoolsMap = {};

        user.assignments.forEach(assignment => {
            if (!assignment.school) return;
            const schoolId = assignment.school._id.toString();

            if (!schoolsMap[schoolId]) {
                schoolsMap[schoolId] = {
                    id: schoolId,
                    name: assignment.school.schoolName,
                    address: assignment.school.address,
                    categories: []
                };
            }

            // Filter attendance strictly for this specific school + category
            const catAttendances = attendances.filter(a => a.school?.toString() === schoolId && a.band === assignment.category);

            let stats = { present: 0, late: 0, absent: 0, events: 0, leaves: 0 };

            let history = catAttendances.map(a => {
                let statusUpper = (a.status || 'Unknown').toUpperCase();
                if (statusUpper === 'PRESENT') stats.present++;
                if (statusUpper === 'LATE') stats.late++;
                if (statusUpper === 'ABSENT') stats.absent++;
                if (statusUpper === 'EVENT') stats.events++;
                if (statusUpper === 'LEAVE' || statusUpper === 'HOLIDAY') stats.leaves++;

                const d = new Date(a.date);
                const formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                return {
                    id: a._id,
                    date: formattedDate,
                    status: a.status,
                    note: a.teacherNote || a.lateReason || a.eventNote || null
                };
            });

            schoolsMap[schoolId].categories.push({
                id: assignment._id,
                name: assignment.category,
                startTime: assignment.startTime,
                endTime: assignment.endTime,
                allowedDays: assignment.allowedDays,
                geofence: assignment.geofence,
                stats,
                history
            });
        });

        const responseData = Object.values(schoolsMap);
        res.status(200).json({ success: true, data: responseData });

    } catch (error) {
        console.error("Assigned Schools Fetch Error:", error);
        res.status(500).json({ success: false, message: "Server error fetching assigned schools." });
    }
});

// ==========================================
// 10. POST EVENT LOG
// ==========================================
employeeRouter.post('/events', userAuth, async (req, res) => {
    try {
        // Assume you have an Event model. If not, create one!
        const event = await Event.create({
            teacher: req.user._id,
            ...req.body
        });

        // Fetch employee details to send in email
        const employeeName = req.user.name;

        // --- REAL-TIME SOCKET & NOTIFICATION EMIT TO ADMINS ---
        if (req.io) {
            const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] } });

            await Promise.all(admins.map(async (admin) => {
                // Create Notification in DB
                const adminNotif = await Notification.create({
                    recipient: admin._id,
                    title: "New Event Logged",
                    message: `${employeeName} scheduled an event at ${req.body.schoolName}.`,
                    type: "System"
                });

                // Trigger Badge/Sound
                req.io.to(admin._id.toString()).emit('new_notification', adminNotif);

                // Trigger the Live Event update in the UI
                req.io.to(admin._id.toString()).emit('new_event', event);

                // Send the Email
                await sendAdminNewEventAlert(
                    admin.email, admin.name, employeeName,
                    req.body.schoolName, req.body.categoryName,
                    req.body.startDate, req.body.endDate,
                    req.body.timeFrom, req.body.timeTo, req.body.description
                );
            }));
        }

        res.status(201).json({ success: true, data: event });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error saving event." });
    }
});

// ==========================================
// 11. POST MEDIA UPLOAD LOG
// ==========================================
employeeRouter.post('/media', userAuth, async (req, res) => {
    try {
        const { schoolId, band, mediaType, eventDate, eventContext, files } = req.body;

        const newMediaLog = await MediaLog.create({
            teacher: req.user._id,
            school: schoolId,
            band, mediaType, eventDate, eventContext, files
        });

        res.status(200).json({ success: true, message: "Media uploaded successfully", data: newMediaLog });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error uploading media." });
    }
});

// ==========================================
// 12. GET PENDING & RECENT TASKS
// ==========================================
employeeRouter.get('/tasks', userAuth, async (req, res) => {
    try {
        // Fetch tasks assigned to this employee
        const tasks = await Task.find({ teacher: req.user._id })
            .populate('school', 'schoolName address location')
            .sort({ createdAt: -1 }); // Newest first

        // Format the response for the frontend
        const formattedTasks = tasks.map(task => ({
            id: task._id,
            schoolName: task.school ? task.school.schoolName : "Unknown School",
            location: task.school ? task.school.address : "Unknown Location",
            daysAllotted: task.daysAllotted,
            duration: task.duration,
            timing: task.timing,
            category: task.category,
            taskDescription: task.taskDescription,
            status: task.status.toLowerCase(), // Ensure 'pending', 'accepted', 'rejected'
            rejectReason: task.rejectReason
        }));

        res.status(200).json({ success: true, data: formattedTasks });
    } catch (error) {
        console.error("Fetch Tasks Error:", error);
        res.status(500).json({ success: false, message: "Server error fetching tasks." });
    }
});

// ==========================================
// 13. POST END OF DAY REPORT
// ==========================================
employeeRouter.post('/daily-report', userAuth, async (req, res) => {
    try {
        const { date, category, summary, eventName, eventDate } = req.body;
        const teacherId = req.user._id;
        const teacherName = req.user.name; // Get the employee's name for the alert

        // Upsert: Update if exists, Create if it doesn't
        const report = await DailyReports.findOneAndUpdate(
            { teacher: teacherId, date: date },
            {
                $set: { category, summary, eventName, eventDate }
            },
            { returnDocument: 'after', upsert: true }
        );

        // --- REAL-TIME SOCKET & NOTIFICATION EMIT TO ADMINS ---
        if (req.io) {
            const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] } });

            await Promise.all(admins.map(async (admin) => {
                // 1. Create the actual Notification in the database for the Alerts tab
                const adminNotif = await Notification.create({
                    recipient: admin._id,
                    title: "Daily Report Submitted",
                    message: `${teacherName} has submitted their End of Day report.`,
                    type: "System"
                });

                // 2. Emit the standard notification (This triggers the Sound & Red Badge!)
                req.io.to(admin._id.toString()).emit('new_notification', adminNotif);

                // 3. Emit the custom event to update the Daily Reports UI live
                req.io.to(admin._id.toString()).emit('new_daily_report', report);
            }));
        }

        res.status(200).json({ success: true, message: "Report saved successfully.", data: report });
    } catch (error) {
        console.error("Save Report Error:", error);
        res.status(500).json({ success: false, message: "Server error saving report." });
    }
});

// ==========================================
// 14. UPDATE EMPLOYEE PASSWORD
// ==========================================
employeeRouter.put('/profile/password', userAuth, async (req, res) => {
    try {
        const { newPassword } = req.body;

        // 1. Check for missing input or insufficient length
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Please enter a new password that is at least 6 characters long."
            });
        }

        // 2. Check password complexity (assuming isValidator checks for numbers/symbols/cases)
        if (!isValidator.isStrongPassword(newPassword)) {
            return res.status(400).json({
                success: false,
                message: "For your security, please choose a stronger password containing a mix of letters, numbers, and special characters."
            });
        }

        // 3. Find the user
        const employee = await User.findById(req.user._id);
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "We couldn't locate your account details. Please try logging out and back in."
            });
        }

        // 4. Hash the new password and save
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        employee.password = hashedPassword;
        await employee.save();

        res.status(200).json({
            success: true,
            message: "Success! Your password has been safely updated."
        });

    } catch (error) {
        console.error("Password Update Error:", error);

        // 5. Handle unexpected server errors gracefully
        res.status(500).json({
            success: false,
            message: "Oops! Something went wrong on our end while updating your password. Please try again in a moment."
        });
    }
});

// ==========================================
// 15. UPDATE ACCOUNT SETTINGS (PREFERENCES)
// ==========================================
employeeRouter.put('/settings/preferences', userAuth, async (req, res) => {
    try {
        const { systemLanguage, employeeNotifications } = req.body;

        // Use $set to target specific nested fields without erasing others
        const updateData = {};
        if (systemLanguage !== undefined) updateData['preferences.systemLanguage'] = systemLanguage;
        if (employeeNotifications !== undefined) updateData['preferences.employeeNotifications'] = employeeNotifications;

        const user = await User.findByIdAndUpdate(
            req.user._id,
            { $set: updateData },
            { returnDocument: 'after', runValidators: true }
        );

        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        res.status(200).json({
            success: true,
            message: "Preferences updated successfully.",
            preferences: user.preferences
        });
    } catch (error) {
        console.error("Update Preferences Error:", error);
        res.status(500).json({ success: false, message: "Server error updating preferences." });
    }
});

// ==========================================
// 16. GET PENDING & RECENT TASKS
// ==========================================
employeeRouter.get('/tasks', userAuth, async (req, res) => {
    try {
        // Fetch tasks assigned to this specific employee
        const tasks = await Task.find({ teacher: req.user._id })
            .populate('school', 'schoolName address location')
            .sort({ createdAt: -1 }); // Newest first

        // Format the response to match what the React component expects
        const formattedTasks = tasks.map(task => ({
            id: task._id,
            schoolName: task.school ? task.school.schoolName : "Unknown School",
            location: task.school ? task.school.address : "Unknown Location",
            daysAllotted: task.daysAllotted,
            duration: task.duration,
            timing: task.timing,
            category: task.category || "General",
            taskDescription: task.taskDescription,
            status: task.status.toLowerCase(), // Ensure 'pending', 'accepted', 'rejected'
            rejectReason: task.rejectReason
        }));

        res.status(200).json({ success: true, data: formattedTasks });
    } catch (error) {
        console.error("Fetch Tasks Error:", error);
        res.status(500).json({ success: false, message: "Server error fetching tasks." });
    }
});

// ==========================================
// 17. LEAVE REQUEST STATUS
// ==========================================
employeeRouter.get('/leave-request/status', userAuth, async (req, res) => {
    try {
        const latestRequest = await LeaveRequest.findOne({ employee: req.user._id })
            .sort({ createdAt: -1 });

        if (!latestRequest) {
            return res.status(200).json({ success: true, data: null });
        }

        const formattedData = {
            id: latestRequest._id,
            status: latestRequest.status,
            fromDate: new Date(latestRequest.fromDate).toISOString().split('T')[0],
            toDate: new Date(latestRequest.toDate).toISOString().split('T')[0],
            reason: latestRequest.reason,
            adminRemarks: latestRequest.adminRemarks
        };

        res.status(200).json({ success: true, data: formattedData });
    } catch (error) {
        console.error("Get Leave Request Status Error:", error);
        res.status(500).json({ success: false, message: "Server error fetching leave status." });
    }
});

// ==========================================
// 18. SUBMIT LEAVE REQUEST
// ==========================================
employeeRouter.post('/leave-request', userAuth, async (req, res) => {
    try {
        const { fromDate, toDate, reason } = req.body;

        if (!fromDate || !toDate || !reason) {
            return res.status(400).json({ success: false, message: "All fields are required." });
        }

        const existingPending = await LeaveRequest.findOne({
            employee: req.user._id,
            status: 'pending'
        });

        if (existingPending) {
            return res.status(400).json({ success: false, message: "You already have a pending leave request." });
        }

        const newLeaveRequest = new LeaveRequest({
            employee: req.user._id,
            fromDate,
            toDate,
            reason
        });

        await newLeaveRequest.save();

        const formattedFromDate = new Date(fromDate).toDateString();
        const formattedToDate = new Date(toDate).toDateString();

        // 1. Send In-App Notifications (Real-time to Admins ONLY via your helper)
        const title = 'New Leave Request';
        const message = `${req.user.name} has requested leave from ${formattedFromDate} to ${formattedToDate}.`;

        // This returns the array of admins so we can use it for emails
        const admins = await notifyAdminsInApp(req, title, message, 'Leave');

        // 2. Send Emails to the returned Admins sequentially
        for (const admin of admins) {
            if (await canSendEmailToUser(admin)) {
                await sendLeaveRequestEmailToAdmin(
                    admin.email,
                    admin.name,
                    req.user.name,
                    formattedFromDate,
                    formattedToDate,
                    reason
                );
            }
        }

        const responseData = {
            id: newLeaveRequest._id,
            status: newLeaveRequest.status,
            fromDate: fromDate,
            toDate: toDate,
            reason: newLeaveRequest.reason
        };

        res.status(201).json({ success: true, message: "Leave request submitted successfully.", data: responseData });
    } catch (error) {
        console.error("Submit Leave Request Error:", error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }
        res.status(500).json({ success: false, message: "Server error submitting leave request." });
    }
});

// ==========================================
// 19. REVOKE LEAVE REQUEST
// ==========================================
employeeRouter.delete('/leave-request/:id', userAuth, async (req, res) => {
    try {
        const leaveRequestId = req.params.id;
        const leaveRequest = await LeaveRequest.findById(leaveRequestId);

        if (!leaveRequest) {
            return res.status(404).json({ success: false, message: "Leave request not found." });
        }

        if (leaveRequest.employee.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized to revoke this request." });
        }

        if (leaveRequest.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Cannot revoke a request that is already ${leaveRequest.status}.`
            });
        }

        await LeaveRequest.findByIdAndDelete(leaveRequestId);

        const formattedFromDate = new Date(leaveRequest.fromDate).toDateString();
        const formattedToDate = new Date(leaveRequest.toDate).toDateString();

        // 1. Send In-App Notifications (Real-time to Admins ONLY via your helper)
        const title = 'Leave Request Cancelled';
        const message = `${req.user.name} has cancelled their leave request (${formattedFromDate} to ${formattedToDate}).`;

        // You can use 'Deletion' or 'Leave' depending on what icon you want to show
        const admins = await notifyAdminsInApp(req, title, message, 'Deletion');

        // 2. Send Emails to the returned Admins sequentially
        for (const admin of admins) {
            if (await canSendEmailToUser(admin)) {
                await sendLeaveRevokedEmailToAdmin(
                    admin.email,
                    admin.name,
                    req.user.name,
                    formattedFromDate,
                    formattedToDate
                );
            }
        }

        res.status(200).json({ success: true, message: "Leave request revoked successfully." });
    } catch (error) {
        console.error("Revoke Leave Request Error:", error);
        res.status(500).json({ success: false, message: "Server error revoking leave request." });
    }
});

// ==========================================
// 20. GENERATE PRE-SIGNED URLS
// ==========================================
employeeRouter.post("/media/generate-urls", userAuth, async (req, res) => {
    try {
        if (!process.env.R2_PUBLIC_URL) {
            return res.status(500).json({ error: "Server misconfiguration: R2_PUBLIC_URL is missing." });
        }

        const { files, metadata } = req.body;

        if (!files || !Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ success: false, message: "No files provided." });
        }

        // 1. Create safe strings for the filename (replace spaces with dashes)
        const safeSchool = (metadata?.schoolName || "Unknown-School").replace(/[^a-zA-Z0-9]/g, '-');
        const safeBand = (metadata?.band || "Band").replace(/[^a-zA-Z0-9]/g, '-');
        const dateStr = metadata?.eventDate || new Date().toISOString().split('T')[0];

        const uploadUrls = await Promise.all(files.map(async (file) => {
            // 2. Get the original extension (e.g., .mp4)
            const ext = path.extname(file.name) || '.mp4';

            // 3. Add a tiny random string at the end so if they upload 2 videos for the same event, they don't overwrite each other
            const uniqueId = crypto.randomBytes(3).toString('hex');

            // 4. Assemble the ultimate smart filename!
            // Result: Lincoln-High-School-Junior-Band-2026-03-27-a1b2c3.mp4
            const smartFileName = `${safeSchool}-${safeBand}-${dateStr}-${uniqueId}${ext}`;

            // 5. Define the folder structure in Cloudflare
            const fileKey = `media/${req.user._id}/${smartFileName}`;

            const command = new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: fileKey,
                ContentType: file.type,
            });

            const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
            const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;

            return {
                originalName: file.name,
                smartFileName: smartFileName, // Return this so the frontend knows what it's called now
                uploadUrl: signedUrl,
                publicUrl: publicUrl
            };
        }));

        res.status(200).json({ success: true, urls: uploadUrls });

    } catch (error) {
        console.error("Generate URLs Error:", error);
        res.status(500).json({ success: false, message: "Failed to generate upload URLs." });
    }
});

// ==========================================
// 21. SAVE MEDIA LOG TO MONGODB
// ==========================================
employeeRouter.post("/media/save-log", userAuth, async (req, res) => {
    try {
        const { schoolId, band, eventName, eventDate, studentsCount, description, uploadedFiles } = req.body;

        const mediaType = eventName ? 'Special Event' : 'Regular Visit';
        const finalEventDate = eventDate ? new Date(eventDate) : new Date();

        // 1. Save to MongoDB
        const newLog = new MediaLog({
            teacher: req.user._id,
            school: schoolId,
            band: band,
            mediaType: mediaType,
            eventContext: eventName || null,
            description: description || null,
            eventDate: finalEventDate,
            studentRecord: studentsCount ? Number(studentsCount) : null,
            files: uploadedFiles
        });

        await newLog.save();
        await newLog.populate('school', 'schoolName');

        // 🔥 FIX 1: INSTANT RESPONSE
        // Send success back to React before touching the email servers
        res.status(201).json({ success: true, data: newLog });

        // 🔥 FIX 2: BACKGROUND TASKS
        (async () => {
            try {
                // In-App Notification
                const title = 'New Vault Media Upload';
                const message = `${req.user.name} has uploaded ${uploadedFiles.length} new video(s) for ${newLog.school.schoolName} (${band}).`;

                const admins = await notifyAdminsInApp(req, title, message, 'Media');

                // Send Emails concurrently with a timeout failsafe
                const emailPromises = admins.map(async (admin) => {
                    if (await canSendEmailToUser(admin)) {
                        const emailTask = sendNewMediaEmailToAdmin(
                            admin.email, admin.name, req.user.name,
                            newLog.school.schoolName, band, uploadedFiles.length
                        );

                        // Failsafe: If Render's SMTP connection hangs, abort after 10s
                        const timeoutTask = new Promise((_, reject) =>
                            setTimeout(() => reject(new Error(`SMTP Timeout for ${admin.email}`)), 10000)
                        );

                        return Promise.race([emailTask, timeoutTask]);
                    }
                });

                // Promise.allSettled ensures that if one email fails, the others still send
                await Promise.allSettled(emailPromises);

            } catch (bgError) {
                console.error("Background Notification Error:", bgError);
            }
        })();

    } catch (error) {
        console.error("DB Save Error:", error);
        // Only trigger this if headers haven't already been sent
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: "Failed to save media record" });
        }
    }
});

// ==========================================
// 22. SEND MEDIA UPLOAD FAILURE EMAIL
// ==========================================
employeeRouter.post('/media/send-failure-email', userAuth, async (req, res) => {
    try {
        const { failedFiles, eventContext, schoolId } = req.body;

        if (!failedFiles || !Array.isArray(failedFiles) || failedFiles.length === 0) {
            return res.status(400).json({ success: false, message: "Failed files list is required." });
        }

        // Fetch the school name so the email template looks correct
        let schoolNameStr = "Assigned School";
        if (schoolId) {
            const school = await School.findById(schoolId).select('schoolName');
            if (school) schoolNameStr = school.schoolName;
        }

        const finalEventContext = eventContext || "Regular Visit";

        // 1. Send In-App Notification directly to the Employee
        // (If you have a helper like `notifyEmployeeInApp`, use that here instead)
        const title = 'Action Required: Media Upload Incomplete';
        const message = `A network interruption occurred. ${failedFiles.length} file(s) for ${schoolNameStr} failed to upload. Please re-upload them.`;

        const newNotification = new Notification({
            recipient: req.user._id, // Targeting the employee who failed the upload
            title: title,
            message: message,
            type: 'Media', // Or whatever enum categories you use
            isRead: false
        });

        await newNotification.save();

        // 2. Send Email to the Employee (using your app's standard check)
        if (await canSendEmailToUser(req.user)) {
            await sendMediaUploadFailureEmailToEmployee(
                req.user.email,
                req.user.name,
                schoolNameStr,
                finalEventContext,
                failedFiles
            );
        }

        res.status(200).json({
            success: true,
            message: "Failure notifications processed successfully."
        });

    } catch (error) {
        console.error("Submit Media Failure Alert Error:", error);
        res.status(500).json({ success: false, message: "Server error processing failure alert." });
    }
});

// ==========================================
// 23. GET MEDIA GALLERY
// ==========================================
employeeRouter.get("/media", userAuth, async (req, res) => {
    try {
        // Default to current year if none provided
        const year = parseInt(req.query.year) || new Date().getFullYear();

        // Set date boundaries for the query
        const startDate = new Date(year, 0, 1); // Jan 1st of requested year
        const endDate = new Date(year + 1, 0, 1); // Jan 1st of next year

        const mediaLogs = await MediaLog.find({
            teacher: req.user._id,
            eventDate: { $gte: startDate, $lt: endDate }
        })
            .populate('school', 'schoolName') // Fetch the actual school name
            .sort({ eventDate: -1 }); // Newest first

        res.status(200).json({ success: true, data: mediaLogs });

    } catch (error) {
        console.error("Fetch Media Logs Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch media gallery." });
    }
});

// ==========================================
// 24. GENERATE DOWNLOAD URL
// ==========================================
employeeRouter.post("/media/generate-download-url", userAuth, async (req, res) => {
    try {
        const { fileUrl, fileName } = req.body;

        if (!fileUrl) {
            return res.status(400).json({ success: false, message: "File URL is required" });
        }

        // 1. Extract the exact file key from the public URL
        // Example: https://pub-xxx.r2.dev/media/123/video.mp4 -> media/123/video.mp4
        const urlObject = new URL(fileUrl);
        const fileKey = urlObject.pathname.substring(1); // Removes the leading '/'

        // 2. Ask Cloudflare for a URL that FORCES a download (attachment)
        const command = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: fileKey,
            ResponseContentDisposition: `attachment; filename="${fileName}"` // <--- THIS is the magic line
        });

        // 3. Generate a quick expiring link (valid for 5 minutes)
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

        res.status(200).json({ success: true, downloadUrl: signedUrl });

    } catch (error) {
        console.error("Generate Download URL Error:", error);
        res.status(500).json({ success: false, message: "Failed to generate download link" });
    }
});

// ==========================================
// 25. DELETE SPECIFIC VIDEO FILE
// ==========================================
employeeRouter.delete("/media/file/:fileId", userAuth, async (req, res) => {
    try {
        const { fileId } = req.params;

        // 1. Find the MediaLog and POPULATE school so we can use its name in the notification
        const mediaLog = await MediaLog.findOne({
            teacher: req.user._id,
            "files._id": fileId
        }).populate('school', 'schoolName');

        if (!mediaLog) {
            return res.status(404).json({ success: false, message: "Media not found or unauthorized." });
        }

        // 2. Extract the specific file from the array
        const file = mediaLog.files.id(fileId);

        // 3. SECURITY CHECK: Has the admin graded it?
        if (file.marks !== null || file.remark) {
            return res.status(403).json({
                success: false,
                message: "Cannot delete a video that has already been reviewed by an Admin."
            });
        }

        // 4. Delete the physical file from Cloudflare R2 to save storage space
        try {
            const urlObj = new URL(file.url);
            const fileKey = urlObj.pathname.substring(1); // Removes the leading '/'

            await s3Client.send(new DeleteObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: fileKey
            }));
        } catch (r2Error) {
            console.error("Failed to delete from R2, but continuing DB cleanup:", r2Error);
        }

        // 5. Remove the file from the MongoDB array
        mediaLog.files.pull(fileId);

        // 6. If that was the only video in the event, delete the whole event log
        if (mediaLog.files.length === 0) {
            await mediaLog.deleteOne();
        } else {
            await mediaLog.save();
        }

        // 🔥 7. NEW: TRIGGER REAL-TIME REFRESH & ADMIN NOTIFICATIONS
        if (req.io) {
            const schoolName = mediaLog.school?.schoolName || "Assigned School";
            const title = "Vault Media Deleted";
            const message = `${req.user.name} deleted a video from ${schoolName} (${mediaLog.band}).`;

            // Get all admins
            const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] } });

            await Promise.all(admins.map(async (admin) => {
                // Create the notification in the DB (shows up in their Bell/Alerts tab)
                const adminNotif = await Notification.create({
                    recipient: admin._id,
                    title: title,
                    message: message,
                    type: "Media" // <--- THIS is the magic word that triggers your gallery's silent refresh!
                });

                // Emit directly to the admin's private room
                req.io.to(admin._id.toString()).emit('new_notification', adminNotif);
            }));
        }

        res.status(200).json({ success: true, message: "Video deleted successfully." });

    } catch (error) {
        console.error("Delete Media Error:", error);
        res.status(500).json({ success: false, message: "Failed to delete media." });
    }
});

// ==========================================
// 26. INITIATE MULTIPART UPLOAD
// ==========================================
employeeRouter.post('/media/multipart/create', userAuth, async (req, res) => {
    try {
        const { filename, type, metadata } = req.body;

        if (!filename) throw new Error("Filename is missing from frontend payload");

        // SMART NAMING LOGIC
        const safeSchool = (metadata?.schoolName || "Unknown-School").replace(/[^a-zA-Z0-9]/g, '-');
        const safeBand = (metadata?.band || "Band").replace(/[^a-zA-Z0-9]/g, '-');
        const dateStr = metadata?.eventDate || new Date().toISOString().split('T')[0];

        const fileExtension = path.extname(filename) || '.mp4';
        const uniqueString = crypto.randomBytes(3).toString('hex');

        // Final Path: media/user123/Lincoln-High-Senior-Band-2026-03-27-a1b2c3.mp4
        const smartFileName = `${safeSchool}-${safeBand}-${dateStr}-${uniqueString}${fileExtension}`;
        const key = `media/${req.user._id}/${smartFileName}`;

        const command = new CreateMultipartUploadCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: key,
            ContentType: type
        });

        const upload = await s3Client.send(command);
        res.status(200).json({ uploadId: upload.UploadId, key: key });

    } catch (error) {
        console.error("🔥 CRASH IN /multipart/create:", error);
        res.status(500).json({ error: "Failed to initiate upload. Check backend console." });
    }
});

// ==========================================
// 27. SIGN INDIVIDUAL CHUNKS
// ==========================================
employeeRouter.post('/media/multipart/sign', userAuth, async (req, res) => {
    try {
        const { uploadId, key, partNumber } = req.body;

        const command = new UploadPartCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
        });

        const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        res.status(200).json({ url });

    } catch (error) {
        console.error("🔥 CRASH IN /multipart/sign:", error);
        res.status(500).json({ error: "Failed to sign part" });
    }
});

// ==========================================
// 28. COMPLETE AND STITCH VIDEO
// ==========================================
employeeRouter.post('/media/multipart/complete', userAuth, async (req, res) => {
    try {
        const { uploadId, key, parts } = req.body;

        // Cloudflare R2 strictly requires parts to be sorted numerically
        const sortedParts = parts.sort((a, b) => a.PartNumber - b.PartNumber);

        const command = new CompleteMultipartUploadCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: key,
            UploadId: uploadId,
            MultipartUpload: { Parts: sortedParts }
        });

        await s3Client.send(command);

        // Assuming your .env variable is R2_PUBLIC_URL (based on your older code)
        const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
        res.status(200).json({ location: publicUrl });

    } catch (error) {
        console.error("🔥 CRASH IN /multipart/complete:", error);
        res.status(500).json({ error: "Failed to complete upload" });
    }
});

// ==========================================
// 29. ABORT ON CANCELLATION
// ==========================================
employeeRouter.post('/media/multipart/abort', userAuth, async (req, res) => {
    try {
        const { uploadId, key } = req.body;

        const command = new AbortMultipartUploadCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: key,
            UploadId: uploadId
        });

        await s3Client.send(command);
        res.status(200).json({ success: true });

    } catch (error) {
        console.error("🔥 CRASH IN /multipart/abort:", error);
        res.status(500).json({ error: "Failed to abort" });
    }
});

// ==========================================
// 30. EMPLOYEES LEADERBOARD
// ==========================================
employeeRouter.get('/leaderboard', userAuth, async (req, res) => {
    try {
        // Fetch only the fields we need to keep the payload tiny and fast
        const leaderboard = await User.find({ role: 'Employee', isActive: true })
            .select('name zone currentWeeklyScore currentWeeklyRank scoreTrend colorZone')
            .sort({ currentWeeklyRank: 1 }); // Sort 1st, 2nd, 3rd...

        res.status(200).json({
            success: true,
            data: leaderboard
        });
    } catch (error) {
        console.error("Leaderboard Fetch Error:", error);
        res.status(500).json({ success: false, message: "Error fetching leaderboard data" });
    }
});

// ============================================================================
// 31. MY PERSONAL GRAPH DATA
// ============================================================================
employeeRouter.get('/my-graph', userAuth, async (req, res) => {
    try {
        const employeeId = req.user._id; // Gets the ID from your userAuth middleware
        const { period, date } = req.query;

        let graphData = [];

        if (period === 'weekly') {
            // 'date' comes in as 'YYYY-MM' (e.g., '2026-03')
            const [year, month] = date.split('-');

            // Define the start and end of that specific month
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59);

            // Fetch all weekly records for this employee within this month
            const records = await WeeklyProgress.find({
                teacher: employeeId,
                weekStartDate: { $gte: startDate, $lte: endDate }
            }).sort({ weekStartDate: 1 });

            // Format for the frontend chart
            graphData = records.map(record => {
                const startStr = new Date(record.weekStartDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
                const endStr = new Date(record.weekEndDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

                return {
                    label: `${startStr} - ${endStr}`,
                    score: record.score
                };
            });

        } else if (period === 'monthly') {
            // 'date' comes in as 'YYYY' (e.g., '2026')
            const year = parseInt(date);
            const startDate = new Date(year, 0, 1);
            const endDate = new Date(year, 11, 31, 23, 59, 59);

            // Fetch ALL records for the whole year
            const records = await WeeklyProgress.find({
                teacher: employeeId,
                weekStartDate: { $gte: startDate, $lte: endDate }
            }).sort({ weekStartDate: 1 });

            // Group them by month to calculate the average score per month
            const monthlyData = {};
            records.forEach(record => {
                const monthName = new Date(record.weekStartDate).toLocaleString('en-US', { month: 'short' }); // "Jan", "Feb"

                if (!monthlyData[monthName]) {
                    monthlyData[monthName] = { totalScore: 0, count: 0 };
                }
                monthlyData[monthName].totalScore += record.score;
                monthlyData[monthName].count += 1;
            });

            // Format into an array in correct month order
            const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

            monthOrder.forEach(month => {
                if (monthlyData[month]) {
                    graphData.push({
                        label: month,
                        score: Math.round(monthlyData[month].totalScore / monthlyData[month].count)
                    });
                }
            });
        }

        res.json({ success: true, data: graphData });

    } catch (error) {
        console.error("Employee Graph Error:", error);
        res.status(500).json({ success: false, message: "Error fetching graph data" });
    }
});

module.exports = employeeRouter;