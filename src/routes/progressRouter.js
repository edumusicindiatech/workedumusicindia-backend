const express = require('express');
const progressRouter = express.Router();
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const MediaLog = require('../models/MediaLog');
const DailyReport = require('../models/DailyReports');
const LeaveRequest = require('../models/LeaveRequest'); // <-- NEW IMPORT
const userAuth = require('../middleware/userAuth');
const adminAuth = require('../middleware/adminAuth');
const exceljs = require('exceljs');
const WeeklyProgress = require('../models/WeeklyProgress');

// ============================================================================
// 1. GET ALL EMPLOYEES (Now using stored scores from the User model)
// ============================================================================
progressRouter.get('/employees', userAuth, adminAuth, async (req, res) => {
    try {
        // We no longer calculate on the fly. 
        // We just fetch the pre-calculated scores saved by our Saturday Cron Job.
        const employees = await User.find({ role: 'Employee', isActive: true })
            .select('name zone currentWeeklyScore currentWeeklyRank scoreTrend colorZone');

        // Format the data to match what your Frontend "ProgressReport" component expects
        const progressData = employees.map(emp => ({
            _id: emp._id,
            name: emp.name,
            zone: emp.zone,
            score: emp.currentWeeklyScore, // This is the 25 or 15 you saw in the leaderboard
            currentWeeklyScore: emp.currentWeeklyScore,
            currentWeeklyRank: emp.currentWeeklyRank,
            scoreTrend: emp.scoreTrend,
            colorZone: emp.colorZone
        }));

        // Sort them by rank (Rank 1 at the top)
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

        // 1. Fetch Attendance
        const records = await Attendance.find({ teacher: teacherId })
            .populate('school', 'schoolName address')
            .sort({ date: -1 })
            .lean();

        const mediaLogs = await MediaLog.find({ teacher: teacherId }).lean();
        const dailyReports = await DailyReport.find({ teacher: teacherId }).lean();

        records.forEach(record => {
            const matchingMedia = mediaLogs.filter(m =>
                m.eventDate && m.eventDate.toISOString().split('T')[0] === record?.date &&
                m.school.toString() === record?.school?._id?.toString() &&
                m.band === record?.band
            );
            record.mediaFilesCount = matchingMedia.reduce((sum, m) => sum + m.files.length, 0);

            const reportForDay = dailyReports.find(report => report.date === record.date);
            if (reportForDay) {
                record.dailyReport = reportForDay;
            }
        });

        // 2. Fetch Approved Leaves
        const leaveRequests = await LeaveRequest.find({
            employee: teacherId,
            status: 'approved'
        }).lean();

        // 3. Format Leaves so frontend can group them by month
        const formattedLeaves = leaveRequests.map(leave => ({
            ...leave,
            type: 'leave',
            // Use fromDate to determine which month folder it drops into
            date: new Date(leave.fromDate).toISOString().split('T')[0]
        }));

        // Merge Attendance and Leaves
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

        // 1. Fetch regular attendance records
        const records = await Attendance.find({
            teacher: teacherId,
            date: { $regex: `^${month}` }
        }).populate('school', 'schoolName').sort({ date: 1 });

        // 2. BULLETPROOF LEAVE FETCHING (Checks overlap and strict lowercase 'approved')
        const monthStart = new Date(`${month}-01T00:00:00.000Z`);
        const nextMonth = new Date(monthStart);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        const leaves = await LeaveRequest.find({
            $or: [{ teacher: teacherId }, { employee: teacherId }], // Catch either field name
            status: 'approved', // MUST BE LOWERCASE based on your schema enum!
            $and: [
                { fromDate: { $lt: nextMonth } }, // Started before the end of the month
                { toDate: { $gte: monthStart } }  // Ended after the start of the month
            ]
        }).sort({ fromDate: 1 });

        // 3. Setup Workbook
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

        // Format Top Header Row (Dark Slate & White Text)
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        worksheet.getRow(1).alignment = { horizontal: 'center' };

        const categorizedStats = {};

        // 4. Process Standard Attendance Rows
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
                date: new Date(record.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                school: schoolName,
                band: bandName,
                status: record.status,
                checkIn: record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--',
                checkOut: record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--',
                media: record.mediaFilesCount || 0,
                notes: record.teacherNote || record.lateReason || ''
            });
        });

        // 5. Process Leave Rows into the Main Table
        leaves.forEach(leave => {
            const from = new Date(leave.fromDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const to = new Date(leave.toDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

        // Main Summary Title Banner (Indigo Background / White Bold Text)
        const summaryHeaderRow = worksheet.addRow(['📊 ATTENDANCE SUMMARY BY SCHOOL & CATEGORY']);
        summaryHeaderRow.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        summaryHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } }; // Indigo 700
        summaryHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.mergeCells(`A${summaryHeaderRow.number}:H${summaryHeaderRow.number}`);
        worksheet.getRow(summaryHeaderRow.number).height = 30;

        // Loop Schools & Bands
        for (const school in categorizedStats) {
            worksheet.addRow([]);

            // School Name Banner (Emerald Green Background / White Bold Text)
            const schoolRow = worksheet.addRow([`🏫 ${school}`]);
            schoolRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
            schoolRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } }; // Emerald 600
            worksheet.mergeCells(`A${schoolRow.number}:H${schoolRow.number}`);

            for (const band in categorizedStats[school]) {
                const stats = categorizedStats[school][band];

                // Band Sub-Header (Bright Yellow Background / Black Bold Text)
                const bandRow = worksheet.addRow(['', `📌 ${band}`]);
                bandRow.font = { bold: true, italic: true, color: { argb: 'FF000000' } };
                bandRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF08A' } }; // Yellow 200
                worksheet.mergeCells(`B${bandRow.number}:H${bandRow.number}`);

                worksheet.addRow(['', '', `✅ Present: ${stats.Present}`]);
                worksheet.addRow(['', '', `⚠️ Late: ${stats.Late}`]);
                worksheet.addRow(['', '', `❌ Absent: ${stats.Absent}`]);
                worksheet.addRow(['', '', `🎉 Events/Holidays: ${stats.Event + stats.Holiday}`]);
                worksheet.addRow(['', '', `📸 Total Media Sent: ${stats.Media}`]);
            }
        }

        // ---------------------------------------------------------
        // LEAVES SUMMARY SECTION (Vibrant Red)
        // ---------------------------------------------------------
        if (leaves.length > 0) {
            worksheet.addRow([]);

            // Leaves Header Banner (Rose/Red Background / White Bold Text)
            const leaveRow = worksheet.addRow(['🌴 APPROVED LEAVES SUMMARY']);
            leaveRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
            leaveRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE11D48' } }; // Rose 600
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

        // The Leaderboard sends 'period' and 'date'. ProgressReport just sends 'month'.
        const period = req.query.period || 'weekly';
        const dateTarget = req.query.date || req.query.month;

        if (!dateTarget) {
            return res.status(400).json({ success: false, message: "Date or month parameter is required" });
        }

        let formattedData = [];

        if (period === 'weekly') {
            // Expected dateTarget: "YYYY-MM" (e.g., "2026-03")
            const monthStart = new Date(`${dateTarget}-01T00:00:00.000Z`);
            const nextMonth = new Date(monthStart);
            nextMonth.setMonth(nextMonth.getMonth() + 1);

            // Fetch records where any part of the week touches the target month
            const weeklyData = await WeeklyProgress.find({
                teacher: teacherId,
                $or: [
                    { weekStartDate: { $gte: monthStart, $lt: nextMonth } },
                    { weekEndDate: { $gte: monthStart, $lt: nextMonth } }
                ]
            }).sort({ weekStartDate: 1 }); // Sort oldest to newest

            formattedData = weeklyData.map(record => {
                const startDay = new Date(record.weekStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const endDay = new Date(record.weekEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                return {
                    label: `${startDay} - ${endDay}`,      // Used by Leaderboard Line Chart
                    weekLabel: `${startDay} - ${endDay}`,  // Used by Progress Report Bar Chart
                    score: record.score
                };
            });

        } else if (period === 'monthly') {
            // Expected dateTarget: "YYYY" (e.g., "2026")
            const yearStart = new Date(`${dateTarget}-01-01T00:00:00.000Z`);
            const nextYear = new Date(yearStart);
            nextYear.setFullYear(nextYear.getFullYear() + 1);

            // Fetch ALL weeks in the target year
            const yearlyData = await WeeklyProgress.find({
                teacher: teacherId,
                weekStartDate: { $gte: yearStart, $lt: nextYear }
            }).sort({ weekStartDate: 1 });

            // Group the weekly scores by their Month, and calculate the average
            const monthlyStats = {};
            yearlyData.forEach(record => {
                const monthName = new Date(record.weekStartDate).toLocaleDateString('en-US', { month: 'short' });

                if (!monthlyStats[monthName]) {
                    monthlyStats[monthName] = { totalScore: 0, count: 0 };
                }
                monthlyStats[monthName].totalScore += record.score;
                monthlyStats[monthName].count += 1;
            });

            // Ensure chronological order for the Line Chart (Jan to Dec)
            const monthsOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

            monthsOrder.forEach(month => {
                if (monthlyStats[month]) {
                    formattedData.push({
                        label: month, // e.g., "Jan", "Feb"
                        // Calculate the average score for that month
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