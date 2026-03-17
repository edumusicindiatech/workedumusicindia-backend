const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    date: { type: Date, default: Date.now },
    status: { type: String, enum: ['Present', 'Late', 'Absent'], required: true },
    checkInTime: { type: Date },
    checkOutTime: { type: Date },
    workDurationMinutes: { type: Number, default: 0 },
    mediaFiles: [{
        url: { type: String, required: true },
        fileType: { type: String, default: 'video' },
        uploadedAt: { type: Date, default: Date.now },
        description: { type: String }
    }],
    locationVerified: { type: Boolean, default: false },
    isReviewed: { type: Boolean, default: false },
    clockInLocation: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number] }
    },
    clockOutLocation: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number] }
    }
}, { timestamps: true });

module.exports = mongoose.model('Attendance', attendanceSchema);