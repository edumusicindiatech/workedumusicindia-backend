const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
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
    date: {
        type: Date,
        default: Date.now
    },

    // Status: 'Present', 'Late', 'Absent'
    status: {
        type: String,
        enum: ['Present', 'Late', 'Absent'],
        required: true
    },

    // Check-In & Check-Out Data
    checkInTime: { type: Date },
    checkOutTime: { type: Date },
    workDurationMinutes: { type: Number, default: 0 },

    
    mediaFiles: [{
        url: { type: String, required: true }, // The Cloudflare R2 URL
        fileType: { type: String, default: 'video' },
        uploadedAt: { type: Date, default: Date.now },
        description: String // Optional: Teacher can add a note about the video
    }],

    locationVerified: { type: Boolean, default: false },
    isReviewed: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Attendance', attendanceSchema);