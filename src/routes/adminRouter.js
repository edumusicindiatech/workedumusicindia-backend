const express = require('express');
const User = require('../models/User');
const crypto = require('crypto');
const validator = require('validator');
const bcrypt = require('bcrypt');
const adminRouter = express.Router();
const { sendAdminWelcomeEmail, sendEmployeeWelcomeEmail, sendSchoolAssignmentEmail, sendAdminAssignmentAlertEmail, sendEmployeeAssignmentRevokedEmail, sendAdminAssignmentRevokedEmail, sendEmployeeAssignmentUpdatedEmail, sendAdminAssignmentUpdatedEmail, sendEmployeeProfileUpdatedEmail, sendAdminAuditEmail, sendEmployeeProfileDeletedEmail, sendEmployeeTaskAssignedEmail, sendAdminTaskAuditEmail, sendEmployeeTaskUpdatedEmail, sendEmployeeTaskRevokedEmail, sendEmployeeWarningEmail, sendAdminWarningAuditEmail, sendEmployeeAttendanceOverrideEmail, sendAdminAttendanceOverrideAlert, sendLeaveApprovedEmailToEmployee, sendLeaveRejectedEmailToEmployee, sendVideoGradedEmailToEmployee, sendVideoDeletedEmailToEmployee } = require('../utils/emailService');
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
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const assetsS3Client = require('../config/assetsS3Client');
const s3Client = require('../config/s3');
const { getISTDayOfWeek, getISTDateString } = require('../utils/timeHelper');

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
        const defaultPassword = "Welcome123!";
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

        const tasks = await Task.find({ teacher: id }).populate('school', 'schoolName address');

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
// 5. ASSIGN SCHOOL TO EMPLOYEE (UPDATED)
// ==========================================
adminRouter.post('/employees/:id/assign-school', userAuth, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            schoolName,
            schoolAddress,
            category,
            startDate,
            endDate,
            startTime,
            endTime,
            allowedDays,
            latitude,
            longitude
        } = req.body;

        // 1. STRICT INPUT VALIDATIONS
        if (!schoolName || !schoolAddress || !category || !startDate || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: "School Name, Location, Category, Start Date, Start Time, and End Time are required."
            });
        }

        if (!Array.isArray(allowedDays) || allowedDays.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please select at least one working day."
            });
        }

        if (latitude === undefined || longitude === undefined || latitude === '' || longitude === '') {
            return res.status(400).json({
                success: false,
                message: "Geofence coordinates (Latitude and Longitude) are required."
            });
        }

        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        if (isNaN(lat) || isNaN(lng)) {
            return res.status(400).json({
                success: false,
                message: "Invalid geofence coordinates provided."
            });
        }

        // India Bounding Box Check
        if (lat < 6.0 || lat > 38.0 || lng < 68.0 || lng > 98.0) {
            return res.status(400).json({
                success: false,
                message: "Coordinates must be located within India."
            });
        }

        const checkStartDate = new Date(startDate);
        if (isNaN(checkStartDate.getTime())) {
            return res.status(400).json({ success: false, message: "Invalid Start Date format." });
        }

        // 2. EMPLOYEE & LEAVE CHECKS
        const employee = await User.findById(id);
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });

        const checkEndDate = endDate ? new Date(endDate) : new Date("2099-12-31T23:59:59Z");

        const overlappingLeave = await LeaveRequest.findOne({
            employee: employee._id,
            status: 'approved',
            fromDate: { $lte: checkEndDate },
            toDate: { $gte: checkStartDate }
        });

        if (overlappingLeave) {
            return res.status(400).json({
                success: false,
                message: `Cannot assign schedule. ${employee.name} is on an approved leave.`
            });
        }

        // 3. SCHOOL CREATION / UPDATING (FIXED LOGIC)
        // We find the school by name and update its address/coordinates to ensure precision
        let school = await School.findOne({
            schoolName: { $regex: new RegExp(`^${schoolName}$`, 'i') }
        });

        if (!school) {
            school = new School({
                schoolName,
                address: schoolAddress,
                location: { type: 'Point', coordinates: [lng, lat] }
            });
            await school.save();
        } else {
            // Update existing school to use the new precise coordinates
            school.address = schoolAddress;
            school.location = { type: 'Point', coordinates: [lng, lat] };
            await school.save();
        }

        const newAssignment = {
            school: school._id,
            category,
            startDate,
            endDate: endDate || null,
            startTime,
            endTime,
            allowedDays,
            geofence: { latitude: lat, longitude: lng }
        };

        employee.assignments.push(newAssignment);
        await employee.save();

        // 4. NOTIFICATIONS
        const empMsg = `You have been assigned to ${school.schoolName} for the ${category} shift.`;

        if (await canSendEmailToUser(employee)) {
            sendSchoolAssignmentEmail(employee.email, employee.name, school.schoolName, school.address, category, startDate, startTime)
                .catch(e => console.error("Employee email failed", e));
        }

        const empNotification = await Notification.create({
            recipient: employee._id,
            title: "New School Assignment",
            message: empMsg,
            type: "Assignment"
        });

        if (req.io) {
            req.io.to(employee._id.toString()).emit('new_notification', {
                _id: empNotification._id,
                title: empNotification.title,
                message: empNotification.message,
                timestamp: empNotification.createdAt
            });
        }

        // Notify other admins
        const admins = await User.find({
            role: 'Admin',
            _id: { $ne: req.user._id }
        });

        const adminMsg = `${employee.name} assigned to ${school.schoolName} (${category}).`;

        await Promise.all(admins.map(async (admin) => {
            const adminNotification = await Notification.create({
                recipient: admin._id,
                title: "System Alert: Staff Assigned",
                message: adminMsg,
                type: "System"
            });

            if (req.io) {
                req.io.to(admin._id.toString()).emit('new_notification', {
                    _id: adminNotification._id,
                    title: adminNotification.title,
                    message: adminNotification.message,
                    timestamp: adminNotification.createdAt
                });
            }
        }));

        res.status(200).json({ success: true, message: "School successfully assigned.", data: newAssignment });

    } catch (error) {
        console.error("Assign School Error:", error);
        res.status(500).json({ success: false, message: "Server error while assigning school." });
    }
});


// ==========================================
// 6. UPDATE ASSIGNMENT (WITH DETAILED CHANGE LOG)
// ==========================================
adminRouter.put('/employees/:empId/assignments/:assignmentId', userAuth, adminAuth, async (req, res) => {
    try {
        const { empId, assignmentId } = req.params;
        const { schoolName, schoolAddress, category, startDate, endDate, startTime, endTime, allowedDays, latitude, longitude } = req.body;

        // ==========================================
        // 1. STRICT INPUT VALIDATIONS
        // ==========================================

        // Validate Dates & Times
        if (!startDate || !startTime || !endTime) {
            return res.status(400).json({ success: false, message: "Start Date, Start Time, and End Time are required." });
        }

        // Validate Working Days
        if (!Array.isArray(allowedDays) || allowedDays.length === 0) {
            return res.status(400).json({ success: false, message: "Please select at least one working day." });
        }

        // Validate School Info (If provided in the update payload)
        if (schoolName !== undefined && (!schoolName || String(schoolName).trim() === '')) {
            return res.status(400).json({ success: false, message: "School Name must be filled." });
        }
        if (schoolAddress !== undefined && (!schoolAddress || String(schoolAddress).trim() === '')) {
            return res.status(400).json({ success: false, message: "School Location must be filled." });
        }

        // Validate Geofence Coordinates (If provided in the update payload)
        if (latitude !== undefined || longitude !== undefined) {
            if (latitude === '' || longitude === '' || latitude === null || longitude === null) {
                return res.status(400).json({ success: false, message: "Geofence coordinates are required." });
            }

            const lat = parseFloat(latitude);
            const lng = parseFloat(longitude);

            if (isNaN(lat) || isNaN(lng)) {
                return res.status(400).json({ success: false, message: "Invalid geofence coordinates provided." });
            }

            // Check bounding box for India
            if (lat < 6.0 || lat > 38.0 || lng < 68.0 || lng > 98.0) {
                return res.status(400).json({ success: false, message: "Coordinates must be located within India." });
            }

            // Silent Fix: Format coordinates properly for MongoDB so Object.assign saves them correctly
            req.body.geofence = { latitude: lat, longitude: lng };
            delete req.body.latitude;
            delete req.body.longitude;
        }

        // ==========================================
        // 2. FETCH EMPLOYEE & ASSIGNMENT
        // ==========================================

        const employee = await User.findById(empId).populate('assignments.school');
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found" });

        const assignment = employee.assignments.id(assignmentId);
        if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });

        // ==========================================
        // 3. LEAVE RESTRICTION CHECK
        // ==========================================

        const effStartDate = startDate ? new Date(startDate) : assignment.startDate;
        const effEndDate = endDate !== undefined
            ? (endDate ? new Date(endDate) : new Date("2099-12-31T23:59:59Z"))
            : (assignment.endDate ? assignment.endDate : new Date("2099-12-31T23:59:59Z"));

        const overlappingLeave = await LeaveRequest.findOne({
            employee: employee._id,
            status: 'approved',
            fromDate: { $lte: effEndDate },
            toDate: { $gte: effStartDate }
        });

        if (overlappingLeave) {
            return res.status(400).json({
                success: false,
                message: `Cannot update schedule. ${employee.name} is on an approved leave from ${new Date(overlappingLeave.fromDate).toDateString()} to ${new Date(overlappingLeave.toDate).toDateString()} which conflicts with these dates.`
            });
        }

        // ==========================================
        // 4. TRACK CHANGES & SAVE
        // ==========================================

        const changes = [];
        const fieldLabels = {
            category: "Category",
            startDate: "Start Date",
            endDate: "End Date",
            startTime: "Start Time",
            endTime: "End Time",
            allowedDays: "Working Days"
        };

        Object.keys(req.body).forEach(key => {
            if (!fieldLabels[key]) return; // Skip tracking for fields like geofence or school info

            let oldVal = assignment[key];
            let newVal = req.body[key];

            if (key.includes('Date') && oldVal) {
                oldVal = new Date(oldVal).toISOString().split('T')[0];
            }

            if (Array.isArray(oldVal)) {
                if (oldVal.sort().join(',') !== newVal.sort().join(',')) {
                    changes.push({
                        field: fieldLabels[key],
                        oldValue: oldVal.length > 0 ? oldVal.join(', ') : "None",
                        newValue: newVal.join(', ')
                    });
                }
            } else if (oldVal !== newVal) {
                changes.push({
                    field: fieldLabels[key],
                    oldValue: oldVal || 'Not Set',
                    newValue: newVal || 'Removed'
                });
            }
        });

        if (changes.length === 0 && !req.body.geofence && !req.body.schoolName) {
            return res.status(200).json({ success: true, message: "No actual changes were made." });
        }

        // Apply all validated changes to the assignment
        Object.assign(assignment, req.body);
        await employee.save();

        // ==========================================
        // 5. NOTIFICATIONS & EMAILS
        // ==========================================

        const changeSummary = changes.map(c => c.field).join(', ') || 'Location Details';
        const empMsg = `Your schedule for ${assignment.school.schoolName} was updated (${changeSummary}).`;

        const empNotification = await Notification.create({
            recipient: employee._id,
            title: "Schedule Updated",
            message: empMsg,
            type: "Assignment"
        });

        if (req.io) {
            req.io.to(employee._id.toString()).emit('new_notification', {
                _id: empNotification._id,
                title: "Schedule Updated",
                message: empMsg,
                timestamp: new Date()
            });
        }



        if (await canSendEmailToUser(employee) && changes.length > 0) {
            sendEmployeeAssignmentUpdatedEmail(
                employee.email,
                employee.name,
                assignment.school.schoolName,
                assignment.school.address,
                changes,
                assignment
            ).catch(err => console.error("Employee Detailed Email Error:", err));
        }

        const admins = await User.find({
            role: { $in: ['Admin'] },
            _id: { $ne: req.user._id }
        });

        const adminMsg = `${employee.name}'s schedule for ${assignment.school.schoolName} was updated by ${req.user.name}.`;

        await Promise.all(admins.map(async (admin) => {
            const adminNotif = await Notification.create({
                recipient: admin._id,
                title: "System Alert: Schedule Updated",
                message: adminMsg,
                type: "System"
            });

            if (req.io) {
                req.io.to(admin._id.toString()).emit('new_notification', {
                    _id: adminNotif._id,
                    title: adminNotif.title,
                    message: adminNotif.message,
                    timestamp: new Date()
                });
            }

            if (await canSendEmailToUser(admin) && changes.length > 0) {
                sendAdminAssignmentUpdatedEmail(
                    admin.email,
                    admin.name,
                    employee.name,
                    assignment.school.schoolName,
                    assignment.school.address,
                    assignment.category
                ).catch(err => console.error("Admin Update Email Error:", err));
            }
        }));

        res.status(200).json({ success: true, message: "Assignment updated and teacher notified of specific changes." });

    } catch (error) {
        console.error("Update Assignment Error:", error);
        res.status(500).json({ success: false, message: "Server error updating assignment." });
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
        const { name, email, phone, zone, password } = req.body;

        const targetUser = await User.findById(id);
        if (!targetUser) return res.status(404).json({ success: false, message: "User not found" });

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
        if (email) targetUser.email = email;
        if (phone) targetUser.mobile = phone;
        if (zone) targetUser.zone = zone;
        if (password && password.trim() !== "") {
            targetUser.password = await bcrypt.hash(password, 10);

            // --- NEW DEVICE UNBIND LOGIC ---
            // Because the admin is resetting the password (likely due to a lost phone),
            // we wipe the old device from memory and force the First Login flow again.
            targetUser.isFirstLogin = true;
            targetUser.deviceId = null;
            // -------------------------------
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
        res.status(200).json({ success: true, message: "Profile updated and parties notified.", data });

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
// 10. ASSIGN TASK TO EMPLOYEE (UPDATED)
// ==========================================
adminRouter.post('/employees/:id/assign-task', userAuth, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { schoolName, schoolAddress, latitude, longitude, taskDescription, category, daysAllotted, duration, timing } = req.body;

        const employee = await User.findById(id);
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });

        // --- NEW LEAVE RESTRICTION CHECK ---
        const today = new Date();
        const activeLeave = await LeaveRequest.findOne({
            employee: employee._id,
            status: 'approved',
            fromDate: { $lte: today },
            toDate: { $gte: today }
        });

        if (activeLeave) {
            return res.status(400).json({
                success: false,
                message: `Cannot assign task. ${employee.name} is currently on an approved leave until ${new Date(activeLeave.toDate).toDateString()}.`
            });
        }
        // ------------------------------------

        // --- COORDINATE SAFETY CHECK ---
        // Only parse them if they are actually provided to prevent [0,0] bugs
        let lat = null;
        let lng = null;
        if (latitude && longitude) {
            lat = parseFloat(latitude);
            lng = parseFloat(longitude);
        }

        // --- SCHOOL CREATION OR UPDATE ---
        let school = await School.findOne({ schoolName: { $regex: new RegExp(`^${schoolName}$`, 'i') } });

        if (!school) {
            // Create new if it doesn't exist (and ensure we have coordinates)
            if (lat === null || lng === null) {
                return res.status(400).json({ success: false, message: "Coordinates are required to create a new school." });
            }

            school = new School({
                schoolName,
                address: schoolAddress || "No address provided",
                location: { type: 'Point', coordinates: [lng, lat] }
            });
            await school.save();
        } else {
            // Update the existing school ONLY IF new coordinates were provided
            if (lat !== null && lng !== null) {
                school.location = { type: 'Point', coordinates: [lng, lat] };
                if (schoolAddress) school.address = schoolAddress;
                await school.save();
            }
        }

        const newTask = await Task.create({
            teacher: id,
            school: school._id,
            taskDescription,
            category: category || "Junior Band",
            daysAllotted,
            duration,
            timing,
            status: 'Pending'
        });

        const populatedTask = await Task.findById(newTask._id).populate('school');

        const taskTitle = `Assignment at ${school.schoolName}`;
        const scheduleString = `${daysAllotted.join(', ')} (${timing})`;

        if (await canSendEmailToUser(employee)) {
            sendEmployeeTaskAssignedEmail(employee.email, employee.name, taskTitle, taskDescription, scheduleString, category);
        }

        const empNotif = await Notification.create({
            recipient: employee._id,
            title: "New Task Assigned",
            message: `You have a new task at ${school.schoolName}.`,
            type: "Assignment"
        });

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

            const adminNotif = await Notification.create({
                recipient: admin._id,
                title: "System Alert: Task Assigned",
                message: `${employee.name} was assigned a task at ${school.schoolName}.`,
                type: "System"
            });

            if (req.io) req.io.to(admin._id.toString()).emit('new_notification', adminNotif);
        }));

        res.status(200).json({ success: true, message: "Task assigned successfully.", data: populatedTask });
    } catch (error) {
        console.error("Assign Task Error:", error);
        res.status(500).json({ success: false, message: "Server error assigning task." });
    }
});

// ==========================================
// 11. UPDATE TASK
// ==========================================
adminRouter.put('/tasks/:taskId', userAuth, adminAuth, async (req, res) => {
    try {
        const { taskId } = req.params;
        const task = await Task.findById(taskId).populate('school').populate('teacher');

        if (!task) return res.status(404).json({ success: false, message: "Task not found." });

        const employee = task.teacher;

        // --- NEW LEAVE RESTRICTION CHECK ---
        const today = new Date();
        const activeLeave = await LeaveRequest.findOne({
            employee: employee._id,
            status: 'approved',
            fromDate: { $lte: today },
            toDate: { $gte: today }
        });

        // Block if on leave, BUT allow the update if it's just the employee accepting/rejecting it via a proxy route
        if (activeLeave && !req.body.status) {
            return res.status(400).json({
                success: false,
                message: `Cannot update task details. ${employee.name} is currently on an approved leave until ${new Date(activeLeave.toDate).toDateString()}.`
            });
        }
        // ------------------------------------

        const schoolName = task.school.schoolName;
        const taskTitle = `Assignment at ${schoolName}`;

        const changes = [];
        const fieldLabels = {
            taskDescription: "Description",
            duration: "Duration",
            timing: "Timing",
            status: "Updation",
            daysAllotted: "Days Allotted"
        };

        Object.keys(req.body).forEach(key => {
            if (!fieldLabels[key]) return;

            let oldVal = task[key];
            let newVal = req.body[key];

            if (Array.isArray(oldVal)) {
                if (oldVal.sort().join(',') !== newVal.sort().join(',')) {
                    changes.push({
                        field: fieldLabels[key],
                        oldValue: oldVal.length > 0 ? oldVal.join(', ') : "None",
                        newValue: newVal.join(', ')
                    });
                }
            }
            else if (oldVal !== newVal) {
                changes.push({
                    field: fieldLabels[key],
                    oldValue: oldVal || 'Not Set',
                    newValue: newVal || 'Removed'
                });
            }
        });

        if (changes.length === 0) {
            return res.status(200).json({ success: true, message: "No changes made." });
        }

        Object.assign(task, req.body);

        if (req.body.status && req.body.status !== 'Rejected') {
            task.rejectReason = null;
        }

        await task.save();

        const changeSummary = changes.map(c => c.field).join(', ');


        if (await canSendEmailToUser(employee)) {
            const formattedTask = {
                description: task.taskDescription,
                dueDate: `${task.daysAllotted.join(', ')} (${task.timing})`,
                status: task.status,
                rejectionReason: task.rejectReason
            };
            sendEmployeeTaskUpdatedEmail(employee.email, employee.name, taskTitle, changes, formattedTask);
        }

        const empNotif = await Notification.create({
            recipient: employee._id,
            title: "Task Updated",
            message: `Your task at ${schoolName} was updated (${changeSummary}).`,
            type: "Updation"
        });

        if (req.io) req.io.to(employee._id.toString()).emit('new_notification', empNotif);

        const admins = await User.find({ role: { $in: ['Admin'] }, _id: { $ne: req.user._id } });

        const detailsHtml = changes.map(c => `
             <div class="card-item" style="padding-top: 8px; border-top: 1px solid #e4e4e7;">
                <span class="label">${c.field} Changed</span>
                <div class="value" style="font-weight: 400; color: #52525b;">From: <span style="text-decoration: line-through;">${c.oldValue}</span></div>
                <div class="value">To: ${c.newValue}</div>
             </div>
        `).join('');

        await Promise.all(admins.map(async (admin) => {
            if (await canSendEmailToUser(admin)) {
                sendAdminTaskAuditEmail(admin.email, admin.name, employee.name, taskTitle, "UPDATED", detailsHtml);
            }

            const adminNotif = await Notification.create({
                recipient: admin._id,
                title: "System Alert: Task Updated",
                message: `${req.user.name} updated a task for ${employee.name}.`,
                type: "System"
            });

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

        await Task.findByIdAndDelete(taskId);



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
// 17. GET Admin Dashboard (ULTIMATE REAL-TIME LOG)
// ==========================================
adminRouter.get('/dashboard-stats', userAuth, adminAuth, async (req, res) => {
    try {
        const today = new Date();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const dateFormatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
        });
        const dateString = dateFormatter.format(today);
        const currentDayName = getISTDayOfWeek();

        const employees = await User.find({ role: 'Employee', isActive: true });
        const totalEmployees = employees.length;

        const activeLeaves = await LeaveRequest.find({
            status: 'approved',
            fromDate: { $lte: todayEnd },
            toDate: { $gte: todayStart }
        });

        const uniqueEmployeesOnLeave = [...new Set(activeLeaves.map(leave => leave.employee.toString()))];
        const onLeaveToday = uniqueEmployeesOnLeave.length;
        const usersOnLeaveSet = new Set(uniqueEmployeesOnLeave);

        const normalizedToday = new Date();
        normalizedToday.setHours(0, 0, 0, 0);

        let expectedShifts = 0;
        employees.forEach(emp => {
            if (!emp.assignments || emp.assignments.length === 0) return;
            if (usersOnLeaveSet.has(emp._id.toString())) return;

            emp.assignments.forEach(assign => {
                if (!assign.school) return;
                const assignmentStartDate = assign.startDate ? new Date(assign.startDate) : assign._id.getTimestamp();
                const normalizedStartDate = new Date(assignmentStartDate);
                normalizedStartDate.setHours(0, 0, 0, 0);

                const isAfterStartDate = normalizedToday >= normalizedStartDate;
                let isBeforeEndDate = true;
                if (assign.endDate) {
                    const normalizedEndDate = new Date(assign.endDate);
                    normalizedEndDate.setHours(23, 59, 59, 999);
                    isBeforeEndDate = normalizedToday <= normalizedEndDate;
                }

                if (isAfterStartDate && isBeforeEndDate && assign.allowedDays.includes(currentDayName)) {
                    expectedShifts++;
                }
            });
        });

        const todaysAttendance = await Attendance.find({ date: dateString })
            .populate('teacher', 'name zone profilePicture')
            .populate('school', 'schoolName address')
            .sort({ updatedAt: -1 });

        const recentLeaves = await LeaveRequest.find({
            updatedAt: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) }
        })
            .populate('employee', 'name zone profilePicture')
            .sort({ updatedAt: -1 });

        // UPDATED OVERVIEW STATS: presentCount now represents "On-Site" (Present but not Checked Out)
        let presentCount = 0;
        let noShowCount = 0;

        todaysAttendance.forEach(record => {
            if (['Present', 'Late', 'Event'].includes(record.status) && !record.checkOutTime) {
                presentCount++;
            }
            if (record.status === 'Absent') noShowCount++;
        });

        const pendingCount = Math.max(0, expectedShifts - todaysAttendance.length);

        // UPDATED ACTIVITY FEED: Map action based on checkOutTime field
        const attendanceActivity = todaysAttendance.map(att => {
            const diffMins = Math.round((new Date() - new Date(att.updatedAt)) / 60000);

            let actionText = "Status Updated";
            if (att.checkOutTime) {
                actionText = "Checked Out";
            } else if (att.status === 'Present') {
                actionText = "Checked In";
            } else if (att.status === 'Late') {
                actionText = "Late Check-in";
            } else if (att.status === 'Absent') {
                actionText = "Marked Absent";
            } else if (att.status === 'Holiday') {
                actionText = "Marked Holiday";
            } else if (att.status === 'Event') {
                actionText = "Added Event Note";
            }

            let displayTime = att.updatedAt;
            if (att.checkOutTime) displayTime = att.checkOutTime;
            else if (att.status === 'Present' || att.status === 'Late') displayTime = att.checkInTime || att.updatedAt;

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
                    presentToday: presentCount,
                    noShow: noShowCount,
                    pending: pendingCount,
                    onLeaveToday
                },
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
        // Fetch reports for the specific employee, sorted by newest first
        const reports = await DailyReports.find({ teacher: id }).sort({ date: -1 });

        res.status(200).json({ success: true, data: reports });
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
                const fromStr = new Date(leaveRequest.fromDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                const toStr = new Date(leaveRequest.toDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

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
        // 1. Your original query (Kept exactly as you wrote it)
        const employees = await User.find({ role: 'Employee' })
            .select('-password')
            .populate('assignments.school', 'schoolName address location');

        // Calculate date ranges for "Last Month"
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1); // 1st of this month
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

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
                $group: {
                    _id: "$school",
                    bands: { $addToSet: "$band" }
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
                    bands: 1
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
// 25. GET MEDIA GALLERY
// ==========================================
adminRouter.get('/media', userAuth, adminAuth, async (req, res) => {
    try {
        const { teacher, school, band, year } = req.query;
        const query = {};

        if (teacher) query.teacher = teacher;
        if (school) query.school = school;
        if (band) query.band = band;

        if (year) {
            const startYear = new Date(year, 0, 1);
            const endYear = new Date(parseInt(year) + 1, 0, 1);
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
// 31. FETCH ADMIN PROFILE
// ==========================================
adminRouter.get('/me/profile', userAuth, adminAuth, async (req, res) => {
    try {
        // req.user is already attached by your userAuth middleware
        // We just need to select the fields we want to send back to the frontend

        const adminData = await User.findById(req.user._id)
            .select('name email role profilePicture mobile') // Add any other fields you want to display
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


module.exports = adminRouter;