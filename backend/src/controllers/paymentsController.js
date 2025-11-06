const pool = require('../config/db');

// Obtener estado del pago/transacci�n por transaction_code
const getPaymentStatus = async (req, res, next) => {
  try {
    const { transaction_code } = req.params;
    if (!transaction_code) {
      return res.status(400).json({ message: 'transaction_code requerido' });
    }

    const [txRows] = await pool.query('SELECT id, status FROM transactions WHERE transaction_code = ? LIMIT 1', [transaction_code]);
    if (!txRows || txRows.length === 0) {
      return res.status(404).json({ message: 'Transacci�n no encontrada' });
    }
    const tx = txRows[0];

    const [payments] = await pool.query('SELECT id, amount, currency, status, stripe_payment_intent_id, stripe_customer_id, created_at FROM payments WHERE transaction_id = ? ORDER BY created_at DESC', [tx.id]);

    return res.json({ transaction: { id: tx.id, status: tx.status }, payments });
  } catch (err) {
    console.error('Error en getPaymentStatus:', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Error obteniendo estado de pago' });
  }
};

module.exports = { getPaymentStatus };
