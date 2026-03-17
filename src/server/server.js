const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const connectDB = require('../database/config'); // Import your DB function
const adminRouter = require('../routes/adminRouter');
const authRouter = require('../routes/authRouter');
const employeeRouter = require('../routes/employeeRouter');
const initializeCronJobs = require('./src/jobs/reportCron');
initializeCronJobs();

const app = express();
app.use(cookieParser());

app.use(cors());
app.use(express.json());

app.use('/', adminRouter);
app.use('/', authRouter);
app.use('/', employeeRouter);








const PORT = process.env.PORT || 5000;

// Connect to the database FIRST, then start the server
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is successfully running on port ${PORT}`);
    });
});