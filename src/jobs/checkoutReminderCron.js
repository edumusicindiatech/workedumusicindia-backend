const cron = require('node-cron');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const {
    sendEmployeeCheckoutReminder,
    sendAdminCheckoutAlert
} = require('../utils/emailService');

const getTimeAndDateContext = (minutesToSubtract = 0) => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - minutesToSubtract);

    const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    const dateString = dateFormatter.format(d);

    const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' });
    const currentDayName = dayFormatter.format(d);

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

const startCheckoutReminderCron = (io) => {
    cron.schedule('* * * * *', async () => {
        try {
            // We want to find shifts that ended exactly 10 minutes ago
            const context = getTimeAndDateContext(10);

            console.log(`[Cron tick] Checking overdues... -> Searching for EndTime: Day: ${context.currentDayName}, Time: ${context.targetTimeStr}`);

            // Find employees who have a shift ending at this exact time today
            const overdueEmployees = await User.find({
                role: 'Employee',
                assignments: { $elemMatch: { allowedDays: context.currentDayName, endTime: context.targetTimeStr } }
            }).populate('assignments.school');

            if (overdueEmployees.length === 0) return;

            // Fetch admins once if we have people to notify
            const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] } });

            for (const employee of overdueEmployees) {
                // Filter down to the specific assignments that ended 10 mins ago
                const endedAssignments = employee.assignments.filter(a =>
                    a.allowedDays.includes(context.currentDayName) && a.endTime === context.targetTimeStr
                );

                for (const assignment of endedAssignments) {
                    // Check Attendance: Did they check in today, and is checkOutTime still null?
                    const attendanceRecord = await Attendance.findOne({
                        teacher: employee._id,
                        school: assignment.school._id,
                        band: assignment.category,
                        date: context.dateString
                    });

                    // Only send a reminder if they checked in ('Present' or 'Late') but haven't checked out
                    if (attendanceRecord && !attendanceRecord.checkOutTime && ['Present', 'Late'].includes(attendanceRecord.status)) {
                        console.log(` -> Sending checkout reminder to ${employee.name}`);

                        // 1. Notify Employee (In-App & Email)
                        const empMsg = `Reminder: Your shift at ${assignment.school.schoolName} ended 10 mins ago. Please check out if you are finished.`;
                        await sendInAppNotification(io, employee._id, "Check-Out Reminder", empMsg, "Warning");

                        if (employee.preferences?.employeeNotifications !== false) {
                            await sendEmployeeCheckoutReminder(employee.email, employee.name, assignment.school.schoolName, assignment.category, context.targetTimeStr);
                        }

                        // 2. Notify Admins (In-App & Email)
                        const adminMsg = `${employee.name} hasn't checked out of ${assignment.school.schoolName} (Shift ended 10 mins ago).`;
                        for (const admin of admins) {
                            await sendInAppNotification(io, admin._id, "Overdue Check-Out", adminMsg, "System");

                            if (admin.preferences?.adminNotifications !== false) {
                                await sendAdminCheckoutAlert(admin.email, admin.name, employee.name, assignment.school.schoolName, assignment.category, context.targetTimeStr);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Cron Job Error [Checkout Reminder]:", error);
        }
    });

    console.log("⏰ Checkout Reminder Cron Job initialized.");
};

module.exports = startCheckoutReminderCron;