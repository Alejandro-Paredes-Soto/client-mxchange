const { customers, orders, tokens, configured } = require('../config/conekta');
const pool = require('../config/db');
const crypto = require('crypto');

// Contrato (resumido):
// createCardCharge(req.body) -> { success, charge }
// body: { amount, currency, description, card: { number, name, exp_month, exp_year, cvc }, customer: { name, email } }

const createCardCharge = async (req, res, next) => {
  // si no hay configuración, respondemos con instrucción para dev
  if (!configured) {
    return res.status(501).json({ message: 'Conekta no está configurado en este entorno. Instale y configure CONEKTA_API_KEY en .env. Mientras tanto, use modo simulado para pruebas.' });
  }

  try {
    const { amount, currency = 'MXN', description, card, customer } = req.body;
    let { transaction_code } = req.body || {};

    // Si no se envía transaction_code, generamos uno corto y único (tx- + 8 hex) para correlación
    if (!transaction_code) {
      try {
        const rnd = crypto.randomBytes(4).toString('hex');
        transaction_code = `tx-${rnd}`; // ejemplo: tx-1a2b3c4d (9+ chars)
      } catch (genErr) {
        transaction_code = `tx-${Date.now()}`;
      }
    }
    if (!amount || !card || !customer) {
      return res.status(400).json({ message: 'Faltan campos: amount, card, customer' });
    }

    // Validar que el frontend haya enviado token_id (el token debe provenir de Conekta JS)
    if (!card.token_id) {
      console.warn('Intento de pago sin token de tarjeta (card.token_id faltante) para cliente:', customer && customer.email ? customer.email : 'sin-email');
      return res.status(400).json({ message: 'card.token_id es requerido. Genere el token en el frontend usando Conekta JS.' });
    }

  // Conekta espera cantidad en centavos
  const amountInCents = Math.round(Number(amount) * 100);

  // respuesta acumulada que se irá llenando durante el flujo
  let resp = null;

    // Log seguro: registrar token_id recibido y metadatos mínimos para depuración
    try {
      console.log('Received payment request - token_id:', card.token_id, 'amount:', amountInCents, 'customer:', customer && customer.email ? customer.email : 'unknown');
    } catch (logErr) {
      // no bloquear por logging
    }

    console.log('Creando cargo en Conekta para cliente:', customer.email, 'monto:', amountInCents, currency);
    // Crear cliente en Conekta usando el SDK OpenAPI (CustomersApi)
    const customerPayload = {
      name: customer.name,
      email: customer.email,
      payment_sources: [
        {
          type: 'card',
          token_id: card.token_id // recomendado: generar token en frontend
        }
      ]
    };
    let conektaCustomerResp;
    let conektaCustomer;
    try {
      conektaCustomerResp = await customers.createCustomer(customerPayload);
      conektaCustomer = conektaCustomerResp && conektaCustomerResp.data ? conektaCustomerResp.data : conektaCustomerResp;
      console.log('Conekta customer created:', conektaCustomer && conektaCustomer.id ? conektaCustomer.id : conektaCustomer);
    } catch (custErr) {
      // Mostrar info detallada si viene en la respuesta del SDK
      const sdkInfo = custErr && custErr.response && custErr.response.data ? custErr.response.data : (custErr && custErr.message ? custErr.message : custErr);
      console.error('Error creando customer en Conekta:', sdkInfo);
      return res.status(422).json({ message: 'Error creando customer en Conekta', details: sdkInfo });
    }

    // Crear orden / charge usando OrdersApi
    // Extraer payment_source id: preferir default_payment_source_id, si no existe mirar payment_sources.data[0].id
    let paymentSourceId = null;
    try {
      if (conektaCustomer.default_payment_source_id) paymentSourceId = conektaCustomer.default_payment_source_id;
      else if (conektaCustomer.payment_sources && conektaCustomer.payment_sources.data && conektaCustomer.payment_sources.data.length && conektaCustomer.payment_sources.data[0].id) paymentSourceId = conektaCustomer.payment_sources.data[0].id;
    } catch (psErr) {
      // ignore
    }

    if (!paymentSourceId) {
      console.error('Cliente Conekta creado, pero no tiene payment_sources válidos:', conektaCustomer);
      return res.status(500).json({ message: 'No se pudo obtener payment_source del cliente en Conekta' });
    }

    const orderPayload = {
      currency: currency,
      customer_info: { name: customer.name, email: customer.email, customer_id: conektaCustomer.id },
      line_items: [
        {
          name: description || 'Pago MXChange',
          unit_price: amountInCents,
          quantity: 1
        }
      ],
      // Añadir metadata para que el webhook pueda correlacionar la transacción
      metadata: { transaction_code },
      charges: [
        {
          payment_method: { type: 'card', payment_source_id: paymentSourceId }
        }
      ]
    };
    console.log('Order payload para Conekta:', JSON.stringify(orderPayload));
    let orderResp;
    let order;
    try {
      orderResp = await orders.createOrder(orderPayload);
      order = orderResp && orderResp.data ? orderResp.data : orderResp;
      console.log('Order created in Conekta:', order && order.id ? order.id : order);
    } catch (orderErr) {
      const sdkInfo = orderErr && orderErr.response && orderErr.response.data ? orderErr.response.data : (orderErr && orderErr.message ? orderErr.message : orderErr);
      console.error('Error creando order en Conekta:', sdkInfo);
      return res.status(422).json({ message: 'Error creando order en Conekta', details: sdkInfo });
    }

  // Persistir un registro preliminar del pago en la base de datos (status: pending/processing)
    try {
      // intentar resolver transaction_id local si se recibió transaction_code
      let localTransactionId = null;
      if (transaction_code) {
        const [txRows] = await pool.query('SELECT id FROM transactions WHERE transaction_code = ? LIMIT 1', [transaction_code]);
        if (txRows && txRows.length) localTransactionId = txRows[0].id;
      }

      const charge = (order && order.charges && order.charges.length) ? order.charges[0] : null;
      const conektaChargeId = charge && charge.id ? charge.id : null;
      const conektaOrderId = order && order.id ? order.id : null;
      const paymentStatus = (charge && charge.status) ? charge.status : 'pending';

      const [insertResult] = await pool.query('INSERT INTO payments (transaction_id, conekta_order_id, conekta_charge_id, amount, currency, status, raw_response) VALUES (?, ?, ?, ?, ?, ?, ?)', [localTransactionId, conektaOrderId, conektaChargeId, (amountInCents / 100) || 0, currency || 'MXN', paymentStatus || 'pending', JSON.stringify(order)]);
      const paymentId = insertResult && insertResult.insertId ? insertResult.insertId : null;

      // Si encontramos la transacción local, marcarla como 'processing' (hasta que el webhook confirme)
      if (localTransactionId) {
        try { await pool.query('UPDATE transactions SET status = ? WHERE id = ?', ['processing', localTransactionId]); } catch (uErr) { console.warn('No se pudo actualizar status de transacción a processing:', uErr && uErr.message ? uErr.message : uErr); }
      }

      // Adjuntar paymentId y transaction_code a la respuesta para que el frontend pueda consultarlo
      // (no rompe el flujo si no existen)
      if (!resp) resp = { success: true, order };
      resp.payment_id = paymentId;
      if (transaction_code) resp.transaction_code = transaction_code;
    } catch (dbPersistErr) {
      console.warn('No se pudo persistir payment preliminar en DB:', dbPersistErr && dbPersistErr.message ? dbPersistErr.message : dbPersistErr);
    }

    // Algunos métodos de pago pueden devolver instrucciones adicionales (3DS, offsite, etc.)
    // Intentamos normalizar la respuesta para el frontend.
    if (!resp) resp = { success: true, order };

    try {
      const charge = (order && order.charges && order.charges.length) ? order.charges[0] : null;
      if (charge) {
        // ejemplo hipotético: charge.payment_method.action.redirect_to_url
        const action = charge.payment_method && charge.payment_method.action;
        if (action && action.type && action.redirect_url) {
          resp.requires_action = true;
          resp.action = { type: action.type, url: action.redirect_url };
        }
        // también puede haber campos específicos según la integración de Conekta
      }
    } catch (innerErr) {
      // no bloquear el flujo por la normalización
      console.warn('No se pudo normalizar action de la orden:', innerErr && innerErr.message ? innerErr.message : innerErr);
    }

    return res.json(resp);
  } catch (err) {
    console.error('Error en createCardCharge:', err && err.message ? err.message : err);
    // Conekta devuelve errores detallados; los pasamos
    // Intentar extraer info si es un error de Conekta
    const errObj = err && err.toString ? err.toString() : err;
    return res.status(500).json({ message: 'Error procesando pago con Conekta', error: errObj });
  }
};

// Webhook para recibir eventos de Conekta (p.ej. charge.paid, charge.failed)
const webhook = async (req, res, next) => {
  // Si no está configurado, sólo respondemos 200 para no romper
  if (!configured) {
    console.warn('Webhook de Conekta recibido pero no configurado. Ignorando.');
    return res.status(200).send('ok');
  }

  try {
    const event = req.body;
    console.log('Conekta webhook evento:', event.type || event);

    // Manejar algunos eventos comunes
    // Normalizar objetos
    const obj = event && event.data && event.data.object ? event.data.object : event;

    if (event.type === 'charge.paid' || event.type === 'charge.succeeded' || event.type === 'order.paid') {
      console.log('Pago exitoso (webhook):', event.type);
      // Intentar extraer ids y metadata
      // El objeto puede variar según el evento: a veces viene order (con charges), otras veces charge directamente
      let orderId = null;
      let chargeId = null;
      try {
        if (obj && obj.id && event.type && event.type.startsWith('order')) {
          orderId = obj.id;
          // intentar extraer charge id si existe
          if (obj.charges && Array.isArray(obj.charges) && obj.charges.length) chargeId = obj.charges[0].id;
        } else if (obj && obj.id && event.type && event.type.startsWith('charge')) {
          chargeId = obj.id;
          // some charge events include order_id
          if (obj.order_id) orderId = obj.order_id;
        } else {
          // fallback genérico
          orderId = obj && obj.order_id ? obj.order_id : (obj && obj.id ? obj.id : null);
          chargeId = obj && obj.charge_id ? obj.charge_id : (obj && obj.id ? obj.id : null);
        }
      } catch (ex) {
        console.warn('No se pudieron extraer order/charge ids del objeto del webhook:', ex && ex.message ? ex.message : ex);
      }

      const amount = obj && obj.amount ? (obj.amount / 100) : null;
      const currency = obj && obj.currency ? obj.currency : null;

      // Buscar transaction por transaction_code en metadata si existe
      let txCode = null;
      try {
        if (obj && obj.metadata && obj.metadata.transaction_code) txCode = obj.metadata.transaction_code;
      } catch (ignore) { }

      try {
        // Primero intentar encontrar un payment existente por conekta_order_id o conekta_charge_id
        let paymentFound = null;
        if (orderId) {
          const [rows] = await pool.query('SELECT id, transaction_id FROM payments WHERE conekta_order_id = ? LIMIT 1', [orderId]);
          if (rows && rows.length) paymentFound = rows[0];
        }
        if (!paymentFound && chargeId) {
          const [rows2] = await pool.query('SELECT id, transaction_id FROM payments WHERE conekta_charge_id = ? LIMIT 1', [chargeId]);
          if (rows2 && rows2.length) paymentFound = rows2[0];
        }

        if (paymentFound) {
          // actualizar payment existente
          try {
            await pool.query('UPDATE payments SET status = ?, amount = ?, currency = ?, raw_response = ? WHERE id = ?', ['paid', amount || 0, currency || 'MXN', JSON.stringify(obj), paymentFound.id]);
          } catch (uErr) {
            console.warn('No se pudo actualizar payment existente desde webhook:', uErr && uErr.message ? uErr.message : uErr);
          }

          // Si tenemos txCode o transaction_id en el payment, actualizar transacción a paid
          let txIdToUpdate = null;
          if (txCode) {
            const [txRows] = await pool.query('SELECT id FROM transactions WHERE transaction_code = ? LIMIT 1', [txCode]);
            if (txRows && txRows.length) txIdToUpdate = txRows[0].id;
          }
          if (!txIdToUpdate && paymentFound.transaction_id) txIdToUpdate = paymentFound.transaction_id;

          if (txIdToUpdate) {
            try {
              await pool.query('UPDATE transactions SET status = ? WHERE id = ?', ['paid', txIdToUpdate]);
              
              // Obtener información de la transacción para notificaciones
              const [txInfoRows] = await pool.query('SELECT user_id, transaction_code, branch_id FROM transactions WHERE id = ?', [txIdToUpdate]);
              const txInfo = txInfoRows && txInfoRows[0] ? txInfoRows[0] : null;
              
              // Además, marcar reserva de inventario como committed
              try {
                await pool.query('UPDATE inventory_reservations SET status = ?, committed_at = NOW() WHERE transaction_id = ? AND status = ?', ['committed', txIdToUpdate, 'reserved']);
              } catch (resErr) {
                console.warn('No se pudo actualizar inventory_reservations a committed:', resErr && resErr.message ? resErr.message : resErr);
              }
              
              // Notificar al cliente sobre pago exitoso
              if (txInfo && txInfo.user_id) {
                try {
                  await pool.query(
                    'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
                    ['user', txInfo.user_id, null, 'Pago confirmado', `Tu pago para la operación ${txInfo.transaction_code} ha sido confirmado exitosamente.`, 'payment_confirmed', txIdToUpdate]
                  );
                } catch (insErr) {
                  console.warn('No se pudo guardar notificación de pago confirmado:', insErr && insErr.message ? insErr.message : insErr);
                }
                
                if (global && global.io) {
                  try {
                    global.io.to(`user:${txInfo.user_id}`).emit('notification', {
                      title: 'Pago confirmado',
                      message: `Tu pago para la operación ${txInfo.transaction_code} ha sido confirmado exitosamente.`,
                      event_type: 'payment_confirmed',
                      transaction_id: txIdToUpdate,
                      created_at: new Date().toISOString()
                    });
                  } catch (emitErr) {
                    console.warn('No se pudo emitir notificación de pago confirmado:', emitErr && emitErr.message ? emitErr.message : emitErr);
                  }
                }
              }
              
              // Notificar a admins sobre pago confirmado
              try {
                await pool.query(
                  'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
                  ['admin', null, null, 'Pago confirmado', `Pago confirmado para operación ${txInfo ? txInfo.transaction_code : txIdToUpdate}`, 'payment_confirmed', txIdToUpdate]
                );
              } catch (insErr) {
                console.warn('No se pudo guardar notificación admin de pago confirmado:', insErr && insErr.message ? insErr.message : insErr);
              }
              
              if (global && global.io) {
                try {
                  global.io.to('admins').emit('notification', {
                    title: 'Pago confirmado',
                    message: `Pago confirmado para operación ${txInfo ? txInfo.transaction_code : txIdToUpdate}`,
                    event_type: 'payment_confirmed',
                    transaction_id: txIdToUpdate,
                    branch_id: txInfo ? txInfo.branch_id : null,
                    created_at: new Date().toISOString()
                  });
                } catch (emitErr) {
                  console.warn('No se pudo emitir notificación admin de pago confirmado:', emitErr && emitErr.message ? emitErr.message : emitErr);
                }
              }
              
              // Notificar a sucursal sobre pago confirmado
              if (txInfo && txInfo.branch_id) {
                try {
                  await pool.query(
                    'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
                    ['sucursal', null, txInfo.branch_id, 'Pago confirmado', `Pago confirmado para operación ${txInfo.transaction_code}`, 'payment_confirmed', txIdToUpdate]
                  );
                } catch (insErr) {
                  console.warn('No se pudo guardar notificación sucursal de pago confirmado:', insErr && insErr.message ? insErr.message : insErr);
                }
                
                if (global && global.io) {
                  try {
                    global.io.to(`branch:${txInfo.branch_id}`).emit('notification', {
                      title: 'Pago confirmado',
                      message: `Pago confirmado para operación ${txInfo.transaction_code}`,
                      event_type: 'payment_confirmed',
                      transaction_id: txIdToUpdate,
                      branch_id: txInfo.branch_id,
                      created_at: new Date().toISOString()
                    });
                  } catch (emitErr) {
                    console.warn('No se pudo emitir notificación sucursal de pago confirmado:', emitErr && emitErr.message ? emitErr.message : emitErr);
                  }
                }
              }
            } catch (txErr) {
              console.warn('No se pudo actualizar transacción a paid desde webhook:', txErr && txErr.message ? txErr.message : txErr);
            }
          }
        } else {
          // No hay payment existente: insertar uno nuevo
          const [result] = await pool.query('INSERT INTO payments (transaction_id, conekta_order_id, conekta_charge_id, amount, currency, status, raw_response) VALUES (?, ?, ?, ?, ?, ?, ?)', [null, orderId, chargeId, amount || 0, currency || 'MXN', 'paid', JSON.stringify(obj)]);
          const paymentId = result.insertId;

          // Si tenemos txCode, enlazar la transacción y marcar como paid
          if (txCode) {
            const [rows] = await pool.query('SELECT id, user_id, transaction_code, branch_id FROM transactions WHERE transaction_code = ? LIMIT 1', [txCode]);
            if (rows && rows.length) {
              const tId = rows[0].id;
              const txInfo = rows[0];
              try {
                await pool.query('UPDATE payments SET transaction_id = ? WHERE id = ?', [tId, paymentId]);
                await pool.query('UPDATE transactions SET status = ? WHERE id = ?', ['paid', tId]);
                try {
                  await pool.query('UPDATE inventory_reservations SET status = ?, committed_at = NOW() WHERE transaction_id = ? AND status = ?', ['committed', tId, 'reserved']);
                } catch (resErr) {
                  console.warn('No se pudo actualizar inventory_reservations a committed (new payment):', resErr && resErr.message ? resErr.message : resErr);
                }
                
                // Notificar al cliente sobre pago exitoso
                if (txInfo.user_id) {
                  try {
                    await pool.query(
                      'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
                      ['user', txInfo.user_id, null, 'Pago confirmado', `Tu pago para la operación ${txInfo.transaction_code} ha sido confirmado exitosamente.`, 'payment_confirmed', tId]
                    );
                  } catch (insErr) {
                    console.warn('No se pudo guardar notificación de pago confirmado (new payment):', insErr && insErr.message ? insErr.message : insErr);
                  }
                  
                  if (global && global.io) {
                    try {
                      global.io.to(`user:${txInfo.user_id}`).emit('notification', {
                        title: 'Pago confirmado',
                        message: `Tu pago para la operación ${txInfo.transaction_code} ha sido confirmado exitosamente.`,
                        event_type: 'payment_confirmed',
                        transaction_id: tId,
                        created_at: new Date().toISOString()
                      });
                    } catch (emitErr) {
                      console.warn('No se pudo emitir notificación de pago confirmado (new payment):', emitErr && emitErr.message ? emitErr.message : emitErr);
                    }
                  }
                }
                
                // Notificar a sucursal
                if (txInfo.branch_id) {
                  try {
                    await pool.query(
                      'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
                      ['sucursal', null, txInfo.branch_id, 'Pago confirmado', `Pago confirmado para operación ${txInfo.transaction_code}`, 'payment_confirmed', tId]
                    );
                  } catch (insErr) {
                    console.warn('No se pudo guardar notificación sucursal de pago confirmado (new payment):', insErr && insErr.message ? insErr.message : insErr);
                  }
                  
                  if (global && global.io) {
                    try {
                      global.io.to(`branch:${txInfo.branch_id}`).emit('notification', {
                        title: 'Pago confirmado',
                        message: `Pago confirmado para operación ${txInfo.transaction_code}`,
                        event_type: 'payment_confirmed',
                        transaction_id: tId,
                        branch_id: txInfo.branch_id,
                        created_at: new Date().toISOString()
                      });
                    } catch (emitErr) {
                      console.warn('No se pudo emitir notificación sucursal de pago confirmado (new payment):', emitErr && emitErr.message ? emitErr.message : emitErr);
                    }
                  }
                }
              } catch (uErr) {
                console.warn('No se pudo actualizar payment/transaction tras insertar payment desde webhook:', uErr && uErr.message ? uErr.message : uErr);
              }
            }
          }
        }
      } catch (dbErr) {
        console.error('Error guardando/actualizando payment en DB desde webhook:', dbErr && dbErr.message ? dbErr.message : dbErr);
      }
    }

    // Manejar pagos fallidos / expirados: liberar reservas
    if (event.type === 'charge.failed' || event.type === 'order.expired' || event.type === 'charge.expired') {
      console.log('Pago fallido/expirado (webhook):', event.type);
      // Intentar encontrar tx por metadata
      let txId = null;
      let txInfo = null;
      try {
        if (obj && obj.metadata && obj.metadata.transaction_code) {
          const [txRows] = await pool.query('SELECT id, user_id, transaction_code, branch_id FROM transactions WHERE transaction_code = ? LIMIT 1', [obj.metadata.transaction_code]);
          if (txRows && txRows.length) {
            txId = txRows[0].id;
            txInfo = txRows[0];
          }
        }
      } catch (ignore) {}

      // Si tenemos txId, liberar reservas asociadas
      if (txId) {
        try {
          const [resRows] = await pool.query('SELECT id, branch_id, currency, amount_reserved FROM inventory_reservations WHERE transaction_id = ? AND status = ?', [txId, 'reserved']);
          if (resRows && resRows.length) {
            for (const r of resRows) {
              try {
                // devolver al inventario
                await pool.query('UPDATE inventory SET amount = amount + ? WHERE branch_id = ? AND currency = ?', [r.amount_reserved, r.branch_id, r.currency]);
                await pool.query('UPDATE inventory_reservations SET status = ?, released_at = NOW() WHERE id = ?', ['released', r.id]);
              } catch (uErr) {
                console.warn('Error liberando reserva/id', r.id, uErr && uErr.message ? uErr.message : uErr);
              }
            }
          }
        } catch (qErr) {
          console.error('Error buscando inventory_reservations para liberar:', qErr && qErr.message ? qErr.message : qErr);
        }
        
        // Marcar transacción como cancelled
        try {
          await pool.query('UPDATE transactions SET status = ? WHERE id = ?', ['cancelled', txId]);
        } catch (txErr) {
          console.warn('No se pudo actualizar transacción a cancelled:', txErr && txErr.message ? txErr.message : txErr);
        }
        
        // Notificar al cliente sobre pago fallido
        if (txInfo && txInfo.user_id) {
          try {
            await pool.query(
              'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
              ['user', txInfo.user_id, null, 'Pago fallido', `El pago para la operación ${txInfo.transaction_code} no se pudo procesar. La reserva ha sido liberada.`, 'payment_failed', txId]
            );
          } catch (insErr) {
            console.warn('No se pudo guardar notificación de pago fallido:', insErr && insErr.message ? insErr.message : insErr);
          }
          
          if (global && global.io) {
            try {
              global.io.to(`user:${txInfo.user_id}`).emit('notification', {
                title: 'Pago fallido',
                message: `El pago para la operación ${txInfo.transaction_code} no se pudo procesar. La reserva ha sido liberada.`,
                event_type: 'payment_failed',
                transaction_id: txId,
                created_at: new Date().toISOString()
              });
            } catch (emitErr) {
              console.warn('No se pudo emitir notificación de pago fallido:', emitErr && emitErr.message ? emitErr.message : emitErr);
            }
          }
        }
        
        // Notificar a sucursal sobre pago fallido
        if (txInfo && txInfo.branch_id) {
          try {
            await pool.query(
              'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
              ['sucursal', null, txInfo.branch_id, 'Pago fallido', `El pago para la operación ${txInfo.transaction_code} falló. Reserva liberada.`, 'payment_failed', txId]
            );
          } catch (insErr) {
            console.warn('No se pudo guardar notificación sucursal de pago fallido:', insErr && insErr.message ? insErr.message : insErr);
          }
          
          if (global && global.io) {
            try {
              global.io.to(`branch:${txInfo.branch_id}`).emit('notification', {
                title: 'Pago fallido',
                message: `El pago para la operación ${txInfo.transaction_code} falló. Reserva liberada.`,
                event_type: 'payment_failed',
                transaction_id: txId,
                branch_id: txInfo.branch_id,
                created_at: new Date().toISOString()
              });
            } catch (emitErr) {
              console.warn('No se pudo emitir notificación sucursal de pago fallido:', emitErr && emitErr.message ? emitErr.message : emitErr);
            }
          }
        }
      }
    }

    // Acknowledge
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Error en webhook de Conekta:', err && err.message ? err.message : err);
    return res.status(500).send('error');
  }
};

// Devuelve sólo la clave pública (si está configurada) para que el frontend pueda
// tokenizar tarjetas sin exponer la clave privada del servidor.
const getConfig = async (req, res, next) => {
  try {
    const publicKey = process.env.CONEKTA_PUBLIC_KEY || null;
    return res.json({ publicKey });
  } catch (err) {
    console.error('Error en payments.getConfig:', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Error obteniendo configuración de pagos' });
  }
};

// Obtener estado del pago/transacción por transaction_code
const getPaymentStatus = async (req, res, next) => {
  try {
    const { transaction_code } = req.params;
    if (!transaction_code) return res.status(400).json({ message: 'transaction_code requerido' });

    // buscar transacción
    const [txRows] = await pool.query('SELECT id, status FROM transactions WHERE transaction_code = ? LIMIT 1', [transaction_code]);
    if (!txRows || txRows.length === 0) return res.status(404).json({ message: 'Transacción no encontrada' });
    const tx = txRows[0];

    // buscar pagos asociados
    const [payments] = await pool.query('SELECT id, amount, currency, status, conekta_order_id, conekta_charge_id, created_at FROM payments WHERE transaction_id = ? ORDER BY created_at DESC', [tx.id]);

    return res.json({ transaction: { id: tx.id, status: tx.status }, payments });
  } catch (err) {
    console.error('Error en getPaymentStatus:', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Error obteniendo estado de pago' });
  }
};

module.exports = { createCardCharge, webhook, getConfig, getPaymentStatus };
