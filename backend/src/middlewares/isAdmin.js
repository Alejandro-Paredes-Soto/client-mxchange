const pool = require('../config/db');

async function isAdmin(req, res, next) {
  try {
    const userId = req.user && req.user.id ? req.user.id : null;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const [rows] = await pool.query('SELECT role FROM users WHERE idUser = ?', [userId]);
    const role = rows && rows[0] ? rows[0].role : null;
    if (role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    return next();
  } catch (err) {
    return res.status(500).json({ message: 'error' });
  }
}

module.exports = { isAdmin };
