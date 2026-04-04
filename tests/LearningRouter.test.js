const request = require('supertest');
const express = require('express');

jest.mock('../src/middleware/userAuth', () => (req, res, next) => {
    req.user = { _id: '60d5ec9af682fbd39a1b8b9d', name: 'Admin', role: 'Admin' };
    next();
});
jest.mock('../src/middleware/adminAuth', () => (req, res, next) => next());
jest.mock('../src/utils/emailService', () => ({ sendNewLearningVideoEmailToEmployee: jest.fn(), canSendEmailToUser: jest.fn().mockResolvedValue(true) }));
jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn().mockResolvedValue({}) })),
    PutObjectCommand: jest.fn(), DeleteObjectCommand: jest.fn(), GetObjectCommand: jest.fn(),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn().mockResolvedValue('https://fake-url.com') }));

const LearningRouter = require('../src/routes/LearningRouter');
const LearningMedia = require('../src/models/LearningMedia');

const app = express();
app.use(express.json());
app.use('/api/learning', LearningRouter);

describe('Learning Router Tests', () => {
    it('POST / - should save a new learning video', async () => {
        const res = await request(app).post('/api/learning').send({
            title: 'How to Teach', fileUrls: ['https://video.com/vid1.mp4']
        });
        expect(res.statusCode).toBe(201);
        expect(res.body.data.length).toBe(1);
    });

    it('DELETE /:id - should delete a learning video', async () => {
        const video = await LearningMedia.create({
            title: 'Delete Me',
            fileUrl: 'https://test.com/vid.mp4',
            uploader: '60d5ec9af682fbd39a1b8b9d',
            uploaderName: 'Admin',
            uploaderRole: 'Admin'
        });
        const res = await request(app).delete(`/api/learning/${video._id}`);
        expect(res.statusCode).toBe(200);
    });
});