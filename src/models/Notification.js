const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    // The user who receives the notification (could be an Admin or the Employee)
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // The category dictates the icon and color in your UI
    type: {
        type: String,
        enum: ['Late_Attendance', 'Task_Completed', 'New_Media', 'Teacher_Absent', 'System_Alert'],
        required: true
    },
    title: { type: String, required: true }, // e.g., "Late Attendance Alert"
    message: { type: String, required: true }, // e.g., "Sarah Johnson checked in late..."

    // Optional: Link directly to the related data so clicking it opens the right page
    relatedId: { type: mongoose.Schema.Types.ObjectId },
    onModel: { type: String, enum: ['Attendance', 'Task', 'MediaLog', 'User'] },

    isRead: { type: Boolean, default: false }
}, { timestamps: true }); // timestamps automatically handle the "10 mins ago" logic

module.exports = mongoose.model('Notification', notificationSchema);