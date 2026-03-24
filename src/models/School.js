const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema({
    schoolName: { type: String, required: true },
    address: { type: String },
    location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true }
    }
}, { timestamps: true });

schoolSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('School', schoolSchema);