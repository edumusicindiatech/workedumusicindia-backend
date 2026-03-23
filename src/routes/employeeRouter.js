const express = require('express');
const userAuth = require('../middleware/userAuth');
const School = require('../models/School');
const getCityFromCoordinates = require('../utils/getCityFromCoords');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Task = require('../models/Task');
const Notification = require('../models/Notification');

// Import all specific email templates
const {
    sendAdminTaskResponseEmail,
    sendAdminCheckInAlert,
    sendAdminCheckOutAlert,
    sendAdminStatusAlert
} = require('../utils/emailService');
const Media = require('../models/Media');
const DailyReports = require('../models/DailyReports');

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
            if (!assignment.allowedDays.includes(todayDayOfWeek)) return;

            const log = todaysLogs.find(l =>
                l.school.toString() === assignment.school._id.toString() && l.band === assignment.category
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

        if (!school) return res.status(403).json({ success: false, message: "Check-in failed. You are not within 100 meters of the school." });

        let status = 'Present';
        if (lateReason) status = 'Late';
        if (eventNote) status = 'Event';

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
            if (admin.preferences?.adminNotifications !== false) {
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

        if (!school) return res.status(403).json({ success: false, message: "You must be within 100 meters to check out." });

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
            if (admin.preferences?.adminNotifications !== false) {
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
employeeRouter.post('/mark-status', userAuth, async (req, res) => {
    try {
        const { schoolId, band, status, reason } = req.body;
        const employee = await User.findById(req.user._id);
        const school = await School.findById(schoolId);

        await Attendance.create({
            teacher: employee._id, school: schoolId, band,
            date: new Date().toISOString().split('T')[0],
            status: status, teacherNote: reason || "Marked from Dashboard"
        });

        // Notify Admins
        const admins = await notifyAdminsInApp(req, `${status} Alert: ${employee.name}`, `${employee.name} marked ${status} for ${school.schoolName}`, "Warning");

        for (const admin of admins) {
            if (admin.preferences?.adminNotifications !== false) {
                await sendAdminStatusAlert(admin.email, admin.name, employee.name, school.schoolName, band, status, reason);
            }
        }

        res.status(200).json({ success: true, message: `Marked as ${status}.` });
    } catch (error) {
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
        const employee = await User.findById(employeeId).populate('assignments.school');

        const now = new Date();
        const todayString = now.toISOString().split('T')[0];
        const todayDayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];

        const todaysAssignments = employee.assignments.filter(a => a.allowedDays.includes(todayDayOfWeek));
        const existingRecords = await Attendance.find({ teacher: employeeId, date: todayString });
        const existingKeys = existingRecords.map(r => `${r.school.toString()}-${r.band}`);

        const recordsToCreate = [];
        let schoolsList = [];

        todaysAssignments.forEach(a => {
            if (!existingKeys.includes(`${a.school._id}-${a.category}`)) {
                recordsToCreate.push({
                    teacher: employeeId, school: a.school._id, band: a.category,
                    date: todayString, status, teacherNote: reason || "Global Day Status"
                });
                schoolsList.push(`${a.school.schoolName} (${a.category})`);
            }
        });

        if (recordsToCreate.length > 0) {
            await Attendance.insertMany(recordsToCreate);

            // Notify Admins
            const admins = await notifyAdminsInApp(req, `Global ${status}: ${employee.name}`, `${employee.name} declared full day ${status}`, "Warning");
            for (const admin of admins) {
                if (admin.preferences?.adminNotifications !== false) {
                    await sendAdminStatusAlert(admin.email, admin.name, employee.name, "All Remaining Schools", "N/A", status, reason);
                }
            }
        }

        res.status(200).json({ success: true, message: `All remaining shifts marked as ${status}.` });
    } catch (error) {
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
            if (admin.preferences?.adminNotifications !== false) {
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
            const catAttendances = attendances.filter(a => a.school.toString() === schoolId && a.band === assignment.category);

            let stats = { present: 0, late: 0, absent: 0, events: 0 };
            let history = catAttendances.map(a => {
                let statusUpper = (a.status || 'Unknown').toUpperCase();
                if (statusUpper === 'PRESENT') stats.present++;
                if (statusUpper === 'LATE') stats.late++;
                if (statusUpper === 'ABSENT') stats.absent++;
                if (statusUpper === 'EVENT') stats.events++;

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
        const { schoolId, band, fromDate, toDate, startTime, endTime, description } = req.body;

        const newEvent = await Event.create({
            teacher: req.user._id,
            school: schoolId,
            band, fromDate, toDate, startTime, endTime, description,
            status: 'Upcoming'
        });

        // Optionally notify Admins here using notifyAdminsInApp()

        res.status(200).json({ success: true, message: "Event logged successfully", data: newEvent });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error creating event." });
    }
});

// ==========================================
// 11. POST MEDIA UPLOAD LOG
// ==========================================
employeeRouter.post('/media', userAuth, async (req, res) => {
    try {
        const { schoolId, band, mediaType, eventDate, eventContext, files } = req.body;

        const newMediaLog = await Media.create({
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
        const { date, category, summary, eventName, eventDate, actionItems } = req.body;
        const employeeId = req.user._id;

        // Upsert: Create a new report, or update if one already exists for today
        const report = await DailyReports.findOneAndUpdate(
            { teacher: employeeId, date: date },
            {
                $set: {
                    category,
                    summary,
                    eventName,
                    eventDate,
                    actionItems
                }
            },
            { new: true, upsert: true }
        );

        res.status(200).json({ success: true, message: "Daily report saved.", data: report });
    } catch (error) {
        console.error("Daily Report Error:", error);
        res.status(500).json({ success: false, message: "Server error saving report." });
    }
});

// ==========================================
// 14. UPDATE EMPLOYEE PASSWORD
// ==========================================
employeeRouter.put('/profile/password', userAuth, async (req, res) => {
    try {
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
        }

        const employee = await User.findById(req.user._id);
        if (!employee) return res.status(404).json({ success: false, message: "User not found." });

        // Hash the new password and save
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        employee.password = hashedPassword;
        await employee.save();

        res.status(200).json({ success: true, message: "Password updated successfully." });
    } catch (error) {
        console.error("Password Update Error:", error);
        res.status(500).json({ success: false, message: "Server error updating password." });
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
            { new: true, runValidators: true }
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

module.exports = employeeRouter;