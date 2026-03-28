const mongoose = require('mongoose');

const weeklyProgressSchema = new mongoose.Schema({
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    weekStartDate: { type: Date, required: true },
    weekEndDate: { type: Date, required: true },

    // The Final Calculated Results
    score: { type: Number, required: true },
    rank: { type: Number, required: true },
    colorZone: { type: String, enum: ['red', 'blue', 'green'], required: true },

    // The Raw Data used to calculate the score (Perfect for future Admin Graphs)
    stats: {
        present: { type: Number, default: 0 },
        late: { type: Number, default: 0 },
        absent: { type: Number, default: 0 },
        approvedLeaves: { type: Number, default: 0 },
        averageMediaScore: { type: Number, default: 0 }, // e.g., 8.5 out of 10
        warningsCount: { type: Number, default: 0 }
    }
}, { timestamps: true });

// Optional: Add an index so querying by date range for graphs is lightning fast
weeklyProgressSchema.index({ teacher: 1, weekStartDate: -1 });

module.exports = mongoose.model('WeeklyProgress', weeklyProgressSchema);