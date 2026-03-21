const nodemailer = require('nodemailer');
const User = require('../models/User');
const { getAdminWelcomeEmailTemplate } = require('../templates/adminWelcomeEmail');
const { getEmployeeWelcomeEmailTemplate } = require('../templates/employeeWelcomeEmail');
const getAdminSchoolAssignmentAlertTemplate = require('../templates/adminSchoolAssignmentEmail');
const { getEmployeeSchoolAssignmentEmailTemplate } = require('../templates/employeeSchoolAssignmentTemplate');
const getEmployeeAssignmentUpdatedTemplate = require('../templates/employeeAssignmentUpdateEmail');
const getAdminAssignmentUpdatedTemplate = require('../templates/adminAssignmentUpdateEmail');
const getAdminAssignmentRevokedTemplate = require('../templates/adminAssignmentRevokeEmail');
const getEmployeeAssignmentRevokedTemplate = require('../templates/employeeAssignmentRevokeEmail');

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

const sendAdminWelcomeEmail = async (userEmail, adminName, adminId, plainTextPassword) => {
    try {
        const htmlContent = getAdminWelcomeEmailTemplate(adminName, adminId, plainTextPassword);

        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: userEmail,
            subject: "Admin Access Granted: Your WorkForce Pro Credentials",
            html: htmlContent,
        };

        await transporter.sendMail(mailOptions);
        console.log(`Admin welcome email sent successfully to ${userEmail}`);
        return true;
    } catch (error) {
        console.error(`Failed to send Admin email to ${userEmail}:`, error);
        return false;
    }
};

const sendEmployeeWelcomeEmail = async (userEmail, userName, employeeId, plainTextPassword) => {
    try {
        // Generate the HTML by calling the imported function
        const htmlContent = getEmployeeWelcomeEmailTemplate(userName, employeeId, plainTextPassword);

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

const sendSchoolAssignmentEmail = async (userEmail, userName, schoolName, schoolAddress, category, startDate, startTime) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_FROM || '"WorkForce Pro" <no-reply@workforce.com>',
            to: userEmail,
            subject: "New Assignment: " + schoolName,
            html: getEmployeeSchoolAssignmentEmailTemplate(userName, schoolName, schoolAddress, category, startDate, startTime)
        };
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error("Error sending assignment email:", error);
    }
};

const sendAdminAssignmentAlertEmail = async (adminEmail, adminName, employeeName, schoolName, schoolAddress, category, startDate) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_FROM || '"WorkForce Pro" <no-reply@workforce.com>',
            to: adminEmail,
            subject: `[Admin Alert] ${employeeName} Assigned to ${schoolName}`,
            html: getAdminSchoolAssignmentAlertTemplate(adminName, employeeName, schoolName, schoolAddress, category, startDate)
        };
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error("Error sending admin alert email:", error);
    }
};

const sendEmployeeAssignmentUpdatedEmail = async (email, name, schoolName, schoolAdress, changes, assignment) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_FROM, // Using the unified mailFrom we set up earlier
            to: email,
            subject: `⚠️ Schedule Update: ${schoolName}`,
            // We pass the raw changes array and the assignment object to the template
            html: getEmployeeAssignmentUpdatedTemplate(name, schoolName, schoolAdress, changes, assignment)
        };

        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error("Error in sendEmployeeAssignmentUpdatedEmail:", error);
    }
};

const sendEmployeeAssignmentRevokedEmail = async (email, name, schoolName, schoolAddress, category) => {
    await transporter.sendMail({
        from: process.env.EMAIL_FROM, // Fixed: Added explicit from address
        to: email,
        subject: `Assignment Canceled: ${schoolName}`,
        html: getEmployeeAssignmentRevokedTemplate(name, schoolName, schoolAddress, category)
    });
};

const sendAdminAssignmentUpdatedEmail = async (email, adminName, empName, schoolName, schoolAddress, category) => {
    await transporter.sendMail({
        from: process.env.EMAIL_FROM, // Fixed: Added explicit from address
        to: email,
        subject: `[Audit] Schedule Updated: ${empName}`,
        html: getAdminAssignmentUpdatedTemplate(adminName, empName, schoolName, schoolAddress, category)
    });
};

const sendAdminAssignmentRevokedEmail = async (email, adminName, empName, schoolName, schoolAddress, category) => {
    await transporter.sendMail({
        from: process.env.EMAIL_FROM, // Fixed: Added explicit from address
        to: email,
        subject: `[Audit] Assignment Revoked: ${empName}`,
        html: getAdminAssignmentRevokedTemplate(adminName, empName, schoolName, schoolAddress, category)
    });
};

module.exports = {
    sendAdminWelcomeEmail,
    sendEmployeeWelcomeEmail,
    sendSchoolAssignmentEmail,
    sendAdminAssignmentAlertEmail,
    sendEmployeeAssignmentUpdatedEmail,
    sendEmployeeAssignmentRevokedEmail,
    sendAdminAssignmentUpdatedEmail,
    sendAdminAssignmentRevokedEmail
};