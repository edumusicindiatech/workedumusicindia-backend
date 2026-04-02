const mongoose = require('mongoose');

const learningMediaSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    fileUrl: { type: String, required: true },

    // Uploader details
    uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    uploaderName: { type: String, required: true },

    // Tag: Admin or SuperAdmin
    uploaderRole: { type: String, enum: ['Admin', 'SuperAdmin'], required: true },

}, { timestamps: true });

module.exports = mongoose.model('LearningMedia', learningMediaSchema);