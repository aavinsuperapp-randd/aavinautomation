const supabase = require('../config/supabase');

exports.login = async (req, res) => {
    const { email, password } = req.body;

    // Input Validation
    if (!email || !password) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email and password are required' 
        });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Invalid email format' 
        });
    }

    try {
        // Authenticate against Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }

        // Return appropriate response, never sensitive credentials
        res.json({
            success: true,
            message: 'Login successful',
            token: data.session.access_token // Used by frontend for simple protected route check
        });
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ 
            success: false, 
            message: 'Unable to connect to server. Please try again.' 
        });
    }
};
