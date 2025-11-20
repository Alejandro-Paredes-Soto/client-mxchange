const pool = require('../config/db');
const emailService = require('../services/emailService');

const getInventory = async (req, res, next) => {
  try {
    // Filtrar por sucursal si el usuario es de tipo 'sucursal'
    let query = `
      SELECT i.id, i.branch_id, b.name as branch_name, i.currency, i.amount, i.low_stock_threshold, i.last_updated,
             COALESCE(
               (SELECT SUM(amount_reserved) 
                FROM inventory_reservations 
                WHERE branch_id = i.branch_id 
                  AND currency = i.currency 
                  AND status = 'reserved'),
               0
             ) as reserved_amount,
             CASE 
               WHEN (i.amount - COALESCE(
                 (SELECT SUM(amount_reserved) 
                  FROM inventory_reservations 
                  WHERE branch_id = i.branch_id 
                    AND currency = i.currency 
                    AND status = 'reserved'),
                 0
               )) > i.low_stock_threshold THEN 'normal'
               WHEN (i.amount - COALESCE(
                 (SELECT SUM(amount_reserved) 
                  FROM inventory_reservations 
                  WHERE branch_id = i.branch_id 
                    AND currency = i.currency 
                    AND status = 'reserved'),
                 0
               )) > i.low_stock_threshold * 0.5 THEN 'low'
               ELSE 'critical'
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
    
    // Get old amount and current inventory info
    const [oldRows] = await pool.query(
      'SELECT i.amount, i.low_stock_threshold, i.branch_id, i.currency, b.name as branch_name FROM inventory i JOIN branches b ON i.branch_id = b.id WHERE i.id = ?', 
      [id]
    );
    
    if (!oldRows || oldRows.length === 0) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }
    
    const oldAmount = oldRows[0]?.amount || 0;
    const currentThreshold = oldRows[0]?.low_stock_threshold || 1000;
    const branchId = oldRows[0]?.branch_id;
    const currency = oldRows[0]?.currency;
    const branchName = oldRows[0]?.branch_name;
    const adjustmentType = amount > oldAmount ? 'entry' : 'exit';
    
    // Usar el nuevo threshold si se proporciona, sino mantener el actual
    const finalThreshold = low_stock_threshold != null ? low_stock_threshold : currentThreshold;
    
    // Update inventory
    await pool.query('UPDATE inventory SET amount = ?, low_stock_threshold = ? WHERE id = ?', [amount, finalThreshold, id]);
    
    // Insert history
    await pool.query(
      'INSERT INTO inventory_adjustments (inventory_id, old_amount, new_amount, adjustment_type, reason, adjusted_by) VALUES (?, ?, ?, ?, ?, ?)', 
      [id, oldAmount, amount, adjustmentType, reason || '', adjusted_by || null]
    );
    
    // Verificar si el inventario está bajo o crítico
    const wasLow = oldAmount <= currentThreshold;
    const isNowLow = amount <= finalThreshold;
    const isNowCritical = amount <= finalThreshold * 0.5;
    
    // Solo enviar alerta si ahora está bajo/crítico y antes no lo estaba, o si se vuelve crítico
    if ((isNowLow && !wasLow) || (isNowCritical && amount < oldAmount)) {
      const alertLevel = isNowCritical ? 'CRÍTICO' : 'BAJO';
      const alertTitle = `Inventario ${alertLevel}: ${currency}`;
      const alertMessage = `La sucursal ${branchName} tiene inventario ${alertLevel.toLowerCase()} de ${currency}. Disponible: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: currency }).format(amount)} (Umbral: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: currency }).format(finalThreshold)})`;
      
      try {
        // Notificación para admins
        await pool.query(
          'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
          ['admin', null, branchId, alertTitle, alertMessage, 'low_inventory', null]
        );
        
        // Notificación para usuarios de sucursal
        await pool.query(
          'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
          ['sucursal', null, branchId, alertTitle, alertMessage, 'low_inventory', null]
        );
        
        // Emitir notificación en tiempo real
        if (global.io) {
          // A admins
          global.io.to('admins').emit('notification', {
            title: alertTitle,
            message: alertMessage,
            event_type: 'low_inventory',
            branch_id: branchId,
            currency: currency,
            amount: amount,
            threshold: finalThreshold,
            created_at: new Date().toISOString()
          });
          
          // A usuarios de la sucursal
          global.io.to(`branch:${branchId}`).emit('notification', {
            title: alertTitle,
            message: alertMessage,
            event_type: 'low_inventory',
            branch_id: branchId,
            currency: currency,
            amount: amount,
            threshold: finalThreshold,
            created_at: new Date().toISOString()
          });
        }
      } catch (notifErr) {
        console.warn('Error enviando notificación de inventario bajo:', notifErr);
      }
    }
    
    // Emitir actualización en tiempo real del inventario
    if (global.io) {
      global.io.emit('inventoryUpdated');
      
      // Emitir actualización detallada con el nuevo estado
      const [updatedRows] = await pool.query(
        'SELECT currency, amount, low_stock_threshold FROM inventory WHERE branch_id = ?',
        [branchId]
      );
      
      const inventorySnapshot = {};
      if (updatedRows && updatedRows.length) {
        updatedRows.forEach(r => {
          inventorySnapshot[r.currency] = {
            amount: Number(r.amount),
            low_stock_threshold: r.low_stock_threshold ? Number(r.low_stock_threshold) : null
          };
        });
      }
      
      global.io.emit('inventory.updated', {
        branch_id: branchId,
        inventory: inventorySnapshot,
        timestamp: new Date().toISOString()
      });
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
    console.log(`🔄 Cambiando estado de transacción ${id} a: ${status}`);

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
                // IMPORTANTE: Solo marcar la reserva como liberada
                // NO devolver al inventario porque nunca se descontó
                await connection.query('UPDATE inventory_reservations SET status = ?, released_at = NOW() WHERE id = ?', ['released', r.id]);

                // Registrar en inventory_adjustments solo para auditoría (sin cambio de monto)
                try {
                  const [invRows] = await connection.query(
                    'SELECT id FROM inventory WHERE branch_id = ? AND currency = ? LIMIT 1',
                    [r.branch_id, r.currency]
                  );
                  if (invRows && invRows[0]) {
                    await connection.query(
                      'INSERT INTO inventory_adjustments (inventory_id, old_amount, new_amount, adjustment_type, reason, adjusted_by) VALUES (?, ?, ?, ?, ?, ?)',
                      [invRows[0].id, null, null, 'exit', `Reserva de ${r.amount_reserved} ${r.currency} liberada para transacción ${id} (${status})`, req.user?.id || null]
                    );
                  }
                } catch (adjErr) {
                  console.warn('Error registrando adjustment de reserva liberada:', adjErr && adjErr.message ? adjErr.message : adjErr);
                }

                console.log(`✓ Reserva liberada: ${r.amount_reserved} ${r.currency} para transacción ${id}`);
              } catch (inner) {
                console.warn('Error liberando reserva:', inner && inner.message ? inner.message : inner);
              }
            }
          }
        } catch (qErr) {
          console.warn('Error buscando inventory_reservations para cancelar:', qErr && qErr.message ? qErr.message : qErr);
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

          // Enviar email al usuario
          try {
            const [userRows] = await connection.query('SELECT email FROM users WHERE idUser = ?', [tx.user_id]);
            if (userRows && userRows[0] && userRows[0].email) {
              await emailService.sendTransactionCancelledEmail(userRows[0].email, { transaction_code: tx.transaction_code, status });
            }
          } catch (emailErr) {
            console.warn('No se pudo enviar email al usuario:', emailErr && emailErr.message ? emailErr.message : emailErr);
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

      // LÓGICA CORREGIDA: Separar el flujo de PAID y COMPLETED

      // Si se marca como PAID: solo confirmar el pago, NO tocar inventario
      if (status === 'paid') {
        try {
          // Obtener datos de la transacción para auditoría
          const [txFullRows] = await connection.query(
            'SELECT id, branch_id, currency_to FROM transactions WHERE id = ?',
            [id]
          );
          const txFull = txFullRows && txFullRows[0] ? txFullRows[0] : null;

          if (txFull) {
            // Solo registrar en inventory_adjustments para auditoría (sin cambio de monto)
            const [invRowsTo] = await connection.query(
              'SELECT id FROM inventory WHERE branch_id = ? AND currency = ? LIMIT 1',
              [txFull.branch_id, txFull.currency_to]
            );
            const inventoryIdTo = invRowsTo && invRowsTo[0] ? invRowsTo[0].id : null;

            if (inventoryIdTo) {
              try {
                await connection.query(
                  'INSERT INTO inventory_adjustments (inventory_id, old_amount, new_amount, adjustment_type, reason, adjusted_by) VALUES (?, ?, ?, ?, ?, ?)',
                  [inventoryIdTo, null, null, 'exit', `Pago confirmado para transacción ${txFull.id} - pendiente de completar`, req.user?.id || null]
                );
              } catch (adjErr) {
                console.warn('Error registrando adjustment de pago confirmado:', adjErr && adjErr.message ? adjErr.message : adjErr);
              }
            }

            console.log(`✓ Transacción ${id} marcada como PAID. Inventario NO modificado (se ajustará al completar).`);
          }
        } catch (paidErr) {
          console.warn('Error registrando confirmación de pago:', paidErr && paidErr.message ? paidErr.message : paidErr);
        }

        // Notificar al cliente sobre pago confirmado
        if (tx && tx.user_id) {
          try {
            await connection.query(
              'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
              ['user', tx.user_id, null, 'Pago confirmado', `Tu pago para la operación ${tx.transaction_code} ha sido confirmado exitosamente.`, 'transaction_paid', tx.id]
            );
          } catch (insErr) {
            console.warn('No se pudo guardar notificación de usuario:', insErr && insErr.message ? insErr.message : insErr);
          }

          // Enviar email al usuario
          try {
            const [userRows] = await connection.query('SELECT email FROM users WHERE idUser = ?', [tx.user_id]);
            if (userRows && userRows[0] && userRows[0].email) {
              await emailService.sendPaymentConfirmedEmail(userRows[0].email, { transaction_code: tx.transaction_code });
            }
          } catch (emailErr) {
            console.warn('No se pudo enviar email al usuario:', emailErr && emailErr.message ? emailErr.message : emailErr);
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
      }

      // Si se marca como COMPLETED: AQUÍ SÍ ajustar el inventario
      // IMPORTANTE: Solo ajustar inventario cuando se marca como 'completed', NO en estados intermedios

      if (status === 'completed') {
        console.log(`✓ Procesando ajuste de inventario para transacción ${id} con estado COMPLETED...`);
        try {
          // Primero verificar si el inventario ya fue ajustado para esta transacción
          const [reservationCheck] = await connection.query(
            'SELECT status FROM inventory_reservations WHERE transaction_id = ? LIMIT 1',
            [id]
          );

          console.log(`📋 Verificación de reserva para transacción ${id}:`, reservationCheck);

          const alreadyCommitted = reservationCheck && reservationCheck[0] && reservationCheck[0].status === 'committed';

          if (alreadyCommitted) {
            console.warn(`⚠️  Transacción ${id} ya tiene inventario ajustado (reserva committed). Se omite el ajuste.`);
            
            // Aún así, emitir evento de actualización para que el frontend se sincronice
            if (tx && tx.branch_id && global.io) {
              try {
                const [invUpdateRows] = await connection.query(
                  'SELECT currency, amount, low_stock_threshold FROM inventory WHERE branch_id = ? LIMIT 2',
                  [tx.branch_id]
                );
                const inventorySnapshot = {};
                if (invUpdateRows && invUpdateRows.length) {
                  invUpdateRows.forEach(r => { 
                    inventorySnapshot[r.currency] = { 
                      amount: Number(r.amount), 
                      low_stock_threshold: r.low_stock_threshold ? Number(r.low_stock_threshold) : null 
                    }; 
                  });
                }
                
                global.io.emit('inventory.updated', {
                  branch_id: tx.branch_id,
                  inventory: inventorySnapshot,
                  refresh: false,
                  timestamp: new Date().toISOString()
                });
                
                console.log('✓ Evento inventory.updated emitido (sin cambios) para sucursal', tx.branch_id);
              } catch (emitErr) {
                console.warn('Error emitiendo evento inventory.updated:', emitErr);
              }
            }
          } else {
            console.log(`✅ Transacción ${id} NO tiene ajuste previo. Procediendo con ajuste de inventario...`);

            // Obtener datos completos de la transacción
            const [txFullRows] = await connection.query(
              'SELECT id, branch_id, type, amount_from, currency_from, amount_to, currency_to FROM transactions WHERE id = ?',
              [id]
            );
            const txFull = txFullRows && txFullRows[0] ? txFullRows[0] : null;

            console.log(`📊 Datos de transacción ${id}:`, txFull);

            if (txFull) {
              // Obtener el inventory_id para registrar en inventory_adjustments
              const [invRowsFrom] = await connection.query(
                'SELECT id FROM inventory WHERE branch_id = ? AND currency = ? LIMIT 1',
                [txFull.branch_id, txFull.currency_from]
              );
              const [invRowsTo] = await connection.query(
                'SELECT id, amount FROM inventory WHERE branch_id = ? AND currency = ? LIMIT 1',
                [txFull.branch_id, txFull.currency_to]
              );

              const inventoryIdFrom = invRowsFrom && invRowsFrom[0] ? invRowsFrom[0].id : null;
              const inventoryIdTo = invRowsTo && invRowsTo[0] ? invRowsTo[0].id : null;
              const oldAmountTo = invRowsTo && invRowsTo[0] ? Number(invRowsTo[0].amount) : 0;

              // 1. DESCONTAR lo que la sucursal entrega (currency_to, amount_to)
              try {
                const [updateResult] = await connection.query(
                  'UPDATE inventory SET amount = amount - ? WHERE branch_id = ? AND currency = ?',
                  [txFull.amount_to, txFull.branch_id, txFull.currency_to]
                );

                if (updateResult.affectedRows === 0) {
                  console.error(`CRITICAL: No se pudo descontar ${txFull.amount_to} ${txFull.currency_to} de branch ${txFull.branch_id}`);
                } else {
                  // Registrar en inventory_adjustments
                  if (inventoryIdTo) {
                    try {
                      await connection.query(
                        'INSERT INTO inventory_adjustments (inventory_id, old_amount, new_amount, adjustment_type, reason, adjusted_by) VALUES (?, ?, ?, ?, ?, ?)',
                        [inventoryIdTo, oldAmountTo, oldAmountTo - txFull.amount_to, 'exit', `Entrega completada para transacción ${txFull.id}`, req.user?.id || null]
                      );
                    } catch (adjErr) {
                      console.warn('Error registrando adjustment de salida:', adjErr && adjErr.message ? adjErr.message : adjErr);
                    }
                  }
                  console.log(`✓ Descontado ${txFull.amount_to} ${txFull.currency_to} de sucursal ${txFull.branch_id}`);
                }
              } catch (deductErr) {
                console.error('Error descontando inventario al completar transacción:', deductErr && deductErr.message ? deductErr.message : deductErr);
              }

              // 2. ACREDITAR lo que la sucursal recibe (currency_from, amount_from)
              try {
                const [invBeforeCredit] = await connection.query(
                  'SELECT amount FROM inventory WHERE branch_id = ? AND currency = ? LIMIT 1',
                  [txFull.branch_id, txFull.currency_from]
                );
                const oldAmountFrom = invBeforeCredit && invBeforeCredit[0] ? Number(invBeforeCredit[0].amount) : 0;

                const [updateResult] = await connection.query(
                  'UPDATE inventory SET amount = amount + ? WHERE branch_id = ? AND currency = ?',
                  [txFull.amount_from, txFull.branch_id, txFull.currency_from]
                );

                if (updateResult.affectedRows === 0) {
                  console.error(`CRITICAL: No se pudo acreditar ${txFull.amount_from} ${txFull.currency_from} a branch ${txFull.branch_id}`);
                } else {
                  // Registrar en inventory_adjustments
                  if (inventoryIdFrom) {
                    try {
                      await connection.query(
                        'INSERT INTO inventory_adjustments (inventory_id, old_amount, new_amount, adjustment_type, reason, adjusted_by) VALUES (?, ?, ?, ?, ?, ?)',
                        [inventoryIdFrom, oldAmountFrom, oldAmountFrom + txFull.amount_from, 'entry', `Recepción completada de transacción ${txFull.id}`, req.user?.id || null]
                      );
                    } catch (adjErr) {
                      console.warn('Error registrando adjustment de entrada:', adjErr && adjErr.message ? adjErr.message : adjErr);
                    }
                  }
                  console.log(`✓ Acreditado ${txFull.amount_from} ${txFull.currency_from} a sucursal ${txFull.branch_id}`);
                }
              } catch (creditErr) {
                console.error('Error acreditando inventario al completar transacción:', creditErr && creditErr.message ? creditErr.message : creditErr);
              }

              // 3. Marcar reservas como committed
              try {
                const [updateResResult] = await connection.query(
                  'UPDATE inventory_reservations SET status = ?, committed_at = NOW() WHERE transaction_id = ? AND status = ?',
                  ['committed', id, 'reserved']
                );

                if (updateResResult.affectedRows === 0) {
                  console.warn(`No se encontraron reservas pendientes para transacción ${id}`);
                } else {
                  console.log(`✓ Reserva marcada como committed para transacción ${id}`);
                }
              } catch (commitErr) {
                console.warn('Error marcando inventory_reservations como committed:', commitErr && commitErr.message ? commitErr.message : commitErr);
              }
            } else {
              console.warn('Transacción no encontrada para completar:', id);
            }
          }
        } catch (cErr) {
          console.warn('Error procesando inventario al completar transacción:', cErr && cErr.message ? cErr.message : cErr);
        }

        // Notificar a la sucursal sobre operación completada
        if (tx && tx.branch_id) {
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

              // Emitir actualización de inventario para que el frontend se actualice
              const [invUpdateRows] = await connection.query(
                'SELECT currency, amount, low_stock_threshold FROM inventory WHERE branch_id = ? LIMIT 2',
                [tx.branch_id]
              );
              const inventorySnapshot = {};
              if (invUpdateRows && invUpdateRows.length) {
                invUpdateRows.forEach(r => {
                  inventorySnapshot[r.currency] = {
                    amount: Number(r.amount),
                    low_stock_threshold: r.low_stock_threshold ? Number(r.low_stock_threshold) : null
                  };
                });
              }

              global.io.emit('inventory.updated', {
                branch_id: tx.branch_id,
                inventory: inventorySnapshot,
                refresh: false,
                timestamp: new Date().toISOString()
              });

              console.log('✓ Evento inventory.updated emitido para sucursal', tx.branch_id);
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

          // Enviar email al usuario
          try {
            const [userRows] = await pool.query('SELECT email FROM users WHERE idUser = ?', [tx.user_id]);
            if (userRows && userRows[0] && userRows[0].email) {
              await emailService.sendTransactionReadyEmail(userRows[0].email, { ...tx, status });
            }
          } catch (emailErr) {
            console.warn('No se pudo enviar email al usuario:', emailErr && emailErr.message ? emailErr.message : emailErr);
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
