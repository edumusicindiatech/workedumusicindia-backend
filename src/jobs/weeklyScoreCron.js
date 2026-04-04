const cron = require('node-cron');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const MediaLog = require('../models/MediaLog');
const LeaveRequest = require('../models/LeaveRequest'); // <-- NOW PROPERLY UTILIZED
const Warning = require('../models/Warning');
const WeeklyProgress = require('../models/WeeklyProgress');
const Notification = require('../models/Notification');
const { sendWeeklyScoreToEmployee, sendTopPerformersToAdmin } = require('../utils/emailService');
const { canSendEmailToUser } = require('../utils/canSendEmailToUser');

// Helper to calculate the score for a single employee (Now takes true Expected Days and Stats)
const calculateScoreAndZone = (earnedAttendancePoints, expectedDays, stats, mediaLogs, warnings, previousScore) => {

    // 1. ATTENDANCE SCORE (Max 50 points)
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
            if (file.marks !== null && file.marks !== undefined) {
                totalMarks += file.marks;
                gradedMediaCount += 1;
            }
        });
    });

    stats.averageMediaScore = gradedMediaCount > 0 ? (totalMarks / gradedMediaCount) : 0;

    if (gradedMediaCount > 0) {
        mediaScore = (stats.averageMediaScore / 10) * 50;
    }

    // 3. WARNING PENALTIES (-10 per warning)
    const warningPenalty = warnings.length * 10;
    stats.warningsCount = warnings.length;

    // 4. FINAL TALLY
    let finalScore = Math.round(attendanceScore + mediaScore - warningPenalty);
    if (finalScore > 100) finalScore = 100;
    if (finalScore < 0) finalScore = 0;

    // 5. COLOR ZONES
    let colorZone = 'red';
    if (finalScore >= 70) colorZone = 'green';
    else if (finalScore >= 50) colorZone = 'blue';

    // 6. TREND ARROWS
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
                const attendance = await Attendance.find({ teacher: emp._id, date: { $gte: startDateStr, $lte: endDateStr } });
                const mediaLogs = await MediaLog.find({ teacher: emp._id, createdAt: { $gte: lastSaturday, $lte: today } });
                const warnings = await Warning.find({ teacher: emp._id, dateIssued: { $gte: lastSaturday, $lte: today } });

                let expectedDays = 0;
                let earnedAttendancePoints = 0;
                let stats = { present: 0, late: 0, absent: 0, leaves: 0, warningsCount: 0, averageMediaScore: 0 };

                // --- THE BULLETPROOF 7-DAY LOOP ---
                // We check every single day of the past week to see what they were SUPPOSED to do.
                for (let i = 1; i <= 7; i++) {
                    const checkDate = new Date(lastSaturday);
                    checkDate.setDate(lastSaturday.getDate() + i);

                    const checkDateStr = checkDate.toISOString().split('T')[0];
                    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][checkDate.getDay()];

                    // A. Was the employee on leave this day?
                    const checkStart = new Date(checkDate).setHours(0, 0, 0, 0);
                    const checkEnd = new Date(checkDate).setHours(23, 59, 59, 999);

                    const isOnLeave = await LeaveRequest.findOne({
                        employee: emp._id,
                        status: 'approved',
                        fromDate: { $lte: new Date(checkEnd) },
                        toDate: { $gte: new Date(checkStart) }
                    });

                    if (isOnLeave) {
                        stats.leaves += 1;
                        continue; // Do not count this day towards expected shifts
                    }

                    // B. Were they expected to work? (Date Isolation Logic)
                    let expectedToWork = false;
                    if (emp.assignments && emp.assignments.length > 0) {
                        for (const assign of emp.assignments) {
                            if (assign.allowedDays.includes(dayName)) {
                                const aStart = assign.startDate ? new Date(assign.startDate).setHours(0, 0, 0, 0) : 0;
                                let aEnd = Infinity;
                                if (assign.endDate) aEnd = new Date(assign.endDate).setHours(23, 59, 59, 999);

                                if (checkDate.getTime() >= aStart && checkDate.getTime() <= aEnd) {
                                    expectedToWork = true;
                                    break;
                                }
                            }
                        }
                    }

                    // C. Tally their attendance for this expected day
                    if (expectedToWork) {
                        expectedDays += 1;
                        const dailyAtt = attendance.find(rec => rec.date === checkDateStr);

                        if (dailyAtt) {
                            if (dailyAtt.status === 'Present' || dailyAtt.status === 'Event') {
                                earnedAttendancePoints += 1;
                                stats.present += 1;
                            } else if (dailyAtt.status === 'Late') {
                                earnedAttendancePoints += 0.7; // 70% credit
                                stats.late += 1;
                            } else if (dailyAtt.status === 'Absent') {
                                stats.absent += 1;
                            }
                        } else {
                            // If they were expected to work, but have NO record in the DB
                            // (e.g., auto-absent cron failed), we strictly count them as absent!
                            stats.absent += 1;
                        }
                    }
                }
                // ----------------------------------

                const { finalScore, colorZone, scoreTrend } = calculateScoreAndZone(
                    earnedAttendancePoints, expectedDays, stats, mediaLogs, warnings, emp.currentWeeklyScore
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

                // Save to WeeklyProgress (Graph Vault)
                await WeeklyProgress.findOneAndUpdate(
                    {
                        teacher: data.employee._id,
                        weekStartDate: lastSaturday,
                        weekEndDate: today
                    },
                    {
                        score: data.score,
                        rank: rank,
                        colorZone: data.colorZone,
                        stats: data.stats
                    },
                    { upsert: true, returnDocument: 'after' }
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

                try {
                    const shouldSendToEmployee = await canSendEmailToUser(data.employee);
                    if (shouldSendToEmployee) {
                        await sendWeeklyScoreToEmployee(
                            data.employee.email, data.employee.name, data.score, rank,
                            data.colorZone, data.scoreTrend, data.stats
                        );
                    }
                } catch (emailError) {
                    console.error(`Failed to send email to ${data.employee.email}:`, emailError);
                }
            }

            io.emit('leaderboard_refresh');

            // 5. Notify Admins about the Top 3
            if (top3Rankers.length > 0) {
                const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] }, isActive: true });

                for (const admin of admins) {
                    await Notification.create({
                        recipient: admin._id,
                        title: 'Weekly Scores Calculated',
                        message: `The weekly leaderboard is live. ${top3Rankers[0].name} took 1st place!`,
                        type: 'System',
                        level: 'Info'
                    });

                    try {
                        const shouldSendToAdmin = await canSendEmailToUser(admin);
                        if (shouldSendToAdmin) {
                            await sendTopPerformersToAdmin(admin.email, admin.name, top3Rankers);
                        }
                    } catch (adminEmailError) {
                        console.error(`Failed to send email to Admin ${admin.email}:`, adminEmailError);
                    }
                }
            }
            io.emit('admin_leaderboard_refresh');
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