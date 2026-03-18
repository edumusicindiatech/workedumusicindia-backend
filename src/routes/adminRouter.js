const express = require('express');
const User = require('../models/User');
const crypto = require('crypto');
const validator = require('validator');
const bcrypt = require('bcrypt');
const adminRouter = express.Router();
const { sendWelcomeEmail } = require('../utils/emailService');
const adminAuth = require('../middleware/adminAuth');
const userAuth = require('../middleware/userAuth');

adminRouter.post('/admin/create/', userAuth, adminAuth, async (req, res) => {
    try {
        const { name, email, role } = req.body;

        // 1. Validate required fields
        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: "Name and Email are required."
            });
        }

        if (!validator.isEmail(email)) {
            return res.status(400).json({
                success: false,
                message: "Invalid email format."
            });
        }

        // 2. Generate fresh credentials (we need these whether creating or updating)
        const randomHex = crypto.randomBytes(2).toString('hex').toUpperCase();
        const newEmployeeId = `EMP-${new Date().getFullYear()}-${randomHex}`;
        const newGeneratedPassword = crypto.randomBytes(4).toString('hex');

        const salt = await bcrypt.genSalt(10);
        const newHashedPassword = await bcrypt.hash(newGeneratedPassword, salt);

        // 3. Check if user already exists
        let user = await User.findOne({ email });
        let isNewUser = false;

        if (user) {
            // SCENARIO A: User exists. Regenerate their credentials.
            user.employeeId = newEmployeeId;
            user.password = newHashedPassword;

            // Optionally update name/role if the admin changed them in the form
            if (name) user.name = name;
            if (role) user.role = role;

            await user.save();
        } else {
            // SCENARIO B: User does not exist. Create them.
            isNewUser = true;
            user = new User({
                name,
                email,
                password: newHashedPassword,
                employeeId: newEmployeeId,
                role: role || 'Employee'
            });
            await user.save();
        }

        // 4. Trigger Brevo Email Notification (Uncomment when ready)
        await sendWelcomeEmail(user.email, user.name, user.employeeId, newGeneratedPassword);

        // 5. Send success response
        // Using 201 Created for new users, 200 OK for updated users
        return res.status(isNewUser ? 201 : 200).json({
            success: true,
            message: isNewUser
                ? "Employee successfully created."
                : "Existing employee found. Credentials successfully regenerated.",
            user: {
                name: user.name,
                email: user.email,
                employeeId: user.employeeId,
                role: user.role
            },
            tempPassword: newGeneratedPassword // Admin UI can display this in case email fails
        });

    } catch (error) {
        console.error("Error in /admin/create:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
});

adminRouter.get('/dashboard/overview', userAuth, adminAuth, async (req, res) => {
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const totalEmployees = await User.countDocuments({ role: 'Employee' });
        const presentTodayShifts = await DailyShift.find({ date: todayStr }).distinct('employee');
        const presentTodayCount = presentTodayShifts.length;

        const pendingCount = totalEmployees - presentTodayCount;
        const noShowCount = 0;

        const recentShifts = await DailyShift.find({ date: todayStr })
            .populate('employee', 'name')
            .sort({ loginTime: -1 })
            .limit(10);

        const recentAttendances = await Attendance.find({ date: { $gte: startOfDay } })
            .populate('teacher', 'name')
            .sort({ checkInTime: -1 })
            .limit(10);

        let activityFeed = [];

        recentShifts.forEach(shift => {
            activityFeed.push({
                id: `shift_${shift._id}`,
                employeeName: shift.employee.name,
                action: 'Started shift',
                time: shift.loginTime,
                status: 'Present',
                statusColor: 'success'
            });
            if (shift.logoutTime) {
                activityFeed.push({
                    id: `shift_out_${shift._id}`,
                    employeeName: shift.employee.name,
                    action: 'Ended shift',
                    time: shift.logoutTime,
                    status: 'Completed',
                    statusColor: 'default'
                });
            }
        });

        recentAttendances.forEach(att => {
            activityFeed.push({
                id: `att_${att._id}`,
                employeeName: att.teacher.name,
                action: `Marked attendance (${att.status})`,
                time: att.checkInTime,
                status: att.status,
                statusColor: att.status === 'Late' ? 'warning' : att.status === 'Absent' ? 'danger' : 'success'
            });
        });

        activityFeed.sort((a, b) => new Date(b.time) - new Date(a.time));
        activityFeed = activityFeed.slice(0, 15);

        return res.status(200).json({
            success: true,
            stats: {
                totalEmployees,
                presentToday: presentTodayCount,
                noShow: noShowCount,
                pending: pendingCount
            },
            recentActivity: activityFeed
        });

    } catch (error) {
        console.error("Dashboard overview error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load dashboard overview."
        });
    }
});

module.exports = adminRouter;