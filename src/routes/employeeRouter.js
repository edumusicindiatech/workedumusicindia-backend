const express = require('express');
const employeeRouter = express.Router();
const userAuth = require('../middleware/userAuth');


employeeRouter.get('/me/profile', userAuth, async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            user: req.user
        });
    }
    catch (err) {
        console.log('Error fetching Profile', err);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching profile',
            error: err.message
        })

    }
});

module.exports = employeeRouter