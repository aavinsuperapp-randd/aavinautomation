const express = require('express');
const cors = require('cors');
require('dotenv').config();
const logger = require('./utils/logger');

const authRoutes = require('./routes/auth');
const automationsRoutes = require('./routes/automations');
const sendRoutes = require('./routes/send');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logging Middleware
app.use((req, res, next) => {
    const start = Date.now();
    logger.info(`[REQUEST] ${req.method} ${req.url}`);
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`[RESPONSE] ${req.method} ${req.url} → ${res.statusCode} | ${duration}ms`);
    });
    next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/automations', automationsRoutes);
app.use('/api/send', sendRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.send(`
        <html>
            <body style="font-family: sans-serif; padding: 2rem; text-align: center;">
                <h2>WhatsApp Automation Backend</h2>
                <p>The backend is running successfully!</p>
                <p>To view the frontend, please visit the frontend server URL (e.g., <a href="http://localhost:8080">http://localhost:8080</a>).</p>
            </body>
        </html>
    `);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'An unexpected error occurred' });
});

app.listen(PORT, () => {
    console.log(`
========================================
 Backend Server Started
========================================
 Environment: ${process.env.NODE_ENV || 'development'}
 Port: ${PORT}
 Supabase: ${process.env.SUPABASE_URL ? 'configured' : 'missing'}
 AskEVA Token: ${process.env.ASKEVA_TOKEN ? 'configured' : 'missing'}
========================================
    `);
});
