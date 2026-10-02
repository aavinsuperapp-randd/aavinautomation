const express = require('express');
const router = express.Router();
const automationController = require('../controllers/automationController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/', verifyToken, automationController.createAutomation);
router.get('/', verifyToken, automationController.getAutomations);
router.delete('/:id', verifyToken, automationController.deleteAutomation);

module.exports = router;
