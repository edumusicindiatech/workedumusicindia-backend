const adminAuth = async (req, res, next) => {
    try {
        // req.user is attached by userAuth right before this runs
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required before checking admin status."
            });
        }

        // Define allowed admin roles (matching your DB schema and frontend logic)
        const adminRoles = ['Admin1', 'Admin2', 'Admin3', 'admin'];

        if (!adminRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Access Denied: Administrator privileges required."
            });
        }

        next();
    } catch (error) {
        console.error('Admin Auth Error:', error);
        res.status(500).json({ success: false, message: "Server error during authorization" });
    }
};

module.exports = adminAuth