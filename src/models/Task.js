const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    taskDescription: {
        type: String,
        required: true
    },
    daysAllotted: [{ type: String }],
    duration: { type: String }, // e.g., "2 Days"
    timing: { type: String },   // e.g., "09:00 AM - 03:00 PM"
    status: {
        type: String,
        enum: ['Pending', 'Accepted', 'Rejected'],
        default: 'Pending'
    },
    rejectReason: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model('Task', TaskSchema);