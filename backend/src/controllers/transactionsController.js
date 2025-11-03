const pool = require('../config/db');

// Genera un código único corto para la transacción
function generateTransactionCode() {
  return 'MX' + Date.now().toString(36).slice(-6).toUpperCase();
}

const createTransaction = async (req, res, next) => {
  const connection = await pool.getConnection(); // Get connection for transaction
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized. User not found in token.' });
    }

    const { branch_id, type, amount_from, currency_from, amount_to, currency_to, exchange_rate, method } = req.body;

    // 1. Validate input
    const requiredFields = { branch_id, type, amount_from, currency_from, amount_to, currency_to, exchange_rate };
    const missing = Object.entries(requiredFields).filter(([_, v]) => v === undefined || v === null || v === '').map(([k]) => k);
    if (missing.length > 0) {
      return res.status(400).json({ message: 'Faltan campos obligatorios para la transacción.', missing });
    }

    const amtFrom = Number(amount_from);
    const amtTo = Number(amount_to);
    if (isNaN(amtFrom) || isNaN(amtTo) || amtFrom <= 0 || amtTo <= 0) {
      return res.status(400).json({ message: 'Los montos de la transacción deben ser números positivos.' });
    }

    // 2. Start database transaction
    await connection.beginTransaction();

    if (type !== 'buy' && type !== 'sell') {
        await connection.rollback();
        return res.status(400).json({ message: `Tipo de operación inválido: '${type}'` });
    }

    // Leer porcentaje de comisión desde settings (si existe) EARLY so server uses it
    // to compute the effective rate and final amounts (backend authoritative).
    let commissionPercent = 2.0; // default 2%
    try {
      const [settingRows] = await connection.query('SELECT value FROM settings WHERE key_name = ?', ['commission_percent']);
      if (settingRows && settingRows[0] && settingRows[0].value) {
        const parsed = parseFloat(settingRows[0].value);
        if (!isNaN(parsed)) commissionPercent = parsed;
      }
    } catch (e) {
      console.error('Error leyendo setting commission_percent, usando default 2%:', e && e.message ? e.message : e);
    }

    // 3. Determine what the branch needs to pay and check inventory
    //    'currency_to' is always what the branch pays out and what we must verify.
    const currencyToVerify = currency_to;
    const currencyToReceive = currency_from;

    // Prefer base_rate sent by client (the locked base rate). The server will
    // compute the effective rate using its commissionPercent to avoid trusting
    // a client-provided effective rate.
    const baseRateFromClient = req.body.base_rate !== undefined ? Number(req.body.base_rate) : null;
    if (baseRateFromClient !== null && (isNaN(baseRateFromClient) || baseRateFromClient <= 0)) {
      await connection.rollback();
      return res.status(400).json({ message: 'base_rate inválida en la solicitud.' });
    }

    // Compute server-effective rate using commissionPercent
    const cp = Number(commissionPercent) || 0;
    // If client provided base_rate, use it; otherwise fall back to exchange_rate logic
    let baseRate = null;
    if (baseRateFromClient !== null) {
      baseRate = baseRateFromClient;
    } else {
      // fallback: derive baseRate from provided exchange_rate and server cp
      const effectiveRateFromClient = Number(exchange_rate);
      if (isNaN(effectiveRateFromClient) || effectiveRateFromClient <= 0) {
        await connection.rollback();
        return res.status(400).json({ message: 'Exchange rate inválida en la solicitud.' });
      }
      if (cp === 0) baseRate = effectiveRateFromClient;
      else if (type === 'buy') baseRate = effectiveRateFromClient / (1 + cp / 100.0);
      else baseRate = effectiveRateFromClient / (1 - cp / 100.0);
    }

    if (!baseRate || isNaN(baseRate) || baseRate <= 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'No se pudo determinar la tasa base para la transacción.' });
    }

    // Now compute serverEffectiveRate using server commissionPercent
    const serverEffectiveRate = type === 'buy' ? Number((baseRate * (1 + cp / 100)).toFixed(6)) : Number((baseRate * (1 - cp / 100)).toFixed(6));

    // Compute server-side final amounts (rounded to 2 decimals):
    // - For 'buy': client requests USD (amount_to) -> server computes MXN to charge
    // - For 'sell': client delivers USD (amount_from) -> server computes MXN to pay
    let serverAmountFrom = 0; // MXN when buying, USD when selling (matches currency_from)
    let serverAmountTo = 0;   // USD when buying, MXN when selling (matches currency_to)

    if (type === 'buy') {
      const usdRequested = Number(amount_to);
      serverAmountTo = usdRequested;
      serverAmountFrom = Number((usdRequested * serverEffectiveRate).toFixed(2));
    } else {
      const usdDelivered = Number(amount_from);
      serverAmountFrom = usdDelivered;
      serverAmountTo = Number((usdDelivered * serverEffectiveRate).toFixed(2));
    }

    // Validate server computed amounts
    if (isNaN(serverAmountFrom) || isNaN(serverAmountTo) || serverAmountFrom <= 0 || serverAmountTo <= 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Los montos calculados de la transacción no son válidos.' });
    }

    // 4. Lock inventory row and check for sufficient funds
    const [inventoryRows] = await connection.query(
      'SELECT amount FROM inventory WHERE branch_id = ? AND currency = ? FOR UPDATE',
      [branch_id, currencyToVerify]
    );

    const availableAmount = inventoryRows[0]?.amount;

    // amountToVerify in payload may be tampered; use serverAmountTo which is what
    // the branch actually needs to pay out.
    if (!availableAmount || availableAmount < serverAmountTo) {
      await connection.rollback();
      return res.status(409).json({ // 409 Conflict is a good status code here
        message: `Lo sentimos. La sucursal seleccionada no cuenta con fondos suficientes (${currencyToVerify}) para esta operación. Por favor, intenta un monto menor o selecciona una sucursal diferente.`
      });
    }

  // 5. Update inventory: decrease what branch pays (reserve funds).
  // No sumar aún lo que la sucursal recibirá: eso se debe hacer al confirmar
  // la transacción. Calcularemos la comisión en MXN como la diferencia entre
  // el monto cobrado y lo que correspondería al valor según la tasa base.
    let commissionAmount = 0;
    try {
      // baseRate ya está disponible y serverEffectiveRate también
      if (type === 'buy') {
        // Cliente paga MXN (serverAmountFrom) y recibe USD (serverAmountTo)
        commissionAmount = Number((serverAmountFrom - (serverAmountTo * baseRate)).toFixed(2));
      } else {
        commissionAmount = Number(((serverAmountFrom * baseRate) - serverAmountTo).toFixed(2));
      }
      if (isNaN(commissionAmount) || commissionAmount < 0) commissionAmount = 0;
    } catch (e) {
      console.warn('Error calculando comisión a partir de la tasa y porcentaje, usando fallback:', e && e.message ? e.message : e);
      commissionAmount = 0;
    }

    // Ajustes de inventario:
    // - La sucursal entrega amountToVerify en currencyToVerify (se descuenta)
    // - La sucursal recibe amountToReceive en currencyToReceive (se suma)
    // NOTA: la comisión ya está integrada en la tasa enviada por el frontend, así que
    // no la restamos de lo que la sucursal recibe. La comisión se registra en la transacción.
    // Only decrease the inventory for the currency the branch will pay out
    await connection.query(
      'UPDATE inventory SET amount = amount - ? WHERE branch_id = ? AND currency = ?',
      [serverAmountTo, branch_id, currencyToVerify]
    );
    // NOTE: do NOT increase the receiving currency here. The increase should
    // happen when the transaction is confirmed (so the branch actually
    // receives the funds). This prevents artificially inflating available
    // inventory during the reserved state.

    // 6. Create the transaction record
    const code = generateTransactionCode();
    const [result] = await connection.query(
      'INSERT INTO transactions (user_id, branch_id, type, amount_from, currency_from, amount_to, currency_to, exchange_rate, commission_percent, commission_amount, method, status, transaction_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      // Usar 'reserved' como estado inicial: la transacción se reserva primero antes de procesar el pago.
      [userId, branch_id, type, serverAmountFrom, currency_from, serverAmountTo, currency_to, serverEffectiveRate, commissionPercent, commissionAmount, method || null, 'reserved', code]
    );
    const newTransactionId = result.insertId;

    // 6.b Insertar reserva de inventario (registro separado para poder liberar/confirmar)
    try {
      // amountToVerify es lo que la sucursal entrega (se descuenta del inventario)
      await connection.query(
        'INSERT INTO inventory_reservations (transaction_id, branch_id, currency, amount_reserved, status) VALUES (?, ?, ?, ?, ?) ',
        // Use serverAmountTo: la cantidad que la sucursal apartó para entregar
        [newTransactionId, branch_id, currencyToVerify, serverAmountTo, 'reserved']
      );
    } catch (resErr) {
      console.warn('No se pudo crear inventory_reservation:', resErr && resErr.message ? resErr.message : resErr);
      // No revertimos la operación por ahora; la reserva es útil pero no crítica en caso de fallo menor
    }

    // 7. Commit the database transaction
    await connection.commit();

    // 8. Fetch the complete transaction data to return to the client
    const [rowsTx] = await pool.query(
      `SELECT t.id, t.transaction_code, t.status, t.type, t.amount_from, t.currency_from, t.amount_to, t.currency_to, t.exchange_rate, t.method, b.name as branch_name, t.created_at
       FROM transactions t
       JOIN branches b ON t.branch_id = b.id
       WHERE t.id = ?`,
      [newTransactionId]
    );

    // Emitir evento de sockets para notificar a clientes en tiempo real
    try {
      // Intentar consultar inventario actualizado para la sucursal y monedas afectadas
      const [invRowsAfter] = await pool.query('SELECT currency, amount, low_stock_threshold FROM inventory WHERE branch_id = ? AND currency IN (?, ?) LIMIT 2', [branch_id, currencyToVerify, currencyToReceive]);
      const inventorySnapshot = {};
      if (invRowsAfter && invRowsAfter.length) {
        invRowsAfter.forEach(r => { inventorySnapshot[r.currency] = { amount: Number(r.amount), low_stock_threshold: r.low_stock_threshold ? Number(r.low_stock_threshold) : null }; });
      }

      const socketPayload = {
        transaction: rowsTx[0],
        inventory: inventorySnapshot,
        branch_id: branch_id,
        timestamp: new Date().toISOString()
      };

      // global.io se expone desde server.js; verificar existencia
      if (global && global.io && typeof global.io.emit === 'function') {
        try {
          global.io.emit('inventory.updated', socketPayload);
          
          // Notificación para admins: nueva operación reservada
          const tx = rowsTx[0];
          try {
            await pool.query(
              'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
              ['admin', null, null, 'Nueva operación reservada', `Código ${tx.transaction_code} en sucursal ${tx.branch_name}`, 'transaction_reserved', tx.id]
            );
          } catch (insErr) {
            console.warn('No se pudo guardar notificación admin:', insErr && insErr.message ? insErr.message : insErr);
          }
          
          // Emitir a sala de admins
          try {
            global.io.to('admins').emit('notification', {
              title: 'Nueva operación reservada',
              message: `Código ${tx.transaction_code} en sucursal ${tx.branch_name}`,
              event_type: 'transaction_reserved',
              transaction_id: tx.id,
              branch_id: branch_id,
              created_at: new Date().toISOString()
            });
          } catch (emitNoteErr) {
            console.warn('No se pudo emitir notificación a admins:', emitNoteErr && emitNoteErr.message ? emitNoteErr.message : emitNoteErr);
          }

          // Notificación para usuarios de sucursal: nueva operación en su sucursal
          try {
            await pool.query(
              'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
              ['sucursal', null, branch_id, 'Nueva operación en tu sucursal', `Operación ${tx.transaction_code}: ${tx.type === 'buy' ? 'Compra' : 'Venta'} de ${tx.amount_to} ${tx.currency_to}`, 'transaction_reserved', tx.id]
            );
          } catch (insSucErr) {
            console.warn('No se pudo guardar notificación sucursal:', insSucErr && insSucErr.message ? insSucErr.message : insSucErr);
          }
          
          // Emitir a sala de la sucursal
          try {
            global.io.to(`branch:${branch_id}`).emit('notification', {
              title: 'Nueva operación en tu sucursal',
              message: `Operación ${tx.transaction_code}: ${tx.type === 'buy' ? 'Compra' : 'Venta'} de ${tx.amount_to} ${tx.currency_to}`,
              event_type: 'transaction_reserved',
              transaction_id: tx.id,
              branch_id: branch_id,
              created_at: new Date().toISOString()
            });
          } catch (emitBranchErr) {
            console.warn('No se pudo emitir notificación a sucursal:', emitBranchErr && emitBranchErr.message ? emitBranchErr.message : emitBranchErr);
          }

          // Notificación para el usuario: reserva creada
          const operationType = tx.type === 'buy' ? 'COMPRA' : 'VENTA';
          const amount = tx.type === 'buy' ? tx.amount_to : tx.amount_from;
          const currency = tx.type === 'buy' ? tx.currency_to : tx.currency_from;
          const branchName = tx.branch_name || `Sucursal ${branch_id}`;
          
          const userNotifTitle = `Operación de ${operationType} reservada`;
          const userNotifMessage = `Tu operación de ${operationType} de $${Number(amount).toFixed(2)} ${currency} con código ${tx.transaction_code} fue creada correctamente en ${branchName}.`;
          
          try {
            await pool.query(
              'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
              ['user', userId, null, userNotifTitle, userNotifMessage, 'transaction_created', tx.id]
            );
          } catch (insUserErr) {
            console.warn('No se pudo guardar notificación de usuario:', insUserErr && insUserErr.message ? insUserErr.message : insUserErr);
          }
          
          try {
            global.io.to(`user:${userId}`).emit('notification', {
              title: userNotifTitle,
              message: userNotifMessage,
              event_type: 'transaction_created',
              transaction_id: tx.id,
              created_at: new Date().toISOString()
            });
          } catch (emitUserErr) {
            console.warn('No se pudo emitir notificación a usuario:', emitUserErr && emitUserErr.message ? emitUserErr.message : emitUserErr);
          }
          
          console.log('Emitted inventory.updated via sockets for branch', branch_id);
        } catch (emitErr) {
          console.warn('No se pudo emitir evento socket inventory.updated:', emitErr && emitErr.message ? emitErr.message : emitErr);
        }
      } else {
        // No bloquear el flujo si no hay sockets
        console.warn('Socket.IO no está inicializado (global.io no disponible). Se omitió la emisión de inventory.updated.');
      }
    } catch (socketQueryErr) {
      console.warn('Error preparando payload para evento inventory.updated:', socketQueryErr && socketQueryErr.message ? socketQueryErr.message : socketQueryErr);
    }

    res.status(201).json({ transaction: rowsTx[0] });

  } catch (error) {
    if (connection) await connection.rollback(); // Rollback on any error
    next(error); // Pass to global error handler
  } finally {
    if (connection) connection.release(); // Release connection back to the pool
  }
};

const listUserTransactions = async (req, res, next) => {
  try {
    const userId = req.user && req.user.id ? req.user.id : null;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const [rows] = await pool.query(
      `SELECT t.*, b.name as branch FROM transactions t LEFT JOIN branches b ON t.branch_id = b.id WHERE t.user_id = ? ORDER BY t.created_at DESC LIMIT 100`,
      [userId]
    );
    return res.json({ transactions: rows });
  } catch (err) {
    next(err);
  }
};

module.exports = { createTransaction, listUserTransactions };
