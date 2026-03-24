// models/Event.js
const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true }, // Add this if you need to link it
    schoolName: { type: String, required: true },
    categoryName: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String },
    timeFrom: { type: String, required: true },
    timeTo: { type: String, required: true },
    description: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);