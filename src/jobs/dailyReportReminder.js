const cron = require('node-cron');
const User = require('../models/User'); // Adjust path
const DailyReports = require('../models/DailyReports');
const Notification = require('../models/Notification'); // Adjust path
const LeaveRequest = require('../models/LeaveRequest'); // <-- NEED THIS FOR LEAVE CHECK
const { sendEmployeeMissingReportAlert, sendAdminMissingReportAlert } = require('../utils/emailService');
const { getISTDateString, getISTDayOfWeek } = require('../utils/timeHelper'); // <-- ADDED HELPER
const { canSendEmailToUser } = require('../utils/canSendEmailToUser'); // <-- ADDED HELPER

const startDailyReportsCron = (io) => {
    // Schedule to run every day at 20:00 (8:00 PM) server time
    cron.schedule('0 20 * * *', async () => {
        console.log("🕒 [CRON] Starting 8:00 PM Daily Report Compliance Check...");

        try {
            // --- SYNCED DATE & TIME LOGIC ---
            const todayStr = getISTDateString();
            const currentDayName = getISTDayOfWeek();

            // Force strict IST boundaries for the database query by appending the offset
            const todayStart = new Date(`${todayStr}T00:00:00.000+05:30`);
            const todayEnd = new Date(`${todayStr}T23:59:59.999+05:30`);

            // --- SYNCED LEAVE CHECKER ---
            const activeLeaves = await LeaveRequest.find({
                status: 'approved',
                fromDate: { $lte: todayEnd },
                toDate: { $gte: todayStart }
            });
            const usersOnLeaveSet = new Set(activeLeaves.map(leave => leave.employee.toString()));

            // 1. Fetch all active employees and admins
            const employees = await User.find({ role: 'Employee', isActive: true }).populate('assignments.school');
            const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] } });

            for (const employee of employees) {
                if (!employee.assignments || employee.assignments.length === 0) continue;

                // If employee is on leave today, completely skip them (No report required)
                if (usersOnLeaveSet.has(employee._id.toString())) continue;

                // 2. Check if TODAY is a valid working day for this employee
                let workingAssignment = null;

                for (const assign of employee.assignments) {
                    if (!assign.school) continue;

                    // --- SYNCED DATE ISOLATION LOGIC (String Math) ---
                    const assignmentStartDate = assign.startDate ? new Date(assign.startDate) : assign._id.getTimestamp();
                    const assignStartStr = getISTDateString(assignmentStartDate);

                    const isAfterStartDate = todayStr >= assignStartStr;

                    let isBeforeEndDate = true;
                    if (assign.endDate) {
                        const assignEndStr = getISTDateString(new Date(assign.endDate));
                        isBeforeEndDate = todayStr <= assignEndStr;
                    }

                    // 3. If the date is valid AND today is an allowed day, they are expected to work!
                    if (isAfterStartDate && isBeforeEndDate && assign.allowedDays.includes(currentDayName)) {
                        workingAssignment = assign;
                        break; // Found their active shift for today
                    }
                }

                // If they don't have an active shift today, skip them
                if (!workingAssignment) continue;

                // 3. Check if they submitted a report today
                const reportExists = await DailyReports.findOne({
                    teacher: employee._id,
                    date: todayStr
                });

                // If no report exists, trigger the warnings!
                if (!reportExists) {
                    const schoolName = workingAssignment.school.schoolName;
                    const location = workingAssignment.school.address || "Assigned Zone";
                    const scheduledTime = workingAssignment.startTime || "Scheduled Hours";

                    console.log(`❌ [CRON] Missing Report: ${employee.name} at ${schoolName}`);

                    // --- 4. CREATE EMPLOYEE NOTIFICATION & EMAIL ---
                    const empNotif = await Notification.create({
                        recipient: employee._id,
                        title: "Action Required: Missing Report",
                        message: `Your End of Day report for ${schoolName} is overdue. Please submit it immediately.`,
                        type: "Warning",
                        level: "Written",
                        reason: "Failed to submit Daily Report by 8:00 PM deadline."
                    });

                    if (io) io.to(employee._id.toString()).emit('new_notification', empNotif);

                    // Added permissions check here
                    if (await canSendEmailToUser(employee)) {
                        await sendEmployeeMissingReportAlert(employee.email, employee.name, schoolName);
                    }

                    // --- 5. CREATE ADMIN NOTIFICATIONS & EMAILS ---
                    for (const admin of admins) {
                        const adminNotif = await Notification.create({
                            recipient: admin._id,
                            title: "Compliance Alert: Missing Report",
                            message: `${employee.name} failed to submit their Daily Report for ${schoolName} by 8:00 PM.`,
                            type: "Warning",
                            level: "Written",
                            reason: "Daily Report Overdue"
                        });

                        if (io) io.to(admin._id.toString()).emit('new_notification', adminNotif);

                        // Added permissions check here
                        if (await canSendEmailToUser(admin)) {
                            await sendAdminMissingReportAlert(admin.email, admin.name, employee.name, schoolName, location, scheduledTime);
                        }
                    }
                }
            }
            console.log("✅ [CRON] Daily Report Compliance Check completed.");

        } catch (error) {
            console.error("❌ [CRON] Error running daily report cron job:", error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });
};

module.exports = startDailyReportsCron;