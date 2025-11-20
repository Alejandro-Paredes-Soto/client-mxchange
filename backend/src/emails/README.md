# Sistema de Emails con React Email Components

Este proyecto utiliza `@react-email/components` para crear emails profesionales y bien diseñados usando componentes React.

## Plantillas Disponibles

### 1. TransactionCreatedEmail
Se envía cuando se crea una nueva operación de compra o venta.
- **Uso**: Confirmación de reserva de operación
- **Datos requeridos**: `transaction_code`, `type`, `amount_to/from`, `currency_to/from`, `branch_name`

### 2. PaymentConfirmedEmail
Se envía cuando se confirma el pago de una operación.
- **Uso**: Confirmación de pago exitoso
- **Datos requeridos**: `transaction_code`

### 3. TransactionReadyEmail
Se envía cuando la operación está lista para recoger dinero o entregarlo.
- **Uso**: Notificación de operación lista
- **Datos requeridos**: `transaction_code`, `type`, `amount_to/from`, `currency_to/from`, `branch_name`, `status`
- **Estados**: `ready_for_pickup`, `ready_to_receive`

### 4. TransactionCancelledEmail
Se envía cuando una operación es cancelada o expira.
- **Uso**: Notificación de cancelación/expiración
- **Datos requeridos**: `transaction_code`, `status`

### 5. TransactionCompletedEmail
Se envía cuando una operación se completa exitosamente.
- **Uso**: Confirmación de operación completada
- **Datos requeridos**: `transaction_code`, `type`

### 6. PaymentFailedEmail
Se envía cuando un pago es rechazado.
- **Uso**: Notificación de pago fallido
- **Datos requeridos**: `transaction_code`

## Ventajas de React Email Components

1. **Componentes Reutilizables**: Código React limpio y mantenible
2. **Compatibilidad**: Renderizado optimizado para clientes de email
3. **Diseño Responsivo**: Emails que se ven bien en todos los dispositivos
4. **Tipado**: Mejor integración con TypeScript
5. **Preview**: Posibilidad de previsualizar emails antes de enviar

## Uso en el código

```javascript
const emailComponent = React.createElement(TransactionCreatedEmail, { 
  transactionData: {
    transaction_code: 'ABC123',
    type: 'buy',
    amount_to: 1000,
    currency_to: 'USD',
    branch_name: 'Sucursal Centro'
  }
});

await sendEmail('user@example.com', 'Asunto del email', emailComponent);
```

## Personalización

Para modificar el diseño de los emails, edita los archivos en `src/emails/`:
- Modifica los estilos inline en los objetos de estilo
- Agrega nuevos componentes de `@react-email/components`
- Ajusta el contenido y estructura según necesites

## Paleta de Colores

- **Primary (Azul)**: `#2563eb` - Para operaciones en proceso
- **Success (Verde)**: `#16a34a` - Para confirmaciones y éxitos
- **Error (Rojo)**: `#dc2626` - Para cancelaciones y errores
- **Gris**: `#f3f4f6` - Para fondos de información
