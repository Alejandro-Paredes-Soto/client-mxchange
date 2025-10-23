# Pendientes y especificación — Frontend (app)

Fecha: 14-10-2025

Este documento lista las funcionalidades que faltan por implementar en el frontend, describe el propósito de cada página, los contratos de datos esperados y pasos recomendados para integración y pruebas.

---

## Resumen corto

- Implementado: Dashboard (inicio), componentes `RateCard`, `TransactionList`, `OperationForm` (mock), página `/operacion` y `/operacion/confirm` (mock).
- Pendiente: Historial completo (`/mis-movimientos`), Perfil de usuario, integración con backend (endpoints reales), generación de QR real, métodos de pago y panel admin.

---

## Archivos importantes ya creados

- `src/app/inicio/page.tsx` — Dashboard de usuario (tasas mock + accesos rápidos + resumen transacciones)
- `src/app/components/RateCard.tsx` — UI de tasas
- `src/app/components/TransactionList.tsx` — listado compactado de transacciones
- `src/app/components/OperationForm.tsx` — formulario para comprar/vender (mock reservation)
- `src/app/operacion/page.tsx` — página que muestra `OperationForm`
- `src/app/operacion/confirm/page.tsx` — confirmación con folio (lee de localStorage)
- `src/app/services/api.ts` — mock de tasas y utilidades para leer/guardar transacciones

---

## Pendientes funcionales (alto nivel)

1) Historial completo (`/mis-movimientos`)
   - Mostrar todas las transacciones del usuario (pasadas y activas).
   - Filtrar por fecha, sucursal, estado, tipo (compra/venta).
   - Ver detalle de cada transacción (página o modal) con folio, QR, y acciones (si procede).

2) Vista de Operación: mejoras
   - Validaciones avanzadas (min/max, límites de inventario por sucursal).
   - Soportar ingreso en ambas monedas (ingresa MXN o USD, calcular inverso).
   - Mejorar UX: confirm prompt y preview antes de reservar.

3) Confirmación y pago
   - Integración de métodos de pago (API de pago o redirección a pasarela).
   - Generación de folio con formato legible y QR real (por ejemplo usando `qrcode` o `react-qr-code`).

4) Perfil de usuario (`/perfil`)
   - Editar nombre, correo, contraseña.
   - Gestionar métodos de pago (tarjetas tokenizadas) — requerirá backend seguro.

5) Integración con backend y auth
   - Reemplazar `getRatesMock` por llamada real: `GET /rates` o similar.
   - Reemplazar `saveTransactionMock` por `POST /orders` o `POST /transactions`.
   - Asegurar cabeceras Authorization con token (ya existe `useUtils` para requestGet/requestPost).

6) Admin panel (separado)
   - Dashboard con KPIs, gestión de inventario por sucursal, edición de tasas, gestión de usuarios.

---

## Contratos de datos (propuestos)

Rates (desde backend)

  GET /rates -> 200
  {
    "usd": { "buy": number, "sell": number },
    "lastUpdated": number
  }

Transacción (creación)

  POST /transactions
  body: {
    type: 'buy' | 'sell',
    amountFrom: number, // monto en origen (USD)
    amountTo?: number, // opcional, calculado por backend
    rate?: number, // opcional
    branch?: string,
    method?: string,
    userId?: string
  }

  response: 201
  {
    id: string,
    status: 'En proceso' | 'Listo para recoger' | 'Completado',
    createdAt: number,
    rate: number,
    amountFrom: number,
    amountTo: number
  }

Listado de transacciones

  GET /transactions?userId=...&from=...&to=...&status=...
  -> [{ Transaction }]

---

## UI / Routing (páginas a crear)

- `/` o `/inicio` — ya implementada parcialmente.
- `/operacion` — creada; mejorar UX y validaciones.
- `/operacion/confirm` — creada (placeholder QR).
- `/mis-movimientos` — pendiente: listado + filtros + detalle.
- `/perfil` — pendiente.

---

## Pasos recomendados para integración (mínimo viable)

1. Definir endpoints backend reales para tasas y crear órdenes (contratos JSON). Si el backend está listo, proporcionar URLs y ejemplos de payload.
2. Reemplazar las llamadas mock en `src/app/services/api.ts` por `axios` o `fetch` y usar `useUtils.requestGet/requestPost` (ya existe util en `services/utils`).
3. Añadir manejo de errores y estados cargando en todos los componentes.
4. Crear `/mis-movimientos` y conectar con `GET /transactions`. Añadir paginación básica.
5. Implementar tests unitarios (React Testing Library) para `OperationForm` (cálculo de montos) y utilitarios que usan `localStorage`.

---

## Lista corta de tareas inmediatas (prioridad alta)

1. Implementar `/mis-movimientos` (listado + detalle).
2. Reemplazar mocks por endpoints reales (tasas, crear transacción).
3. Añadir generación de QR real y folio con máscara legible.
4. Validaciones adicionales en `OperationForm` (min/max, balance por sucursal) y UX (confirm modal).

---

Si quieres, puedo:

- Implementar `/mis-movimientos` ahora (lo dejo en la TODO y empiezo si confirmas).
- Conectar las llamadas mock a tu backend si me das URLs y ejemplos de payload.

Fin del documento.
