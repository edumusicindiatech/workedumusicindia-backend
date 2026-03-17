// src/jobs/reportCron.js
const cron = require('node-cron');
const DailyReport = require('../models/DailyReport');
const DailyShift = require('../models/DailyShift');
const User = require('../models/User');
const { sendMissingReportAlert } = require('../utils/emailService'); // Your email function

const initializeCronJobs = () => {
    // Schedule: 8:00 PM (20:00), every day from Monday (1) to Saturday (6)
    cron.schedule('0 20 * * 1-6', async () => {
        console.log("CRON RUNNING: Checking for missing daily reports...");

        try {
            // We use the local Indian time date string
            const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

            // 1. Find everyone who LOGGED IN today (started a shift)
            const todaysShifts = await DailyShift.find({ date: todayStr }).populate('employee');

            for (const shift of todaysShifts) {
                const employee = shift.employee;

                // 2. Check if this specific employee submitted a report today
                const report = await DailyReport.findOne({
                    employee: employee._id,
                    date: todayStr
                });

                // 3. If no report is found, trigger the alerts
                if (!report) {
                    console.log(`Missing report detected for: ${employee.name}`);

                    // Send email to the Admin AND the Teacher
                    await sendMissingReportAlert(employee);
                }
            }
            console.log("CRON COMPLETE: Missing report check finished.");

        } catch (error) {
            console.error("Error running the missing report cron job:", error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata" // Enforce Mumbai timezone
    });
};

module.exports = initializeCronJobs;