const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },
    employeeId: { type: String, required: true, unique: true },
    role: {
        type: String,
        enum: ['Admin1', 'Admin2', 'Admin3', 'Employee'],
        default: 'Employee'
    },
    // Metrics for the Admin Dashboard
    warnings: { type: Number, default: 0 },
    warningMessages: [{
        message: String,
        date: { type: Date, default: Date.now }
    }],
    totalLateCount: { type: Number, default: 0 },
    totalAbsentCount: { type: Number, default: 0 },

    assignedSchools: [{ type: mongoose.Schema.Types.ObjectId, ref: 'School' }]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);