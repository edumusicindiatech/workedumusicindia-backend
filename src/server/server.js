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

io.on('connection', (socket) => {
    // --- EXISTING ROOM LOGIC ---
    socket.on('join_room', (userId) => {
        socket.join(userId);
    });

    // --- NEW: ADMIN LIVE TRACKING ROOM ---
    socket.on('join_admin_room', () => {
        socket.join('admin_live_tracking');
        console.log(`Admin connected to live tracking: ${socket.id}`);
    });

    // --- NEW: EMPLOYEE LOCATION EMITTER ---
    socket.on('update_live_location', (data) => {
        const { employeeId, lat, lng } = data;

        // Ensure we have valid data before broadcasting
        if (employeeId && lat && lng) {
            // Broadcast exactly to the admins listening in the room
            io.to('admin_live_tracking').emit('employee_location_changed', {
                employeeId,
                lat,
                lng,
                timestamp: new Date()
            });
        }
    });
});

// Initialize the Cron Job, passing the io instance so it can push live alerts
startShiftWarningCron(io);
startDailyReportsCron(io);
startAutoAbsentCron(io);
startCheckoutReminderCron(io);
startKeepAliveCron();
startWeeklyScoreCron(io);

app.use((req, res, next) => {
    req.io = io;
    next();
});

app.get('/health', (req, res) => {
    res.status(200).send('Server is awake and healthy.');
});

app.use(cookieParser());
app.use(cors({
    origin: ['http://localhost:5173',
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

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
    server.listen(PORT, () => {
        console.log(`Server is successfully running on port ${PORT}`);
    });
});