const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    band: { type: String, enum: ['Junior Band', 'Senior Band'], required: true },

    date: { type: String, required: true }, // Format: "YYYY-MM-DD" for easy grouping
    status: {
        type: String,
        enum: ['Present', 'Late', 'Absent', 'Holiday', 'Event'],
        required: true
    },

    // Check-in / Check-out specific data
    checkInTime: { type: Date },
    lateReason: { type: String },
    eventNote: { type: String },
    eventDate: { type: Date },
    checkOutTime: { type: Date },
    overtimeReason: { type: String },
    checkInLocationDesc: { type: String },
    checkInCoordinates: { type: [Number] },
    checkOutLocationDesc: { type: String },
    checkOutCoordinates: { type: [Number] },

    teacherNote: { type: String }, // e.g., "Heavy traffic on Main St."
}, { timestamps: true });

module.exports = mongoose.model('Attendance', attendanceSchema);