const express = require('express');
const router = express.Router();
const paymentsController = require('../controllers/paymentsController');
const { authenticate } = require('../middlewares/auth');

// Crear cargo con tarjeta (requiere autenticación del usuario en el flujo típico)
router.post('/card', authenticate, paymentsController.createCardCharge);

// Obtener configuración de pagos (p. ej. clave pública de Conekta)
router.get('/config', paymentsController.getConfig);

// Estado de pago público por transaction_code (p. ej. para vistas success/failed)
router.get('/status/:transaction_code', paymentsController.getPaymentStatus);

// Webhook (public) — Conekta enviará eventos a este endpoint
router.post('/webhook', express.json({ type: '*/*' }), paymentsController.webhook);

module.exports = router;
