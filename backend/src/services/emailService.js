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

module.exports = {
  sendEmail,
  sendTransactionCreatedEmail,
  sendPaymentConfirmedEmail,
  sendTransactionReadyEmail,
  sendTransactionCancelledEmail,
  sendTransactionCompletedEmail,
  sendPaymentFailedEmail,
};
