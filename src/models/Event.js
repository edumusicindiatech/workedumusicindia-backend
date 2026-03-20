const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    band: { type: String, enum: ['Junior Band', 'Senior Band'], required: true },

    fromDate: { type: Date, required: true },
    toDate: { type: Date },
    startTime: { type: String },
    endTime: { type: String },

    description: { type: String, required: true },
    status: { type: String, enum: ['Upcoming', 'Completed', 'Cancelled'], default: 'Upcoming' }
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);