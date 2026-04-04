const request = require('supertest');
const express = require('express');

jest.mock('../src/middleware/userAuth', () => (req, res, next) => {
    req.user = { _id: '60d5ec9af682fbd39a1b8b9d' };
    next();
});

const notificationRouter = require('../src/routes/notificationRouter');
const Notification = require('../src/models/Notification');

const app = express();
app.use(express.json());
app.use('/api/notifications', notificationRouter);

describe('Notification Router Tests', () => {
    beforeEach(async () => {
        await Notification.create({ recipient: '60d5ec9af682fbd39a1b8b9d', title: 'Test', message: 'Hello', type: 'System', isRead: false });
    });

    it('GET / - should fetch all notifications for user', async () => {
        const res = await request(app).get('/api/notifications');
        expect(res.statusCode).toBe(200);
        expect(res.body.data.length).toBe(1);
    });

    it('PUT /mark-read - should mark all as read', async () => {
        const res = await request(app).put('/api/notifications/mark-read');
        expect(res.statusCode).toBe(200);
        const notif = await Notification.findOne();
        expect(notif.isRead).toBe(true);
    });

    it('DELETE /clear - should delete all notifications', async () => {
        const res = await request(app).delete('/api/notifications/clear');
        expect(res.statusCode).toBe(200);
        const count = await Notification.countDocuments();
        expect(count).toBe(0);
    });
});