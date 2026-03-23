const express = require('express');
const notificationRouter = express.Router();
const Notification = require('../models/Notification');
const userAuth = require('../middleware/userAuth');
// Removed adminAuth because these routes are safe for any logged-in user

// 1. GET: Fetch all notifications for the logged-in user
notificationRouter.get('/', userAuth, async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50); // Keep it fast, load the latest 50

        res.json({ success: true, data: notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. PUT: Mark all notifications as read
notificationRouter.put('/mark-read', userAuth, async (req, res) => {
    try {
        await Notification.updateMany(
            { recipient: req.user._id, isRead: false },
            { $set: { isRead: true } }
        );
        res.json({ success: true, message: "All marked as read" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. DELETE: Clear all notifications
notificationRouter.delete('/clear', userAuth, async (req, res) => {
    try {
        await Notification.deleteMany({ recipient: req.user._id });
        res.json({ success: true, message: "Notifications cleared" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = notificationRouter;