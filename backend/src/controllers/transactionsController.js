const pool = require('../config/db');
const emailService = require('../services/emailService');
const { roundMXN, roundUSD, calculateEffectiveRate, calculateAmountsWithCommission, isValidNumber } = require('../utils/precisionHelper');
const crypto = require('crypto');

// Genera un código único corto para la transacción
// Usa timestamp + random para evitar colisiones en requests simultáneos
function generateTransactionCode() {
  const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return 'MX' + timestamp + random;
}

const createTransaction = async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized. User not found in token.' });
    }

    // ========================================================================
    // NUEVO PAYLOAD SIMPLIFICADO (Backend Authoritative)
    // El frontend solo envía: branch_id, type, usd_amount, method
    // El backend calcula TODO lo demás usando settings de la DB
    // ========================================================================
    const { branch_id, type, usd_amount, method } = req.body;

    // 1. Validar inputs mínimos
    if (!branch_id) {
      return res.status(400).json({ message: 'branch_id es requerido.' });
    }

    // Validar que branch_id sea un número entero positivo (previene SQL injection)
    const branchIdNum = parseInt(branch_id, 10);
    if (isNaN(branchIdNum) || branchIdNum <= 0 || branchIdNum.toString() !== branch_id.toString()) {
      return res.status(400).json({ message: 'branch_id debe ser un número entero válido.' });
    }

    if (!type || (type !== 'buy' && type !== 'sell')) {
      return res.status(400).json({ message: 'Tipo de operación inválido. Debe ser "buy" o "sell".' });
    }

    const usdAmt = Number(usd_amount);
    if (isNaN(usdAmt) || usdAmt <= 0 || !isFinite(usdAmt)) {
      return res.status(400).json({ message: 'usd_amount debe ser un número positivo válido.' });
    }

    // Límites de operación
    const MIN_USD = 1;
    const MAX_USD = 50000;
    if (usdAmt < MIN_USD || usdAmt > MAX_USD) {
      return res.status(400).json({ 
        message: `Monto fuera de rango. Mínimo: $${MIN_USD} USD, Máximo: $${MAX_USD} USD.` 
      });
    }

    // 2. Iniciar transacción de base de datos
    await connection.beginTransaction();

    // 3. Obtener TODAS las configuraciones desde la DB (única fuente de verdad)
    const [settingsRows] = await connection.query(
      'SELECT key_name, value FROM settings WHERE key_name IN (?, ?, ?)',
      ['rate_buy', 'rate_sell', 'commission_percent']
    );

    const settings = {};
    settingsRows.forEach(row => {
      settings[row.key_name] = Number(row.value);
    });

    const rateBuy = settings['rate_buy'] || 17.8;
    const rateSell = settings['rate_sell'] || 18.2;
    const commissionPercent = settings['commission_percent'] || 2.0;

    // 4. Determinar tasa base según tipo de operación
    // - buy: Cliente COMPRA USD → usa tasa de VENTA de la sucursal (rateSell)
    // - sell: Cliente VENDE USD → usa tasa de COMPRA de la sucursal (rateBuy)
    const baseRate = type === 'buy' ? rateSell : rateBuy;

    // 5. Calcular tasa efectiva con comisión
    const effectiveRate = calculateEffectiveRate(baseRate, commissionPercent, type);

    // 6. Calcular montos usando función unificada (evita errores de redondeo)
    const { mxnAmount, commission: commissionMXN } = calculateAmountsWithCommission(
      usdAmt, baseRate, effectiveRate, type
    );
    
    let serverAmountFrom, serverAmountTo;
    let currencyFrom, currencyTo;

    if (type === 'buy') {
      // Cliente COMPRA USD: paga MXN, recibe USD
      serverAmountFrom = mxnAmount;      // MXN que paga el cliente
      serverAmountTo = roundUSD(usdAmt); // USD que recibe el cliente
      currencyFrom = 'MXN';
      currencyTo = 'USD';
    } else {
      // Cliente VENDE USD: entrega USD, recibe MXN
      serverAmountFrom = roundUSD(usdAmt); // USD que entrega el cliente
      serverAmountTo = mxnAmount;          // MXN que recibe el cliente
      currencyFrom = 'USD';
      currencyTo = 'MXN';
    }

    // La comisión ya viene validada >= 0 desde calculateAmountsWithCommission

    // Validar montos calculados
    if (serverAmountFrom <= 0 || serverAmountTo <= 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Los montos calculados no son válidos.' });
    }

    // 7. Determinar qué verificar en inventario
    // La sucursal ENTREGA lo que el cliente RECIBE (currency_to)
    // La sucursal RECIBE lo que el cliente ENTREGA (currency_from)
    const currencyToVerify = currencyTo;    // Lo que entrega la sucursal
    const currencyToReceive = currencyFrom; // Lo que recibe la sucursal
    const amountToVerify = serverAmountTo;

    // 8. BLOQUEO ATÓMICO: Usar una sola query con JOIN para bloquear inventory Y calcular reservas
    // Esto previene race conditions al obtener ambos valores en una operación atómica
    const [inventoryWithReservations] = await connection.query(
      `SELECT 
         i.amount as total_inventory,
         COALESCE((
           SELECT SUM(ir.amount_reserved) 
           FROM inventory_reservations ir 
           WHERE ir.branch_id = i.branch_id 
             AND ir.currency = i.currency 
             AND ir.status = 'reserved'
         ), 0) as total_reserved
       FROM inventory i
       WHERE i.branch_id = ? AND i.currency = ?
       FOR UPDATE`,
      [branchIdNum, currencyToVerify]
    );

    if (!inventoryWithReservations || !inventoryWithReservations.length) {
      await connection.rollback();
      return res.status(409).json({
        message: `Lo sentimos. La sucursal seleccionada no tiene inventario configurado para ${currencyToVerify}.`
      });
    }

    const totalInventoryAmount = Number(inventoryWithReservations[0].total_inventory);
    const totalReservedAmount = Number(inventoryWithReservations[0].total_reserved);
    const actuallyAvailableAmount = totalInventoryAmount - totalReservedAmount;

    console.log(`[INVENTORY CHECK] Sucursal ${branchIdNum}, ${currencyToVerify}:`, {
      total: totalInventoryAmount,
      reserved: totalReservedAmount,
      available: actuallyAvailableAmount,
      requested: serverAmountTo
    });

    // amountToVerify in payload may be tampered; use serverAmountTo which is what
    // the branch actually needs to pay out.
    if (actuallyAvailableAmount < serverAmountTo) {
      await connection.rollback();
      return res.status(409).json({
        message: `Lo sentimos. La sucursal seleccionada no cuenta con fondos suficientes (${currencyToVerify}) para esta operación. Disponible: $${actuallyAvailableAmount.toFixed(2)}, Solicitado: $${serverAmountTo.toFixed(2)}. Por favor, intenta un monto menor o selecciona una sucursal diferente.`
      });
    }

    // 9. La comisión ya fue calculada arriba (commissionMXN)
    // Usarla directamente en lugar de recalcular
    const commissionAmount = commissionMXN;

    // IMPORTANTE: NO se descuenta el inventario aquí.
    // Solo se crea la reserva en inventory_reservations.
    // El descuento y acreditación real se harán cuando se confirme el pago.
    // Esto evita el doble descuento y mantiene el inventario consistente.

    // 5.b Calcular fecha de expiración para la transacción
    let expiresAt = null;
    try {
      // Obtener tiempo de expiración desde settings (en horas)
      const [expirySettings] = await connection.query(
        'SELECT value FROM settings WHERE key_name = ?',
        ['reservation_expiry_hours']
      );
      
      const expiryHours = expirySettings && expirySettings[0] && expirySettings[0].value 
        ? parseInt(expirySettings[0].value) 
        : 24; // Default 24 horas
      
      // Calcular fecha de expiración
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + expiryHours);
      
      console.log(`[EXPIRATION] Transacción expirará en ${expiryHours} horas: ${expiresAt.toISOString()}`);
    } catch (expiryErr) {
      console.warn('Error obteniendo configuración de expiración, usando default 24h:', expiryErr && expiryErr.message ? expiryErr.message : expiryErr);
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
    }

    // 10. Create the transaction record
    const code = generateTransactionCode();
    const [result] = await connection.query(
      'INSERT INTO transactions (user_id, branch_id, type, amount_from, currency_from, amount_to, currency_to, exchange_rate, commission_percent, commission_amount, method, status, transaction_code, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      // Usar 'reserved' como estado inicial: la transacción se reserva primero antes de procesar el pago.
      [userId, branchIdNum, type, serverAmountFrom, currencyFrom, serverAmountTo, currencyTo, effectiveRate, commissionPercent, commissionAmount, method || null, 'reserved', code, expiresAt]
    );
    const newTransactionId = result.insertId;

    // 6.b Insertar reserva de inventario (OBLIGATORIO - sin reserva no hay transacción)
    // Calcular expiración de la reserva (misma que la transacción)
    const reservationExpiresAt = expiresAt;
    
    // amountToVerify es lo que la sucursal entrega (se descuenta del inventario)
    // CRÍTICO: Si esto falla, la transacción DEBE revertirse para evitar sobreventa
    await connection.query(
      'INSERT INTO inventory_reservations (transaction_id, branch_id, currency, amount_reserved, status, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      // Use serverAmountTo: la cantidad que la sucursal apartó para entregar
      [newTransactionId, branchIdNum, currencyToVerify, serverAmountTo, 'reserved', reservationExpiresAt]
    );

    // 7. Commit the database transaction
    await connection.commit();

    // Liberar la conexión INMEDIATAMENTE después del commit para evitar bloqueos
    connection.release();

    // 8. Fetch the complete transaction data to return to the client
    const [rowsTx] = await pool.query(
      `SELECT t.id, t.transaction_code, t.status, t.type, t.amount_from, t.currency_from, t.amount_to, t.currency_to, t.exchange_rate, t.method, t.branch_id, b.name as branch_name, t.created_at
       FROM transactions t
       JOIN branches b ON t.branch_id = b.id
       WHERE t.id = ?`,
      [newTransactionId]
    );

    // Emitir evento de sockets para notificar a clientes en tiempo real
    try {
      // Intentar consultar inventario actualizado para la sucursal y monedas afectadas
      const [invRowsAfter] = await pool.query('SELECT currency, amount, low_stock_threshold FROM inventory WHERE branch_id = ? AND currency IN (?, ?) LIMIT 2', [branchIdNum, currencyToVerify, currencyToReceive]);
      const inventorySnapshot = {};
      if (invRowsAfter && invRowsAfter.length) {
        invRowsAfter.forEach(r => { inventorySnapshot[r.currency] = { amount: Number(r.amount), low_stock_threshold: r.low_stock_threshold ? Number(r.low_stock_threshold) : null }; });
      }

      const socketPayload = {
        transaction: rowsTx[0],
        inventory: inventorySnapshot,
        branch_id: branchIdNum,
        timestamp: new Date().toISOString()
      };

      // global.io se expone desde server.js; verificar existencia
      if (global && global.io && typeof global.io.emit === 'function') {
        try {
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
              branch_id: branchIdNum,
              created_at: new Date().toISOString()
            });
          } catch (emitNoteErr) {
            console.warn('No se pudo emitir notificación a admins:', emitNoteErr && emitNoteErr.message ? emitNoteErr.message : emitNoteErr);
          }

          // Notificación para usuarios de sucursal: nueva operación en su sucursal
          try {
            await pool.query(
              'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
              ['sucursal', null, branchIdNum, 'Nueva operación en tu sucursal', `Operación ${tx.transaction_code}: ${tx.type === 'buy' ? 'Compra' : 'Venta'} de ${tx.amount_to} ${tx.currency_to}`, 'transaction_reserved', tx.id]
            );
          } catch (insSucErr) {
            console.warn('No se pudo guardar notificación sucursal:', insSucErr && insSucErr.message ? insSucErr.message : insSucErr);
          }
          
          // Emitir a sala de la sucursal
          try {
            global.io.to(`branch:${branchIdNum}`).emit('notification', {
              title: 'Nueva operación en tu sucursal',
              message: `Operación ${tx.transaction_code}: ${tx.type === 'buy' ? 'Compra' : 'Venta'} de ${tx.amount_to} ${tx.currency_to}`,
              event_type: 'transaction_reserved',
              transaction_id: tx.id,
              branch_id: branchIdNum,
              created_at: new Date().toISOString()
            });
          } catch (emitBranchErr) {
            console.warn('No se pudo emitir notificación a sucursal:', emitBranchErr && emitBranchErr.message ? emitBranchErr.message : emitBranchErr);
          }
          
          // Emitir evento de inventario actualizado (sin datos de transacción para evitar duplicados)
          global.io.emit('inventory.updated', socketPayload);

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
          
          // Enviar email al usuario
          try {
            const [userRows] = await pool.query('SELECT email, name FROM users WHERE idUser = ?', [userId]);
            if (userRows && userRows[0] && userRows[0].email) {
              await emailService.sendTransactionCreatedEmail(userRows[0].email, tx);
              
              // Enviar notificación a admins y sucursal
              const userName = userRows[0].name || userRows[0].email;
              await emailService.sendAdminAndBranchNotification(tx, userName);
            }
          } catch (emailErr) {
            console.warn('No se pudo enviar email al usuario:', emailErr && emailErr.message ? emailErr.message : emailErr);
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
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error('Error al hacer rollback:', rollbackErr);
      }
    }
    
    // Manejar errores específicos de MySQL
    if (error.code === 'ER_DUP_ENTRY') {
      // Código de transacción duplicado - muy raro pero posible
      if (error.message && error.message.includes('transaction_code')) {
        console.error('Colisión de código de transacción detectada, reintentando...', error.message);
        return res.status(409).json({ 
          message: 'Error temporal al generar la operación. Por favor, intenta de nuevo.',
          code: 'TRANSACTION_CODE_COLLISION'
        });
      }
      // Reserva duplicada
      if (error.message && error.message.includes('inventory_reservations')) {
        console.error('Intento de reserva duplicada:', error.message);
        return res.status(409).json({ 
          message: 'Esta operación ya tiene una reserva activa.',
          code: 'DUPLICATE_RESERVATION'
        });
      }
    }
    
    // Error de deadlock - el cliente debe reintentar
    if (error.code === 'ER_LOCK_DEADLOCK') {
      console.error('Deadlock detectado en createTransaction:', error.message);
      return res.status(503).json({ 
        message: 'El sistema está procesando muchas solicitudes. Por favor, intenta de nuevo en unos segundos.',
        code: 'DEADLOCK_RETRY'
      });
    }
    
    // Lock wait timeout
    if (error.code === 'ER_LOCK_WAIT_TIMEOUT') {
      console.error('Lock timeout en createTransaction:', error.message);
      return res.status(503).json({ 
        message: 'El sistema está ocupado. Por favor, intenta de nuevo.',
        code: 'LOCK_TIMEOUT'
      });
    }
    
    next(error); // Pass to global error handler
  } finally {
    if (connection && connection.connection && connection.connection._fatalError === undefined) {
      try {
        connection.release(); // Release connection back to the pool
      } catch (releaseErr) {
        console.error('Error al liberar conexión:', releaseErr);
      }
    }
  }
};

const listUserTransactions = async (req, res, next) => {
  try {
    const userId = req.user && req.user.id ? req.user.id : null;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const [rows] = await pool.query(
      `SELECT t.*, b.name as branch, b.address as branch_address, b.city as branch_city, b.state as branch_state FROM transactions t LEFT JOIN branches b ON t.branch_id = b.id WHERE t.user_id = ? ORDER BY t.created_at DESC LIMIT 100`,
      [userId]
    );
    return res.json({ transactions: rows });
  } catch (err) {
    next(err);
  }
};

module.exports = { createTransaction, listUserTransactions };
