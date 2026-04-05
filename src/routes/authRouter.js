const express = require('express');
const authRouter = express.Router();
const User = require('../models/User');
const bcrypt = require('bcrypt');
const userAuth = require('../middleware/userAuth');
const { generateAccessToken, generateRefreshToken } = require('../config/token');
const validator = require('validator');
const jwt = require('jsonwebtoken')

// User / Admin Login
authRouter.post('/login', async (req, res) => {
    try {
        const { employeeId, password, deviceId } = req.body;

        if (!employeeId || !password) {
            return res.status(400).json({ success: false, message: "Employee ID and password are required" });
        }

        const user = await User.findOne({ employeeId }).select('+password');
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        // --- NEW DEVICE BINDING LOGIC ---
        // Exclude admins if they log in via web browser
        if (user.role === 'Employee') {
            // Check for Device ID ONLY if the user is an Employee
            if (!deviceId) {
                return res.status(400).json({ success: false, message: "Device ID is required for security verification." });
            }

            if (user.isFirstLogin) {
                // Bind the device on first login (or after an Admin resets it)
                user.deviceId = deviceId;
                await user.save();
            } else {
                // Reject if the device ID doesn't match the one saved in the database
                if (user.deviceId !== deviceId) {
                    return res.status(403).json({
                        success: false,
                        message: "Unauthorized Device. You are trying to log in from an unrecognized phone. Please contact your Admin."
                    });
                }
            }
        }
        // --------------------------------

        const accessToken = generateAccessToken(user._id, user.role);
        const refreshToken = generateRefreshToken(user._id, user.role);
        const isProduction = process.env.NODE_ENV === 'production';

        const cookieOptions = {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        };

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
                    employeeId: user.employeeId,
                    profilePicture: user.profilePicture
                }
            });

    } catch (error) {
        console.log('Error in Login', error);
        res.status(500).json({ success: false, message: "Server error during login", error: error.message });
    }
});

// ==========================================
// RESET INITIAL PASSWORD (For both Admins & Employees)
// ==========================================
authRouter.post('/reset-initial-password', userAuth, async (req, res) => {
    try {
        const { newPassword } = req.body;

        if (!newPassword) {
            return res.status(400).json({ success: false, message: "New password is required." });
        }

        // 1. Enforce Strong Passwords
        if (!validator.isStrongPassword(newPassword)) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 8 characters, 1 uppercase, 1 lowercase, 1 number, and 1 symbol."
            });
        }

        // 2. Fetch the User (We need .select('+password') so we can compare the old one)
        const user = await User.findById(req.user._id).select('+password');

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        // 3. Prevent abuse (Don't let them reset if they already did)
        if (!user.isFirstLogin) {
            return res.status(400).json({ success: false, message: "Password has already been reset." });
        }

        // 4. Ensure the new password isn't the temporary one!
        const isSameAsOld = await bcrypt.compare(newPassword, user.password);
        if (isSameAsOld) {
            return res.status(400).json({
                success: false,
                message: "Your new password must be different from the temporary password."
            });
        }

        // 5. Manually Hash the new password
        const saltRounds = 10;
        user.password = await bcrypt.hash(newPassword, saltRounds);

        // 6. Flip the flag so they are officially onboarded
        user.isFirstLogin = false;

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Password updated successfully! Welcome to the system.",
            role: user.role // We return the role so the React frontend knows where to redirect them!
        });

    } catch (error) {
        console.error('Error resetting initial password:', error);
        res.status(500).json({ success: false, message: "Server error during password reset." });
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

authRouter.post('/logout', async (req, res) => {
    try {
        // Clear the refresh token cookie with the exact same options used to set it
        const isProduction = process.env.NODE_ENV === 'production';
        res.clearCookie("refreshToken", {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax'
        });

        return res.status(200).json({
            success: true,
            message: "Logged out successfully"
        });
    } catch (error) {
        console.error('Error during logout:', error);
        return res.status(500).json({
            success: false,
            message: "Server error during logout"
        });
    }
});


module.exports = authRouter