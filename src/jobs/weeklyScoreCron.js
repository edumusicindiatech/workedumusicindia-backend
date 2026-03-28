const cron = require('node-cron');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const MediaLog = require('../models/MediaLog');
const LeaveRequest = require('../models/LeaveRequest');
const Warning = require('../models/Warning');
const WeeklyProgress = require('../models/WeeklyProgress');
const getWeeklyScoreEmailTemplate = require('../templates/employeeWeeklyScoreEmail');
const Notification = require('../models/Notification');
const { sendWeeklyScoreToEmployee, sendTopPerformersToAdmin } = require('../utils/emailService');
const { canSendEmailToUser } = require('../utils/canSendEmailToUser');

// Helper function to calculate the score for a single employee
const calculateScoreAndZone = (attendanceRecords, mediaLogs, warnings, previousScore) => {
    // 1. ATTENDANCE SCORE (Max 50 points)
    let expectedDays = attendanceRecords.length;
    let earnedAttendancePoints = 0;
    let stats = { present: 0, late: 0, absent: 0, leaves: 0, warningsCount: warnings.length };

    attendanceRecords.forEach(record => {
        if (record.status === 'Present' || record.status === 'Event') {
            earnedAttendancePoints += 1;
            stats.present += 1;
        } else if (record.status === 'Late') {
            earnedAttendancePoints += 0.7; // Late gives 70% credit for the day
            stats.late += 1;
        } else if (record.status === 'Absent') {
            stats.absent += 1;
        } else if (record.status === 'Holiday' || record.status === 'ON LEAVE') {
            // We do not penalize holidays or approved leaves, so we remove them from expected days
            expectedDays -= 1;
            if (record.status === 'ON LEAVE') stats.leaves += 1;
        }
    });

    let attendanceScore = 0;
    if (expectedDays > 0) {
        attendanceScore = (earnedAttendancePoints / expectedDays) * 50;
    } else {
        attendanceScore = 50; // If they only had approved leaves/holidays, don't penalize their week
    }

    // 2. MEDIA SCORE (Max 50 points)
    let mediaScore = 0;
    let totalMarks = 0;
    let gradedMediaCount = 0;

    mediaLogs.forEach(log => {
        log.files.forEach(file => {
            if (file.marks !== null) { // Only count graded videos
                totalMarks += file.marks; // Marks are out of 10
                gradedMediaCount += 1;
            }
        });
    });

    stats.averageMediaScore = gradedMediaCount > 0 ? (totalMarks / gradedMediaCount) : 0;

    if (gradedMediaCount > 0) {
        // Example: If average is 8/10, they get (8/10) * 50 = 40 points
        mediaScore = (stats.averageMediaScore / 10) * 50;
    }

    // 3. WARNING PENALTIES (-10 per warning)
    const warningPenalty = warnings.length * 10;

    // 4. FINAL TALLY
    let finalScore = Math.round(attendanceScore + mediaScore - warningPenalty);

    // Ensure score stays between 0 and 100
    if (finalScore > 100) finalScore = 100;
    if (finalScore < 0) finalScore = 0;

    // 5. COLOR ZONES
    let colorZone = 'red';
    if (finalScore >= 70) colorZone = 'green';
    else if (finalScore >= 50) colorZone = 'blue';

    // 6. TREND ARROWS (Comparing to last week)
    let scoreTrend = 'flat';
    if (finalScore > previousScore) scoreTrend = 'up';
    else if (finalScore < previousScore) scoreTrend = 'down';

    return { finalScore, colorZone, scoreTrend, stats };
};

const startWeeklyScoreCron = (io) => {
    // Run every Saturday at 21:00 (9:00 PM)
    cron.schedule('0 21 * * 6', async () => {
        console.log("🏆 Running Weekly Leaderboard Calculation...");

        try {
            // Get date range for the past 7 days
            const today = new Date();
            const lastSaturday = new Date(today);
            lastSaturday.setDate(today.getDate() - 7);

            const startDateStr = lastSaturday.toISOString().split('T')[0];
            const endDateStr = today.toISOString().split('T')[0];

            // 1. Fetch all active employees
            const employees = await User.find({ role: 'Employee', isActive: true });
            let leaderboardData = [];

            // 2. Calculate scores for everyone
            for (const emp of employees) {
                // Fetch this week's data
                const attendance = await Attendance.find({ teacher: emp._id, date: { $gte: startDateStr, $lte: endDateStr } });
                const mediaLogs = await MediaLog.find({ teacher: emp._id, createdAt: { $gte: lastSaturday, $lte: today } });
                const warnings = await Warning.find({ teacher: emp._id, dateIssued: { $gte: lastSaturday, $lte: today } });

                const { finalScore, colorZone, scoreTrend, stats } = calculateScoreAndZone(
                    attendance, mediaLogs, warnings, emp.currentWeeklyScore
                );

                leaderboardData.push({
                    employee: emp,
                    score: finalScore,
                    colorZone,
                    scoreTrend,
                    stats
                });
            }

            // 3. Sort array highest to lowest to determine Rank
            leaderboardData.sort((a, b) => b.score - a.score);

            // Extract Top 3 for the Admins
            const top3Rankers = leaderboardData.slice(0, 3).map(data => ({
                name: data.employee.name,
                score: data.score,
                zone: data.employee.zone
            }));

            // 4. Save to Database & Notify Employees
            for (let i = 0; i < leaderboardData.length; i++) {
                const rank = i + 1;
                const data = leaderboardData[i];

                // Save to WeeklyProgress (Graph Vault) - SMART UPSERT
                await WeeklyProgress.findOneAndUpdate(
                    {
                        teacher: data.employee._id,
                        weekStartDate: lastSaturday,
                        weekEndDate: today
                    }, // The search criteria (Find this exact week for this teacher)
                    {
                        score: data.score,
                        rank: rank,
                        colorZone: data.colorZone,
                        stats: data.stats
                    }, // The data to update
                    { upsert: true, new: true } // If it doesn't exist, create it!
                );

                // Update User Profile
                await User.findByIdAndUpdate(data.employee._id, {
                    currentWeeklyScore: data.score,
                    currentWeeklyRank: rank,
                    scoreTrend: data.scoreTrend,
                    colorZone: data.colorZone
                });

                // Send In-App Notification to Employee
                await Notification.create({
                    recipient: data.employee._id,
                    title: 'Weekly Leaderboard Updated! 🏆',
                    message: `You scored ${data.score}/100 and ranked #${rank} this week.`,
                    type: 'System',
                    level: data.colorZone === 'red' ? 'Warning' : 'Info'
                });

                // Trigger Real-Time Socket Event
                io.to(data.employee._id.toString()).emit('weekly_score_updated', {
                    score: data.score, rank, colorZone: data.colorZone, scoreTrend: data.scoreTrend
                });

                const shouldSendToEmployee = await canSendEmailToUser(data.employee);

                if (shouldSendToEmployee) {
                    // Send Email via Service ONLY if allowed
                    await sendWeeklyScoreToEmployee(
                        data.employee.email, data.employee.name, data.score, rank,
                        data.colorZone, data.scoreTrend, data.stats
                    );
                }
            }

            // 5. Notify Admins about the Top 3
            if (top3Rankers.length > 0) {
                const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] }, isActive: true });

                for (const admin of admins) {
                    // In-App Admin Notification
                    await Notification.create({
                        recipient: admin._id,
                        title: 'Weekly Scores Calculated',
                        message: `The weekly leaderboard is live. ${top3Rankers[0].name} took 1st place!`,
                        type: 'System',
                        level: 'Info'
                    });

                    // Trigger Real-Time Dashboard refresh for Admin
                    io.to(admin._id.toString()).emit('admin_leaderboard_refresh');

                    const shouldSendToAdmin = await canSendEmailToUser(admin);

                    if (shouldSendToAdmin) {
                        // Send Email via Service ONLY if allowed
                        await sendTopPerformersToAdmin(admin.email, admin.name, top3Rankers);
                    }
                }
            }

            console.log("✅ Weekly Leaderboard successfully generated and notifications sent!");

        } catch (error) {
            console.error("❌ Error calculating weekly scores:", error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });
};

module.exports = startWeeklyScoreCron;