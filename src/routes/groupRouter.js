const express = require('express');
const Group = require('../models/Group');
const User = require('../models/User');
const Notification = require('../models/Notification'); // Needed for notifications

const groupRouter = express.Router();

const hasAdminRights = (group, userId) => {
    return String(group.creator) === String(userId) || group.admins.some(admin => String(admin) === String(userId));
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

        // --- REAL-TIME NOTIFICATIONS & SOCKET EMITS ---
        if (req.io) {
            const notificationsToSave = [];
            for (const memberId of uniqueMembers) {
                if (String(memberId) !== String(creatorId)) {
                    // 1. Emit to socket so their UI updates instantly
                    req.io.to(String(memberId)).emit('added_to_group', populatedGroup);

                    // 2. Prepare DB Notification
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
                // Trigger navbar bell update
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

        // --- REAL-TIME NOTIFICATIONS & SOCKET EMITS ---
        if (req.io) {
            const notificationsToSave = [];

            // Notify newly added members
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

            // Notify existing members that group updated
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
            // Tell the removed person they were kicked so their UI clears
            req.io.to(String(targetUserId)).emit('group_updated', updatedGroup);
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
            const sortedMembers = group.members.sort((a, b) => a.joinedAt - b.joinedAt);
            const oldestMemberId = sortedMembers[0].user;
            group.creator = oldestMemberId;
            if (!group.admins.includes(oldestMemberId)) group.admins.push(oldestMemberId);
        }

        await group.save();

        const updatedGroup = await Group.findById(groupId)
            .populate('creator', 'name email profilePicture role')
            .populate('admins', 'name email profilePicture role')
            .populate('members.user', 'name email profilePicture role');

        if (req.io) {
            req.io.to(String(groupId)).emit('group_updated', updatedGroup);
            req.io.to(String(userId)).emit('group_updated', updatedGroup); // Clear for leaver
        }

        res.status(200).json({ success: true, data: updatedGroup });
    } catch (error) {
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

// 8. Fetch My Groups (For Initial Load)
groupRouter.get('/my-groups/:userId', async (req, res) => {
    try {
        const groups = await Group.find({ 'members.user': req.params.userId, isActive: true })
            .populate('creator', 'name email profilePicture role')
            .populate('admins', 'name email profilePicture role')
            .populate('members.user', 'name email profilePicture role')
            .sort({ updatedAt: -1 });

        res.status(200).json({ success: true, data: groups });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch groups" });
    }
});

module.exports = groupRouter;