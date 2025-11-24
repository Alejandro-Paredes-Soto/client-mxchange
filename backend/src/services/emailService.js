const sgMail = require('@sendgrid/mail');

// Configurar SendGrid con la API key
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.warn('⚠️  SENDGRID_API_KEY no configurada. Los emails no se enviarán.');
}

/**
 * Genera HTML minimalista para emails
 */
const generateEmailHTML = (title, content) => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #000000; font-size: 24px; font-weight: 600; margin: 40px 0 20px; padding: 0 0 16px 0; border-bottom: 1px solid #e5e7eb;">
            ${title}
          </h1>
          ${content}
        </div>
      </body>
    </html>
  `;
};

/**
 * Envía un email usando SendGrid
 * @param {string} to - Email del destinatario
 * @param {string} subject - Asunto del email
 * @param {string} html - Contenido HTML
 * @returns {Promise<boolean>} - true si se envió correctamente
 */
const sendEmail = async (to, subject, html) => {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('Email no enviado (SendGrid no configurado):', { to, subject });
    return false;
  }

  if (!to || !subject || !html) {
    console.warn('Email no enviado (faltan parámetros):', { to, subject });
    return false;
  }

  try {
    const msg = {
      to,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'mrlocked4@gmail.com',
        name: 'MXChange'
      },
      subject,
      html,
    };

    console.log('Enviando email:', { to, from: msg.from.email, subject });
    
    await sgMail.send(msg);
    console.log(`✓ Email enviado a ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error('Error enviando email:', error);
    if (error.response) {
      console.error('SendGrid error response:', error.response.body);
      if (error.code === 403 && error.response.body?.errors) {
        const fromError = error.response.body.errors.find(e => e.field === 'from');
        if (fromError) {
          console.error('\n⚠️  SOLUCIÓN: Debes verificar el correo del remitente en SendGrid:');
          console.error('   1. Ve a https://app.sendgrid.com/settings/sender_auth/senders');
          console.error('   2. Verifica el correo:', process.env.SENDGRID_FROM_EMAIL);
          console.error('   3. O cambia SENDGRID_FROM_EMAIL en .env a un correo ya verificado\n');
        }
      }
    }
    return false;
  }
};

/**
 * Envía notificación de nueva operación reservada al usuario
 */
const sendTransactionCreatedEmail = async (userEmail, transactionData) => {
  const { transaction_code, type, amount_to, amount_from, currency_to, currency_from, branch_name } = transactionData;
  const operationType = type === 'buy' ? 'COMPRA' : 'VENTA';
  const amount = type === 'buy' ? amount_to : amount_from;
  const currency = type === 'buy' ? currency_to : currency_from;
  
  const subject = `Operación de ${operationType} reservada - Código ${transaction_code}`;
  
  const content = `
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Tu operación de <strong>${operationType}</strong> ha sido creada correctamente.
    </p>
    <div style="background-color: #ffffff; border: 1px solid #e5e7eb; margin: 20px 0; padding: 20px;">
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Código de operación:</strong> ${transaction_code}
      </p>
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Tipo:</strong> ${operationType}
      </p>
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Monto:</strong> $${Number(amount).toFixed(2)} ${currency}
      </p>
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Sucursal:</strong> ${branch_name}
      </p>
    </div>
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Guarda este código para consultar el estado de tu operación.
    </p>
  `;
  
  const html = generateEmailHTML('Operación Reservada', content);
  return await sendEmail(userEmail, subject, html);
};

/**
 * Envía notificación de pago confirmado
 */
const sendPaymentConfirmedEmail = async (userEmail, transactionData) => {
  const { transaction_code } = transactionData;
  const subject = `Pago confirmado - Código ${transaction_code}`;
  
  const content = `
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Tu pago ha sido confirmado exitosamente.
    </p>
    <div style="background-color: #ffffff; border: 1px solid #e5e7eb; margin: 20px 0; padding: 20px;">
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Código de operación:</strong> ${transaction_code}
      </p>
    </div>
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Recibirás otra notificación cuando tu operación esté lista.
    </p>
  `;
  
  const html = generateEmailHTML('Pago Confirmado', content);
  return await sendEmail(userEmail, subject, html);
};

/**
 * Envía notificación de operación lista (ready_for_pickup o ready_to_receive)
 */
const sendTransactionReadyEmail = async (userEmail, transactionData) => {
  const { transaction_code, type, amount_to, amount_from, currency_to, currency_from, branch_name, status } = transactionData;
  const isPickup = status === 'ready_for_pickup';
  const operationType = type === 'buy' ? 'COMPRA' : 'VENTA';
  const amountReceive = type === 'buy' ? amount_to : amount_from;
  const currencyReceive = type === 'buy' ? currency_to : currency_from;
  const amountDeliver = type === 'sell' ? amount_from : amount_to;
  const currencyDeliver = type === 'sell' ? currency_from : currency_to;
  
  const subject = isPickup 
    ? `Tu operación está lista para recoger - Código ${transaction_code}`
    : `Tu operación está lista - Código ${transaction_code}`;
  
  const content = `
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      ${isPickup ? 'Puedes acudir a la sucursal para recoger tu dinero.' : 'Puedes acudir a la sucursal para entregar tu dinero.'}
    </p>
    <div style="background-color: #ffffff; border: 1px solid #e5e7eb; margin: 20px 0; padding: 20px;">
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Código de operación:</strong> ${transaction_code}
      </p>
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Tipo:</strong> ${operationType}
      </p>
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>${isPickup ? 'Monto a recoger' : 'Monto a entregar'}:</strong> $${Number(isPickup ? amountReceive : amountDeliver).toFixed(2)} ${isPickup ? currencyReceive : currencyDeliver}
      </p>
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Sucursal:</strong> ${branch_name}
      </p>
    </div>
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Recuerda llevar tu código de operación y una identificación oficial.
    </p>
  `;
  
  const html = generateEmailHTML(isPickup ? '¡Tu operación está lista!' : 'Tu operación está lista', content);
  return await sendEmail(userEmail, subject, html);
};

/**
 * Envía notificación de operación cancelada o expirada
 */
const sendTransactionCancelledEmail = async (userEmail, transactionData) => {
  const { transaction_code, status } = transactionData;
  const isCancelled = status === 'cancelled';
  
  const subject = `Operación ${isCancelled ? 'cancelada' : 'expirada'} - Código ${transaction_code}`;
  
  const content = `
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Tu operación ha sido ${isCancelled ? 'cancelada' : 'expirada'}.
    </p>
    <div style="background-color: #ffffff; border: 1px solid #e5e7eb; margin: 20px 0; padding: 20px;">
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Código de operación:</strong> ${transaction_code}
      </p>
    </div>
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Si tienes alguna duda, por favor contacta con soporte.
    </p>
  `;
  
  const html = generateEmailHTML(`Operación ${isCancelled ? 'Cancelada' : 'Expirada'}`, content);
  return await sendEmail(userEmail, subject, html);
};

/**
 * Envía notificación de operación completada
 */
const sendTransactionCompletedEmail = async (userEmail, transactionData) => {
  const { transaction_code, type } = transactionData;
  const operationType = type === 'buy' ? 'COMPRA' : 'VENTA';
  const subject = `Operación completada - Código ${transaction_code}`;
  
  const content = `
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Tu operación ha sido completada exitosamente.
    </p>
    <div style="background-color: #ffffff; border: 1px solid #e5e7eb; margin: 20px 0; padding: 20px;">
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Código de operación:</strong> ${transaction_code}
      </p>
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Tipo:</strong> ${operationType}
      </p>
    </div>
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Gracias por usar nuestros servicios.
    </p>
  `;
  
  const html = generateEmailHTML('¡Operación Completada!', content);
  return await sendEmail(userEmail, subject, html);
};

/**
 * Envía notificación de pago fallido
 */
const sendPaymentFailedEmail = async (userEmail, transactionData) => {
  const { transaction_code } = transactionData;
  const subject = `Pago rechazado - Código ${transaction_code}`;
  
  const content = `
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Tu pago no pudo ser procesado.
    </p>
    <div style="background-color: #ffffff; border: 1px solid #e5e7eb; margin: 20px 0; padding: 20px;">
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Código de operación:</strong> ${transaction_code}
      </p>
    </div>
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Por favor, intenta con otro método de pago. Si el problema persiste, contacta con soporte.
    </p>
  `;
  
  const html = generateEmailHTML('Pago Rechazado', content);
  return await sendEmail(userEmail, subject, html);
};

/**
 * Envía email para restablecer contraseña
 */
const sendPasswordResetEmail = async (userEmail, resetToken, userName) => {
  const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/forgotpassword?token=${resetToken}`;
  
  const subject = 'Restablecer Contraseña - MXChange';
  
  const content = `
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Hola${userName ? ` ${userName}` : ''},
    </p>
    
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Recibimos una solicitud para restablecer la contraseña de tu cuenta en MXChange.
    </p>
    
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Para restablecer tu contraseña, haz clic en el siguiente botón:
    </p>
    
    <div style="margin: 30px 0; text-align: center;">
      <a href="${resetLink}" 
         style="display: inline-block; background-color: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; font-size: 16px; font-weight: 500; border-radius: 6px;">
        Restablecer Contraseña
      </a>
    </div>
    
    <p style="color: #6b7280; font-size: 14px; line-height: 22px; margin: 20px 0;">
      O copia y pega el siguiente enlace en tu navegador:
    </p>
    
    <p style="color: #6b7280; font-size: 14px; line-height: 22px; margin: 10px 0; word-break: break-all;">
      ${resetLink}
    </p>
    
    <div style="margin: 30px 0; padding: 16px; background-color: #fef3c7; border-left: 4px solid #f59e0b;">
      <p style="color: #92400e; font-size: 14px; line-height: 22px; margin: 0;">
        <strong>⚠️ Importante:</strong> Este enlace expirará en 1 hora por seguridad.
      </p>
    </div>
    
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Si no solicitaste restablecer tu contraseña, puedes ignorar este correo de forma segura. Tu contraseña no cambiará hasta que accedas al enlace anterior y establezcas una nueva.
    </p>
    
    <div style="margin: 40px 0; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 14px; line-height: 22px; margin: 10px 0;">
        Saludos,<br>
        <strong>Equipo MXChange</strong>
      </p>
    </div>
    
    <div style="margin: 20px 0; padding: 16px; background-color: #f3f4f6; border-radius: 6px;">
      <p style="color: #6b7280; font-size: 12px; line-height: 18px; margin: 0;">
        Si tienes problemas con el botón, copia y pega el enlace completo en tu navegador. Si no solicitaste este cambio, por favor contacta a nuestro equipo de soporte de inmediato.
      </p>
    </div>
  `;
  
  const html = generateEmailHTML('Restablecer Contraseña', content);
  return await sendEmail(userEmail, subject, html);
};

/**
 * Envía notificación a los administradores y al usuario de la sucursal cuando se crea una nueva operación
 */
const sendAdminAndBranchNotification = async (transactionData, userName) => {
  const pool = require('../config/db');
  
  const { transaction_code, type, amount_to, amount_from, currency_to, currency_from, branch_name, branch_id, created_at } = transactionData;
  const operationType = type === 'buy' ? 'COMPRA' : 'VENTA';
  const amount = type === 'buy' ? amount_to : amount_from;
  const currency = type === 'buy' ? currency_to : currency_from;
  
  // Formatear fecha
  const formattedDate = created_at ? new Date(created_at).toLocaleDateString('es-MX', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) : new Date().toLocaleDateString('es-MX', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const subject = `Nueva operación de ${operationType} - ${transaction_code}`;
  
  const content = `
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Se ha registrado una nueva operación de <strong>${operationType}</strong>.
    </p>
    <div style="background-color: #ffffff; border: 1px solid #e5e7eb; margin: 20px 0; padding: 20px;">
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Usuario:</strong> ${userName}
      </p>
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Código de operación:</strong> ${transaction_code}
      </p>
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Tipo:</strong> ${operationType}
      </p>
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Monto:</strong> $${Number(amount).toFixed(2)} ${currency}
      </p>
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Sucursal:</strong> ${branch_name}
      </p>
      <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
        <strong>Fecha:</strong> ${formattedDate}
      </p>
    </div>
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Esta operación requiere seguimiento.
    </p>
  `;
  
  const html = generateEmailHTML('Nueva Operación Registrada', content);
  
  try {
    // Obtener todos los administradores
    console.log('[sendAdminAndBranchNotification] Buscando administradores...');
    const [admins] = await pool.query('SELECT email, name FROM users WHERE role = ? AND active = 1', ['admin']);
    console.log('[sendAdminAndBranchNotification] Admins encontrados:', admins);
    
    // Obtener el usuario de la sucursal específica
    console.log('[sendAdminAndBranchNotification] Buscando usuarios de sucursal con branch_id:', branch_id);
    const [branchUsers] = await pool.query('SELECT email, name FROM users WHERE role = ? AND branch_id = ? AND active = 1', ['sucursal', branch_id]);
    console.log('[sendAdminAndBranchNotification] Usuarios de sucursal encontrados:', branchUsers);
    
    // Combinar todos los destinatarios
    const recipients = [...admins, ...branchUsers];
    
    console.log(`[sendAdminAndBranchNotification] Total de destinatarios: ${recipients.length}`, recipients);
    
    if (recipients.length === 0) {
      console.warn('[sendAdminAndBranchNotification] No se encontraron destinatarios para notificar');
      return false;
    }
    
    // Enviar email a cada destinatario
    const emailPromises = recipients.map(recipient => {
      console.log(`[sendAdminAndBranchNotification] Enviando email a: ${recipient.email}`);
      return sendEmail(recipient.email, subject, html);
    });
    
    const results = await Promise.allSettled(emailPromises);
    console.log('[sendAdminAndBranchNotification] Resultados de envío:', results);
    
    return true;
  } catch (error) {
    console.error('[sendAdminAndBranchNotification] Error enviando notificaciones a admins y sucursal:', error);
    return false;
  }
};

/**
 * Envía alerta de inventario bajo a admins y usuarios de sucursal
 */
const sendLowInventoryAlert = async (branchId, branchName, currency, currentAmount, threshold, alertLevel) => {
  try {
    console.log(`[sendLowInventoryAlert] INICIANDO - Sucursal: ${branchName}, Moneda: ${currency}, Nivel: ${alertLevel}`);
    console.log(`[sendLowInventoryAlert] Disponible: ${currentAmount}, Umbral: ${threshold}`);
    
    const isCritical = alertLevel === 'CRÍTICO';
    const subject = `${isCritical ? '🚨' : '⚠️'} Alerta de Inventario ${alertLevel}: ${currency} - ${branchName}`;
    
    const boxStyle = isCritical 
      ? 'background-color: #fee2e2; border: 2px solid #ef4444; margin: 20px 0; padding: 20px;'
      : 'background-color: #fef2f2; border: 1px solid #fecaca; margin: 20px 0; padding: 20px;';
    
    const titleColor = isCritical ? '#dc2626' : '#ea580c';
    
    const content = `
      <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
        ${isCritical 
          ? 'Se ha detectado un nivel <strong>CRÍTICO</strong> de inventario en una de las sucursales. Se requiere atención inmediata.'
          : 'Se ha detectado un nivel <strong>bajo</strong> de inventario en una de las sucursales.'}
      </p>
      <div style="${boxStyle}">
        <p style="color: ${titleColor}; font-size: 16px; font-weight: 600; margin: 0 0 12px 0;">
          ${currency} - ${branchName}
        </p>
        <hr style="margin: 12px 0; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
          <strong>Inventario disponible:</strong> ${new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(currentAmount)}
        </p>
        <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
          <strong>Umbral configurado:</strong> ${new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(threshold)}
        </p>
        <p style="color: ${titleColor}; font-size: 14px; font-weight: 600; margin: 12px 0 0 0;">
          ${isCritical 
            ? '⚠️ NIVEL CRÍTICO: El inventario está por debajo del 50% del umbral'
            : '⚠️ NIVEL BAJO: El inventario está por debajo del umbral configurado'}
        </p>
      </div>
      <div style="background-color: #ffffff; border: 1px solid #e5e7eb; margin: 20px 0; padding: 20px;">
        <p style="color: #000000; font-size: 16px; font-weight: 600; margin: 0 0 12px 0;">
          Acciones recomendadas:
        </p>
        <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
          ${isCritical 
            ? '• Reabastecer la sucursal con <strong>URGENCIA</strong>'
            : '• Revisar el inventario y planificar reabastecimiento'}
        </p>
        <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
          • Revisar las operaciones pendientes
        </p>
        <p style="color: #000000; font-size: 14px; line-height: 24px; margin: 4px 0;">
          • Ajustar el umbral si es necesario
        </p>
      </div>
      <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
        Puedes gestionar el inventario desde el panel de administración.
      </p>
    `;
    
    const html = generateEmailHTML(`⚠️ Alerta de Inventario ${alertLevel}`, content);
    
    // Obtener todos los admins activos
    const pool = require('../config/db');
    const [admins] = await pool.query('SELECT email, name FROM users WHERE role = ? AND active = 1', ['admin']);
    console.log('[sendLowInventoryAlert] Admins encontrados:', admins);
    
    // Obtener usuarios de la sucursal específica
    const [branchUsers] = await pool.query('SELECT email, name FROM users WHERE role = ? AND branch_id = ? AND active = 1', ['sucursal', branchId]);
    console.log('[sendLowInventoryAlert] Usuarios de sucursal encontrados:', branchUsers);
    
    // Combinar destinatarios
    const recipients = [...admins, ...branchUsers];
    
    if (recipients.length === 0) {
      console.warn('[sendLowInventoryAlert] No se encontraron destinatarios para la alerta de inventario');
      return false;
    }
    
    console.log(`[sendLowInventoryAlert] Enviando alerta a ${recipients.length} destinatario(s)`);
    
    // Enviar email a cada destinatario
    const emailPromises = recipients.map(recipient => 
      sendEmail(recipient.email, subject, html)
    );
    
    const results = await Promise.allSettled(emailPromises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    
    console.log(`[sendLowInventoryAlert] Emails enviados: ${successful}/${recipients.length}`);
    
    return successful > 0;
  } catch (error) {
    console.error('[sendLowInventoryAlert] Error enviando alerta de inventario bajo:', error);
    return false;
  }
};

/**
 * Envía email de notificación cuando una transacción expira
 */
const sendTransactionExpiredEmail = async (data) => {
  try {
    const { email, name, transaction_code, type, amount_to, currency_to, branch_name, expired_at } = data;
    
    if (!email) {
      console.warn('[sendTransactionExpiredEmail] Email del usuario no proporcionado');
      return false;
    }

    const operationType = type === 'buy' ? 'COMPRA' : 'VENTA';
    const subject = `Reserva Expirada - ${transaction_code}`;
    
    const content = `
      <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
        Hola <strong>${name}</strong>,
      </p>
      <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
        Lamentamos informarte que tu reserva ha expirado por falta de asistencia en el tiempo establecido.
      </p>
      <div style="background-color: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; margin: 24px 0; padding: 20px; text-align: center;">
        <p style="color: #92400e; font-size: 24px; font-weight: bold; margin: 0; letter-spacing: 2px;">
          ${transaction_code}
        </p>
      </div>
      <div style="background-color: #f9fafb; border-radius: 8px; margin: 24px 0; padding: 24px;">
        <h2 style="color: #1a1a1a; font-size: 18px; font-weight: bold; margin: 0 0 16px 0;">
          Detalles de la reserva expirada
        </h2>
        <p style="color: #404040; font-size: 14px; line-height: 24px; margin: 8px 0;">
          <strong>Tipo de operación:</strong> ${operationType}
        </p>
        <p style="color: #404040; font-size: 14px; line-height: 24px; margin: 8px 0;">
          <strong>Monto:</strong> $${amount_to} ${currency_to}
        </p>
        <p style="color: #404040; font-size: 14px; line-height: 24px; margin: 8px 0;">
          <strong>Sucursal:</strong> ${branch_name}
        </p>
        ${expired_at ? `
        <p style="color: #404040; font-size: 14px; line-height: 24px; margin: 8px 0;">
          <strong>Fecha de expiración:</strong> ${new Date(expired_at).toLocaleString('es-MX')}
        </p>
        ` : ''}
      </div>
      <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; margin: 24px 0; padding: 16px 20px;">
        <p style="color: #1e40af; font-size: 14px; line-height: 22px; margin: 8px 0;">
          <strong>¿Qué significa esto?</strong>
        </p>
        <p style="color: #1e40af; font-size: 14px; line-height: 22px; margin: 8px 0;">
          ${type === 'sell' 
            ? 'Los dólares que habías reservado han sido liberados y están nuevamente disponibles para otros clientes. Si aún deseas realizar esta operación, por favor genera una nueva reserva.'
            : 'La reserva de dólares que realizaste ha expirado. Si aún deseas comprar dólares, por favor genera una nueva orden.'
          }
        </p>
      </div>
      <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
        Para realizar una nueva operación, ingresa a tu cuenta en MXChange.
      </p>
      <p style="color: #8898aa; font-size: 12px; line-height: 16px; margin: 32px 0 0 0; text-align: center;">
        Este es un correo automático del sistema MXChange.<br>
        Si tienes dudas, por favor contacta a tu sucursal.
      </p>
    `;
    
    const html = generateEmailHTML('⏰ Reserva Expirada', content);
    
    const result = await sendEmail(email, subject, html);
    
    if (result) {
      console.log(`[sendTransactionExpiredEmail] Email enviado a ${email} para ${transaction_code}`);
    } else {
      console.warn(`[sendTransactionExpiredEmail] No se pudo enviar email a ${email} para ${transaction_code}`);
    }
    
    return result;
  } catch (error) {
    console.error('[sendTransactionExpiredEmail] Error enviando email de expiración:', error);
    return false;
  }
};

module.exports = {
  sendEmail,
  sendTransactionCreatedEmail,
  sendPaymentConfirmedEmail,
  sendTransactionReadyEmail,
  sendTransactionCancelledEmail,
  sendTransactionCompletedEmail,
  sendPaymentFailedEmail,
  sendPasswordResetEmail,
  sendAdminAndBranchNotification,
  sendLowInventoryAlert,
  sendTransactionExpiredEmail,
};
