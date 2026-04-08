const cron = require('node-cron');
const User = require('../models/User'); 
const DailyReports = require('../models/DailyReports');
const Attendance = require('../models/Attendance'); 
const Notification = require('../models/Notification'); 
const LeaveRequest = require('../models/LeaveRequest'); 
const { sendEmployeeMissingReportAlert, sendAdminMissingReportAlert } = require('../utils/emailService');
const { getISTDateString, getISTDayOfWeek } = require('../utils/timeHelper'); 
const { canSendEmailToUser } = require('../utils/canSendEmailToUser'); 

const startDailyReportsCron = (io) => {
    cron.schedule('0 20 * * *', async () => {
        console.log("🕒 [CRON] Starting 8:00 PM Daily Report Compliance Check...");

        try {
            const todayStr = getISTDateString();
            const currentDayName = getISTDayOfWeek();

            const todayStart = new Date(`${todayStr}T00:00:00.000+05:30`);
            const todayEnd = new Date(`${todayStr}T23:59:59.999+05:30`);

            // 1. Fetch approved leaves
            const activeLeaves = await LeaveRequest.find({
                status: 'approved',
                fromDate: { $lte: todayEnd },
                toDate: { $gte: todayStart }
            });
            const usersOnLeaveSet = new Set(activeLeaves.map(leave => leave.employee.toString()));

            const employees = await User.find({ role: 'Employee', isActive: true }).populate('assignments.school');
            const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] } });

            for (const employee of employees) {
                const empIdStr = employee._id.toString();

                // SKIP: If employee is on an approved multi-day leave
                if (usersOnLeaveSet.has(empIdStr)) continue;

                // --- 2. WHOLE DAY STATUS CHECK ---
                // Check if the employee used the "Day Absent" or "Day Holiday" button
                // We look for any record on this date where the status is Absent/Holiday
                const dayStatus = await Attendance.findOne({
                    teacher: employee._id,
                    date: todayStr,
                    status: { $in: ['Absent', 'Holiday'] }
                });

                // If your backend marks all schools individually, this will find the first one.
                // If it marks a global "Whole Day" record, it will find that too.
                if (dayStatus) {
                    // Logic: If they are absent for the day, we skip all their assignment checks.
                    console.log(`ℹ️ [CRON] Skipping ALL reports for ${employee.name}: Day marked as ${dayStatus.status}`);
                    continue; 
                }

                if (!employee.assignments || employee.assignments.length === 0) continue;

                // 3. Loop through individual assignments
                for (const assign of employee.assignments) {
                    if (!assign.school) continue;

                    const assignmentStartDate = assign.startDate ? new Date(assign.startDate) : assign._id.getTimestamp();
                    const assignStartStr = getISTDateString(assignmentStartDate);

                    const isAfterStartDate = todayStr >= assignStartStr;
                    let isBeforeEndDate = true;
                    if (assign.endDate) {
                        const assignEndStr = getISTDateString(new Date(assign.endDate));
                        isBeforeEndDate = todayStr <= assignEndStr;
                    }

                    if (isAfterStartDate && isBeforeEndDate && assign.allowedDays.includes(currentDayName)) {
                        
                        // Check if a report exists for THIS specific school AND band
                        const reportExists = await DailyReports.findOne({
                            teacher: employee._id,
                            date: todayStr,
                            schoolId: assign.school._id,
                            band: assign.category 
                        });

                        if (!reportExists) {
                            const schoolName = assign.school.schoolName;
                            const bandName = assign.category;
                            const location = assign.school.address || "Assigned Zone";
                            const scheduledTime = `${assign.startTime} - ${assign.endTime}`;

                            console.log(`❌ [CRON] Missing Report: ${employee.name} | ${schoolName} (${bandName})`);

                            // Create Notifications & Emails...
                            // (Keep the same Notification.create and email logic we wrote in the previous step)
                            const empNotif = await Notification.create({
                                recipient: employee._id,
                                title: "Action Required: Missing Report",
                                message: `Your report for ${schoolName} (${bandName}) is overdue. Please submit it now.`,
                                type: "Warning",
                                level: "Written",
                                reason: `Failed to submit ${bandName} report for ${schoolName}.`
                            });

                            if (io) io.to(empIdStr).emit('new_notification', empNotif);

                            if (await canSendEmailToUser(employee)) {
                                await sendEmployeeMissingReportAlert(employee.email, employee.name, schoolName, bandName);
                            }

                            for (const admin of admins) {
                                const adminNotif = await Notification.create({
                                    recipient: admin._id,
                                    title: "Compliance Alert: Missing Report",
                                    message: `${employee.name} missed the ${bandName} report for ${schoolName}.`,
                                    type: "Warning",
                                    level: "Written",
                                    reason: "Daily Report Overdue"
                                });

                                if (io) io.to(admin._id.toString()).emit('new_notification', adminNotif);

                                if (await canSendEmailToUser(admin)) {
                                    await sendAdminMissingReportAlert(admin.email, admin.name, employee.name, schoolName, bandName, location, scheduledTime);
                                }
                            }
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