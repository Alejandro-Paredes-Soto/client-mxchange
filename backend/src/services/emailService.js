const sgMail = require('@sendgrid/mail');

// Configurar SendGrid con la API key
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.warn('⚠️  SENDGRID_API_KEY no configurada. Los emails no se enviarán.');
}

/**
 * Genera HTML para emails con logo MXChange y mejor deliverability
 */
const generateEmailHTML = (title, content) => {
  const currentYear = new Date().getFullYear();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  
  return `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - MXChange</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          
          <!-- Logo Header -->
          <div style="background-color: #ffffff; padding: 32px 24px; text-align: center; border-radius: 8px 8px 0 0; border: 1px solid #e5e7eb; border-bottom: none;">
            <h1 style="margin: 0; font-size: 36px; font-weight: bold; color: #006644; letter-spacing: -1px;">
              M<span style="font-size: 48px; color: #00a86b;">X</span>change
            </h1>
            <p style="margin: 8px 0 0 0; font-weight: 300; color: #666666; font-size: 14px;">
              Compra y vende divisas al mejor precio
            </p>
          </div>
          
          <!-- Title Banner -->
          <div style="background-color: #000000; padding: 20px 24px; text-align: center;">
            <h2 style="color: #ffffff; font-size: 20px; font-weight: 600; margin: 0; letter-spacing: -0.3px;">
              ${title}
            </h2>
          </div>
          
          <!-- Main Content -->
          <div style="background-color: #ffffff; padding: 32px 24px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
            ${content}
          </div>
          
          <!-- Info Section -->
          <div style="background-color: #f0fdf4; padding: 20px 24px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
            <p style="color: #166534; font-size: 14px; line-height: 22px; margin: 0; text-align: center;">
              <strong>¿Necesitas ayuda?</strong> Nuestro equipo de soporte está disponible para asistirte en cualquier momento.
            </p>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #1a1a1a; padding: 24px; border-radius: 0 0 8px 8px;">
            <div style="text-align: center; margin-bottom: 16px;">
              <span style="font-size: 24px; font-weight: bold; color: #006644;">
                M<span style="font-size: 30px; color: #00a86b;">X</span>change
              </span>
            </div>
            <p style="color: #a0a0a0; font-size: 13px; line-height: 20px; margin: 0 0 12px 0; text-align: center;">
              Tu casa de cambio de confianza. Operaciones seguras, tasas competitivas y servicio personalizado.
            </p>
            <hr style="border: none; border-top: 1px solid #333333; margin: 16px 0;" />
            <p style="color: #666666; font-size: 12px; line-height: 18px; margin: 0; text-align: center;">
              © ${currentYear} MXChange. Todos los derechos reservados.<br>
              Este es un correo automático, por favor no responder directamente.
            </p>
          </div>
          
          <!-- Legal / Privacy -->
          <div style="padding: 16px; text-align: center;">
            <p style="color: #9ca3af; font-size: 11px; line-height: 16px; margin: 0;">
              Recibes este correo porque tienes una cuenta activa en MXChange o realizaste una operación recientemente.
              Si crees que recibiste este correo por error, por favor ignóralo o contacta a soporte.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
};

/**
 * Convierte HTML a texto plano para la versión alternativa del email
 * @param {string} html - Contenido HTML
 * @returns {string} - Texto plano
 */
const htmlToPlainText = (html) => {
  return html
    // Reemplazar saltos de línea y tabs
    .replace(/[\r\n\t]+/g, ' ')
    // Convertir <br> a saltos de línea
    .replace(/<br\s*\/?>/gi, '\n')
    // Convertir </p>, </div>, </h1>, etc. a doble salto de línea
    .replace(/<\/(p|div|h[1-6]|tr|li)>/gi, '\n\n')
    // Convertir <li> a viñetas
    .replace(/<li[^>]*>/gi, '• ')
    // Convertir <hr> a línea separadora
    .replace(/<hr[^>]*>/gi, '\n---\n')
    // Extraer texto de enlaces: <a href="url">texto</a> -> texto (url)
    .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    // Convertir <strong> y <b> a *texto*
    .replace(/<(strong|b)[^>]*>([^<]*)<\/(strong|b)>/gi, '*$2*')
    // Eliminar todas las demás etiquetas HTML
    .replace(/<[^>]+>/g, '')
    // Decodificar entidades HTML comunes
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Limpiar espacios múltiples
    .replace(/ +/g, ' ')
    // Limpiar saltos de línea múltiples (más de 2)
    .replace(/\n{3,}/g, '\n\n')
    // Trim cada línea
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim();
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
    // Generar versión de texto plano para mejorar deliverability
    const textContent = htmlToPlainText(html);

    const msg = {
      to,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'mrlocked4@gmail.com',
        name: 'MXChange'
      },
      subject,
      html,
      text: textContent, // Versión text/plain para evitar MIME_HTML_ONLY
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
  const { transaction_code, type, amount_to, amount_from, currency_to, currency_from, branch_name, exchange_rate, created_at } = transactionData;
  const operationType = type === 'buy' ? 'COMPRA' : 'VENTA';
  const amountFrom = type === 'buy' ? amount_from : amount_to;
  const amountTo = type === 'buy' ? amount_to : amount_from;
  const currencyFrom = type === 'buy' ? currency_from : currency_to;
  const currencyTo = type === 'buy' ? currency_to : currency_from;
  
  const formattedDate = created_at ? new Date(created_at).toLocaleString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : new Date().toLocaleString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const subject = `✅ Operación de ${operationType} reservada - ${transaction_code} | MXCHANGE`;

  const content = `
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      ¡Excelente! Tu operación de <strong>${operationType}</strong> ha sido creada correctamente y está pendiente de completarse.
    </p>
    
    <!-- Código destacado -->
    <div style="background-color: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; margin: 24px 0; padding: 20px; text-align: center;">
      <p style="color: #166534; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">Código de operación</p>
      <p style="color: #166534; font-size: 28px; font-weight: bold; margin: 0; letter-spacing: 2px;">${transaction_code}</p>
    </div>
    
    <!-- Detalles de la operación -->
    <div style="background-color: #f9fafb; border-radius: 8px; margin: 24px 0; padding: 24px;">
      <h3 style="color: #000000; font-size: 16px; font-weight: 600; margin: 0 0 16px 0; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">📋 Detalles de la operación</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Tipo de operación:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">${operationType}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">${type === 'buy' ? 'Entregas' : 'Recibes'}:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">$${Number(amountFrom).toLocaleString('es-MX', {minimumFractionDigits: 2})} ${currencyFrom}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">${type === 'buy' ? 'Recibes' : 'Entregas'}:</td>
          <td style="color: #00a86b; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">$${Number(amountTo).toLocaleString('es-MX', {minimumFractionDigits: 2})} ${currencyTo}</td>
        </tr>
        ${exchange_rate ? `<tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Tipo de cambio:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">$${Number(exchange_rate).toFixed(4)}</td>
        </tr>` : ''}
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Sucursal:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">📍 ${branch_name}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Fecha de reserva:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right;">${formattedDate}</td>
        </tr>
      </table>
    </div>
    
    <!-- Próximos pasos -->
    <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; margin: 24px 0; padding: 16px 20px;">
      <h4 style="color: #1e40af; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">📌 Próximos pasos</h4>
      <p style="color: #1e40af; font-size: 14px; line-height: 22px; margin: 0;">
        ${type === 'buy' 
          ? 'Acude a la sucursal indicada con tu identificación oficial y el dinero en efectivo para completar tu compra de divisas.'
          : 'Acude a la sucursal indicada con tu identificación oficial y las divisas para completar tu venta.'}
      </p>
    </div>
    
    <p style="color: #6b7280; font-size: 14px; line-height: 22px; margin: 20px 0;">
      <strong>Importante:</strong> Guarda este código de operación. Lo necesitarás para cualquier consulta o para completar tu transacción en sucursal.
    </p>
  `;

  const html = generateEmailHTML('✅ Operación Reservada', content);
  return await sendEmail(userEmail, subject, html);
};

/**
 * Envía notificación de pago confirmado
 */
const sendPaymentConfirmedEmail = async (userEmail, transactionData) => {
  const { transaction_code, type, amount_to, amount_from, currency_to, currency_from, branch_name } = transactionData;
  const operationType = type === 'buy' ? 'COMPRA' : 'VENTA';
  const amountTo = type === 'buy' ? amount_to : amount_from;
  const currencyTo = type === 'buy' ? currency_to : currency_from;
  
  const subject = `💳 Pago confirmado - ${transaction_code} | MXCHANGE`;

  const content = `
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      ¡Excelente noticia! Tu pago ha sido <strong>confirmado exitosamente</strong>.
    </p>
    
    <!-- Confirmación visual -->
    <div style="background-color: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; margin: 24px 0; padding: 24px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
      <p style="color: #166534; font-size: 18px; font-weight: 600; margin: 0;">Pago Recibido</p>
      <p style="color: #166534; font-size: 14px; margin: 8px 0 0 0;">Tu transacción está siendo procesada</p>
    </div>
    
    <!-- Detalles -->
    <div style="background-color: #f9fafb; border-radius: 8px; margin: 24px 0; padding: 24px;">
      <h3 style="color: #000000; font-size: 16px; font-weight: 600; margin: 0 0 16px 0;">📋 Resumen de la operación</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Código:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">${transaction_code}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Tipo:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right;">${operationType}</td>
        </tr>
        ${amountTo ? `<tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Monto:</td>
          <td style="color: #00a86b; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">$${Number(amountTo).toLocaleString('es-MX', {minimumFractionDigits: 2})} ${currencyTo}</td>
        </tr>` : ''}
        ${branch_name ? `<tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Sucursal:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right;">📍 ${branch_name}</td>
        </tr>` : ''}
      </table>
    </div>
    
    <!-- Próximos pasos -->
    <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; margin: 24px 0; padding: 16px 20px;">
      <h4 style="color: #1e40af; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">⏳ ¿Qué sigue?</h4>
      <p style="color: #1e40af; font-size: 14px; line-height: 22px; margin: 0;">
        Estamos preparando tu operación. Recibirás otra notificación por correo electrónico cuando tu dinero esté listo para ser recogido en la sucursal.
      </p>
    </div>
    
    <p style="color: #6b7280; font-size: 14px; line-height: 22px; margin: 20px 0;">
      Gracias por confiar en MXChange para tus operaciones de cambio de divisas.
    </p>
  `;

  const html = generateEmailHTML('💳 Pago Confirmado', content);
  return await sendEmail(userEmail, subject, html);
};

/**
 * Envía notificación de operación lista (ready_for_pickup o ready_to_receive)
 */
const sendTransactionReadyEmail = async (userEmail, transactionData) => {
  const { transaction_code, type, amount_to, amount_from, currency_to, currency_from, branch_name, status, exchange_rate } = transactionData;
  const isPickup = status === 'ready_for_pickup';
  const operationType = type === 'buy' ? 'COMPRA' : 'VENTA';
  const amountReceive = type === 'buy' ? amount_to : amount_from;
  const currencyReceive = type === 'buy' ? currency_to : currency_from;
  const amountDeliver = type === 'sell' ? amount_from : amount_to;
  const currencyDeliver = type === 'sell' ? currency_from : currency_to;

  const subject = isPickup
    ? `🎉 ¡Tu dinero está listo! - ${transaction_code} | MXCHANGE`
    : `📍 Tu operación está lista - ${transaction_code} | MXCHANGE`;

  const content = `
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      ${isPickup 
        ? '¡Excelentes noticias! Tu dinero ya está <strong>disponible para recoger</strong> en la sucursal.' 
        : 'Tu operación está lista. Ya puedes <strong>acudir a la sucursal</strong> para entregar tu dinero.'}
    </p>
    
    <!-- Banner de acción -->
    <div style="background-color: ${isPickup ? '#f0fdf4' : '#eff6ff'}; border: 2px solid ${isPickup ? '#22c55e' : '#3b82f6'}; border-radius: 8px; margin: 24px 0; padding: 24px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 12px;">${isPickup ? '💵' : '🏦'}</div>
      <p style="color: ${isPickup ? '#166534' : '#1e40af'}; font-size: 18px; font-weight: 600; margin: 0;">
        ${isPickup ? '¡Listo para recoger!' : 'Te esperamos en sucursal'}
      </p>
    </div>
    
    <!-- Código destacado -->
    <div style="background-color: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; margin: 24px 0; padding: 20px; text-align: center;">
      <p style="color: #92400e; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">Presenta este código en caja</p>
      <p style="color: #92400e; font-size: 28px; font-weight: bold; margin: 0; letter-spacing: 2px;">${transaction_code}</p>
    </div>
    
    <!-- Detalles de la operación -->
    <div style="background-color: #f9fafb; border-radius: 8px; margin: 24px 0; padding: 24px;">
      <h3 style="color: #000000; font-size: 16px; font-weight: 600; margin: 0 0 16px 0; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">📋 Detalles de tu operación</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Tipo de operación:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">${operationType}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">${isPickup ? 'Monto a recoger' : 'Monto a entregar'}:</td>
          <td style="color: #00a86b; font-size: 16px; padding: 8px 0; text-align: right; font-weight: bold;">$${Number(isPickup ? amountReceive : amountDeliver).toLocaleString('es-MX', {minimumFractionDigits: 2})} ${isPickup ? currencyReceive : currencyDeliver}</td>
        </tr>
        ${exchange_rate ? `<tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Tipo de cambio:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right;">$${Number(exchange_rate).toFixed(4)}</td>
        </tr>` : ''}
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Sucursal:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">📍 ${branch_name}</td>
        </tr>
      </table>
    </div>
    
    <!-- Requisitos -->
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 4px; margin: 24px 0; padding: 16px 20px;">
      <h4 style="color: #dc2626; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">📋 No olvides llevar:</h4>
      <ul style="color: #dc2626; font-size: 14px; line-height: 24px; margin: 0; padding-left: 20px;">
        <li>Identificación oficial vigente (INE, pasaporte)</li>
        <li>Tu código de operación: <strong>${transaction_code}</strong></li>
        ${!isPickup ? `<li>El monto exacto a entregar: <strong>$${Number(amountDeliver).toLocaleString('es-MX', {minimumFractionDigits: 2})} ${currencyDeliver}</strong></li>` : ''}
      </ul>
    </div>
    
    <p style="color: #6b7280; font-size: 14px; line-height: 22px; margin: 20px 0;">
      Te esperamos en la sucursal <strong>${branch_name}</strong>. Si tienes alguna pregunta, no dudes en contactarnos.
    </p>
  `;

  const html = generateEmailHTML(isPickup ? '🎉 ¡Tu dinero está listo!' : '📍 Operación Lista', content);
  return await sendEmail(userEmail, subject, html);
};

/**
 * Envía notificación de operación cancelada o expirada
 */
const sendTransactionCancelledEmail = async (userEmail, transactionData) => {
  const { transaction_code, status, type, amount_to, currency_to, branch_name } = transactionData;
  const isCancelled = status === 'cancelled';
  const operationType = type === 'buy' ? 'COMPRA' : 'VENTA';

  const subject = `${isCancelled ? '❌' : '⏰'} Operación ${isCancelled ? 'cancelada' : 'expirada'} - ${transaction_code} | MXCHANGE`;

  const content = `
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Lamentamos informarte que tu operación ha sido <strong>${isCancelled ? 'cancelada' : 'expirada'}</strong>.
    </p>
    
    <!-- Alerta visual -->
    <div style="background-color: ${isCancelled ? '#fef2f2' : '#fef3c7'}; border: 2px solid ${isCancelled ? '#ef4444' : '#f59e0b'}; border-radius: 8px; margin: 24px 0; padding: 24px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 12px;">${isCancelled ? '❌' : '⏰'}</div>
      <p style="color: ${isCancelled ? '#dc2626' : '#92400e'}; font-size: 18px; font-weight: 600; margin: 0;">
        Operación ${isCancelled ? 'Cancelada' : 'Expirada'}
      </p>
    </div>
    
    <!-- Detalles -->
    <div style="background-color: #f9fafb; border-radius: 8px; margin: 24px 0; padding: 24px;">
      <h3 style="color: #000000; font-size: 16px; font-weight: 600; margin: 0 0 16px 0;">📋 Detalles de la operación</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Código:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">${transaction_code}</td>
        </tr>
        ${type ? `<tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Tipo:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right;">${operationType}</td>
        </tr>` : ''}
        ${amount_to ? `<tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Monto:</td>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0; text-align: right; text-decoration: line-through;">$${Number(amount_to).toLocaleString('es-MX', {minimumFractionDigits: 2})} ${currency_to}</td>
        </tr>` : ''}
        ${branch_name ? `<tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Sucursal:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right;">📍 ${branch_name}</td>
        </tr>` : ''}
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Estado:</td>
          <td style="color: ${isCancelled ? '#dc2626' : '#92400e'}; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">${isCancelled ? 'Cancelada' : 'Expirada'}</td>
        </tr>
      </table>
    </div>
    
    <!-- Explicación -->
    <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; margin: 24px 0; padding: 16px 20px;">
      <h4 style="color: #1e40af; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">💡 ¿Qué significa esto?</h4>
      <p style="color: #1e40af; font-size: 14px; line-height: 22px; margin: 0;">
        ${isCancelled 
          ? 'La operación fue cancelada. Si tenías fondos reservados, estos han sido liberados.' 
          : 'La operación expiró porque no se completó en el tiempo establecido. Los fondos reservados han sido liberados y están disponibles nuevamente.'}
      </p>
    </div>
    
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Si deseas realizar una nueva operación, puedes hacerlo desde nuestra plataforma en cualquier momento.
    </p>
    
    <p style="color: #6b7280; font-size: 14px; line-height: 22px; margin: 20px 0;">
      Si tienes alguna pregunta o crees que esto fue un error, por favor contacta a nuestro equipo de soporte.
    </p>
  `;

  const html = generateEmailHTML(`${isCancelled ? '❌' : '⏰'} Operación ${isCancelled ? 'Cancelada' : 'Expirada'}`, content);
  return await sendEmail(userEmail, subject, html);
};

/**
 * Envía notificación de operación completada
 */
const sendTransactionCompletedEmail = async (userEmail, transactionData) => {
  const { transaction_code, type, amount_to, amount_from, currency_to, currency_from, branch_name, exchange_rate, completed_at } = transactionData;
  const operationType = type === 'buy' ? 'COMPRA' : 'VENTA';
  const amountReceived = type === 'buy' ? amount_to : amount_from;
  const currencyReceived = type === 'buy' ? currency_to : currency_from;
  const amountPaid = type === 'buy' ? amount_from : amount_to;
  const currencyPaid = type === 'buy' ? currency_from : currency_to;
  
  const formattedDate = completed_at ? new Date(completed_at).toLocaleString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : new Date().toLocaleString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  
  const subject = `🎉 ¡Operación completada! - ${transaction_code} | MXCHANGE`;

  const content = `
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      ¡Felicidades! Tu operación de ${operationType} ha sido <strong>completada exitosamente</strong>.
    </p>
    
    <!-- Celebración visual -->
    <div style="background-color: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; margin: 24px 0; padding: 24px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 12px;">🎉</div>
      <p style="color: #166534; font-size: 20px; font-weight: 600; margin: 0;">¡Transacción Exitosa!</p>
      <p style="color: #166534; font-size: 14px; margin: 8px 0 0 0;">Gracias por confiar en MXChange</p>
    </div>
    
    <!-- Resumen de la transacción -->
    <div style="background-color: #f9fafb; border-radius: 8px; margin: 24px 0; padding: 24px;">
      <h3 style="color: #000000; font-size: 16px; font-weight: 600; margin: 0 0 16px 0; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">🧾 Resumen de tu operación</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Código de operación:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">${transaction_code}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Tipo de operación:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right;">${operationType}</td>
        </tr>
        ${amountPaid ? `<tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Monto pagado:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right;">$${Number(amountPaid).toLocaleString('es-MX', {minimumFractionDigits: 2})} ${currencyPaid}</td>
        </tr>` : ''}
        ${amountReceived ? `<tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Monto recibido:</td>
          <td style="color: #00a86b; font-size: 16px; padding: 8px 0; text-align: right; font-weight: bold;">$${Number(amountReceived).toLocaleString('es-MX', {minimumFractionDigits: 2})} ${currencyReceived}</td>
        </tr>` : ''}
        ${exchange_rate ? `<tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Tipo de cambio aplicado:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right;">$${Number(exchange_rate).toFixed(4)}</td>
        </tr>` : ''}
        ${branch_name ? `<tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Sucursal:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right;">📍 ${branch_name}</td>
        </tr>` : ''}
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Fecha de completado:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right;">${formattedDate}</td>
        </tr>
        <tr style="border-top: 2px solid #e5e7eb;">
          <td style="color: #166534; font-size: 14px; padding: 12px 0 8px 0; font-weight: 600;">Estado:</td>
          <td style="color: #166534; font-size: 14px; padding: 12px 0 8px 0; text-align: right; font-weight: 600;">✅ COMPLETADA</td>
        </tr>
      </table>
    </div>
    
    <!-- Mensaje de agradecimiento -->
    <div style="background-color: #f0fdf4; border-radius: 8px; margin: 24px 0; padding: 20px; text-align: center;">
      <p style="color: #166534; font-size: 16px; line-height: 24px; margin: 0;">
        💚 <strong>¡Gracias por elegir MXChange!</strong><br>
        <span style="font-size: 14px;">Esperamos verte pronto en tu próxima operación de cambio.</span>
      </p>
    </div>
    
    <p style="color: #6b7280; font-size: 14px; line-height: 22px; margin: 20px 0;">
      Este correo sirve como comprobante de tu transacción. Te recomendamos guardarlo para tus registros.
    </p>
  `;

  const html = generateEmailHTML('🎉 ¡Operación Completada!', content);
  return await sendEmail(userEmail, subject, html);
};

/**
 * Envía notificación de pago fallido
 */
const sendPaymentFailedEmail = async (userEmail, transactionData) => {
  const { transaction_code, type, amount_from, currency_from, error_message } = transactionData;
  const operationType = type === 'buy' ? 'COMPRA' : 'VENTA';
  
  const subject = `⚠️ Pago rechazado - ${transaction_code} | MXCHANGE`;

  const content = `
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Lamentamos informarte que <strong>tu pago no pudo ser procesado</strong>.
    </p>
    
    <!-- Alerta visual -->
    <div style="background-color: #fef2f2; border: 2px solid #ef4444; border-radius: 8px; margin: 24px 0; padding: 24px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
      <p style="color: #dc2626; font-size: 18px; font-weight: 600; margin: 0;">Pago Rechazado</p>
      <p style="color: #dc2626; font-size: 14px; margin: 8px 0 0 0;">Tu operación sigue activa</p>
    </div>
    
    <!-- Detalles -->
    <div style="background-color: #f9fafb; border-radius: 8px; margin: 24px 0; padding: 24px;">
      <h3 style="color: #000000; font-size: 16px; font-weight: 600; margin: 0 0 16px 0;">📋 Detalles de la operación</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Código:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">${transaction_code}</td>
        </tr>
        ${type ? `<tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Tipo:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right;">${operationType}</td>
        </tr>` : ''}
        ${amount_from ? `<tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Monto intentado:</td>
          <td style="color: #dc2626; font-size: 14px; padding: 8px 0; text-align: right;">$${Number(amount_from).toLocaleString('es-MX', {minimumFractionDigits: 2})} ${currency_from}</td>
        </tr>` : ''}
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Estado del pago:</td>
          <td style="color: #dc2626; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">❌ Rechazado</td>
        </tr>
      </table>
    </div>
    
    ${error_message ? `
    <!-- Error específico -->
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 4px; margin: 24px 0; padding: 16px 20px;">
      <h4 style="color: #dc2626; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">Motivo del rechazo:</h4>
      <p style="color: #dc2626; font-size: 14px; line-height: 22px; margin: 0;">${error_message}</p>
    </div>
    ` : ''}
    
    <!-- Posibles soluciones -->
    <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; margin: 24px 0; padding: 16px 20px;">
      <h4 style="color: #1e40af; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">💡 Posibles soluciones:</h4>
      <ul style="color: #1e40af; font-size: 14px; line-height: 24px; margin: 0; padding-left: 20px;">
        <li>Verifica que los datos de tu tarjeta sean correctos</li>
        <li>Asegúrate de tener fondos suficientes</li>
        <li>Intenta con otro método de pago</li>
        <li>Contacta a tu banco si el problema persiste</li>
      </ul>
    </div>
    
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      <strong>Tu operación sigue activa.</strong> Puedes intentar realizar el pago nuevamente desde nuestra plataforma.
    </p>
    
    <p style="color: #6b7280; font-size: 14px; line-height: 22px; margin: 20px 0;">
      Si necesitas ayuda adicional, nuestro equipo de soporte está disponible para asistirte.
    </p>
  `;

  const html = generateEmailHTML('⚠️ Pago Rechazado', content);
  return await sendEmail(userEmail, subject, html);
};

/**
 * Envía email para restablecer contraseña
 */
const sendPasswordResetEmail = async (userEmail, resetToken, userName) => {
  const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/forgotpassword?token=${resetToken}`;

  const subject = '🔐 Restablecer Contraseña - MXChange | MXCHANGE';

  const content = `
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Hola${userName ? ` <strong>${userName}</strong>` : ''},
    </p>
    
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Recibimos una solicitud para restablecer la contraseña de tu cuenta en MXChange. Si tú realizaste esta solicitud, sigue las instrucciones a continuación.
    </p>
    
    <!-- Botón de acción principal -->
    <div style="background-color: #f9fafb; border-radius: 8px; margin: 24px 0; padding: 32px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">🔐</div>
      <p style="color: #000000; font-size: 16px; margin: 0 0 20px 0;">
        Haz clic en el botón para crear una nueva contraseña:
      </p>
      <a href="${resetLink}" 
         style="display: inline-block; background-color: #00a86b; color: #ffffff; padding: 16px 32px; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        Restablecer Contraseña
      </a>
    </div>
    
    <!-- Enlace alternativo -->
    <div style="background-color: #f3f4f6; border-radius: 6px; margin: 24px 0; padding: 16px;">
      <p style="color: #6b7280; font-size: 13px; line-height: 20px; margin: 0 0 8px 0;">
        ¿El botón no funciona? Copia y pega este enlace en tu navegador:
      </p>
      <p style="color: #3b82f6; font-size: 13px; line-height: 20px; margin: 0; word-break: break-all;">
        ${resetLink}
      </p>
    </div>
    
    <!-- Advertencia de tiempo -->
    <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; margin: 24px 0; padding: 16px;">
      <p style="color: #92400e; font-size: 14px; line-height: 22px; margin: 0;">
        <strong>⏰ Importante:</strong> Este enlace expirará en <strong>1 hora</strong> por motivos de seguridad. Si el enlace expira, deberás solicitar uno nuevo.
      </p>
    </div>
    
    <!-- Seguridad -->
    <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px; margin: 24px 0; padding: 16px 20px;">
      <h4 style="color: #1e40af; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">🛡️ Consejos de seguridad:</h4>
      <ul style="color: #1e40af; font-size: 14px; line-height: 24px; margin: 0; padding-left: 20px;">
        <li>Nunca compartas este enlace con nadie</li>
        <li>MXChange nunca te pedirá tu contraseña por correo o teléfono</li>
        <li>Usa una contraseña única y segura</li>
      </ul>
    </div>
    
    <p style="color: #6b7280; font-size: 14px; line-height: 22px; margin: 20px 0;">
      Si no solicitaste restablecer tu contraseña, puedes ignorar este correo de forma segura. Tu contraseña actual seguirá siendo válida y no se realizará ningún cambio en tu cuenta.
    </p>
    
    <p style="color: #6b7280; font-size: 14px; line-height: 22px; margin: 20px 0;">
      Si crees que alguien más solicitó este cambio, te recomendamos contactar a nuestro equipo de soporte inmediatamente.
    </p>
  `;

  const html = generateEmailHTML('🔐 Restablecer Contraseña', content);
  return await sendEmail(userEmail, subject, html);
};

/**
 * Envía notificación a los administradores y al usuario de la sucursal cuando se crea una nueva operación
 */
const sendAdminAndBranchNotification = async (transactionData, userName) => {
  const pool = require('../config/db');

  const { transaction_code, type, amount_to, amount_from, currency_to, currency_from, branch_name, branch_id, created_at, exchange_rate } = transactionData;
  const operationType = type === 'buy' ? 'COMPRA' : 'VENTA';
  const amountFrom = type === 'buy' ? amount_from : amount_to;
  const amountTo = type === 'buy' ? amount_to : amount_from;
  const currencyFrom = type === 'buy' ? currency_from : currency_to;
  const currencyTo = type === 'buy' ? currency_to : currency_from;

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

  const subject = `📥 Nueva operación de ${operationType} - ${transaction_code} | MXCHANGE`;

  const content = `
    <p style="color: #000000; font-size: 16px; line-height: 26px; margin: 20px 0;">
      Se ha registrado una <strong>nueva operación de ${operationType}</strong> que requiere seguimiento.
    </p>
    
    <!-- Alerta de nueva operación -->
    <div style="background-color: #eff6ff; border: 2px solid #3b82f6; border-radius: 8px; margin: 24px 0; padding: 20px; text-align: center;">
      <p style="color: #1e40af; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">Nueva Operación</p>
      <p style="color: #1e40af; font-size: 24px; font-weight: bold; margin: 0; letter-spacing: 2px;">${transaction_code}</p>
    </div>
    
    <!-- Detalles de la operación -->
    <div style="background-color: #f9fafb; border-radius: 8px; margin: 24px 0; padding: 24px;">
      <h3 style="color: #000000; font-size: 16px; font-weight: 600; margin: 0 0 16px 0; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">📋 Detalles de la operación</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Cliente:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">👤 ${userName}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Tipo de operación:</td>
          <td style="color: ${type === 'buy' ? '#166534' : '#1e40af'}; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">${operationType}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Cliente ${type === 'buy' ? 'entrega' : 'recibe'}:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right;">$${Number(amountFrom).toLocaleString('es-MX', {minimumFractionDigits: 2})} ${currencyFrom}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Cliente ${type === 'buy' ? 'recibe' : 'entrega'}:</td>
          <td style="color: #00a86b; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">$${Number(amountTo).toLocaleString('es-MX', {minimumFractionDigits: 2})} ${currencyTo}</td>
        </tr>
        ${exchange_rate ? `<tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Tipo de cambio:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right;">$${Number(exchange_rate).toFixed(4)}</td>
        </tr>` : ''}
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Sucursal:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right; font-weight: 600;">📍 ${branch_name}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; font-size: 14px; padding: 8px 0;">Fecha de registro:</td>
          <td style="color: #000000; font-size: 14px; padding: 8px 0; text-align: right;">${formattedDate}</td>
        </tr>
      </table>
    </div>
    
    <!-- Acción requerida -->
    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px; margin: 24px 0; padding: 16px 20px;">
      <h4 style="color: #92400e; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">⚠️ Acción requerida</h4>
      <p style="color: #92400e; font-size: 14px; line-height: 22px; margin: 0;">
        Esta operación está pendiente de atención. Por favor, da seguimiento desde el panel de administración.
      </p>
    </div>
    
    <p style="color: #6b7280; font-size: 14px; line-height: 22px; margin: 20px 0;">
      Este es un correo automático del sistema de notificaciones de MXChange.
    </p>
  `;

  const html = generateEmailHTML('📥 Nueva Operación Registrada', content);

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
    const subject = `${isCritical ? '🚨' : '⚠️'} Alerta de Inventario ${alertLevel}: ${currency} - ${branchName} | MXCHANGE`;

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
    const subject = `Reserva Expirada - ${transaction_code} | MXCHANGE`;

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
