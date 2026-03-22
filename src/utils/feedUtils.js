const Attendance = require('../models/Attendance');
const User = require('../models/User');

const fetchDailyFeedData = async (status) => {
    const today = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDayName = days[today.getDay()]; // e.g., "Mon"
    const dateString = today.toISOString().split('T')[0];

    // 1. Get all actual attendance recorded so far today
    const actualAttendance = await Attendance.find({ date: dateString })
        .populate('teacher', 'name employeeId zone mobile')
        .populate('school', 'schoolName address');

    // 2. Get all teachers who have assignments allowed for TODAY
    const assignedUsers = await User.find({
        role: 'Employee',
        isActive: true,
        'assignments.allowedDays': currentDayName
    }).populate('assignments.school', 'schoolName address');

    // 3. The Merging Engine
    let combinedFeed = [...actualAttendance];

    assignedUsers.forEach(user => {
        if (!user.assignments) return; // Failsafe

        user.assignments.forEach(assign => {
            // FIX: Skip this assignment if the referenced school was deleted from DB
            if (!assign.school || !assign.school._id) return;

            // Only process assignments meant for today
            if (assign.allowedDays.includes(currentDayName)) {

                // Check if this specific assignment (Teacher + School + Category) has a check-in
                const hasStarted = actualAttendance.find(a =>
                    // FIX: Ensure both teacher and school objects exist on the attendance record before checking _id
                    a.teacher && a.teacher._id &&
                    a.school && a.school._id &&
                    a.teacher._id.toString() === user._id.toString() &&
                    a.school._id.toString() === assign.school._id.toString() &&
                    a.band === assign.category
                );

                // If no attendance record exists, create a "Virtual Pending Card"
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
                        status: 'Pending', // Frontend helper uses this
                        checkInTime: null,
                        checkOutTime: null,
                        date: dateString,
                        // We pass the expected times so the Admin knows the schedule
                        expectedStartTime: assign.startTime,
                        expectedEndTime: assign.endTime
                    });
                }
            }
        });
    });

    // 4. Filtering Logic for Tabs
    if (status === 'active') {
        // Active = Pending (not started) OR Running (checked in, not out)
        return combinedFeed.filter(item => !item.checkOutTime && item.status !== 'Absent');
    } else if (status === 'completed') {
        return combinedFeed.filter(item => !!item.checkOutTime);
    } else if (status === 'pending') {
        return combinedFeed.filter(item => !item.checkInTime && item.status === 'Pending');
    }

    return combinedFeed; // 'All' returns the full list
};

module.exports = fetchDailyFeedData;