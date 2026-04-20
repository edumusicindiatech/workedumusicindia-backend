const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const AppRelease = require('../models/AppRelease');
const admin = require('../utils/firebaseAdmin');
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
const appRouter = require('../routes/appRouter');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost',
    'capacitor://localhost',
    'https://experimental-voip-calls.workedumusicindia-frontend.pages.dev',
    process.env.FRONTEND_URL,
    'https://www.workedumusicindia.com',
    'https://workedumusicindia.com'
];

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

const shrinkSignalForFcm = (signal) => {
    if (!signal || !signal.sdp) return JSON.stringify(signal);
    const lines = signal.sdp.split('\n');
    const minimalSdp = lines.filter(line => {
        return line.startsWith('v=') || line.startsWith('o=') || line.startsWith('s=') || 
               line.startsWith('t=') || line.startsWith('m=') || line.startsWith('c=') || 
               line.startsWith('a=mid') || line.startsWith('a=rtpmap');
    }).join('\n');
    const shrunken = JSON.stringify({ type: signal.type, sdp: minimalSdp });
    return shrunken;
};

const activeLocations = new Map();
const onlineUsers = new Map();

const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
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
            userGroups.forEach(group => socket.join(String(group._id)));
        } catch (err) {}
        io.emit('online_users_updated', Array.from(onlineUsers.keys()));
    });

    socket.on('join_group_room', (groupId) => { if (groupId) socket.join(String(groupId)); });
    socket.on('join_admin_room', () => { socket.join('admin_live_tracking'); });

    socket.on('update_live_location', (data) => {
        if (!data) return;
        const { employeeId, lat, lng } = data;
        if (employeeId && lat && lng) {
            activeLocations.set(String(employeeId), { lat, lng, timestamp: Date.now() });
            io.to('admin_live_tracking').emit('employee_location_changed', { employeeId, lat, lng, timestamp: new Date() });
        }
    });

    // --- WHATSAPP-STYLE MESSAGE TICK & FCM NOTIFICATION SYSTEM ---
    socket.on('send_message', async (data) => {
        if (!data || !data.recipientId) return;
        const recipientStr = String(data.recipientId);
        socket.to(recipientStr).emit('receive_message', data);

        if (!data.isGroup && onlineUsers.has(recipientStr)) {
            // Target is ONLINE -> Issue Double Tick Immediately
            socket.emit('messages_status_update', { viewerId: recipientStr, status: 'delivered' });
        } else if (!data.isGroup) {
            // Target is OFFLINE -> Send Chat Push Notification via FCM
            try {
                const recipientUser = await User.findById(recipientStr);
                if (recipientUser && recipientUser.fcmToken) {
                    let bodyText = data.text;
                    if (data.mediaUrl) {
                        if (data.mediaType === 'image') bodyText = '📷 Photo';
                        else if (data.mediaType === 'video') bodyText = '📹 Video';
                        else bodyText = '📄 Document';
                    }
                    const message = {
                        token: recipientUser.fcmToken,
                        notification: { title: data.sender?.name || 'New Message', body: bodyText },
                        data: { type: 'chat_message', senderId: String(data.senderId) },
                        android: { priority: 'high' }
                    };
                    await admin.messaging().send(message);
                    console.log(`💬 Chat FCM sent to ${recipientUser.name}`);
                }
            } catch (err) { console.error("Chat FCM Error:", err.message); }
        }
    });

    socket.on('message_delivered', (data) => {
        if (!data || !data.senderId) return;
        socket.to(String(data.senderId)).emit('messages_status_update', { viewerId: data.recipientId, status: 'delivered' });
    });

    socket.on('mark_chat_seen', (data) => {
        if (!data || !data.senderId) return;
        socket.to(String(data.senderId)).emit('messages_status_update', { viewerId: data.recipientId, status: 'seen' });
    });

    // --- VOIP CALL ROUTING ---
    socket.on('call_user', async (data) => {
        if (!data || !data.userToCall) return;
        const { userToCall, signalData, from, callerName, profilePicture, callType } = data;

        socket.to(String(userToCall)).emit('incoming_call', { signal: signalData, from, callerName, profilePicture, callType });

        try {
            const callee = await User.findById(userToCall);
            if (callee && callee.fcmToken) {
                const safePic = (profilePicture && profilePicture.length > 500) ? "" : profilePicture;
                const message = {
                    token: callee.fcmToken,
                    data: {
                        type: 'incoming_call',
                        callerName: String(callerName || 'Unknown').substring(0, 50),
                        callerId: String(from),
                        callType: String(callType || 'voice'),
                        profilePicture: String(safePic || ''),
                        signal: shrinkSignalForFcm(signalData)
                    },
                    android: { priority: 'high', ttl: 0 }
                };
                await admin.messaging().send(message);
            }
        } catch (error) { console.error("❌ Firebase FCM Error:", error.message); }
    });

    // 🚀 NEW: Ringing Handshake
    socket.on('device_is_ringing', (data) => {
        if (!data || !data.to) return;
        socket.to(String(data.to)).emit('device_is_ringing');
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

    socket.on('video_upgrade_request', (data) => { if (data && data.to) socket.to(String(data.to)).emit('video_upgrade_request', { from: socket.id }); });
    socket.on('video_upgrade_accepted', (data) => { if (data && data.to) socket.to(String(data.to)).emit('video_upgrade_accepted', { from: socket.id }); });
    socket.on('video_upgrade_rejected', (data) => { if (data && data.to) socket.to(String(data.to)).emit('video_upgrade_rejected', { from: socket.id }); });
    socket.on('notify_busy', (data) => { if (data && data.to) socket.to(String(data.to)).emit('peer_is_busy'); });
    socket.on('hold_call', (data) => { if (data && data.to) socket.to(String(data.to)).emit('call_on_hold', { by: data.from }); });
    socket.on('resume_call', (data) => { if (data && data.to) socket.to(String(data.to)).emit('call_resumed'); });

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
            const now = Date.now();

            for (const emp of allEmployees) {
                const empIdStr = emp._id.toString();
                const liveData = activeLocations.get(empIdStr);
                if (liveData && (now - liveData.timestamp) < 15 * 60 * 1000) {
                    if (calculateDistanceMeters(lat, lng, liveData.lat, liveData.lng) <= 5000) {
                        recipients.push(emp);
                        notifiedPeerIds.add(empIdStr);
                    }
                }
            }

            const timestamp = new Date();
            for (const admin of admins) {
                io.to(admin._id.toString()).emit('sos_alert_received', { senderName: sender.name, employeeId, lat, lng, timestamp });
            }
            for (const peerId of notifiedPeerIds) {
                io.to(peerId).emit('sos_alert_received', { senderName: sender.name, employeeId, lat, lng, timestamp });
            }
            for (const recipient of recipients) {
                if (recipient.email) await sendSOSEmergencyEmail(recipient.email, recipient.name, sender.name, lat, lng);
            }
        } catch (error) {}
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

app.use((req, res, next) => { req.io = io; next(); });
app.get('/health', (req, res) => { res.status(200).send('Server is awake and healthy.'); });
app.use(cookieParser());
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
        return callback(new Error('CORS block'), false);
    }, credentials: true
}));
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ limit: '30mb', extended: true }));
app.use(express.static('public'));
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
app.use('/api/app', appRouter);

const PORT = process.env.PORT || 5000;

async function autoDeployOtaUpdate() {
    try {
        const zipPath = path.join(process.cwd(), 'public', 'update.zip');
        if (!fs.existsSync(zipPath)) return;
        const hashSum = crypto.createHash('sha256');
        hashSum.update(fs.readFileSync(zipPath));
        const currentFileHash = hashSum.digest('hex');

        const latestRelease = await AppRelease.findOne({ target_platform: 'android', update_type: 'OTA' }).sort({ created_at: -1 });
        if (latestRelease && latestRelease.file_hash === currentFileHash) return;

        let newVersion = "1.0.1";
        let nativeRequired = "1.0";
        if (latestRelease) {
            const parts = latestRelease.release_version.split('.');
            newVersion = `${parts[0]}.${parts[1]}.${parseInt(parts[2] || 0) + 1}`;
            latestRelease.release_version = newVersion;
            latestRelease.file_hash = currentFileHash;
            latestRelease.status = 'active';
            latestRelease.created_at = new Date();
            await latestRelease.save();
            await AppRelease.deleteMany({ target_platform: 'android', update_type: 'OTA', _id: { $ne: latestRelease._id } });
        } else {
            await new AppRelease({
                release_version: newVersion, target_platform: 'android', native_version_required: "1.0",
                download_url: 'https://workedumusicindia-backend-1.onrender.com/update.zip',
                update_type: 'OTA', is_mandatory: true, status: 'active', file_hash: currentFileHash
            }).save();
        }
    } catch (error) {}
}

connectDB().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is successfully running on port ${PORT}`);
        autoDeployOtaUpdate();
        startShiftWarningCron(io);
        startDailyReportsCron(io);
        startKeepAliveCron();
        startAutoAbsentCron(io);
        startCheckoutReminderCron(io);
        startWeeklyScoreCron(io);
        autoChatMediaCleanup();
    });
}).catch(err => { console.error("Failed to connect to the database", err); });