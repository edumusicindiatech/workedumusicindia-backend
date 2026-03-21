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

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: ['http://localhost:5173', process.env.FRONTEND_URL, 'https://mmtc-employee-workforce.netlify.app'],
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

io.on('connection', (socket) => {
    socket.on('join_own_room', (userId) => {
        socket.join(userId);
    });
});

app.use((req, res, next) => {
    req.io = io;
    next();
});

app.use(cookieParser());
app.use(cors({
    origin: ['http://localhost:5173', process.env.FRONTEND_URL, 'https://mmtc-employee-workforce.netlify.app'],
    credentials: true
}));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/employee', employeeRouter);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
    server.listen(PORT, () => {
        console.log(`Server is successfully running on port ${PORT}`);
    });
});