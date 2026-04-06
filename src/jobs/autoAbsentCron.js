const cron = require('node-cron');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const LeaveRequest = require('../models/LeaveRequest');
const { canSendEmailToUser } = require('../utils/canSendEmailToUser');
const {
    sendEmployeeAutoAbsentWarning,
    sendEmployeeAutoAbsentAlert,
    sendAdminAutoAbsentAlert
} = require('../utils/emailService');
const { getISTDateString } = require('../utils/timeHelper');

const getTimeAndDateContext = (minutesToSubtract = 0) => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - minutesToSubtract);

    const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    const dateString = dateFormatter.format(d);

    const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' });
    const currentDayName = dayFormatter.format(d);

    const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
    const targetTimeStr = timeFormatter.format(d);

    return { dateString, currentDayName, targetTimeStr, targetDateObj: d };
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

            console.log(`[Cron tick] Checking auto-absent...`);

            // --- SYNCED LEAVE CHECKER ---
            const currentISTDate = getTimeAndDateContext(0).dateString;
            const todayStart = new Date(`${currentISTDate}T00:00:00.000+05:30`);
            const todayEnd = new Date(`${currentISTDate}T23:59:59.999+05:30`);

            const activeLeaves = await LeaveRequest.find({
                status: 'approved',
                fromDate: { $lte: todayEnd },
                toDate: { $gte: todayStart }
            });
            const usersOnLeaveSet = new Set(activeLeaves.map(leave => leave.employee.toString()));

            // ==========================================
            // PHASE 1: 15-MINUTE WARNING
            // ==========================================
            const warningEmployees = await User.find({
                role: 'Employee',
                isActive: true,
                assignments: { $elemMatch: { allowedDays: warningContext.currentDayName, startTime: warningContext.targetTimeStr } }
            }).populate('assignments.school');

            for (const employee of warningEmployees) {
                if (usersOnLeaveSet.has(employee._id.toString())) continue;

                const pendingAssignments = employee.assignments.filter(a => {
                    if (!a.allowedDays.includes(warningContext.currentDayName) || a.startTime !== warningContext.targetTimeStr) return false;

                    const assignmentStartDate = a.startDate ? new Date(a.startDate) : a._id.getTimestamp();
                    const assignStartStr = getISTDateString(assignmentStartDate);

                    const isAfterStartDate = currentISTDate >= assignStartStr;
                    let isBeforeEndDate = true;
                    if (a.endDate) {
                        const assignEndStr = getISTDateString(new Date(a.endDate));
                        isBeforeEndDate = currentISTDate <= assignEndStr;
                    }

                    return isAfterStartDate && isBeforeEndDate;
                });

                for (const assignment of pendingAssignments) {
                    const hasCheckedIn = await Attendance.findOne({
                        teacher: employee._id, school: assignment.school._id, band: assignment.category, date: warningContext.dateString
                    });

                    if (!hasCheckedIn) {
                        const msg = `CRITICAL: You are 1 hour and 45 mins late for ${assignment.school.schoolName}. You will be auto-marked absent in 15 mins.`;
                        await sendInAppNotification(io, employee._id, "Auto-Absent Warning", msg, "Warning");

                        if (await canSendEmailToUser(employee)) {
                            await sendEmployeeAutoAbsentWarning(employee.email, employee.name, assignment.school.schoolName, assignment.category, warningContext.targetTimeStr);
                        }
                    }
                }
            }

            // ==========================================
            // PHASE 2: AUTO-ABSENT EXECUTION
            // ==========================================
            const absentEmployees = await User.find({
                role: 'Employee',
                isActive: true,
                assignments: { $elemMatch: { allowedDays: absentContext.currentDayName, startTime: absentContext.targetTimeStr } }
            }).populate('assignments.school');

            if (absentEmployees.length > 0) {
                const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] } });

                for (const employee of absentEmployees) {
                    if (usersOnLeaveSet.has(employee._id.toString())) continue;

                    const missedAssignments = employee.assignments.filter(a => {
                        if (!a.allowedDays.includes(absentContext.currentDayName) || a.startTime !== absentContext.targetTimeStr) return false;

                        // --- 🚨 FIXED: STRICT STRING MATH INSTEAD OF setHours(0) ---
                        const assignmentStartDate = a.startDate ? new Date(a.startDate) : a._id.getTimestamp();
                        const assignStartStr = getISTDateString(assignmentStartDate);

                        const isAfterStartDate = currentISTDate >= assignStartStr;
                        let isBeforeEndDate = true;
                        if (a.endDate) {
                            const assignEndStr = getISTDateString(new Date(a.endDate));
                            isBeforeEndDate = currentISTDate <= assignEndStr;
                        }

                        return isAfterStartDate && isBeforeEndDate;
                    });

                    for (const assignment of missedAssignments) {
                        const hasCheckedIn = await Attendance.findOne({
                            teacher: employee._id, school: assignment.school._id, band: assignment.category, date: absentContext.dateString
                        });

                        if (!hasCheckedIn) {
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
                                io.emit('operations_update', { type: 'refresh_feed' });
                            }

                            const empMsg = `You have been automatically marked absent for your shift at ${assignment.school.schoolName}.`;
                            await sendInAppNotification(io, employee._id, "Shift Marked Absent", empMsg, "Warning");

                            if (await canSendEmailToUser(employee)) {
                                await sendEmployeeAutoAbsentAlert(employee.email, employee.name, assignment.school.schoolName, assignment.category, absentContext.targetTimeStr);
                            }

                            const adminMsg = `System auto-marked ${employee.name} absent at ${assignment.school.schoolName} (No show after 2 hours).`;
                            for (const admin of admins) {
                                await sendInAppNotification(io, admin._id, "Auto-Absent Triggered", adminMsg, "System");

                                if (await canSendEmailToUser(admin)) {
                                    await sendAdminAutoAbsentAlert(admin.email, admin.name, employee.name, assignment.school.schoolName, assignment.category, absentContext.targetTimeStr);
                                }
                            }
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