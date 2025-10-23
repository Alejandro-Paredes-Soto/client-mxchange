const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/exchange-rate', async (req, res) => {
  try {
    // Intentamos leer la última tasa desde exchange_rate_history
    const [rows] = await pool.query('SELECT rate_buy, rate_sell, fetched_at FROM exchange_rate_history ORDER BY fetched_at DESC LIMIT 1');
    if (rows && rows[0]) return res.json({ buy: Number(rows[0].rate_buy), sell: Number(rows[0].rate_sell), fetched_at: rows[0].fetched_at });

    // Fallback simple
    return res.json({ buy: 17.8, sell: 18.2, fetched_at: new Date() });
  } catch (err) {
    return res.status(500).json({ message: 'error' });
  }
});

router.get('/branches', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, address, city, state FROM branches');
    return res.json({ branches: rows });
  } catch (err) {
    return res.status(500).json({ message: 'error' });
  }
});

// Endpoint público para obtener el porcentaje de comisión configurado
router.get('/config/commission', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT value FROM settings WHERE key_name = ?', ['commission_percent']);
    const value = rows && rows[0] ? rows[0].value : null;
    const percent = value !== null ? Number(value) : 2.0;
    return res.json({ commissionPercent: percent });
  } catch (err) {
    console.error('Error reading commission_percent setting', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'error' });
  }
});

module.exports = router;
