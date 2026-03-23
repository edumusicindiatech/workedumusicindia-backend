const mongoose = require('mongoose');

const dailyReportSchema = new mongoose.Schema({
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // Format: "YYYY-MM-DD"
    category: { type: String, enum: ['Regular Report', 'Event Report'], required: true },
    summary: { type: String, required: true },

    // Optional Event Fields
    eventName: { type: String },
    eventDate: { type: String },

    // Optional Action Items
    actionItems: { type: String }
}, { timestamps: true });

// Ensure an employee only has ONE daily report per day (Upsert logic)
dailyReportSchema.index({ teacher: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailyReport', dailyReportSchema);