const express = require('express');
const progressRouter = express.Router();
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Media = require('../models/Media')
const School = require('../models/School');
const userAuth = require('../middleware/userAuth');
const adminAuth = require('../middleware/adminAuth');
const excelJS = require('exceljs');

// ============================================================================
// 1. GET ALL EMPLOYEES WITH WEEKLY PROGRESS SCORE (50% Attendance, 50% Media)
// ============================================================================
progressRouter.get('/employees', userAuth, adminAuth, async (req, res) => {
    try {
        const employees = await User.find({ role: 'Employee', isActive: true }).select('name zone');

        // --- Get the Start of the Current Week (Monday) ---
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday...
        const diffToMonday = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);

        const startOfWeek = new Date(today.setDate(diffToMonday));
        startOfWeek.setHours(0, 0, 0, 0);

        // Format for Attendance string comparison (YYYY-MM-DD)
        const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
        const dateString = dateFormatter.format(startOfWeek);

        const statsPromises = employees.map(async (emp) => {
            // A. Fetch Attendance for current week
            const attendanceRecords = await Attendance.find({
                teacher: emp._id,
                date: { $gte: dateString }
            });

            // B. Fetch Media Logs for current week
            const mediaLogs = await Media.find({
                teacher: emp._id,
                createdAt: { $gte: startOfWeek } // Assuming media is evaluated by when it was uploaded
            });

            let attendanceScore = 100;

            // --- 1. ATTENDANCE MATH ---
            if (attendanceRecords.length > 0) {
                // Present, Late, or Event count as showing up.
                const positiveRecords = attendanceRecords.filter(r => ['Present', 'Event', 'Late'].includes(r.status)).length;
                attendanceScore = (positiveRecords / attendanceRecords.length) * 100;
            }

            // --- 2. MEDIA MATH ---
            let mediaFilesCount = 0;
            mediaLogs.forEach(log => {
                // Count all files uploaded this week. 
                // (If you want STRICTLY videos: log.files.filter(f => f.fileType === 'video').length)
                mediaFilesCount += log.files.length;
            });

            // Target is 4 media files/videos per week. Cap at 100%
            const targetMedia = 4;
            const mediaScore = (Math.min(mediaFilesCount, targetMedia) / targetMedia) * 100;

            // --- 3. FINAL SCORE (50% Attendance, 50% Media) ---
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

        // Sort by final score descending (Highest score is #1)
        progressData.sort((a, b) => b.score - a.score);

        res.json({ success: true, data: progressData });
    } catch (error) {
        console.error("Progress Calculation Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================================
// 2. GET ALL RECORDS FOR A SPECIFIC EMPLOYEE (Used for frontend drill-down)
// ============================================================================
progressRouter.get('/:teacherId/records', userAuth, adminAuth, async (req, res) => {
    try {
        // Use .lean() so we can inject media counts into the objects easily
        const records = await Attendance.find({ teacher: req.params.teacherId })
            .populate('school', 'schoolName address')
            .sort({ date: -1 })
            .lean();

        const mediaLogs = await Media.find({ teacher: req.params.teacherId }).lean();

        // Attach Media Counts to the specific daily attendance record
        records.forEach(record => {
            const matchingMedia = mediaLogs.filter(m =>
                // Match by exact date, school, and category/band
                m.eventDate && m.eventDate.toISOString().split('T')[0] === record.date &&
                m.school.toString() === record.school._id.toString() &&
                m.band === record.band
            );

            // Sum up all files uploaded for this specific shift
            record.mediaFilesCount = matchingMedia.reduce((sum, m) => sum + m.files.length, 0);
        });

        res.json({ success: true, data: records });
    } catch (error) {
        console.error("Records Fetch Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================================
// 3. EXPORT EXCEL FOR SPECIFIC MONTH
// ============================================================================
progressRouter.get('/:teacherId/export/:month', userAuth, adminAuth, async (req, res) => {
    try {
        const { teacherId, month } = req.params; // month format: "YYYY-MM"

        const teacher = await User.findById(teacherId);
        if (!teacher) return res.status(404).send("Teacher not found");

        // Fetch Attendance
        const records = await Attendance.find({
            teacher: teacherId,
            date: { $regex: `^${month}` }
        }).populate('school', 'schoolName').sort({ date: 1 }).lean();

        // Fetch Media
        const mediaLogs = await Media.find({ teacher: teacherId }).lean();

        const workbook = new excelJS.Workbook();
        const worksheet = workbook.addWorksheet(`${teacher.name} - ${month}`);

        // Define Excel Columns
        worksheet.columns = [
            { header: 'Date', key: 'date', width: 15 },
            { header: 'School Name', key: 'school', width: 30 },
            { header: 'Category', key: 'category', width: 15 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Check-In', key: 'checkIn', width: 15 },
            { header: 'Check-Out', key: 'checkOut', width: 15 },
            { header: 'Media Files Sent', key: 'mediaCount', width: 20 }, // NEW MEDIA COLUMN
            { header: 'Teacher Note / Reason', key: 'note', width: 40 },
            { header: 'Daily Report', key: 'report', width: 50 }
        ];

        // Style the Header Row (Indigo background, White text)
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };

        // Add Data Rows
        records.forEach(record => {
            // Find media uploaded on this specific shift
            const matchingMedia = mediaLogs.filter(m =>
                m.eventDate && m.eventDate.toISOString().split('T')[0] === record.date &&
                m.school.toString() === record.school._id.toString() &&
                m.band === record.band
            );
            const mediaFilesCount = matchingMedia.reduce((sum, m) => sum + m.files.length, 0);

            worksheet.addRow({
                date: record.date,
                school: record.school?.schoolName || 'Unknown',
                category: record.band,
                status: record.status.toUpperCase(),
                checkIn: record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                checkOut: record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                mediaCount: mediaFilesCount, // Populate new column
                note: record.teacherNote || record.lateReason || record.eventNote || record.overtimeReason || '-',
                report: record.dailyReport || '-'
            });
        });

        // Setup Response Headers for Excel Download
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