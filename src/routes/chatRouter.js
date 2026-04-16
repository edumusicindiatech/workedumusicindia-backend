const express = require('express');
const chatRouter = express.Router();
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const cron = require('node-cron');

const chatS3Client = require('../config/chatS3Client');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const userAuth = require('../middleware/userAuth');

// --- HELPER: SAFE R2 MEDIA DELETION ---
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
        console.log(`[Storage Cleanup] Deleted orphaned media from R2: ${key}`);
    } catch (error) {
        console.error("Failed to delete media from R2:", error);
    }
};

// --- EXISTING S3 ROUTES ---
chatRouter.post('/generate-presigned-url', userAuth, async (req, res) => {
    try {
        const { fileType, originalName } = req.body;
        const extension = originalName.split('.').pop();
        const uniqueFileName = `${crypto.randomBytes(16).toString('hex')}.${extension}`;

        const command = new PutObjectCommand({
            Bucket: process.env.CHAT_MEDIA_BUCKET.replace(/['"]/g, ''),
            Key: uniqueFileName,
            ContentType: fileType,
        });

        const presignedUrl = await getSignedUrl(chatS3Client, command, { expiresIn: 60 });
        let baseUrl = process.env.CHAT_MEDIA_PUBLIC_URL.trim().replace(/\/$/, '');

        if (!baseUrl.startsWith('http')) {
            baseUrl = `https://${baseUrl}`;
        }

        const publicUrl = `${baseUrl}/${uniqueFileName}`;
        res.json({ presignedUrl, publicUrl });
    } catch (error) {
        res.status(500).json({ error: "Failed to generate upload URL" });
    }
});

chatRouter.post('/generate-download-url', userAuth, async (req, res) => {
    try {
        const { fileUrl } = req.body;
        if (!fileUrl) return res.status(400).json({ success: false, error: "File URL is required" });

        const urlParts = new URL(fileUrl);
        const key = urlParts.pathname.startsWith('/') ? urlParts.pathname.substring(1) : urlParts.pathname;
        const filename = key.split('/').pop();

        const command = new GetObjectCommand({
            Bucket: process.env.CHAT_MEDIA_BUCKET.replace(/['"]/g, ''),
            Key: key,
            ResponseContentDisposition: `attachment; filename="${filename}"`,
        });

        const downloadUrl = await getSignedUrl(chatS3Client, command, { expiresIn: 60 });
        res.json({ success: true, downloadUrl });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to generate download link" });
    }
});

// --- EXISTING FETCH ROUTES ---
chatRouter.get('/conversations/:userId', userAuth, async (req, res) => {
    try {
        const conversations = await Conversation.find({ participants: req.params.userId })
            .populate('participants', 'name email profilePic role')
            .populate('lastMessage')
            .sort({ updatedAt: -1 });
        res.status(200).json(conversations);
    } catch (error) {
        res.status(500).json({ error: "Failed to load conversations" });
    }
});

chatRouter.get('/messages/:conversationId', userAuth, async (req, res) => {
    try {
        const messages = await Message.find({ conversationId: req.params.conversationId }).sort({ createdAt: 1 });
        res.status(200).json(messages);
    } catch (error) {
        res.status(500).json({ error: "Failed to load messages" });
    }
});

chatRouter.post('/message', userAuth, async (req, res) => {
    try {
        const { senderId, recipientId, text, mediaUrl, mediaType, fileSize, status } = req.body;

        let conversation = await Conversation.findOne({
            isGroup: false,
            participants: { $all: [senderId, recipientId] }
        });

        if (!conversation) {
            conversation = await Conversation.create({
                participants: [senderId, recipientId],
                isGroup: false
            });
        }

        const newMessage = await Message.create({
            conversationId: conversation._id,
            sender: senderId,
            text: text || "",
            mediaUrl: mediaUrl || "",
            mediaType: mediaType || "text",
            fileSize: fileSize || 0,
            status: status || 'sent'
        });

        conversation.lastMessage = newMessage._id;
        await conversation.save();

        res.status(201).json(newMessage);
    } catch (error) {
        res.status(500).json({ error: "Failed to save message" });
    }
});

chatRouter.get('/history/:user1/:user2', userAuth, async (req, res) => {
    try {
        const { user1, user2 } = req.params;

        const conversation = await Conversation.findOne({
            isGroup: false,
            participants: { $all: [user1, user2] }
        });

        if (!conversation) return res.status(200).json({ success: true, data: [] });

        const messages = await Message.find({
            conversationId: conversation._id,
            deletedFor: { $ne: user1 }
        }).sort({ createdAt: 1 });

        res.status(200).json({ success: true, data: messages });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to load messages" });
    }
});

// --- NEW WHATSAPP-LIKE ROUTES ---

// 1. Edit Message
chatRouter.put('/message/edit/:id', userAuth, async (req, res) => {
    try {
        const { text, userId } = req.body;
        const message = await Message.findById(req.params.id);

        if (!message) return res.status(404).json({ success: false, error: "Message not found" });
        if (message.sender.toString() !== userId) return res.status(403).json({ success: false, error: "Unauthorized" });

        const timeDiff = Date.now() - new Date(message.createdAt).getTime();
        if (timeDiff > 1800000) return res.status(403).json({ success: false, error: "Edit time limit exceeded" });

        message.text = text;
        message.isEdited = true;
        await message.save();

        res.status(200).json({ success: true, data: message });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to edit message" });
    }
});

// 2. Delete for Everyone (Soft Delete with Safe Storage Cleanup)
chatRouter.put('/message/delete-everyone', userAuth, async (req, res) => {
    try {
        const { messageIds, userId } = req.body; 

        const messages = await Message.find({ _id: { $in: messageIds }, sender: userId });

        const validMessages = messages.filter(msg => {
            const timeDiff = Date.now() - new Date(msg.createdAt).getTime();
            return timeDiff <= 1800000; // 30 minutes
        });

        if (validMessages.length === 0) {
            return res.status(403).json({ success: false, error: "Time limit exceeded" });
        }

        const updatedIds = [];

        for (const msg of validMessages) {
            // Check if media is safe to delete from Cloudflare
            if (msg.mediaUrl) {
                const count = await Message.countDocuments({ mediaUrl: msg.mediaUrl });
                if (count <= 1) { // It's only used by this exact message
                    await deleteMediaFromR2(msg.mediaUrl);
                }
            }

            // Morph into a Tombstone
            msg.text = "";
            msg.mediaUrl = "";
            msg.isDeletedForEveryone = true;
            await msg.save();
            updatedIds.push(msg._id);
        }

        res.status(200).json({ success: true, updatedIds });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to delete for everyone" });
    }
});

// 3. Delete for Me (Local Wipe with Auto-Hard Delete)
chatRouter.put('/message/delete-me', userAuth, async (req, res) => {
    try {
        const { messageIds, userId } = req.body;

        // 1. Add user to the deletedFor array
        await Message.updateMany(
            { _id: { $in: messageIds } },
            { $addToSet: { deletedFor: userId } } 
        );

        // 2. Check for fully orphaned messages to Hard Delete
        const updatedMessages = await Message.find({ _id: { $in: messageIds } }).populate('conversationId');

        for (const msg of updatedMessages) {
            if (msg.conversationId && msg.deletedFor.length === msg.conversationId.participants.length) {
                // Both participants deleted it! It's a ghost.
                if (msg.mediaUrl) {
                    const count = await Message.countDocuments({ mediaUrl: msg.mediaUrl });
                    if (count <= 1) {
                        await deleteMediaFromR2(msg.mediaUrl);
                    }
                }
                await Message.findByIdAndDelete(msg._id);
            }
        }

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to delete for me" });
    }
});

// 4. Clear Entire Chat (Batch Wipe)
chatRouter.put('/clear/:user1/:user2', userAuth, async (req, res) => {
    try {
        const { user1, user2 } = req.params;

        const conversation = await Conversation.findOne({
            isGroup: false,
            participants: { $all: [user1, user2] }
        });

        if (!conversation) return res.status(404).json({ success: false, error: "Conversation not found" });

        // Add user to the deletedFor array of ALL messages
        await Message.updateMany(
            { conversationId: conversation._id },
            { $addToSet: { deletedFor: user1 } }
        );

        // Sweep up messages that BOTH users have now cleared
        const orphanedMessages = await Message.find({
            conversationId: conversation._id,
            // Check if deletedFor array has both users (for 1-on-1 chats, length = 2)
            [`deletedFor.${conversation.participants.length - 1}`]: { $exists: true } 
        });

        for (const msg of orphanedMessages) {
            if (msg.mediaUrl) {
                const count = await Message.countDocuments({ mediaUrl: msg.mediaUrl });
                if (count <= 1) await deleteMediaFromR2(msg.mediaUrl);
            }
            await Message.findByIdAndDelete(msg._id);
        }

        res.status(200).json({ success: true, message: "Chat cleared" });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to clear chat" });
    }
});


module.exports = chatRouter;