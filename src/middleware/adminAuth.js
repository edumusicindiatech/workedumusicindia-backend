const adminAuth = async (req, res, next) => {
    try {
        // req.user is attached by userAuth right before this runs
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required before checking admin status."
            });
        }

        if (!['Admin', 'SuperAdmin'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: "Access denied. Admin privileges required." });
        }
        
        next();
    } catch (error) {
        console.error('Admin Auth Error:', error);
        res.status(500).json({ success: false, message: "Server error during authorization" });
    }
};

module.exports = adminAuth