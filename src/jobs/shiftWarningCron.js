// services/shiftWarningCron.js
const cron = require('node-cron');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const LeaveRequest = require('../models/LeaveRequest'); // <-- ADDED
const { sendPreShiftWarningEmail } = require('../utils/emailService');
const { canSendEmailToUser } = require('../utils/canSendEmailToUser'); // <-- ADDED for consistency

// Helper to reliably get local time formatted as "08:00 AM" and "YYYY-MM-DD"
const getTimeAndDateContext = (minutesToAdd = 0) => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + minutesToAdd);

    // Get Date: YYYY-MM-DD 
    const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    const dateString = dateFormatter.format(d);

    // Get Day Name: "Mon", "Tue"
    const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' });
    const currentDayName = dayFormatter.format(d);

    // Get Time: "HH:MM" in 24-hour format to match your database!
    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false // Forces 24-hour format
    });
    const targetTimeStr = timeFormatter.format(d); // Outputs "08:00", "14:30", etc.

    // Return the actual Date object too so we can use it for Leave/Start/End checks
    return { dateString, currentDayName, targetTimeStr, targetDateObj: d };
};

const startShiftWarningCron = (io) => {
    // Runs at minute 0 past every hour, and every minute thereafter (* * * * *)
    cron.schedule('* * * * *', async () => {
        try {
            // 1. Look exactly 15 minutes into the future
            const { dateString, currentDayName, targetTimeStr, targetDateObj } = getTimeAndDateContext(15);

            // --- SYNCED LEAVE CHECKER ---
            const todayStart = new Date(targetDateObj);
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date(targetDateObj);
            todayEnd.setHours(23, 59, 59, 999);

            const activeLeaves = await LeaveRequest.find({
                status: 'approved',
                fromDate: { $lte: todayEnd },
                toDate: { $gte: todayStart }
            });
            const usersOnLeaveSet = new Set(activeLeaves.map(leave => leave.employee.toString()));
            // ----------------------------

            // 2. High-Performance Query: Find ONLY users who have a shift starting at exactly this time today
            const employeesStartingSoon = await User.find({
                role: 'Employee',
                isActive: true,
                assignments: {
                    $elemMatch: {
                        allowedDays: currentDayName,
                        startTime: targetTimeStr
                    }
                }
            }).populate('assignments.school');

            if (employeesStartingSoon.length === 0) return; // No shifts starting in 15 mins

            // 3. Check each matching employee
            for (const employee of employeesStartingSoon) {

                // --- EXCLUDE IF ON LEAVE ---
                if (usersOnLeaveSet.has(employee._id.toString())) continue;

                // Filter down to just the specific assignments starting at targetTimeStr
                // AND ensure the Start/End dates are valid
                const upcomingAssignments = employee.assignments.filter(a => {
                    // Check Time and Day first (Fastest checks)
                    if (!a.allowedDays.includes(currentDayName) || a.startTime !== targetTimeStr) return false;

                    // --- SYNCED DATE ISOLATION LOGIC ---
                    const assignmentStartDate = a.startDate ? new Date(a.startDate) : a._id.getTimestamp();
                    const normalizedStartDate = new Date(assignmentStartDate);
                    normalizedStartDate.setHours(0, 0, 0, 0);

                    const isAfterStartDate = todayStart >= normalizedStartDate;

                    let isBeforeEndDate = true;
                    if (a.endDate) {
                        const normalizedEndDate = new Date(a.endDate);
                        normalizedEndDate.setHours(23, 59, 59, 999);
                        isBeforeEndDate = todayStart <= normalizedEndDate;
                    }

                    // Only keep this assignment if it hasn't expired and isn't in the future
                    return isAfterStartDate && isBeforeEndDate;
                });

                for (const assignment of upcomingAssignments) {
                    const schoolId = assignment.school._id.toString();
                    const category = assignment.category;

                    // 4. Check if they have already recorded attendance for this specific shift today
                    const hasCheckedIn = await Attendance.findOne({
                        teacher: employee._id,
                        school: schoolId,
                        band: category,
                        date: dateString // e.g., "2026-03-22"
                    });

                    // 5. Trigger Warnings if NO check-in exists
                    if (!hasCheckedIn) {
                        const schoolName = assignment.school.schoolName;
                        const msg = `Reminder: Your ${category} shift at ${schoolName} starts in 15 minutes (${targetTimeStr}). Please check in soon.`;

                        // A. Save In-App Notification
                        const notif = await Notification.create({
                            recipient: employee._id,
                            title: "Upcoming Shift Reminder",
                            message: msg,
                            type: "Warning"
                        });

                        // B. Emit Real-time Socket Alert
                        if (io) {
                            io.to(employee._id.toString()).emit('new_notification', {
                                _id: notif._id,
                                title: notif.title,
                                message: notif.message,
                                type: notif.type,
                                timestamp: new Date()
                            });
                        }

                        // C. Send Email (Now using your synced Global/User preferences helper!)
                        if (await canSendEmailToUser(employee)) {
                            await sendPreShiftWarningEmail(
                                employee.email,
                                employee.name,
                                schoolName,
                                category,
                                targetTimeStr
                            );
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Cron Job Error [Shift Warnings]:", error);
        }
    });

    console.log("⏰ Pre-Shift Warning Cron Job initialized.");
};

module.exports = startShiftWarningCron;