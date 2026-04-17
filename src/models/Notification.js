const mongoose = require('mongoose');

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

module.exports = mongoose.model('Notification', notificationSchema);