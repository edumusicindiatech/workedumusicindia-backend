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
const getEmployeeProfileUpdatedTemplate = require('../templates/employeeProfileUpdateEmail');
const getAdminProfileUpdatedTemplate = require('../templates/adminProfileUpdateEmail');
const getEmployeeProfileDeletedTemplate = require('../templates/employeeProfileDeletedEmail');
const { getEmployeeTaskAssignedTemplate, getEmployeeTaskUpdatedTemplate, getEmployeeTaskRevokedTemplate } = require('../templates/employeeTaskEmail');
const { getAdminTaskAuditTemplate } = require('../templates/adminTaskEmail');
const getAdminTaskResponseTemplate = require('../templates/adminTaskResponseEmail');

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

const sendEmployeeProfileDeletedEmail = async (email, name) => {
    await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: "Account Notice: Your WorkForce Pro account was deleted",
        html: getEmployeeProfileDeletedTemplate(name)
    });
};

const sendEmployeeProfileUpdatedEmail = async (email, name) => {
    await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: "Security Alert: Profile Information Updated",
        html: getEmployeeProfileUpdatedTemplate(name)
    });
};

const sendAdminAuditEmail = async (adminEmail, targetName, changedBy) => {
    try {
        // Logic to get the admin's name would be in the loop in your router
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: adminEmail,
            subject: `[Audit Log] Profile Updated: ${targetName}`,
            html: getAdminProfileUpdatedTemplate("Admin", targetName, changedBy)
        });
    } catch (e) { console.error(e); }
};

const sendEmployeeTaskAssignedEmail = async (email, name, taskTitle, taskDescription, scheduleString, category) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: `New Task Assigned: ${taskTitle}`,
            // Pass category into the template
            html: getEmployeeTaskAssignedTemplate(name, taskTitle, taskDescription, scheduleString, category)
        });
    } catch (e) {
        console.error("Error sending employee task assigned email:", e);
    }
};

const sendEmployeeTaskUpdatedEmail = async (email, name, taskTitle, changes, currentTask) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: `Task Updated: ${taskTitle}`,
            html: getEmployeeTaskUpdatedTemplate(name, taskTitle, changes, currentTask)
        });
    } catch (e) { console.error("Error sending task updated email:", e); }
};

const sendEmployeeTaskRevokedEmail = async (email, name, taskTitle) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: `Task Revoked: ${taskTitle}`,
            html: getEmployeeTaskRevokedTemplate(name, taskTitle)
        });
    } catch (e) { console.error("Error sending task revoked email:", e); }
};

const sendAdminTaskAuditEmail = async (adminEmail, adminName, empName, taskTitle, actionType, detailsHtml) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: adminEmail,
            subject: `[Audit] Task ${actionType}: ${empName}`,
            html: getAdminTaskAuditTemplate(adminName, empName, taskTitle, actionType, detailsHtml)
        });
    } catch (e) { console.error("Error sending admin task audit email:", e); }
};

const sendAdminTaskResponseEmail = async (adminEmail, adminName, employeeName, taskTitle, status, rejectReason) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: adminEmail,
            subject: `Task ${status}: ${employeeName}`,
            html: getAdminTaskResponseTemplate(adminName, employeeName, taskTitle, status, rejectReason)
        });
    } catch (e) { console.error("Error sending admin task response email:", e); }
};

module.exports = {
    sendAdminWelcomeEmail,
    sendEmployeeWelcomeEmail,
    sendSchoolAssignmentEmail,
    sendAdminAssignmentAlertEmail,
    sendEmployeeAssignmentUpdatedEmail,
    sendEmployeeAssignmentRevokedEmail,
    sendAdminAssignmentUpdatedEmail,
    sendAdminAssignmentRevokedEmail,
    sendEmployeeProfileUpdatedEmail,
    sendEmployeeProfileDeletedEmail,
    sendAdminAuditEmail,
    sendEmployeeTaskAssignedEmail,
    sendEmployeeTaskUpdatedEmail,
    sendEmployeeTaskRevokedEmail,
    sendAdminTaskAuditEmail,
    sendAdminTaskResponseEmail
};