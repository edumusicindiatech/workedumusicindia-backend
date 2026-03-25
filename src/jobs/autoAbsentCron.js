const cron = require('node-cron');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const {
    sendEmployeeAutoAbsentWarning,
    sendEmployeeAutoAbsentAlert,
    sendAdminAutoAbsentAlert
} = require('../utils/emailService');

const getTimeAndDateContext = (minutesToSubtract = 0) => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - minutesToSubtract);

    const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    const dateString = dateFormatter.format(d);

    const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' });
    const currentDayName = dayFormatter.format(d);

    // Currently outputting 24-hour format (e.g. "14:30")
    // If your DB uses 12-hour format (e.g., "02:30 PM"), we need to change this!
    const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
    const targetTimeStr = timeFormatter.format(d);

    return { dateString, currentDayName, targetTimeStr };
};

const sendInAppNotification = async (io, userId, title, message, type) => {
    const notif = await Notification.create({ recipient: userId, title, message, type });
    if (io) {
        io.to(userId.toString()).emit('new_notification', {
            _id: notif._id, title: notif.title, message: notif.message, type: notif.type, timestamp: new Date()
        });
    }
};

const startAutoAbsentCron = (io) => {
    cron.schedule('* * * * *', async () => {
        try {
            const warningContext = getTimeAndDateContext(105);
            const absentContext = getTimeAndDateContext(120);

            // --- DEBUG LOGS: SEE WHAT THE SERVER IS ACTUALLY SEARCHING FOR ---
            console.log(`[Cron tick] Checking auto-absent...`);
            console.log(` -> 15-Min Warning searching for: Day: ${warningContext.currentDayName}, Time: ${warningContext.targetTimeStr}`);
            console.log(` -> Auto-Absent execution searching for: Day: ${absentContext.currentDayName}, Time: ${absentContext.targetTimeStr}`);

            // Removed 'isActive: true' just in case that was blocking it
            const warningEmployees = await User.find({
                role: 'Employee',
                assignments: { $elemMatch: { allowedDays: warningContext.currentDayName, startTime: warningContext.targetTimeStr } }
            }).populate('assignments.school');

            if (warningEmployees.length > 0) {
                console.log(`[Trigger 1] Found ${warningEmployees.length} employee(s) for 15-min warning.`);
            }

            for (const employee of warningEmployees) {
                const pendingAssignments = employee.assignments.filter(a =>
                    a.allowedDays.includes(warningContext.currentDayName) && a.startTime === warningContext.targetTimeStr
                );

                for (const assignment of pendingAssignments) {
                    const hasCheckedIn = await Attendance.findOne({
                        teacher: employee._id, school: assignment.school._id, band: assignment.category, date: warningContext.dateString
                    });

                    if (!hasCheckedIn) {
                        console.log(` -> Sending warning to ${employee.name}`);
                        const msg = `CRITICAL: You are 1 hour and 45 mins late for ${assignment.school.schoolName}. You will be auto-marked absent in 15 mins.`;
                        await sendInAppNotification(io, employee._id, "Auto-Absent Warning", msg, "Warning");

                        if (employee.preferences?.employeeNotifications !== false) {
                            await sendEmployeeAutoAbsentWarning(employee.email, employee.name, assignment.school.schoolName, assignment.category, warningContext.targetTimeStr);
                        }
                    } else {
                        console.log(` -> ${employee.name} already checked in. Skipping warning.`);
                    }
                }
            }

            const absentEmployees = await User.find({
                role: 'Employee',
                assignments: { $elemMatch: { allowedDays: absentContext.currentDayName, startTime: absentContext.targetTimeStr } }
            }).populate('assignments.school');

            if (absentEmployees.length > 0) {
                console.log(`[Trigger 2] Found ${absentEmployees.length} employee(s) to automatically mark absent.`);
                const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] } });

                for (const employee of absentEmployees) {
                    const missedAssignments = employee.assignments.filter(a =>
                        a.allowedDays.includes(absentContext.currentDayName) && a.startTime === absentContext.targetTimeStr
                    );

                    for (const assignment of missedAssignments) {
                        const hasCheckedIn = await Attendance.findOne({
                            teacher: employee._id, school: assignment.school._id, band: assignment.category, date: absentContext.dateString
                        });

                        if (!hasCheckedIn) {
                            console.log(` -> Executing Auto-Absent for ${employee.name}`);

                            await Attendance.create({
                                teacher: employee._id,
                                school: assignment.school._id,
                                band: assignment.category,
                                date: absentContext.dateString,
                                status: 'Absent',
                                teacherNote: 'System Auto-Marked: No check-in recorded 2 hours after scheduled start time.'
                            });

                            if (io) {
                                io.to(employee._id.toString()).emit("employee_schedule_refresh", {
                                    type: "SCHEDULE_UPDATE",
                                    message: `You have been automatically marked absent for ${assignment.school.schoolName}.`
                                });
                            }

                            const empMsg = `You have been automatically marked absent for your shift at ${assignment.school.schoolName}.`;
                            await sendInAppNotification(io, employee._id, "Shift Marked Absent", empMsg, "Warning");

                            if (employee.preferences?.employeeNotifications !== false) {
                                await sendEmployeeAutoAbsentAlert(employee.email, employee.name, assignment.school.schoolName, assignment.category, absentContext.targetTimeStr);
                            }

                            const adminMsg = `System auto-marked ${employee.name} absent at ${assignment.school.schoolName} (No show after 2 hours).`;
                            for (const admin of admins) {
                                await sendInAppNotification(io, admin._id, "Auto-Absent Triggered", adminMsg, "System");

                                if (admin.preferences?.adminNotifications !== false) {
                                    await sendAdminAutoAbsentAlert(admin.email, admin.name, employee.name, assignment.school.schoolName, assignment.category, absentContext.targetTimeStr);
                                }
                            }
                        } else {
                            console.log(` -> ${employee.name} already checked in. Skipping auto-absent execution.`);
                        }
                    }
                }
            }

        } catch (error) {
            console.error("Cron Job Error [Auto-Absent]:", error);
        }
    });

    console.log("⏰ Auto-Absent Compliance Cron Job initialized with Debug Logs.");
};

module.exports = startAutoAbsentCron;