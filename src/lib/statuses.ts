// Centraliza la lógica de nombres humanizados y colores de los estatus de transacción
export type Scenario = 'buy_card' | 'buy_cash' | 'sell_cash' | 'generic';

// Los estados válidos vienen del ENUM en la base de datos:
// 'reserved','processing','paid','ready_for_pickup','ready_to_receive','completed','cancelled','expired'
export const humanizeStatus = (backendStatus?: string, scenario: Scenario = 'generic') => {
  if (!backendStatus) return 'Pendiente';
  const s = backendStatus.toString().toLowerCase();

  // Mapear valores exactos del enum
  if (s === 'reserved') return 'Reservado';
  if (s === 'processing') return 'Procesando';
  if (s === 'paid' || s === 'paid_success' || s === 'settled') return 'Pagado';
  if (s === 'ready_for_pickup') return 'Listo para Recoger';
  if (s === 'ready_to_receive') return 'Listo para Recibir';
  if (s === 'completed') return 'Completado';
  if (s === 'cancelled') return 'Cancelado';
  if (s === 'expired') return 'Expirado';

  // Backwards compatibility: algunos registros antiguos usan 'pending' o variantes en español
  if (s.includes('pending') || s.includes('pendiente')) return 'Reservado';
  if (s.includes('paid') || s.includes('pagado')) return 'Pagado';
  if (s.includes('ready') || s.includes('listo')) {
    // Usar el escenario para decidir interpretación por defecto
    if (scenario === 'sell_cash') return 'Listo para Recibir';
    return 'Listo para Recoger';
  }

  // Fallback: capitalizar la primera letra
  return backendStatus.toString().charAt(0).toUpperCase() + backendStatus.toString().slice(1);
}

export const getStatusColor = (humanStatus?: string) => {
  const s = (humanStatus || '').toString().toLowerCase();
  if (s.includes('reservado') || s.includes('reservado') || s.includes('pendiente') || s.includes('pending')) return 'bg-amber-100 text-amber-800 border-amber-200';
  if (s.includes('procesando') || s.includes('processing')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (s.includes('pagado') || s.includes('paid')) return 'bg-blue-100 text-blue-800 border-blue-200';
  if (s.includes('listo para recibir') || s.includes('listo para recoger') || s.includes('ready')) return 'bg-sky-100 text-sky-800 border-sky-200';
  if (s.includes('completado') || s.includes('completed')) return 'bg-green-100 text-green-800 border-green-200';
  if (s.includes('cancelado') || s.includes('cancel') || s.includes('expirado') || s.includes('expired')) return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-gray-100 text-gray-800 border-gray-200';
}
