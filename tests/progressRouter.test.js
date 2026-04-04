const request = require('supertest');
const express = require('express');

jest.mock('../src/middleware/userAuth', () => (req, res, next) => {
    req.user = { _id: '60d5ec9af682fbd39a1b8b9d' };
    next();
});
jest.mock('../src/middleware/adminAuth', () => (req, res, next) => next());

// Mock ExcelJS so we don't generate actual corrupted files during testing
jest.mock('exceljs', () => {
    return {
        Workbook: jest.fn().mockImplementation(() => ({
            addWorksheet: jest.fn().mockReturnValue({
                columns: [], addRow: jest.fn().mockReturnValue({ font: {}, fill: {}, alignment: {} }),
                mergeCells: jest.fn(), getRow: jest.fn().mockReturnValue({ font: {}, fill: {}, alignment: {} })
            }),
            xlsx: { write: jest.fn().mockResolvedValue(true) }
        }))
    };
});

const progressRouter = require('../src/routes/progressRouter');
const User = require('../src/models/User');

const app = express();
app.use(express.json());
app.use('/api/progress', progressRouter);

describe('Progress Router Tests', () => {
    beforeEach(async () => {
        await User.create({
            _id: '60d5ec9af682fbd39a1b8b9e', name: 'Ranked Emp', email: 'r@test.com', employeeId: 'R-1', password: 'p',
            role: 'Employee', isActive: true, currentWeeklyScore: 25, currentWeeklyRank: 1
        });
    });

    it('GET /employees - should fetch the leaderboard sorted by rank', async () => {
        const res = await request(app).get('/api/progress/employees');
        expect(res.statusCode).toBe(200);
        expect(res.body.data[0].score).toBe(25);
    });

    it('GET /:teacherId/export/:month - should generate excel export', async () => {
        const res = await request(app).get('/api/progress/60d5ec9af682fbd39a1b8b9e/export/2026-04');
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('spreadsheetml');
    });
});