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
const getEmployeeWarningTemplate = require('../templates/employeeWarningEmail');
const getAdminWarningAuditTemplate = require('../templates/adminWarningAuditEmail');
const getEmployeeShiftAlertTemplate = require('../templates/employeeShiftAlertEmail');
const { getBroadcastEmailTemplate } = require('../templates/adminBroadcastEmail');
const getAdminCheckInEmailTemplate = require('../templates/adminCheckInEmail');
const getAdminCheckOutEmailTemplate = require('../templates/adminCheckOutEmail');
const getAdminStatusAlertEmailTemplate = require('../templates/adminStatusAlertEmail');
const getAdminAutoAbsentEmailTemplate = require('../templates/adminAutoAbsentEmail');
const getEmployeeMissingReportTemplate = require('../templates/employeeMissingReportEmail');
const getAdminMissingReportTemplate = require('../templates/adminMissingReportEmail');
const getAdminNewEventTemplate = require('../templates/adminNewEventEmail');
const getEmployeeAttendanceOverrideTemplate = require('../templates/employeeAttendanceOverrideEmail');
const getAdminAttendanceOverrideAlertTemplate = require('../templates/adminAttendanceOverrideEmail');
const getEmployeeAutoAbsentWarningEmail = require('../templates/employeeAutoAbsentWarningEmail');
const getEmployeeAutoAbsentEmail = require('../templates/employeeAutoAbsentEmail');

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

const sendEmployeeWarningEmail = async (email, employeeName, level, reason, issuerName) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: `Official Notice: ${level} Warning`,
            html: getEmployeeWarningTemplate(employeeName, level, reason, issuerName)
        });
    } catch (e) { console.error("Employee warning email error:", e); }
};

const sendAdminWarningAuditEmail = async (adminEmail, adminName, employeeName, level, reason, issuerName) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: adminEmail,
            subject: `Audit Alert: ${level} Warning Issued`,
            html: getAdminWarningAuditTemplate(adminName, employeeName, level, reason, issuerName)
        });
    } catch (e) { console.error("Admin warning audit email error:", e); }
};

const sendPreShiftWarningEmail = async (email, name, schoolName, category, startTime) => {
    try {
        const mailOptions = {
            from: `"Operations Center" <${process.env.EMAIL_FROM}>`, // Update to match your setup
            to: email,
            subject: `Action Required: Shift at ${schoolName} starts in 15 mins`,
            html: getEmployeeShiftAlertTemplate(name, schoolName, category, startTime)
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email Sent] Pre-shift warning delivered to ${email}. Message ID: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error(`[Email Error] Failed to send pre-shift warning to ${email}:`, error);
        return false;
    }
};

const sendBroadcastEmail = async (emailsArray, message, senderName) => {
    if (!emailsArray || emailsArray.length === 0) return;

    try {
        const mailOptions = {
            from: `"Operations Center" <${process.env.EMAIL_FROM}>`,
            to: process.env.EMAIL_FROM, // Send to self
            bcc: emailsArray, // Blind Carbon Copy all recipients
            subject: `📢 Official Announcement from ${senderName}`,
            html: getBroadcastEmailTemplate(message, senderName)
        };

        await transporter.sendMail(mailOptions);
        console.log(`[Broadcast Email] Successfully sent to ${emailsArray.length} recipients.`);
        return true;
    } catch (error) {
        console.error(`[Broadcast Email Error]:`, error);
        return false;
    }
};

const sendAdminCheckInAlert = async (adminEmail, adminName, employeeName, schoolName, category, scheduledTime, checkInTime, status, lateReason, eventNote) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: adminEmail,
            subject: `[Check-In] ${employeeName} at ${schoolName}`,
            html: getAdminCheckInEmailTemplate(adminName, employeeName, schoolName, category, scheduledTime, checkInTime, status, lateReason, eventNote)
        });
    } catch (e) { console.error("CheckIn Email Error:", e); }
};

const sendAdminCheckOutAlert = async (adminEmail, adminName, employeeName, schoolName, category, checkOutTime, overtimeReason) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: adminEmail,
            subject: `[Check-Out] ${employeeName} completed ${schoolName}`,
            html: getAdminCheckOutEmailTemplate(adminName, employeeName, schoolName, category, checkOutTime, overtimeReason)
        });
    } catch (e) { console.error("CheckOut Email Error:", e); }
};

const sendAdminStatusAlert = async (adminEmail, adminName, employeeName, schoolName, category, status, reason) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: adminEmail,
            subject: `[Status: ${status}] ${employeeName}`,
            html: getAdminStatusAlertEmailTemplate(adminName, employeeName, schoolName, category, status, reason)
        });
    } catch (e) { console.error("Status Alert Email Error:", e); }
};

const sendAdminAutoAbsentAlert = async (adminEmail, adminName, employeeName, schoolName, category, scheduledTime) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: adminEmail,
            subject: `🚨 [CRITICAL: Auto-Absent] ${employeeName}`,
            html: getAdminAutoAbsentEmailTemplate(adminName, employeeName, schoolName, category, scheduledTime)
        });
    } catch (e) { console.error("AutoAbsent Email Error:", e); }
};

const sendEmployeeMissingReportAlert = async (email, employeeName, schoolName) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: "Action Required: Missing Daily Report",
            html: getEmployeeMissingReportTemplate(employeeName, schoolName)
        });
    } catch (e) { console.error("Employee Missing Report Email Error:", e); }
};

const sendAdminMissingReportAlert = async (adminEmail, adminName, employeeName, schoolName, location, scheduledTime) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: adminEmail,
            subject: `[Compliance Alert] Missing Report: ${employeeName}`,
            html: getAdminMissingReportTemplate(adminName, employeeName, schoolName, location, scheduledTime)
        });
    } catch (e) { console.error("Admin Missing Report Email Error:", e); }
};

const sendAdminNewEventAlert = async (adminEmail, adminName, employeeName, schoolName, category, startDate, endDate, timeFrom, timeTo, description) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: adminEmail,
            subject: `[New Event] ${schoolName} - ${employeeName}`,
            html: getAdminNewEventTemplate(adminName, employeeName, schoolName, category, startDate, endDate, timeFrom, timeTo, description)
        });
    } catch (e) { console.error("New Event Email Error:", e); }
};

const sendEmployeeAttendanceOverrideEmail = async (email, employeeName, adminName, date, schoolName, newStatus, reason) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: `Admin Override: Attendance Updated for ${schoolName}`,
            html: getEmployeeAttendanceOverrideTemplate(employeeName, adminName, date, schoolName, newStatus, reason)
        });
    } catch (e) { console.error("Employee Override Email Error:", e); }
};

const sendAdminAttendanceOverrideAlert = async (adminEmail, adminName, actionAdminName, employeeName, schoolName, date, newStatus, reason) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: adminEmail,
            subject: `[Audit] Attendance Override: ${employeeName}`,
            html: getAdminAttendanceOverrideAlertTemplate(adminName, actionAdminName, employeeName, schoolName, date, newStatus, reason)
        });
    } catch (e) { console.error("Admin Override Alert Email Error:", e); }
};

const sendEmployeeAutoAbsentWarning = async (email, employeeName, schoolName, category, scheduledTime) => {
    try {
        await transporter.sendMail({
            from: `"Operations Center" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: `⚠️ ACTION REQUIRED: 15 mins left to check-in for ${schoolName}`,
            html: getEmployeeAutoAbsentWarningEmail(employeeName, schoolName, category, scheduledTime)
        });
        return true;
    } catch (e) { console.error("Auto Absent Warning Email Error:", e); return false; }
};

const sendEmployeeAutoAbsentAlert = async (email, employeeName, schoolName, category, scheduledTime) => {
    try {
        await transporter.sendMail({
            from: `"Operations Center" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: `🚨 Automatically Marked Absent for ${schoolName}`,
            html: getEmployeeAutoAbsentEmail(employeeName, schoolName, category, scheduledTime)
        });
        return true;
    } catch (e) { console.error("Employee Auto Absent Email Error:", e); return false; }
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
    sendAdminTaskResponseEmail,
    sendEmployeeWarningEmail,
    sendAdminWarningAuditEmail,
    sendPreShiftWarningEmail,
    sendBroadcastEmail,
    sendAdminCheckInAlert,
    sendAdminCheckOutAlert,
    sendAdminStatusAlert,
    sendAdminAutoAbsentAlert,
    sendEmployeeMissingReportAlert,
    sendAdminMissingReportAlert,
    sendAdminNewEventAlert,
    sendEmployeeAttendanceOverrideEmail,
    sendAdminAttendanceOverrideAlert,
    sendEmployeeAutoAbsentWarning,
    sendEmployeeAutoAbsentAlert

};