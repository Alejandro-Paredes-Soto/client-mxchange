# Configuración de Notificaciones por Email con SendGrid

Este documento explica cómo configurar las notificaciones por correo electrónico usando SendGrid.

## Prerrequisitos

1. Tener una cuenta en SendGrid (https://sendgrid.com)
2. Verificar tu dominio o email de envío en SendGrid
3. Obtener una API Key de SendGrid

## Pasos de Configuración

### 1. Crear una cuenta en SendGrid

1. Visita https://sendgrid.com y crea una cuenta gratuita
2. Completa el proceso de verificación de tu cuenta

### 2. Obtener una API Key

1. Inicia sesión en SendGrid
2. Ve a **Settings** → **API Keys**
3. Click en **Create API Key**
4. Selecciona **Full Access** o **Restricted Access** (con permisos de envío de correos)
5. Dale un nombre descriptivo (por ejemplo: "MXChange Backend")
6. Copia la API Key generada (solo se mostrará una vez)

### 3. Verificar el email de envío

#### Opción A: Email único (para desarrollo/testing)
1. Ve a **Settings** → **Sender Authentication** → **Single Sender Verification**
2. Click en **Create New Sender**
3. Completa el formulario con tus datos
4. Verifica el email que recibirás en tu correo

#### Opción B: Dominio completo (para producción)
1. Ve a **Settings** → **Sender Authentication** → **Domain Authentication**
2. Sigue los pasos para verificar tu dominio
3. Agrega los registros DNS indicados

### 4. Configurar las variables de entorno

Edita el archivo `.env` en el backend:

```env
# SendGrid Configuration
SENDGRID_API_KEY=SG.tu_api_key_aqui
SENDGRID_FROM_EMAIL=noreply@tudominio.com
```

**Importante:** 
- Reemplaza `SG.tu_api_key_aqui` con tu API Key de SendGrid
- Reemplaza `noreply@tudominio.com` con el email verificado en SendGrid

### 5. Reiniciar el servidor

```bash
npm run dev
# o
npm start
```

## Notificaciones que se envían por email

El sistema envía automáticamente emails en las siguientes situaciones:

### Para Clientes (Usuarios):

1. **Operación creada/reservada**
   - Se envía cuando el cliente crea una nueva operación
   - Incluye: código de operación, tipo, monto y sucursal

2. **Pago confirmado**
   - Se envía cuando el pago es procesado exitosamente
   - Incluye: código de operación

3. **Pago rechazado**
   - Se envía cuando el pago falla
   - Incluye: código de operación y mensaje de reintentar

4. **Operación lista para recoger** (ready_for_pickup)
   - Se envía cuando la operación está lista para que el cliente recoja su dinero
   - Incluye: código, monto a recoger, sucursal

5. **Operación lista para recibir** (ready_to_receive)
   - Se envía cuando la operación está lista para que el cliente entregue su dinero
   - Incluye: código, monto a entregar, sucursal

6. **Operación cancelada o expirada**
   - Se envía cuando una operación es cancelada o expira
   - Incluye: código de operación

7. **Operación completada**
   - Se envía cuando la transacción finaliza exitosamente
   - Incluye: código de operación

## Personalización de Emails

Los templates de email están en: `backend/src/services/emailService.js`

Puedes personalizar:
- El contenido HTML de cada email
- Los estilos CSS inline
- Los mensajes y títulos
- Agregar logos o imágenes (hosting externo requerido)

### Ejemplo de personalización:

```javascript
const html = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <img src="https://tu-dominio.com/logo.png" alt="Logo" style="width: 150px;" />
    <h2 style="color: #2563eb;">Operación Reservada</h2>
    <p>Tu operación de <strong>${operationType}</strong> ha sido creada correctamente.</p>
    <!-- ... resto del contenido ... -->
  </div>
`;
```

## Pruebas

Para probar el envío de emails:

1. Asegúrate de que las variables de entorno estén configuradas correctamente
2. Crea una nueva operación en el sistema
3. Verifica que el email llegue a la bandeja de entrada del usuario

**Nota:** En desarrollo, SendGrid tiene un límite de 100 emails por día en la cuenta gratuita.

## Solución de Problemas

### No se envían emails

1. Verifica que `SENDGRID_API_KEY` esté configurada correctamente
2. Verifica que `SENDGRID_FROM_EMAIL` corresponda a un email verificado en SendGrid
3. Revisa los logs del servidor para ver mensajes de error
4. Verifica que el usuario tenga un email válido en la base de datos

### Emails van a spam

1. Configura la autenticación de dominio (Domain Authentication) en SendGrid
2. Agrega registros SPF y DKIM a tu dominio
3. Evita palabras spam en el asunto y contenido
4. Pide a los usuarios que agreguen tu email a contactos

### Error de API Key inválida

1. Verifica que copiaste la API Key completa (empieza con `SG.`)
2. Verifica que la API Key tenga permisos de envío
3. Crea una nueva API Key si es necesario

## Monitoreo

Puedes monitorear los emails enviados en:
1. Panel de SendGrid → **Activity** → **Email Activity**
2. Logs del servidor (buscar "✓ Email enviado" o errores)

## Límites de SendGrid

### Cuenta Gratuita
- 100 emails por día
- Perfecto para desarrollo y testing

### Cuenta de Pago
- Desde 40,000 emails por mes ($14.95/mes)
- Estadísticas avanzadas
- Mejor deliverability

## Seguridad

- **Nunca** comitees el archivo `.env` con tu API Key
- Usa variables de entorno en producción
- Rota tu API Key periódicamente
- Usa API Keys con permisos restringidos (solo envío de emails)

## Soporte

Para más información sobre SendGrid:
- Documentación: https://docs.sendgrid.com/
- API Reference: https://docs.sendgrid.com/api-reference/mail-send/mail-send
- Soporte: https://support.sendgrid.com/
