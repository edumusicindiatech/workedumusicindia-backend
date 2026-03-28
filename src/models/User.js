const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    category: { type: String, enum: ['Junior Band', 'Senior Band'], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    startTime: { type: String, required: true }, // e.g., "08:00 AM"
    endTime: { type: String, required: true },   // e.g., "12:00 PM"
    allowedDays: [{ type: String, enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }],
    geofence: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true }
    }
});

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true, select: false },
    employeeId: { type: String, required: true, unique: true },
    isFirstLogin: { type: Boolean, default: true },
    mobile: { type: String },
    role: { type: String, enum: ['SuperAdmin', 'Admin', 'Employee'], default: 'Employee' },
    designation: { type: String, default: 'Teacher' },
    zone: { type: String },

    assignments: [assignmentSchema], // Embedded array for their specific schedules

    // Global Settings from the final screenshots
    preferences: {
        systemLanguage: { type: String, default: 'English' },
        adminNotifications: { type: Boolean, default: true },
        employeeNotifications: { type: Boolean, default: true }
    },
    
    currentWeeklyScore: {
        type: Number,
        default: 0
    },
    currentWeeklyRank: {
        type: Number,
        default: 0
    },
    scoreTrend: {
        type: String,
        enum: ['up', 'down', 'flat'],
        default: 'flat' // 'up' = 📈, 'down' = 📉
    },
    colorZone: {
        type: String,
        enum: ['red', 'blue', 'green'],
        default: 'red' // <50: red, 50-69: blue, 70+: green
    },

    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);