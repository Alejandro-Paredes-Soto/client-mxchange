/**
 * Utilidades para manejar precisión numérica en cálculos de divisas
 * Previene errores de punto flotante en JavaScript
 * 
 * REGLAS DE NEGOCIO:
 * - MXN: Se redondea a ENTEROS (sin centavos) para simplificar manejo en efectivo
 * - USD: Se redondea a 2 decimales (centavos)
 * - Tasas: Se manejan con hasta 6 decimales para precisión
 */

/**
 * Valida que un valor sea un número finito y válido
 * @param {any} value - Valor a validar
 * @returns {boolean} true si es un número válido
 */
function isValidNumber(value) {
  return typeof value === 'number' && isFinite(value) && !isNaN(value);
}

/**
 * Redondea un número a enteros para MXN (sin decimales)
 * Usa "round half away from zero" para consistencia
 * @param {number} value - Valor a redondear
 * @returns {number} Valor redondeado a entero
 */
function roundMXN(value) {
  if (!isValidNumber(value)) {
    console.warn('roundMXN recibió valor inválido:', value);
    return 0;
  }
  // Math.round ya implementa "round half away from zero" en JS
  return Math.round(value);
}

/**
 * Redondea un número a 2 decimales para USD
 * Evita problemas de punto flotante usando multiplicación/división por 100
 * @param {number} value - Valor a redondear
 * @returns {number} Valor redondeado a 2 decimales
 */
function roundUSD(value) {
  if (!isValidNumber(value)) {
    console.warn('roundUSD recibió valor inválido:', value);
    return 0;
  }
  // Multiplicar por 100, redondear, dividir por 100
  return Math.round(value * 100) / 100;
}

/**
 * Redondea a N decimales de forma segura
 * @param {number} value - Valor a redondear
 * @param {number} decimals - Número de decimales (default: 2)
 * @returns {number} Valor redondeado
 */
function roundTo(value, decimals = 2) {
  if (!isValidNumber(value)) {
    console.warn('roundTo recibió valor inválido:', value);
    return 0;
  }
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Realiza multiplicación de dos números con precisión
 * Usa aritmética de enteros para evitar errores de punto flotante
 * 
 * NOTA: Escala a 4 decimales (10000) para manejar tasas como 18.756
 * MAX_SAFE para esta escala: 9,007,199,254,740,991 / 10000 = ~900 billones
 * 
 * @param {number} a - Primer número (ej: monto en USD, máx 50,000)
 * @param {number} b - Segundo número (ej: tasa, máx ~100)
 * @returns {number} Resultado de a * b con precisión
 */
function preciseMult(a, b) {
  if (!isValidNumber(a) || !isValidNumber(b)) {
    console.warn('preciseMult recibió valores inválidos:', a, b);
    return 0;
  }
  
  // Escalar a 4 decimales (10000) para mayor precisión con tasas
  // aScaled máx: 50000 * 10000 = 500,000,000
  // bScaled máx: 100 * 10000 = 1,000,000  
  // Producto máx: 500,000,000,000,000 (dentro de MAX_SAFE_INTEGER)
  const scale = 10000;
  const aScaled = Math.round(a * scale);
  const bScaled = Math.round(b * scale);
  
  // Verificar overflow potencial (muy raro en uso normal)
  if (Math.abs(aScaled) > 1e10 || Math.abs(bScaled) > 1e10) {
    console.warn('preciseMult: valores muy grandes, usando multiplicación directa');
    return a * b;
  }
  
  const result = (aScaled * bScaled) / (scale * scale);
  return result;
}

/**
 * Calcula tasa efectiva con comisión
 * @param {number} baseRate - Tasa base (p.ej: 18.5)
 * @param {number} commissionPercent - Porcentaje de comisión (p.ej: 2 para 2%)
 * @param {string} type - 'buy' o 'sell'
 * @returns {number} Tasa efectiva redondeada a 6 decimales
 */
function calculateEffectiveRate(baseRate, commissionPercent, type) {
  if (!isValidNumber(baseRate)) {
    console.warn('calculateEffectiveRate: baseRate inválido:', baseRate);
    return 0;
  }
  
  const cp = isValidNumber(Number(commissionPercent)) ? Number(commissionPercent) : 0;
  let effectiveRate;

  if (type === 'buy') {
    // Cliente compra USD: paga más MXN (tasa + comisión)
    effectiveRate = baseRate * (1 + cp / 100);
  } else {
    // Cliente vende USD: recibe menos MXN (tasa - comisión)
    effectiveRate = baseRate * (1 - cp / 100);
  }

  // Redondear a 6 decimales para precisión en cálculos posteriores
  return roundTo(effectiveRate, 6);
}

/**
 * Calcula monto de transacción con precisión
 * @param {number} amount - Cantidad USD
 * @param {number} effectiveRate - Tasa efectiva
 * @param {string} currency - Divisa destino ('MXN' o 'USD')
 * @returns {number} Monto calculado y redondeado correctamente
 */
function calculateTransactionAmount(amount, effectiveRate, currency) {
  if (!isValidNumber(amount) || !isValidNumber(effectiveRate)) {
    console.warn('calculateTransactionAmount: valores inválidos:', amount, effectiveRate);
    return 0;
  }
  
  const calculated = preciseMult(amount, effectiveRate);

  if (currency === 'MXN') {
    return roundMXN(calculated);
  } else if (currency === 'USD') {
    return roundUSD(calculated);
  }

  return calculated;
}

/**
 * Calcula la comisión de forma consistente evitando errores de redondeo
 * Calcula la comisión ANTES de redondear los montos finales
 * 
 * @param {number} usdAmount - Monto en USD
 * @param {number} baseRate - Tasa base sin comisión
 * @param {number} effectiveRate - Tasa con comisión aplicada
 * @param {string} type - 'buy' o 'sell'
 * @returns {{mxnAmount: number, mxnWithoutCommission: number, commission: number}}
 */
function calculateAmountsWithCommission(usdAmount, baseRate, effectiveRate, type) {
  if (!isValidNumber(usdAmount) || !isValidNumber(baseRate) || !isValidNumber(effectiveRate)) {
    console.warn('calculateAmountsWithCommission: valores inválidos');
    return { mxnAmount: 0, mxnWithoutCommission: 0, commission: 0 };
  }
  
  // Calcular montos sin redondear primero
  const mxnRaw = usdAmount * effectiveRate;
  const mxnWithoutCommissionRaw = usdAmount * baseRate;
  
  // Calcular comisión en valores sin redondear
  let commissionRaw;
  if (type === 'buy') {
    // Cliente paga más, comisión = diferencia
    commissionRaw = mxnRaw - mxnWithoutCommissionRaw;
  } else {
    // Cliente recibe menos, comisión = diferencia
    commissionRaw = mxnWithoutCommissionRaw - mxnRaw;
  }
  
  // Ahora redondear todo
  const mxnAmount = roundMXN(mxnRaw);
  const mxnWithoutCommission = roundMXN(mxnWithoutCommissionRaw);
  
  // La comisión se redondea a enteros (MXN) y debe ser >= 0
  let commission = roundMXN(commissionRaw);
  if (commission < 0) commission = 0;
  
  return {
    mxnAmount,
    mxnWithoutCommission,
    commission
  };
}

module.exports = {
  isValidNumber,
  roundMXN,
  roundUSD,
  roundTo,
  preciseMult,
  calculateEffectiveRate,
  calculateTransactionAmount,
  calculateAmountsWithCommission
};
