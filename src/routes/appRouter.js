const express = require('express');
const appRouter = express.Router();
const AppRelease = require('../models/AppRelease');
const ApkVersion = require('../models/ApkVersion');

// GET /api/v1/app/check-update
appRouter.get('/check-update', async (req, res) => {
    try {
        const { platform, current_native_version, current_ota_version } = req.query;

        if (!platform || !current_native_version || !current_ota_version) {
            return res.status(400).json({ error: 'Missing required version parameters.' });
        }

        const latestRelease = await AppRelease.findOne({
            target_platform: platform,
            status: 'active'
        }).sort({ created_at: -1 });

        if (!latestRelease) {
            return res.json({ action: 'NONE' });
        }

        // Native mismatch -> force APK update
        if (latestRelease.native_version_required !== current_native_version) {
            return res.json({
                action: 'APK',
                is_mandatory: true,
                download_url: latestRelease.download_url,
                release_version: latestRelease.release_version,
                release_notes: latestRelease.release_notes || 'A major app update is required.'
            });
        }

        // Native matches. Check if an OTA bump is expected.
        if (latestRelease.release_version !== current_ota_version) {

            // 🆕 Confirm the OTA payload is actually reachable before telling the app to fetch it
            let otaAvailable = false;
            try {
                const headResp = await fetch(latestRelease.download_url, { method: 'HEAD' });
                otaAvailable = headResp.ok;
            } catch (e) {
                otaAvailable = false;
            }

            if (!otaAvailable) {
                // No OTA payload exists on purpose — the native APK IS the update.
                // Tell the frontend what version it should consider itself on.
                return res.json({
                    action: 'NONE',
                    display_version: latestRelease.release_version
                });
            }

            return res.json({
                action: latestRelease.update_type,
                is_mandatory: latestRelease.is_mandatory,
                download_url: latestRelease.download_url,
                release_version: latestRelease.release_version,
                release_notes: latestRelease.release_notes
            });
        }

        return res.json({ action: 'NONE', display_version: latestRelease.release_version });

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