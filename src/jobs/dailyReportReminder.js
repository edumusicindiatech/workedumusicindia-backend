const cron = require('node-cron');
const User = require('../models/User'); // Adjust path
const DailyReports = require('../models/DailyReports')
const Notification = require('../models/Notification'); // Adjust path
const { sendEmployeeMissingReportAlert, sendAdminMissingReportAlert } = require('../utils/emailService')
// Helper to format date as YYYY-MM-DD
const getTodayDateString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const startDailyReportsCron = (io) => {
    // Schedule to run every day at 20:00 (8:00 PM) server time
    cron.schedule('0 20 * * *', async () => {
        console.log("🕒 [CRON] Starting 8:00 PM Daily Report Compliance Check...");

        try {
            const todayStr = getTodayDateString();

            // Get current day name (e.g., "Tuesday") for schedule checking
            const todayDayName = new Date().toLocaleString('en-US', { weekday: 'long' });

            // 1. Fetch all employees and populate their assigned schools
            const employees = await User.find({ role: 'Employee' }).populate('assignments.school');
            const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] } });

            for (const employee of employees) {
                if (!employee.assignments || employee.assignments.length === 0) continue;

                // 2. Check if TODAY is a working day for this employee at any assigned school
                let workingAssignment = null;

                for (const assignment of employee.assignments) {
                    // Check if today matches their working days. 
                    // (Assuming you have an array like assignment.workingDays = ['Monday', 'Tuesday']. 
                    // If your schema just means "any assignment is a working day", you can remove this array check).
                    const workingDays = assignment.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

                    if (workingDays.includes(todayDayName) && assignment.school) {
                        workingAssignment = assignment;
                        break; // Found at least one school they are supposed to work at today
                    }
                }

                // If they don't have to work today, skip them
                if (!workingAssignment) continue;

                // 3. Check if they submitted a report today
                const reportExists = await DailyReports.findOne({
                    teacher: employee._id,
                    date: todayStr
                });

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
                    await sendEmployeeMissingReportAlert(employee.email, employee.name, schoolName);


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
                        await sendAdminMissingReportAlert(admin.email, admin.name, employee.name, schoolName, location, scheduledTime);
                    }
                }
            }
            console.log("✅ [CRON] Daily Report Compliance Check completed.");

        } catch (error) {
            console.error("❌ [CRON] Error running daily report cron job:", error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata" // Setting to IST as requested in context
    });
};

module.exports = startDailyReportsCron;