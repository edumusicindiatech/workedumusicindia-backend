const mongoose = require('mongoose');

const dailyReportSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: String, // Stored as YYYY-MM-DD for easy querying
        required: true
    },
    category: { type: String, required: true },
    summary: { type: String, required: true },
    actionItems: { type: String },
    location: { type: String } // e.g., "uttar pradesh,sultanpur,228001"
}, { timestamps: true });

module.exports = mongoose.model('DailyReport', dailyReportSchema);