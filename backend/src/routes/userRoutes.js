const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Ruta para login con Google
router.post('/loginGoogle', authController.loginGoogle);

module.exports = router;