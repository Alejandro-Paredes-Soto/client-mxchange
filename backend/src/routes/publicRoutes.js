const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/exchange-rate', async (req, res) => {
  try {
    // Leer las tasas desde la tabla settings
    const [buyRows] = await pool.query('SELECT value FROM settings WHERE key_name = ?', ['rate_buy']);
    const [sellRows] = await pool.query('SELECT value FROM settings WHERE key_name = ?', ['rate_sell']);
    
    const buy = buyRows && buyRows[0] ? Number(buyRows[0].value) : 17.8;
    const sell = sellRows && sellRows[0] ? Number(sellRows[0].value) : 18.2;
    
    return res.json({ buy, sell, fetched_at: new Date() });
  } catch (err) {
    console.error('Error fetching exchange rates:', err);
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
