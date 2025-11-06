const { stripe, configured, publicKey } = require('../config/stripe');
const pool = require('../config/db');
const crypto = require('crypto');

/**
 * Devuelve la clave pública de Stripe para el frontend
 */
const getConfig = async (req, res) => {
  if (!configured) {
    return res.status(501).json({ 
      message: 'Stripe no está configurado en este entorno.',
      publicKey: null 
    });
  }

  return res.json({ 
    publicKey: publicKey || null,
    provider: 'stripe'
  });
};

/**
 * Crea un PaymentIntent de Stripe
 * Body esperado: { amount, currency, description, transaction_code, customer: { name, email } }
 */
const createPaymentIntent = async (req, res, next) => {
  if (!configured) {
    return res.status(501).json({ 
      message: 'Stripe no está configurado. Configure STRIPE_SECRET_KEY en .env.' 
    });
  }

  try {
    const { amount, currency = 'MXN', description, customer } = req.body;
    let { transaction_code } = req.body || {};

    // Generar transaction_code si no se proporciona
    if (!transaction_code) {
      try {
        const rnd = crypto.randomBytes(4).toString('hex');
        transaction_code = `tx-${rnd}`;
      } catch (genErr) {
        transaction_code = `tx-${Date.now()}`;
      }
    }

    if (!amount || !customer) {
      return res.status(400).json({ 
        message: 'Faltan campos requeridos: amount, customer' 
      });
    }

    // Stripe espera el monto en centavos
    const amountInCents = Math.round(Number(amount) * 100);

    console.log('Creando PaymentIntent para cliente:', customer.email, 'monto:', amountInCents, currency);

    // Crear o recuperar cliente de Stripe
    let stripeCustomer;
    try {
      // Buscar si ya existe un cliente con este email
      const customers = await stripe.customers.list({
        email: customer.email,
        limit: 1
      });

      if (customers.data.length > 0) {
        stripeCustomer = customers.data[0];
        console.log('Cliente existente encontrado:', stripeCustomer.id);
      } else {
        // Crear nuevo cliente
        stripeCustomer = await stripe.customers.create({
          email: customer.email,
          name: customer.name,
          metadata: {
            source: 'mxchange'
          }
        });
        console.log('Nuevo cliente creado:', stripeCustomer.id);
      }
    } catch (custErr) {
      console.error('Error gestionando customer en Stripe:', custErr);
      return res.status(422).json({ 
        message: 'Error creando/obteniendo customer en Stripe', 
        details: custErr.message 
      });
    }

    // Crear PaymentIntent
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: currency.toLowerCase(),
        customer: stripeCustomer.id,
        description: description || `Pago MXChange - ${transaction_code}`,
        metadata: {
          transaction_code,
          customer_name: customer.name,
          customer_email: customer.email
        },
        // Métodos de pago permitidos
        payment_method_types: ['card'],
        // Configurar para captura automática
        capture_method: 'automatic',
      });

      console.log('PaymentIntent creado:', paymentIntent.id);
    } catch (piErr) {
      console.error('Error creando PaymentIntent:', piErr);
      return res.status(422).json({ 
        message: 'Error creando PaymentIntent en Stripe', 
        details: piErr.message 
      });
    }

    // Persistir en base de datos
    try {
      let localTransactionId = null;
      if (transaction_code) {
        const [txRows] = await pool.query(
          'SELECT id FROM transactions WHERE transaction_code = ? LIMIT 1', 
          [transaction_code]
        );
        if (txRows && txRows.length) localTransactionId = txRows[0].id;
      }

      const [insertResult] = await pool.query(
        `INSERT INTO payments 
        (transaction_id, stripe_payment_intent_id, stripe_customer_id, amount, currency, status, raw_response) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          localTransactionId, 
          paymentIntent.id, 
          stripeCustomer.id,
          (amountInCents / 100) || 0, 
          currency || 'MXN', 
          'pending', 
          JSON.stringify(paymentIntent)
        ]
      );

      const paymentId = insertResult && insertResult.insertId ? insertResult.insertId : null;

      // Responder con el client_secret para el frontend
      return res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        payment_id: paymentId,
        transaction_code,
        amount: amountInCents,
        currency
      });

    } catch (dbErr) {
      console.warn('No se pudo persistir payment en DB:', dbErr.message);
      // Aun así devolvemos el client_secret para que el pago pueda completarse
      return res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        transaction_code,
        amount: amountInCents,
        currency
      });
    }

  } catch (err) {
    console.error('Error en createPaymentIntent:', err.message);
    return res.status(500).json({ 
      message: 'Error procesando pago con Stripe', 
      error: err.message 
    });
  }
};

/**
 * Confirmar un pago con payment_method
 * Body: { payment_intent_id, payment_method_id }
 */
const confirmPayment = async (req, res, next) => {
  if (!configured) {
    return res.status(501).json({ 
      message: 'Stripe no está configurado' 
    });
  }

  try {
    const { payment_intent_id, payment_method_id } = req.body;

    if (!payment_intent_id || !payment_method_id) {
      return res.status(400).json({ 
        message: 'Faltan payment_intent_id o payment_method_id' 
      });
    }

    const paymentIntent = await stripe.paymentIntents.confirm(payment_intent_id, {
      payment_method: payment_method_id,
    });

    return res.json({
      success: true,
      status: paymentIntent.status,
      paymentIntent
    });

  } catch (err) {
    console.error('Error confirmando pago:', err.message);
    return res.status(500).json({ 
      message: 'Error confirmando pago', 
      error: err.message 
    });
  }
};

/**
 * Webhook de Stripe para manejar eventos
 * Eventos principales: payment_intent.succeeded, payment_intent.payment_failed
 */
const webhook = async (req, res, next) => {
  if (!configured) {
    console.warn('Webhook de Stripe recibido pero Stripe no está configurado. Ignorando.');
    return res.status(200).send('ok');
  }

  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verificar la firma del webhook si tenemos el secret
    // req.body debe ser el raw buffer (configurado con express.raw en la ruta)
    if (endpointSecret) {
      // Stripe requiere el raw body como string o Buffer
      const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
      event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
    } else {
      // En desarrollo, podemos procesar sin verificar
      console.warn('⚠ STRIPE_WEBHOOK_SECRET no configurado. Procesando webhook sin verificación (solo para desarrollo)');
      // Si req.body es un Buffer, parsearlo a JSON
      const payload = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : req.body;
      event = payload;
    }
  } catch (err) {
    console.error('Error verificando webhook de Stripe:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('📧 Stripe webhook evento:', event.type);

  try {
    // Manejar diferentes tipos de eventos
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object);
        break;
      
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      
      case 'payment_intent.processing':
        await handlePaymentProcessing(event.data.object);
        break;
      
      case 'charge.succeeded':
        console.log('✓ Cargo exitoso:', event.data.object.id);
        break;
      
      default:
        console.log(`Evento no manejado: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Error procesando webhook:', err.message);
    res.status(500).json({ error: 'Error procesando webhook' });
  }
};

/**
 * Maneja pago exitoso
 */
async function handlePaymentSuccess(paymentIntent) {
  console.log('✓ Pago exitoso:', paymentIntent.id);

  const { id, amount, currency, metadata, customer } = paymentIntent;
  const txCode = metadata && metadata.transaction_code ? metadata.transaction_code : null;

  try {
    // Buscar payment existente
    const [paymentRows] = await pool.query(
      'SELECT id, transaction_id FROM payments WHERE stripe_payment_intent_id = ? LIMIT 1',
      [id]
    );

    let paymentFound = paymentRows && paymentRows.length ? paymentRows[0] : null;

    if (paymentFound) {
      // Actualizar payment existente
      await pool.query(
        'UPDATE payments SET status = ?, amount = ?, currency = ?, raw_response = ?, updated_at = NOW() WHERE id = ?',
        ['paid', (amount / 100) || 0, currency || 'MXN', JSON.stringify(paymentIntent), paymentFound.id]
      );

      // Actualizar transacción
      let txIdToUpdate = null;
      if (txCode) {
        const [txRows] = await pool.query(
          'SELECT id FROM transactions WHERE transaction_code = ? LIMIT 1',
          [txCode]
        );
        if (txRows && txRows.length) txIdToUpdate = txRows[0].id;
      }
      if (!txIdToUpdate && paymentFound.transaction_id) {
        txIdToUpdate = paymentFound.transaction_id;
      }

      if (txIdToUpdate) {
        await updateTransactionToPaid(txIdToUpdate, txCode);
      }
    } else {
      // Crear nuevo payment
      const [result] = await pool.query(
        `INSERT INTO payments 
        (transaction_id, stripe_payment_intent_id, stripe_customer_id, amount, currency, status, raw_response) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [null, id, customer, (amount / 100) || 0, currency || 'MXN', 'paid', JSON.stringify(paymentIntent)]
      );

      const paymentId = result.insertId;

      // Si tenemos txCode, enlazar y actualizar
      if (txCode) {
        const [rows] = await pool.query(
          'SELECT id FROM transactions WHERE transaction_code = ? LIMIT 1',
          [txCode]
        );
        if (rows && rows.length) {
          const tId = rows[0].id;
          await pool.query('UPDATE payments SET transaction_id = ? WHERE id = ?', [tId, paymentId]);
          await updateTransactionToPaid(tId, txCode);
        }
      }
    }
  } catch (dbErr) {
    console.error('Error actualizando DB después de pago exitoso:', dbErr.message);
  }
}

/**
 * Actualiza una transacción a estado 'paid' y envía notificaciones
 * IMPORTANTE: Al marcar como 'paid', NO se descuenta el inventario todavía.
 * El inventario se ajustará cuando la transacción se complete (estado 'completed').
 */
async function updateTransactionToPaid(txId, txCode) {
  try {
    await pool.query('UPDATE transactions SET status = ? WHERE id = ?', ['paid', txId]);

    // Obtener información completa de la transacción
    const [txInfoRows] = await pool.query(
      'SELECT user_id, transaction_code, branch_id, type, amount_from, currency_from, amount_to, currency_to FROM transactions WHERE id = ?',
      [txId]
    );
    const txInfo = txInfoRows && txInfoRows[0] ? txInfoRows[0] : null;

    if (txInfo) {
      // NO descontamos ni acreditamos inventario aquí (se hará en 'completed')
      // Solo registramos en inventory_adjustments para auditoría que el pago fue confirmado
      try {
        const [invToRows] = await pool.query(
          'SELECT id FROM inventory WHERE branch_id = ? AND currency = ? LIMIT 1',
          [txInfo.branch_id, txInfo.currency_to]
        );
        const inventoryIdTo = invToRows && invToRows[0] ? invToRows[0].id : null;

        if (inventoryIdTo) {
          await pool.query(
            'INSERT INTO inventory_adjustments (inventory_id, old_amount, new_amount, adjustment_type, reason, adjusted_by) VALUES (?, ?, ?, ?, ?, ?)',
            [inventoryIdTo, null, null, 'exit', `Pago confirmado para transacción ${txId} - pendiente de completar`, null]
          );
        }
      } catch (adjErr) {
        console.warn('Error registrando adjustment de pago confirmado:', adjErr && adjErr.message ? adjErr.message : adjErr);
      }
    }

    // Mantener la reserva como 'reserved' (aún no se completa la operación)
    // La reserva se marcará como 'committed' cuando se complete la transacción
    console.log(`✓ Transacción ${txId} marcada como PAID. Inventario NO modificado (se ajustará al completar).`);

    // Emitir evento de actualización de transacción
    if (global && global.io && txInfo) {
      global.io.emit('transaction.updated', {
        transaction_id: txId,
        transaction_code: txInfo.transaction_code || txCode,
        status: 'paid',
        type: txInfo.type
      });
    }

    // Notificar al cliente
    if (txInfo && txInfo.user_id) {
      await pool.query(
        'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
        [
          'user', 
          txInfo.user_id, 
          null, 
          'Pago confirmado', 
          `Tu pago para la operación ${txInfo.transaction_code} ha sido confirmado exitosamente.`, 
          'payment_confirmed', 
          txId
        ]
      );

      if (global && global.io) {
        global.io.to(`user:${txInfo.user_id}`).emit('notification', {
          title: 'Pago confirmado',
          message: `Tu pago para la operación ${txInfo.transaction_code} ha sido confirmado exitosamente.`,
          event_type: 'payment_confirmed',
          transaction_id: txId,
          created_at: new Date().toISOString()
        });
      }
    }

    // Notificar a admins
    await pool.query(
      'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
      ['admin', null, null, 'Pago confirmado', `Pago confirmado para operación ${txInfo ? txInfo.transaction_code : txId}`, 'payment_confirmed', txId]
    );

    if (global && global.io) {
      global.io.to('admins').emit('notification', {
        title: 'Pago confirmado',
        message: `Pago confirmado para operación ${txInfo ? txInfo.transaction_code : txId}`,
        event_type: 'payment_confirmed',
        transaction_id: txId,
        branch_id: txInfo ? txInfo.branch_id : null,
        created_at: new Date().toISOString()
      });
    }

    // Notificar a sucursal
    if (txInfo && txInfo.branch_id) {
      await pool.query(
        'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
        [
          'sucursal', 
          null, 
          txInfo.branch_id, 
          'Pago confirmado', 
          `Pago confirmado para operación ${txInfo.transaction_code}`, 
          'payment_confirmed', 
          txId
        ]
      );

      if (global && global.io) {
        global.io.to(`branch:${txInfo.branch_id}`).emit('notification', {
          title: 'Pago confirmado',
          message: `Pago confirmado para operación ${txInfo.transaction_code}`,
          event_type: 'payment_confirmed',
          transaction_id: txId,
          branch_id: txInfo.branch_id,
          created_at: new Date().toISOString()
        });
      }
    }

    console.log('✓ Transacción actualizada a paid y notificaciones enviadas');
  } catch (err) {
    console.error('Error en updateTransactionToPaid:', err.message);
  }
}

/**
 * Maneja pago fallido
 */
async function handlePaymentFailed(paymentIntent) {
  console.log('✗ Pago fallido:', paymentIntent.id);

  const { id, metadata } = paymentIntent;
  const txCode = metadata && metadata.transaction_code ? metadata.transaction_code : null;

  try {
    // Actualizar payment
    await pool.query(
      'UPDATE payments SET status = ?, raw_response = ?, updated_at = NOW() WHERE stripe_payment_intent_id = ?',
      ['failed', JSON.stringify(paymentIntent), id]
    );

    // Actualizar transacción si existe
    if (txCode) {
      const [txRows] = await pool.query(
        'SELECT id, user_id, transaction_code FROM transactions WHERE transaction_code = ? LIMIT 1',
        [txCode]
      );

      if (txRows && txRows.length) {
        const txId = txRows[0].id;
        const userId = txRows[0].user_id;

        await pool.query('UPDATE transactions SET status = ? WHERE id = ?', ['cancelled', txId]);

        // Liberar reserva de inventario
        // IMPORTANTE: Solo marcar como liberada, NO devolver al inventario (nunca se descontó)
        try {
          const [resRows] = await pool.query(
            'SELECT id, branch_id, currency, amount_reserved FROM inventory_reservations WHERE transaction_id = ? AND status = ?',
            [txId, 'reserved']
          );
          
          await pool.query(
            'UPDATE inventory_reservations SET status = ?, released_at = NOW() WHERE transaction_id = ? AND status = ?',
            ['released', txId, 'reserved']
          );

          // Registrar en inventory_adjustments solo para auditoría (sin cambio de monto)
          if (resRows && resRows.length > 0) {
            for (const r of resRows) {
              try {
                const [invRows] = await pool.query(
                  'SELECT id FROM inventory WHERE branch_id = ? AND currency = ? LIMIT 1',
                  [r.branch_id, r.currency]
                );
                if (invRows && invRows[0]) {
                  await pool.query(
                    'INSERT INTO inventory_adjustments (inventory_id, old_amount, new_amount, adjustment_type, reason, adjusted_by) VALUES (?, ?, ?, ?, ?, ?)',
                    [invRows[0].id, null, null, 'exit', `Reserva de ${r.amount_reserved} ${r.currency} liberada para transacción ${txId} (pago fallido)`, null]
                  );
                }
              } catch (adjErr) {
                console.warn('Error registrando adjustment de reserva liberada:', adjErr && adjErr.message ? adjErr.message : adjErr);
              }
            }
          }
          
          console.log(`✓ Reserva liberada para transacción ${txId} (pago fallido)`);
        } catch (resErr) {
          console.warn('Error liberando reserva:', resErr && resErr.message ? resErr.message : resErr);
        }

        // Notificar al usuario
        if (userId) {
          await pool.query(
            'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
            [
              'user', 
              userId, 
              null, 
              'Pago rechazado', 
              `Tu pago para la operación ${txCode} fue rechazado. Por favor, intenta con otro método de pago.`, 
              'payment_failed', 
              txId
            ]
          );

          if (global && global.io) {
            global.io.to(`user:${userId}`).emit('notification', {
              title: 'Pago rechazado',
              message: `Tu pago para la operación ${txCode} fue rechazado.`,
              event_type: 'payment_failed',
              transaction_id: txId,
              created_at: new Date().toISOString()
            });
          }
        }
      }
    }
  } catch (dbErr) {
    console.error('Error actualizando DB después de pago fallido:', dbErr.message);
  }
}

/**
 * Maneja pago en procesamiento
 */
async function handlePaymentProcessing(paymentIntent) {
  console.log('⏳ Pago en procesamiento:', paymentIntent.id);

  try {
    await pool.query(
      'UPDATE payments SET status = ?, raw_response = ?, updated_at = NOW() WHERE stripe_payment_intent_id = ?',
      ['processing', JSON.stringify(paymentIntent), paymentIntent.id]
    );

    // Actualizar la transacción a 'processing' cuando el intent entra en procesamiento
    const txCode = paymentIntent?.metadata?.transaction_code || null;
    if (txCode) {
      await pool.query(
        'UPDATE transactions SET status = ? WHERE transaction_code = ?',
        ['processing', txCode]
      );
    }
  } catch (dbErr) {
    console.error('Error actualizando pago a processing:', dbErr.message);
  }
}

/**
 * Procesa un cargo completo con tarjeta usando Stripe
 * Body esperado: { 
 *   amount, currency, description, transaction_code, 
 *   customer: { name, email },
 *   card: { number, exp_month, exp_year, cvc }
 * }
 */
const charge = async (req, res, next) => {
  if (!configured) {
    return res.status(501).json({ 
      message: 'Stripe no está configurado. Configure STRIPE_SECRET_KEY en .env.' 
    });
  }

  try {
    const { amount, currency = 'MXN', description, customer, payment_method_id, transaction_code } = req.body;

    if (!amount || !customer || !transaction_code) {
      return res.status(400).json({ 
        message: 'Faltan campos requeridos: amount, customer, transaction_code' 
      });
    }

    // Stripe espera el monto en centavos
    const amountInCents = Math.round(Number(amount) * 100);

    console.log('Procesando cargo para:', customer.email, 'monto:', amountInCents, currency);

    // 1. Crear o recuperar cliente de Stripe
    let stripeCustomer;
    try {
      const customers = await stripe.customers.list({
        email: customer.email,
        limit: 1
      });

      if (customers.data.length > 0) {
        stripeCustomer = customers.data[0];
        console.log('Cliente existente:', stripeCustomer.id);
      } else {
        stripeCustomer = await stripe.customers.create({
          email: customer.email,
          name: customer.name,
          metadata: { source: 'mxchange' }
        });
        console.log('Nuevo cliente creado:', stripeCustomer.id);
      }
    } catch (custErr) {
      console.error('Error con customer:', custErr);
      return res.status(422).json({ 
        message: 'Error creando/obteniendo customer', 
        details: custErr.message 
      });
    }

    // 2. Usar payment_method_id creado en el frontend con Stripe.js
    if (!payment_method_id) {
      return res.status(400).json({
        message: 'Falta payment_method_id. Crea el método con Stripe.js en el frontend y envíalo al backend.'
      });
    }

    // 4. Crear y confirmar Payment Intent
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: currency.toLowerCase(),
        customer: stripeCustomer.id,
        payment_method: payment_method_id,
        description: description || `Pago ${transaction_code}`,
        confirm: true, // Confirmar inmediatamente
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never'
        },
        metadata: {
          transaction_code,
          customer_name: customer.name,
          customer_email: customer.email
        }
      });
      console.log('Payment Intent creado y confirmado:', paymentIntent.id, 'Status:', paymentIntent.status);
    } catch (piErr) {
      console.error('Error creando Payment Intent:', piErr);
      return res.status(422).json({ 
        message: 'Error procesando el pago', 
        details: piErr.message 
      });
    }

    // 5. Guardar en base de datos (alineado con el esquema)
    try {
      // Enlazar con la transacción local por transaction_code
      let localTransactionId = null;
      if (transaction_code) {
        const [txRows] = await pool.query(
          'SELECT id FROM transactions WHERE transaction_code = ? LIMIT 1',
          [transaction_code]
        );
        if (txRows && txRows.length) localTransactionId = txRows[0].id;
      }

      // Mapear estado del intent a estado del registro de pago
      let paymentStatus = 'pending';
      if (paymentIntent.status === 'succeeded') {
        paymentStatus = 'paid';
      } else if (paymentIntent.status === 'processing') {
        paymentStatus = 'processing';
      } else if (paymentIntent.status === 'requires_action') {
        paymentStatus = 'pending';
      } else if (paymentIntent.status === 'canceled') {
        paymentStatus = 'cancelled';
      } else if (paymentIntent.status === 'requires_payment_method') {
        paymentStatus = 'pending';
      }

      const [insertResult] = await pool.query(
        `INSERT INTO payments 
        (transaction_id, stripe_payment_intent_id, stripe_customer_id, amount, currency, status, raw_response) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          localTransactionId,
          paymentIntent.id,
          stripeCustomer.id,
          (amountInCents / 100) || 0,
          currency || 'MXN',
          paymentStatus,
          JSON.stringify(paymentIntent)
        ]
      );
      const paymentId = insertResult && insertResult.insertId ? insertResult.insertId : null;
      console.log('Pago guardado en DB para transaction_code:', transaction_code, 'status:', paymentStatus, 'payment_id:', paymentId);
    } catch (dbErr) {
      console.error('Error guardando pago en DB:', dbErr);
    }

    // 6. Actualizar estado de la transacción según el resultado
    try {
      let newStatus = 'reserved';
      let shouldUpdateInventory = false;

      if (paymentIntent.status === 'succeeded') {
        // Pago exitoso: actualizar inmediatamente a 'paid'
        newStatus = 'paid';
        shouldUpdateInventory = true;
        
        // Buscar la transacción para obtener información completa
        const [txRows] = await pool.query(
          'SELECT id, user_id, transaction_code, branch_id FROM transactions WHERE transaction_code = ? LIMIT 1',
          [transaction_code]
        );
        
        if (txRows && txRows.length) {
          const txInfo = txRows[0];
          
          // Actualizar estado de la transacción
          await pool.query(
            'UPDATE transactions SET status = ?, updated_at = NOW() WHERE id = ?',
            ['paid', txInfo.id]
          );
          
          // Marcar reserva de inventario como committed
          await pool.query(
            'UPDATE inventory_reservations SET status = ?, committed_at = NOW() WHERE transaction_id = ? AND status = ?',
            ['committed', txInfo.id, 'reserved']
          );
          
          // Emitir evento de actualización de transacción
          if (global && global.io) {
            global.io.emit('transaction.updated', {
              transaction_id: txInfo.id,
              transaction_code: txInfo.transaction_code,
              status: 'paid',
              type: 'buy'
            });
          }
          
          // Notificar al cliente
          if (txInfo.user_id) {
            await pool.query(
              'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
              ['user', txInfo.user_id, null, 'Pago confirmado', `Tu pago para la operación ${txInfo.transaction_code} ha sido confirmado exitosamente.`, 'payment_confirmed', txInfo.id]
            );
            
            if (global && global.io) {
              global.io.to(`user:${txInfo.user_id}`).emit('notification', {
                title: 'Pago confirmado',
                message: `Tu pago para la operación ${txInfo.transaction_code} ha sido confirmado exitosamente.`,
                event_type: 'payment_confirmed',
                transaction_id: txInfo.id,
                created_at: new Date().toISOString()
              });
            }
          }
          
          // Notificar a admins
          await pool.query(
            'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
            ['admin', null, null, 'Pago confirmado', `Pago confirmado para operación ${txInfo.transaction_code}`, 'payment_confirmed', txInfo.id]
          );
          
          if (global && global.io) {
            global.io.to('admins').emit('notification', {
              title: 'Pago confirmado',
              message: `Pago confirmado para operación ${txInfo.transaction_code}`,
              event_type: 'payment_confirmed',
              transaction_id: txInfo.id,
              branch_id: txInfo.branch_id,
              created_at: new Date().toISOString()
            });
          }
          
          // Notificar a sucursal
          if (txInfo.branch_id) {
            await pool.query(
              'INSERT INTO notifications (recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id) VALUES (?,?,?,?,?,?,?)',
              ['sucursal', null, txInfo.branch_id, 'Pago confirmado', `Pago confirmado para operación ${txInfo.transaction_code}`, 'payment_confirmed', txInfo.id]
            );
            
            if (global && global.io) {
              global.io.to(`branch:${txInfo.branch_id}`).emit('notification', {
                title: 'Pago confirmado',
                message: `Pago confirmado para operación ${txInfo.transaction_code}`,
                event_type: 'payment_confirmed',
                transaction_id: txInfo.id,
                branch_id: txInfo.branch_id,
                created_at: new Date().toISOString()
              });
            }
          }
          
          console.log('✓ Transacción actualizada a paid inmediatamente tras pago exitoso');
        }
      } else if (paymentIntent.status === 'processing' || paymentIntent.status === 'requires_action') {
        newStatus = 'processing';
      } else if (paymentIntent.status === 'canceled') {
        newStatus = 'cancelled';
      } else if (paymentIntent.status === 'requires_payment_method') {
        // Método inválido o rechazado; mantenemos la reserva
        newStatus = 'reserved';
      }

      // Solo actualizar si no se actualizó arriba (cuando status !== 'succeeded')
      if (paymentIntent.status !== 'succeeded') {
        await pool.query(
          'UPDATE transactions SET status = ?, updated_at = NOW() WHERE transaction_code = ?',
          [newStatus, transaction_code]
        );
        console.log('Transacción actualizada a', newStatus, ':', transaction_code);
      }
    } catch (txErr) {
      console.error('Error actualizando transacción:', txErr);
    }

    return res.json({
      success: paymentIntent.status === 'succeeded',
      paymentIntent: {
        id: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        status: paymentIntent.status
      },
      transaction_code,
      message: paymentIntent.status === 'succeeded' 
        ? 'Pago procesado exitosamente.' 
        : 'Pago pendiente de confirmación.'
    });

  } catch (err) {
    console.error('Error en stripe charge:', err);
    return next(err);
  }
};

module.exports = {
  getConfig,
  createPaymentIntent,
  confirmPayment,
  webhook,
  charge
};
