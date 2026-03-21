const express = require('express');
const User = require('../models/User');
const crypto = require('crypto');
const validator = require('validator');
const bcrypt = require('bcrypt');
const adminRouter = express.Router();
const { sendWelcomeEmail, sendAdminWelcomeEmail, sendEmployeeWelcomeEmail } = require('../utils/emailService');
const adminAuth = require('../middleware/adminAuth');
const userAuth = require('../middleware/userAuth');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');


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
        const employee = await User.findById(req.params.id).select('-password');

        if (!employee) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }

        res.status(200).json({ success: true, data: employee });
    } catch (error) {
        console.error("Fetch Employee Error:", error);
        res.status(500).json({ success: false, message: "Server error while fetching employee details." });
    }
});

module.exports = adminRouter;