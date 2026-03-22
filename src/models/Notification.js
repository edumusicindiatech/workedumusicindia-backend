const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Who gets it
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['Assignment', 'System', 'Warning', 'General', 'Deletion', 'Updation'], default: 'General' },
    isRead: { type: Boolean, default: false }, // Crucial for the unread bell icon!
    isHidden: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);