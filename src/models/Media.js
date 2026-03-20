const mongoose = require('mongoose');

const mediaLogSchema = new mongoose.Schema({
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    band: { type: String, enum: ['Junior Band', 'Senior Band'], required: true },

    mediaType: { type: String, enum: ['Regular Visit', 'Special Event'], required: true },
    eventDate: { type: Date, required: true },
    eventContext: { type: String },

    files: [{
        url: { type: String, required: true },
        fileType: { type: String, default: 'image' } // image or video
    }]
}, { timestamps: true });

module.exports = mongoose.model('MediaLog', mediaLogSchema);