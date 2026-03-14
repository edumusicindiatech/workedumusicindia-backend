const express = require('express');
const cors = require('cors');
require('dotenv').config();
const connectDB = require('../database/config'); // Import your DB function
const adminRouter = require('../routes/adminRouter');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/', adminRouter);









const PORT = process.env.PORT || 5000;

// Connect to the database FIRST, then start the server
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is successfully running on port ${PORT}`);
    });
});