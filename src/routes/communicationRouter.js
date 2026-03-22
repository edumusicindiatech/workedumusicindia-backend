const express = require('express');
const communicationRouter = express.Router();
const User = require('../models/User');
const Broadcast = require('../models/Broadcast');
const Notification = require('../models/Notification');
const userAuth = require('../middleware/userAuth');
const adminAuth = require('../middleware/adminAuth');
const { sendBroadcastEmail } = require('../utils/emailService');

// 1. GET ALL EMPLOYEES (For the "Specific People" search dropdown)
communicationRouter.get('/employees', userAuth, adminAuth, async (req, res) => {
    try {
        const employees = await User.find({ role: 'Employee', isActive: true })
            .select('name designation zone'); // Only fetch what's needed for the UI
        res.json({ success: true, data: employees });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. GET RECENT BROADCASTS (For the sidebar)
communicationRouter.get('/recent', userAuth, adminAuth, async (req, res) => {
    try {
        const broadcasts = await Broadcast.find({ sender: req.user._id })
            .sort({ createdAt: -1 })
            .limit(5);
        res.json({ success: true, data: broadcasts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. POST A NEW BROADCAST
communicationRouter.post('/send', userAuth, adminAuth, async (req, res) => {
    try {
        const { targetGroup, message, targetZone, targetUsers } = req.body;

        if (!message) return res.status(400).json({ success: false, message: "Message is required." });

        let recipients = [];

        // --- TARGETING LOGIC ---
        // Notice: We added 'role' and 'preferences' to the select so we can filter emails properly
        if (targetGroup === 'All Employees') {
            // Gets ALL active users (Employees AND Admins as requested)
            recipients = await User.find({ isActive: true }).select('_id email name role preferences');
        }
        else if (targetGroup === 'By Zone') {
            if (!targetZone) return res.status(400).json({ success: false, message: "Zone is required." });

            // Handle comma separated values, trim spaces, and ignore empty strings
            const zonesList = targetZone.split(',').map(z => z.trim()).filter(z => z);

            // Create Case-Insensitive Exact Match Regex (e.g., /^sultanpur$/i)
            const regexZones = zonesList.map(z => new RegExp(`^${z}$`, 'i'));

            recipients = await User.find({
                role: 'Employee',
                isActive: true,
                zone: { $in: regexZones }
            }).select('_id email name role preferences');
        }
        else if (targetGroup === 'Specific People') {
            if (!targetUsers || targetUsers.length === 0) return res.status(400).json({ success: false, message: "Please select at least one employee." });
            recipients = await User.find({ _id: { $in: targetUsers } }).select('_id email name role preferences');
        }

        if (recipients.length === 0) {
            return res.status(404).json({ success: false, message: "No active users found for this target." });
        }

        // --- 1. SAVE BROADCAST RECORD ---
        const newBroadcast = await Broadcast.create({
            sender: req.user._id,
            message,
            targetGroup,
            targetZone: targetGroup === 'By Zone' ? targetZone : null,
            targetUsers: targetGroup === 'Specific People' ? targetUsers : [],
            reachCount: recipients.length
        });

        // --- 2. CREATE IN-APP NOTIFICATIONS (These always send regardless of email settings) ---
        const notificationsToInsert = recipients.map(user => ({
            recipient: user._id,
            title: "📢 Official Broadcast",
            message: message,
            type: "General"
        }));
        await Notification.insertMany(notificationsToInsert);

        // --- 3. SEND EMAILS IN BACKGROUND (RESPECTING NOTIFICATION SETTINGS) ---

        // A. Get the sending Admin's Master Override Settings
        const actionAdmin = await User.findById(req.user._id);
        const adminAllowsEmpEmails = actionAdmin.preferences?.employeeNotifications !== false;
        const adminAllowsAdminEmails = actionAdmin.preferences?.adminNotifications !== false;

        // B. Filter the recipients list to only include valid, opted-in emails
        const validEmails = recipients.filter(u => {
            if (!u.email) return false; // Skip if no email on record

            const isRecipientAdmin = ['Admin', 'SuperAdmin'].includes(u.role);

            // Check 1: Does the recipient personally want emails?
            const recipientPrefers = isRecipientAdmin
                ? u.preferences?.adminNotifications !== false
                : u.preferences?.employeeNotifications !== false;

            if (!recipientPrefers) return false;

            // Check 2: Does the sending Admin's master override allow it?
            if (isRecipientAdmin && !adminAllowsAdminEmails) return false;
            if (!isRecipientAdmin && !adminAllowsEmpEmails) return false;

            return true;
        }).map(u => u.email);

        // C. Send if there are any valid emails left in the list
        if (validEmails.length > 0) {
            // We don't await this so the API responds instantly to the admin UI
            sendBroadcastEmail(validEmails, message, req.user.name).catch(console.error);
        }

        res.json({ success: true, message: "Broadcast sent successfully!", data: newBroadcast });

    } catch (error) {
        console.error("Broadcast Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = communicationRouter;