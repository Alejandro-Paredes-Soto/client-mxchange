const pool = require('../config/db');

const getInventory = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT i.id, i.branch_id, b.name as branch_name, i.currency, i.amount, i.low_stock_threshold, i.last_updated,
             CASE 
               WHEN i.amount >= i.low_stock_threshold * 1.5 THEN 'Óptimo'
               WHEN i.amount >= i.low_stock_threshold THEN 'Bajo'
               ELSE 'Crítico'
             END as stock_status
      FROM inventory i JOIN branches b ON i.branch_id = b.id
    `);
    return res.json({ inventory: rows });
  } catch (err) {
    next(err);
  }
};

const updateInventory = async (req, res, next) => {
  try {
    const { id, amount, low_stock_threshold, reason, adjusted_by } = req.body;
    if (!id || amount == null) return res.status(400).json({ message: 'id and amount required' });
    // Get old amount
    const [oldRows] = await pool.query('SELECT amount FROM inventory WHERE id = ?', [id]);
    const oldAmount = oldRows[0]?.amount || 0;
    const adjustmentType = amount > oldAmount ? 'entry' : 'exit';
    await pool.query('UPDATE inventory SET amount = ?, low_stock_threshold = ? WHERE id = ?', [amount, low_stock_threshold || 1000, id]);
    // Insert history
    await pool.query('INSERT INTO inventory_adjustments (inventory_id, old_amount, new_amount, adjustment_type, reason, adjusted_by) VALUES (?, ?, ?, ?, ?, ?)', [id, oldAmount, amount, adjustmentType, reason || '', adjusted_by || null]);
    // Emitir actualización en tiempo real
    if (global.io) {
      global.io.emit('inventoryUpdated');
    }
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

const listAllTransactions = async (req, res, next) => {
  try {
    const { code, branch_id, status, start_date, end_date, limit = 500 } = req.query;
    let query = 'SELECT t.*, u.name as user_name, b.name as branch_name FROM transactions t JOIN users u ON t.user_id = u.idUser JOIN branches b ON t.branch_id = b.id WHERE 1=1';
    const params = [];
    if (code) {
      query += ' AND t.transaction_code LIKE ?';
      params.push(`%${code}%`);
    }
    if (branch_id) {
      query += ' AND t.branch_id = ?';
      params.push(branch_id);
    }
    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    if (start_date) {
      query += ' AND DATE(t.created_at) >= ?';
      params.push(start_date);
    }
    if (end_date) {
      query += ' AND DATE(t.created_at) <= ?';
      params.push(end_date);
    }
    query += ' ORDER BY t.created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const [rows] = await pool.query(query, params);
    return res.json({ transactions: rows });
  } catch (err) {
    next(err);
  }
};

const changeTransactionStatus = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { status } = req.body;
    if (!id || !status) return res.status(400).json({ message: 'id and status required' });
    // Usar conexión para operaciones atómicas cuando sea necesario
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query('UPDATE transactions SET status = ? WHERE id = ?', [status, id]);

      // Si la transacción fue cancelada o expirada, liberar reservas asociadas
      if (status === 'cancelled' || status === 'expired') {
        try {
          const [resRows] = await connection.query('SELECT id, branch_id, currency, amount_reserved FROM inventory_reservations WHERE transaction_id = ? AND status = ?', [id, 'reserved']);
          if (resRows && resRows.length) {
            for (const r of resRows) {
              try {
                // devolver al inventario
                await connection.query('UPDATE inventory SET amount = amount + ? WHERE branch_id = ? AND currency = ?', [r.amount_reserved, r.branch_id, r.currency]);
                await connection.query('UPDATE inventory_reservations SET status = ?, released_at = NOW() WHERE id = ?', ['released', r.id]);
                // opcional: insertar en inventory_adjustments para trazabilidad (skipped aquí)
              } catch (inner) {
                console.warn('Error liberando reserva desde admin changeStatus:', inner && inner.message ? inner.message : inner);
              }
            }
          }
        } catch (qErr) {
          console.warn('Error buscando inventory_reservations en changeTransactionStatus:', qErr && qErr.message ? qErr.message : qErr);
        }
      }

      // Si se marca como pagada o completada, marcar reservas como committed
      // y acreditar al inventario la moneda que la sucursal debe recibir.
      if (status === 'paid' || status === 'completed') {
        try {
          // Obtener reservas pendientes para esta transacción
          const [resRows] = await connection.query('SELECT id, branch_id, currency, amount_reserved FROM inventory_reservations WHERE transaction_id = ? AND status = ?', [id, 'reserved']);

          if (resRows && resRows.length) {
            // Obtener datos de la transacción para saber qué moneda y monto acreditar
            const [txRows] = await connection.query('SELECT id, branch_id, amount_from, currency_from FROM transactions WHERE id = ?', [id]);
            const tx = txRows && txRows[0] ? txRows[0] : null;

            if (tx && tx.amount_from && tx.currency_from) {
              // Acreditar al inventario de la sucursal asociada a la transacción (una sola vez)
              try {
                await connection.query('UPDATE inventory SET amount = amount + ? WHERE branch_id = ? AND currency = ?', [tx.amount_from, tx.branch_id, tx.currency_from]);
              } catch (creditErr) {
                console.warn('Error acreditando inventario al confirmar transacción:', creditErr && creditErr.message ? creditErr.message : creditErr);
              }
            } else {
              console.warn('Transacción no encontrada o sin monto/moneda para acreditar:', id);
            }

            // Marcar todas las reservas como committed (se actualiza aunque la acreditación falle para mantener consistencia del estado)
            const reservationIds = resRows.map(r => r.id);
            try {
              await connection.query(`UPDATE inventory_reservations SET status = ?, committed_at = NOW() WHERE id IN (${reservationIds.map(() => '?').join(',')})`, ['committed', ...reservationIds]);
            } catch (commitErr) {
              console.warn('Error marcando inventory_reservations como committed desde admin changeStatus:', commitErr && commitErr.message ? commitErr.message : commitErr);
            }
          }
        } catch (cErr) {
          console.warn('Error procesando reservas al marcar transacción como pagada/completada:', cErr && cErr.message ? cErr.message : cErr);
        }
      }

      await connection.commit();
      return res.json({ ok: true });
    } catch (errInner) {
      if (connection) await connection.rollback();
      throw errInner;
    } finally {
      if (connection) connection.release();
    }
  } catch (err) {
    next(err);
  }
};

const getDashboardKPIs = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const [volumen] = await pool.query('SELECT COUNT(*) as count FROM transactions WHERE DATE(created_at) = ?', [today]);
    const [usdVendidos] = await pool.query('SELECT SUM(amount_from) as total FROM transactions WHERE type = ? AND currency_from = ? AND status = ? AND DATE(created_at) = ?', ['sell', 'USD', 'completed', today]);
    const [usdComprados] = await pool.query('SELECT SUM(amount_from) as total FROM transactions WHERE type = ? AND currency_from = ? AND status = ? AND DATE(created_at) = ?', ['buy', 'USD', 'completed', today]);
    const [incumplimientos] = await pool.query('SELECT COUNT(*) as count FROM transactions WHERE status = ? AND DATE(created_at) = ?', ['cancelled', today]);
    return res.json({
      volumenTransacciones: volumen[0].count || 0,
      totalUSDVendidos: usdVendidos[0].total || 0,
      totalUSDComprados: usdComprados[0].total || 0,
      incumplimientos: incumplimientos[0].count || 0
    });
  } catch (err) {
    next(err);
  }
};

const getDashboardChartData = async (req, res, next) => {
  try {
    // Últimos 30 días
    const [rows] = await pool.query(`
      SELECT DATE(created_at) as date, 
             COUNT(*) as total_movimientos,
             SUM(CASE WHEN status != 'completed' THEN 1 ELSE 0 END) as no_realizados
      FROM transactions 
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date
    `);
    return res.json({ chartData: rows });
  } catch (err) {
    next(err);
  }
};

const getInventorySummary = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT currency, SUM(amount) as total FROM inventory GROUP BY currency');
    const summary = {};
    rows.forEach(row => {
      summary[row.currency] = row.total;
    });
    return res.json({ summary });
  } catch (err) {
    next(err);
  }
};

const getRecentTransactions = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT t.*, u.name as user_name, b.name as branch_name FROM transactions t JOIN users u ON t.user_id = u.idUser JOIN branches b ON t.branch_id = b.id ORDER BY t.created_at DESC LIMIT 10');
    return res.json({ transactions: rows });
  } catch (err) {
    next(err);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT idUser, name, email, role, createdAt FROM users ORDER BY createdAt DESC');
    return res.json({ users: rows });
  } catch (err) {
    next(err);
  }
};

const getUserProfile = async (req, res, next) => {
  try {
    const id = req.params.id;
    const [rows] = await pool.query('SELECT u.*, COUNT(t.id) as transaction_count FROM users u LEFT JOIN transactions t ON u.idUser = t.user_id WHERE u.idUser = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });
    return res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
};

const toggleUserStatus = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { active } = req.body;
    if (active == null) return res.status(400).json({ message: 'active required' });
    await pool.query('UPDATE users SET active = ? WHERE idUser = ?', [active, id]);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

const getCurrentRates = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT rate_buy, rate_sell FROM exchange_rate_history ORDER BY fetched_at DESC LIMIT 1');
    if (rows.length === 0) return res.json({ buy: 0, sell: 0 });
    return res.json({ buy: rows[0].rate_buy, sell: rows[0].rate_sell });
  } catch (err) {
    next(err);
  }
};

const updateRates = async (req, res, next) => {
  try {
    const { buy, sell } = req.body;
    if (buy == null || sell == null) return res.status(400).json({ message: 'buy and sell required' });
    await pool.query('INSERT INTO exchange_rate_history (rate_buy, rate_sell) VALUES (?, ?)', [buy, sell]);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

const listBranches = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM branches');
    return res.json({ branches: rows });
  } catch (err) {
    next(err);
  }
};

const createBranch = async (req, res, next) => {
  try {
    const { name, address, city, state } = req.body;
    if (!name || !address) return res.status(400).json({ message: 'name and address required' });
    const [result] = await pool.query('INSERT INTO branches (name, address, city, state) VALUES (?, ?, ?, ?)', [name, address, city || 'Nogales', state || 'Sonora']);
    return res.json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
};

const updateBranch = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { name, address, city, state } = req.body;
    await pool.query('UPDATE branches SET name = ?, address = ?, city = ?, state = ? WHERE id = ?', [name, address, city, state, id]);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

const deleteBranch = async (req, res, next) => {
  try {
    const id = req.params.id;
    await pool.query('DELETE FROM branches WHERE id = ?', [id]);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

const getAlertSettings = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT value FROM settings WHERE key_name = ?', ['alert_emails']);
    return res.json({ alertEmails: rows.length > 0 ? rows[0].value : '' });
  } catch (err) {
    next(err);
  }
};

const updateAlertSettings = async (req, res, next) => {
  try {
    const { alertEmails } = req.body;
    await pool.query('INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?', ['alert_emails', alertEmails, alertEmails]);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

const updateCommissionSetting = async (req, res, next) => {
  try {
    const { commissionPercent } = req.body;
    if (commissionPercent == null) return res.status(400).json({ message: 'commissionPercent required' });
    await pool.query('INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?', ['commission_percent', String(commissionPercent), String(commissionPercent)]);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

const getInventoryHistory = async (req, res, next) => {
  try {
    const branchId = req.params.branchId;
    const [rows] = await pool.query(`
      SELECT ia.*, u.name as adjusted_by_name, i.currency
      FROM inventory_adjustments ia
      JOIN inventory i ON ia.inventory_id = i.id
      LEFT JOIN users u ON ia.adjusted_by = u.idUser
      WHERE i.branch_id = ?
      ORDER BY ia.adjusted_at DESC
    `, [branchId]);
    return res.json({ history: rows });
  } catch (err) {
    next(err);
  }
};

const getTransactionDetails = async (req, res, next) => {
  try {
    const id = req.params.id;
    const [rows] = await pool.query('SELECT t.*, u.name as user_name, b.name as branch_name FROM transactions t JOIN users u ON t.user_id = u.idUser JOIN branches b ON t.branch_id = b.id WHERE t.id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Transaction not found' });
    return res.json({ transaction: rows[0] });
  } catch (err) {
    next(err);
  }
};

module.exports = { getInventory, updateInventory, listAllTransactions, changeTransactionStatus, getDashboardKPIs, getDashboardChartData, getInventorySummary, getRecentTransactions, listUsers, getUserProfile, toggleUserStatus, getCurrentRates, updateRates, listBranches, createBranch, updateBranch, deleteBranch, getAlertSettings, updateAlertSettings, updateCommissionSetting, getInventoryHistory, getTransactionDetails };
