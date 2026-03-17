const express = require('express');
const employeeRouter = express.Router();
const userAuth = require('../middleware/userAuth');
const DailyShift = require('../models/DailyShift');
const { sendShiftNotificationToAdmins } = require('../utils/emailService');


employeeRouter.get('/me/profile', userAuth, async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            user: req.user
        });
    }
    catch (err) {
        console.log('Error fetching Profile', err);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching profile',
            error: err.message
        })

    }
});

employeeRouter.post('/shift/start', userAuth, async (req, res) => {
    try {
        const { latitude, longitude, territory } = req.body;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: "Location coordinates are required to start your day."
            });
        }

        // Format today's date as YYYY-MM-DD for easy lookup
        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Check if they already started a shift today
        const existingShift = await DailyShift.findOne({
            employee: req.user._id,
            date: todayStr
        });

        if (existingShift) {
            return res.status(400).json({
                success: false,
                message: "You have already started your day.",
                shift: existingShift
            });
        }
        const currentTime = new Date();
        // 2. Create the new shift record
        const newShift = new DailyShift({
            employee: req.user._id,
            date: todayStr,
            loginTime: new Date(),
            loginLocation: {
                type: 'Point',
                coordinates: [parseFloat(longitude), parseFloat(latitude)] // Longitude first!
            },
            territory: territory || "Unassigned"
        });

        await newShift.save();

        sendShiftNotificationToAdmins(req.user, 'Logged In', newShift.territory, currentTime);

        res.status(201).json({
            success: true,
            message: "Day started successfully",
            shift: newShift
        });

    } catch (error) {
        console.error('Error starting shift:', error);
        res.status(500).json({
            success: false,
            message: "Server error while starting the day",
            error: error.message
        });
    }
});

employeeRouter.post('/shift/end', userAuth, async (req, res) => {
    try {
        const { latitude, longitude } = req.body;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: "Location coordinates are required to end your day."
            });
        }

        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Find today's active shift
        const activeShift = await DailyShift.findOne({
            employee: req.user._id,
            date: todayStr,
            logoutTime: { $exists: false } // Make sure it hasn't been ended already
        });

        if (!activeShift) {
            return res.status(404).json({
                success: false,
                message: "No active shift found for today to end."
            });
        }
        const currentTime = new Date();
        // 2. Update the record with logout details
        activeShift.logoutTime = new Date();
        activeShift.logoutLocation = {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
        };

        await activeShift.save();
        sendShiftNotificationToAdmins(req.user, 'Logged Out', activeShift.territory, currentTime);

        res.status(200).json({
            success: true,
            message: "Day ended successfully",
            shift: activeShift
        });

    } catch (error) {
        console.error('Error ending shift:', error);
        res.status(500).json({
            success: false,
            message: "Server error while ending the day",
            error: error.message
        });
    }
});

module.exports = employeeRouter