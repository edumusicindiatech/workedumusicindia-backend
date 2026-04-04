const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

// ==========================================
// 1. MOCK THE MIDDLEWARES
// ==========================================
jest.mock('../src/middleware/userAuth', () => {
    return (req, res, next) => {
        // Dummy Employee ID
        req.user = { _id: '60d5ec9af682fbd39a1b8b9d', name: 'Test Teacher', role: 'Employee', email: 'teacher@test.com' };
        next();
    };
});

jest.mock('../src/middleware/adminAuth', () => (req, res, next) => next());

// ==========================================
// 2. MOCK EXTERNAL UTILS & SERVICES
// ==========================================
jest.mock('../src/utils/emailService', () => ({
    sendAdminCheckInAlert: jest.fn().mockResolvedValue(true),
    sendLeaveRequestEmailToAdmin: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/utils/canSendEmailToUser', () => ({
    canSendEmailToUser: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/utils/getCityFromCoords', () => jest.fn().mockResolvedValue("Mumbai"));

jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn().mockImplementation(() => ({
        send: jest.fn().mockResolvedValue({})
    })),
    PutObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
    GetObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: jest.fn().mockResolvedValue('https://fake-employee-url.com')
}));

// ==========================================
// 3. APP SETUP & DB MODELS
// ==========================================
const employeeRouter = require('../src/routes/employeeRouter');
const User = require('../src/models/User');
const School = require('../src/models/School');
const Attendance = require('../src/models/Attendance');
const LeaveRequest = require('../src/models/LeaveRequest');
const Notification = require('../src/models/Notification');

const app = express();
app.use(express.json());

// Inject Fake Socket.io
app.use((req, res, next) => {
    req.io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    next();
});

app.use('/api/employee', employeeRouter);

// ==========================================
// 4. THE TEST SUITE
// ==========================================
describe('Employee Router - Comprehensive Test Suite', () => {

    let testSchool;
    let employeeId = '60d5ec9af682fbd39a1b8b9d'; // Matches our mocked userAuth

    beforeEach(async () => {
        // 1. Create the 2dsphere index required for Geofencing ($nearSphere) tests!
        await School.collection.createIndex({ location: "2dsphere" });

        // 2. Create a Test School in Mumbai
        testSchool = await School.create({
            schoolName: 'Mumbai High',
            address: 'Mumbai, MH',
            location: { type: 'Point', coordinates: [72.8777, 19.0760] } // [longitude, latitude]
        });

        // 3. Create the Employee User in the DB
        await User.create({
            _id: employeeId,
            name: 'Test Teacher',
            email: 'teacher@test.com',
            role: 'Employee',
            employeeId: 'EMP-111',
            password: 'hashed',
            assignments: [{
                school: testSchool._id,
                category: 'Senior Band',
                allowedDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                startTime: '08:00 AM',
                endTime: '02:00 PM',
                startDate: new Date(),
                geofence: { latitude: 19.0760, longitude: 72.8777 }
            }]
        });
    });

    // ---------------------------------------------------------
    // ROUTE 1: GET /my-schedule
    // ---------------------------------------------------------
    describe('GET /api/employee/my-schedule', () => {
        it('should return the active assignments for today', async () => {
            const res = await request(app).get('/api/employee/my-schedule');
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.length).toBeGreaterThan(0);
            expect(res.body.data[0].schoolName).toBe('Mumbai High');
            expect(res.body.data[0].status).toBe('pending');
        });
    });

    // ---------------------------------------------------------
    // ROUTE 2: POST /check-in (GEOFENCING TEST)
    // ---------------------------------------------------------
    describe('POST /api/employee/check-in', () => {
        it('should REJECT check-in if coordinates are too far (> 100m)', async () => {
            const res = await request(app).post('/api/employee/check-in').send({
                schoolId: testSchool._id,
                band: 'Senior Band',
                latitude: '28.7041', // Delhi (Very far from Mumbai)
                longitude: '77.1025'
            });

            expect(res.statusCode).toBe(403);
            expect(res.body.message).toContain("far from alloted location");
        });

        it('should ALLOW check-in if coordinates are exactly at the school', async () => {
            const res = await request(app).post('/api/employee/check-in').send({
                schoolId: testSchool._id,
                band: 'Senior Band',
                latitude: '19.0760', // Mumbai (Exact match)
                longitude: '72.8777'
            });

            expect(res.statusCode).toBe(200);
            expect(res.body.message).toBe("Checked in successfully.");

            // Verify the DB recorded the attendance
            const attendance = await Attendance.findOne({ teacher: employeeId });
            expect(attendance).toBeTruthy();
            expect(attendance.status).toBe('Present');
        });
    });

    // ---------------------------------------------------------
    // ROUTE 3: POST /leave-request
    // ---------------------------------------------------------
    describe('POST /api/employee/leave-request', () => {
        it('should allow submitting a new leave request', async () => {
            const res = await request(app).post('/api/employee/leave-request').send({
                fromDate: '2026-05-01',
                toDate: '2026-05-05',
                reason: 'Medical Leave'
            });

            expect(res.statusCode).toBe(201);
            expect(res.body.data.reason).toBe('Medical Leave');
            expect(res.body.data.status).toBe('pending');
        });

        it('should block a new request if one is already pending', async () => {
            // Manually insert a pending request
            await LeaveRequest.create({
                employee: employeeId,
                fromDate: '2026-06-01',
                toDate: '2026-06-02',
                status: 'pending',
                reason: 'Existing request'
            });

            // Try to submit another one
            const res = await request(app).post('/api/employee/leave-request').send({
                fromDate: '2026-07-01',
                toDate: '2026-07-02',
                reason: 'Another Leave'
            });

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toBe("You already have a pending leave request.");
        });
    });

    // ---------------------------------------------------------
    // ROUTE 4: DELETE /leave-request/:id
    // ---------------------------------------------------------
    describe('DELETE /api/employee/leave-request/:id', () => {
        it('should successfully revoke a pending leave request', async () => {
            const leave = await LeaveRequest.create({
                employee: employeeId,
                fromDate: '2026-06-01',
                toDate: '2026-06-02',
                status: 'pending',
                reason: 'To be revoked'
            });

            const res = await request(app).delete(`/api/employee/leave-request/${leave._id}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.message).toBe("Leave request revoked successfully.");

            // Verify it is gone from the DB
            const check = await LeaveRequest.findById(leave._id);
            expect(check).toBeNull();
        });
    });

});