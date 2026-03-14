const express = require('express');
const cors = require('cors');
require('dotenv').config();
const connectDB = require('./database/config'); // Import your DB function

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: "Workforce Management API is running"
    });
});

const PORT = process.env.PORT || 5000;

// Connect to the database FIRST, then start the server
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is successfully running on port ${PORT}`);
    });
});