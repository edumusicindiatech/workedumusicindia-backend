const nodemailer = require('nodemailer');
const { getWelcomeEmailTemplate } = require('../templates/welcomeEmail'); // IMPORT THE TEMPLATE
const User = require('../models/User');
const { getShiftNotificationTemplate } = require('../templates/shiftNotificationEmail');
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

module.exports = {
    sendWelcomeEmail,
    sendShiftNotificationToAdmins
};