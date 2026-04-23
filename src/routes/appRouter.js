const express = require('express');
const appRouter = express.Router();
const AppRelease = require('../models/AppRelease');
const ApkVersion = require('../models/ApkVersion');

// GET /api/v1/app/check-update
appRouter.get('/check-update', async (req, res) => {
    try {
        // Extract the versions sent by the Capacitor app
        const { platform, current_native_version, current_ota_version } = req.query;

        if (!platform || !current_native_version || !current_ota_version) {
            return res.status(400).json({ error: 'Missing required version parameters.' });
        }

        // 1. Find the latest active release for this platform (Android or iOS)
        const latestRelease = await AppRelease.findOne({
            target_platform: platform,
            status: 'active'
        }).sort({ created_at: -1 }); // Sort by newest first

        // If no active release exists in the DB, the app does nothing
        if (!latestRelease) {
            return res.json({ action: 'NONE' });
        }

        // 2. Check if a Native update (APK) is required
        // If the native versions don't match, the native shell is outdated
        if (latestRelease.native_version_required !== current_native_version) {
            return res.json({
                action: 'APK',
                is_mandatory: true, // Always force APK updates to prevent crashes
                download_url: latestRelease.download_url,
                release_version: latestRelease.release_version,
                release_notes: latestRelease.release_notes || 'A major app update is required.'
            });
        }

        // 3. Check if an OTA (Web/React) update is required
        // If native versions match but the OTA version is older, trigger the web patch
        if (latestRelease.release_version !== current_ota_version) {
            return res.json({
                action: latestRelease.update_type, // 'OTA' or 'APK' based on your DB control
                is_mandatory: latestRelease.is_mandatory,
                download_url: latestRelease.download_url,
                release_version: latestRelease.release_version,
                release_notes: latestRelease.release_notes
            });
        }

        // 4. Everything matches. The app is fully up to date.
        return res.json({ action: 'NONE' });

    } catch (error) {
        console.error('Update check failed:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/app/download-latest
appRouter.get('/download-latest', async (req, res) => {
    try {
        // Find the most recently uploaded APK version
        const latestApk = await ApkVersion.findOne().sort({ createdAt: -1 });

        if (!latestApk || !latestApk.downloadUrl) {
            // Sending standard text instead of JSON since you only want the file
            return res.status(404).send('No APK update currently available.');
        }

        // Redirect directly to the apk-closet public URL.
        // This forces the Capacitor HTTP client to download the actual .apk file directly.
        res.redirect(latestApk.downloadUrl);

    } catch (error) {
        console.error('Download route failed:', error);
        res.status(500).send('Internal server error while fetching the APK.');
    }
});

// Don't forget to export the router so your main index.js/server.js can use it
module.exports = appRouter;