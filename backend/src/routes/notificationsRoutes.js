const express = require('express');
const router = express.Router();
const { listNotifications, markAllAsRead } = require('../controllers/notificationsController');
const { authenticate } = require('../middlewares/auth');

router.get('/', authenticate, listNotifications);
router.post('/mark-read', authenticate, markAllAsRead);

module.exports = router;


