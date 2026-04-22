const jwt = require('jsonwebtoken');

const generateAccessToken = (userId, role) => {
    return jwt.sign(
        { id: userId, role: role },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: '30m' }
    )
}

const generateRefreshToken = (userId, role) => {
    return jwt.sign(
        { id: userId, role: role },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: '60d' }
    )
}
module.exports = { generateAccessToken, generateRefreshToken }