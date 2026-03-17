const mongoose = require('mongoose');

const dailyShiftSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: String, // Store as YYYY-MM-DD to easily check if they already started today
        required: true
    },
    loginTime: {
        type: Date,
        required: true
    },
    loginLocation: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true } // [longitude, latitude]
    },
    territory: {
        type: String // e.g., "Zone A - Central District"
    },
    logoutTime: {
        type: Date
    },
    logoutLocation: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number] }
    }
}, { timestamps: true });

// Geospatial index in case you want to verify they are within their assigned zone
dailyShiftSchema.index({ loginLocation: '2dsphere' });

module.exports = mongoose.model('DailyShift', dailyShiftSchema);