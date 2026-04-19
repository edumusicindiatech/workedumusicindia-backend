const mongoose = require('mongoose');

const appReleaseSchema = new mongoose.Schema({
    // The overall version of this specific push (e.g., "1.0.5")
    release_version: {
        type: String,
        required: true
    },

    // 'android' or 'ios'
    target_platform: {
        type: String,
        required: true
    },

    // The native Android shell version required to run this web code (e.g., "1.0.0")
    native_version_required: {
        type: String,
        required: true
    },

    // URL to the .zip file (for OTA) or .apk file (for Major updates)
    download_url: {
        type: String,
        required: true
    },

    // How the app should handle it
    update_type: {
        type: String,
        enum: ['NONE', 'OTA', 'APK'],
        default: 'NONE'
    },

    // If true, blocks the user from using the app until they update
    is_mandatory: {
        type: Boolean,
        default: false
    },

    // 'active' means this is the current live version. 
    // 'archived' means it's an old version. 
    // 'rolled_back' means it was a bad update.
    status: {
        type: String,
        enum: ['active', 'archived', 'rolled_back'],
        default: 'active'
    },

    release_notes: {
        type: String
    },

    created_at: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('AppRelease', appReleaseSchema);