const mongoose = require('mongoose');

const broadcastSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },

    // Targeting Logic
    targetGroup: {
        type: String,
        enum: ['All Employees', 'By Zone', 'Specific People'],
        required: true
    },
    targetZone: { type: String }, // Populated if targetGroup is 'By Zone'
    targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Populated if 'Specific People'

    reachCount: { type: Number, default: 0 } // e.g., "Sent to 124"
}, { timestamps: true });

module.exports = mongoose.model('Broadcast', broadcastSchema);