const mongoose = require('mongoose');
const admin = require('../utils/firebaseAdmin'); // 🚀 IMPORT FIREBASE

const notificationSchema = new mongoose.Schema({
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['Assignment', 'System', 'Warning', 'General', 'Deletion', 'Updation', 'Leave', 'Media', 'Message'], default: 'General' },
    level: { type: String },
    reason: { type: String },
    isRead: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false },

    readAt: { type: Date, default: null }
}, { timestamps: true });

notificationSchema.index({ readAt: 1 }, { expireAfterSeconds: 86400 });

// ============================================================================
// 🚀 GLOBAL HARDWARE QUEUE HOOKS (WHATSAPP STYLE)
// Automatically fires an FCM push whenever ANY notification is saved to the DB
// ============================================================================

// Hook 1: Triggers on single saves (e.g., new leave request, assignment)
notificationSchema.post('save', async function (doc) {
    await sendFCMNotification(doc);
});

// Hook 2: Triggers on bulk inserts (e.g., your SOS trigger in server.js)
notificationSchema.post('insertMany', async function (docs) {
    for (const doc of docs) {
        await sendFCMNotification(doc);
    }
});

// The core FCM dispatcher
async function sendFCMNotification(doc) {
    try {
        const User = mongoose.model('User');
        const user = await User.findById(doc.recipient);

        if (user && user.fcmToken) {
            console.log(`[SYSTEM FCM] 📨 Pushing native notification to ${user.name}: "${doc.title}"`);

            await admin.messaging().send({
                token: user.fcmToken,
                data: {
                    type: 'system_notification', // Native Java will look for this
                    title: String(doc.title).substring(0, 50),
                    messageText: String(doc.message).substring(0, 150),
                    notificationCategory: String(doc.type)
                },
                android: { priority: 'high' } // Ensures it wakes the device
            });
        }
    } catch (err) {
        console.error("[SYSTEM FCM] ❌ Failed to dispatch native notification:", err.message);
    }
}

module.exports = mongoose.model('Notification', notificationSchema);