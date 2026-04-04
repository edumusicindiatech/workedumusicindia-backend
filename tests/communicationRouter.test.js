const request = require('supertest');
const express = require('express');

jest.mock('../src/middleware/userAuth', () => (req, res, next) => {
    req.user = { _id: '60d5ec9af682fbd39a1b8b9d', name: 'Admin' };
    next();
});
jest.mock('../src/middleware/adminAuth', () => (req, res, next) => next());
jest.mock('../src/utils/emailService', () => ({ sendBroadcastEmail: jest.fn().mockResolvedValue(true) }));
jest.mock('../src/utils/canSendEmailToUser', () => ({ canSendEmailToUser: jest.fn().mockResolvedValue(true) }));

const communicationRouter = require('../src/routes/communicationRouter');
const User = require('../src/models/User');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
    req.io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    next();
});
app.use('/api/communication', communicationRouter);

describe('Communication Router Tests', () => {
    beforeEach(async () => {
        await User.create({
            name: 'Target Employee', email: 'emp@test.com', role: 'Employee', isActive: true, employeeId: 'EMP-99', password: 'pass', zone: 'North'
        });
    });

    it('POST /send - should send broadcast to All Employees', async () => {
        const res = await request(app).post('/api/communication/send').send({
            targetGroup: 'All Employees', message: 'Hello Everyone'
        });
        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe("Broadcast sent successfully!");
    });

    it('POST /send - should send broadcast By Zone', async () => {
        const res = await request(app).post('/api/communication/send').send({
            targetGroup: 'By Zone', targetZone: 'North', message: 'Hello North'
        });
        expect(res.statusCode).toBe(200);
        expect(res.body.data.reachCount).toBe(1);
    });
});