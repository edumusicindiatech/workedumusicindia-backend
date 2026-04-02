const express = require('express');
const LearningRouter = express.Router();
const crypto = require('crypto');
const path = require('path');
const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Adjust these imports based on your exact file structure
const LearningMedia = require('../models/LearningMedia');
const userAuth = require('../middleware/userAuth');
const adminAuth = require('../middleware/adminAuth');
const s3Client = require('../config/s3')
// ==========================================
// 1. GET ALL LEARNING VIDEOS (For Everyone)
// ==========================================
LearningRouter.get('/', userAuth, async (req, res) => {
    try {
        const videos = await LearningMedia.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: videos });
    } catch (error) {
        console.error("Fetch Learning Media Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch training videos." });
    }
});

// ==========================================
// 2. GENERATE PRESIGNED URL (Admins Only)
// ==========================================
LearningRouter.post('/presign', userAuth, adminAuth, async (req, res) => {
    try {
        const { fileName, fileType } = req.body;

        if (!fileName || !fileType) {
            return res.status(400).json({ success: false, message: "Filename and type required." });
        }

        const ext = path.extname(fileName) || '.mp4';
        const uniqueId = crypto.randomBytes(4).toString('hex');

        // Save in a dedicated folder in your Cloudflare R2 bucket
        const fileKey = `learning-hub/${Date.now()}-${uniqueId}${ext}`;

        const command = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: fileKey,
            ContentType: fileType,
        });

        // Generate URL valid for 1 hour
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;

        res.status(200).json({ success: true, signedUrl, publicUrl });
    } catch (error) {
        console.error("Presign URL Error:", error);
        res.status(500).json({ success: false, message: "Failed to generate upload URL." });
    }
});

// ==========================================
// 3. SAVE MEDIA TO DATABASE (Admins Only)
// ==========================================
LearningRouter.post('/', userAuth, adminAuth, async (req, res) => {
    try {
        const { title, description, fileUrl } = req.body;

        if (!title || !fileUrl) {
            return res.status(400).json({ success: false, message: "Title and Video URL are required." });
        }

        const newVideo = await LearningMedia.create({
            title,
            description,
            fileUrl,
            uploader: req.user._id,
            uploaderName: req.user.name,
            uploaderRole: req.user.role // Automatically captures Admin or SuperAdmin
        });

        res.status(201).json({ success: true, message: "Lesson uploaded successfully!", data: newVideo });
    } catch (error) {
        console.error("Create Learning Media Error:", error);
        res.status(500).json({ success: false, message: "Failed to save the training video." });
    }
});

// ==========================================
// 4. DELETE LEARNING MEDIA (Admins Only)
// ==========================================
LearningRouter.delete('/:id', userAuth, adminAuth, async (req, res) => {
    try {
        const video = await LearningMedia.findById(req.params.id);

        if (!video) {
            return res.status(404).json({ success: false, message: "Training video not found." });
        }

        // 1. Delete the physical file from Cloudflare R2 to save storage space
        try {
            const urlObj = new URL(video.fileUrl);
            const fileKey = urlObj.pathname.substring(1); // Removes the leading '/'

            await s3Client.send(new DeleteObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: fileKey
            }));
        } catch (r2Error) {
            console.error("Failed to delete from R2, but continuing DB cleanup:", r2Error);
        }

        // 2. Remove the record from the database
        await video.deleteOne();

        res.status(200).json({ success: true, message: "Video deleted successfully." });

    } catch (error) {
        console.error("Delete Learning Media Error:", error);
        res.status(500).json({ success: false, message: "Failed to delete training video." });
    }
});

// ==========================================
// 5. UPDATE LEARNING MEDIA (Admins Only)
// ==========================================
LearningRouter.put('/:id', userAuth, adminAuth, async (req, res) => {
    try {
        const { title, description } = req.body;

        const video = await LearningMedia.findByIdAndUpdate(
            req.params.id,
            { title, description },
            { new: true } // Returns the updated document
        );

        if (!video) {
            return res.status(404).json({ success: false, message: "Video not found." });
        }

        res.status(200).json({ success: true, data: video });
    } catch (error) {
        console.error("Update Learning Media Error:", error);
        res.status(500).json({ success: false, message: "Failed to update video details." });
    }
});

// ==========================================
// 6. GENERATE DOWNLOAD URL (For Everyone)
// ==========================================
LearningRouter.post('/download', userAuth, async (req, res) => {
    try {
        const { fileUrl, fileName } = req.body;

        if (!fileUrl) {
            return res.status(400).json({ success: false, message: "File URL is required" });
        }

        const urlObject = new URL(fileUrl);
        const fileKey = urlObject.pathname.substring(1);

        // Forces the browser to download the file instead of playing it
        const command = new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: fileKey,
            ResponseContentDisposition: `attachment; filename="${fileName}"`
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

        res.status(200).json({ success: true, downloadUrl: signedUrl });
    } catch (error) {
        console.error("Generate Download URL Error:", error);
        res.status(500).json({ success: false, message: "Failed to generate download link" });
    }
});

module.exports = LearningRouter;