const mongoose = require('mongoose');

const dailyReportSchema = new mongoose.Schema({
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // NEW: Explicitly reference the School so we can populate it later if needed
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },

    date: { type: String, required: true }, // Format: "YYYY-MM-DD",
    category: { type: String, enum: ['Regular Report', 'Event Report'], required: true },
    schoolName: { type: String, required: true },
    band: { type: String, enum: ['Junior Band', 'Senior Band'], required: true },
    studentsPresent: { type: Number, required: true },
    summary: { type: String, required: true },

    // Optional Event Fields
    eventName: { type: String },
    eventDate: { type: String }
}, { timestamps: true });

// CRITICAL UPDATE: Ensure an employee only has ONE daily report per day, PER SCHOOL.
// This allows them to submit multiple reports a day, as long as the schoolId is different.
dailyReportSchema.index({ teacher: 1, date: 1, schoolId: 1, band: 1 }, { unique: true });

module.exports = mongoose.model('DailyReport', dailyReportSchema);