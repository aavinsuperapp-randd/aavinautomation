const express = require('express');
const router = express.Router();
const sendController = require('../controllers/sendController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/execute', verifyToken, sendController.executeSend);
router.post('/:jobId/stop', verifyToken, sendController.stopSend);

module.exports = router;
