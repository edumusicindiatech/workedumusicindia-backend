const express = require('express');
const progressRouter = express.Router();
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const MediaLog = require('../models/MediaLog');
const DailyReport = require('../models/DailyReports');
const LeaveRequest = require('../models/LeaveRequest');
const userAuth = require('../middleware/userAuth');
const adminAuth = require('../middleware/adminAuth');
const exceljs = require('exceljs');
const WeeklyProgress = require('../models/WeeklyProgress');
const { getISTDateString } = require('../utils/timeHelper');

// ============================================================================
// 1. GET ALL EMPLOYEES (Now using stored scores from the User model)
// ============================================================================
progressRouter.get('/employees', userAuth, adminAuth, async (req, res) => {
    try {
        const employees = await User.find({ role: 'Employee', isActive: true })
            .select('name zone currentWeeklyScore currentWeeklyRank scoreTrend colorZone profilePicture');

        const progressData = employees.map(emp => ({
            _id: emp._id,
            name: emp.name,
            zone: emp.zone,
            score: emp.currentWeeklyScore,
            currentWeeklyScore: emp.currentWeeklyScore,
            currentWeeklyRank: emp.currentWeeklyRank,
            scoreTrend: emp.scoreTrend,
            colorZone: emp.colorZone,
            profilePicture: emp.profilePicture
        }));

        progressData.sort((a, b) => a.currentWeeklyRank - b.currentWeeklyRank);

        res.json({
            success: true,
            data: progressData
        });

    } catch (error) {
        console.error("Progress Fetch Error:", error);
        res.status(500).json({ success: false, message: "Error fetching employee progress data" });
    }
});

// ============================================================================
// 2. GET ALL RECORDS (INCLUDING LEAVES) FOR SPECIFIC EMPLOYEE 
// ============================================================================
progressRouter.get('/:teacherId/records', userAuth, adminAuth, async (req, res) => {
    try {
        const teacherId = req.params.teacherId;

        const records = await Attendance.find({ teacher: teacherId })
            .populate('school', 'schoolName address')
            .sort({ date: -1 })
            .lean();

        const mediaLogs = await MediaLog.find({ teacher: teacherId }).lean();
        const dailyReports = await DailyReport.find({ teacher: teacherId }).lean();

        records.forEach(record => {
            const matchingMedia = mediaLogs.filter(m =>
                m.eventDate && getISTDateString(new Date(m.eventDate)) === record?.date &&
                m.school.toString() === record?.school?._id?.toString() &&
                m.band === record?.band
            );
            record.mediaFilesCount = matchingMedia.reduce((sum, m) => sum + m.files.length, 0);

            const reportForDay = dailyReports.find(report => report.date === record.date);
            if (reportForDay) {
                record.dailyReport = reportForDay;
            }
        });

        const leaveRequests = await LeaveRequest.find({
            employee: teacherId,
            status: 'approved'
        }).lean();

        const formattedLeaves = leaveRequests.map(leave => ({
            ...leave,
            type: 'leave',
            date: getISTDateString(new Date(leave.fromDate))
        }));

        const allData = [...records, ...formattedLeaves];

        res.json({ success: true, data: allData });
    } catch (error) {
        console.error("Records Fetch Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================================
// 3. EXPORT EXCEL (WITH HIGH-CONTRAST COLORED SUMMARY & LEAVES)
// ============================================================================
progressRouter.get('/:teacherId/export/:month', userAuth, adminAuth, async (req, res) => {
    try {
        const { teacherId, month } = req.params;
        const teacher = await User.findById(teacherId);

        if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found' });

        const records = await Attendance.find({
            teacher: teacherId,
            date: { $regex: `^${month}` }
        }).populate('school', 'schoolName').sort({ date: 1 });

        // 🚨 CRITICAL FIX: Replaced 'Z' with '+05:30' for accurate IST boundaries
        const monthStart = new Date(`${month}-01T00:00:00.000+05:30`);
        const nextMonth = new Date(monthStart);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        const leaves = await LeaveRequest.find({
            $or: [{ teacher: teacherId }, { employee: teacherId }],
            status: 'approved',
            $and: [
                { fromDate: { $lt: nextMonth } },
                { toDate: { $gte: monthStart } }
            ]
        }).sort({ fromDate: 1 });

        const workbook = new exceljs.Workbook();
        const worksheet = workbook.addWorksheet(`${month} Report`);

        worksheet.columns = [
            { header: 'Date', key: 'date', width: 22 },
            { header: 'School', key: 'school', width: 30 },
            { header: 'Category (Band)', key: 'band', width: 22 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Check In', key: 'checkIn', width: 15 },
            { header: 'Check Out', key: 'checkOut', width: 15 },
            { header: 'Media Files', key: 'media', width: 15 },
            { header: 'Notes/Reason', key: 'notes', width: 45 }
        ];

        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        worksheet.getRow(1).alignment = { horizontal: 'center' };

        const categorizedStats = {};

        records.forEach(record => {
            const schoolName = record.school?.schoolName || 'Unassigned';
            const bandName = record.band || 'General';

            if (!categorizedStats[schoolName]) categorizedStats[schoolName] = {};
            if (!categorizedStats[schoolName][bandName]) {
                categorizedStats[schoolName][bandName] = {
                    Present: 0, Absent: 0, Late: 0, Event: 0, Holiday: 0, Media: 0
                };
            }

            const status = record.status;
            if (categorizedStats[schoolName][bandName][status] !== undefined) {
                categorizedStats[schoolName][bandName][status]++;
            }
            categorizedStats[schoolName][bandName].Media += (record.mediaFilesCount || 0);

            worksheet.addRow({
                date: new Date(record.date).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' }),
                school: schoolName,
                band: bandName,
                status: record.status,
                checkIn: record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '--',
                checkOut: record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '--',
                media: record.mediaFilesCount || 0,
                notes: record.teacherNote || record.lateReason || ''
            });
        });

        leaves.forEach(leave => {
            const from = new Date(leave.fromDate).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' });
            const to = new Date(leave.toDate).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' });
            const dateStr = leave.fromDate === leave.toDate ? from : `${from} to ${to}`;

            worksheet.addRow({
                date: dateStr,
                school: '🌴 GENERAL LEAVE',
                band: '--',
                status: 'Approved',
                checkIn: '--',
                checkOut: '--',
                media: '--',
                notes: `Reason: ${leave.reason} ${leave.adminRemarks ? `(Admin: ${leave.adminRemarks})` : ''}`
            });
        });

        // ---------------------------------------------------------
        // HIGH CONTRAST COLORED SUMMARY SECTION
        // ---------------------------------------------------------
        worksheet.addRow([]);
        worksheet.addRow([]);

        const summaryHeaderRow = worksheet.addRow(['📊 ATTENDANCE SUMMARY BY SCHOOL & CATEGORY']);
        summaryHeaderRow.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        summaryHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
        summaryHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.mergeCells(`A${summaryHeaderRow.number}:H${summaryHeaderRow.number}`);
        worksheet.getRow(summaryHeaderRow.number).height = 30;

        for (const school in categorizedStats) {
            worksheet.addRow([]);

            const schoolRow = worksheet.addRow([`🏫 ${school}`]);
            schoolRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
            schoolRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
            worksheet.mergeCells(`A${schoolRow.number}:H${schoolRow.number}`);

            for (const band in categorizedStats[school]) {
                const stats = categorizedStats[school][band];

                const bandRow = worksheet.addRow(['', `📌 ${band}`]);
                bandRow.font = { bold: true, italic: true, color: { argb: 'FF000000' } };
                bandRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF08A' } };
                worksheet.mergeCells(`B${bandRow.number}:H${bandRow.number}`);

                worksheet.addRow(['', '', `✅ Present: ${stats.Present}`]);
                worksheet.addRow(['', '', `⚠️ Late: ${stats.Late}`]);
                worksheet.addRow(['', '', `❌ Absent: ${stats.Absent}`]);
                worksheet.addRow(['', '', `🎉 Events/Holidays: ${stats.Event + stats.Holiday}`]);
                worksheet.addRow(['', '', `📸 Total Media Sent: ${stats.Media}`]);
            }
        }

        if (leaves.length > 0) {
            worksheet.addRow([]);

            const leaveRow = worksheet.addRow(['🌴 APPROVED LEAVES SUMMARY']);
            leaveRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
            leaveRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE11D48' } };
            worksheet.mergeCells(`A${leaveRow.number}:H${leaveRow.number}`);

            worksheet.addRow(['', '', `🗓️ Total Approved Requests: ${leaves.length}`]);

            let totalLeaveDays = 0;
            leaves.forEach(l => {
                const f = new Date(l.fromDate);
                const t = new Date(l.toDate);
                const diffTime = Math.abs(t - f);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                totalLeaveDays += diffDays;
            });

            worksheet.addRow(['', '', `⏳ Total Days on Leave: ${totalLeaveDays}`]);
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${teacher.name.replace(/\s+/g, '_')}_${month}_Report.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error("Export Error:", error);
        res.status(500).json({ success: false, message: 'Failed to generate export file' });
    }
});

// ============================================================================
// 4. GET GRAPH DATA (SUPPORTS WEEKLY & MONTHLY AVERAGES)
// ============================================================================
progressRouter.get('/:teacherId/graph', userAuth, adminAuth, async (req, res) => {
    try {
        const { teacherId } = req.params;
        const period = req.query.period || 'weekly';
        const dateTarget = req.query.date || req.query.month;

        if (!dateTarget) {
            return res.status(400).json({ success: false, message: "Date or month parameter is required" });
        }

        let formattedData = [];

        if (period === 'weekly') {
            // 🚨 CRITICAL FIX: Replaced 'Z' with '+05:30' for accurate IST boundaries
            const monthStart = new Date(`${dateTarget}-01T00:00:00.000+05:30`);
            const nextMonth = new Date(monthStart);
            nextMonth.setMonth(nextMonth.getMonth() + 1);

            const weeklyData = await WeeklyProgress.find({
                teacher: teacherId,
                $or: [
                    { weekStartDate: { $gte: monthStart, $lt: nextMonth } },
                    { weekEndDate: { $gte: monthStart, $lt: nextMonth } }
                ]
            }).sort({ weekStartDate: 1 });

            formattedData = weeklyData.map(record => {
                const startDay = new Date(record.weekStartDate).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' });
                const endDay = new Date(record.weekEndDate).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' });

                return {
                    label: `${startDay} - ${endDay}`,
                    weekLabel: `${startDay} - ${endDay}`,
                    score: record.score
                };
            });

        } else if (period === 'monthly') {
            // 🚨 CRITICAL FIX: Replaced 'Z' with '+05:30' for accurate IST boundaries
            const yearStart = new Date(`${dateTarget}-01-01T00:00:00.000+05:30`);
            const nextYear = new Date(yearStart);
            nextYear.setFullYear(nextYear.getFullYear() + 1);

            const yearlyData = await WeeklyProgress.find({
                teacher: teacherId,
                weekStartDate: { $gte: yearStart, $lt: nextYear }
            }).sort({ weekStartDate: 1 });

            const monthlyStats = {};
            yearlyData.forEach(record => {
                // Timezone safe extraction
                const monthName = new Date(record.weekStartDate).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', month: 'short' });

                if (!monthlyStats[monthName]) {
                    monthlyStats[monthName] = { totalScore: 0, count: 0 };
                }
                monthlyStats[monthName].totalScore += record.score;
                monthlyStats[monthName].count += 1;
            });

            const monthsOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

            monthsOrder.forEach(month => {
                if (monthlyStats[month]) {
                    formattedData.push({
                        label: month,
                        score: Math.round(monthlyStats[month].totalScore / monthlyStats[month].count)
                    });
                }
            });
        }

        res.status(200).json({ success: true, data: formattedData });
    } catch (error) {
        console.error("Graph Data Fetch Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch graph data" });
    }
});

module.exports = progressRouter;