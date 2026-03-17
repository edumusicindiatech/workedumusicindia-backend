const express = require('express');
const User = require('../models/User');
const crypto = require('crypto');
const validator = require('validator');
const bcrypt = require('bcrypt');
const adminRouter = express.Router();
const { sendWelcomeEmail } = require('../utils/emailService');

adminRouter.post('/admin/create/', async (req, res) => {
    try {
        const { name, email, role } = req.body;

        // 1. Validate required fields
        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: "Name and Email are required."
            });
        }

        if (!validator.isEmail(email)) {
            return res.status(400).json({
                success: false,
                message: "Invalid email format."
            });
        }

        // 2. Generate fresh credentials (we need these whether creating or updating)
        const randomHex = crypto.randomBytes(2).toString('hex').toUpperCase();
        const newEmployeeId = `EMP-${new Date().getFullYear()}-${randomHex}`;
        const newGeneratedPassword = crypto.randomBytes(4).toString('hex');

        const salt = await bcrypt.genSalt(10);
        const newHashedPassword = await bcrypt.hash(newGeneratedPassword, salt);

        // 3. Check if user already exists
        let user = await User.findOne({ email });
        let isNewUser = false;

        if (user) {
            // SCENARIO A: User exists. Regenerate their credentials.
            user.employeeId = newEmployeeId;
            user.password = newHashedPassword;

            // Optionally update name/role if the admin changed them in the form
            if (name) user.name = name;
            if (role) user.role = role;

            await user.save();
        } else {
            // SCENARIO B: User does not exist. Create them.
            isNewUser = true;
            user = new User({
                name,
                email,
                password: newHashedPassword,
                employeeId: newEmployeeId,
                role: role || 'Employee'
            });
            await user.save();
        }

        // 4. Trigger Brevo Email Notification (Uncomment when ready)
        await sendWelcomeEmail(user.email, user.name, user.employeeId, newGeneratedPassword);

        // 5. Send success response
        // Using 201 Created for new users, 200 OK for updated users
        return res.status(isNewUser ? 201 : 200).json({
            success: true,
            message: isNewUser
                ? "Employee successfully created."
                : "Existing employee found. Credentials successfully regenerated.",
            user: {
                name: user.name,
                email: user.email,
                employeeId: user.employeeId,
                role: user.role
            },
            tempPassword: newGeneratedPassword // Admin UI can display this in case email fails
        });

    } catch (error) {
        console.error("Error in /admin/create:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
});

module.exports = adminRouter;