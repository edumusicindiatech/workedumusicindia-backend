const express = require('express');
const progressRouter = express.Router();
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Media = require('../models/Media');
const DailyReport = require('../models/DailyReports');
const LeaveRequest = require('../models/LeaveRequest'); // <-- NEW IMPORT
const userAuth = require('../middleware/userAuth');
const adminAuth = require('../middleware/adminAuth');
const excelJS = require('exceljs');

// ============================================================================
// 1. GET ALL EMPLOYEES WITH WEEKLY PROGRESS SCORE
// ============================================================================
progressRouter.get('/employees', userAuth, adminAuth, async (req, res) => {
    try {
        const employees = await User.find({ role: 'Employee', isActive: true }).select('name zone');

        const today = new Date();
        const dayOfWeek = today.getDay();
        const diffToMonday = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);

        const startOfWeek = new Date(today.setDate(diffToMonday));
        startOfWeek.setHours(0, 0, 0, 0);

        const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
        const dateString = dateFormatter.format(startOfWeek);

        const statsPromises = employees.map(async (emp) => {
            const attendanceRecords = await Attendance.find({
                teacher: emp._id,
                date: { $gte: dateString }
            });

            const mediaLogs = await Media.find({
                teacher: emp._id,
                createdAt: { $gte: startOfWeek }
            });

            let attendanceScore = 100;
            if (attendanceRecords.length > 0) {
                const positiveRecords = attendanceRecords.filter(r => ['Present', 'Event', 'Late'].includes(r.status)).length;
                attendanceScore = (positiveRecords / attendanceRecords.length) * 100;
            }

            let mediaFilesCount = 0;
            mediaLogs.forEach(log => mediaFilesCount += log.files.length);

            const targetMedia = 4;
            const mediaScore = (Math.min(mediaFilesCount, targetMedia) / targetMedia) * 100;

            const finalScore = Math.round((attendanceScore * 0.5) + (mediaScore * 0.5));

            return {
                _id: emp._id,
                name: emp.name,
                zone: emp.zone,
                score: finalScore,
                details: {
                    attendancePercentage: Math.round(attendanceScore),
                    mediaUploadedThisWeek: mediaFilesCount,
                    targetMedia: targetMedia
                }
            };
        });

        const progressData = await Promise.all(statsPromises);
        progressData.sort((a, b) => b.score - a.score);
        res.json({ success: true, data: progressData });
    } catch (error) {
        console.error("Progress Calculation Error:", error);
        res.status(500).json({ success: false, message: error.message });
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

        const mediaLogs = await Media.find({ teacher: teacherId }).lean();
        const dailyReports = await DailyReport.find({ teacher: teacherId }).lean();

        records.forEach(record => {
            const matchingMedia = mediaLogs.filter(m =>
                m.eventDate && m.eventDate.toISOString().split('T')[0] === record.date &&
                m.school.toString() === record.school._id.toString() &&
                m.band === record.band
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
// 3. EXPORT EXCEL (WITH LEAVES & SUMMARY)
// ============================================================================
progressRouter.get('/:teacherId/export/:month', userAuth, adminAuth, async (req, res) => {
    try {
        const { teacherId, month } = req.params; // "YYYY-MM"

        const teacher = await User.findById(teacherId);
        if (!teacher) return res.status(404).send("Teacher not found");

        // 1. Fetch Attendance
        const records = await Attendance.find({
            teacher: teacherId,
            date: { $regex: `^${month}` }
        }).populate('school', 'schoolName').sort({ date: 1 }).lean();

        const mediaLogs = await Media.find({ teacher: teacherId }).lean();
        const dailyReports = await DailyReport.find({
            teacher: teacherId,
            date: { $regex: `^${month}` }
        }).lean();

        // 2. Fetch Leaves overlapping with this month
        const monthStart = new Date(`${month}-01T00:00:00Z`);
        const nextMonth = new Date(monthStart);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        const leaves = await LeaveRequest.find({
            employee: teacherId,
            status: 'approved',
            $or: [
                { fromDate: { $gte: monthStart, $lt: nextMonth } },
                { toDate: { $gte: monthStart, $lt: nextMonth } },
                { fromDate: { $lt: monthStart }, toDate: { $gte: nextMonth } }
            ]
        }).sort({ fromDate: 1 }).lean();

        // 3. Initialize Workbook and Tracking Stats
        const workbook = new excelJS.Workbook();
        const worksheet = workbook.addWorksheet(`${teacher.name} - ${month}`);

        let stats = { present: 0, absent: 0, late: 0, event: 0, holiday: 0, leaveDays: 0, mediaSent: 0 };

        worksheet.columns = [
            { header: 'Date', key: 'date', width: 25 }, // Widened for date ranges
            { header: 'School / Category', key: 'school', width: 30 },
            { header: 'Band', key: 'category', width: 15 },
            { header: 'Status', key: 'status', width: 18 },
            { header: 'Check-In', key: 'checkIn', width: 15 },
            { header: 'Check-Out', key: 'checkOut', width: 15 },
            { header: 'Media Files', key: 'mediaCount', width: 15 },
            { header: 'Notes / Reason', key: 'note', width: 40 },
            { header: 'Daily Report / Admin Note', key: 'report', width: 50 }
        ];

        // Style Headers
        const headerColors = ["2563EB", "0D9488", "4F46E5", "7C3AED", "DB2777", "D97706", "059669", "DC2626", "475569"];
        worksheet.getRow(1).eachCell((cell, colNumber) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${headerColors[(colNumber - 1) % headerColors.length]}` } };
            cell.alignment = { horizontal: "center", vertical: "center" };
        });

        // 4. Process Attendance Rows
        records.forEach(record => {
            if (record.status === 'Present') stats.present++;
            if (record.status === 'Late') stats.late++;
            if (record.status === 'Absent') stats.absent++;
            if (record.status === 'Event') stats.event++;
            if (record.status === 'Holiday') stats.holiday++;

            const matchingMedia = mediaLogs.filter(m =>
                m.eventDate && m.eventDate.toISOString().split('T')[0] === record.date &&
                m.school.toString() === record.school._id.toString() &&
                m.band === record.band
            );
            const mediaFilesCount = matchingMedia.reduce((sum, m) => sum + m.files.length, 0);
            stats.mediaSent += mediaFilesCount;

            const reportForDay = dailyReports.find(report => report.date === record.date);
            let formattedReportString = record.dailyReport || '-';
            if (reportForDay) {
                formattedReportString = `[${reportForDay.category.toUpperCase()}]\nSummary: ${reportForDay.summary}`;
                if (reportForDay.eventName) formattedReportString += `\nEvent: ${reportForDay.eventName}`;
            }

            const row = worksheet.addRow({
                date: record.date,
                school: record.school?.schoolName || 'Unknown',
                category: record.band,
                status: record.status.toUpperCase(),
                checkIn: record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                checkOut: record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                mediaCount: mediaFilesCount,
                note: record.teacherNote || record.lateReason || record.eventNote || record.overtimeReason || '-',
                report: formattedReportString
            });
            row.getCell('note').alignment = { wrapText: true, vertical: 'top' };
            row.getCell('report').alignment = { wrapText: true, vertical: 'top' };
        });

        // 5. Process Leave Rows (Adds as range, counts actual days in month)
        leaves.forEach(leave => {
            // Calculate days for the stats summary (only counting days that fell IN this month)
            const leaveStart = new Date(leave.fromDate);
            const leaveEnd = new Date(leave.toDate);
            const calcStart = leaveStart < monthStart ? monthStart : leaveStart;
            const calcEnd = leaveEnd >= nextMonth ? new Date(nextMonth.getTime() - 1) : leaveEnd;
            const daysInMonth = Math.round((calcEnd - calcStart) / (1000 * 60 * 60 * 24)) + 1;
            stats.leaveDays += daysInMonth;

            // Add row
            const fromStr = leaveStart.toISOString().split('T')[0];
            const toStr = leaveEnd.toISOString().split('T')[0];

            const row = worksheet.addRow({
                date: fromStr === toStr ? fromStr : `${fromStr} to ${toStr}`,
                school: 'GENERAL LEAVE',
                category: '-',
                status: 'ON LEAVE',
                checkIn: '-',
                checkOut: '-',
                mediaCount: '-',
                note: `Reason: ${leave.reason}`,
                report: `Admin Note: ${leave.adminRemarks || 'N/A'}`
            });

            // Style Leave rows specifically
            row.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }; // Light blue
            });
            row.getCell('note').alignment = { wrapText: true, vertical: 'top' };
            row.getCell('report').alignment = { wrapText: true, vertical: 'top' };
        });

        // 6. ADD EXCEL SUMMARY SECTION AT THE BOTTOM
        worksheet.addRow([]); // Blank row
        worksheet.addRow([]); // Blank row

        const summaryHeader = worksheet.addRow(['MONTHLY SUMMARY', 'COUNT']);
        summaryHeader.font = { bold: true, size: 12 };
        summaryHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        summaryHeader.getCell(1).color = { argb: 'FFFFFFFF' };
        summaryHeader.getCell(2).color = { argb: 'FFFFFFFF' };

        worksheet.addRow(['Total Present Days', stats.present]);
        worksheet.addRow(['Total Late Days', stats.late]);
        worksheet.addRow(['Total Absent Days', stats.absent]);
        worksheet.addRow(['Total Event Days', stats.event]);
        worksheet.addRow(['Total Holidays', stats.holiday]);
        worksheet.addRow(['Total Leave Days (Approved)', stats.leaveDays]);
        worksheet.addRow(['Total Media Files Submitted', stats.mediaSent]);

        // Box border for summary
        for (let i = summaryHeader.number; i <= summaryHeader.number + 7; i++) {
            worksheet.getRow(i).getCell(1).border = { left: { style: 'thin' }, right: { style: 'thin' }, top: { style: 'thin' }, bottom: { style: 'thin' } };
            worksheet.getRow(i).getCell(2).border = { left: { style: 'thin' }, right: { style: 'thin' }, top: { style: 'thin' }, bottom: { style: 'thin' } };
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${teacher.name.replace(/\s+/g, '_')}_${month}_Report.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error("Excel Export Error:", error);
        res.status(500).send("Error generating Excel file");
    }
});

module.exports = progressRouter;