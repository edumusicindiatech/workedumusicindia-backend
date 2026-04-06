const cron = require('node-cron');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const MediaLog = require('../models/MediaLog');
const LeaveRequest = require('../models/LeaveRequest');
const Warning = require('../models/Warning');
const WeeklyProgress = require('../models/WeeklyProgress');
const Notification = require('../models/Notification');
const { sendWeeklyScoreToEmployee, sendTopPerformersToAdmin } = require('../utils/emailService');
const { canSendEmailToUser } = require('../utils/canSendEmailToUser');
const { getISTDateString, getISTDayOfWeek } = require('../utils/timeHelper');

const calculateScoreAndZone = (earnedAttendancePoints, expectedDays, stats, mediaLogs, warnings, previousScore) => {
    let attendanceScore = 0;
    if (expectedDays > 0) {
        attendanceScore = (earnedAttendancePoints / expectedDays) * 50;
    }

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

    const warningPenalty = warnings.length * 10;
    stats.warningsCount = warnings.length;

    let finalScore = Math.round(attendanceScore + mediaScore - warningPenalty);
    if (finalScore > 100) finalScore = 100;
    if (finalScore < 0) finalScore = 0;

    let colorZone = 'red';
    if (finalScore >= 70) colorZone = 'green';
    else if (finalScore >= 50) colorZone = 'blue';

    let scoreTrend = 'flat';
    if (finalScore > previousScore) scoreTrend = 'up';
    else if (finalScore < previousScore) scoreTrend = 'down';

    return { finalScore, colorZone, scoreTrend, stats };
};

const startWeeklyScoreCron = (io) => {
    cron.schedule('0 21 * * 6', async () => {
        console.log("🏆 Running Weekly Leaderboard Calculation...");

        try {
            // --- 🚨 FIXED: ESTABLISH EXACT IST BOUNDARIES ---
            const todayDate = new Date();
            const endDateStr = getISTDateString(todayDate);

            // Go back 6 days to create an exact 7-day inclusive window (e.g. Sunday to Saturday)
            const startDateObj = new Date(todayDate);
            startDateObj.setDate(startDateObj.getDate() - 6);
            const startDateStr = getISTDateString(startDateObj);

            // Create strict DB timestamp bounds for queries & saving
            const weekStartIST = new Date(`${startDateStr}T00:00:00.000+05:30`);
            const weekEndIST = new Date(`${endDateStr}T23:59:59.999+05:30`);

            const employees = await User.find({ role: 'Employee', isActive: true });
            let leaderboardData = [];

            for (const emp of employees) {
                // String DB matching for Attendance
                const attendance = await Attendance.find({ teacher: emp._id, date: { $gte: startDateStr, $lte: endDateStr } });

                // Strict Timestamp matching for Logs/Warnings
                const mediaLogs = await MediaLog.find({ teacher: emp._id, createdAt: { $gte: weekStartIST, $lte: weekEndIST } });
                const warnings = await Warning.find({ teacher: emp._id, dateIssued: { $gte: weekStartIST, $lte: weekEndIST } });

                let expectedDays = 0;
                let earnedAttendancePoints = 0;
                let stats = { present: 0, late: 0, absent: 0, leaves: 0, warningsCount: 0, averageMediaScore: 0 };

                // Loop through the exactly 7 days
                for (let i = 0; i <= 6; i++) {
                    const checkDate = new Date(startDateObj);
                    checkDate.setDate(startDateObj.getDate() + i);

                    const checkDateStr = getISTDateString(checkDate);
                    const dayName = getISTDayOfWeek(checkDate);

                    const checkStart = new Date(`${checkDateStr}T00:00:00.000+05:30`);
                    const checkEnd = new Date(`${checkDateStr}T23:59:59.999+05:30`);

                    const isOnLeave = await LeaveRequest.findOne({
                        employee: emp._id,
                        status: 'approved',
                        fromDate: { $lte: checkEnd },
                        toDate: { $gte: checkStart }
                    });

                    if (isOnLeave) {
                        stats.leaves += 1;
                        continue;
                    }

                    let expectedToWork = false;
                    if (emp.assignments && emp.assignments.length > 0) {
                        for (const assign of emp.assignments) {
                            if (assign.allowedDays.includes(dayName)) {
                                const assignmentStartDate = assign.startDate ? new Date(assign.startDate) : assign._id.getTimestamp();
                                const assignStartStr = getISTDateString(assignmentStartDate);

                                const isAfterStartDate = checkDateStr >= assignStartStr;

                                let isBeforeEndDate = true;
                                if (assign.endDate) {
                                    const assignEndStr = getISTDateString(new Date(assign.endDate));
                                    isBeforeEndDate = checkDateStr <= assignEndStr;
                                }

                                if (isAfterStartDate && isBeforeEndDate) {
                                    expectedToWork = true;
                                    break;
                                }
                            }
                        }
                    }

                    if (expectedToWork) {
                        expectedDays += 1;
                        const dailyAtt = attendance.find(rec => rec.date === checkDateStr);

                        if (dailyAtt) {
                            if (dailyAtt.status === 'Present' || dailyAtt.status === 'Event') {
                                earnedAttendancePoints += 1;
                                stats.present += 1;
                            } else if (dailyAtt.status === 'Late') {
                                earnedAttendancePoints += 0.7;
                                stats.late += 1;
                            } else if (dailyAtt.status === 'Absent') {
                                stats.absent += 1;
                            }
                        } else {
                            stats.absent += 1;
                        }
                    }
                }

                const { finalScore, colorZone, scoreTrend } = calculateScoreAndZone(
                    earnedAttendancePoints, expectedDays, stats, mediaLogs, warnings, emp.currentWeeklyScore
                );

                leaderboardData.push({
                    employee: emp, score: finalScore, colorZone, scoreTrend, stats
                });
            }

            leaderboardData.sort((a, b) => b.score - a.score);

            const top3Rankers = leaderboardData.slice(0, 3).map(data => ({
                name: data.employee.name, score: data.score, zone: data.employee.zone
            }));

            for (let i = 0; i < leaderboardData.length; i++) {
                const rank = i + 1;
                const data = leaderboardData[i];

                // --- 🚨 FIXED: SAVE PRECISE IST BOUNDARIES FOR GRAPH VAULT ---
                await WeeklyProgress.findOneAndUpdate(
                    {
                        teacher: data.employee._id,
                        weekStartDate: weekStartIST,
                        weekEndDate: weekEndIST
                    },
                    {
                        score: data.score,
                        rank: rank,
                        colorZone: data.colorZone,
                        stats: data.stats
                    },
                    { upsert: true, returnDocument: 'after' }
                );

                await User.findByIdAndUpdate(data.employee._id, {
                    currentWeeklyScore: data.score,
                    currentWeeklyRank: rank,
                    scoreTrend: data.scoreTrend,
                    colorZone: data.colorZone
                });

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