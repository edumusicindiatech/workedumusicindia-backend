const express = require('express');
const authRouter = express.Router();
const User = require('../models/User');
const bcrypt = require('bcrypt');
const userAuth = require('../middleware/userAuth');
const { generateAccessToken, generateRefreshToken } = require('../config/token');
const validator = require('validator');

// User / Admin Login
authRouter.post('/login', async (req, res) => {
    try {
        console.log('reaching')
        const { employeeId, password } = req.body;

        if (!employeeId || !password) {
            return res.status(400).json(
                {
                    success: false,
                    message: "Employee ID and password are required"
                }
            );
        }

        const user = await User.findOne({ employeeId }).select('+password');
        if (!user) {
            return res.status(404).json(
                {
                    success: false,
                    message: "User not found"
                }
            );
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json(
                {
                    success: false,
                    message: "Invalid credentials"
                }
            );
        }

        // 1. Generate Tokens using your config utility
        // Passing user._id (converted to string if necessary) and user.role
        const accessToken = generateAccessToken(user._id, user.role);
        const refreshToken = generateRefreshToken(user._id, user.role);

        // 2. Set secure cookie options for the refresh token
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        };

        // 3. Handle First-Time Login Check
        if (user.isFirstLogin && user.role !== 'admin') {
            return res.status(200)
                .cookie("refreshToken", refreshToken, cookieOptions)
                .json({
                    message: "Login successful. Please reset your password.",
                    access_token: accessToken,
                    isFirstLogin: true,
                    role: user.role
                });
        }

        // 4. Standard Successful Login
        return res.status(200)
            .cookie("refreshToken", refreshToken, cookieOptions)
            .json({
                message: "Login successful",
                access_token: accessToken,
                isFirstLogin: false,
                role: user.role,
                user: {
                    id: user._id,
                    name: user.name,
                    employeeId: user.employeeId
                }
            });

    } catch (error) {
        console.log('Error in Login', error);
        res.status(500).json(
            {
                success: false,
                message: "Server error during login", error: error.message
            }
        );
    }
});

authRouter.post('/reset-initial-password', userAuth, async (req, res) => {
    try {
        const { newPassword } = req.body;

        if (!newPassword) {
            return res.status(400).json(
                {
                    success: false,
                    message: "New password is required"
                }
            );
        }

        const user = await User.findById(req.user._id);

        if (!user.isFirstLogin) {
            return res.status(400).json(
                {
                    success: false,
                    message: "Password has already been reset"
                }
            );
        }
        if (!validator.isStrongPassword(newPassword)) {
            return res.status(400).json(
                {
                    success: false,
                    message: "Enter Strong Password"
                }
            )
        }
        // Hash the new password (assuming your model has a pre-save hook, otherwise hash it here)
        user.password = await bcrypt.hash(newPassword, 10);
        user.isFirstLogin = false;

        await user.save();

        return res.status(200).json(
            {
                success: true,
                message: "Password updated successfully"
            }
        );

    } catch (error) {
        console.log('Error in updaing first time Password', error);
        res.status(500).json({ message: "Server error during password reset", error: error.message });
    }
});

authRouter.get('/refresh-token', async (req, res) => {
    try {
        // 1. Extract the refresh token from the secure cookie
        const incomingRefreshToken = req.cookies?.refreshToken;

        if (!incomingRefreshToken) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: No refresh token provided"
            });
        }

        // 2. Verify the refresh token using the REFRESH secret
        jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET,
            async (err, decodedToken) => {
                if (err) {
                    return res.status(403).json({
                        success: false,
                        message: "Forbidden: Invalid or expired refresh token. Please log in again."
                    });
                }

                // 3. Ensure the user still exists in the database
                const user = await User.findById(decodedToken.id);
                if (!user) {
                    return res.status(401).json({
                        success: false,
                        message: "Unauthorized: User no longer exists"
                    });
                }

                // 4. Generate a fresh Access Token
                const newAccessToken = generateAccessToken(user._id, user.role);

                // 5. Send it back to the client
                return res.status(200).json({
                    success: true,
                    message: "Access token refreshed successfully",
                    access_token: newAccessToken
                });
            }
        );

    } catch (error) {
        console.log('Error refreshing token', error);
        res.status(500).json({
            success: false,
            message: "Server error during token refresh",
            error: error.message
        });
    }
});

// TEMPORARY DEV ROUTE: Create Initial Admin
// DELETE THIS BEFORE DEPLOYING TO PRODUCTION!
authRouter.post('/setup-admin', async (req, res) => {
    try {
        const { name, email, password, employeeId, role } = req.body;

        // Check if admin already exists to prevent duplicates
        const existingAdmin = await User.findOne({ email });
        if (existingAdmin) {
            return res.status(400).json({ message: "Admin already exists with this email" });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create the admin
        const newAdmin = new User({
            name,
            email, // MAKE SURE THIS IS A REAL EMAIL YOU CAN CHECK
            password: hashedPassword,
            employeeId,
            role: role || 'Admin1', // Defaults to Admin1
            isFirstLogin: false
        });

        await newAdmin.save();

        res.status(201).json({
            success: true,
            message: "Admin account created successfully! You can now test email notifications.",
            admin: {
                name: newAdmin.name,
                email: newAdmin.email,
                role: newAdmin.role
            }
        });

    } catch (error) {
        console.log('Error creating admin:', error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});


module.exports = authRouter