const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const logger = require('./utils/logger');

const authRoutes = require('./routes/auth');
const automationsRoutes = require('./routes/automations');
const sendRoutes = require('./routes/send');
const liveDataRoutes = require('./routes/liveData');

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
app.use('/api/live-data', liveDataRoutes);

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

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
 AAVIN Automation Server Started
========================================
 Environment: ${process.env.NODE_ENV || 'development'}
 API Port: ${PORT}
 Frontend URL: http://localhost:${PORT}
 Supabase: ${process.env.SUPABASE_URL ? 'configured' : 'missing'}
 AskEVA Token: ${process.env.ASKEVA_TOKEN ? 'configured' : 'missing'}
========================================
    `);
});
