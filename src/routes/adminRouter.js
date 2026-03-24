const express = require('express');
const User = require('../models/User');
const crypto = require('crypto');
const validator = require('validator');
const bcrypt = require('bcrypt');
const adminRouter = express.Router();
const { sendAdminWelcomeEmail, sendEmployeeWelcomeEmail, sendSchoolAssignmentEmail, sendAdminAssignmentAlertEmail, sendEmployeeAssignmentRevokedEmail, sendAdminAssignmentRevokedEmail, sendEmployeeAssignmentUpdatedEmail, sendAdminAssignmentUpdatedEmail, sendEmployeeProfileUpdatedEmail, sendAdminAuditEmail, sendEmployeeProfileDeletedEmail, sendEmployeeTaskAssignedEmail, sendAdminTaskAuditEmail, sendEmployeeTaskUpdatedEmail, sendEmployeeTaskRevokedEmail, sendEmployeeWarningEmail, sendAdminWarningAuditEmail } = require('../utils/emailService');
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

// ==========================================
// EMAIL GATEKEEPER HELPER
// ==========================================
// This guarantees that BOTH the Admin's Master Override and the 
// Target User's Personal Settings are respected before sending an email.
const canSendEmailToUser = (actionAdminDoc, targetUserDoc) => {
    if (!actionAdminDoc || !targetUserDoc) return true; // Default to send if context is missing

    const isTargetAdmin = ['Admin', 'SuperAdmin'].includes(targetUserDoc.role);

    // 1. Check the Action Admin's Master Switches
    const masterSwitch = isTargetAdmin
        ? actionAdminDoc.preferences?.adminNotifications
        : actionAdminDoc.preferences?.employeeNotifications;

    // 2. Check the Target User's Personal Switches
    const targetSwitch = isTargetAdmin
        ? targetUserDoc.preferences?.adminNotifications
        : targetUserDoc.preferences?.employeeNotifications;

    // 3. Bulletproof evaluation (Handles cases where DB contains string "false" by mistake)
    const masterAllows = (masterSwitch === false || masterSwitch === 'false') ? false : true;
    const targetAllows = (targetSwitch === false || targetSwitch === 'false') ? false : true;

    return masterAllows && targetAllows;
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

        const actionAdmin = await User.findById(req.user._id);

        if (canSendEmailToUser(actionAdmin, adminUser)) {
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

        const actionAdmin = await User.findById(req.user._id);

        if (canSendEmailToUser(actionAdmin, employeeUser)) {
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
            .select('_id name designation zone role')
            .sort({ createdAt: -1 });

        const formattedRoster = employees.map(emp => ({
            id: emp._id,
            name: emp.name,
            role: emp.designation || 'Unassigned',
            location: emp.zone || 'Unassigned',
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
// 5. ASSIGN SCHOOL TO EMPLOYEE
// ==========================================
adminRouter.post('/employees/:id/assign-school', userAuth, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { schoolName, schoolAddress, category, startDate, endDate, startTime, endTime, allowedDays, latitude, longitude } = req.body;

        const employee = await User.findById(id);
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });

        let school = await School.findOne({ schoolName: { $regex: new RegExp(`^${schoolName}$`, 'i') } });
        if (!school) {
            school = new School({
                schoolName,
                address: schoolAddress,
                location: { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] }
            });
            await school.save();
        }

        const newAssignment = {
            school: school._id, category, startDate, endDate: endDate || null, startTime, endTime, allowedDays,
            geofence: { latitude: parseFloat(latitude), longitude: parseFloat(longitude) }
        };
        employee.assignments.push(newAssignment);
        await employee.save();

        const empMsg = `You have been assigned to ${school.schoolName} for the ${category} shift starting ${startDate}.`;
        const actionAdmin = await User.findById(req.user._id);

        if (canSendEmailToUser(actionAdmin, employee)) {
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

        const admins = await User.find({
            role: { $in: ['Admin'] },
            _id: { $ne: req.user._id }
        });

        const adminMsg = `${employee.name} has been assigned to ${school.schoolName} (${category}).`;

        await Promise.all(admins.map(async (admin) => {
            if (canSendEmailToUser(actionAdmin, admin)) {
                sendAdminAssignmentAlertEmail(admin.email, admin.name, employee.name, school.schoolName, school.address, category, startDate)
                    .catch(e => console.error("Admin email failed", e));
            }

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
        const employee = await User.findById(empId).populate('assignments.school');
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found" });

        const assignment = employee.assignments.id(assignmentId);
        if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });

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
            if (!fieldLabels[key]) return;

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

        if (changes.length === 0) {
            return res.status(200).json({ success: true, message: "No actual changes were made." });
        }

        Object.assign(assignment, req.body);
        await employee.save();

        const changeSummary = changes.map(c => c.field).join(', ');
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

        const actionAdmin = await User.findById(req.user._id);

        if (canSendEmailToUser(actionAdmin, employee)) {
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

            if (canSendEmailToUser(actionAdmin, admin)) {
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

        const actionAdmin = await User.findById(req.user._id);

        if (canSendEmailToUser(actionAdmin, employee)) {
            sendEmployeeAssignmentRevokedEmail(employee.email, employee.name, schoolName, schoolAddress, category).catch(console.error);
        }

        const admins = await User.find({ role: { $in: ['Admin'] }, _id: { $ne: req.user._id } });
        const adminMsg = `${employee.name}'s assignment at ${schoolName} was revoked.`;

        await Promise.all(admins.map(async (admin) => {
            const adminNotif = await Notification.create({ recipient: admin._id, title: "System Alert: Assignment Revoked", message: adminMsg, type: "System" });
            if (req.io) {
                req.io.to(admin._id.toString()).emit('new_notification', { _id: adminNotif._id, title: adminNotif.title, message: adminNotif.message, timestamp: new Date() });
            }
            if (canSendEmailToUser(actionAdmin, admin)) {
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

        if (name) targetUser.name = name;
        if (email) targetUser.email = email;
        if (phone) targetUser.mobile = phone;
        if (zone) targetUser.zone = zone;
        if (password && password.trim() !== "") {
            targetUser.password = await bcrypt.hash(password, 10);
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

        const actionAdmin = await User.findById(req.user._id);

        if (canSendEmailToUser(actionAdmin, targetUser)) {
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

            if (canSendEmailToUser(actionAdmin, admin)) {
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

        const actionAdmin = await User.findById(req.user._id);
        const shouldNotifyDeletedUser = canSendEmailToUser(actionAdmin, userToDelete);

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

            if (canSendEmailToUser(actionAdmin, admin)) {
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
// 10. ASSIGN TASK TO EMPLOYEE
// ==========================================
adminRouter.post('/employees/:id/assign-task', userAuth, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { schoolName, schoolAddress, latitude, longitude, taskDescription, category, daysAllotted, duration, timing } = req.body;

        const employee = await User.findById(id);
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });

        let school = await School.findOne({ schoolName: { $regex: new RegExp(`^${schoolName}$`, 'i') } });
        if (!school) {
            school = new School({
                schoolName,
                address: schoolAddress || "No address provided",
                location: {
                    type: 'Point',
                    coordinates: [parseFloat(longitude || 0), parseFloat(latitude || 0)]
                }
            });
            await school.save();
        }

        const newTask = await Task.create({
            teacher: id,
            school: school._id,
            taskDescription,
            daysAllotted,
            duration,
            timing,
            status: 'Pending'
        });

        const populatedTask = await Task.findById(newTask._id).populate('school');

        const taskTitle = `Assignment at ${school.schoolName}`;
        const scheduleString = `${daysAllotted.join(', ')} (${timing})`;

        const actionAdmin = await User.findById(req.user._id);

        if (canSendEmailToUser(actionAdmin, employee)) {
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
            if (canSendEmailToUser(actionAdmin, admin)) {
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
        const actionAdmin = await User.findById(req.user._id);

        if (canSendEmailToUser(actionAdmin, employee)) {
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
            if (canSendEmailToUser(actionAdmin, admin)) {
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

        const actionAdmin = await User.findById(req.user._id);

        if (canSendEmailToUser(actionAdmin, employee)) {
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
            if (canSendEmailToUser(actionAdmin, admin)) {
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
        const actionAdmin = await User.findById(req.user._id);

        if (canSendEmailToUser(actionAdmin, employee)) {
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
            if (canSendEmailToUser(actionAdmin, admin)) {
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
// 15. GET EMPLOYEE ATTENDANCE (HIERARCHICAL) 
// ==========================================
adminRouter.get('/employees/:id/attendance', userAuth, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const employee = await User.findById(id);
        if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });

        // 1. Fetch Attendance (Use .lean() for faster processing)
        const attendances = await Attendance.find({ teacher: id })
            .populate('school', 'schoolName')
            .sort({ date: -1 })
            .lean();

        // 2. Fetch Daily Reports from the NEW schema
        const dailyReports = await DailyReports.find({ teacher: id }).lean();

        const monthMap = new Map();

        const formatTime = (dateString) => {
            if (!dateString) return "-";
            return new Date(dateString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        };

        attendances.forEach(att => {
            const schoolName = att.school ? att.school.schoolName : "Unknown/Deleted School";
            const schoolId = att.school ? att.school._id.toString() : "deleted-school";

            const dateObj = new Date(att.date);
            const year = dateObj.getFullYear();
            const monthName = dateObj.toLocaleString('en-US', { month: 'long' });
            const monthKey = `${year}-${dateObj.getMonth() + 1}`;
            const formattedMonth = `${monthName} ${year}`;

            if (!monthMap.has(monthKey)) {
                monthMap.set(monthKey, {
                    id: monthKey,
                    month: formattedMonth,
                    schoolsMap: new Map()
                });
            }
            const monthObj = monthMap.get(monthKey);

            if (!monthObj.schoolsMap.has(schoolId)) {
                monthObj.schoolsMap.set(schoolId, {
                    id: schoolId,
                    name: schoolName,
                    categoriesMap: new Map()
                });
            }
            const schoolObj = monthObj.schoolsMap.get(schoolId);

            const categoryName = att.band || "Uncategorized";
            const categoryId = `${schoolId}-${categoryName}`;

            if (!schoolObj.categoriesMap.has(categoryId)) {
                schoolObj.categoriesMap.set(categoryId, {
                    id: categoryId,
                    name: categoryName,
                    recordCount: 0,
                    metrics: { present: 0, late: 0, absent: 0, events: 0, holidays: 0 },
                    records: []
                });
            }
            const catObj = schoolObj.categoriesMap.get(categoryId);

            catObj.recordCount++;
            const statusUpper = (att.status || "UNKNOWN").toUpperCase();
            if (statusUpper === 'PRESENT') catObj.metrics.present++;
            else if (statusUpper === 'LATE') catObj.metrics.late++;
            else if (statusUpper === 'ABSENT') catObj.metrics.absent++;
            else if (statusUpper === 'HOLIDAY') catObj.metrics.holidays++;
            else if (statusUpper === 'EVENT') catObj.metrics.events++;

            const dayName = dateObj.toLocaleString('en-US', { weekday: 'short' });
            const dayNum = dateObj.getDate().toString().padStart(2, '0');
            const shortMonth = dateObj.toLocaleString('en-US', { month: 'short' });

            const formattedDate = `${shortMonth} ${dayNum}, ${year} (${dayName})`;
            const displayNote = att.teacherNote || att.lateReason || att.eventNote || null;

            // --- MAGIC FIX: FIND THE MATCHING DAILY REPORT FROM THE NEW DATABASE ---
            const reportForDay = dailyReports.find(report => report.date === att.date);

            catObj.records.push({
                id: att._id.toString(),
                date: formattedDate,
                time: formatTime(att.checkInTime) || "-",
                status: statusUpper,
                checkIn: formatTime(att.checkInTime),
                checkOut: formatTime(att.checkOutTime),
                hasReport: !!reportForDay,           // Now checks the new schema
                dailyReport: reportForDay || null,   // Now attaches the full object
                teacherNote: att.teacherNote,
                lateReason: att.lateReason,
                note: displayNote ? `"${displayNote}"` : null
            });
        });

        const hierarchicalData = Array.from(monthMap.values()).map(m => ({
            id: m.id,
            month: m.month,
            schools: Array.from(m.schoolsMap.values()).map(s => ({
                id: s.id,
                name: s.name,
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
// 17. GET Admin Dashboard
// ==========================================
adminRouter.get('/dashboard-stats', userAuth, adminAuth, async (req, res) => {
    try {
        const today = new Date();
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const currentDayName = days[today.getDay()];

        const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
        const dateString = dateFormatter.format(today);

        const employees = await User.find({ role: 'Employee', isActive: true });
        const totalEmployees = employees.length;

        let expectedShifts = 0;
        employees.forEach(emp => {
            if (emp.assignments && emp.assignments.length > 0) {
                emp.assignments.forEach(assignment => {
                    if (assignment.allowedDays.includes(currentDayName)) {
                        expectedShifts++;
                    }
                });
            }
        });

        const todaysAttendance = await Attendance.find({ date: dateString })
            .populate('teacher', 'name zone')
            .populate('school', 'schoolName address')
            .sort({ createdAt: -1 });

        let presentCount = 0;
        let noShowCount = 0;

        todaysAttendance.forEach(record => {
            if (['Present', 'Late', 'Event'].includes(record.status)) presentCount++;
            if (record.status === 'Absent') noShowCount++;
        });

        const pendingCount = Math.max(0, expectedShifts - todaysAttendance.length);

        const recentActivity = todaysAttendance.slice(0, 15).map(att => {
            const timeDiffMs = new Date() - new Date(att.createdAt);
            const diffMins = Math.round(timeDiffMs / 60000);
            const timeAgo = diffMins < 1 ? "Just now" : diffMins < 60 ? `${diffMins} min ago` : `${Math.floor(diffMins / 60)} hr ago`;

            return {
                id: att._id,
                name: att.teacher?.name || "Unknown Teacher",
                zone: att.teacher?.zone || "Unassigned",
                school: att.school?.schoolName || "Unknown School",
                category: att.band,
                action: att.status === 'Late' ? "Late Check-in" :
                    att.status === 'Absent' ? "Marked Absent" :
                        att.status === 'Event' ? "Live Event Started" : "Marked Present",
                timeAgo: timeAgo,
                checkInTime: att.checkInTime ? new Date(att.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : "-",
                status: att.status.toLowerCase() === 'present' || att.status.toLowerCase() === 'event' ? 'present' :
                    att.status.toLowerCase() === 'absent' ? 'absent' : 'warning'
            };
        });

        res.json({
            success: true,
            data: {
                stats: {
                    totalEmployees,
                    presentToday: presentCount,
                    noShow: noShowCount,
                    pending: pendingCount
                },
                recentActivity
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
adminRouter.put('/settings/preferences', userAuth, async (req, res) => {
    try {
        const { systemLanguage, adminNotifications, employeeNotifications } = req.body;

        // Use $set to strictly bypass any Mongoose nested-object tracking issues
        const updateData = {};
        if (systemLanguage !== undefined) updateData['preferences.systemLanguage'] = systemLanguage;
        if (adminNotifications !== undefined) updateData['preferences.adminNotifications'] = adminNotifications;
        if (employeeNotifications !== undefined) updateData['preferences.employeeNotifications'] = employeeNotifications;

        const user = await User.findByIdAndUpdate(
            req.user._id,
            { $set: updateData },
            { returnDocument: 'after' }
        );

        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        res.status(200).json({
            success: true,
            message: "Preferences updated successfully.",
            preferences: user.preferences
        });
    } catch (error) {
        console.error("Update Preferences Error:", error);
        res.status(500).json({ success: false, message: "Server error updating preferences." });
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

module.exports = adminRouter;