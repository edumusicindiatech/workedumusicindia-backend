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
        .populate('school', 'schoolName address');

    const assignedUsers = await User.find({
        role: 'Employee',
        isActive: true,
        'assignments.allowedDays': currentDayName
    }).populate('assignments.school', 'schoolName address');

    // ==========================================
    // 3. THE MERGING ENGINE (With Future-Bleed Fix)
    // ==========================================
    let combinedFeed = [...actualAttendance];

    assignedUsers.forEach(user => {
        if (!user.assignments) return;

        const isOnLeave = usersOnLeave.has(user._id.toString());

        user.assignments.forEach(assign => {
            if (!assign.school || !assign.school._id) return;

            // --- DATE ISOLATION LOGIC ---
            // 1. Find the assignment's start date (fallback to creation date if startDate is missing)
            const assignmentStartDate = assign.startDate ? new Date(assign.startDate) : assign._id.getTimestamp();

            // Normalize both dates to midnight so we strictly compare calendar days
            const normalizedAssignmentDate = new Date(assignmentStartDate);
            normalizedAssignmentDate.setHours(0, 0, 0, 0);

            const normalizedToday = new Date(today);
            normalizedToday.setHours(0, 0, 0, 0);

            // 2. Check if today is ON or AFTER the assigned date
            const isAfterAssignedDate = normalizedToday >= normalizedAssignmentDate;

            // 3. Only show pending IF the assigned date has arrived AND it's the correct day of the week
            if (isAfterAssignedDate && assign.allowedDays.includes(currentDayName)) {

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