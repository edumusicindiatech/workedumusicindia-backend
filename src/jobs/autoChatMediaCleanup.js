const cron = require('node-cron');
const Message = require('../models/Message');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const chatS3Client = require('../config/chatS3Client'); // Ensure path is correct

// --- HELPER: PHYSICAL DELETE FROM CLOUDFLARE ---
const deleteMediaFromR2 = async (mediaUrl) => {
    if (!mediaUrl) return;
    try {
        const urlParts = new URL(mediaUrl);
        const key = urlParts.pathname.startsWith('/') ? urlParts.pathname.substring(1) : urlParts.pathname;

        const command = new DeleteObjectCommand({
            Bucket: process.env.CHAT_MEDIA_BUCKET.replace(/['"]/g, ''),
            Key: key,
        });

        await chatS3Client.send(command);
        console.log(`[Storage Cleanup] Physically deleted from R2: ${key}`);
    } catch (error) {
        console.error("Failed to delete media from R2:", error);
    }
};

const autoChatMediaCleanup = () => {
    // Runs every hour at minute 0
    cron.schedule('0 * * * *', async () => {
        try {
            console.log("[Cron Sweeper] Starting 7-day cleanup...");
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            // Find messages that are 'seen' AND older than 7 days
            const expiredMessages = await Message.find({
                status: 'seen',
                updatedAt: { $lte: sevenDaysAgo }
            });

            if (expiredMessages.length === 0) {
                console.log("[Cron Sweeper] No expired messages found.");
                return;
            }

            for (const msg of expiredMessages) {
                // Check if this is the last document using this file
                if (msg.mediaUrl) {
                    const count = await Message.countDocuments({ mediaUrl: msg.mediaUrl });
                    if (count <= 1) {
                        await deleteMediaFromR2(msg.mediaUrl);
                    }
                }
                // Wipe from MongoDB
                await Message.findByIdAndDelete(msg._id);
            }

            console.log(`[Cron Sweeper] Successfully cleaned up ${expiredMessages.length} messages.`);
        } catch (error) {
            console.error("[Cron Sweeper] Cleanup Error:", error);
        }
    });
    console.log("⏰ [Cron Sweeper] Auto-cleanup service initialized");
}

module.exports = autoChatMediaCleanup;