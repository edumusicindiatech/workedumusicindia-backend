const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    // Only SuperAdmins can touch this
    globalAdminNotifications: { type: Boolean, default: true },

    // Any Admin or SuperAdmin can touch this
    globalEmployeeNotifications: { type: Boolean, default: true }
});

module.exports = mongoose.model('Settings', settingsSchema);