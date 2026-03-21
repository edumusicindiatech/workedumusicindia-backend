const requireSuperAdmin = (req, res, next) => {
    if (req.user.role !== 'SuperAdmin') {
        return res.status(403).json({ success: false, message: "Access denied. SuperAdmin privileges required." });
    }
    next();
};

module.exports = requireSuperAdmin