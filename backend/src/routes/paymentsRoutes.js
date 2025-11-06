const express = require('express');
const router = express.Router();
const paymentsController = require('../controllers/paymentsController');
const stripePaymentsController = require('../controllers/stripePaymentsController');
const { authenticate } = require('../middlewares/auth');

// === STRIPE ENDPOINTS ===
// Obtener configuración de Stripe (clave pública)
router.get('/stripe/config', stripePaymentsController.getConfig);

// Crear Payment Intent
router.post('/stripe/create-payment-intent', authenticate, stripePaymentsController.createPaymentIntent);

// Confirmar pago
router.post('/stripe/confirm-payment', authenticate, stripePaymentsController.confirmPayment);

// Procesar cargo completo con tarjeta
router.post('/stripe/charge', authenticate, stripePaymentsController.charge);

// Webhook de Stripe (debe usar express.raw para verificación de firma)
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), stripePaymentsController.webhook);

// === SHARED ENDPOINTS ===
// Estado de pago público por transaction_code (para vistas success/failed)
router.get('/status/:transaction_code', paymentsController.getPaymentStatus);

module.exports = router;
