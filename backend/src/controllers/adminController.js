const pool = require('../config/db');

const getInventory = async (req, res, next) => {
  try {
    // Filtrar por sucursal si el usuario es de tipo 'sucursal'
    let query = `
      SELECT i.id, i.branch_id, b.name as branch_name, i.currency, i.amount, i.low_stock_threshold, i.last_updated,
             CASE 
               WHEN i.amount >= i.low_stock_threshold * 1.5 THEN 'Óptimo'
               WHEN i.amount >= i.low_stock_threshold THEN 'Bajo'
               ELSE 'Crítico'
             END as stock_status
      FROM inventory i JOIN branches b ON i.branch_id = b.id
    `;
    const params = [];
    
    // Si es usuario de sucursal, filtrar por su sucursal
    if (req.userRole === 'sucursal' && req.userBranchId) {
      query += ' WHERE i.branch_id = ?';
      params.push(req.userBranchId);
    }
    
    const [rows] = await pool.query(query, params);
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
    
    // Si es usuario de sucursal, filtrar por su sucursal
    if (req.userRole === 'sucursal' && req.userBranchId) {
      query += ' AND t.branch_id = ?';
      params.push(req.userBranchId);
    }
    
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

      // Obtener datos de la transacción para las notificaciones
      const [txRows] = await connection.query(`
        SELECT t.id, t.user_id, t.transaction_code, t.branch_id, t.type, 
               t.amount_from, t.currency_from, t.amount_to, t.currency_to,
               b.name as branch_name
        FROM transactions t
        LEFT JOIN branches b ON t.branch_id = b.id
        WHERE t.id = ?
      `, [id]);
      const tx = txRows && txRows[0] ? txRows[0] : null;

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

        // Notificar al cliente sobre cancelación/expiración
        if (tx && tx.user_id) {
          const notifTitle = status === 'cancelled' ? 'Operación cancelada' : 'Operación expirada';
          const notifMessage = `Tu operación ${tx.transaction_code} ha sido ${status === 'cancelled' ? 'cancelada' : 'expirada'}.`;
          try {
            await connection.query(
              'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
              ['user', tx.user_id, null, notifTitle, notifMessage, `transaction_${status}`, tx.id]
            );
          } catch (insErr) {
            console.warn('No se pudo guardar notificación de usuario:', insErr && insErr.message ? insErr.message : insErr);
          }
          if (global && global.io) {
            try {
              global.io.to(`user:${tx.user_id}`).emit('notification', {
                title: notifTitle,
                message: notifMessage,
                event_type: `transaction_${status}`,
                transaction_id: tx.id,
                created_at: new Date().toISOString()
              });
            } catch (emitErr) {
              console.warn('No se pudo emitir notificación a usuario:', emitErr && emitErr.message ? emitErr.message : emitErr);
            }
          }
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
            const [txFullRows] = await connection.query('SELECT id, branch_id, amount_from, currency_from FROM transactions WHERE id = ?', [id]);
            const txFull = txFullRows && txFullRows[0] ? txFullRows[0] : null;

            if (txFull && txFull.amount_from && txFull.currency_from) {
              // Acreditar al inventario de la sucursal asociada a la transacción (una sola vez)
              try {
                await connection.query('UPDATE inventory SET amount = amount + ? WHERE branch_id = ? AND currency = ?', [txFull.amount_from, txFull.branch_id, txFull.currency_from]);
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

        // Notificar al cliente sobre pago confirmado
        if (status === 'paid' && tx && tx.user_id) {
          try {
            await connection.query(
              'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
              ['user', tx.user_id, null, 'Pago confirmado', `Tu pago para la operación ${tx.transaction_code} ha sido confirmado exitosamente.`, 'transaction_paid', tx.id]
            );
          } catch (insErr) {
            console.warn('No se pudo guardar notificación de usuario:', insErr && insErr.message ? insErr.message : insErr);
          }
          if (global && global.io) {
            try {
              global.io.to(`user:${tx.user_id}`).emit('notification', {
                title: 'Pago confirmado',
                message: `Tu pago para la operación ${tx.transaction_code} ha sido confirmado exitosamente.`,
                event_type: 'transaction_paid',
                transaction_id: tx.id,
                created_at: new Date().toISOString()
              });
            } catch (emitErr) {
              console.warn('No se pudo emitir notificación a usuario:', emitErr && emitErr.message ? emitErr.message : emitErr);
            }
          }
        }

        // Notificar a la sucursal sobre operación completada
        if (status === 'completed' && tx && tx.branch_id) {
          try {
            await connection.query(
              'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
              ['sucursal', null, tx.branch_id, 'Operación completada', `Operación ${tx.transaction_code} ha sido completada.`, 'transaction_completed', tx.id]
            );
          } catch (insErr) {
            console.warn('No se pudo guardar notificación de sucursal:', insErr && insErr.message ? insErr.message : insErr);
          }
          if (global && global.io) {
            try {
              global.io.to(`branch:${tx.branch_id}`).emit('notification', {
                title: 'Operación completada',
                message: `Operación ${tx.transaction_code} ha sido completada.`,
                event_type: 'transaction_completed',
                transaction_id: tx.id,
                branch_id: tx.branch_id,
                created_at: new Date().toISOString()
              });
            } catch (emitErr) {
              console.warn('No se pudo emitir notificación a sucursal:', emitErr && emitErr.message ? emitErr.message : emitErr);
            }
          }
        }
      }

      await connection.commit();

      // Notificar por sockets y guardar notificación si pasa a ready_for_pickup o ready_to_receive
      if (status === 'ready_for_pickup' || status === 'ready_to_receive') {
        if (tx && tx.user_id) {
          const operationType = tx.type === 'buy' ? 'COMPRA' : 'VENTA';
          const branchName = tx.branch_name || `Sucursal ${tx.branch_id}`;
          
          let title, message;
          if (status === 'ready_for_pickup') {
            // Para compra: cliente recibe amount_to en currency_to
            const amountReceive = tx.type === 'buy' ? tx.amount_to : tx.amount_from;
            const currencyReceive = tx.type === 'buy' ? tx.currency_to : tx.currency_from;
            title = `Tu operación de ${operationType} está lista`;
            message = `Tu operación de ${operationType} de $${Number(amountReceive).toFixed(2)} ${currencyReceive} con código ${tx.transaction_code} está lista para recoger en ${branchName}.`;
          } else {
            // Para venta: cliente entrega amount_from en currency_from
            const amountDeliver = tx.type === 'sell' ? tx.amount_from : tx.amount_to;
            const currencyDeliver = tx.type === 'sell' ? tx.currency_from : tx.currency_to;
            title = `Tu operación de ${operationType} está lista`;
            message = `Tu operación de ${operationType} de $${Number(amountDeliver).toFixed(2)} ${currencyDeliver} con código ${tx.transaction_code} está lista. Puedes acudir a ${branchName} para entregar tu dinero.`;
          }
          
          try {
            await pool.query(
              'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
              ['user', tx.user_id, null, title, message, status, tx.id]
            );
          } catch (insErr) {
            console.warn('No se pudo guardar notificación de usuario:', insErr && insErr.message ? insErr.message : insErr);
          }
          if (global && global.io) {
            try {
              global.io.to(`user:${tx.user_id}`).emit('notification', {
                title: title,
                message: message,
                event_type: status,
                transaction_id: tx.id,
                created_at: new Date().toISOString()
              });
            } catch (emitErr) {
              console.warn('No se pudo emitir notificación a usuario:', emitErr && emitErr.message ? emitErr.message : emitErr);
            }
          }
        }

        // Notificar a la sucursal también
        if (tx && tx.branch_id) {
          const branchTitle = status === 'ready_for_pickup' ? 'Operación lista para entrega' : 'Operación lista para recepción';
          const branchMessage = `Operación ${tx.transaction_code} está ${status === 'ready_for_pickup' ? 'lista para entrega al cliente' : 'lista para recibir dinero del cliente'}.`;
          
          try {
            await pool.query(
              'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
              ['sucursal', null, tx.branch_id, branchTitle, branchMessage, status, tx.id]
            );
          } catch (insErr) {
            console.warn('No se pudo guardar notificación de sucursal:', insErr && insErr.message ? insErr.message : insErr);
          }
          if (global && global.io) {
            try {
              global.io.to(`branch:${tx.branch_id}`).emit('notification', {
                title: branchTitle,
                message: branchMessage,
                event_type: status,
                transaction_id: tx.id,
                branch_id: tx.branch_id,
                created_at: new Date().toISOString()
              });
            } catch (emitErr) {
              console.warn('No se pudo emitir notificación a sucursal:', emitErr && emitErr.message ? emitErr.message : emitErr);
            }
          }
        }
      }

      // Emitir evento global de actualización de transacción para que todos los clientes conectados se actualicen
      if (global && global.io && tx) {
        try {
          global.io.emit('transaction.updated', {
            transaction_code: tx.transaction_code,
            id: tx.id,
            status: status,
            type: tx.type,
            user_id: tx.user_id,
            branch_id: tx.branch_id,
            updated_at: new Date().toISOString()
          });
          
          // También emitir a salas específicas
          if (tx.user_id) {
            global.io.to(`user:${tx.user_id}`).emit('transaction.status_changed', {
              transaction_id: tx.id,
              transaction_code: tx.transaction_code,
              new_status: status,
              updated_at: new Date().toISOString()
            });
          }
          
          if (tx.branch_id) {
            global.io.to(`branch:${tx.branch_id}`).emit('transaction.status_changed', {
              transaction_id: tx.id,
              transaction_code: tx.transaction_code,
              new_status: status,
              updated_at: new Date().toISOString()
            });
          }
          
          // Emitir a sala de admins
          global.io.to('admins').emit('transaction.status_changed', {
            transaction_id: tx.id,
            transaction_code: tx.transaction_code,
            new_status: status,
            updated_at: new Date().toISOString()
          });
        } catch (emitErr) {
          console.warn('No se pudo emitir evento de actualización de transacción:', emitErr && emitErr.message ? emitErr.message : emitErr);
        }
      }

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
    
    // Preparar filtro de sucursal si aplica
    let branchFilter = '';
    const params = [today];
    if (req.userRole === 'sucursal' && req.userBranchId) {
      branchFilter = ' AND branch_id = ?';
      params.push(req.userBranchId);
    }
    
    const [volumen] = await pool.query(`SELECT COUNT(*) as count FROM transactions WHERE DATE(created_at) = ?${branchFilter}`, params);
    
    const usdParams = ['sell', 'USD', 'completed', today];
    if (req.userRole === 'sucursal' && req.userBranchId) usdParams.push(req.userBranchId);
    const [usdVendidos] = await pool.query(`SELECT SUM(amount_from) as total FROM transactions WHERE type = ? AND currency_from = ? AND status = ? AND DATE(created_at) = ?${branchFilter}`, usdParams);
    
    const usdCompradosParams = ['buy', 'USD', 'completed', today];
    if (req.userRole === 'sucursal' && req.userBranchId) usdCompradosParams.push(req.userBranchId);
    const [usdComprados] = await pool.query(`SELECT SUM(amount_from) as total FROM transactions WHERE type = ? AND currency_from = ? AND status = ? AND DATE(created_at) = ?${branchFilter}`, usdCompradosParams);
    
    const incParams = ['cancelled', today];
    if (req.userRole === 'sucursal' && req.userBranchId) incParams.push(req.userBranchId);
    const [incumplimientos] = await pool.query(`SELECT COUNT(*) as count FROM transactions WHERE status = ? AND DATE(created_at) = ?${branchFilter}`, incParams);
    
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
    let query = `
      SELECT DATE(created_at) as date, 
             COUNT(*) as total_movimientos,
             SUM(CASE WHEN status != 'completed' THEN 1 ELSE 0 END) as no_realizados
      FROM transactions 
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    `;
    const params = [];
    
    // Si es usuario de sucursal, filtrar por su sucursal
    if (req.userRole === 'sucursal' && req.userBranchId) {
      query += ' AND branch_id = ?';
      params.push(req.userBranchId);
    }
    
    query += ' GROUP BY DATE(created_at) ORDER BY date';
    
    const [rows] = await pool.query(query, params);
    return res.json({ chartData: rows });
  } catch (err) {
    next(err);
  }
};

const getInventorySummary = async (req, res, next) => {
  try {
    let query = 'SELECT currency, SUM(amount) as total FROM inventory';
    const params = [];
    
    // Si es usuario de sucursal, filtrar por su sucursal
    if (req.userRole === 'sucursal' && req.userBranchId) {
      query += ' WHERE branch_id = ?';
      params.push(req.userBranchId);
    }
    
    query += ' GROUP BY currency';
    
    const [rows] = await pool.query(query, params);
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
    let query = 'SELECT t.*, u.name as user_name, b.name as branch_name FROM transactions t JOIN users u ON t.user_id = u.idUser JOIN branches b ON t.branch_id = b.id';
    const params = [];
    
    // Si es usuario de sucursal, filtrar por su sucursal
    if (req.userRole === 'sucursal' && req.userBranchId) {
      query += ' WHERE t.branch_id = ?';
      params.push(req.userBranchId);
    }
    
    query += ' ORDER BY t.created_at DESC LIMIT 10';
    
    const [rows] = await pool.query(query, params);
    return res.json({ transactions: rows });
  } catch (err) {
    next(err);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT idUser, name, email, role, active, createdAt FROM users ORDER BY createdAt DESC');
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
    const [buyRows] = await pool.query('SELECT value FROM settings WHERE key_name = ?', ['rate_buy']);
    const [sellRows] = await pool.query('SELECT value FROM settings WHERE key_name = ?', ['rate_sell']);
    const buy = buyRows && buyRows[0] ? Number(buyRows[0].value) : 17.8;
    const sell = sellRows && sellRows[0] ? Number(sellRows[0].value) : 18.2;
    return res.json({ buy, sell });
  } catch (err) {
    next(err);
  }
};

const updateRates = async (req, res, next) => {
  try {
    const { buy, sell } = req.body;
    if (buy == null || sell == null) return res.status(400).json({ message: 'buy and sell required' });
    
    // Insertar o actualizar en settings
    await pool.query(
      'INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
      ['rate_buy', String(buy), String(buy)]
    );
    await pool.query(
      'INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
      ['rate_sell', String(sell), String(sell)]
    );
    
    // Opcional: Mantener historial
    await pool.query('INSERT INTO exchange_rate_history (rate_buy, rate_sell) VALUES (?, ?)', [buy, sell]);
    
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

const listBranches = async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.*, u.email as user_email 
      FROM branches b 
      LEFT JOIN users u ON b.id = u.branch_id AND u.role = 'sucursal'
    `);
    return res.json({ branches: rows });
  } catch (err) {
    next(err);
  }
};

const createBranch = async (req, res, next) => {
  try {
    const { name, address, city, state, email, password } = req.body;
    if (!name || !address) return res.status(400).json({ message: 'name and address required' });
    if (!email || !password) return res.status(400).json({ message: 'email and password required for branch user' });
    
    // Verificar si el email ya existe
    const [existingUsers] = await pool.query('SELECT idUser FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ message: 'Email already in use' });
    }
    
    // Crear la sucursal primero
    const [result] = await pool.query('INSERT INTO branches (name, address, city, state) VALUES (?, ?, ?, ?)', [name, address, city || 'Nogales', state || 'Sonora']);
    const branchId = result.insertId;
    
    // Crear el usuario de sucursal
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (name, email, password, role, branch_id, active) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, hashedPassword, 'sucursal', branchId, true]
    );
    
    return res.json({ id: branchId });
  } catch (err) {
    next(err);
  }
};

const updateBranch = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { name, address, city, state, email, password } = req.body;
    
    // Actualizar la sucursal
    await pool.query('UPDATE branches SET name = ?, address = ?, city = ?, state = ? WHERE id = ?', [name, address, city, state, id]);
    
    // Si se proporciona email o password, actualizar el usuario de la sucursal
    if (email || password) {
      // Buscar el usuario asociado a esta sucursal
      const [users] = await pool.query('SELECT idUser, email FROM users WHERE branch_id = ? AND role = ?', [id, 'sucursal']);
      
      if (users.length > 0) {
        const userId = users[0].idUser;
        
        // Verificar si el nuevo email ya está en uso por otro usuario
        if (email && email !== users[0].email) {
          const [existingUsers] = await pool.query('SELECT idUser FROM users WHERE email = ? AND idUser != ?', [email, userId]);
          if (existingUsers.length > 0) {
            return res.status(400).json({ message: 'Email already in use by another user' });
          }
        }
        
        // Construir la consulta de actualización del usuario
        if (email && password) {
          const bcrypt = require('bcryptjs');
          const hashedPassword = await bcrypt.hash(password, 10);
          await pool.query('UPDATE users SET email = ?, password = ?, name = ? WHERE idUser = ?', [email, hashedPassword, name, userId]);
        } else if (email) {
          await pool.query('UPDATE users SET email = ?, name = ? WHERE idUser = ?', [email, name, userId]);
        } else if (password) {
          const bcrypt = require('bcryptjs');
          const hashedPassword = await bcrypt.hash(password, 10);
          await pool.query('UPDATE users SET password = ?, name = ? WHERE idUser = ?', [hashedPassword, name, userId]);
        }
      }
    }
    
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
    
    // Verificar que el usuario de sucursal solo pueda ver su propia sucursal
    if (req.userRole === 'sucursal' && req.userBranchId && parseInt(branchId) !== req.userBranchId) {
      return res.status(403).json({ message: 'Access denied to this branch' });
    }
    
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
