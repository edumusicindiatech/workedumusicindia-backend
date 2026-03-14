const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema({
    schoolName: { type: String, required: true },
    address: { type: String },
    // GeoJSON for 100-meter fencing
    location: {
        type: { type: String, default: 'Point' },
        coordinates: { type: [Number], required: true } // [Longitude, Latitude]
    },
    // Schedule details
    allottedTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    startTime: { type: String, required: true }, // e.g., "09:00 AM"
    workingDays: [{ type: String }] // e.g., ["Monday", "Wednesday"]
}, { timestamps: true });

// CRITICAL: The index for geo-fencing
schoolSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('School', schoolSchema);