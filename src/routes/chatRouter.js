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

        // Generate a random 16-character hex string to ensure the filename is completely unique
        const extension = originalName.split('.').pop();
        const uniqueFileName = `${crypto.randomBytes(16).toString('hex')}.${extension}`;

        const command = new PutObjectCommand({
            Bucket: process.env.CHAT_MEDIA_BUCKET, // e.g., "workforce-chat-media"
            Key: uniqueFileName,
            ContentType: fileType,
        });

        // The URL expires in 60 seconds. The frontend has 1 minute to start the upload.
        const presignedUrl = await getSignedUrl(chatS3Client, command, { expiresIn: 60 });

        // The final public URL where the image will live
        // Note: You must enable "Public Access" or link a Custom Domain to this new bucket in Cloudflare
        const publicUrl = `${process.env.CHAT_R2_PUBLIC_DOMAIN}/${uniqueFileName}`;

        res.json({ presignedUrl, publicUrl });

    } catch (error) {
        console.error("Error generating presigned URL:", error);
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
        const { senderId, recipientId, text, mediaUrl, mediaType } = req.body;

        // Find existing conversation between these two users
        let conversation = await Conversation.findOne({
            isGroup: false,
            participants: { $all: [senderId, recipientId] }
        });

        // If it's their first time chatting, create a new conversation thread
        if (!conversation) {
            conversation = await Conversation.create({
                participants: [senderId, recipientId],
                isGroup: false
            });
        }

        // Save the actual message
        const newMessage = await Message.create({
            conversationId: conversation._id,
            sender: senderId,
            text: text || "",
            mediaUrl: mediaUrl || "",
            mediaType: mediaType || "text"
        });

        // Update the conversation's last message for the sidebar preview
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