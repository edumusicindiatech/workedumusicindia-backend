const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const connectDB = require('../database/config');
const authRouter = require('../routes/authRouter');
const employeeRouter = require('../routes/employeeRouter');
const adminRouter = require('../routes/adminRouter');

const app = express();
app.use(cookieParser());

app.use(cors({
    origin: ['http://localhost:5173', process.env.FRONTEND_URL, 'https://mmtc-employee-workforce.netlify.app'],
    credentials: true
}));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/admin',adminRouter);
app.use('/api/employee', employeeRouter);







const PORT = process.env.PORT || 5000;

// Connect to the database FIRST, then start the server
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is successfully running on port ${PORT}`);
    });
});