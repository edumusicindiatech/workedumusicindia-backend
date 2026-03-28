const mongoose = require('mongoose');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest'); // Explicitly import LeaveRequest

const fetchDailyFeedData = async (status) => {
    const today = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDayName = days[today.getDay()]; // e.g., "Mon"
    const dateString = today.toISOString().split('T')[0];

    // ==========================================
    // 1. LEAVE CHECKER ENGINE
    // ==========================================
    // Define the 24-hour boundaries of "Today"
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    // Fetch all approved leaves that overlap with today
    const activeLeaves = await LeaveRequest.find({
        status: 'approved',
        fromDate: { $lte: todayEnd },
        toDate: { $gte: todayStart }
    });

    // Create a fast lookup Set of user IDs who are on leave today
    const usersOnLeave = new Set(activeLeaves.map(leave => leave.employee.toString()));

    // ==========================================
    // 2. FETCH CORE DATA
    // ==========================================
    // Get all actual attendance recorded so far today
    const actualAttendance = await Attendance.find({ date: dateString })
        .populate('teacher', 'name employeeId zone mobile')
        .populate('school', 'schoolName address');

    // Get all teachers who have assignments allowed for TODAY
    const assignedUsers = await User.find({
        role: 'Employee',
        isActive: true,
        'assignments.allowedDays': currentDayName
    }).populate('assignments.school', 'schoolName address');

    // ==========================================
    // 3. THE MERGING ENGINE
    // ==========================================
    let combinedFeed = [...actualAttendance];

    assignedUsers.forEach(user => {
        if (!user.assignments) return; // Failsafe

        // Check if this specific user is on an approved leave today
        const isOnLeave = usersOnLeave.has(user._id.toString());

        user.assignments.forEach(assign => {
            // Skip this assignment if the referenced school was deleted from DB
            if (!assign.school || !assign.school._id) return;

            // Only process assignments meant for today
            if (assign.allowedDays.includes(currentDayName)) {

                // Check if this specific assignment has a real check-in
                const hasStarted = actualAttendance.find(a =>
                    a.teacher && a.teacher._id &&
                    a.school && a.school._id &&
                    a.teacher._id.toString() === user._id.toString() &&
                    a.school._id.toString() === assign.school._id.toString() &&
                    a.band === assign.category
                );

                // If no actual check-in exists, create the "Virtual Card"
                if (!hasStarted) {
                    combinedFeed.push({
                        _id: `pending_${user._id}_${assign._id}`, // Unique temp ID
                        teacher: {
                            _id: user._id,
                            name: user.name,
                            zone: user.zone,
                            employeeId: user.employeeId
                        },
                        school: assign.school,
                        band: assign.category,
                        
                        // Apply the distinct On Leave status if they have an approved leave
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
        // Exclude Completed, Absent, Holiday, and On Leave
        return combinedFeed.filter(item => !item.checkOutTime && !['Absent', 'Holiday', 'On Leave'].includes(item.status));
    } else if (status === 'completed') {
        return combinedFeed.filter(item => !!item.checkOutTime);
    } else if (status === 'pending') {
        return combinedFeed.filter(item => !item.checkInTime && item.status === 'Pending');
    } else if (status === 'running') {
        return combinedFeed.filter(item => item.checkInTime && !item.checkOutTime);
    } else if (status === 'exceptions') {
        // Group all non-standard statuses in the exceptions tab
        return combinedFeed.filter(item => ['Absent', 'Holiday', 'On Leave'].includes(item.status));
    }

    return combinedFeed; // 'all' returns the full list
};

module.exports = fetchDailyFeedData;