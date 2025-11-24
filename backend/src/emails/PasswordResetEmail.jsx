/**
 * Template de email para restablecer contraseña
 * Este template se usa cuando un usuario solicita restablecer su contraseña
 */

const PasswordResetEmail = ({ resetLink, userName }) => {
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
            Restablecer Contraseña
          </h1>
          
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
        </div>
      </body>
    </html>
  `;
};

module.exports = PasswordResetEmail;
