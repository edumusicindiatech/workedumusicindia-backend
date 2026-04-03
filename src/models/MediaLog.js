const mongoose = require('mongoose');

// 1. Define the File Sub-Schema (Grading happens here!)
const fileSchema = new mongoose.Schema({
    url: { type: String, required: true },
    thumbnailUrl: { type: String, default: null },
    fileType: { type: String, default: 'video' },

    // Admin Review Fields (Specific to THIS video)
    marks: { type: Number, default: null }, // null = Pending review
    remark: { type: String },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Which admin graded it
    gradedAt: { type: Date }
});

// 2. Define the Main Event Schema
const mediaLogSchema = new mongoose.Schema({
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    band: { type: String, enum: ['Junior Band', 'Senior Band'], required: true },

    mediaType: { type: String, enum: ['Regular Visit', 'Special Event'], required: true },
    eventDate: { type: Date, required: true },
    eventContext: { type: String },
    description: { type: String },
    studentRecord: { type: Number }, // Number of students present

    // The Array of Videos
    files: [fileSchema],

    // Helper field for Admin Dashboards
    reviewStatus: {
        type: String,
        enum: ['Pending', 'Partially Graded', 'Completed'],
        default: 'Pending'
    }

}, { timestamps: true });

module.exports = mongoose.model('MediaLog', mediaLogSchema);