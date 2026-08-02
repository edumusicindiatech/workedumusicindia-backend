const express = require('express');
const User = require('../models/User');
const crypto = require('crypto');
const validator = require('validator');
const bcrypt = require('bcrypt');
const adminRouter = express.Router();
const { sendAdminWelcomeEmail, sendEmployeeWelcomeEmail, sendSchoolAssignmentEmail, sendAdminAssignmentAlertEmail, sendEmployeeAssignmentRevokedEmail, sendAdminAssignmentRevokedEmail, sendEmployeeAssignmentUpdatedEmail, sendAdminAssignmentUpdatedEmail, sendEmployeeProfileUpdatedEmail, sendAdminAuditEmail, sendEmployeeProfileDeletedEmail, sendEmployeeTaskAssignedEmail, sendAdminTaskAuditEmail, sendEmployeeTaskUpdatedEmail, sendEmployeeTaskRevokedEmail, sendEmployeeWarningEmail, sendAdminWarningAuditEmail, sendEmployeeAttendanceOverrideEmail, sendAdminAttendanceOverrideAlert, sendLeaveApprovedEmailToEmployee, sendLeaveRejectedEmailToEmployee, sendVideoGradedEmailToEmployee, sendVideoDeletedEmailToEmployee, sendHolidayAlertToAdmin, sendHolidayAlertToEmployee } = require('../utils/emailService');
const adminAuth = require('../middleware/adminAuth');
const userAuth = require('../middleware/userAuth');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const School = require('../models/School');
const Notification = require('../models/Notification');
const Attendance = require('../models/Attendance')
const Task = require('../models/Task');
const Warning = require('../models/Warning');
const fetchDailyFeedData = require('../utils/feedUtils');
const DailyReports = require('../models/DailyReports')
const Event = require('../models/Event')
const mongoose = require('mongoose');
const LeaveRequest = require('../models/LeaveRequest');
const Settings = require('../models/Settings');
const { canSendEmailToUser } = require('../utils/canSendEmailToUser');
const MediaLog = require('../models/MediaLog');
const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const assetsS3Client = require('../config/assetsS3Client');
const s3Client = require('../config/s3');
const { getISTDayOfWeek, getISTDateString } = require('../utils/timeHelper');
const Conversation = require('../models/Conversation');
const chatS3Client = require('../config/chatS3Client');
const Group = require('../models/Group');
const Message = require('../models/Message');
const SchoolHoliday = require('../models/SchoolHoliday');
const exceljs = require('exceljs')

const sortDaysChronologically = (daysArray) => {
    if (!daysArray || !Array.isArray(daysArray)) return [];
    const dayOrder = { "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6, "Sun": 7 };
    return [...daysArray].sort((a, b) => (dayOrder[a] || 8) - (dayOrder[b] || 8));
};

// ==========================================
// 1. CREATE ADMIN (SuperAdmin Only)
// ==========================================
adminRouter.post('/create-admin', userAuth, requireSuperAdmin, async (req, res) => {
    try {
        const { name, email, mobile, employeeId, password } = req.body;

        if (!name || !email || !employeeId || !password) {
            return res.status(400).json({ success: false, message: "All required fields must be provided." });
        }

        if (!validator.isEmail(email)) {
            return res.status(400).json({ success: false, message: "Please enter a valid email address." });
        }
        if (!validator.isStrongPassword(password)) {
            return res.status(400).json({
                success: false,
                message: "Password is not strong enough. It must contain at least 8 characters, 1 uppercase, 1 lowercase, 1 number, and 1 symbol."
            });
        }

        const existingUser = await User.findOne({ $or: [{ email }, { employeeId }] });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Email or Admin ID already in use." });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const adminUser = await User.findOneAndUpdate(
            { email: email },
            {
                $set: {
                    name,
                    mobile,
                    employeeId,
                    password: hashedPassword,
                    role: 'Admin',
                    designation: 'Administrator',
                    isFirstLogin: true
                }
            },
            {
                returnDocument: 'after',
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            }
        );

        if (await canSendEmailToUser(adminUser)) {
            const emailSent = await sendAdminWelcomeEmail(email, name, employeeId, password);
            if (!emailSent) console.warn(`Failed to send welcome email to ${email}`);
        }

        res.status(200).json({
            success: true,
            message: "Admin saved successfully and credentials emailed.",
            data: { id: adminUser._id, name: adminUser.name, email: adminUser.email }
        });

    } catch (error) {
        console.error("Create Admin Error:", error);
        res.status(500).json({ success: false, message: "Server error while processing admin." });
    }
});

// ==========================================
// 2. CREATE EMPLOYEE (Admin/SuperAdmin)
// ==========================================
adminRouter.post('/create-employee', userAuth, adminAuth, async (req, res) => {
    try {
        const { name, email, mobile, designation, zone } = req.body;

        if (!name || !email || !mobile) {
            return res.status(400).json({ success: false, message: "All fields are mandatory." });
        }
        if (!validator.isEmail(email)) {
            return res.status(400).json({ success: false, message: "Please enter a valid email address." });
        }

        const currentYear = new Date().getFullYear();
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const generatedEmployeeId = `EMP-${currentYear}-${randomNum}`;
        const defaultPassword = "Welcome@123";
        const hashedDefaultPassword = await bcrypt.hash(defaultPassword, 10);

        const employeeUser = await User.findOneAndUpdate(
            { email: email },
            {
                $set: {
                    name,
                    mobile,
                    designation,
                    zone: zone || 'Unassigned',
                    employeeId: generatedEmployeeId,
                    password: hashedDefaultPassword,
                    role: 'Employee',
                    isFirstLogin: true
                }
            },
            {
                returnDocument: 'after',
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            }
        );



        if (await canSendEmailToUser(employeeUser)) {
            const emailSent = await sendEmployeeWelcomeEmail(email, name, generatedEmployeeId, defaultPassword);
            if (!emailSent) console.warn(`Failed to send welcome email to ${email}`);
        }

        res.status(200).json({
            success: true,
            message: "Employee processed successfully and credentials emailed.",
            credentials: { employeeId: generatedEmployeeId, defaultPassword }
        });

    } catch (error) {
        console.error("Create Employee Error:", error);
        res.status(500).json({ success: false, message: "Server error while processing employee." });
    }
});

// ==========================================
// 3. GET EMPLOYEE ROSTER
// ==========================================
adminRouter.get('/roster', userAuth, adminAuth, async (req, res) => {
    try {
        const queryFilter = req.user.role === 'SuperAdmin'
            ? { role: { $in: ['Employee', 'Admin'] }, _id: { $ne: req.user._id } }
            : { role: 'Employee' };

        const employees = await User.find(queryFilter)
            .select('_id name email designation zone role profilePicture')
            .sort({ createdAt: -1 });

        const formattedRoster = employees.map(emp => ({
            id: emp._id,
            name: emp.name,
            role: emp.designation || 'Unassigned',
            location: emp.zone || 'Unassigned',
            email: emp.email,
            profilePicture: emp.profilePicture,
            systemRole: emp.role
        }));

        res.status(200).json({ success: true, data: formattedRoster });
    } catch (error) {
        console.error("Fetch Roster Error:", error);
        res.status(500).json({ success: false, message: "Server error while fetching roster." });
    }
});

// ==========================================
// 4. GET SINGLE EMPLOYEE PROFILE
// ==========================================
adminRouter.get('/employees/:id', userAuth, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const employee = await User.findById(id).populate('assignments.school');
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });

        const tasks = await Task.find({ teacher: id }).populate('school', 'schoolName address location');

        const warnings = await Warning.find({ teacher: id })
            .populate('issuedBy', 'name')
            .sort({ dateIssued: -1 });

        const responseData = {
            ...employee.toObject(),
            tasks: tasks,
            warnings: warnings
        };

        res.status(200).json({ success: true, data: responseData });

    } catch (error) {
        console.error("Fetch Employee Error:", error);
        res.status(500).json({ success: false, message: "Server error fetching employee." });
    }
});

// ==========================================
// 5. ASSIGN SCHOOL TO EMPLOYEE (STRICT MATCH UPDATE)
// ==========================================
adminRouter.post('/employees/:id/assign-school', userAuth, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        let {
            schoolName, schoolAddress, category, startDate, endDate,
            startTime, endTime, allowedDays, latitude, longitude
        } = req.body;

        if (allowedDays) allowedDays = sortDaysChronologically(allowedDays);

        // 1. STRICT INPUT VALIDATIONS
        if (!schoolName || !schoolAddress || !category || !startDate || !startTime || !endTime) {
            return res.status(400).json({ success: false, message: "School Name, Location, Category, Start Date, Start Time, and End Time are required." });
        }

        if (!Array.isArray(allowedDays)) {
            return res.status(400).json({ success: false, message: "Please enter a valid Day" });
        }

        if (latitude === undefined || longitude === undefined || latitude === '' || longitude === '') {
            return res.status(400).json({ success: false, message: "Geofence coordinates are required." });
        }

        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        if (isNaN(lat) || isNaN(lng)) {
            return res.status(400).json({ success: false, message: "Invalid geofence coordinates provided." });
        }

        if (lat < 6.0 || lat > 38.0 || lng < 68.0 || lng > 98.0) {
            return res.status(400).json({ success: false, message: "Coordinates must be located within India." });
        }

        // IST DATE NORMALIZATION 
        const istStartDate = new Date(`${startDate}T00:00:00.000+05:30`);
        if (isNaN(istStartDate.getTime())) {
            return res.status(400).json({ success: false, message: "Invalid Start Date format." });
        }

        const istEndDate = endDate ? new Date(`${endDate}T23:59:59.999+05:30`) : null;
        const queryEndDate = istEndDate || new Date("2099-12-31T23:59:59.999+05:30");

        // 2. EMPLOYEE & LEAVE CHECKS
        const employee = await User.findById(id);
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });

        const overlappingLeave = await LeaveRequest.findOne({
            employee: employee._id,
            status: 'approved',
            fromDate: { $lte: queryEndDate },
            toDate: { $gte: istStartDate }
        });

        if (overlappingLeave) {
            return res.status(400).json({
                success: false,
                message: `Cannot assign schedule. ${employee.name} is on an approved leave.`
            });
        }

        // 3. STRICT MATCH OR FORK LOGIC (No overwriting)
        let school = await School.findOne({
            schoolName: { $regex: new RegExp(`^${schoolName}$`, 'i') },
            address: schoolAddress,
            "location.coordinates": [lng, lat]
        });

        if (!school) {
            school = new School({
                schoolName,
                address: schoolAddress || "No address provided",
                location: { type: 'Point', coordinates: [lng, lat] }
            });
            await school.save();
        }

        // 4. Save exact IST Date Objects to DB
        const newAssignment = {
            school: school._id,
            category,
            startDate: istStartDate,
            endDate: istEndDate,
            startTime,
            endTime,
            allowedDays,
            geofence: { latitude: lat, longitude: lng }
        };

        employee.assignments.push(newAssignment);
        await employee.save();

        // 5. NOTIFICATIONS
        const empMsg = `You have been assigned to ${school.schoolName} for the ${category} shift.`;

        if (await canSendEmailToUser(employee)) {
            sendSchoolAssignmentEmail(employee.email, employee.name, school.schoolName, school.address, category, startDate, startTime)
                .catch(e => console.error("Employee email failed", e));
        }

        const empNotification = await Notification.create({ recipient: employee._id, title: "New School Assignment", message: empMsg, type: "Assignment" });

        if (req.io) {
            req.io.to(employee._id.toString()).emit('new_notification', { _id: empNotification._id, title: empNotification.title, message: empNotification.message, timestamp: empNotification.createdAt });
        }

        const admins = await User.find({ role: 'Admin', _id: { $ne: req.user._id } });
        const adminMsg = `${employee.name} assigned to ${school.schoolName} (${category}).`;

        await Promise.all(admins.map(async (admin) => {
            const adminNotification = await Notification.create({ recipient: admin._id, title: "System Alert: Staff Assigned", message: adminMsg, type: "System" });

            if (req.io) {
                req.io.to(admin._id.toString()).emit('new_notification', { _id: adminNotification._id, title: adminNotification.title, message: adminNotification.message, timestamp: adminNotification.createdAt });
            }
        }));

        res.status(200).json({ success: true, message: "School successfully assigned.", data: newAssignment });

    } catch (error) {
        console.error("Assign School Error:", error);
        res.status(500).json({ success: false, message: "Server error while assigning school." });
    }
});


// ==========================================
// 6. UPDATE ASSIGNMENT (FORK OR LINK FIX)
// ==========================================
adminRouter.put('/employees/:empId/assignments/:assignmentId', userAuth, adminAuth, async (req, res) => {
    try {
        const { empId, assignmentId } = req.params;
        let {
            schoolName, schoolAddress, category, startDate, endDate,
            startTime, endTime, allowedDays, latitude, longitude
        } = req.body;

        if (allowedDays) {
            allowedDays = sortDaysChronologically(allowedDays);
            req.body.allowedDays = allowedDays; // Update req.body too since your update loop uses it
        }

        // 1. INPUT VALIDATION
        if (!startDate || !startTime || !endTime) {
            return res.status(400).json({ success: false, message: "Start Date, Start Time, and End Time are required." });
        }
        if (!Array.isArray(allowedDays)) {
            return res.status(400).json({ success: false, message: "Please enter a valid day" });
        }

        // 2. FETCH EMPLOYEE & POPULATE SCHOOL
        const employee = await User.findById(empId).populate('assignments.school');
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found" });

        const assignment = employee.assignments.id(assignmentId);
        if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });

        // 3. DATE NORMALIZATION (IST) & LEAVE CONFLICT CHECK
        const istStartDate = new Date(`${startDate}T00:00:00.000+05:30`);
        const istEndDate = endDate ? new Date(`${endDate}T23:59:59.999+05:30`) : new Date("2099-12-31T23:59:59.999+05:30");

        const overlappingLeave = await LeaveRequest.findOne({
            employee: employee._id,
            status: 'approved',
            fromDate: { $lte: istEndDate },
            toDate: { $gte: istStartDate }
        });

        if (overlappingLeave) {
            return res.status(400).json({
                success: false,
                message: `${employee.name} is on approved leave from ${new Date(overlappingLeave.fromDate).toDateString()} to ${new Date(overlappingLeave.toDate).toDateString()}.`
            });
        }

        const changes = [];

        // 4. FORK OR LINK SCHOOL UPDATES (No Overwriting Master Data)
        const currentSchool = assignment.school;

        let finalLat = latitude !== undefined && latitude !== '' ? parseFloat(latitude) : currentSchool.location.coordinates[1];
        let finalLng = longitude !== undefined && longitude !== '' ? parseFloat(longitude) : currentSchool.location.coordinates[0];
        let finalSchoolName = schoolName || currentSchool.schoolName;
        let finalAddress = schoolAddress || currentSchool.address;

        if (isNaN(finalLat) || isNaN(finalLng)) {
            return res.status(400).json({ success: false, message: "Invalid coordinates." });
        }
        if (finalLat < 6.0 || finalLat > 38.0 || finalLng < 68.0 || finalLng > 98.0) {
            return res.status(400).json({ success: false, message: "Coordinates must be within India." });
        }

        // Check if physical location details changed
        const isSchoolChanged =
            finalSchoolName !== currentSchool.schoolName ||
            finalAddress !== currentSchool.address ||
            finalLat !== currentSchool.location.coordinates[1] ||
            finalLng !== currentSchool.location.coordinates[0];

        if (isSchoolChanged) {
            let newSchool = await mongoose.model('School').findOne({
                schoolName: { $regex: new RegExp(`^${finalSchoolName}$`, 'i') },
                address: finalAddress,
                "location.coordinates": [finalLng, finalLat]
            });

            if (!newSchool) {
                newSchool = await mongoose.model('School').create({
                    schoolName: finalSchoolName,
                    address: finalAddress,
                    location: { type: 'Point', coordinates: [finalLng, finalLat] }
                });
            }

            assignment.school = newSchool._id;
            // Update local geofence copy
            assignment.geofence = { latitude: finalLat, longitude: finalLng };
            changes.push({ field: "Location Details", oldValue: currentSchool.schoolName, newValue: newSchool.schoolName });
        }

        // 5. UPDATE ASSIGNMENT SUB-DOCUMENT
        const fieldLabels = {
            category: "Category", startTime: "Start Time", endTime: "End Time", allowedDays: "Working Days"
        };

        Object.keys(fieldLabels).forEach(key => {
            if (req.body[key] !== undefined) {
                // Ensure these are scoped correctly to the loop
                const oldVal = assignment[key];
                const newVal = req.body[key];

                if (Array.isArray(oldVal) && Array.isArray(newVal)) {
                    // Sort both before comparing to see if they actually changed
                    const oldSorted = [...oldVal].sort().join(',');
                    const newSorted = [...newVal].sort().join(',');

                    if (oldSorted !== newSorted) {
                        changes.push({ field: fieldLabels[key], oldValue: oldVal.join(', '), newValue: newVal.join(', ') });
                    }
                    assignment[key] = newVal;
                } else if (oldVal !== newVal) {
                    changes.push({ field: fieldLabels[key], oldValue: oldVal, newValue: newVal });
                    assignment[key] = newVal;
                }
            }
        });

        assignment.startDate = istStartDate;
        assignment.endDate = endDate ? istEndDate : null;

        await employee.save();

        // 6. NOTIFICATIONS
        const summary = changes.map(c => c.field).join(', ');
        const notificationMsg = `Schedule for ${finalSchoolName} updated: ${summary}`;

        const notif = await Notification.create({
            recipient: employee._id, title: "Assignment Updated", message: notificationMsg, type: "Assignment"
        });

        if (req.io) {
            req.io.to(employee._id.toString()).emit('new_notification', {
                ...notif._doc, timestamp: new Date()
            });
        }

        res.status(200).json({
            success: true, message: "Assignment updated successfully.", changes: changes
        });

    } catch (error) {
        console.error("Critical Route Error:", error);
        res.status(500).json({ success: false, message: "Server error during update." });
    }
});

// ==========================================
// 7. REVOKE/DELETE ASSIGNMENT
// ==========================================
adminRouter.delete('/employees/:empId/assignments/:assignmentId', userAuth, adminAuth, async (req, res) => {
    try {
        const { empId, assignmentId } = req.params;
        const employee = await User.findById(empId).populate('assignments.school');

        const assignment = employee.assignments.id(assignmentId);
        if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });

        const schoolName = assignment.school.schoolName;
        const schoolAddress = assignment.school.address;
        const category = assignment.category;

        employee.assignments.pull(assignmentId);
        await employee.save();

        const empMsg = `Your assignment at ${schoolName} has been revoked.`;
        const empNotification = await Notification.create({ recipient: employee._id, title: "Assignment Revoked", message: empMsg, type: "Warning" });

        if (req.io) {
            req.io.to(employee._id.toString()).emit('new_notification', { _id: empNotification._id, title: "Assignment Revoked", message: empMsg, timestamp: new Date() });
        }



        if (await canSendEmailToUser(employee)) {
            sendEmployeeAssignmentRevokedEmail(employee.email, employee.name, schoolName, schoolAddress, category).catch(console.error);
        }

        const admins = await User.find({ role: { $in: ['Admin'] }, _id: { $ne: req.user._id } });
        const adminMsg = `${employee.name}'s assignment at ${schoolName} was revoked.`;

        await Promise.all(admins.map(async (admin) => {
            const adminNotif = await Notification.create({ recipient: admin._id, title: "System Alert: Assignment Revoked", message: adminMsg, type: "System" });
            if (req.io) {
                req.io.to(admin._id.toString()).emit('new_notification', { _id: adminNotif._id, title: adminNotif.title, message: adminNotif.message, timestamp: new Date() });
            }
            if (await canSendEmailToUser(admin)) {
                sendAdminAssignmentRevokedEmail(admin.email, admin.name, employee.name, schoolName, schoolAddress, category).catch(console.error);
            }
        }));

        res.status(200).json({ success: true, message: "Assignment revoked." });
    } catch (error) {
        console.error("Delete Assignment Error:", error);
        res.status(500).json({ success: false, message: "Server error deleting assignment." });
    }
});

// ==========================================
// 8. UPDATE EMPLOYEE/ADMIN PROFILE
// ==========================================
adminRouter.put('/employees/:id', userAuth, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, zone, password, role } = req.body;

        const targetUser = await User.findById(id);
        if (!targetUser) return res.status(404).json({ success: false, message: "User not found" });

        // Existing protection: Admins cannot edit SuperAdmins, and standard Admins cannot edit other Admins.
        if (req.user.role === 'Admin' && ['Admin', 'SuperAdmin'].includes(targetUser.role)) {
            return res.status(403).json({ success: false, message: "Permission denied. Admins cannot edit other administrators." });
        }

        if (email && email !== targetUser.email) {
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: "This email address is already in use by another employee."
                });
            }
            targetUser.email = email;
        }

        if (name) targetUser.name = name;
        if (phone) targetUser.mobile = phone;
        if (zone) targetUser.zone = zone;

        // --- SUPERADMIN ONLY ROLE UPDATE LOGIC ---
        // Only attempt to update if the role provided is different from the current role
        if (role && role !== targetUser.role) {
            if (req.user.role !== 'SuperAdmin') {
                return res.status(403).json({
                    success: false,
                    message: "Permission denied. Only SuperAdmins can change account roles."
                });
            }

            // Ensure the role provided is valid
            if (['Employee', 'Admin'].includes(role)) {
                targetUser.role = role;
            }
        }

        if (password && password.trim() !== "") {
            targetUser.password = await bcrypt.hash(password, 10);

            // Device unbind logic
            targetUser.isFirstLogin = true;
            targetUser.deviceId = null;
        }

        await targetUser.save();

        const userNotif = await Notification.create({
            recipient: targetUser._id,
            title: "Profile Updated",
            message: `Your profile details were updated by ${req.user.name}.`,
            type: "System"
        });

        if (req.io) {
            req.io.to(targetUser._id.toString()).emit('new_notification', {
                _id: userNotif._id,
                title: userNotif.title,
                message: userNotif.message,
                timestamp: userNotif.createdAt
            });
        }

        if (await canSendEmailToUser(targetUser)) {
            sendEmployeeProfileUpdatedEmail(targetUser.email, targetUser.name).catch(console.error);
        }

        const admins = await User.find({
            role: { $in: ['Admin'] },
            _id: { $ne: req.user._id }
        });

        await Promise.all(admins.map(async (admin) => {
            const auditNotif = await Notification.create({
                recipient: admin._id,
                title: "Audit: Profile Modified",
                message: `${req.user.name} updated the profile of ${targetUser.name}.`,
                type: "System"
            });

            if (req.io) {
                req.io.to(admin._id.toString()).emit('new_notification', auditNotif);
            }

            if (await canSendEmailToUser(admin)) {
                sendAdminAuditEmail(admin.email, targetUser.name, "UPDATED", req.user.name).catch(console.error);
            }
        }));

        const data = await User.findById(id).select('-password').populate('assignments.school');
        res.status(200).json({ success: true, message: "Profile updated successfully.", data });

    } catch (error) {
        console.error("Update Profile Error:", error);
        res.status(500).json({ success: false, message: "Server error while updating profile." });
    }
});

// ==========================================
// 9. DELETE EMPLOYEE/ADMIN
// ==========================================
adminRouter.delete('/employees/:id', userAuth, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const userToDelete = await User.findById(id);

        if (!userToDelete) return res.status(404).json({ success: false, message: "User not found." });

        if (userToDelete._id.toString() === req.user._id.toString()) {
            return res.status(400).json({ success: false, message: "You cannot delete your own account." });
        }
        if (userToDelete.role === 'SuperAdmin') {
            return res.status(403).json({ success: false, message: "SuperAdmin accounts cannot be deleted." });
        }
        if (req.user.role === 'Admin' && userToDelete.role === 'Admin') {
            return res.status(403).json({ success: false, message: "Permission denied. Only SuperAdmins can delete Admin accounts." });
        }

        const deletedName = userToDelete.name;
        const deletedEmail = userToDelete.email;


        const shouldNotifyDeletedUser = await canSendEmailToUser(userToDelete);

        await User.findByIdAndDelete(id);
        await Notification.deleteMany({ recipient: id });

        if (shouldNotifyDeletedUser) {
            sendEmployeeProfileDeletedEmail(deletedEmail, deletedName).catch(console.error);
        }

        const admins = await User.find({
            role: { $in: ['Admin'] },
            _id: { $ne: req.user._id }
        });

        await Promise.all(admins.map(async (admin) => {
            const deleteNotif = await Notification.create({
                recipient: admin._id,
                title: "Security Alert: Account Deleted",
                message: `The account for ${deletedName} was permanently deleted by ${req.user.name}.`,
                type: "Warning"
            });

            if (req.io) {
                req.io.to(admin._id.toString()).emit('new_notification', deleteNotif);
            }

            if (await canSendEmailToUser(admin)) {
                sendAdminAuditEmail(admin.email, deletedName, "DELETED", req.user.name).catch(console.error);
            }
        }));

        res.status(200).json({ success: true, message: `${deletedName} deleted. Audit logs sent to administrators.` });

    } catch (error) {
        console.error("Delete User Error:", error);
        res.status(500).json({ success: false, message: "Server error while deleting user." });
    }
});

// ==========================================
// 10. ASSIGN TASK TO EMPLOYEE (STRICT MATCH)
// ==========================================
adminRouter.post('/employees/:id/assign-task', userAuth, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        let {
            schoolName, schoolAddress, latitude, longitude,
            taskDescription, category, daysAllotted,
            startDate, endDate, startTime, endTime
        } = req.body;

        if (daysAllotted) daysAllotted = sortDaysChronologically(daysAllotted);

        const employee = await User.findById(id);
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });

        // 1. DATE NORMALIZATION (IST BOUNDARIES)
        const istStartDate = new Date(`${startDate}T00:00:00.000+05:30`);
        const istEndDate = endDate ? new Date(`${endDate}T23:59:59.999+05:30`) : new Date("2099-12-31T23:59:59.999+05:30");

        // 2. LEAVE RESTRICTION CHECK
        const activeLeave = await LeaveRequest.findOne({
            employee: employee._id, status: 'approved',
            fromDate: { $lte: istEndDate }, toDate: { $gte: istStartDate }
        });

        if (activeLeave) {
            return res.status(400).json({
                success: false,
                message: `Cannot assign task. ${employee.name} is on approved leave from ${new Date(activeLeave.fromDate).toDateString()} to ${new Date(activeLeave.toDate).toDateString()}.`
            });
        }

        // 3. GEOJSON LOCATION SETUP & STRICT MATCH
        let lat = null;
        let lng = null;
        if (latitude && longitude) {
            lat = parseFloat(latitude);
            lng = parseFloat(longitude);

            if (isNaN(lat) || isNaN(lng)) {
                return res.status(400).json({ success: false, message: "Invalid geofence coordinates provided." });
            }
            if (lat < 6.0 || lat > 38.0 || lng < 68.0 || lng > 98.0) {
                return res.status(400).json({ success: false, message: "Coordinates must be located within India." });
            }
        }

        // STRICT MATCH: Name, Address, and Coordinates
        let school = await School.findOne({
            schoolName: { $regex: new RegExp(`^${schoolName}$`, 'i') },
            address: schoolAddress || "No address provided",
            ...(lat && lng ? { "location.coordinates": [lng, lat] } : {})
        });

        if (!school) {
            if (lat === null || lng === null) {
                return res.status(400).json({ success: false, message: "Coordinates are required to create a new school." });
            }
            school = new School({
                schoolName,
                address: schoolAddress || "No address provided",
                location: { type: 'Point', coordinates: [lng, lat] }
            });
            await school.save();
        }

        // 4. CREATE TASK 
        const newTask = await Task.create({
            teacher: id, school: school._id, taskDescription,
            category: category || "Junior Band", daysAllotted,
            startDate: istStartDate, endDate: endDate ? istEndDate : null,
            startTime, endTime, status: 'Pending'
        });

        const populatedTask = await Task.findById(newTask._id).populate('school');

        // 5. NOTIFICATIONS AND EMAILS
        const taskTitle = `Assignment at ${school.schoolName}`;
        const format12H = (time) => {
            if (!time) return "";
            const [h, m] = time.split(':');
            let hr = parseInt(h);
            const ampm = hr >= 12 ? 'PM' : 'AM';
            hr = hr % 12 || 12;
            return `${hr < 10 ? '0' + hr : hr}:${m} ${ampm}`;
        };
        const scheduleString = `${daysAllotted.join(', ')} (${format12H(startTime)} - ${format12H(endTime)})`;

        if (await canSendEmailToUser(employee)) {
            sendEmployeeTaskAssignedEmail(employee.email, employee.name, taskTitle, taskDescription, scheduleString, category);
        }

        const empNotif = await Notification.create({ recipient: employee._id, title: "New Task Assigned", message: `You have a new task at ${school.schoolName}.`, type: "Assignment" });
        if (req.io) req.io.to(employee._id.toString()).emit('new_notification', empNotif);

        const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] }, _id: { $ne: req.user._id } });
        const detailsHtml = `
            <div class="card-item"><span class="label">Description</span><div class="value" style="font-weight: 400;">${taskDescription}</div></div>
            <div class="card-item"><span class="label">Schedule</span><div class="value">${scheduleString}</div></div>
        `;

        await Promise.all(admins.map(async (admin) => {
            if (await canSendEmailToUser(admin)) {
                sendAdminTaskAuditEmail(admin.email, admin.name, employee.name, taskTitle, "ASSIGNED", detailsHtml);
            }
            const adminNotif = await Notification.create({ recipient: admin._id, title: "System Alert: Task Assigned", message: `${employee.name} was assigned a task at ${school.schoolName}.`, type: "System" });
            if (req.io) req.io.to(admin._id.toString()).emit('new_notification', adminNotif);
        }));

        res.status(200).json({ success: true, message: "Task assigned successfully.", data: populatedTask });
    } catch (error) {
        console.error("Assign Task Error:", error);
        res.status(500).json({ success: false, message: "Server error assigning task." });
    }
});

// ==========================================
// 11. UPDATE TASK (FORK OR LINK FIX)
// ==========================================
adminRouter.put('/tasks/:taskId', userAuth, adminAuth, async (req, res) => {
    try {
        const { taskId } = req.params;
        let {
            schoolName, schoolAddress, latitude, longitude,
            taskDescription, category, startDate, endDate, startTime, endTime, daysAllotted, status
        } = req.body;

        if (daysAllotted) {
            daysAllotted = sortDaysChronologically(daysAllotted);
            req.body.daysAllotted = daysAllotted;
        }

        const task = await Task.findById(taskId).populate('school').populate('teacher');
        if (!task) return res.status(404).json({ success: false, message: "Task not found." });

        const employee = task.teacher;
        const changes = [];

        // Helper to format dates cleanly for notification logs
        const getISTDateString = (dateObj) => {
            if (!dateObj) return null;
            return new Date(dateObj).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        };

        // 1. DATE NORMALIZATION & LEAVE RESTRICTION CHECK 
        let istStartDate, istEndDate;
        if (startDate) {
            istStartDate = new Date(`${startDate}T00:00:00.000+05:30`);
            istEndDate = endDate ? new Date(`${endDate}T23:59:59.999+05:30`) : new Date("2099-12-31T23:59:59.999+05:30");
        } else {
            const todayStr = getISTDateString(new Date());
            istStartDate = new Date(`${todayStr}T00:00:00.000+05:30`);
            istEndDate = new Date(`${todayStr}T23:59:59.999+05:30`);
        }

        const activeLeave = await LeaveRequest.findOne({
            employee: employee._id, status: 'approved',
            fromDate: { $lte: istEndDate }, toDate: { $gte: istStartDate }
        });

        if (activeLeave && !status) {
            return res.status(400).json({
                success: false,
                message: `Cannot update task details. ${employee.name} is currently on an approved leave.`
            });
        }

        // 2. FORK OR LINK SCHOOL UPDATES (Gracefully handles missing subdocuments/coordinates)
        const currentSchool = task.school;
        const oldLat = currentSchool?.location?.coordinates?.[1];
        const oldLng = currentSchool?.location?.coordinates?.[0];

        let finalLat = latitude !== undefined && latitude !== '' ? parseFloat(latitude) : oldLat;
        let finalLng = longitude !== undefined && longitude !== '' ? parseFloat(longitude) : oldLng;
        let finalSchoolName = schoolName || currentSchool.schoolName;
        let finalAddress = schoolAddress || currentSchool.address;

        if (finalLat !== undefined && finalLng !== undefined) {
            if (isNaN(finalLat) || isNaN(finalLng)) {
                return res.status(400).json({ success: false, message: "Invalid geofence coordinates provided." });
            }
            if (finalLat < 6.0 || finalLat > 38.0 || finalLng < 68.0 || finalLng > 98.0) {
                return res.status(400).json({ success: false, message: "Coordinates must be located within India." });
            }
        }

        const isSchoolChanged =
            finalSchoolName !== currentSchool.schoolName ||
            finalAddress !== currentSchool.address ||
            finalLat !== oldLat ||
            finalLng !== oldLng;

        if (isSchoolChanged) {
            let newSchool = await mongoose.model('School').findOne({
                schoolName: { $regex: new RegExp(`^${finalSchoolName}$`, 'i') },
                address: finalAddress,
                ...(finalLat && finalLng ? { "location.coordinates": [finalLng, finalLat] } : {})
            });

            if (!newSchool) {
                newSchool = await mongoose.model('School').create({
                    schoolName: finalSchoolName,
                    address: finalAddress,
                    ...(finalLat && finalLng ? { location: { type: 'Point', coordinates: [finalLng, finalLat] } } : {})
                });
            }

            task.school = newSchool._id;
            changes.push({ field: "Location Details", oldValue: currentSchool.schoolName, newValue: newSchool.schoolName });
        }

        // 3. PROCESS TASK UPDATES
        const fieldLabels = {
            taskDescription: "Description", category: "Category",
            startTime: "Start Time", endTime: "End Time", status: "Status"
        };

        Object.keys(fieldLabels).forEach(key => {
            if (req.body[key] !== undefined) {
                let oldVal = task[key];
                let newVal = req.body[key];
                if (oldVal !== newVal) {
                    changes.push({ field: fieldLabels[key], oldValue: oldVal || 'Not Set', newValue: newVal || 'Removed' });
                    task[key] = newVal;
                }
            }
        });

        // Track and log explicit Date changes to guarantee triggers occur
        if (startDate && (!task.startDate || task.startDate.getTime() !== istStartDate.getTime())) {
            changes.push({ field: "Start Date", oldValue: task.startDate ? getISTDateString(task.startDate) : "Not Set", newValue: startDate });
            task.startDate = istStartDate;
        }

        if (endDate !== undefined) {
            const newEndDateObj = endDate ? new Date(`${endDate}T23:59:59.999+05:30`) : null;
            if ((task.endDate?.getTime() || null) !== (newEndDateObj?.getTime() || null)) {
                changes.push({ field: "End Date", oldValue: task.endDate ? getISTDateString(task.endDate) : "Ongoing", newValue: endDate || "Ongoing" });
                task.endDate = newEndDateObj;
            }
        }

        // Track Days Allotted changes cleanly without mutating the live schema array directly
        if (daysAllotted && Array.isArray(daysAllotted)) {
            const oldDaysStr = (task.daysAllotted || []).slice().sort().join(',');
            const newDaysStr = daysAllotted.slice().sort().join(',');
            if (oldDaysStr !== newDaysStr) {
                changes.push({ field: "Days Allotted", oldValue: oldDaysStr || "None", newValue: newDaysStr || "None" });
                task.daysAllotted = daysAllotted;
            }
        }

        if (req.body.status && req.body.status !== 'Rejected') {
            task.rejectReason = null;
        }

        if (changes.length === 0) {
            return res.status(200).json({ success: true, message: "No changes made." });
        }

        await task.save();

        // 3.5 SYNC TO MIRRORED ASSIGNMENT ARRAY 
        if (task.status === 'Accepted' || req.body.status === 'Accepted') {
            const employeeDoc = await User.findById(employee._id);
            if (employeeDoc && employeeDoc.assignments) {
                const mirroredAssignmentIndex = employeeDoc.assignments.findIndex(
                    a => a.referenceTaskId && a.referenceTaskId.toString() === task._id.toString()
                );

                if (mirroredAssignmentIndex !== -1) {
                    const mirrored = employeeDoc.assignments[mirroredAssignmentIndex];

                    if (startDate) mirrored.startDate = istStartDate;
                    if (endDate !== undefined) mirrored.endDate = task.endDate;
                    if (startTime) mirrored.startTime = startTime;
                    if (endTime) mirrored.endTime = endTime;
                    if (daysAllotted) mirrored.allowedDays = daysAllotted;
                    if (category) mirrored.category = category;

                    if (isSchoolChanged) {
                        mirrored.school = task.school;
                        if (finalLat && finalLng) mirrored.geofence = { latitude: finalLat, longitude: finalLng };
                    }

                    await employeeDoc.save();
                }
            }
        }

        // 4. NOTIFICATIONS & EMAILS (Triggers in real-time)
        const changeSummary = changes.map(c => c.field).join(', ');
        const displaySchoolName = finalSchoolName;
        const taskTitle = `Assignment at ${displaySchoolName}`;

        if (await canSendEmailToUser(employee)) {
            const formattedTask = {
                description: task.taskDescription || 'N/A',
                dueDate: `${(task.daysAllotted || []).join(', ')} (${task.startTime || ''} - ${task.endTime || ''})`,
                status: task.status,
                rejectionReason: task.rejectReason || ''
            };
            sendEmployeeTaskUpdatedEmail(employee.email, employee.name, taskTitle, changes, formattedTask).catch(err => console.error("Email send failed", err));
        }

        const empNotif = await Notification.create({ recipient: employee._id, title: "Task Updated", message: `Your task at ${displaySchoolName} was updated (${changeSummary}).`, type: "Updation" });
        if (req.io) {
            req.io.to(employee._id.toString()).emit('new_notification', empNotif);
        }

        const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] }, _id: { $ne: req.user._id } });
        const detailsHtml = changes.map(c => `
             <div class="card-item" style="padding-top: 8px; border-top: 1px solid #e4e4e7;">
                <span class="label">${c.field} Changed</span>
                <div class="value" style="font-weight: 400; color: #52525b;">From: <span style="text-decoration: line-through;">${c.oldValue}</span></div>
                <div class="value">To: ${c.newValue}</div>
             </div>
        `).join('');

        await Promise.all(admins.map(async (admin) => {
            if (await canSendEmailToUser(admin)) {
                sendAdminTaskAuditEmail(admin.email, admin.name, employee.name, taskTitle, "UPDATED", detailsHtml).catch(err => console.error("Admin Email failed", err));
            }
            const adminNotif = await Notification.create({ recipient: admin._id, title: "System Alert: Task Updated", message: `${req.user.name} updated a task for ${employee.name}.`, type: "System" });
            if (req.io) req.io.to(admin._id.toString()).emit('new_notification', adminNotif);
        }));

        res.status(200).json({ success: true, message: "Task updated.", data: task });
    } catch (error) {
        console.error("Update Task Error:", error);
        res.status(500).json({ success: false, message: "Server error updating task." });
    }
});

// ==========================================
// 12. DELETE / REVOKE TASK
// ==========================================
adminRouter.delete('/tasks/:taskId', userAuth, adminAuth, async (req, res) => {
    try {
        const { taskId } = req.params;
        const task = await Task.findById(taskId).populate('school').populate('teacher');

        if (!task) return res.status(404).json({ success: false, message: "Task not found." });

        const employee = task.teacher;
        const taskTitle = `Assignment at ${task.school.schoolName}`;

        // 1. Delete the task document
        await Task.findByIdAndDelete(taskId);

        // --- NEW: Remove the mirrored task from the employee's assignments array ---
        await User.updateOne(
            { _id: employee._id },
            { $pull: { assignments: { referenceTaskId: taskId } } }
        );

        if (await canSendEmailToUser(employee)) {
            sendEmployeeTaskRevokedEmail(employee.email, employee.name, taskTitle);
        }

        const empNotif = await Notification.create({
            recipient: employee._id,
            title: "Task Revoked",
            message: `The task "${taskTitle}" has been removed from your schedule.`,
            type: "System"
        });

        if (req.io) req.io.to(employee._id.toString()).emit('new_notification', empNotif);

        const admins = await User.find({ role: { $in: ['Admin'] }, _id: { $ne: req.user._id } });

        const detailsHtml = `
            <div class="card-item"><span class="label" style="color: #dc2626;">Notice</span><div class="value" style="font-weight: 400;">This task was permanently deleted.</div></div>
        `;

        await Promise.all(admins.map(async (admin) => {
            if (await canSendEmailToUser(admin)) {
                sendAdminTaskAuditEmail(admin.email, admin.name, employee.name, taskTitle, "DELETED", detailsHtml);
            }

            const adminNotif = await Notification.create({
                recipient: admin._id,
                title: "System Alert: Task Deleted",
                message: `${req.user.name} deleted a task for ${employee.name}.`,
                type: "System"
            });

            if (req.io) req.io.to(admin._id.toString()).emit('new_notification', adminNotif);
        }));

        res.status(200).json({ success: true, message: "Task revoked successfully." });
    } catch (error) {
        console.error("Delete Task Error:", error);
        res.status(500).json({ success: false, message: "Server error deleting task." });
    }
});

// ==========================================
// 14. ISSUE WARNING TO EMPLOYEE
// ==========================================
adminRouter.post('/employees/:id/warnings', userAuth, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { level, reason } = req.body;

        const employee = await User.findById(id);
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });

        const newWarning = await Warning.create({
            teacher: employee._id,
            issuedBy: req.user._id,
            level,
            reason
        });

        await newWarning.populate('issuedBy', 'name');

        const empMsg = `You have been issued a ${level} Warning by Administration.`;


        if (await canSendEmailToUser(employee)) {
            sendEmployeeWarningEmail(employee.email, employee.name, level, reason, req.user.name);
        }

        const empNotif = await Notification.create({
            recipient: employee._id,
            title: `${level} Warning Issued`,
            message: empMsg,
            type: "Warning",
            level: level,
            reason: reason
        });

        if (req.io) req.io.to(employee._id.toString()).emit('new_notification', empNotif);

        const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] }, _id: { $ne: req.user._id } });

        await Promise.all(admins.map(async (admin) => {
            if (await canSendEmailToUser(admin)) {
                sendAdminWarningAuditEmail(admin.email, admin.name, employee.name, level, reason, req.user.name);
            }

            const adminNotif = await Notification.create({
                recipient: admin._id,
                title: "Audit: Warning Issued",
                message: `${req.user.name} issued a ${level} warning to ${employee.name}.`,
                type: "System",
                level: level,
                reason: reason
            });

            if (req.io) req.io.to(admin._id.toString()).emit('new_notification', adminNotif);
        }));

        res.status(200).json({ success: true, message: "Warning issued successfully.", data: newWarning });

    } catch (error) {
        console.error("Issue Warning Error:", error);
        res.status(500).json({ success: false, message: "Server error issuing warning." });
    }
});

// ==========================================
// 15. GET EMPLOYEE ATTENDANCE (HIERARCHICAL & TIMEZONE FIXED) 
// ==========================================
adminRouter.get('/employees/:id/attendance', userAuth, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const employee = await User.findById(id);
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });

        // 1. Fetch Attendance & Reports
        const attendances = await Attendance.find({ teacher: id })
            .populate('school', 'schoolName')
            .sort({ date: -1 })
            .lean();

        const dailyReports = await DailyReports.find({ teacher: id }).lean();

        // 2. Fetch Approved Leaves
        const leaves = await LeaveRequest.find({ employee: id, status: 'approved' }).lean();

        const monthMap = new Map();

        // --- THE FIX: Force Asia/Kolkata Timezone ---
        const formatTime = (dateString) => {
            if (!dateString) return "-";
            return new Date(dateString).toLocaleTimeString('en-US', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        const getISTPart = (dateObj, options) => {
            return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', ...options }).format(dateObj);
        };

        // --- HELPER: Ensure Month Exists (Timezone Safe) ---
        const getOrCreateMonth = (dateObj) => {
            const year = getISTPart(dateObj, { year: 'numeric' });
            const monthName = getISTPart(dateObj, { month: 'long' });
            const monthNum = getISTPart(dateObj, { month: 'numeric' });

            const monthKey = `${year}-${monthNum}`;
            const formattedMonth = `${monthName} ${year}`;

            if (!monthMap.has(monthKey)) {
                monthMap.set(monthKey, {
                    id: monthKey,
                    month: formattedMonth,
                    schoolsMap: new Map()
                });
            }
            return monthMap.get(monthKey);
        };

        // 3. Process Attendances
        attendances.forEach(att => {
            const schoolName = att.school ? att.school.schoolName : "Unknown/Deleted School";
            const schoolId = att.school ? att.school._id.toString() : "deleted-school";

            const dateObj = new Date(att.date);
            const year = getISTPart(dateObj, { year: 'numeric' });

            const monthObj = getOrCreateMonth(dateObj);

            if (!monthObj.schoolsMap.has(schoolId)) {
                monthObj.schoolsMap.set(schoolId, { id: schoolId, name: schoolName, categoriesMap: new Map() });
            }
            const schoolObj = monthObj.schoolsMap.get(schoolId);

            const categoryName = att.band || "Uncategorized";
            const categoryId = `${schoolId}-${categoryName}`;

            if (!schoolObj.categoriesMap.has(categoryId)) {
                schoolObj.categoriesMap.set(categoryId, {
                    id: categoryId, name: categoryName, recordCount: 0,
                    metrics: { present: 0, late: 0, absent: 0, events: 0, holidays: 0, mediaSent: 0 },
                    records: []
                });
            }
            const catObj = schoolObj.categoriesMap.get(categoryId);

            catObj.recordCount++;
            const statusUpper = (att.status || "UNKNOWN").toUpperCase();
            if (statusUpper === 'PRESENT' || statusUpper === 'CHECKED OUT') catObj.metrics.present++;
            else if (statusUpper === 'LATE') catObj.metrics.late++;
            else if (statusUpper === 'ABSENT') catObj.metrics.absent++;
            else if (statusUpper === 'HOLIDAY') catObj.metrics.holidays++;
            else if (statusUpper === 'EVENT') catObj.metrics.events++;

            // Use IST for exact day names and dates
            const dayName = getISTPart(dateObj, { weekday: 'short' });
            const dayNum = getISTPart(dateObj, { day: '2-digit' });
            const shortMonth = getISTPart(dateObj, { month: 'short' });

            const displayNote = att.teacherNote || att.lateReason || att.eventNote || null;
            const reportForDay = dailyReports.find(report => report.date === att.date);

            catObj.records.push({
                id: att._id.toString(),
                date: `${shortMonth} ${dayNum}, ${year} (${dayName})`,
                rawDate: att.date,
                time: formatTime(att.checkInTime) || "-",
                status: statusUpper,
                checkIn: formatTime(att.checkInTime),
                checkOut: formatTime(att.checkOutTime),
                hasReport: !!reportForDay,
                dailyReport: reportForDay || null,
                teacherNote: att.teacherNote,
                lateReason: att.lateReason,
                note: displayNote ? `"${displayNote}"` : null
            });
        });

        // 4. Process Leaves (Injects into the monthly hierarchy)
        leaves.forEach(leave => {
            const dateObj = new Date(leave.fromDate);
            const monthObj = getOrCreateMonth(dateObj);

            const schoolId = 'LEAVES_GENERAL';
            if (!monthObj.schoolsMap.has(schoolId)) {
                monthObj.schoolsMap.set(schoolId, { id: schoolId, name: 'General Leaves', isLeaveNode: true, categoriesMap: new Map() });
            }
            const schoolObj = monthObj.schoolsMap.get(schoolId);

            const categoryId = 'LEAVES_DETAIL';
            if (!schoolObj.categoriesMap.has(categoryId)) {
                schoolObj.categoriesMap.set(categoryId, {
                    id: categoryId, name: 'Approved Leaves', isLeaveNode: true, recordCount: 0, records: []
                });
            }
            const catObj = schoolObj.categoriesMap.get(categoryId);

            catObj.recordCount++;

            const fromStr = getISTDateString(dateObj);
            const toStr = getISTDateString(new Date(leave.toDate));

            const daysDiff = Math.round((new Date(leave.toDate) - dateObj) / (1000 * 60 * 60 * 24)) + 1;

            catObj.records.push({
                id: leave._id.toString(),
                isLeaveRecord: true,
                date: fromStr === toStr ? fromStr : `${fromStr} to ${toStr}`,
                leaveDays: daysDiff,
                status: 'ON LEAVE',
                reason: leave.reason,
                adminRemarks: leave.adminRemarks
            });
        });

        const hierarchicalData = Array.from(monthMap.values()).map(m => ({
            id: m.id,
            month: m.month,
            schools: Array.from(m.schoolsMap.values()).map(s => ({
                id: s.id,
                name: s.name,
                isLeaveNode: s.isLeaveNode,
                categories: Array.from(s.categoriesMap.values())
            }))
        }));

        res.status(200).json({ success: true, data: hierarchicalData });

    } catch (error) {
        console.error("Fetch Hierarchical Attendance Error:", error);
        res.status(500).json({ success: false, message: "Server error fetching attendance data." });
    }
});

// ==========================================
// 16. GET Daily Feed
// ==========================================
adminRouter.get('/daily-feed', async (req, res) => {
    try {
        const status = req.query.status || 'active';
        const feedData = await fetchDailyFeedData(status);

        res.status(200).json({
            success: true,
            count: feedData.length,
            data: feedData
        });

    } catch (error) {
        console.error("Error fetching daily feed:", error);
        res.status(500).json({ success: false, message: "Server Error fetching feed" });
    }
});

// ==========================================
// 17. GET Admin Dashboard (INTERACTIVE SHIFT LOGIC)
// ==========================================
adminRouter.get('/dashboard-stats', userAuth, adminAuth, async (req, res) => {
    try {
        const dateString = getISTDateString();
        const currentDayName = getISTDayOfWeek();

        const todayStart = new Date(`${dateString}T00:00:00.000+05:30`);
        const todayEnd = new Date(`${dateString}T23:59:59.999+05:30`);

        // 1. Total Staff (Unique Employees) - NOW POPULATING SCHOOL TO GET NAMES LATER
        const employees = await User.find({ role: 'Employee', isActive: true }).populate('assignments.school', 'schoolName');
        const totalEmployees = employees.length;

        // 2. Fetch Active Leaves & Holidays
        const activeLeaves = await LeaveRequest.find({
            status: 'approved',
            fromDate: { $lte: todayEnd },
            toDate: { $gte: todayStart }
        });
        const usersOnLeaveMap = new Map(activeLeaves.map(leave => [leave.employee.toString(), leave.reason || 'Approved Leave']));

        const activeSchoolHolidays = await SchoolHoliday.find({
            startDate: { $lte: todayEnd },
            endDate: { $gte: todayStart }
        });

        // 3. Fetch Today's Attendance Records
        const todaysAttendance = await Attendance.find({ date: dateString })
            .populate('teacher', 'name zone profilePicture')
            .populate('school', 'schoolName address')
            .sort({ updatedAt: -1 });

        const recentLeaves = await LeaveRequest.find({
            updatedAt: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) }
        }).populate('employee', 'name zone profilePicture').sort({ updatedAt: -1 });

        // --- NEW DETAILED SHIFT LISTS ---
        const lists = { completed: [], present: [], noShow: [], holiday: [], leave: [], pending: [] };
        const processedShifts = new Set();

        const formatTimeIST = (dateObj) => {
            if (!dateObj) return '-';
            return new Date(dateObj).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
        };

        // STEP A: Tally actual attendance records first
        todaysAttendance.forEach(record => {
            const empIdStr = record.teacher ? record.teacher._id.toString() : 'unknown';
            const schoolIdStr = record.school ? record.school._id.toString() : 'unknown';
            const band = (record.band || 'General').toLowerCase().trim();
            const shiftKey = `${empIdStr}_${schoolIdStr}_${band}`;
            processedShifts.add(shiftKey);

            const status = (record.status || '').toUpperCase();

            // Find scheduled times from assignments
            let schedStart = '-';
            let schedEnd = '-';
            const empDoc = employees.find(e => e._id.toString() === empIdStr);
            if (empDoc && empDoc.assignments) {
                const assign = empDoc.assignments.find(a => a.school && a.school._id.toString() === schoolIdStr && (a.category || 'General').toLowerCase().trim() === band);
                if (assign) {
                    schedStart = assign.startTime || '-';
                    schedEnd = assign.endTime || '-';
                }
            }

            // Extract exact reason
            let reason = '-';
            if (status === 'LATE' && record.lateReason) reason = record.lateReason;
            else if (status === 'EVENT' && record.eventNote) reason = record.eventNote;
            else if (record.teacherNote) reason = record.teacherNote;

            const shiftDetail = {
                id: record._id,
                employeeName: record.teacher?.name || 'Unknown',
                profilePicture: record.teacher?.profilePicture || null,
                schoolName: record.school?.schoolName || 'Unknown School',
                category: record.band || 'General',
                scheduledStart: schedStart,
                scheduledEnd: schedEnd,
                actualStart: formatTimeIST(record.checkInTime),
                actualEnd: formatTimeIST(record.checkOutTime),
                status: status,
                reason: reason
            };

            if (['PRESENT', 'LATE', 'EVENT'].includes(status)) {
                if (record.checkOutTime) lists.completed.push(shiftDetail);
                else lists.present.push(shiftDetail);
            } else if (status === 'ABSENT') {
                lists.noShow.push(shiftDetail);
            } else if (status === 'HOLIDAY') {
                lists.holiday.push(shiftDetail);
            } else if (status === 'LEAVE') {
                shiftDetail.reason = usersOnLeaveMap.get(empIdStr) || 'Approved Leave';
                lists.leave.push(shiftDetail);
            }
        });

        // STEP B: Evaluate all remaining expected assignments (Pending, Leaves, Holidays)
        employees.forEach(emp => {
            if (!emp.assignments || emp.assignments.length === 0) return;
            const empIdStr = emp._id.toString();

            emp.assignments.forEach(assign => {
                if (!assign.school) return;

                const schoolIdStr = assign.school._id.toString();
                const band = (assign.category || 'General').toLowerCase().trim();
                const shiftKey = `${empIdStr}_${schoolIdStr}_${band}`;

                if (processedShifts.has(shiftKey)) return;

                const assignmentStartDate = assign.startDate ? new Date(assign.startDate) : assign._id.getTimestamp();
                const assignStartStr = getISTDateString(assignmentStartDate);
                const isAfterStartDate = dateString >= assignStartStr;

                let isBeforeEndDate = true;
                if (assign.endDate) {
                    const assignEndStr = getISTDateString(new Date(assign.endDate));
                    isBeforeEndDate = dateString <= assignEndStr;
                }

                if (isAfterStartDate && isBeforeEndDate && assign.allowedDays.includes(currentDayName)) {

                    const shiftDetail = {
                        id: shiftKey,
                        employeeName: emp.name,
                        profilePicture: emp.profilePicture || null,
                        schoolName: assign.school.schoolName || 'Unknown School',
                        category: assign.category || 'General',
                        scheduledStart: assign.startTime || '-',
                        scheduledEnd: assign.endTime || '-',
                        actualStart: '-',
                        actualEnd: '-',
                        status: 'PENDING',
                        reason: '-'
                    };

                    if (usersOnLeaveMap.has(empIdStr)) {
                        shiftDetail.status = 'LEAVE';
                        shiftDetail.reason = usersOnLeaveMap.get(empIdStr);
                        lists.leave.push(shiftDetail);
                    } else {
                        const isSchoolHoliday = activeSchoolHolidays.some(holiday => {
                            const isSchoolMatch = holiday.affectedSchools.length === 0 || holiday.affectedSchools.map(id => id.toString()).includes(schoolIdStr);
                            const isCategoryMatch = holiday.category === 'All' || assign.category === holiday.category;
                            return isSchoolMatch && isCategoryMatch;
                        });

                        if (isSchoolHoliday) {
                            shiftDetail.status = 'HOLIDAY';
                            shiftDetail.reason = 'School Holiday';
                            lists.holiday.push(shiftDetail);
                        } else {
                            lists.pending.push(shiftDetail);
                        }
                    }
                }
            });
        });

        // 4. Format Activity Feed
        const attendanceActivity = todaysAttendance.map(att => {
            const diffMins = Math.round((new Date() - new Date(att.updatedAt)) / 60000);
            const statusUpper = (att.status || '').toUpperCase();

            let actionText = "Status Updated";
            if (att.checkOutTime) actionText = "Checked Out";
            else if (statusUpper === 'PRESENT') actionText = "Checked In";
            else if (statusUpper === 'LATE') actionText = "Late Check-in";
            else if (statusUpper === 'ABSENT') actionText = "Marked Absent";
            else if (statusUpper === 'HOLIDAY') actionText = "Marked Holiday";
            else if (statusUpper === 'EVENT') actionText = "Added Event Note";

            let displayTime = att.updatedAt;
            if (att.checkOutTime) displayTime = att.checkOutTime;
            else if (statusUpper === 'PRESENT' || statusUpper === 'LATE') displayTime = att.checkInTime || att.updatedAt;

            return {
                id: att._id,
                name: att.teacher?.name || "Unknown Staff",
                profilePicture: att.teacher?.profilePicture || null,
                zone: att.teacher?.zone || "N/A",
                school: att.school?.schoolName || "Unknown School",
                category: att.band || "General",
                action: actionText,
                time: new Date(displayTime).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
                timeAgo: diffMins < 1 ? "Just now" : diffMins < 60 ? `${diffMins}m ago` : `${Math.floor(diffMins / 60)}h ago`,
                status: att.status,
                sortTimestamp: att.updatedAt
            };
        });

        const leaveActivity = recentLeaves.map(leave => {
            const diffMins = Math.round((new Date() - new Date(leave.updatedAt)) / 60000);
            let actionText = "Leave Requested";
            if (leave.status === 'approved') actionText = "Leave Approved";
            if (leave.status === 'rejected') actionText = "Leave Denied";

            return {
                id: leave._id,
                name: leave.employee?.name || "Unknown Staff",
                profilePicture: leave.employee?.profilePicture || null,
                zone: leave.employee?.zone || "N/A",
                leaveRange: `${new Date(leave.fromDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - ${new Date(leave.toDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`,
                category: "Leave Request",
                action: actionText,
                time: new Date(leave.updatedAt).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
                timeAgo: diffMins < 1 ? "Just now" : diffMins < 60 ? `${diffMins}m ago` : `${Math.floor(diffMins / 60)}h ago`,
                status: leave.status === 'approved' ? 'Approved' : leave.status === 'rejected' ? 'Rejected' : 'Pending',
                sortTimestamp: leave.updatedAt
            };
        });

        const combinedActivity = [...attendanceActivity, ...leaveActivity]
            .sort((a, b) => new Date(b.sortTimestamp) - new Date(a.sortTimestamp))
            .slice(0, 15);

        res.json({
            success: true,
            data: {
                stats: {
                    totalEmployees,
                    completedToday: lists.completed.length,
                    presentToday: lists.present.length,
                    noShow: lists.noShow.length,
                    onLeaveToday: lists.leave.length,
                    onHolidayToday: lists.holiday.length,
                    pending: lists.pending.length
                },
                lists: lists, // EXPOSING THE ARRAYS TO THE FRONTEND
                recentActivity: combinedActivity
            }
        });

    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        res.status(500).json({ success: false, message: "Error fetching dashboard data" });
    }
});

// ==========================================
// 18. UPDATE ACCOUNT SETTINGS (NEW ROUTE)
// ==========================================
adminRouter.put('/settings/global', userAuth, adminAuth, async (req, res) => {
    try {
        const { globalAdminNotifications, globalEmployeeNotifications } = req.body;

        // Fetch the single global settings document (create it if it doesn't exist)
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }

        // 🚨 RBAC CHECK: Block regular Admins from changing Admin Notifications
        if (globalAdminNotifications !== undefined) {
            if (req.user.role !== 'SuperAdmin') {
                return res.status(403).json({
                    success: false,
                    message: "Permission denied. Only SuperAdmins can toggle Admin Notifications."
                });
            }
            settings.globalAdminNotifications = globalAdminNotifications;
        }

        // Both Admins and SuperAdmins can change Employee Notifications
        if (globalEmployeeNotifications !== undefined) {
            settings.globalEmployeeNotifications = globalEmployeeNotifications;
        }

        await settings.save();

        res.status(200).json({
            success: true,
            message: "Global settings updated successfully.",
            data: settings
        });

    } catch (error) {
        console.error("Settings Update Error:", error);
        res.status(500).json({ success: false, message: "Server error updating settings." });
    }
});

// ==========================================
// 19. GET DAIYREPORTS
// ==========================================
adminRouter.get('/daily-reports/:id', userAuth, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const reports = await DailyReports.find({ teacher: id })
            .populate('schoolId', 'schoolName')
            .sort({ date: -1 })
            .lean();

        const formattedReports = reports.map(report => ({
            ...report,
            schoolName: report.schoolName || (report.schoolId && report.schoolId.schoolName) || 'Unknown School',
            band: report.band || 'Unassigned',
            // NEW: Ensure band stage is always passed to the frontend
            bandStage: report.bandStage || 'N/A'
        }));

        res.status(200).json({ success: true, data: formattedReports });
    } catch (error) {
        console.error("Fetch Daily Reports Error:", error);
        res.status(500).json({ success: false, message: "Server error fetching daily reports." });
    }
});

// ==========================================
// 19. GET SCHOOL EVENTS
// ==========================================
adminRouter.get('/events', userAuth, adminAuth, async (req, res) => {
    try {
        const events = await Event.find()
            .populate('teacher', 'name')
            .sort({ startDate: 1 }); // Sort by upcoming

        res.status(200).json({ success: true, data: events });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error fetching events." });
    }
});

// ==========================================
// 20. OVERRIDE ATTENDANCE (FIXED STATUSES)
// ==========================================
adminRouter.put('/attendance/:id/override', userAuth, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { action, reason, teacherId, schoolId, band, date } = req.body;

        const query = mongoose.Types.ObjectId.isValid(id)
            ? { _id: id }
            : { teacher: teacherId, school: schoolId, band: band, date: date };

        let updateDoc = {};
        const now = new Date();

        if (action === "Revoke") {
            const existingRecord = await Attendance.findOne(query);
            if (!existingRecord) {
                return res.status(404).json({ success: false, message: "Record not found to revoke." });
            }

            if (existingRecord.checkOutTime) {
                await Attendance.findOneAndUpdate(query, {
                    $unset: { checkOutTime: 1, checkOutCoordinates: 1 },
                    $set: { status: "Present" }
                }, { returnDocument: 'after' });
            } else {
                await Attendance.findOneAndDelete(query);
            }
        }
        else {
            switch (action) {
                case "CheckIn":
                    updateDoc = { $set: { checkInTime: now, status: "Present" } };
                    if (reason) updateDoc.$set.teacherNote = `Admin Override: ${reason}`;
                    break;
                case "CheckOut":
                    // UPDATED: Only set the checkOutTime, do NOT change status to 'Checked Out'.
                    updateDoc = { $set: { checkOutTime: now } };
                    if (reason) updateDoc.$set.teacherNote = `Admin Override: ${reason}`;
                    break;
                case "Absent":
                    updateDoc = { $set: { status: "Absent", teacherNote: reason || "Admin marked Absent" } };
                    break;
                case "Late":
                    updateDoc = { $set: { status: "Late", lateReason: reason || "Admin marked Late" } };
                    break;
                case "Event":
                    updateDoc = { $set: { status: "Event", eventNote: reason || "Admin triggered Event" } };
                    break;
                case "Holiday":
                    updateDoc = { $set: { status: "Holiday", teacherNote: reason || "Admin marked Holiday" } };
                    break;
                default:
                    return res.status(400).json({ success: false, message: "Invalid action provided." });
            }

            await Attendance.findOneAndUpdate(query, updateDoc, {
                returnDocument: 'after',
                upsert: true,
                setDefaultsOnInsert: true
            });
        }

        const io = req.io;
        if (io) {
            io.emit("operations_update", { type: "refresh_feed" });
            if (teacherId) {
                io.to(teacherId.toString()).emit("employee_schedule_refresh");
                io.to(teacherId.toString()).emit("new_notification", {
                    type: "SCHEDULE_UPDATE",
                    message: `Admin modified your schedule (${action}).`
                });
            }
        }

        res.status(200).json({ success: true, message: `Successfully applied ${action} override.` });

    } catch (error) {
        console.error("Admin Override Error:", error);
        res.status(500).json({ success: false, message: "Failed to apply override." });
    }
});

// ==========================================
// 21. APPROVE/REJECT LEAVE REQUEST
// ==========================================
adminRouter.put('/leave-requests/:id/status', userAuth, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminRemarks } = req.body; // status can be 'approved', 'rejected', or 'pending' (revoked)

        const leaveRequest = await LeaveRequest.findById(id).populate('employee');
        if (!leaveRequest) return res.status(404).json({ success: false, message: "Request not found" });

        // Update status and handle remarks
        leaveRequest.status = status;
        leaveRequest.adminRemarks = status === 'pending' ? "" : (adminRemarks || "");

        await leaveRequest.save();

        const actionType = status === 'pending' ? "Revoked/Reset" : status.charAt(0).toUpperCase() + status.slice(1);

        // 1. Send In-App Notification to the Employee
        const empNotif = await Notification.create({
            recipient: leaveRequest.employee._id,
            title: `Leave Decision ${actionType}`,
            message: status === 'pending'
                ? `Admin has revoked the previous decision on your leave. Status is now Pending.`
                : `Your leave request has been ${status}.`,
            type: "Leave"
        });

        if (req.io) req.io.to(leaveRequest.employee._id.toString()).emit('new_notification', empNotif);

        // 2. Send Emails (ONLY if the decision is Approved or Rejected)
        if (status === 'approved' || status === 'rejected') {

            // 👉 CORRECTLY WRAPPED GATEKEEPER
            if (await canSendEmailToUser(leaveRequest.employee)) {

                // Format dates nicely for the email template
                const fromStr = new Date(leaveRequest.fromDate).toLocaleDateString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                });
                const toStr = new Date(leaveRequest.toDate).toLocaleDateString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                });

                if (status === 'approved') {
                    await sendLeaveApprovedEmailToEmployee(
                        leaveRequest.employee.email,
                        leaveRequest.employee.name,
                        fromStr,
                        toStr,
                        leaveRequest.adminRemarks
                    );
                } else if (status === 'rejected') {
                    await sendLeaveRejectedEmailToEmployee(
                        leaveRequest.employee.email,
                        leaveRequest.employee.name,
                        fromStr,
                        toStr,
                        leaveRequest.adminRemarks
                    );
                }
            }
        }

        // 3. Silent Sync: Ping all OTHER admins so their dashboard updates instantly
        const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] }, _id: { $ne: req.user._id } });
        admins.forEach(admin => {
            if (req.io) req.io.to(admin._id.toString()).emit('new_notification', { type: "Silent_Refresh" });
        });

        res.status(200).json({
            success: true,
            message: `Leave decision ${actionType} successfully.`
        });
    } catch (error) {
        console.error("Leave Status Update Error:", error);
        res.status(500).json({ success: false, message: "Server error updating leave status." });
    }
});

// ==========================================
// 22. GET PENDING LEAVE REQUESTS
// ==========================================
adminRouter.get('/leave-requests', userAuth, adminAuth, async (req, res) => {
    try {
        const { status } = req.query;

        let query = {};
        if (status) query.status = status;

        const leaveRequests = await LeaveRequest.find(query)
            .populate('employee', 'name email profilePicture')
            .sort({ updatedAt: -1, createdAt: -1 }); // Sort by newest updates first

        const formattedRequests = leaveRequests.map(request => ({
            id: request._id,
            employeeName: request.employee ? request.employee.name : "Unknown Employee",
            employeeEmail: request.employee ? request.employee.email : "N/A",
            fromDate: getISTDateString(new Date(request.fromDate)),
            profilePicture: request.employee ? request.employee.profilePicture : null,
            toDate: getISTDateString(new Date(request.toDate)),
            reason: request.reason,
            status: request.status,
            adminRemarks: request.adminRemarks,
            createdAt: request.createdAt,
            updatedAt: request.updatedAt // <-- THE CRITICAL FIX FOR FRONTEND SORTING
        }));

        res.status(200).json({ success: true, data: formattedRequests });
    } catch (error) {
        console.error("Fetch Leave Requests Error:", error);
        res.status(500).json({ success: false, message: "Server error fetching leave requests." });
    }
});

// ==========================================
// 23. GET EMPLOYEES FOR MEDIA VAULT
// ==========================================
adminRouter.get('/employees', userAuth, adminAuth, async (req, res) => {
    try {
        const employees = await User.find({ role: 'Employee' })
            .select('-password')
            .populate('assignments.school', 'schoolName address location');

        // --- STRICT IST MONTH BOUNDARIES ---
        const [year, month] = getISTDateString().split('-');
        const endDay = new Date(year, month, 0).getDate(); // Gets max days in current month

        const startOfMonth = new Date(`${year}-${month}-01T00:00:00.000+05:30`);
        const endOfMonth = new Date(`${year}-${month}-${endDay}T23:59:59.999+05:30`);

        // 2. Loop through employees to calculate Media Stats
        const statsPromises = employees.map(async (emp) => {
            const allMediaLogs = await MediaLog.find({ teacher: emp._id });

            let pendingCount = 0;
            let lastMonthTotalMarks = 0;
            let lastMonthGradedCount = 0;

            allMediaLogs.forEach(log => {
                const logDate = new Date(log.eventDate || log.createdAt);

                // Change this to use the current month variables
                const isThisMonth = logDate >= startOfMonth && logDate <= endOfMonth;

                log.files.forEach(file => {
                    if (file.marks === null || file.marks === undefined) {
                        pendingCount++;
                    }

                    // Change it to check isThisMonth
                    if (isThisMonth && file.marks !== null && file.marks !== undefined) {
                        lastMonthTotalMarks += file.marks;
                        lastMonthGradedCount++;
                    }
                });
            });

            const lastMonthAvg = lastMonthGradedCount > 0
                ? (lastMonthTotalMarks / lastMonthGradedCount).toFixed(1)
                : null;

            // Merge your original employee data with the new stats
            return {
                ...emp.toObject(),
                pendingCount,
                lastMonthAvg
            };
        });

        const formattedEmployees = await Promise.all(statsPromises);

        // 3. Sort Logic
        // We sort by Pending Count first (so admins see who needs grading at the top),
        // and then fallback to your original Alphabetical sort (name: 1)
        formattedEmployees.sort((a, b) => {
            if (b.pendingCount !== a.pendingCount) {
                return b.pendingCount - a.pendingCount; // Highest pending first
            }
            return a.name.localeCompare(b.name); // Then alphabetical
        });

        res.status(200).json({ success: true, data: formattedEmployees });
    } catch (error) {
        console.error("Fetch Employees Error:", error);
        res.status(500).json({ success: false, message: "Server error fetching employees." });
    }
});

// ==========================================
// 24. GET HISTORICAL MEDIA FILTERS
// ==========================================
adminRouter.get('/employees/:id/media-filters', userAuth, adminAuth, async (req, res) => {
    try {
        const employeeId = new mongoose.Types.ObjectId(req.params.id);

        const historicalFilters = await MediaLog.aggregate([
            { $match: { teacher: employeeId } },
            {
                $addFields: {
                    pendingInLog: {
                        $size: {
                            $filter: {
                                input: { $ifNull: ["$files", []] },
                                as: "file",
                                cond: { $eq: ["$$file.marks", null] }
                            }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: { school: "$school", band: "$band" },
                    pendingCount: { $sum: "$pendingInLog" }
                }
            },
            {
                $group: {
                    _id: "$_id.school",
                    bands: { $addToSet: "$_id.band" },
                    bandsDetails: {
                        $push: {
                            band: "$_id.band",
                            pendingCount: "$pendingCount"
                        }
                    },
                    totalPendingCount: { $sum: "$pendingCount" }
                }
            },
            {
                $lookup: {
                    from: 'schools',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'schoolDetails'
                }
            },
            { $unwind: "$schoolDetails" },
            {
                $project: {
                    _id: 1,
                    schoolName: "$schoolDetails.schoolName",
                    address: "$schoolDetails.address",
                    bands: 1,
                    bandsDetails: 1,
                    totalPendingCount: 1
                }
            },
            { $sort: { schoolName: 1 } }
        ]);

        res.status(200).json({ success: true, data: historicalFilters });
    } catch (error) {
        console.error("Fetch Media Filters Error:", error);
        res.status(500).json({ success: false, message: "Server error fetching historical filters." });
    }
});

// ==========================================
// 24b. GET MEDIA VAULT STORAGE STATS (10 GB LIMIT)
// ==========================================
adminRouter.get('/media-vault/storage-stats', userAuth, adminAuth, async (req, res) => {
    try {
        let totalSizeBytes = 0;
        let isTruncated = true;
        let continuationToken = undefined;

        // Loop through the R2 bucket (handles pagination if you have > 1000 files)
        while (isTruncated) {
            const command = new ListObjectsV2Command({
                Bucket: process.env.R2_BUCKET_NAME,
                ContinuationToken: continuationToken
            });

            const response = await s3Client.send(command);

            if (response.Contents && response.Contents.length > 0) {
                totalSizeBytes += response.Contents.reduce((acc, item) => acc + item.Size, 0);
            }

            isTruncated = response.IsTruncated;
            continuationToken = response.NextContinuationToken;
        }

        // 10 GB Storage Limit in Bytes
        const TOTAL_STORAGE_LIMIT = 10737418240;

        res.status(200).json({
            success: true,
            data: {
                usedBytes: totalSizeBytes,
                totalBytes: TOTAL_STORAGE_LIMIT
            }
        });

    } catch (error) {
        console.error("Storage Stats Calculation Error:", error);
        res.status(500).json({ success: false, message: "Server error calculating storage." });
    }
});

// ==========================================
// 25. GET MEDIA GALLERY
// ==========================================
adminRouter.get('/media', userAuth, adminAuth, async (req, res) => {
    try {
        const { teacher, school, band, bandStage, year } = req.query;
        const query = {};

        if (teacher) query.teacher = teacher;
        if (school) query.school = school;
        if (band) query.band = band;
        if (bandStage) query.bandStage = bandStage;

        if (year) {
            // --- STRICT IST YEAR BOUNDARIES ---
            const startYear = new Date(`${year}-01-01T00:00:00.000+05:30`);
            const endYear = new Date(`${parseInt(year) + 1}-01-01T00:00:00.000+05:30`);
            query.eventDate = { $gte: startYear, $lt: endYear };
        }

        const mediaLogs = await MediaLog.find(query).sort({ eventDate: -1 });

        res.status(200).json({ success: true, data: mediaLogs });
    } catch (error) {
        console.error("Fetch Admin Media Error:", error);
        res.status(500).json({ success: false, message: "Server error fetching media logs." });
    }
});

// ==========================================
// 26. GRADE VIDEO
// ==========================================
adminRouter.put('/media/:logId/grade/:fileId', userAuth, adminAuth, async (req, res) => {
    try {
        const { logId, fileId } = req.params;
        const { marks, remark } = req.body;
        const adminId = req.user._id;

        const mediaLog = await MediaLog.findById(logId)
            .populate('teacher', 'name email _id')
            .populate('school', 'schoolName');

        if (!mediaLog) return res.status(404).json({ success: false, message: "Media log not found." });

        const file = mediaLog.files.id(fileId);
        if (!file) return res.status(404).json({ success: false, message: "Video not found." });

        file.marks = marks;
        file.remark = remark;
        file.gradedBy = adminId;
        file.gradedAt = new Date();

        // Smart Logic: Update the overall 'reviewStatus' of the Log
        const totalFiles = mediaLog.files.length;
        const gradedFiles = mediaLog.files.filter(f => f.marks !== null).length;

        if (gradedFiles === 0) mediaLog.reviewStatus = 'Pending';
        else if (gradedFiles === totalFiles) mediaLog.reviewStatus = 'Completed';
        else mediaLog.reviewStatus = 'Partially Graded';

        await mediaLog.save();

        // 1. Create the notification in the database FIRST
        const newNotification = await Notification.create({
            recipient: mediaLog.teacher._id,
            title: `Video Graded: ${mediaLog.school.schoolName}`,
            message: `Admin scored your ${mediaLog.band} video ${marks}/10.`,
            type: "Media"
        });

        // 2. Real-Time Socket Notification to Employee
        if (req.io) {
            const employeeIdStr = mediaLog.teacher._id.toString();

            req.io.emit('new_notification_for_user', {
                userId: employeeIdStr,
                notification: newNotification
            });

            // 🔥 NEW: Send the exact grading data instead of a refresh signal
            req.io.emit('media_graded_direct', {
                userId: employeeIdStr,
                fileId: fileId,
                marks: marks,
                remark: remark
            });
        }

        // Email Fallback
        if (await canSendEmailToUser(mediaLog.teacher)) {
            sendVideoGradedEmailToEmployee(
                mediaLog.teacher.email,
                mediaLog.teacher.name,
                mediaLog.school.schoolName,
                mediaLog.band,
                marks,
                remark
            ).catch(console.error);
        }

        res.status(200).json({ success: true, message: "Video graded successfully.", data: file });

    } catch (error) {
        console.error("Grading Error:", error);
        res.status(500).json({ success: false, message: "Server error while grading video." });
    }
});

// ==========================================
// 27. ADMIN DELETE VIDEO ROUTE (Updated for Thumbnails)
// ==========================================
adminRouter.delete('/media/:logId/file/:fileId', userAuth, adminAuth, async (req, res) => {
    try {
        const { logId, fileId } = req.params;
        const mediaLog = await MediaLog.findById(logId)
            .populate('teacher', 'name email _id')
            .populate('school', 'schoolName');

        if (!mediaLog) return res.status(404).json({ success: false, message: "Media not found." });

        const fileToDelete = mediaLog.files.id(fileId);

        if (fileToDelete && fileToDelete.url) {
            try {
                // Delete Video
                let fileKey = fileToDelete.url.replace(process.env.R2_PUBLIC_URL, '');
                if (fileKey.startsWith('/')) fileKey = fileKey.substring(1);
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: process.env.R2_BUCKET_NAME,
                    Key: decodeURIComponent(fileKey)
                }));

                // Delete Thumbnail
                if (fileToDelete.thumbnailUrl && fileToDelete.thumbnailUrl.startsWith(process.env.R2_PUBLIC_URL)) {
                    let thumbKey = fileToDelete.thumbnailUrl.replace(process.env.R2_PUBLIC_URL, '');
                    if (thumbKey.startsWith('/')) thumbKey = thumbKey.substring(1);
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: process.env.R2_BUCKET_NAME,
                        Key: decodeURIComponent(thumbKey)
                    }));
                }
            } catch (r2Error) {
                console.error("Failed to delete from R2:", r2Error);
            }
        }

        mediaLog.files.pull(fileId);

        if (mediaLog.files.length === 0) {
            await mediaLog.deleteOne();
        } else {
            await mediaLog.save();
        }

        // ... (Rest of your socket/email logic)
        res.status(200).json({ success: true, message: "Video deleted successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to delete media." });
    }
});

// ==========================================
// 28. GENERATE PRESIGNED URL FOR AVATAR
// ==========================================
adminRouter.post('/profile-picture/presign', userAuth, adminAuth, async (req, res) => {
    try {
        const { fileType, extension } = req.body;

        // 1. Sanitize the name (replace spaces with underscores, remove special characters)
        const safeName = req.user.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');

        // 2. Determine Folder
        const folder = req.user.role === 'SuperAdmin' ? 'superadmin-profiles' : 'admin-profiles';

        // 3. Construct the filename: ROLE_NAME_PROFILE_PIC_TIMESTAMP.extension
        const fileName = `${folder}/${req.user.role}_${safeName}_PROFILE_PIC_${Date.now()}.${extension}`;

        const command = new PutObjectCommand({
            Bucket: process.env.CF_ASSETS_BUCKET,
            Key: fileName,
            ContentType: fileType,
        });

        // Generate the URL (expires in 5 minutes)
        const presignedUrl = await getSignedUrl(assetsS3Client, command, { expiresIn: 300 });
        const publicUrl = `${process.env.CF_ASSETS_PUBLIC_URL}/${fileName}`;

        res.json({ success: true, presignedUrl, publicUrl });

    } catch (error) {
        console.error("Admin Presign Error:", error);
        res.status(500).json({ success: false, message: "Failed to generate upload URL" });
    }
});

// ==========================================
// 29. CONFIRM & SAVE AVATAR TO DATABASE
// ==========================================
adminRouter.put('/profile-picture/confirm', userAuth, adminAuth, async (req, res) => {
    try {
        const { publicUrl } = req.body;

        if (!publicUrl) {
            return res.status(400).json({ success: false, message: "No URL provided" });
        }

        // Update the user's document in the database
        req.user.profilePicture = publicUrl;
        await req.user.save();

        res.json({ success: true, profilePicture: publicUrl, message: "Profile picture updated successfully" });
    } catch (error) {
        console.error("Admin Confirm Avatar Error:", error);
        res.status(500).json({ success: false, message: "Failed to save profile picture" });
    }
});

// ==========================================
// 30. DELETE AVATAR
// ==========================================
adminRouter.delete('/profile-picture', userAuth, adminAuth, async (req, res) => {
    try {
        // 1. Check if the user actually has a profile picture to delete
        if (!req.user.profilePicture) {
            return res.status(400).json({ success: false, message: "No profile picture found." });
        }

        // 2. Delete the physical file from Cloudflare R2
        try {
            let fileKey = "";

            // Safely extract the key by stripping the base public URL
            if (req.user.profilePicture.startsWith(process.env.R2_PUBLIC_URL)) {
                fileKey = req.user.profilePicture.replace(process.env.R2_PUBLIC_URL, '');
                if (fileKey.startsWith('/')) {
                    fileKey = fileKey.substring(1);
                }
            } else {
                // Fallback for edge cases
                const urlObj = new URL(req.user.profilePicture);
                fileKey = urlObj.pathname.substring(1);
            }

            // CRITICAL FIX: Decode the URL so spaces aren't passed as %20
            fileKey = decodeURIComponent(fileKey);

            await assetsS3Client.send(new DeleteObjectCommand({
                Bucket: process.env.CF_ASSETS_BUCKET,
                Key: fileKey
            }));
        } catch (r2Error) {
            console.error("Failed to delete avatar from R2, but continuing DB cleanup:", r2Error);
        }

        // 3. Remove the profile picture from the user's document in MongoDB
        req.user.profilePicture = null;
        await req.user.save();

        res.json({ success: true, message: "Profile picture removed successfully" });
    } catch (error) {
        console.error("Admin Delete Avatar Error:", error);
        res.status(500).json({ success: false, message: "Failed to remove profile picture" });
    }
});

// ==========================================
// 31. FETCH ADMIN PROFILE (FIXED: GRABS ALL DATA)
// ==========================================
adminRouter.get('/me/profile', userAuth, adminAuth, async (req, res) => {
    try {
        // Using '-password' guarantees we get profilePicture, preferences, and everything else
        const adminData = await User.findById(req.user._id)
            .select('-password')
            .lean();

        if (!adminData) {
            return res.status(404).json({ success: false, message: "Admin profile not found" });
        }

        res.json({
            success: true,
            user: adminData
        });

    } catch (error) {
        console.error("Fetch Admin Profile Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch admin profile" });
    }
});

// ==========================================
// 32. CHANGE ADMIN / SUPERADMIN PASSWORD (MANUAL HASH)
// ==========================================
adminRouter.put('/profile/password', userAuth, adminAuth, async (req, res) => {
    try {
        const { newPassword } = req.body;

        // 1. Basic Validation
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters long."
            });
        }

        // 2. Generate Salt and Hash
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // 3. Update User directly
        // We use findByIdAndUpdate here since we are doing a manual hash
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { password: hashedPassword },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ success: false, message: "Admin not found." });
        }

        res.json({ success: true, message: "Password updated successfully." });
    } catch (error) {
        console.error("Admin Password Change Error:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
});

// ==========================================
// 33. GET ALL CONTACTS FOR CHAT (INCLUDES SUPERADMIN)
// ==========================================
adminRouter.get('/chat-contacts', userAuth, adminAuth, async (req, res) => {
    try {
        const currentUserId = req.user._id;

        // 1. Fetch all relevant roles using .lean()
        const peers = await User.find({
            role: { $in: ['Employee', 'Admin', 'SuperAdmin'] },
            _id: { $ne: currentUserId }
        })
            .select('_id name email role profilePicture designation zone')
            .lean();

        // 2. Fetch all 1-on-1 conversations for the current user
        const myConversations = await Conversation.find({
            isGroup: false,
            participants: currentUserId
        })
            .populate({
                path: 'lastMessage',
                populate: { path: 'sender', select: 'name profilePicture' } // 🟢 Ensures frontend can read the sender's name!
            })
            .lean();

        // 3. Create a map of { peerId: lastMessageTime }
        const conversationMap = {};
        myConversations.forEach(conv => {
            const otherParticipantId = conv.participants.find(p => String(p) !== String(currentUserId));
            if (otherParticipantId) {
                conversationMap[String(otherParticipantId)] = {
                    lastMessageAt: conv.updatedAt || conv.createdAt,
                    lastMessage: conv.lastMessage || null // 🟢 Add this!
                };
            }
        });

        // 4. Attach the timestamp and the actual message data to the peer data
        const peersWithTimestamps = peers.map(peer => {
            const peerConvData = conversationMap[String(peer._id)] || {};
            return {
                ...peer,
                lastMessageAt: peerConvData.lastMessageAt || null,
                lastMessage: peerConvData.lastMessage || null // 🟢 Add this!
            };
        });

        res.status(200).json({
            success: true,
            data: peersWithTimestamps
        });
    } catch (error) {
        console.error("Error fetching chat contacts:", error);
        res.status(500).json({ success: false, message: "Failed to fetch chat contacts." });
    }
});

// ==========================================
// 34. SAVE THE FCM TOKEN FOR PUSH NOTIFICATIONS
// ==========================================
adminRouter.post('/save-fcm-token', userAuth, adminAuth, async (req, res) => {
    try {
        const { fcmToken } = req.body;

        // Ensure your auth middleware provides the user's ID
        const userId = req.user?.id || req.user?._id;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!fcmToken) {
            return res.status(400).json({ success: false, message: "FCM token is required" });
        }

        // Update the user's document with their new active device token
        await User.findByIdAndUpdate(userId, { fcmToken: fcmToken });

        res.status(200).json({ success: true, message: "FCM Token secured!" });
    } catch (error) {
        console.error("Error saving FCM token:", error);
        res.status(500).json({ success: false, message: "Server error while saving token" });
    }
});


// ==========================================
// 35. GET EMPLOYEE CHAT WHITELIST
// ==========================================
adminRouter.get('/employees/:id/whitelist', userAuth, adminAuth, async (req, res) => {
    try {
        const employee = await User.findById(req.params.id).lean();
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found" });

        res.status(200).json({
            success: true,
            data: employee.allowedContacts || []
        });
    } catch (error) {
        console.error("Fetch Whitelist Error:", error);
        res.status(500).json({ success: false, message: "Server error fetching whitelist." });
    }
});

// ==========================================
// 35. UPDATE EMPLOYEE CHAT WHITELIST
// ==========================================
adminRouter.put('/employees/:id/whitelist', userAuth, adminAuth, async (req, res) => {
    try {
        const { allowedContacts } = req.body;

        const employee = await User.findByIdAndUpdate(
            req.params.id,
            { $set: { allowedContacts: allowedContacts || [] } },
            { new: true }
        );

        if (!employee) return res.status(404).json({ success: false, message: "Employee not found" });

        res.status(200).json({ success: true, message: "Whitelist updated successfully." });
    } catch (error) {
        console.error("Update Whitelist Error:", error);
        res.status(500).json({ success: false, message: "Server error updating whitelist." });
    }
});


// ============================================================================
// 36. AUDIT: GET ALL CONVERSATIONS FOR AN EMPLOYEE (ONLY NON-EMPTY)
// ============================================================================
adminRouter.get('/employees/:id/audit-chats', userAuth, adminAuth, async (req, res) => {
    try {
        const targetEmployeeId = req.params.id;

        // 1. Get all 1-on-1 conversations the employee is part of
        const peerChats = await Conversation.find({
            isGroup: false,
            participants: targetEmployeeId
        })
            .populate('participants', 'name email role profilePicture')
            .lean();

        // 2. Get all group conversations the employee is a member of
        const groupChats = await Group.find({
            'members.user': targetEmployeeId
        })
            .select('name groupIcon creator admins members updatedAt')
            .lean();

        // 3. 🟢 THE FIX: Filter out completely empty chats dynamically
        const validPeerChats = [];
        for (const chat of peerChats) {
            const hasMessages = await Message.exists({ conversationId: chat._id });
            if (hasMessages) validPeerChats.push(chat);
        }

        const validGroupChats = [];
        for (const group of groupChats) {
            const hasMessages = await Message.exists({ groupId: group._id });
            if (hasMessages) validGroupChats.push(group);
        }

        // 4. Format 1-on-1 chats for the frontend
        const formattedPeerChats = validPeerChats.map(chat => {
            const peer = chat.participants.find(p => String(p._id) !== String(targetEmployeeId));
            return {
                id: chat._id,
                isGroup: false,
                name: peer ? peer.name : "Unknown User",
                profilePicture: peer ? peer.profilePicture : null,
                role: peer ? peer.role : "",
                updatedAt: chat.updatedAt || chat.createdAt
            };
        });

        // 5. Format Group chats for the frontend
        const formattedGroupChats = validGroupChats.map(group => ({
            id: group._id,
            isGroup: true,
            name: group.name,
            profilePicture: group.groupIcon || null,
            role: "Group Chat",
            updatedAt: group.updatedAt || new Date()
        }));

        // Combine and sort by most recently active
        const allChats = [...formattedPeerChats, ...formattedGroupChats].sort(
            (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
        );

        res.status(200).json({ success: true, data: allChats });
    } catch (error) {
        console.error("Audit Chat List Error:", error);
        res.status(500).json({ success: false, message: "Server error fetching audit chat list." });
    }
});

// ============================================================================
// 37. AUDIT: GET MESSAGES (UNFILTERED) FOR 1-ON-1 OR GROUP
// ============================================================================
adminRouter.get('/audit/messages', userAuth, adminAuth, async (req, res) => {
    try {
        const { targetId, isGroup } = req.query;

        if (!targetId) {
            return res.status(400).json({ success: false, message: "targetId is required." });
        }

        // 🟢 THE MAGIC: Notice we do NOT filter by 'deletedFor' or 'isDeletedForEveryone'.
        // We fetch 100% of the messages attached to this chat.
        const query = isGroup === 'true'
            ? { groupId: targetId }
            : { conversationId: targetId };

        const messages = await Message.find(query)
            .populate('sender', 'name profilePicture')
            .sort({ createdAt: 1 })
            .lean();

        res.status(200).json({ success: true, data: messages });
    } catch (error) {
        console.error("Audit Messages Error:", error);
        res.status(500).json({ success: false, message: "Server error fetching audit messages." });
    }
});

// ============================================================================
// 38. AUDIT: HARD DELETE A MESSAGE & MEDIA PERMANENTLY
// ============================================================================
adminRouter.delete('/audit/message/:messageId', userAuth, adminAuth, async (req, res) => {
    try {
        const { messageId } = req.params;

        const msg = await Message.findById(messageId);
        if (!msg) {
            return res.status(404).json({ success: false, message: "Message not found." });
        }

        // 1. Physically delete media from Cloudflare R2 if it exists
        if (msg.mediaUrl && msg.mediaUrl.trim() !== "") {
            // Check if this exact URL is used by any *other* forwarded message
            const count = await Message.countDocuments({ mediaUrl: msg.mediaUrl });

            // If this is the only message using this file, destroy it from Cloudflare
            if (count <= 1) {
                try {
                    const urlParts = new URL(msg.mediaUrl);
                    let key = urlParts.pathname.startsWith('/') ? urlParts.pathname.substring(1) : urlParts.pathname;

                    // You must have 'chatS3Client' and 'DeleteObjectCommand' imported at the top of adminRouter.js
                    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
                    const chatS3Client = require('../config/chatS3Client'); // Adjust path if needed

                    const command = new DeleteObjectCommand({
                        Bucket: process.env.CHAT_MEDIA_BUCKET.replace(/['"]/g, ''),
                        Key: key,
                    });
                    await chatS3Client.send(command);
                    console.log(`[Audit] Hard deleted media from R2: ${key}`);
                } catch (r2Error) {
                    console.error("[Audit] R2 Deletion Failed:", r2Error);
                }
            }
        }

        // 2. Erase the message from MongoDB permanently
        await Message.findByIdAndDelete(messageId);

        // 3. Silent ping to connected clients (Optional, but keeps admin screens in sync)
        if (req.io) {
            req.io.emit("message_deleted", { messageId: messageId });
        }

        res.status(200).json({ success: true, message: "Message permanently wiped from database." });
    } catch (error) {
        console.error("Audit Hard Delete Error:", error);
        res.status(500).json({ success: false, message: "Server error executing hard delete." });
    }
});

// ============================================================================
// 39. AUDIT: GENERATE SECURE DOWNLOAD URL FOR MEDIA
// ============================================================================
adminRouter.post('/generate-download-url', userAuth, adminAuth, async (req, res) => {
    try {
        const { fileUrl } = req.body;

        if (!fileUrl) {
            return res.status(400).json({ success: false, message: "File URL is required" });
        }

        // Extract the exact file key from the public URL
        const urlObject = new URL(fileUrl);
        const fileKey = urlObject.pathname.substring(1); // Removes the leading '/'
        const fileName = fileKey.split('/').pop() || "audit_media_file";

        // Ask Cloudflare R2/AWS S3 for a URL that FORCES a download
        const command = new GetObjectCommand({
            Bucket: process.env.CHAT_MEDIA_BUCKET.replace(/['"]/g, ''), // Adjust bucket env var if needed
            Key: fileKey,
            ResponseContentDisposition: `attachment; filename="${fileName}"`
        });

        // Generate a quick expiring link (valid for 5 minutes)
        const signedUrl = await getSignedUrl(chatS3Client, command, { expiresIn: 300 });

        res.status(200).json({ success: true, downloadUrl: signedUrl });

    } catch (error) {
        console.error("Generate Download URL Error:", error);
        res.status(500).json({ success: false, message: "Failed to generate download link" });
    }
});

// ============================================================================
// 39b. GENERATE SECURE DOWNLOAD URL FOR MEDIA VAULT (GALLERY)
// ============================================================================
adminRouter.post('/media-vault/generate-download-url', userAuth, adminAuth, async (req, res) => {
    try {
        const { fileUrl } = req.body;

        if (!fileUrl) {
            return res.status(400).json({ success: false, message: "File URL is required" });
        }

        // Clean the URL to get the exact key
        let fileKey = fileUrl.replace(process.env.R2_PUBLIC_URL, '');
        if (fileKey.startsWith('/')) fileKey = fileKey.substring(1);

        const fileName = fileKey.split('/').pop() || "media_vault_file.mp4";

        // This ResponseContentDisposition header is what forces the browser to download instead of play
        const command = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: decodeURIComponent(fileKey),
            ResponseContentDisposition: `attachment; filename="${fileName}"`
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

        res.status(200).json({ success: true, downloadUrl: signedUrl });

    } catch (error) {
        console.error("Generate Media Vault Download URL Error:", error);
        res.status(500).json({ success: false, message: "Failed to generate download link" });
    }
});

// ============================================================================
// 40. AUDIT: HARD CLEAR ENTIRE CHAT (DB & CLOUDFLARE)
// ============================================================================
adminRouter.delete('/audit/chat', userAuth, adminAuth, async (req, res) => {
    try {
        const { targetId, isGroup } = req.body;

        if (!targetId) {
            return res.status(400).json({ success: false, message: "targetId is required." });
        }

        const query = isGroup === true || isGroup === 'true'
            ? { groupId: targetId }
            : { conversationId: targetId };

        // 1. Find all messages in this chat to delete their media
        const messages = await Message.find(query);

        for (const msg of messages) {
            if (msg.mediaUrl && msg.mediaUrl.trim() !== "") {
                const count = await Message.countDocuments({ mediaUrl: msg.mediaUrl });

                // If this is the only message using this file, destroy it from Cloudflare
                if (count <= 1) {
                    try {
                        const urlParts = new URL(msg.mediaUrl);
                        let key = urlParts.pathname.startsWith('/') ? urlParts.pathname.substring(1) : urlParts.pathname;

                        const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
                        const chatS3Client = require('../config/chatS3Client');

                        const command = new DeleteObjectCommand({
                            Bucket: process.env.CHAT_MEDIA_BUCKET.replace(/['"]/g, ''),
                            Key: key,
                        });
                        await chatS3Client.send(command);
                    } catch (r2Error) {
                        console.error("[Audit] R2 Bulk Deletion Failed:", r2Error);
                    }
                }
            }
        }

        // 2. Erase all messages from MongoDB permanently
        await Message.deleteMany(query);

        // 3. Silent ping to connected clients
        if (req.io) {
            req.io.emit("audit_chat_cleared", { targetId });
        }

        res.status(200).json({ success: true, message: "Entire chat wiped from database." });
    } catch (error) {
        console.error("Audit Hard Clear Chat Error:", error);
        res.status(500).json({ success: false, message: "Server error executing hard clear." });
    }
});

// 41. Create a Holiday (Updated with Context & Notifications)
adminRouter.post('/school-holidays', userAuth, adminAuth, async (req, res) => {
    try {
        const { title, startDate, endDate, affectedSchools, category } = req.body;
        const holiday = await SchoolHoliday.create({
            title,
            startDate: new Date(`${startDate}T00:00:00.000+05:30`),
            endDate: new Date(`${endDate}T23:59:59.999+05:30`),
            affectedSchools,
            category: category || 'All',
            createdBy: req.user._id
        });

        // --- NOTIFICATIONS & EMAILS LOGIC ---
        const fromStr = new Date(holiday.startDate).toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
        const toStr = new Date(holiday.endDate).toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });

        let schoolNamesStr = "All Schools";
        if (affectedSchools && affectedSchools.length > 0) {
            const schools = await School.find({ _id: { $in: affectedSchools } });
            schoolNamesStr = schools.map(s => s.schoolName).join(', ');
        }

        // 1. Notify Affected Employees Only
        const employees = await User.find({ role: 'Employee', isActive: true });
        const affectedEmployees = employees.filter(emp => {
            return emp.assignments.some(a => {
                const isSchoolMatch = holiday.affectedSchools.length === 0 || holiday.affectedSchools.map(id => id.toString()).includes(a.school.toString());
                const isCategoryMatch = holiday.category === 'All' || a.category === holiday.category;
                return isSchoolMatch && isCategoryMatch;
            });
        });

        for (const emp of affectedEmployees) {
            const empMsg = `A new holiday (${title}) has been scheduled for ${schoolNamesStr} from ${fromStr} to ${toStr}.`;
            const empNotif = await Notification.create({ recipient: emp._id, title: "Holiday Scheduled", message: empMsg, type: "System" });

            if (req.io) req.io.to(emp._id.toString()).emit('new_notification', empNotif);

            if (await canSendEmailToUser(emp)) {
                sendHolidayAlertToEmployee(emp.email, emp.name, "Scheduled", title, schoolNamesStr, holiday.category, fromStr, toStr).catch(console.error);
            }
        }

        // 2. Notify Admins (Audit)
        const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] }, _id: { $ne: req.user._id } });
        const adminMsg = `${req.user.name} scheduled a holiday (${title}) for ${schoolNamesStr} (${fromStr} to ${toStr}).`;

        await Promise.all(admins.map(async (admin) => {
            const adminNotif = await Notification.create({ recipient: admin._id, title: "System Alert: Holiday Scheduled", message: adminMsg, type: "System" });

            if (req.io) req.io.to(admin._id.toString()).emit('new_notification', adminNotif);

            if (await canSendEmailToUser(admin)) {
                sendHolidayAlertToAdmin(admin.email, admin.name, "Scheduled", title, schoolNamesStr, holiday.category, fromStr, toStr, req.user.name).catch(console.error);
            }
        }));

        res.status(201).json({ success: true, data: holiday });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 42. Get Holidays (Unchanged)
adminRouter.get('/school-holidays', userAuth, adminAuth, async (req, res) => {
    try {
        const { schoolId, category } = req.query;
        let query = {};

        if (schoolId) query.affectedSchools = schoolId;
        if (category && category !== 'All') {
            query.category = { $in: [category, 'All'] };
        }

        const holidays = await SchoolHoliday.find(query).sort({ startDate: -1 });
        res.json({ success: true, data: holidays });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 43. Update Holiday (Updated with Context & Notifications)
adminRouter.put('/school-holidays/:id', userAuth, adminAuth, async (req, res) => {
    try {
        const { title, startDate, endDate, category } = req.body;

        // Note: Updated { new: true } to { returnDocument: 'after' } to clear the Mongoose warning
        const updated = await SchoolHoliday.findByIdAndUpdate(req.params.id, {
            title,
            startDate: new Date(`${startDate}T00:00:00.000+05:30`),
            endDate: new Date(`${endDate}T23:59:59.999+05:30`),
            category
        }, { returnDocument: 'after' });

        // --- THE FIX: Null Check ---
        // If no holiday was found with that ID, 'updated' is null. Stop execution and tell the frontend.
        if (!updated) {
            return res.status(404).json({ success: false, message: "Holiday record not found or already deleted." });
        }

        // --- NOTIFICATIONS & EMAILS LOGIC ---
        // It is now 100% safe to read updated.startDate
        const fromStr = new Date(updated.startDate).toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
        const toStr = new Date(updated.endDate).toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });

        let schoolNamesStr = "All Schools";
        if (updated.affectedSchools && updated.affectedSchools.length > 0) {
            const schools = await School.find({ _id: { $in: updated.affectedSchools } });
            schoolNamesStr = schools.map(s => s.schoolName).join(', ');
        }

        // 1. Notify Affected Employees Only
        const employees = await User.find({ role: 'Employee', isActive: true });
        const affectedEmployees = employees.filter(emp => {
            return emp.assignments.some(a => {
                const isSchoolMatch = updated.affectedSchools.length === 0 || updated.affectedSchools.map(id => id.toString()).includes(a.school.toString());
                const isCategoryMatch = updated.category === 'All' || a.category === updated.category;
                return isSchoolMatch && isCategoryMatch;
            });
        });

        for (const emp of affectedEmployees) {
            const empMsg = `The holiday (${title}) for ${schoolNamesStr} has been updated. New dates: ${fromStr} to ${toStr}.`;
            const empNotif = await Notification.create({ recipient: emp._id, title: "Holiday Updated", message: empMsg, type: "Updation" });

            if (req.io) req.io.to(emp._id.toString()).emit('new_notification', empNotif);

            if (await canSendEmailToUser(emp)) {
                sendHolidayAlertToEmployee(emp.email, emp.name, "Updated", title, schoolNamesStr, updated.category, fromStr, toStr).catch(console.error);
            }
        }

        // 2. Notify Admins (Audit)
        const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] }, _id: { $ne: req.user._id } });
        const adminMsg = `${req.user.name} updated the holiday (${title}) for ${schoolNamesStr}.`;

        await Promise.all(admins.map(async (admin) => {
            const adminNotif = await Notification.create({ recipient: admin._id, title: "System Alert: Holiday Updated", message: adminMsg, type: "System" });

            if (req.io) req.io.to(admin._id.toString()).emit('new_notification', adminNotif);

            if (await canSendEmailToUser(admin)) {
                sendHolidayAlertToAdmin(admin.email, admin.name, "Updated", title, schoolNamesStr, updated.category, fromStr, toStr, req.user.name).catch(console.error);
            }
        }));

        res.json({ success: true, data: updated });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 44. Delete Holiday (Updated with Context & Notifications)
adminRouter.delete('/school-holidays/:id', userAuth, adminAuth, async (req, res) => {
    try {
        const holiday = await SchoolHoliday.findById(req.params.id);
        if (!holiday) return res.status(404).json({ success: false, message: "Holiday not found" });

        await SchoolHoliday.findByIdAndDelete(req.params.id);

        // --- NOTIFICATIONS & EMAILS LOGIC ---
        const fromStr = new Date(holiday.startDate).toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
        const toStr = new Date(holiday.endDate).toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });

        let schoolNamesStr = "All Schools";
        if (holiday.affectedSchools && holiday.affectedSchools.length > 0) {
            const schools = await School.find({ _id: { $in: holiday.affectedSchools } });
            schoolNamesStr = schools.map(s => s.schoolName).join(', ');
        }

        // 1. Notify Affected Employees Only
        const employees = await User.find({ role: 'Employee', isActive: true });
        const affectedEmployees = employees.filter(emp => {
            return emp.assignments.some(a => {
                const isSchoolMatch = holiday.affectedSchools.length === 0 || holiday.affectedSchools.map(id => id.toString()).includes(a.school.toString());
                const isCategoryMatch = holiday.category === 'All' || a.category === holiday.category;
                return isSchoolMatch && isCategoryMatch;
            });
        });

        for (const emp of affectedEmployees) {
            const empMsg = `The holiday (${holiday.title}) scheduled for ${schoolNamesStr} has been cancelled.`;
            const empNotif = await Notification.create({ recipient: emp._id, title: "Holiday Cancelled", message: empMsg, type: "Deletion" });

            if (req.io) req.io.to(emp._id.toString()).emit('new_notification', empNotif);

            if (await canSendEmailToUser(emp)) {
                sendHolidayAlertToEmployee(emp.email, emp.name, "Cancelled", holiday.title, schoolNamesStr, holiday.category, fromStr, toStr).catch(console.error);
            }
        }

        // 2. Notify Admins (Audit)
        const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] }, _id: { $ne: req.user._id } });
        const adminMsg = `${req.user.name} cancelled the holiday (${holiday.title}) for ${schoolNamesStr}.`;

        await Promise.all(admins.map(async (admin) => {
            const adminNotif = await Notification.create({ recipient: admin._id, title: "System Alert: Holiday Cancelled", message: adminMsg, type: "System" });

            if (req.io) req.io.to(admin._id.toString()).emit('new_notification', adminNotif);

            if (await canSendEmailToUser(admin)) {
                sendHolidayAlertToAdmin(admin.email, admin.name, "Cancelled", holiday.title, schoolNamesStr, holiday.category, fromStr, toStr, req.user.name).catch(console.error);
            }
        }));

        res.json({ success: true, message: "Holiday deleted" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

adminRouter.get('/reports/unread-summary', userAuth, adminAuth, async (req, res) => {
    try {
        // Group unread Daily Reports by Teacher
        const unreadReports = await DailyReports.aggregate([
            { $match: { isReadByAdmin: { $ne: true } } },
            { $group: { _id: "$teacher", count: { $sum: 1 } } }
        ]);

        const dailyUnreadMap = {};
        unreadReports.forEach(r => dailyUnreadMap[r._id] = r.count);

        // Group unread Events by School Name
        const unreadEvents = await Event.aggregate([
            { $match: { isReadByAdmin: { $ne: true } } },
            { $group: { _id: "$schoolName", count: { $sum: 1 } } }
        ]);

        const eventsUnreadMap = {};
        unreadEvents.forEach(e => eventsUnreadMap[e._id] = e.count);

        res.status(200).json({
            success: true,
            data: {
                dailyUnread: dailyUnreadMap,
                eventsUnread: eventsUnreadMap
            }
        });
    } catch (error) {
        console.error("Unread Summary Error:", error);
        res.status(500).json({ success: false, message: "Error fetching unread summary" });
    }
});

adminRouter.put('/daily-reports/:teacherId/mark-read', userAuth, adminAuth, async (req, res) => {
    try {
        await DailyReports.updateMany(
            { teacher: req.params.teacherId, isReadByAdmin: { $ne: true } },
            { $set: { isReadByAdmin: true } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

adminRouter.put('/events/:schoolName/mark-read', userAuth, adminAuth, async (req, res) => {
    try {
        await Event.updateMany(
            { schoolName: req.params.schoolName, isReadByAdmin: { $ne: true } },
            { $set: { isReadByAdmin: true } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

adminRouter.put('/daily-reports/report/:reportId/mark-read', userAuth, adminAuth, async (req, res) => {
    try {
        await DailyReports.findByIdAndUpdate(req.params.reportId, { $set: { isReadByAdmin: true } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// ==========================================
// NEW: 30-DAY MEDIA REPORT (JSON FOR PREVIEW)
// ==========================================
adminRouter.get('/employees/:id/media-report-30-days', userAuth, adminAuth, async (req, res) => {
    try {
        const employeeId = req.params.id;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const logs = await MediaLog.find({
            teacher: employeeId,
            eventDate: { $gte: thirtyDaysAgo }
        })
            .populate('school', 'schoolName')
            .populate('files.gradedBy', 'name')
            .sort({ eventDate: -1 });

        // Group by school name
        const grouped = {};
        logs.forEach(log => {
            const schoolName = log.school ? log.school.schoolName : 'Unknown School';
            if (!grouped[schoolName]) {
                grouped[schoolName] = [];
            }

            log.files.forEach(file => {
                grouped[schoolName].push({
                    date: new Date(log.eventDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
                    marks: file.marks !== null ? `${file.marks}/10` : 'Marking Pending',
                    gradedBy: file.gradedBy ? file.gradedBy.name : (file.marks !== null ? 'Admin' : '-'),
                    eventName: log.eventContext || log.mediaType || 'Regular Class'
                });
            });
        });

        res.status(200).json({ success: true, data: grouped });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error fetching report." });
    }
});

// ==========================================
// UPDATED: 30-DAY MEDIA REPORT (EXCEL EXPORT - DIRECT LINKS)
// ==========================================
adminRouter.get('/employees/:id/media-report-30-days/download', userAuth, adminAuth, async (req, res) => {
    try {
        const employeeId = req.params.id;
        const employee = await User.findById(employeeId).select('name');
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const logs = await MediaLog.find({
            teacher: employeeId,
            eventDate: { $gte: thirtyDaysAgo }
        })
            .populate('school', 'schoolName')
            .populate('files.gradedBy', 'name')
            .sort({ 'school.schoolName': 1, eventDate: -1 });

        const workbook = new exceljs.Workbook();
        const worksheet = workbook.addWorksheet('30-Day Media Report');

        worksheet.columns = [
            { header: 'School Name', key: 'school', width: 35 },
            { header: 'Submission Date', key: 'date', width: 18 },
            { header: 'Event/Context', key: 'event', width: 25 },
            { header: 'Marks', key: 'marks', width: 18 },
            { header: 'Graded By', key: 'gradedBy', width: 25 },
            { header: 'Video Link', key: 'link', width: 60 }
        ];

        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };

        let lastSchool = null;
        let startRow = 2;

        logs.forEach((log) => {
            const schoolName = log.school ? log.school.schoolName : 'Unknown School';
            const dateStr = new Date(log.eventDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });

            log.files.forEach(file => {
                const row = worksheet.addRow({
                    school: schoolName,
                    date: dateStr,
                    event: log.eventContext || log.mediaType || 'Regular Class',
                    marks: file.marks !== null ? `${file.marks}/10` : 'Marking Pending',
                    gradedBy: file.gradedBy ? file.gradedBy.name : (file.marks !== null ? 'Admin' : 'Pending'),
                    link: file.url || ''
                });

                // Apply link styling: Display the full URL as the text AND the hyperlink
                const linkCell = row.getCell('link');
                if (file.url) {
                    linkCell.value = {
                        text: file.url,      // Shows the full URL text
                        hyperlink: file.url  // Makes it clickable
                    };
                    linkCell.font = { color: { argb: 'FF0563C1' }, underline: true };
                }
            });

            // Merge logic for school names
            if (lastSchool !== null && lastSchool !== schoolName) {
                if (worksheet.lastRow.number - 1 > startRow) {
                    worksheet.mergeCells(startRow, 1, worksheet.lastRow.number - 1, 1);
                }
                startRow = worksheet.lastRow.number;
            }
            lastSchool = schoolName;
        });

        // Final merge
        if (worksheet.lastRow.number >= startRow) {
            worksheet.mergeCells(startRow, 1, worksheet.lastRow.number, 1);
        }

        worksheet.getColumn(1).alignment = { vertical: 'middle', horizontal: 'center' };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Media_Report_${employee?.name.replace(/\s+/g, '_')}_Last_30_Days.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error generating Excel." });
    }
});

module.exports = adminRouter;