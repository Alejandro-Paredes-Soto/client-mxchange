const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/exchange-rate', async (req, res) => {
  try {
    // Leer las tasas desde la tabla settings
    const [buyRows] = await pool.query('SELECT value FROM settings WHERE key_name = ?', ['rate_buy']);
    const [sellRows] = await pool.query('SELECT value FROM settings WHERE key_name = ?', ['rate_sell']);
    
    const buy = buyRows && buyRows[0] ? Number(buyRows[0].value) : 17.8;
    const sell = sellRows && sellRows[0] ? Number(sellRows[0].value) : 18.2;
    
    return res.json({ buy, sell, fetched_at: new Date() });
  } catch (err) {
    console.error('Error fetching exchange rates:', err);
    return res.status(500).json({ message: 'error' });
  }
});

router.get('/branches', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, address, city, state FROM branches');
    return res.json({ branches: rows });
  } catch (err) {
    return res.status(500).json({ message: 'error' });
  }
});

// Endpoint público para obtener el porcentaje de comisión configurado
router.get('/config/commission', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT value FROM settings WHERE key_name = ?', ['commission_percent']);
    const value = rows && rows[0] ? rows[0].value : null;
    const percent = value !== null ? Number(value) : 2.0;
    return res.json({ commissionPercent: percent });
  } catch (err) {
    console.error('Error reading commission_percent setting', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'error' });
  }
});

// ============================================================================
// ENDPOINT DE CÁLCULO DE OPERACIÓN (Backend Authoritative)
// El frontend NO debe calcular montos, comisiones ni tasas.
// Este endpoint recibe solo: type, usd_amount, branch_id
// y devuelve TODOS los cálculos listos para mostrar.
// ============================================================================
const { roundMXN, roundUSD, calculateEffectiveRate } = require('../utils/precisionHelper');

router.post('/calculate-operation', async (req, res) => {
  try {
    const { type, usd_amount, branch_id } = req.body;

    // Validar inputs mínimos
    if (!type || (type !== 'buy' && type !== 'sell')) {
      return res.status(400).json({ message: 'Tipo de operación inválido. Debe ser "buy" o "sell".' });
    }

    const usdAmt = Number(usd_amount);
    if (isNaN(usdAmt) || usdAmt <= 0) {
      return res.status(400).json({ message: 'Monto USD inválido. Debe ser un número positivo.' });
    }

    // Límites de operación
    const MIN_USD = 1;
    const MAX_USD = 50000;
    if (usdAmt < MIN_USD || usdAmt > MAX_USD) {
      return res.status(400).json({ 
        message: `Monto fuera de rango. Mínimo: $${MIN_USD} USD, Máximo: $${MAX_USD} USD.` 
      });
    }

    // 1. Obtener configuración desde la base de datos (ÚNICA FUENTE DE VERDAD)
    const [settingsRows] = await pool.query(
      'SELECT key_name, value FROM settings WHERE key_name IN (?, ?, ?)',
      ['rate_buy', 'rate_sell', 'commission_percent']
    );

    const settings = {};
    settingsRows.forEach(row => {
      settings[row.key_name] = Number(row.value);
    });

    const rateBuy = settings['rate_buy'] || 17.8;   // Tasa a la que el CLIENTE compra USD (sucursal vende)
    const rateSell = settings['rate_sell'] || 18.2; // Tasa a la que el CLIENTE vende USD (sucursal compra)
    const commissionPercent = settings['commission_percent'] || 2.0;

    // 2. Determinar tasa base según tipo de operación
    // - buy: Cliente COMPRA USD → usa tasa de VENTA de la sucursal (rateSell)
    // - sell: Cliente VENDE USD → usa tasa de COMPRA de la sucursal (rateBuy)
    const baseRate = type === 'buy' ? rateSell : rateBuy;

    // 3. Calcular tasa efectiva con comisión
    const effectiveRate = calculateEffectiveRate(baseRate, commissionPercent, type);

    // 4. Calcular montos
    let mxnAmount, commissionMXN;

    if (type === 'buy') {
      // Cliente COMPRA USD: paga MXN, recibe USD
      // MXN = USD * tasa_efectiva (redondeado sin decimales)
      mxnAmount = roundMXN(usdAmt * effectiveRate);
      // Comisión = lo que paga - lo que pagaría sin comisión
      const mxnWithoutCommission = roundMXN(usdAmt * baseRate);
      commissionMXN = mxnAmount - mxnWithoutCommission;
    } else {
      // Cliente VENDE USD: entrega USD, recibe MXN
      // MXN = USD * tasa_efectiva (redondeado sin decimales)
      mxnAmount = roundMXN(usdAmt * effectiveRate);
      // Comisión = lo que recibiría sin comisión - lo que recibe
      const mxnWithoutCommission = roundMXN(usdAmt * baseRate);
      commissionMXN = mxnWithoutCommission - mxnAmount;
    }

    // Asegurar que comisión no sea negativa
    if (commissionMXN < 0) commissionMXN = 0;

    // 5. Verificar disponibilidad de inventario (si se proporciona branch_id)
    let inventoryAvailable = null;
    let inventoryStatus = 'unknown';
    let validBranchId = null;

    if (branch_id) {
      // Validar que branch_id sea un número entero positivo
      validBranchId = parseInt(branch_id, 10);
      if (isNaN(validBranchId) || validBranchId <= 0) {
        return res.status(400).json({ message: 'branch_id debe ser un número entero válido.' });
      }

      try {
        // Determinar qué moneda verificar (lo que la sucursal entrega)
        const currencyToCheck = type === 'buy' ? 'USD' : 'MXN';
        const amountNeeded = type === 'buy' ? usdAmt : mxnAmount;

        const [invRows] = await pool.query(
          'SELECT amount FROM inventory WHERE branch_id = ? AND currency = ?',
          [validBranchId, currencyToCheck]
        );

        const [reservedRows] = await pool.query(
          `SELECT COALESCE(SUM(amount_reserved), 0) as total_reserved 
           FROM inventory_reservations 
           WHERE branch_id = ? AND currency = ? AND status = 'reserved'`,
          [validBranchId, currencyToCheck]
        );

        const totalAmount = invRows && invRows[0] ? Number(invRows[0].amount) : 0;
        const totalReserved = reservedRows && reservedRows[0] ? Number(reservedRows[0].total_reserved) : 0;
        inventoryAvailable = totalAmount - totalReserved;

        if (inventoryAvailable >= amountNeeded) {
          inventoryStatus = 'available';
        } else {
          inventoryStatus = 'insufficient';
        }
      } catch (invErr) {
        console.warn('Error verificando inventario:', invErr.message);
        inventoryStatus = 'error';
      }
    }

    // 6. Responder con TODOS los datos calculados
    return res.json({
      success: true,
      calculation: {
        type,
        // Montos finales (ya redondeados correctamente)
        usd_amount: roundUSD(usdAmt),
        mxn_amount: mxnAmount,
        // Tasas
        base_rate: baseRate,
        effective_rate: effectiveRate,
        commission_percent: commissionPercent,
        commission_mxn: commissionMXN,
        // Monedas según tipo
        currency_from: type === 'buy' ? 'MXN' : 'USD',
        currency_to: type === 'buy' ? 'USD' : 'MXN',
        amount_from: type === 'buy' ? mxnAmount : roundUSD(usdAmt),
        amount_to: type === 'buy' ? roundUSD(usdAmt) : mxnAmount,
        // Inventario (si se verificó)
        inventory: validBranchId ? {
          branch_id: validBranchId,
          available: inventoryAvailable,
          status: inventoryStatus
        } : null
      },
      // Timestamp para evitar uso de cálculos viejos
      calculated_at: new Date().toISOString(),
      // TTL recomendado (el frontend debería recalcular después de este tiempo)
      valid_for_seconds: 60
    });

  } catch (err) {
    console.error('Error en calculate-operation:', err);
    return res.status(500).json({ message: 'Error calculando operación.' });
  }
});

module.exports = router;
