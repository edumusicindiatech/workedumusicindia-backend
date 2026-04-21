const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');

// --- NEW IMPORTS FOR AUTO-UPDATER ---
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const AppRelease = require('../models/AppRelease');

// --- FIREBASE ADMIN IMPORT ---
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

// --- CONSOLIDATED ALLOWED ORIGINS ---
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

const activeLocations = new Map();
const onlineUsers = new Map();
const pendingCalls = new Map(); // 🚀 NEW: Store active calls for cold-started apps!

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

        // 🚀 THE MAGIC: Deliver the pending call SDP the moment the cold app wakes up!
        if (pendingCalls.has(safeUserId)) {
            const callData = pendingCalls.get(safeUserId);
            console.log(`📡 Delivering pending call to newly awoken user: ${safeUserId}`);
            socket.emit('incoming_call', {
                signal: callData.signalData,
                from: callData.from,
                callerName: callData.callerName,
                profilePicture: callData.profilePicture,
                callType: callData.callType
            });
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

    socket.on('send_message', (data) => {
        if (!data || !data.recipientId) return;
        const recipientStr = String(data.recipientId);
        socket.to(recipientStr).emit('receive_message', data);

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

    // --- UPDATED: IMMERSIVE VOIP CALL HANDLER ---
    socket.on('call_user', async (data) => {
        if (!data || !data.userToCall) return;
        const { userToCall, signalData, from, callerName, profilePicture, callType } = data;
        const targetStr = String(userToCall);
        const isTargetOnline = onlineUsers.has(targetStr);

        // 🚀 NEW: IMMEDIATELY TELL CALLER IF USER IS ONLINE (Ringing) OR OFFLINE (Calling)
        socket.emit('call_status', {
            status: isTargetOnline ? 'ringing' : 'calling',
            to: userToCall
        });

        // Store the full call data in memory for when the cold app wakes up
        pendingCalls.set(targetStr, data);

        if (isTargetOnline) {
            // 1. Full Signal via Socket (For Foreground/Website)
            socket.to(targetStr).emit('incoming_call', {
                signal: signalData, from, callerName, profilePicture, callType
            });
        }

        // 2. FCM Wake-up Ping (For Background/Killed App)
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
                        signal: "{}"
                    },
                    android: {
                        priority: 'high',
                        ttl: 0
                    }
                };

                await admin.messaging().send(message);
                console.log(`🔥 Wake-up trigger sent to ${callee.name} (${callType})`);
            }
        } catch (error) {
            console.error("❌ Firebase FCM Error:", error.message);
        }
    });

    // 🚀 NEW: CALL DELIVERED RELAY
    socket.on('call_delivered', (data) => {
        if (!data || !data.to) return;
        socket.to(String(data.to)).emit('call_delivered', { from: socket.id });
    });

    socket.on('answer_call', (data) => {
        if (!data || !data.to) return;

        // 🚀 Cleanup pending calls
        for (const [calleeId, call] of pendingCalls.entries()) {
            if (String(call.from) === String(data.to)) pendingCalls.delete(calleeId);
        }

        socket.to(String(data.to)).emit('call_accepted', data.signal);
    });

    socket.on('end_call', (data) => {
        if (!data || !data.to) return;

        // 🚀 Cleanup pending calls
        for (const [calleeId, call] of pendingCalls.entries()) {
            if (String(call.from) === String(data.to) || String(calleeId) === String(data.to)) {
                pendingCalls.delete(calleeId);
            }
        }

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
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            return callback(new Error('CORS block: Origin not allowed'), false);
        }
        return callback(null, true);
    },
    credentials: true
}));

app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ limit: '30mb', extended: true }));

// --- SERVING THE PUBLIC FOLDER FOR THE ZIP ---
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

// --- AUTO-DEPLOY OTA SCRIPT (SPACE-SAVER EDITION) ---
async function autoDeployOtaUpdate() {
    try {
        const zipPath = path.join(process.cwd(), 'public', 'update.zip');

        if (!fs.existsSync(zipPath)) {
            console.log('🤖 Auto-Updater: No update.zip found in public folder. Skipping.');
            return;
        }

        const fileBuffer = fs.readFileSync(zipPath);
        const hashSum = crypto.createHash('sha256');
        hashSum.update(fileBuffer);
        const currentFileHash = hashSum.digest('hex');

        const latestRelease = await AppRelease.findOne({
            target_platform: 'android',
            update_type: 'OTA'
        }).sort({ created_at: -1 });

        if (latestRelease && latestRelease.file_hash === currentFileHash) {
            console.log(`🤖 Auto-Updater: update.zip is unchanged (v${latestRelease.release_version}). No database update needed.`);
            return;
        }

        console.log('🤖 Auto-Updater: New update.zip detected! Overwriting previous release...');

        let newVersion = "1.0.1";
        let nativeRequired = "1.0";

        if (latestRelease) {
            const versionParts = latestRelease.release_version.split('.');
            const nextPatch = parseInt(versionParts[2] || 0) + 1;
            newVersion = `${versionParts[0]}.${versionParts[1]}.${nextPatch}`;
            nativeRequired = latestRelease.native_version_required || "1.0";

            latestRelease.release_version = newVersion;
            latestRelease.file_hash = currentFileHash;
            latestRelease.release_notes = `Auto-deployed OTA patch v${newVersion}`;
            latestRelease.status = 'active';
            latestRelease.created_at = new Date();

            await latestRelease.save();

            await AppRelease.deleteMany({
                target_platform: 'android',
                update_type: 'OTA',
                _id: { $ne: latestRelease._id }
            });

            console.log(`🚀 Auto-Updater: Successfully OVERWRITTEN and deployed OTA Version ${newVersion}!`);
        } else {
            const newRelease = new AppRelease({
                release_version: newVersion,
                target_platform: 'android',
                native_version_required: nativeRequired,
                download_url: 'https://workedumusicindia-backend-1.onrender.com/update.zip',
                update_type: 'OTA',
                is_mandatory: true,
                status: 'active',
                file_hash: currentFileHash,
                release_notes: `Auto-deployed OTA patch v${newVersion}`
            });

            await newRelease.save();
            console.log(`🚀 Auto-Updater: Successfully deployed FIRST OTA Version ${newVersion}!`);
        }

    } catch (error) {
        console.error("❌ Auto-Updater Failed:", error);
    }
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
}).catch(err => {
    console.error("Failed to connect to the database", err);
});