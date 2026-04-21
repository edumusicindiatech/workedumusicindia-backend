const express = require('express');
const chatRouter = express.Router();
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const cron = require('node-cron');

const chatS3Client = require('../config/chatS3Client');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Group = require('../models/Group'); // <-- IMPORT GROUP MODEL
const userAuth = require('../middleware/userAuth');
const admin = require('../utils/firebaseAdmin')
const User = require('../models/User');

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

// --- S3 UPLOAD/DOWNLOAD ROUTES (Unchanged) ---
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
        if (!baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`;

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

// --- CORE CHAT ROUTES (UPDATED FOR GROUPS) ---


chatRouter.post('/message', userAuth, async (req, res) => {
    try {
        const { senderId, recipientId, text, mediaUrl, mediaType, fileSize, status, isGroup } = req.body;

        let conversationId = null;
        let groupId = null;

        if (isGroup) {
            const group = await Group.findById(recipientId);
            if (!group) return res.status(404).json({ error: "Group not found" });
            groupId = group._id;
            group.updatedAt = new Date();
            await group.save();
        } else {
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
            conversationId = conversation._id;
        }

        const newMessage = await Message.create({
            conversationId: conversationId,
            groupId: groupId,
            isGroup: isGroup || false,
            sender: senderId,
            recipientId: isGroup ? null : recipientId, // Ensure recipient is saved for 1-on-1
            text: text || "",
            mediaUrl: mediaUrl || "",
            mediaType: mediaType || "text",
            fileSize: fileSize || 0,
            status: status || 'sent'
        });

        if (conversationId) {
            await Conversation.findByIdAndUpdate(conversationId, { lastMessage: newMessage._id });
        }

        // =========================================================================
        // 🚀 WHATSAPP ARCHITECTURE: THE HARDWARE QUEUE (FCM)
        // =========================================================================
        if (!isGroup) {
            try {
                const recipient = await User.findById(recipientId);
                const senderUser = await User.findById(senderId); // 🚀 NEW: Fetch Sender

                if (recipient && recipient.fcmToken && senderUser) {
                    console.log(`\n[CHAT FCM QUEUE] 📨 Pushing to Google Play Services for User B (${recipientId})`);

                    // Truncate text so FCM payload doesn't exceed limits
                    const safeText = text ? text.substring(0, 150) : "Sent an attachment";

                    await admin.messaging().send({
                        token: recipient.fcmToken,
                        data: {
                            type: 'chat_message',
                            senderId: String(senderId),
                            senderName: String(senderUser.name), // 🚀 NEW: Tell Android the Name
                            messageText: String(safeText)        // 🚀 NEW: Tell Android the Text
                        },
                        android: {
                            priority: 'high'
                        }
                    });
                    console.log(`[CHAT FCM QUEUE] ✅ Successfully handed off to Google Hardware Queue.`);
                } else {
                    console.log(`[CHAT FCM QUEUE] ⚠️ User B has no FCM token. Cannot queue.`);
                }
            } catch (fcmErr) {
                console.error(`[CHAT FCM QUEUE] ❌ Failed to queue push:`, fcmErr.message);
            }
        }
        // =========================================================================

        res.status(201).json(newMessage);
    } catch (error) {
        console.error("[CHAT] Message save error:", error);
        res.status(500).json({ error: "Failed to save message" });
    }
});

// Fetch 1-on-1 History
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
            deletedFor: { $ne: user1 } // Don't return messages this user deleted
        }).sort({ createdAt: 1 });

        res.status(200).json({ success: true, data: messages });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to load messages" });
    }
});

// Fetch Group History
chatRouter.get('/history/group/:groupId/:userId', userAuth, async (req, res) => {
    try {
        const { groupId, userId } = req.params;

        const group = await Group.findById(groupId);
        if (!group) return res.status(200).json({ success: true, data: [] });

        // Ensure requester is actually in the group
        const isMember = group.members.some(m => String(m.user) === String(userId));
        if (!isMember) return res.status(403).json({ success: false, error: "Not a group member" });

        const messages = await Message.find({
            groupId: groupId,
            deletedFor: { $ne: userId }
        })
            .populate('sender', 'name profilePicture') // Needed for group chats to show names!
            .sort({ createdAt: 1 });

        res.status(200).json({ success: true, data: messages });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to load group messages" });
    }
});

// --- WHATSAPP-LIKE ACTIONS (UPDATED FOR GROUPS) ---

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

// Delete for Everyone (Smart Routing for Groups vs Peers)
chatRouter.put('/message/delete-everyone', userAuth, async (req, res) => {
    try {
        const { messageIds, userId } = req.body;

        const messages = await Message.find({ _id: { $in: messageIds }, sender: userId });

        const validMessages = messages.filter(msg => {
            const timeDiff = Date.now() - new Date(msg.createdAt).getTime();
            return timeDiff <= 1800000; // 30 minutes limit
        });

        if (validMessages.length === 0) return res.status(403).json({ success: false, error: "Time limit exceeded" });

        const updatedIds = [];

        for (const msg of validMessages) {
            if (msg.mediaUrl) {
                const count = await Message.countDocuments({ mediaUrl: msg.mediaUrl });
                if (count <= 1) await deleteMediaFromR2(msg.mediaUrl);
            }

            msg.text = "";
            msg.mediaUrl = "";
            msg.isDeletedForEveryone = true;
            await msg.save();

            updatedIds.push(msg._id.toString());
        }

        // --- SMART SOCKET EMISSION (GROUP vs DIRECT) ---
        if (updatedIds.length > 0 && req.io) {
            try {
                const sampleMsg = validMessages[0];

                if (sampleMsg.isGroup && sampleMsg.groupId) {
                    // Broadcast to Group Room
                    req.io.to(sampleMsg.groupId.toString()).emit("messages_deleted_everyone", { messageIds: updatedIds });
                } else if (sampleMsg.conversationId) {
                    // Broadcast to 1-on-1 Peer
                    const conv = await Conversation.findById(sampleMsg.conversationId);
                    if (conv) {
                        const recipientId = conv.participants.find(p => p.toString() !== userId.toString());
                        if (recipientId) {
                            req.io.to(recipientId.toString()).emit("messages_deleted_everyone", { messageIds: updatedIds });
                        }
                    }
                }
            } catch (socketErr) {
                console.error("[CHAT] Socket emission failed:", socketErr);
            }
        }

        res.status(200).json({ success: true, updatedIds });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to delete for everyone" });
    }
});

// Delete for Me (Handles both Conversation & Group ghost cleanups)
chatRouter.put('/message/delete-me', userAuth, async (req, res) => {
    try {
        const { messageIds, userId } = req.body;

        await Message.updateMany(
            { _id: { $in: messageIds } },
            { $addToSet: { deletedFor: userId } }
        );

        // Auto-Wipe ghost messages
        const updatedMessages = await Message.find({ _id: { $in: messageIds } })
            .populate('conversationId')
            .populate('groupId');

        for (const msg of updatedMessages) {
            let isOrphaned = false;

            if (msg.isGroup && msg.groupId) {
                // Orphaned if ALL group members deleted it
                if (msg.deletedFor.length >= msg.groupId.members.length) isOrphaned = true;
            } else if (msg.conversationId) {
                // Orphaned if BOTH peers deleted it
                if (msg.deletedFor.length === msg.conversationId.participants.length) isOrphaned = true;
            }

            if (isOrphaned) {
                if (msg.mediaUrl) {
                    const count = await Message.countDocuments({ mediaUrl: msg.mediaUrl });
                    if (count <= 1) await deleteMediaFromR2(msg.mediaUrl);
                }
                await Message.findByIdAndDelete(msg._id);
            }
        }

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to delete for me" });
    }
});

// Clear Entire 1-on-1 Chat
chatRouter.put('/clear/:user1/:user2', userAuth, async (req, res) => {
    try {
        const { user1, user2 } = req.params;

        const conversation = await Conversation.findOne({
            isGroup: false,
            participants: { $all: [user1, user2] }
        });

        if (!conversation) return res.status(404).json({ success: false, error: "Conversation not found" });

        await Message.updateMany(
            { conversationId: conversation._id },
            { $addToSet: { deletedFor: user1 } }
        );

        // Sweep Ghost Messages
        const orphanedMessages = await Message.find({
            conversationId: conversation._id,
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

// Clear Entire Group Chat
chatRouter.put('/clear/group/:groupId/:userId', userAuth, async (req, res) => {
    try {
        const { groupId, userId } = req.params;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, error: "Group not found" });

        await Message.updateMany(
            { groupId: group._id },
            { $addToSet: { deletedFor: userId } }
        );

        // Sweep Ghost Messages for Groups
        const orphanedMessages = await Message.find({
            groupId: group._id,
            [`deletedFor.${group.members.length - 1}`]: { $exists: true }
        });

        for (const msg of orphanedMessages) {
            if (msg.mediaUrl) {
                const count = await Message.countDocuments({ mediaUrl: msg.mediaUrl });
                if (count <= 1) await deleteMediaFromR2(msg.mediaUrl);
            }
            await Message.findByIdAndDelete(msg._id);
        }

        res.status(200).json({ success: true, message: "Group chat cleared" });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to clear group chat" });
    }
});

module.exports = chatRouter;