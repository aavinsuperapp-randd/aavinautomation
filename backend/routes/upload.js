const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const { verifyToken } = require('../middleware/authMiddleware');

// POST /api/upload/image — Upload an image and get public URL
router.post('/image', verifyToken, uploadController.uploadImage);

module.exports = router;
