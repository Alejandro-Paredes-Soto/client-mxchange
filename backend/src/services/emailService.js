const sgMail = require('@sendgrid/mail');

// Configurar SendGrid con la API key
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.warn('⚠️  SENDGRID_API_KEY no configurada. Los emails no se enviarán.');
}

/**
 * Envía un email usando SendGrid
 * @param {string} to - Email del destinatario
 * @param {string} subject - Asunto del email
 * @param {string} text - Contenido en texto plano
 * @param {string} html - Contenido en HTML (opcional)
 * @returns {Promise<boolean>} - true si se envió correctamente
 */
const sendEmail = async (to, subject, text, html = null) => {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('Email no enviado (SendGrid no configurado):', { to, subject });
    return false;
  }

  if (!to || !subject || !text) {
    console.warn('Email no enviado (faltan parámetros):', { to, subject, text });
    return false;
  }

  try {
    const msg = {
      to,
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@mxchange.com',
      subject,
      text,
      html: html || text,
    };

    await sgMail.send(msg);
    console.log(`✓ Email enviado a ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error('Error enviando email:', error);
    if (error.response) {
      console.error('SendGrid error response:', error.response.body);
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
  const text = `Tu operación de ${operationType} de $${Number(amount).toFixed(2)} ${currency} con código ${transaction_code} fue creada correctamente en ${branch_name}.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Operación Reservada</h2>
      <p>Tu operación de <strong>${operationType}</strong> ha sido creada correctamente.</p>
      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Código de operación:</strong> ${transaction_code}</p>
        <p><strong>Tipo:</strong> ${operationType}</p>
        <p><strong>Monto:</strong> $${Number(amount).toFixed(2)} ${currency}</p>
        <p><strong>Sucursal:</strong> ${branch_name}</p>
      </div>
      <p>Guarda este código para consultar el estado de tu operación.</p>
    </div>
  `;
  
  return await sendEmail(userEmail, subject, text, html);
};

/**
 * Envía notificación de pago confirmado
 */
const sendPaymentConfirmedEmail = async (userEmail, transactionData) => {
  const { transaction_code } = transactionData;
  
  const subject = `Pago confirmado - Código ${transaction_code}`;
  const text = `Tu pago para la operación ${transaction_code} ha sido confirmado exitosamente.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #16a34a;">Pago Confirmado</h2>
      <p>Tu pago ha sido confirmado exitosamente.</p>
      <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
        <p><strong>Código de operación:</strong> ${transaction_code}</p>
      </div>
      <p>Recibirás otra notificación cuando tu operación esté lista.</p>
    </div>
  `;
  
  return await sendEmail(userEmail, subject, text, html);
};

/**
 * Envía notificación de operación lista (ready_for_pickup o ready_to_receive)
 */
const sendTransactionReadyEmail = async (userEmail, transactionData) => {
  const { transaction_code, type, amount_to, amount_from, currency_to, currency_from, branch_name, status } = transactionData;
  
  const operationType = type === 'buy' ? 'COMPRA' : 'VENTA';
  const isPickup = status === 'ready_for_pickup';
  
  let subject, text, html;
  
  if (isPickup) {
    const amountReceive = type === 'buy' ? amount_to : amount_from;
    const currencyReceive = type === 'buy' ? currency_to : currency_from;
    
    subject = `Tu operación está lista para recoger - Código ${transaction_code}`;
    text = `Tu operación de ${operationType} de $${Number(amountReceive).toFixed(2)} ${currencyReceive} con código ${transaction_code} está lista para recoger en ${branch_name}.`;
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">¡Tu operación está lista!</h2>
        <p>Puedes acudir a la sucursal para recoger tu dinero.</p>
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
          <p><strong>Código de operación:</strong> ${transaction_code}</p>
          <p><strong>Tipo:</strong> ${operationType}</p>
          <p><strong>Monto a recoger:</strong> $${Number(amountReceive).toFixed(2)} ${currencyReceive}</p>
          <p><strong>Sucursal:</strong> ${branch_name}</p>
        </div>
        <p>Recuerda llevar tu código de operación y una identificación oficial.</p>
      </div>
    `;
  } else {
    const amountDeliver = type === 'sell' ? amount_from : amount_to;
    const currencyDeliver = type === 'sell' ? currency_from : currency_to;
    
    subject = `Tu operación está lista - Código ${transaction_code}`;
    text = `Tu operación de ${operationType} de $${Number(amountDeliver).toFixed(2)} ${currencyDeliver} con código ${transaction_code} está lista. Puedes acudir a ${branch_name} para entregar tu dinero.`;
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Tu operación está lista</h2>
        <p>Puedes acudir a la sucursal para entregar tu dinero.</p>
        <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
          <p><strong>Código de operación:</strong> ${transaction_code}</p>
          <p><strong>Tipo:</strong> ${operationType}</p>
          <p><strong>Monto a entregar:</strong> $${Number(amountDeliver).toFixed(2)} ${currencyDeliver}</p>
          <p><strong>Sucursal:</strong> ${branch_name}</p>
        </div>
        <p>Recuerda llevar tu código de operación y una identificación oficial.</p>
      </div>
    `;
  }
  
  return await sendEmail(userEmail, subject, text, html);
};

/**
 * Envía notificación de operación cancelada o expirada
 */
const sendTransactionCancelledEmail = async (userEmail, transactionData) => {
  const { transaction_code, status } = transactionData;
  
  const isCancelled = status === 'cancelled';
  const subject = `Operación ${isCancelled ? 'cancelada' : 'expirada'} - Código ${transaction_code}`;
  const text = `Tu operación ${transaction_code} ha sido ${isCancelled ? 'cancelada' : 'expirada'}.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Operación ${isCancelled ? 'Cancelada' : 'Expirada'}</h2>
      <p>Tu operación ha sido ${isCancelled ? 'cancelada' : 'expirada'}.</p>
      <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
        <p><strong>Código de operación:</strong> ${transaction_code}</p>
      </div>
      <p>Si tienes alguna duda, por favor contacta con soporte.</p>
    </div>
  `;
  
  return await sendEmail(userEmail, subject, text, html);
};

/**
 * Envía notificación de operación completada
 */
const sendTransactionCompletedEmail = async (userEmail, transactionData) => {
  const { transaction_code, type, amount_to, amount_from, currency_to, currency_from } = transactionData;
  
  const operationType = type === 'buy' ? 'COMPRA' : 'VENTA';
  const subject = `Operación completada - Código ${transaction_code}`;
  const text = `Tu operación de ${operationType} con código ${transaction_code} ha sido completada exitosamente.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #16a34a;">¡Operación Completada!</h2>
      <p>Tu operación ha sido completada exitosamente.</p>
      <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
        <p><strong>Código de operación:</strong> ${transaction_code}</p>
        <p><strong>Tipo:</strong> ${operationType}</p>
      </div>
      <p>Gracias por usar nuestros servicios.</p>
    </div>
  `;
  
  return await sendEmail(userEmail, subject, text, html);
};

/**
 * Envía notificación de pago fallido
 */
const sendPaymentFailedEmail = async (userEmail, transactionData) => {
  const { transaction_code } = transactionData;
  
  const subject = `Pago rechazado - Código ${transaction_code}`;
  const text = `Tu pago para la operación ${transaction_code} fue rechazado. Por favor, intenta con otro método de pago.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Pago Rechazado</h2>
      <p>Tu pago no pudo ser procesado.</p>
      <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
        <p><strong>Código de operación:</strong> ${transaction_code}</p>
      </div>
      <p>Por favor, intenta con otro método de pago. Si el problema persiste, contacta con soporte.</p>
    </div>
  `;
  
  return await sendEmail(userEmail, subject, text, html);
};

module.exports = {
  sendEmail,
  sendTransactionCreatedEmail,
  sendPaymentConfirmedEmail,
  sendTransactionReadyEmail,
  sendTransactionCancelledEmail,
  sendTransactionCompletedEmail,
  sendPaymentFailedEmail,
};
