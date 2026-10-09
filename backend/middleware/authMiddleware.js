const supabase = require('../config/supabase');
const logger = require('../utils/logger');

// Middleware to verify authentication (for future protected API routes)
exports.verifyToken = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        logger.info('[AUTH] No token provided');
        return res.status(401).json({ success: false, message: 'Authentication required', code: 'no_token' });
    }

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            logger.info(`[AUTH] Token validation failed: ${error ? error.message : 'no user returned'}`);
            return res.status(401).json({ success: false, message: 'Invalid or expired token', code: 'token_expired' });
        }

        req.user = user;
        next();
    } catch (err) {
        logger.info(`[AUTH] Middleware error: ${err.message}`);
        res.status(500).json({ success: false, message: 'Server error during authentication' });
    }
};
