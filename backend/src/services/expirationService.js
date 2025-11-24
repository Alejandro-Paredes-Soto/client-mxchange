const cron = require('node-cron');
const pool = require('../config/db');
const emailService = require('./emailService');

/**
 * Servicio de Expiración Automática de Transacciones
 * 
 * Este servicio maneja la lógica de negocio para expirar transacciones que no se completan
 * en el tiempo establecido, liberando el inventario reservado.
 * 
 * Reglas de negocio:
 * 
 * 1. VENTA (sell): Cliente reserva dólares para llevar y pagar pesos en ventanilla
 *    - Si no llega en el tiempo límite, se marca como EXPIRADO automáticamente
 *    - Se libera el inventario (dólares) reservado
 *    - Se notifica al cliente
 * 
 * 2. COMPRA (buy): Cliente compra dólares online y paga con tarjeta
 *    - Si pagó y no recoge, NO se expira automáticamente
 *    - Se marca con alerta para que el admin contacte al cliente
 *    - El admin decide si cancelar/expirar manualmente y procesar reembolso
 *    - Si NO pagó y venció, se expira automáticamente
 */

class TransactionExpirationService {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
  }

  /**
   * Inicia el cron job que se ejecuta cada 5 minutos
   */
  start() {
    if (this.cronJob) {
      console.log('⏰ [EXPIRATION SERVICE] Cron job ya está en ejecución');
      return;
    }

    // Se ejecuta cada 5 minutos: */5 * * * *
    this.cronJob = cron.schedule('*/5 * * * *', async () => {
      await this.checkAndExpireTransactions();
    });

    console.log('✅ [EXPIRATION SERVICE] Servicio de expiración iniciado (cada 5 minutos)');
  }

  /**
   * Detiene el cron job
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 [EXPIRATION SERVICE] Servicio de expiración detenido');
    }
  }

  /**
   * Verifica y expira transacciones vencidas
   */
  async checkAndExpireTransactions() {
    if (this.isRunning) {
      console.log('⏭️  [EXPIRATION SERVICE] Ya hay una verificación en curso, saltando...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    try {
      console.log('🔍 [EXPIRATION SERVICE] Verificando transacciones expiradas...');

      // Buscar transacciones que deben expirar
      const [expiredTransactions] = await pool.query(`
        SELECT 
          t.id,
          t.transaction_code,
          t.user_id,
          t.branch_id,
          t.type,
          t.amount_to,
          t.currency_to,
          t.status,
          t.method,
          t.expires_at,
          t.created_at,
          u.email as user_email,
          u.name as user_name,
          b.name as branch_name,
          p.status as payment_status
        FROM transactions t
        JOIN users u ON t.user_id = u.idUser
        JOIN branches b ON t.branch_id = b.id
        LEFT JOIN payments p ON t.id = p.transaction_id
        WHERE t.expires_at IS NOT NULL
          AND t.expires_at <= NOW()
          AND t.status IN ('reserved', 'ready_to_receive', 'ready_for_pickup')
        ORDER BY t.expires_at ASC
      `);

      if (expiredTransactions.length === 0) {
        console.log('✅ [EXPIRATION SERVICE] No hay transacciones para expirar');
        return;
      }

      console.log(`📋 [EXPIRATION SERVICE] Encontradas ${expiredTransactions.length} transacciones expiradas`);

      let autoExpired = 0;
      let flaggedForReview = 0;

      for (const tx of expiredTransactions) {
        try {
          await this.processExpiredTransaction(tx);
          
          // Determinar si se expiró automáticamente o se marcó para revisión
          const hasPaid = tx.payment_status === 'succeeded' || 
                         tx.payment_status === 'paid' || 
                         tx.status === 'paid';
          
          if (hasPaid && tx.type === 'buy') {
            flaggedForReview++;
          } else {
            autoExpired++;
          }
        } catch (error) {
          console.error(`❌ [EXPIRATION SERVICE] Error procesando transacción ${tx.transaction_code}:`, error);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`✅ [EXPIRATION SERVICE] Proceso completado en ${duration}ms`);
      console.log(`   - Auto-expiradas: ${autoExpired}`);
      console.log(`   - Marcadas para revisión: ${flaggedForReview}`);

    } catch (error) {
      console.error('❌ [EXPIRATION SERVICE] Error en verificación de expiración:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Procesa una transacción individual que ha expirado
   */
  async processExpiredTransaction(tx) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // CASO A: Venta de dólares (sell) O compra sin pagar
      // → Se expira automáticamente y se libera inventario
      const hasPaid = tx.payment_status === 'succeeded' || 
                     tx.payment_status === 'paid' || 
                     tx.status === 'paid';

      if (!hasPaid || tx.type === 'sell') {
        await this.autoExpireTransaction(connection, tx);
      } 
      // CASO B: Compra de dólares (buy) donde el cliente YA pagó
      // → Se marca para revisión manual del admin (no se expira automáticamente)
      else if (hasPaid && tx.type === 'buy') {
        await this.flagForAdminReview(connection, tx);
      }

      await connection.commit();

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Expira automáticamente una transacción y libera el inventario
   */
  async autoExpireTransaction(connection, tx) {
    console.log(`⏰ [AUTO-EXPIRE] Expirando transacción ${tx.transaction_code} (${tx.type})`);

    // 1. Actualizar estado de la transacción
    await connection.query(
      'UPDATE transactions SET status = ?, updated_at = NOW() WHERE id = ?',
      ['expired', tx.id]
    );

    // 2. Liberar inventario reservado
    await connection.query(`
      UPDATE inventory_reservations 
      SET status = 'released', released_at = NOW()
      WHERE transaction_id = ? AND status = 'reserved'
    `, [tx.id]);

    console.log(`   ✅ Inventario liberado: ${tx.amount_to} ${tx.currency_to} en sucursal ${tx.branch_name}`);

    // 3. Crear notificación para el cliente
    try {
      await connection.query(`
        INSERT INTO notifications (
          recipient_role, recipient_user_id, branch_id, 
          title, message, event_type, transaction_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        'user',
        tx.user_id,
        tx.branch_id,
        'Reserva Expirada',
        `Tu reserva ${tx.transaction_code} ha expirado por falta de asistencia. Por favor genera una nueva orden.`,
        'transaction_expired',
        tx.id
      ]);
    } catch (notifError) {
      console.warn('   ⚠️  No se pudo crear notificación:', notifError.message);
    }

    // 4. Enviar email al cliente
    try {
      await emailService.sendTransactionExpiredEmail({
        email: tx.user_email,
        name: tx.user_name,
        transaction_code: tx.transaction_code,
        type: tx.type,
        amount_to: tx.amount_to,
        currency_to: tx.currency_to,
        branch_name: tx.branch_name,
        expired_at: new Date().toISOString()
      });
      console.log(`   📧 Email de expiración enviado a ${tx.user_email}`);
    } catch (emailError) {
      console.warn('   ⚠️  No se pudo enviar email:', emailError.message);
    }

    // 5. Emitir evento de socket para actualización en tiempo real
    try {
      if (global.io) {
        global.io.emit('transaction_expired', {
          transaction_id: tx.id,
          transaction_code: tx.transaction_code,
          branch_id: tx.branch_id,
          timestamp: new Date().toISOString()
        });
      }
    } catch (socketError) {
      console.warn('   ⚠️  No se pudo emitir evento de socket:', socketError.message);
    }
  }

  /**
   * Marca una transacción pagada para revisión manual del administrador
   */
  async flagForAdminReview(connection, tx) {
    console.log(`🚨 [ADMIN REVIEW] Transacción ${tx.transaction_code} requiere atención (pagada pero no recogida)`);

    // No cambiamos el status, pero creamos una notificación urgente para admins
    await connection.query(`
      INSERT INTO notifications (
        recipient_role, branch_id, 
        title, message, event_type, transaction_id
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      'admin',
      tx.branch_id,
      '⚠️ ATENCIÓN: Orden Pagada Atrasada',
      `La transacción ${tx.transaction_code} fue pagada pero el cliente no ha recogido. Requiere contacto urgente para confirmar o procesar reembolso.`,
      'transaction_delayed_paid',
      tx.id
    ]);

    // Enviar notificación a la sucursal también
    await connection.query(`
      INSERT INTO notifications (
        recipient_role, branch_id, 
        title, message, event_type, transaction_id
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      'sucursal',
      tx.branch_id,
      'Orden pagada atrasada',
      `Cliente no recogió ${tx.transaction_code}. Verificar si viene o procesar devolución.`,
      'transaction_delayed_paid',
      tx.id
    ]);

    console.log(`   ✅ Notificaciones creadas para admin y sucursal`);

    // Emitir alerta por socket
    try {
      if (global.io) {
        global.io.emit('admin_alert', {
          type: 'delayed_paid_transaction',
          transaction_id: tx.id,
          transaction_code: tx.transaction_code,
          branch_id: tx.branch_id,
          message: `Transacción pagada ${tx.transaction_code} requiere atención`,
          timestamp: new Date().toISOString()
        });
      }
    } catch (socketError) {
      console.warn('   ⚠️  No se pudo emitir alerta por socket:', socketError.message);
    }
  }

  /**
   * Ejecuta una verificación manual (útil para testing)
   */
  async runManualCheck() {
    console.log('🔧 [EXPIRATION SERVICE] Ejecutando verificación manual...');
    await this.checkAndExpireTransactions();
  }
}

// Exportar instancia única (singleton)
const expirationService = new TransactionExpirationService();

module.exports = expirationService;
