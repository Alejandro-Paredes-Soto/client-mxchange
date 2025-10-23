const pool = require('../config/db');

const health = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT 1 as ok');
    if (rows && rows.length) return res.json({ ok: true, db: true });
    return res.status(500).json({ ok: true, db: false });
  } catch (err) {
    return res.status(500).json({ ok: false, db: false, error: err.message });
  }
};

module.exports = { health };
