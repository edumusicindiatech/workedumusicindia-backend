const express = require('express');
const chatRouter = express.Router();
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

const chatS3Client = require('../config/chatS3Client');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const userAuth = require('../middleware/userAuth');

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

        // FORCE CORRECT FORMATTING
        let baseUrl = process.env.CHAT_MEDIA_PUBLIC_URL.trim().replace(/\/$/, '');

        // If for some reason the env only has the bucket name, this prefixing fixes it
        if (!baseUrl.startsWith('http')) {
            baseUrl = `https://${baseUrl}`;
        }

        const publicUrl = `${baseUrl}/${uniqueFileName}`;

        console.log("DEBUG: Generated Public URL:", publicUrl); // Check your terminal for this!
        res.json({ presignedUrl, publicUrl });
    } catch (error) {
        res.status(500).json({ error: "Failed to generate upload URL" });
    }
});

chatRouter.get('/conversations/:userId', userAuth, async (req, res) => {
    try {
        const conversations = await Conversation.find({
            participants: req.params.userId
        })
            .populate('participants', 'name email profilePic role') // Adjust fields based on your User model
            .populate('lastMessage')
            .sort({ updatedAt: -1 });

        res.status(200).json(conversations);
    } catch (error) {
        console.error("Error fetching conversations:", error);
        res.status(500).json({ error: "Failed to load conversations" });
    }
});

chatRouter.get('/messages/:conversationId', userAuth, async (req, res) => {
    try {
        const messages = await Message.find({
            conversationId: req.params.conversationId
        }).sort({ createdAt: 1 }); // Oldest to newest

        res.status(200).json(messages);
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ error: "Failed to load messages" });
    }
});

chatRouter.post('/message', userAuth, async (req, res) => {
    try {
        // ADD fileSize and status to destructuring
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
            fileSize: fileSize || 0, // <--- ADD THIS
            status: status || 'sent' // <--- ADD THIS
        });

        conversation.lastMessage = newMessage._id;
        await conversation.save();

        res.status(201).json(newMessage);
    } catch (error) {
        console.error("Error saving message:", error);
        res.status(500).json({ error: "Failed to save message" });
    }
});

chatRouter.get('/history/:user1/:user2', userAuth, async (req, res) => {
    try {
        const { user1, user2 } = req.params;

        // Find the conversation linking these two users
        const conversation = await Conversation.findOne({
            isGroup: false,
            participants: { $all: [user1, user2] }
        });

        if (!conversation) {
            return res.status(200).json({ success: true, data: [] });
        }

        // Fetch all messages belonging to that conversation
        const messages = await Message.find({
            conversationId: conversation._id
        }).sort({ createdAt: 1 }); // Oldest to newest

        res.status(200).json({ success: true, data: messages });
    } catch (error) {
        console.error("Error fetching direct messages:", error);
        res.status(500).json({ success: false, error: "Failed to load messages" });
    }
});

chatRouter.delete('/message/:id', userAuth, async (req, res) => {
    try {
        await Message.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Error deleting message:", error);
        res.status(500).json({ success: false, error: "Failed to delete" });
    }
});

module.exports = chatRouter;