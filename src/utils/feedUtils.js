const mongoose = require('mongoose');
const User = require('../models/User'); // Adjust path if necessary
const Attendance = require('../models/Attendance'); // Adjust path if necessary
const LeaveRequest = require('../models/LeaveRequest'); // Adjust path if necessary

const fetchDailyFeedData = async (status) => {
    const today = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDayName = days[today.getDay()];

    // Intentionally using UTC so the "next day" doesn't trigger until 5:30 AM IST
    const dateString = today.toISOString().split('T')[0];

    // ==========================================
    // 1. LEAVE CHECKER ENGINE
    // ==========================================
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const activeLeaves = await LeaveRequest.find({
        status: 'approved',
        fromDate: { $lte: todayEnd },
        toDate: { $gte: todayStart }
    });

    const usersOnLeave = new Set(activeLeaves.map(leave => leave.employee.toString()));

    // ==========================================
    // 2. FETCH CORE DATA
    // ==========================================
    const actualAttendance = await Attendance.find({ date: dateString })
        .populate('teacher', 'name employeeId zone mobile profilePicture')
        // THE FIX: Added location and coordinate fields so distance tracking works
        .populate('school', 'schoolName address location coordinates latitude longitude');

    const assignedUsers = await User.find({
        role: 'Employee',
        isActive: true,
        'assignments.allowedDays': currentDayName
    })
        // THE FIX: Added location and coordinate fields for pending/unstarted shifts
        .populate('assignments.school', 'schoolName address location coordinates latitude longitude');

    // ==========================================
    // 3. THE MERGING ENGINE (With Start & End Date Fixes)
    // ==========================================
    let combinedFeed = [...actualAttendance];

    assignedUsers.forEach(user => {
        if (!user.assignments) return;

        const isOnLeave = usersOnLeave.has(user._id.toString());

        user.assignments.forEach(assign => {
            if (!assign.school || !assign.school._id) return;

            // --- DATE ISOLATION LOGIC ---

            // 1. Check Start Date
            const assignmentStartDate = assign.startDate ? new Date(assign.startDate) : assign._id.getTimestamp();
            const normalizedStartDate = new Date(assignmentStartDate);
            normalizedStartDate.setHours(0, 0, 0, 0);

            const normalizedToday = new Date(today);
            normalizedToday.setHours(0, 0, 0, 0);

            const isAfterStartDate = normalizedToday >= normalizedStartDate;

            // 2. Check End Date (If it exists)
            let isBeforeEndDate = true; // Assume true if there is no end date
            if (assign.endDate) {
                const normalizedEndDate = new Date(assign.endDate);
                normalizedEndDate.setHours(23, 59, 59, 999); // Set to the very last millisecond of the end date
                isBeforeEndDate = normalizedToday <= normalizedEndDate;
            }

            // 3. Only show pending IF:
            // - The start date has arrived (No future bleed)
            // - The end date has NOT passed (No expired assignments)
            // - It's the correct day of the week
            if (isAfterStartDate && isBeforeEndDate && assign.allowedDays.includes(currentDayName)) {

                const hasStarted = actualAttendance.find(a =>
                    a.teacher && a.teacher._id &&
                    a.school && a.school._id &&
                    a.teacher._id.toString() === user._id.toString() &&
                    a.school._id.toString() === assign.school._id.toString() &&
                    a.band === assign.category
                );

                if (!hasStarted) {
                    combinedFeed.push({
                        _id: `pending_${user._id}_${assign._id}`,
                        teacher: {
                            _id: user._id,
                            name: user.name,
                            zone: user.zone,
                            employeeId: user.employeeId,
                            profilePicture: user.profilePicture
                        },
                        school: assign.school,
                        band: assign.category,

                        status: isOnLeave ? 'On Leave' : 'Pending',
                        teacherNote: isOnLeave ? 'System Note: On Approved Leave' : null,

                        checkInTime: null,
                        checkOutTime: null,
                        date: dateString,
                        expectedStartTime: assign.startTime,
                        expectedEndTime: assign.endTime
                    });
                }
            }
        });
    });

    // ==========================================
    // 4. FILTERING LOGIC
    // ==========================================
    if (status === 'active') {
        return combinedFeed.filter(item => !item.checkOutTime && !['Absent', 'Holiday', 'On Leave'].includes(item.status));
    } else if (status === 'completed') {
        return combinedFeed.filter(item => !!item.checkOutTime);
    } else if (status === 'pending') {
        return combinedFeed.filter(item => !item.checkInTime && item.status === 'Pending');
    } else if (status === 'running') {
        return combinedFeed.filter(item => item.checkInTime && !item.checkOutTime);
    } else if (status === 'exceptions') {
        return combinedFeed.filter(item => ['Absent', 'Holiday', 'On Leave'].includes(item.status));
    }

    return combinedFeed;
};

module.exports = fetchDailyFeedData;