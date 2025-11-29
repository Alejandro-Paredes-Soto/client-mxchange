/**
 * Utilidades para manejar precisión numérica en cálculos de divisas
 * Previene errores de punto flotante en JavaScript
 */

/**
 * Redondea un número a enteros para MXN (sin decimales)
 * @param {number} value - Valor a redondear
 * @returns {number} Valor redondeado
 */
function roundMXN(value) {
  return Math.round(value);
}

/**
 * Redondea un número a 2 decimales para USD
 * @param {number} value - Valor a redondear
 * @returns {number} Valor redondeado a 2 decimales
 */
function roundUSD(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Realiza multiplicación de dos números con precisión
 * Convierte a centavos (enteros) para evitar errores de punto flotante
 * @param {number} a - Primer número
 * @param {number} b - Segundo número
 * @returns {number} Resultado de a * b con precisión
 */
function preciseMult(a, b) {
  // Trabajar con centavos para evitar punto flotante
  const aCents = Math.round(a * 100);
  const bCents = Math.round(b * 100);
  const result = (aCents * bCents) / 10000;
  return result;
}

/**
 * Calcula tasa efectiva con comisión
 * @param {number} baseRate - Tasa base (p.ej: 20)
 * @param {number} commissionPercent - Porcentaje de comisión (p.ej: 2 para 2%)
 * @param {string} type - 'buy' o 'sell'
 * @returns {number} Tasa efectiva redondeada a 6 decimales
 */
function calculateEffectiveRate(baseRate, commissionPercent, type) {
  const cp = Number(commissionPercent) || 0;
  let effectiveRate;

  if (type === 'buy') {
    effectiveRate = baseRate * (1 + cp / 100);
  } else {
    effectiveRate = baseRate * (1 - cp / 100);
  }

  return Number(effectiveRate.toFixed(6));
}

/**
 * Calcula monto de transacción con precision
 * @param {number} amount - Cantidad USD
 * @param {number} effectiveRate - Tasa efectiva
 * @param {string} currency - Divisa destino ('MXN' o 'USD')
 * @returns {number} Monto calculado y redondeado correctamente
 */
function calculateTransactionAmount(amount, effectiveRate, currency) {
  const calculated = amount * effectiveRate;

  if (currency === 'MXN') {
    return roundMXN(calculated);
  } else if (currency === 'USD') {
    return roundUSD(calculated);
  }

  return calculated;
}

module.exports = {
  roundMXN,
  roundUSD,
  preciseMult,
  calculateEffectiveRate,
  calculateTransactionAmount
};
