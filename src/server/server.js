const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');

const connectDB = require('../database/config');
const authRouter = require('../routes/authRouter');
const employeeRouter = require('../routes/employeeRouter');
const adminRouter = require('../routes/adminRouter');
const startShiftWarningCron = require('../jobs/shiftWarningCron');
const notificationRouter = require('../routes/notificationRouter');
const communicationRouter = require('../routes/communicationRouter');
const progressRouter = require('../routes/progressRouter');
const startDailyReportsCron = require('../jobs/dailyReportReminder');
const startAutoAbsentCron = require('../jobs/autoAbsentCron');
const startCheckoutReminderCron = require('../jobs/checkoutReminderCron');
const startKeepAliveCron = require('../jobs/keepAliveCron');
const startWeeklyScoreCron = require('../jobs/weeklyScoreCron');
const LearningRouter = require('../routes/LearningRouter');

const User = require('../models/User');
const School = require('../models/School');
const Notification = require('../models/Notification');
const Group = require('../models/Group');
const { sendSOSEmergencyEmail } = require('../utils/emailService');
const chatRouter = require('../routes/chatRouter');
const autoChatMediaCleanup = require('../jobs/autoChatMediaCleanup');
const groupRouter = require('../routes/groupRouter');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: [
            'http://localhost:5173',
            process.env.FRONTEND_URL,
            'https://www.workedumusicindia.com',
            'https://workedumusicindia.com'
        ],
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

const activeLocations = new Map();
const onlineUsers = new Map();

const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

io.on('connection', (socket) => {

    socket.on('join_room', async (userId) => {
        if (!userId) return;
        const safeUserId = String(userId);
        socket.join(safeUserId);
        onlineUsers.set(safeUserId, socket.id);
        try {
            const userGroups = await Group.find({ 'members.user': safeUserId, isActive: true });
            userGroups.forEach(group => {
                socket.join(String(group._id));
            });
        } catch (err) {
            console.error("Failed to join group rooms:", err);
        }
        io.emit('online_users_updated', Array.from(onlineUsers.keys()));
    });

    socket.on('join_group_room', (groupId) => {
        if (groupId) socket.join(String(groupId));
    });

    socket.on('join_admin_room', () => {
        socket.join('admin_live_tracking');
    });

    socket.on('update_live_location', (data) => {
        if (!data) return;
        const { employeeId, lat, lng } = data;
        if (employeeId && lat && lng) {
            activeLocations.set(String(employeeId), { lat, lng, timestamp: Date.now() });
            io.to('admin_live_tracking').emit('employee_location_changed', {
                employeeId, lat, lng, timestamp: new Date()
            });
        }
    });

    // CONSOLIDATED BROADCAST LOGIC
    socket.on('send_message', (data) => {
        if (!data || !data.recipientId) return;
        const recipientStr = String(data.recipientId);

        // Broadcast to specific room (UserID or GroupID)
        socket.to(recipientStr).emit('receive_message', data);

        // Delivery feedback for 1-on-1 only
        if (!data.isGroup && onlineUsers.has(recipientStr)) {
            socket.emit('messages_status_update', {
                viewerId: recipientStr,
                status: 'delivered'
            });
        }
    });

    socket.on('message_delivered', (data) => {
        if (!data || !data.senderId) return;
        socket.to(String(data.senderId)).emit('messages_status_update', {
            viewerId: data.recipientId,
            status: 'delivered'
        });
    });

    socket.on('mark_chat_seen', (data) => {
        if (!data || !data.senderId) return;
        socket.to(String(data.senderId)).emit('messages_status_update', {
            viewerId: data.recipientId,
            status: 'seen'
        });
    });

    socket.on('call_user', (data) => {
        if (!data || !data.userToCall) return;
        const { userToCall, signalData, from, callerName, profilePicture, callType } = data;
        socket.to(String(userToCall)).emit('incoming_call', { signal: signalData, from, callerName, profilePicture, callType });
    });

    socket.on('answer_call', (data) => {
        if (!data || !data.to) return;
        socket.to(String(data.to)).emit('call_accepted', data.signal);
    });

    socket.on('end_call', (data) => {
        if (!data || !data.to) return;
        socket.to(String(data.to)).emit('call_ended');
    });

    socket.on('ice_candidate', (data) => {
        if (!data || !data.to) return;
        socket.to(String(data.to)).emit('ice_candidate', { candidate: data.candidate, from: data.from });
    });

    socket.on('delete_message', (data) => {
        if (!data || !data.recipientId) return;
        socket.to(String(data.recipientId)).emit('message_deleted', { messageId: data.messageId, timestamp: data.timestamp });
    });

    socket.on('renegotiate', (data) => {
        if (!data || !data.to) return;
        socket.to(String(data.to)).emit('renegotiate', { signal: data.signal });
    });

    socket.on('video_upgrade_request', (data) => {
        if (!data || !data.to) return;
        socket.to(String(data.to)).emit('video_upgrade_request', { from: socket.id });
    });

    socket.on('video_upgrade_accepted', (data) => {
        if (!data || !data.to) return;
        socket.to(String(data.to)).emit('video_upgrade_accepted', { from: socket.id });
    });

    socket.on('video_upgrade_rejected', (data) => {
        if (!data || !data.to) return;
        socket.to(String(data.to)).emit('video_upgrade_rejected', { from: socket.id });
    });

    socket.on('notify_busy', (data) => {
        if (!data || !data.to) return;
        socket.to(String(data.to)).emit('peer_is_busy');
    });

    socket.on('hold_call', (data) => {
        if (!data || !data.to) return;
        socket.to(String(data.to)).emit('call_on_hold', { by: data.from });
    });

    socket.on('resume_call', (data) => {
        if (!data || !data.to) return;
        socket.to(String(data.to)).emit('call_resumed');
    });

    socket.on('trigger_sos', async (data) => {
        if (!data || !data.employeeId) return;
        const { employeeId, lat, lng } = data;

        try {
            const sender = await User.findById(employeeId);
            if (!sender) return;

            const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] } });
            const recipients = [...admins];
            const notifiedPeerIds = new Set();

            const allEmployees = await User.find({ role: 'Employee', _id: { $ne: employeeId } });
            const SEARCH_RADIUS_METERS = 5000;
            const ACTIVE_TIME_LIMIT = 15 * 60 * 1000;
            const now = Date.now();

            for (const emp of allEmployees) {
                const empIdStr = emp._id.toString();
                const liveData = activeLocations.get(empIdStr);

                if (liveData && (now - liveData.timestamp) < ACTIVE_TIME_LIMIT) {
                    const dist = calculateDistanceMeters(lat, lng, liveData.lat, liveData.lng);
                    if (dist <= SEARCH_RADIUS_METERS) {
                        recipients.push(emp);
                        notifiedPeerIds.add(empIdStr);
                    }
                }
            }

            const allSchools = await School.find({});
            const nearbySchoolIds = allSchools
                .filter(s => {
                    if (!s.location || !s.location.coordinates || s.location.coordinates.length < 2) return false;
                    const sLng = parseFloat(s.location.coordinates[0]);
                    const sLat = parseFloat(s.location.coordinates[1]);
                    return calculateDistanceMeters(lat, lng, sLat, sLng) <= SEARCH_RADIUS_METERS;
                })
                .map(s => s._id.toString());

            for (const emp of allEmployees) {
                const empIdStr = emp._id.toString();
                if (notifiedPeerIds.has(empIdStr)) continue;

                const isAssignedToNearbySchool = emp.assignments?.some(a => {
                    const schoolIdStr = a.school?.toString() || a.schoolId?.toString();
                    return nearbySchoolIds.includes(schoolIdStr);
                });

                if (isAssignedToNearbySchool) {
                    recipients.push(emp);
                    notifiedPeerIds.add(empIdStr);
                }
            }

            const timestamp = new Date();
            const notificationsToSave = [];

            for (const admin of admins) {
                const adminIdStr = admin._id.toString();
                io.to(adminIdStr).emit('sos_alert_received', { senderName: sender.name, employeeId, lat, lng, timestamp });
                notificationsToSave.push({
                    recipient: adminIdStr, title: '🚨 EMERGENCY SOS', message: `${sender.name} has triggered an emergency alert!`, type: 'Warning', isRead: false
                });
            }

            for (const peerId of notifiedPeerIds) {
                io.to(peerId).emit('sos_alert_received', { senderName: sender.name, employeeId, lat, lng, timestamp });
                notificationsToSave.push({
                    recipient: peerId, title: '🚨 EMERGENCY SOS', message: `${sender.name} has triggered an emergency alert!`, type: 'Warning', isRead: false
                });
            }

            if (notificationsToSave.length > 0) {
                await Notification.insertMany(notificationsToSave);
            }

            for (const recipient of recipients) {
                if (recipient.email) {
                    await sendSOSEmergencyEmail(recipient.email, recipient.name, sender.name, lat, lng);
                }
            }

        } catch (error) {
            console.error("Critical error processing SOS trigger:", error);
        }
    });

    socket.on('disconnect', () => {
        for (const [userId, socketId] of onlineUsers.entries()) {
            if (socketId === socket.id) {
                onlineUsers.delete(userId);
                io.emit('online_users_updated', Array.from(onlineUsers.keys()));
                break;
            }
        }
    });
});

app.use((req, res, next) => {
    req.io = io;
    next();
});

app.get('/health', (req, res) => {
    res.status(200).send('Server is awake and healthy.');
});

app.use(cookieParser());
app.use(cors({
    origin: [
        'http://localhost:5173',
        process.env.FRONTEND_URL,
        'https://www.workedumusicindia.com',
        'https://workedumusicindia.com'
    ],
    credentials: true
}));
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ limit: '30mb', extended: true }));

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/employee', employeeRouter);
app.use('/api/admin/notifications', notificationRouter);
app.use('/api/employee/notifications', notificationRouter);
app.use('/api/admin/communication', communicationRouter);
app.use('/api/admin/progress', progressRouter);
app.use('/api/learning', LearningRouter);
app.use('/api/chat', chatRouter);
app.use('/api/group', groupRouter);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is successfully running on port ${PORT}`);
        startShiftWarningCron(io);
        startDailyReportsCron(io);
        startKeepAliveCron();
        startAutoAbsentCron(io);
        startCheckoutReminderCron(io);
        startWeeklyScoreCron(io);
        autoChatMediaCleanup();
    });
}).catch(err => {
    console.error("Failed to connect to the database", err);
});