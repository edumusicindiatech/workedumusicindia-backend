const mongoose = require('mongoose');

const apkVersionSchema = new mongoose.Schema({
    versionName: {
        type: String,
        required: true,
        // e.g., "1.2.0"
    },
    versionCode: {
        type: Number,
        required: true,
        // e.g., 15 (Must increase with every build)
    },
    downloadUrl: {
        type: String,
        required: true,
        // e.g., "https://apk-closet.yourdomain.com/app-release-1.2.0.apk"
    },
    releaseNotes: {
        type: String,
        default: "Bug fixes and performance improvements."
    },
    isMandatory: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('ApkVersion', apkVersionSchema);