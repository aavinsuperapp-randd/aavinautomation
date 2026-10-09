const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const { verifyToken } = require('../middleware/authMiddleware');

// POST /api/upload/image — Upload an image and get public URL
router.post('/image', verifyToken, uploadController.uploadImage);

// POST /api/upload/document — Upload a PDF document and get public URL
router.post('/document', verifyToken, uploadController.uploadDocument);

module.exports = router;
