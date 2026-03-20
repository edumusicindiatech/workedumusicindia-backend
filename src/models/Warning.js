const mongoose = require('mongoose');

const warningSchema = new mongoose.Schema({
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    level: { type: String, enum: ['Verbal', 'Written', 'Final'], required: true },
    reason: { type: String, required: true }, // e.g., "Tardiness"
    dateIssued: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Warning', warningSchema);