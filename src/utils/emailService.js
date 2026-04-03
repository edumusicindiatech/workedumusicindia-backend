const nodemailer = require('nodemailer');
const User = require('../models/User');
const { getAdminWelcomeEmailTemplate } = require('../templates/admin/adminWelcomeEmail');
const { getEmployeeWelcomeEmailTemplate } = require('../templates/employee/employeeWelcomeEmail');
const getAdminSchoolAssignmentAlertTemplate = require('../templates/admin/adminSchoolAssignmentEmail');
const { getEmployeeSchoolAssignmentEmailTemplate } = require('../templates/employee/employeeSchoolAssignmentTemplate');
const getEmployeeAssignmentUpdatedTemplate = require('../templates/employee/employeeAssignmentUpdateEmail');
const getAdminAssignmentUpdatedTemplate = require('../templates/admin/adminAssignmentUpdateEmail');
const getAdminAssignmentRevokedTemplate = require('../templates/admin/adminAssignmentRevokeEmail');
const getEmployeeAssignmentRevokedTemplate = require('../templates/employee/employeeAssignmentRevokeEmail');
const getEmployeeProfileUpdatedTemplate = require('../templates/employee/employeeProfileUpdateEmail');
const getAdminProfileUpdatedTemplate = require('../templates/admin/adminProfileUpdateEmail');
const getEmployeeProfileDeletedTemplate = require('../templates/employee/employeeProfileDeletedEmail');
const { getEmployeeTaskAssignedTemplate, getEmployeeTaskUpdatedTemplate, getEmployeeTaskRevokedTemplate } = require('../templates/employee/employeeTaskEmail');
const { getAdminTaskAuditTemplate } = require('../templates/admin/adminTaskEmail');
const getAdminTaskResponseTemplate = require('../templates/admin/adminTaskResponseEmail');
const getEmployeeWarningTemplate = require('../templates/employee/employeeWarningEmail');
const getAdminWarningAuditTemplate = require('../templates/admin/adminWarningAuditEmail');
const getEmployeeShiftAlertTemplate = require('../templates/employee/employeeShiftAlertEmail');
const { getBroadcastEmailTemplate } = require('../templates/admin/adminBroadcastEmail');
const getAdminCheckInEmailTemplate = require('../templates/admin/adminCheckInEmail');
const getAdminCheckOutEmailTemplate = require('../templates/admin/adminCheckOutEmail');
const getAdminStatusAlertEmailTemplate = require('../templates/admin/adminStatusAlertEmail');
const getAdminAutoAbsentEmailTemplate = require('../templates/admin/adminAutoAbsentEmail');
const getEmployeeMissingReportTemplate = require('../templates/employee/employeeMissingReportEmail');
const getAdminMissingReportTemplate = require('../templates/admin/adminMissingReportEmail');
const getAdminNewEventTemplate = require('../templates/admin/adminNewEventEmail');
const getEmployeeAttendanceOverrideTemplate = require('../templates/employee/employeeAttendanceOverrideEmail');
const getAdminAttendanceOverrideAlertTemplate = require('../templates/admin/adminAttendanceOverrideEmail');
const getEmployeeAutoAbsentWarningEmail = require('../templates/employee/employeeAutoAbsentWarningEmail');
const getEmployeeAutoAbsentEmail = require('../templates/employee/employeeAutoAbsentEmail');
const getEmployeeCheckoutReminderEmail = require('../templates/employee/employeeCheckoutEmail');
const getAdminCheckoutAlertEmail = require('../templates/admin/adminCheckoutAlertEmail');
const { getLeaveRequestTemplate, getLeaveApprovedTemplate, getLeaveRejectedTemplate, getLeaveRevokedTemplate } = require('../templates/shared/leaveTemplates');
const getMediaUploadFailureTemplate = require('../templates/employee/employeeMediaUploadFailureEmail');
const getNewMediaEmailTemplate = require('../templates/shared/newMediaEmailTemplate');
const { getVideoGradedTemplate } = require('../templates/employee/employeeVideoGradedTemplateEmail');
const { getVideoDeletedTemplate } = require('../templates/shared/getMediaTemplates');
const getWeeklyScoreEmailTemplate = require('../templates/employee/employeeWeeklyScoreEmail');
const { getAdminTopPerformersTemplate } = require('../templates/admin/adminWeeklyTopPerformersEmail');
const getNewLearningMediaTemplate = require('../templates/admin/adminNewLearningMediaUpload');

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
            subject: "Admin Access Granted: Your WorkEduMusic Credentials",
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
            from: process.env.EMAIL_FROM || '"WorkEduMusic Pro" <no-reply@WorkEduMusic.com>',
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
            from: process.env.EMAIL_FROM || '"WorkEduMusic Pro" <no-reply@WorkEduMusic.com>',
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
        subject: "Account Notice: Your WorkEduMusic Pro account was deleted",
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

const sendEmployeeCheckoutReminder = async (email, employeeName, schoolName, category, scheduledEndTime) => {
    try {
        await transporter.sendMail({
            from: `"Operations Center" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: `Reminder: Check out from ${schoolName}`,
            html: getEmployeeCheckoutReminderEmail(employeeName, schoolName, category, scheduledEndTime)
        });
        return true;
    } catch (e) { console.error("Employee Checkout Reminder Email Error:", e); return false; }
};

const sendAdminCheckoutAlert = async (adminEmail, adminName, employeeName, schoolName, category, scheduledEndTime) => {
    try {
        await transporter.sendMail({
            from: `"Operations Center" <${process.env.EMAIL_FROM}>`,
            to: adminEmail,
            subject: `[Monitor] Overdue Checkout: ${employeeName}`,
            html: getAdminCheckoutAlertEmail(adminName, employeeName, schoolName, category, scheduledEndTime)
        });
        return true;
    } catch (e) { console.error("Admin Checkout Alert Email Error:", e); return false; }
};

const sendLeaveRequestEmailToAdmin = async (email, adminName, employeeName, fromDate, toDate, reason) => {
    try {
        await transporter.sendMail({
            from: `"HR / Operations" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: `Action Required: Leave Request from ${employeeName}`,
            html: getLeaveRequestTemplate(adminName, employeeName, fromDate, toDate, reason)
        });
        return true;
    } catch (e) {
        console.error("Leave Request Email Error:", e);
        return false;
    }
};

const sendLeaveApprovedEmailToEmployee = async (email, employeeName, fromDate, toDate, adminRemarks) => {
    try {
        await transporter.sendMail({
            from: `"HR / Operations" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: `Approved: Your Leave Request (${fromDate} to ${toDate})`,
            html: getLeaveApprovedTemplate(employeeName, fromDate, toDate, adminRemarks)
        });
        return true;
    } catch (e) {
        console.error("Leave Approved Email Error:", e);
        return false;
    }
};

const sendLeaveRejectedEmailToEmployee = async (email, employeeName, fromDate, toDate, adminRemarks) => {
    try {
        await transporter.sendMail({
            from: `"HR / Operations" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: `Update on your Leave Request (${fromDate} to ${toDate})`,
            html: getLeaveRejectedTemplate(employeeName, fromDate, toDate, adminRemarks)
        });
        return true;
    } catch (e) {
        console.error("Leave Rejected Email Error:", e);
        return false;
    }
};

const sendLeaveRevokedEmailToAdmin = async (email, adminName, employeeName, fromDate, toDate) => {
    try {
        await transporter.sendMail({
            from: `"HR / Operations" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: `Cancelled: Leave Request by ${employeeName}`,
            html: getLeaveRevokedTemplate(adminName, employeeName, fromDate, toDate)
        });
        return true;
    } catch (e) {
        console.error("Leave Revoked Email Error:", e);
        return false;
    }
};

const sendMediaUploadFailureEmailToEmployee = async (email, employeeName, schoolName, eventContext, failedFiles) => {
    try {
        await transporter.sendMail({
            from: `"System Notifications" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: `⚠️ Action Required: Media Upload Failed (${eventContext})`,
            html: getMediaUploadFailureTemplate(employeeName, schoolName, eventContext, failedFiles)
        });
        return true;
    } catch (e) {
        console.error("Media Upload Failure Email Error:", e);
        return false;
    }
};

const sendNewMediaEmailToAdmin = async (email, adminName, employeeName, schoolName, band, fileCount) => {
    try {
        await transporter.sendMail({
            from: `"System Notifications" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: `New Media Upload: ${schoolName} (${band})`,
            html: getNewMediaEmailTemplate(adminName, employeeName, schoolName, band, fileCount)
        });
        return true;
    } catch (e) {
        console.error("New Media Admin Email Error:", e);
        return false;
    }
};

const sendVideoGradedEmailToEmployee = async (email, employeeName, schoolName, band, marks, remark) => {
    try {
        await transporter.sendMail({
            from: `"System Notifications" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: `Video Evaluated: ${schoolName} (${marks}/10)`, // Subject updated for /10
            html: getVideoGradedTemplate(employeeName, schoolName, band, marks, remark)
        });
        return true;
    } catch (e) {
        console.error("Video Graded Email Error:", e);
        return false;
    }
};

const sendVideoDeletedEmailToEmployee = async (email, employeeName, schoolName, band) => {
    try {
        await transporter.sendMail({
            from: `"System Alerts" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: `Vault Alert: Media Removed (${schoolName})`,
            html: getVideoDeletedTemplate(employeeName, schoolName, band)
        });
        return true;
    } catch (e) {
        console.error("Video Deleted Email Error:", e);
        return false;
    }
};

const sendWeeklyScoreToEmployee = async (email, name, score, rank, colorZone, scoreTrend, stats) => {
    try {
        const html = getWeeklyScoreEmailTemplate(name, score, rank, colorZone, scoreTrend, stats);
        await transporter.sendMail({
            from: `"System Notifications" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: `Weekly Score: ${score}/100 (Rank #${rank})`,
            html: html
        });
    } catch (error) {
        console.error(`Failed to send weekly score to ${email}:`, error);
    }
};

const sendTopPerformersToAdmin = async (email, adminName, topRankers) => {
    try {
        const html = getAdminTopPerformersTemplate(adminName, topRankers);
        await transporter.sendMail({
            from: `"System Alerts" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: `🏆 Weekly Results: Top 3 Employees`,
            html: html
        });
    } catch (error) {
        console.error(`Failed to send admin summary to ${email}:`, error);
    }
};

const sendNewLearningVideoEmailToEmployee = async (email, employeeName, adminName, videoTitle) => {
    try {
        const info = await transporter.sendMail({
            from: `"Training Vault" <${process.env.EMAIL_FROM}>`,
            to: email,
            subject: `New Lesson Available: ${videoTitle}`,
            html: getNewLearningMediaTemplate(employeeName, adminName, videoTitle)
        });
        return true;
    } catch (e) {
        console.error("New Learning Video Email Error:", e);
        return false;
    }
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
    sendEmployeeAutoAbsentAlert,
    sendEmployeeCheckoutReminder,
    sendAdminCheckoutAlert,
    sendLeaveRequestEmailToAdmin,
    sendLeaveApprovedEmailToEmployee,
    sendLeaveRejectedEmailToEmployee,
    sendLeaveRevokedEmailToAdmin,
    sendMediaUploadFailureEmailToEmployee,
    sendNewMediaEmailToAdmin,
    sendVideoGradedEmailToEmployee,
    sendVideoDeletedEmailToEmployee,
    sendWeeklyScoreToEmployee,
    sendTopPerformersToAdmin,
    sendNewLearningVideoEmailToEmployee

};