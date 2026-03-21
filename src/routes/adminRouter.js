const express = require('express');
const User = require('../models/User');
const crypto = require('crypto');
const validator = require('validator');
const bcrypt = require('bcrypt');
const adminRouter = express.Router();
const { sendAdminWelcomeEmail, sendEmployeeWelcomeEmail, sendSchoolAssignmentEmail, sendAdminAssignmentAlertEmail, sendEmployeeAssignmentRevokedEmail, sendAdminAssignmentRevokedEmail, sendEmployeeAssignmentUpdatedEmail, sendAdminAssignmentUpdatedEmail } = require('../utils/emailService');
const adminAuth = require('../middleware/adminAuth');
const userAuth = require('../middleware/userAuth');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const School = require('../models/School');
const Notification = require('../models/Notification');


// ==========================================
// 1. CREATE ADMIN (SuperAdmin Only)
// ==========================================
adminRouter.post('/create-admin', userAuth, requireSuperAdmin, async (req, res) => {
    try {
        const { name, email, mobile, employeeId, password } = req.body;

        // 1. Basic empty field check
        if (!name || !email || !employeeId || !password) {
            return res.status(400).json({ success: false, message: "All required fields must be provided." });
        }

        // 2. VALIDATOR CHECKS <-- Added Here
        if (!validator.isEmail(email)) {
            return res.status(400).json({ success: false, message: "Please enter a valid email address." });
        }
        if (!validator.isStrongPassword(password)) {
            return res.status(400).json({
                success: false,
                message: "Password is not strong enough. It must contain at least 8 characters, 1 uppercase, 1 lowercase, 1 number, and 1 symbol."
            });
        }

        // 3. Check for existing users
        const existingUser = await User.findOne({ $or: [{ email }, { employeeId }] });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Email or Admin ID already in use." });
        }

        // 4. Hash Password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // 4. CLEAN UPSERT LOGIC
        const adminUser = await User.findOneAndUpdate(
            { email: email }, // Search criteria
            {
                $set: {       // Data to update or insert
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
                new: true,                  // Return the updated document
                upsert: true,               // Create if it doesn't exist
                runValidators: true,        // Run schema validations
                setDefaultsOnInsert: true   // Apply default values (like isActive: true) if creating new
            }
        );

        // 5. Send Email
        const emailSent = await sendAdminWelcomeEmail(email, name, employeeId, password);
        if (!emailSent) console.warn(`Failed to send welcome email to ${email}`);

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
        // Matches the 4 fields from your Add New Employee UI (image_fbf40b.png)
        const { name, email, mobile, designation, zone } = req.body;

        // 1. Validation
        if (!name || !email || !mobile) {
            return res.status(400).json({ success: false, message: "All fields are mandatory." });
        }
        if (!validator.isEmail(email)) {
            return res.status(400).json({ success: false, message: "Please enter a valid email address." });
        }

        // 2. Auto-Generate Credentials
        const currentYear = new Date().getFullYear();
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const generatedEmployeeId = `EMP-${currentYear}-${randomNum}`;
        const defaultPassword = "Welcome123!";
        const hashedDefaultPassword = await bcrypt.hash(defaultPassword, 10);

        // 3. CLEAN UPSERT LOGIC
        const employeeUser = await User.findOneAndUpdate(
            { email: email }, // Search criteria
            {
                $set: {       // Data to update or insert
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
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            }
        );

        // 4. Send Email
        const emailSent = await sendEmployeeWelcomeEmail(email, name, generatedEmployeeId, defaultPassword);
        if (!emailSent) console.warn(`Failed to send welcome email to ${email}`);

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
        // Fetch users who have the system role of 'Employee'
        // We use .select() to only grab the fields we need, making the API super fast
        const employees = await User.find({ role: 'Employee' })
            .select('_id name designation zone')
            .sort({ createdAt: -1 }); // Newest employees first

        // Map the database fields to exactly match what your React frontend expects
        const formattedRoster = employees.map(emp => ({
            id: emp._id,
            name: emp.name,
            role: emp.designation || 'Unassigned', // Maps to the UI "Role" column
            location: emp.zone || 'Unassigned',    // Maps to the UI "Location" column
        }));

        res.status(200).json({
            success: true,
            data: formattedRoster
        });

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
        // THE CRITICAL FIX: .populate() replaces the school ID with the full School object!
        const employee = await User.findById(req.params.id)
            .select('-password')
            .populate('assignments.school');

        if (!employee) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }

        res.status(200).json({ success: true, data: employee });
    } catch (error) {
        console.error("Fetch Employee Error:", error);
        res.status(500).json({ success: false, message: "Server error while fetching employee details." });
    }
});

// ==========================================
// 5. ASSIGN SCHOOL TO EMPLOYEE
// ==========================================
adminRouter.post('/employees/:id/assign-school', userAuth, adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { schoolName, schoolAddress, category, startDate, endDate, startTime, endTime, allowedDays, latitude, longitude } = req.body;

        // 1. Find Employee & Handle School Creation
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

        // 2. Save Assignment to Employee
        const newAssignment = {
            school: school._id, category, startDate, endDate: endDate || null, startTime, endTime, allowedDays,
            geofence: { latitude: parseFloat(latitude), longitude: parseFloat(longitude) }
        };
        employee.assignments.push(newAssignment);
        await employee.save();

        // ==========================================
        // 3. BACKGROUND NOTIFICATIONS (Fire & Forget)
        // ==========================================

        // --- A. Notify the Employee ---
        const empMsg = `You have been assigned to ${school.schoolName} for the ${category} shift starting ${startDate}.`;

        if (employee.preferences?.employeeNotifications !== false) {
            // NEW: Added school.address here
            sendSchoolAssignmentEmail(employee.email, employee.name, school.schoolName, school.address, category, startDate, startTime)
                .catch(e => console.error("Employee email failed", e));
        }

        // NEW: Save to Database so it stays in their notification history!
        const empNotification = await Notification.create({
            recipient: employee._id,
            title: "New School Assignment",
            message: empMsg,
            type: "Assignment"
        });

        if (req.io) {
            // Include the ID so the frontend can mark this specific notification as read later
            req.io.to(employee._id.toString()).emit('new_notification', {
                _id: empNotification._id,
                title: empNotification.title,
                message: empNotification.message,
                timestamp: empNotification.createdAt
            });
        }

        // --- B. Notify All Admins & SuperAdmins ---
        const admins = await User.find({
            role: { $in: ['Admin'] },
            _id: { $ne: req.user._id }
        });

        const adminMsg = `${employee.name} has been assigned to ${school.schoolName} (${category}).`;

        // Process admins concurrently using Promise.all for better performance
        await Promise.all(admins.map(async (admin) => {
            // Email
            if (admin.preferences?.adminNotifications !== false) {
                // NEW: Added school.address here
                sendAdminAssignmentAlertEmail(admin.email, admin.name, employee.name, school.schoolName, school.address, category, startDate)
                    .catch(e => console.error("Admin email failed", e));
            }

            // NEW: Save to Database for the Admin
            const adminNotification = await Notification.create({
                recipient: admin._id,
                title: "System Alert: Staff Assigned",
                message: adminMsg,
                type: "System"
            });

            // Socket
            if (req.io) {
                req.io.to(admin._id.toString()).emit('new_notification', {
                    _id: adminNotification._id,
                    title: adminNotification.title,
                    message: adminNotification.message,
                    timestamp: adminNotification.createdAt
                });
            }
        }));

        // 4. Return Success
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

        // 1. BUILD THE CHANGE LOG
        const changes = [];
        const fieldLabels = {
            category: "Category",
            startDate: "Start Date",
            endDate: "End Date",
            startTime: "Start Time",
            endTime: "End Time",
            allowedDays: "Working Days"
        };

        // We compare the keys coming in req.body with the current values in the DB
        Object.keys(req.body).forEach(key => {
            if (!fieldLabels[key]) return; // Skip fields we don't want to track

            let oldVal = assignment[key];
            let newVal = req.body[key];

            // Normalize Dates for comparison (YYYY-MM-DD)
            if (key.includes('Date') && oldVal) {
                oldVal = new Date(oldVal).toISOString().split('T')[0];
            }

            // Comparison Logic
            if (Array.isArray(oldVal)) {
                // Compare arrays (like allowedDays) by sorting and joining
                if (oldVal.sort().join(',') !== newVal.sort().join(',')) {
                    changes.push({
                        field: fieldLabels[key],
                        oldValue: oldVal.length > 0 ? oldVal.join(', ') : "None",
                        newValue: newVal.join(', ')
                    });
                }
            } else if (oldVal !== newVal) {
                // Standard string/number comparison
                changes.push({
                    field: fieldLabels[key],
                    oldValue: oldVal || 'Not Set',
                    newValue: newVal || 'Removed'
                });
            }
        });

        // 2. IF NO CHANGES DETECTED, RETURN EARLY
        if (changes.length === 0) {
            return res.status(200).json({ success: true, message: "No actual changes were made." });
        }

        // 3. APPLY UPDATES & SAVE
        Object.assign(assignment, req.body);
        await employee.save();

        // 4. BACKGROUND NOTIFICATIONS
        const changeSummary = changes.map(c => c.field).join(', ');
        const empMsg = `Your schedule for ${assignment.school.schoolName} was updated (${changeSummary}).`;

        // In-App Notification (Database)
        const empNotification = await Notification.create({
            recipient: employee._id,
            title: "Schedule Updated",
            message: empMsg,
            type: "Assignment"
        });

        // Real-time Socket
        if (req.io) {
            req.io.to(employee._id.toString()).emit('new_notification', {
                _id: empNotification._id,
                title: "Schedule Updated",
                message: empMsg,
                timestamp: new Date()
            });
        }

        // Send Detailed Email to Teacher
        if (employee.preferences?.employeeNotifications !== false) {
            // Note: Now passing the 'changes' array and the updated 'assignment' object
            sendEmployeeAssignmentUpdatedEmail(
                employee.email,
                employee.name,
                assignment.school.schoolName,
                assignment.school.address,
                changes,
                assignment
            ).catch(err => console.error("Employee Detailed Email Error:", err));
        }

        // 5. NOTIFY OTHER ADMINS
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

            if (admin.preferences?.adminNotifications !== false) {
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

        // Remove the assignment
        employee.assignments.pull(assignmentId);
        await employee.save();

        // ==========================================
        // BACKGROUND NOTIFICATIONS
        // ==========================================

        // --- A. Notify the Employee ---
        const empMsg = `Your assignment at ${schoolName} has been revoked.`;
        const empNotification = await Notification.create({ recipient: employee._id, title: "Assignment Revoked", message: empMsg, type: "Warning" });

        if (req.io) {
            req.io.to(employee._id.toString()).emit('new_notification', { _id: empNotification._id, title: "Assignment Revoked", message: empMsg, timestamp: new Date() });
        }

        if (employee.preferences?.employeeNotifications !== false) {
            sendEmployeeAssignmentRevokedEmail(employee.email, employee.name, schoolName, schoolAddress, category).catch(console.error);
        }

        // --- B. Notify All Admins & SuperAdmins ---
        const admins = await User.find({ role: { $in: ['Admin'] }, _id: { $ne: req.user._id } });
        const adminMsg = `${employee.name}'s assignment at ${schoolName} was revoked.`;

        await Promise.all(admins.map(async (admin) => {
            const adminNotif = await Notification.create({ recipient: admin._id, title: "System Alert: Assignment Revoked", message: adminMsg, type: "System" });
            if (req.io) {
                req.io.to(admin._id.toString()).emit('new_notification', { _id: adminNotif._id, title: adminNotif.title, message: adminNotif.message, timestamp: new Date() });
            }
            if (admin.preferences?.adminNotifications !== false) {
                sendAdminAssignmentRevokedEmail(admin.email, admin.name, employee.name, schoolName, schoolAddress, category).catch(console.error);
            }
        }));

        res.status(200).json({ success: true, message: "Assignment revoked." });
    } catch (error) {
        console.error("Delete Assignment Error:", error);
        res.status(500).json({ success: false, message: "Server error deleting assignment." });
    }
});


module.exports = adminRouter;