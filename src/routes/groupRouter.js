const express = require('express');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3'); // <-- ADDED
const chatS3Client = require('../config/chatS3Client');       // <-- ADDED

const Group = require('../models/Group');
const User = require('../models/User');
const Notification = require('../models/Notification');

const groupRouter = express.Router();

const hasAdminRights = (group, userId) => {
    return String(group.creator) === String(userId) || group.admins.some(admin => String(admin) === String(userId));
};

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
        console.log(`[Storage Cleanup] Deleted old group icon from R2: ${key}`);
    } catch (error) {
        console.error("Failed to delete group icon from R2:", error);
    }
};

// 1. Create a New Group
groupRouter.post('/create', async (req, res) => {
    try {
        const { name, description, groupIcon, creatorId, memberIds } = req.body;

        if (!name || !creatorId || !memberIds || !Array.isArray(memberIds)) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const uniqueMembers = [...new Set([creatorId, ...memberIds])];
        const membersData = uniqueMembers.map(id => ({ user: id, joinedAt: new Date() }));

        const newGroup = new Group({
            name, description, groupIcon, creator: creatorId, admins: [], members: membersData
        });

        await newGroup.save();

        const populatedGroup = await Group.findById(newGroup._id)
            .populate('creator', 'name email profilePicture role')
            .populate('admins', 'name email profilePicture role')
            .populate('members.user', 'name email profilePicture role');

        const creator = await User.findById(creatorId);

        if (req.io) {
            const notificationsToSave = [];
            for (const memberId of uniqueMembers) {
                if (String(memberId) !== String(creatorId)) {
                    req.io.to(String(memberId)).emit('added_to_group', populatedGroup);
                    notificationsToSave.push({
                        recipient: memberId,
                        title: 'New Group',
                        message: `${creator.name} added you to the group "${name}"`,
                        type: 'Message',
                        isRead: false
                    });
                }
            }
            if (notificationsToSave.length > 0) {
                await Notification.insertMany(notificationsToSave);
                req.io.emit('new_notification');
            }
        }

        res.status(201).json({ success: true, data: populatedGroup });
    } catch (error) {
        console.error("Group creation error:", error);
        res.status(500).json({ success: false, message: "Failed to create group" });
    }
});

// 2. Add Members to Group
groupRouter.put('/add-members', async (req, res) => {
    try {
        const { groupId, requesterId, newMemberIds } = req.body;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });

        if (!hasAdminRights(group, requesterId)) return res.status(403).json({ success: false, message: "Only admins can add members" });

        const currentMemberIds = group.members.map(m => String(m.user));
        const membersToAdd = newMemberIds
            .filter(id => !currentMemberIds.includes(String(id)))
            .map(id => ({ user: id, joinedAt: new Date() }));

        if (membersToAdd.length > 0) {
            group.members.push(...membersToAdd);
            await group.save();
        }

        const updatedGroup = await Group.findById(groupId)
            .populate('creator', 'name email profilePicture role')
            .populate('admins', 'name email profilePicture role')
            .populate('members.user', 'name email profilePicture role');

        const adder = await User.findById(requesterId);

        if (req.io) {
            const notificationsToSave = [];
            for (const member of membersToAdd) {
                const memberIdStr = String(member.user);
                req.io.to(memberIdStr).emit('added_to_group', updatedGroup);
                notificationsToSave.push({
                    recipient: memberIdStr,
                    title: 'Group Addition',
                    message: `${adder.name} added you to "${group.name}"`,
                    type: 'Message',
                    isRead: false
                });
            }

            if (notificationsToSave.length > 0) {
                await Notification.insertMany(notificationsToSave);
                req.io.emit('new_notification');
            }
            req.io.to(String(groupId)).emit('group_updated', updatedGroup);
        }

        res.status(200).json({ success: true, data: updatedGroup });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to add members" });
    }
});

// 3. Remove a Member
groupRouter.put('/remove-member', async (req, res) => {
    try {
        const { groupId, requesterId, targetUserId } = req.body;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });
        if (!hasAdminRights(group, requesterId)) return res.status(403).json({ success: false, message: "Only admins can remove members" });
        if (String(targetUserId) === String(group.creator)) return res.status(403).json({ success: false, message: "Cannot remove the group creator" });

        group.members = group.members.filter(m => String(m.user) !== String(targetUserId));
        group.admins = group.admins.filter(a => String(a) !== String(targetUserId));
        await group.save();

        const updatedGroup = await Group.findById(groupId)
            .populate('creator', 'name email profilePicture role')
            .populate('admins', 'name email profilePicture role')
            .populate('members.user', 'name email profilePicture role');

        if (req.io) {
            req.io.to(String(groupId)).emit('group_updated', updatedGroup);
            // 🟢 FIX 1: Send a distinct event to the user who was kicked
            req.io.to(String(targetUserId)).emit('removed_from_group', { groupId });
        }

        res.status(200).json({ success: true, data: updatedGroup });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to remove member" });
    }
});

// 4. Leave Group (Auto-Promotion)
groupRouter.put('/leave', async (req, res) => {
    try {
        const { groupId, userId } = req.body;

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });

        group.members = group.members.filter(m => String(m.user) !== String(userId));
        group.admins = group.admins.filter(a => String(a) !== String(userId));

        if (group.members.length === 0) {
            group.isActive = false;
        } else if (String(group.creator) === String(userId)) {
            // 🟢 FIX 2: Safely sort a COPY of the array using Date objects
            const sortedMembers = [...group.members].sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
            const oldestMemberId = sortedMembers[0].user;
            group.creator = oldestMemberId;

            // 🟢 FIX 3: Safely check for ObjectId existence using .some()
            const isAlreadyAdmin = group.admins.some(adminId => String(adminId) === String(oldestMemberId));
            if (!isAlreadyAdmin) {
                group.admins.push(oldestMemberId);
            }
        }

        await group.save();

        const updatedGroup = await Group.findById(groupId)
            .populate('creator', 'name email profilePicture role')
            .populate('admins', 'name email profilePicture role')
            .populate('members.user', 'name email profilePicture role');

        if (req.io) {
            req.io.to(String(groupId)).emit('group_updated', updatedGroup);
            // 🟢 FIX 1: Send a distinct event to the user who left
            req.io.to(String(userId)).emit('removed_from_group', { groupId });
        }

        res.status(200).json({ success: true, data: updatedGroup });
    } catch (error) {
        console.error("Leave Group Error:", error);
        res.status(500).json({ success: false, message: "Failed to leave group" });
    }
});

// 5. Promote to Admin
groupRouter.put('/promote', async (req, res) => {
    try {
        const { groupId, requesterId, targetUserId } = req.body;
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });
        if (!hasAdminRights(group, requesterId)) return res.status(403).json({ success: false, message: "Only admins can promote members" });

        if (!group.admins.includes(targetUserId)) {
            group.admins.push(targetUserId);
            await group.save();
        }

        const updatedGroup = await Group.findById(groupId).populate('creator').populate('admins').populate('members.user');
        if (req.io) req.io.to(String(groupId)).emit('group_updated', updatedGroup);

        res.status(200).json({ success: true, data: updatedGroup });
    } catch (error) { res.status(500).json({ success: false, message: "Failed to promote" }); }
});

// 6. Demote Admin (CREATOR ONLY)
groupRouter.put('/demote', async (req, res) => {
    try {
        const { groupId, requesterId, targetUserId } = req.body;
        const group = await Group.findById(groupId);

        if (String(group.creator) !== String(requesterId)) return res.status(403).json({ success: false, message: "Only Creator can demote Admins" });

        group.admins = group.admins.filter(a => String(a) !== String(targetUserId));
        await group.save();

        const updatedGroup = await Group.findById(groupId).populate('creator').populate('admins').populate('members.user');
        if (req.io) req.io.to(String(groupId)).emit('group_updated', updatedGroup);

        res.status(200).json({ success: true, data: updatedGroup });
    } catch (error) { res.status(500).json({ success: false, message: "Failed to demote" }); }
});

// 7. Update Group Details (Name or Profile Picture)
groupRouter.put('/update', async (req, res) => {
    try {
        const { groupId, requesterId, name, groupIcon } = req.body;

        if (!groupId || !requesterId) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: "Group not found" });

        if (!hasAdminRights(group, requesterId)) {
            return res.status(403).json({ success: false, message: "Only admins can update group details" });
        }

        let isUpdated = false;

        if (name && name.trim() !== "") {
            group.name = name.trim();
            isUpdated = true;
        }

        // --- CLOUDFLARE R2 CLEANUP LOGIC ---
        if (groupIcon !== undefined) {
            // If the group currently has an icon, AND the new icon is different (or empty), delete the old one
            if (group.groupIcon && group.groupIcon !== groupIcon) {
                await deleteMediaFromR2(group.groupIcon);
            }

            group.groupIcon = groupIcon;
            isUpdated = true;
        }

        if (isUpdated) {
            await group.save();
        }

        const updatedGroup = await Group.findById(groupId)
            .populate('creator', 'name email profilePicture role')
            .populate('admins', 'name email profilePicture role')
            .populate('members.user', 'name email profilePicture role');

        if (req.io) {
            req.io.to(String(groupId)).emit('group_updated', updatedGroup);
        }

        res.status(200).json({ success: true, data: updatedGroup });

    } catch (error) {
        console.error("Failed to update group details:", error);
        res.status(500).json({ success: false, message: "Failed to update group details" });
    }
});

// 8. Fetch My Groups (For Initial Load)
groupRouter.get('/my-groups/:userId', async (req, res) => {
    try {
        const groups = await Group.find({ 'members.user': req.params.userId, isActive: true })
            .populate('creator', 'name email profilePicture role')
            .populate('admins', 'name email profilePicture role')
            .populate('members.user', 'name email profilePicture role')
            .populate({
                path: 'lastMessage',
                populate: { path: 'sender', select: 'name profilePicture' }
            })
            .sort({ updatedAt: -1 });

        res.status(200).json({ success: true, data: groups });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch groups" });
    }
});

module.exports = groupRouter;