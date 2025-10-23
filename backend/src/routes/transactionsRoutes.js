const express = require('express');
const router = express.Router();
const transactionsController = require('../controllers/transactionsController');
const { authenticate } = require('../middlewares/auth');

router.post('/', authenticate, transactionsController.createTransaction);
router.get('/', authenticate, transactionsController.listUserTransactions);

module.exports = router;
