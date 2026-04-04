const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

// ==========================================
// 1. MOCK THE MIDDLEWARES FIRST
// ==========================================
jest.mock('../src/middleware/userAuth', () => {
    return (req, res, next) => {
        // Use a dummy 24-character hex string instead of mongoose.Types.ObjectId()
        req.user = { _id: '60d5ec9af682fbd39a1b8b9d', role: 'SuperAdmin', name: 'Test Admin' };
        next();
    };
});

jest.mock('../src/middleware/adminAuth', () => (req, res, next) => next());
jest.mock('../src/middleware/requireSuperAdmin', () => (req, res, next) => next());

// ==========================================
// 2. MOCK EXTERNAL UTILS & SERVICES
// ==========================================
jest.mock('../src/utils/emailService', () => ({
    sendAdminWelcomeEmail: jest.fn().mockResolvedValue(true),
    sendEmployeeWelcomeEmail: jest.fn().mockResolvedValue(true),
    sendSchoolAssignmentEmail: jest.fn().mockResolvedValue(true),
    sendEmployeeProfileDeletedEmail: jest.fn().mockResolvedValue(true),
    sendAdminAuditEmail: jest.fn().mockResolvedValue(true),
    // Mocking all others to prevent undefined errors
    sendAdminAssignmentUpdatedEmail: jest.fn(),
    sendEmployeeAssignmentUpdatedEmail: jest.fn(),
    sendEmployeeAssignmentRevokedEmail: jest.fn(),
    sendAdminAssignmentRevokedEmail: jest.fn(),
}));

jest.mock('../src/utils/canSendEmailToUser', () => ({
    canSendEmailToUser: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/utils/feedUtils', () => jest.fn().mockResolvedValue([]));

jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn().mockImplementation(() => ({
        send: jest.fn().mockResolvedValue({})
    })),
    PutObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: jest.fn().mockResolvedValue('https://fake-presigned-url.com')
}));

// ==========================================
// 3. APP SETUP & DB MODELS
// ==========================================
const adminRouter = require('../src/routes/adminRouter');
const User = require('../src/models/User');
const School = require('../src/models/School');
const LeaveRequest = require('../src/models/LeaveRequest');
const Settings = require('../src/models/Settings');
const Notification = require('../src/models/Notification');

const app = express();
app.use(express.json());

// Inject Fake Socket.io
app.use((req, res, next) => {
    req.io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    next();
});

app.use('/api/admin', adminRouter);

// ==========================================
// 4. THE MASSIVE TEST SUITE
// ==========================================
describe('Admin Router - Comprehensive Test Suite', () => {

    // --- SETUP DUMMY DATA BEFORE EACH TEST ---
    let testEmployee;
    beforeEach(async () => {
        testEmployee = await User.create({
            name: 'Test Employee',
            email: 'testemp@workedumusic.com',
            mobile: '1234567890',
            employeeId: 'EMP-001',
            password: 'hashedpassword',
            role: 'Employee',
            isActive: true
        });
    });

    // ---------------------------------------------------------
    // ROUTE 1: POST /create-admin
    // ---------------------------------------------------------
    describe('POST /api/admin/create-admin', () => {
        it('should return 400 if required fields are missing', async () => {
            const res = await request(app).post('/api/admin/create-admin').send({ email: 'test@test.com' });
            expect(res.statusCode).toBe(400);
        });

        it('should return 400 if the password is too weak', async () => {
            const res = await request(app).post('/api/admin/create-admin').send({
                name: 'John', email: 'john@test.com', employeeId: 'EMP-123', password: 'weak'
            });
            expect(res.statusCode).toBe(400);
        });

        it('should return 400 if the email or Admin ID already exists', async () => {
            const res = await request(app).post('/api/admin/create-admin').send({
                name: 'New Admin', email: 'testemp@workedumusic.com', employeeId: 'EMP-NEW', password: 'StrongPassword123!'
            });
            expect(res.statusCode).toBe(400);
            expect(res.body.message).toBe("Email or Admin ID already in use.");
        });

        it('should successfully create an admin', async () => {
            const res = await request(app).post('/api/admin/create-admin').send({
                name: 'Admin User', email: 'admin@workedumusic.com', employeeId: 'EMP-999', password: 'StrongPassword123!'
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    // ---------------------------------------------------------
    // ROUTE 2: POST /create-employee
    // ---------------------------------------------------------
    describe('POST /api/admin/create-employee', () => {
        it('should return 400 if fields are missing', async () => {
            const res = await request(app).post('/api/admin/create-employee').send({ name: 'Bob' });
            expect(res.statusCode).toBe(400);
        });

        it('should create employee and auto-generate ID', async () => {
            const res = await request(app).post('/api/admin/create-employee').send({
                name: 'New Guy', email: 'newguy@workedumusic.com', mobile: '9876543210', designation: 'Teacher', zone: 'North'
            });
            expect(res.statusCode).toBe(200);
            expect(res.body.credentials).toHaveProperty('employeeId');
            expect(res.body.credentials.employeeId).toMatch(/^EMP-/);
            
            const savedUser = await User.findOne({ email: 'newguy@workedumusic.com' });
            expect(savedUser.role).toBe('Employee');
        });
    });

    // ---------------------------------------------------------
    // ROUTE 3: GET /roster
    // ---------------------------------------------------------
    describe('GET /api/admin/roster', () => {
        it('should return a list of employees', async () => {
            const res = await request(app).get('/api/admin/roster');
            expect(res.statusCode).toBe(200);
            expect(res.body.data.length).toBeGreaterThan(0);
            expect(res.body.data[0]).toHaveProperty('name');
            expect(res.body.data[0]).toHaveProperty('systemRole');
        });
    });

    // ---------------------------------------------------------
    // ROUTE 5: POST /employees/:id/assign-school
    // ---------------------------------------------------------
    describe('POST /api/admin/employees/:id/assign-school', () => {
        const validPayload = {
            schoolName: 'Test School',
            schoolAddress: '123 Main St',
            category: 'Senior Band',
            startDate: '2026-05-01',
            startTime: '08:00 AM',
            endTime: '02:00 PM',
            allowedDays: ['Mon', 'Wed'],
            latitude: '19.0760',
            longitude: '72.8777' // Mumbai coords
        };

        it('should block assignment if employee is on an approved leave', async () => {
            // Create an overlapping approved leave
            await LeaveRequest.create({
                employee: testEmployee._id,
                fromDate: new Date('2026-04-20'),
                toDate: new Date('2026-05-10'),
                status: 'approved',
                reason: 'Vacation'
            });

            const res = await request(app)
                .post(`/api/admin/employees/${testEmployee._id}/assign-school`)
                .send(validPayload);

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toContain("on an approved leave");
        });

        it('should successfully assign school and create Geofence', async () => {
            const res = await request(app)
                .post(`/api/admin/employees/${testEmployee._id}/assign-school`)
                .send(validPayload);

            expect(res.statusCode).toBe(200);
            
            // Verify school was created
            const school = await School.findOne({ schoolName: 'Test School' });
            expect(school).toBeTruthy();
            expect(school.location.coordinates).toEqual([72.8777, 19.0760]); // [lng, lat]

            // Verify assignment added to employee
            const emp = await User.findById(testEmployee._id);
            expect(emp.assignments.length).toBe(1);
            expect(emp.assignments[0].category).toBe('Senior Band');
        });
    });

    // ---------------------------------------------------------
    // ROUTE 9: DELETE /employees/:id
    // ---------------------------------------------------------
    describe('DELETE /api/admin/employees/:id', () => {
        it('should prevent deleting a SuperAdmin', async () => {
            const superAdmin = await User.create({
                name: 'Boss', email: 'boss@test.com', employeeId: 'SA-1', password: 'pass', role: 'SuperAdmin'
            });

            const res = await request(app).delete(`/api/admin/employees/${superAdmin._id}`);
            expect(res.statusCode).toBe(403);
            expect(res.body.message).toBe("SuperAdmin accounts cannot be deleted.");
        });

        it('should delete standard employee and clean up notifications', async () => {
            // Give them a notification first
            await Notification.create({ recipient: testEmployee._id, title: 'Test', message: 'Test', type: 'System' });

            const res = await request(app).delete(`/api/admin/employees/${testEmployee._id}`);
            expect(res.statusCode).toBe(200);

            // Verify deletion
            const deletedUser = await User.findById(testEmployee._id);
            expect(deletedUser).toBeNull();

            // Verify cascading delete of notifications
            const notifs = await Notification.find({ recipient: testEmployee._id });
            expect(notifs.length).toBe(0);
        });
    });

    // ---------------------------------------------------------
    // ROUTE 18: PUT /settings/global (RBAC Test)
    // ---------------------------------------------------------
    describe('PUT /api/admin/settings/global', () => {
        it('should allow SuperAdmin to update global settings', async () => {
            const res = await request(app).put('/api/admin/settings/global').send({
                globalAdminNotifications: false,
                globalEmployeeNotifications: false
            });
            expect(res.statusCode).toBe(200);
            
            const settings = await Settings.findOne();
            expect(settings.globalAdminNotifications).toBe(false);
        });
    });

    // ---------------------------------------------------------
    // ROUTE 28: POST /profile-picture/presign (AWS S3)
    // ---------------------------------------------------------
    describe('POST /api/admin/profile-picture/presign', () => {
        it('should generate a presigned URL successfully', async () => {
            // Mock environment variables for this test
            process.env.CF_ASSETS_BUCKET = 'test-bucket';
            process.env.CF_ASSETS_PUBLIC_URL = 'https://cdn.test.com';

            const res = await request(app).post('/api/admin/profile-picture/presign').send({
                fileType: 'image/png',
                extension: 'png'
            });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.presignedUrl).toBe('https://fake-presigned-url.com');
            expect(res.body.publicUrl).toContain('https://cdn.test.com/');
        });
    });

});