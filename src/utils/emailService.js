const nodemailer = require('nodemailer');
const { getWelcomeEmailTemplate } = require('../templates/welcomeEmail'); // IMPORT THE TEMPLATE
const User = require('../models/User');
const { getShiftNotificationTemplate } = require('../templates/shiftNotificationEmail');
const { getSchoolAttendanceTemplate } = require('../templates/schoolAttendanceEmail');
const { getDailyReportSubmittedTemplate, getMissingReportTemplate } = require('../templates/dailyReportEmails');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST,
    port: process.env.BREVO_SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.BREVO_SMTP_USER,
        pass: process.env.BREVO_SMTP_PASS,
    },
});

const sendWelcomeEmail = async (userEmail, userName, employeeId, plainTextPassword) => {
    try {
        // Generate the HTML by calling the imported function
        const htmlContent = getWelcomeEmailTemplate(userName, employeeId, plainTextPassword);

        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: userEmail,
            subject: "Welcome to the Team! Action Required: Login Details Enclosed",
            html: htmlContent, // USE THE GENERATED HTML HERE
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`Welcome email sent successfully to ${userEmail}`);
        return true;
    } catch (error) {
        console.error(`Failed to send email to ${userEmail}:`, error);
        return false;
    }
};

const sendShiftNotificationToAdmins = async (employee, action, territory, time) => {
    try {
        // 1. Fetch all admins from DB
        const admins = await User.find({
            role: { $in: ['Admin1', 'Admin2', 'Admin3'] }
        }).select('email');

        if (admins.length === 0) {
            console.log("No admins found to notify.");
            return;
        }

        // Extract emails and join them (e.g., "admin1@test.com,admin2@test.com")
        const adminEmails = admins.map(admin => admin.email).join(',');

        // 2. Format the time for the email
        const formattedTime = new Date(time).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            dateStyle: 'medium',
            timeStyle: 'short'
        });

        // 3. Generate HTML from template
        const htmlContent = getShiftNotificationTemplate(
            employee.name,
            employee.employeeId,
            action,
            territory,
            formattedTime
        );

        // 4. Configure Mail Options
        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: adminEmails, // Sends to all admins simultaneously
            subject: `Alert: ${employee.name} - ${action}`,
            html: htmlContent,
        };

        // 5. Send via Brevo
        await transporter.sendMail(mailOptions);
        console.log(`Shift notification (${action}) sent to admins for ${employee.name}`);

    } catch (error) {
        console.error("Failed to send shift notification to admins:", error);
    }
};

const sendSchoolAttendanceAlert = async (employee, school, action, time, remark = '', highlightLevel = 'success') => {
    try {
        // 1. Fetch all admins
        const admins = await User.find({
            role: { $in: ['Admin1', 'Admin2', 'Admin3'] }
        }).select('email');

        if (admins.length === 0) return;

        const adminEmails = admins.map(admin => admin.email).join(',');

        // 2. Format the time
        const formattedTime = new Date(time).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            dateStyle: 'medium',
            timeStyle: 'short'
        });

        // 3. Generate HTML
        const htmlContent = getSchoolAttendanceTemplate(
            employee.name,
            school.schoolName,
            action,
            formattedTime,
            remark,
            highlightLevel
        );

        // 4. Configure Subject Line based on severity
        let subjectPrefix = '';
        if (highlightLevel === 'danger') subjectPrefix = '🚨 LATE ALERT: ';
        if (highlightLevel === 'warning') subjectPrefix = '⏱️ EXTENDED VISIT: ';

        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: adminEmails,
            subject: `${subjectPrefix}${employee.name} - ${action} at ${school.schoolName}`,
            html: htmlContent,
        };

        // 5. Send Email
        await transporter.sendMail(mailOptions);
        console.log(`School ${action} alert sent for ${employee.name}`);

    } catch (error) {
        console.error("Failed to send school attendance alert:", error);
    }
};

const sendTaskUpdateAlert = async (employee, school, action, rejectReason = "") => {
    try {
        const admins = await User.find({ role: { $in: ['Admin1', 'Admin2', 'Admin3'] } }).select('email');
        if (!admins.length) return;

        const adminEmails = admins.map(a => a.email).join(',');
        const htmlContent = getTaskUpdateTemplate(employee.name, school.schoolName, action, rejectReason);

        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: adminEmails,
            subject: `Task ${action}: ${employee.name} at ${school.schoolName}`,
            html: htmlContent,
        };

        await transporter.sendMail(mailOptions);
        console.log(`Task ${action} alert sent to admins for ${employee.name}`);
    } catch (error) {
        console.error("Failed to send task update alert:", error);
    }
};

const sendDailyReportAlert = async (employee, report) => {
    try {
        const admins = await User.find({ role: { $in: ['Admin1', 'Admin2', 'Admin3'] } }).select('email');
        if (!admins.length) return;

        const adminEmails = admins.map(a => a.email).join(',');

        const formattedDate = new Date(report.date).toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata', dateStyle: 'long'
        });

        const htmlContent = getDailyReportSubmittedTemplate(
            employee.name,
            formattedDate,
            report.category,
            report.summary,
            report.actionItems,
            report.location
        );

        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: adminEmails,
            subject: `Daily Report: ${employee.name} - ${formattedDate}`,
            html: htmlContent,
        };

        await transporter.sendMail(mailOptions);
        console.log(`Daily report alert sent to admins for ${employee.name}`);
    } catch (error) {
        console.error("Failed to send daily report alert:", error);
    }
};

const sendMissingReportAlert = async (employee) => {
    try {
        // Fetch admins to CC them on the warning
        const admins = await User.find({ role: { $in: ['Admin1', 'Admin2', 'Admin3'] } }).select('email');
        const adminEmails = admins.map(a => a.email).join(',');

        const todayStr = new Date().toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata', dateStyle: 'long'
        });

        const htmlContent = getMissingReportTemplate(employee.name, todayStr);

        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: employee.email, // Send directly to the teacher
            cc: adminEmails,    // Copy the admins so they know it was missed
            subject: `🚨 Missing Daily Report - ${todayStr}`,
            html: htmlContent,
        };

        await transporter.sendMail(mailOptions);
        console.log(`Missing report warning sent to ${employee.email} and Admins.`);
    } catch (error) {
        console.error("Failed to send missing report warning:", error);
    }
};

module.exports = {
    sendWelcomeEmail,
    sendShiftNotificationToAdmins,
    sendSchoolAttendanceAlert,
    sendTaskUpdateAlert,
    sendDailyReportAlert,
    sendMissingReportAlert
};