const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    category: { type: String, enum: ['Junior Band', 'Senior Band'], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    startTime: { type: String, required: true }, // e.g., "08:00 AM"
    endTime: { type: String, required: true },   // e.g., "12:00 PM",
    isTask: { type: Boolean, default: false },
    referenceTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
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
    deviceId: { type: String, default: null },
    mobile: { type: String },
    profilePicture: { type: String, default: null },
    role: { type: String, enum: ['SuperAdmin', 'Admin', 'Employee'], default: 'Employee' },
    designation: { type: String, default: 'Teacher' },
    zone: { type: String },
    allowedContacts: [{ type: String }],

    assignments: [assignmentSchema],

    fcmToken: {
        type: String,
        default: null
    },

    // FIXED: Added frontend-matching keys and initialized the parent object
    preferences: {
        type: {
            systemLanguage: { type: String, default: 'English' },
            // Added these to match what your React frontend is asking for
            globalAdminNotifications: { type: Boolean, default: true },
            globalEmployeeNotifications: { type: Boolean, default: true },
            // Kept your original keys so nothing is removed and flow remains intact
            adminNotifications: { type: Boolean, default: true },
            employeeNotifications: { type: Boolean, default: true }
        },
        default: () => ({}) // CRITICAL FIX: Ensures nested defaults are created for new users
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
        default: 'flat'
    },
    colorZone: {
        type: String,
        enum: ['red', 'blue', 'green'],
        default: 'red'
    },

    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);