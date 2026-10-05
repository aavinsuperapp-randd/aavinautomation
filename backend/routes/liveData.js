const express = require('express');
const router = express.Router();
const liveDataController = require('../controllers/liveDataController');
const { verifyToken } = require('../middleware/authMiddleware');

// GET /api/live-data/jobs - List all jobs for user
router.get('/jobs', verifyToken, liveDataController.getJobs);

// GET /api/live-data/jobs/:jobId - Get job details with batches
router.get('/jobs/:jobId', verifyToken, liveDataController.getJob);

// GET /api/live-data/jobs/:jobId/rows - Get paginated rows
router.get('/jobs/:jobId/rows', verifyToken, liveDataController.getJobRows);

// POST /api/live-data/jobs/:jobId/stop - Stop an active job
router.post('/jobs/:jobId/stop', verifyToken, liveDataController.stopJob);

module.exports = router;
