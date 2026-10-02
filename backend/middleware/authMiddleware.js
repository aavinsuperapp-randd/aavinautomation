const supabase = require('../config/supabase');

// Middleware to verify authentication (for future protected API routes)
exports.verifyToken = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ success: false, message: 'Invalid or expired token' });
        }

        req.user = user;
        next();
    } catch (err) {
        console.error('Auth middleware error:', err);
        res.status(500).json({ success: false, message: 'Server error during authentication' });
    }
};
