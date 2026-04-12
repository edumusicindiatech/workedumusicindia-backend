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
    category: {
        type: String,
        enum: ['Junior Band', 'Senior Band'],
        required: true,
        default: 'Junior Band'
    },
    daysAllotted: [{ type: String }],

    startDate: { type: Date },
    endDate: { type: Date },
    startTime: { type: String }, // e.g., "09:00"
    endTime: { type: String },

    status: {
        type: String,
        enum: ['Pending', 'Accepted', 'Rejected'],
        default: 'Pending'
    },
    isHiddenFromEmployee: {
        type: Boolean,
        default: false
    },
    rejectReason: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model('Task', TaskSchema);