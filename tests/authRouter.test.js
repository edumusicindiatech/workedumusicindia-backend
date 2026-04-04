const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser'); // Auth router uses cookies for refresh tokens

// ==========================================
// 1. MOCK THE MIDDLEWARE & UTILS
// ==========================================
jest.mock('../src/middleware/userAuth', () => {
    return (req, res, next) => {
        // Pretend the user is already authenticated for the reset/logout routes
        req.user = { _id: '60d5ec9af682fbd39a1b8b9d', role: 'Employee' };
        next();
    };
});

// Mock the token generator so we don't have to deal with real JWT signing keys in testing
jest.mock('../src/config/token', () => ({
    generateAccessToken: jest.fn().mockReturnValue('fake-access-token'),
    generateRefreshToken: jest.fn().mockReturnValue('fake-refresh-token')
}));

// ==========================================
// 2. APP SETUP & DB MODELS
// ==========================================
const authRouter = require('../src/routes/authRouter');
const User = require('../src/models/User');

const app = express();
app.use(express.json());
app.use(cookieParser()); // REQUIRED to parse incoming cookies
app.use('/api/auth', authRouter);

// ==========================================
// 3. THE TEST SUITE
// ==========================================
describe('Auth Router - Security & Login Suite', () => {

    let employeeId = '60d5ec9af682fbd39a1b8b9d';
    let rawPassword = 'Password123!';

    beforeEach(async () => {
        // Create a user with a real hashed password so bcrypt.compare works
        const hashedPassword = await bcrypt.hash(rawPassword, 10);

        await User.create({
            _id: employeeId,
            name: 'Test Auth User',
            email: 'auth@test.com',
            employeeId: 'EMP-AUTH',
            password: hashedPassword,
            role: 'Employee',
            isFirstLogin: true, // Used to test device binding
            deviceId: null
        });
    });

    // ---------------------------------------------------------
    // ROUTE 1: POST /login
    // ---------------------------------------------------------
    describe('POST /api/auth/login', () => {
        it('should reject login if employeeId or password is missing', async () => {
            const res = await request(app).post('/api/auth/login').send({ employeeId: 'EMP-AUTH' });
            expect(res.statusCode).toBe(400);
            expect(res.body.message).toBe("Employee ID and password are required");
        });

        it('should reject login if deviceId is missing', async () => {
            const res = await request(app).post('/api/auth/login').send({
                employeeId: 'EMP-AUTH',
                password: rawPassword
                // Missing deviceId
            });
            expect(res.statusCode).toBe(400);
            expect(res.body.message).toContain("Device ID is required");
        });

        it('should reject login with wrong password', async () => {
            const res = await request(app).post('/api/auth/login').send({
                employeeId: 'EMP-AUTH',
                password: 'WrongPassword',
                deviceId: 'device-123'
            });
            expect(res.statusCode).toBe(401);
            expect(res.body.message).toBe("Invalid credentials");
        });

        it('should bind deviceId on First Login and return tokens', async () => {
            const res = await request(app).post('/api/auth/login').send({
                employeeId: 'EMP-AUTH',
                password: rawPassword,
                deviceId: 'my-new-iphone-id'
            });

            expect(res.statusCode).toBe(200);
            expect(res.body.isFirstLogin).toBe(true);
            expect(res.body.access_token).toBe('fake-access-token');

            // Verify it saved the device ID in the database
            const user = await User.findById(employeeId);
            expect(user.deviceId).toBe('my-new-iphone-id');
        });

        it('should reject subsequent logins from an Unrecognized Device', async () => {
            // Setup: Pretend the user already logged in once with an iPhone
            await User.findByIdAndUpdate(employeeId, { isFirstLogin: false, deviceId: 'my-new-iphone-id' });

            // Action: Try to log in with an Android
            const res = await request(app).post('/api/auth/login').send({
                employeeId: 'EMP-AUTH',
                password: rawPassword,
                deviceId: 'some-other-android-id'
            });

            expect(res.statusCode).toBe(403);
            expect(res.body.message).toContain("Unauthorized Device");
        });
    });

    // ---------------------------------------------------------
    // ROUTE 2: POST /reset-initial-password
    // ---------------------------------------------------------
    describe('POST /api/auth/reset-initial-password', () => {
        it('should reject weak passwords', async () => {
            const res = await request(app).post('/api/auth/reset-initial-password').send({
                newPassword: 'weak'
            });
            expect(res.statusCode).toBe(400);
            expect(res.body.message).toContain("must contain at least 8 characters");
        });

        it('should reject if new password is the same as the temporary password', async () => {
            const res = await request(app).post('/api/auth/reset-initial-password').send({
                newPassword: rawPassword // Using the old password!
            });
            expect(res.statusCode).toBe(400);
            expect(res.body.message).toContain("different from the temporary password");
        });

        it('should successfully reset password and clear FirstLogin flag', async () => {
            const res = await request(app).post('/api/auth/reset-initial-password').send({
                newPassword: 'SuperNewPassword123!'
            });

            expect(res.statusCode).toBe(200);
            expect(res.body.message).toContain("Password updated successfully");

            // Verify DB state
            const user = await User.findById(employeeId);
            expect(user.isFirstLogin).toBe(false);
        });
    });

    // ---------------------------------------------------------
    // ROUTE 3: POST /logout
    // ---------------------------------------------------------
    describe('POST /api/auth/logout', () => {
        it('should successfully clear the refreshToken cookie', async () => {
            const res = await request(app).post('/api/auth/logout');
            
            expect(res.statusCode).toBe(200);
            expect(res.body.message).toBe("Logged out successfully");
            
            // Check if the cookie clear instruction was sent in the headers
            const cookies = res.headers['set-cookie'];
            expect(cookies).toBeDefined();
            expect(cookies[0]).toContain('refreshToken=;'); // Empty token
        });
    });

});