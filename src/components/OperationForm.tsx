"use client";

import React, { useEffect, useState, useCallback } from "react";
import Cookies from 'js-cookie';
import { listBranches, Rates, createTransactionApi } from "@/app/services/api";
import { debounce } from 'lodash';
import { useSocket } from '@/providers/SocketProvider';
import { toast } from 'sonner';
import { NumberInput } from "./ui/number-input";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";

type OperationType = 'buy' | 'sell'; // Represents the user's goal: buying or selling USD.

type Props = {
  initialMode?: OperationType;
  rates: Rates | null;
  onReserved?: (txCode: string) => void;
};

const OperationForm: React.FC<Props> = ({ initialMode = 'buy', rates, onReserved }) => {
  const [operationType, setOperationType] = useState<OperationType>(initialMode);

  // State for the two input fields
  const [fromAmount, setFromAmount] = useState<string>('');
  const [toAmount, setToAmount] = useState<string>('');

  // State for currencies in each field
  const [fromCurrency, setFromCurrency] = useState('MXN');
  const [toCurrency, setToCurrency] = useState('USD');

  // Función para redondear MXN (sin centavos)
  // Si centavos >= 50, redondea arriba; si < 50, redondea abajo
  const roundMXN = (amount: number): number => {
    return Math.round(amount);
  };

  // Branch and method state
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [branchId, setBranchId] = useState<number | ''>('');
  const [method, setMethod] = useState<string>('En sucursal');
  const [commissionPercent, setCommissionPercent] = useState<number | null>(null);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const socket = useSocket();

  // Tipos para payload de inventory.updated
  type InventoryItem = { amount: number; low_stock_threshold: number | null };
  type InventoryPayload = { transaction?: unknown; inventory?: Record<string, InventoryItem>; branch_id?: number };

  // Determine the correct exchange rate based on the user's goal
  const getRate = useCallback(() => {
    if (!rates) return null;
    // If user wants to BUY USD, the branch SELLS USD to them. Use the SELL rate.
    // If user wants to SELL USD, the branch BUYS USD from them. Use the BUY rate.
    // NOTE: this returns the base market rate (from backend) — the commission (spread)
    // will be applied later to compute the effective rate sent to the backend.
    return operationType === 'buy' ? rates.usd.sell : rates.usd.buy;
  }, [rates, operationType]);

  // Lock the base rate as soon as it is available so it does NOT change after
  // the initial calculation (user requested behaviour).
  const [lockedBaseRate, setLockedBaseRate] = useState<number | null>(null);

  useEffect(() => {
    if (lockedBaseRate === null) {
      const r = getRate();
      if (typeof r === 'number' && !isNaN(r)) {
        setLockedBaseRate(r);
      }
    }
    // We intentionally only set lockedBaseRate once when it's null. getRate is
    // included so the effect runs when rates become available, but the lock
    // prevents further updates.
  }, [getRate, lockedBaseRate]);

  // Debounced calculation handlers (useMemo + cleanup to avoid hook dependency lint issues)
  // Use the locked base rate when present, otherwise fall back to current rate
  const baseRate = lockedBaseRate ?? getRate();

  const getEffectiveRate = useCallback(() => {
    const base = baseRate;
    if (!base) return null;
    const cp = commissionPercent ?? 0;
    if (!cp) return base;
    if (operationType === 'buy') {
      return base * (1 + cp / 100);
    }
    return base * (1 - cp / 100);
  }, [baseRate, commissionPercent, operationType]);

  const debouncedCalculateTo = React.useMemo(() => debounce((amount: string) => {
    const rateEff = getEffectiveRate();
    if (rateEff && amount) {
      const numAmount = parseFloat(amount);
      // When buying USD: fromAmount (MXN) / effectiveRate = toAmount (USD)
      // When selling USD: fromAmount (USD) * effectiveRate = toAmount (MXN)
      let result = operationType === 'buy'
        ? numAmount / rateEff
        : numAmount * rateEff;

      // Si el resultado es MXN (venta), redondearlo sin centavos
      if (operationType === 'sell') {
        result = roundMXN(result);
        setToAmount(result.toFixed(0)); // Sin decimales para MXN
      } else {
        setToAmount(result.toFixed(2)); // USD mantiene 2 decimales
      }
    } else {
      setToAmount('');
    }
  }, 300), [getEffectiveRate, operationType]);

  const debouncedCalculateFrom = React.useMemo(() => debounce((amount: string) => {
    const rateEff = getEffectiveRate();
    if (rateEff && amount) {
      const numAmount = parseFloat(amount);
      // When buying USD: toAmount (USD) * effectiveRate = fromAmount (MXN)
      // When selling USD: toAmount (MXN) / effectiveRate = fromAmount (USD)
      let result = operationType === 'buy'
        ? numAmount * rateEff
        : numAmount / rateEff;

      // Si el resultado es MXN (compra), redondearlo sin centavos
      if (operationType === 'buy') {
        result = roundMXN(result);
        setFromAmount(result.toFixed(0)); // Sin decimales para MXN
      } else {
        setFromAmount(result.toFixed(2)); // USD mantiene 2 decimales
      }
    } else {
      setFromAmount('');
    }
  }, 300), [getEffectiveRate, operationType]);

  // Rates and commission breakdown for UI
  const effectiveRate = getEffectiveRate();
  // For commission calculations prefer to use the raw numeric values (not pre-rounded strings)
  // Aplicar redondeo a MXN para cálculos
  const rawFrom = operationType === 'buy' ? roundMXN(parseFloat(fromAmount || '0')) : parseFloat(fromAmount || '0');
  const rawTo = operationType === 'sell' ? roundMXN(parseFloat(toAmount || '0')) : parseFloat(toAmount || '0');
  let commissionAmountMXN: number | null = null;
  try {
    if (baseRate && effectiveRate) {
      if (operationType === 'buy') {
        // User pays MXN (fromCurrency = MXN). rawFrom is amount paid by user in MXN.
        // USD delivered = rawTo (calculated using effectiveRate).
        const usdDelivered = rawTo; // already calculated using effectiveRate
        const whatWouldBePaidAtBase = usdDelivered * baseRate;
        commissionAmountMXN = Math.round(rawFrom - whatWouldBePaidAtBase);
      } else {
        // sell: user delivers USD (fromCurrency = USD). rawFrom is USD delivered.
        const usdDelivered = rawFrom;
        const whatBranchWouldPayAtBase = usdDelivered * baseRate; // MXN
        const mxnPaidToUser = rawTo; // calculated using effectiveRate
        commissionAmountMXN = Math.round(whatBranchWouldPayAtBase - mxnPaidToUser);
      }
      if (isNaN(commissionAmountMXN) || commissionAmountMXN < 0) commissionAmountMXN = 0;
    }
  } catch {
    commissionAmountMXN = null;
  }
  // Amount according to base rate (without commission). Use rawFrom as the source of truth
  let amountAccordingToBase: number | null = null;
  if (baseRate && baseRate > 0) {
    if (operationType === 'buy') {
      // User pays MXN, amount according to base rate = MXN / baseRate -> USD
      amountAccordingToBase = rawFrom / baseRate;
    } else {
      // User delivers USD, amount according to base rate = USD * baseRate -> MXN
      amountAccordingToBase = Math.round(rawFrom * baseRate);
    }
    if (isNaN(amountAccordingToBase) || !isFinite(amountAccordingToBase)) amountAccordingToBase = null;
  }

  // Cleanup debounced functions on unmount
  useEffect(() => {
    return () => {
      debouncedCalculateTo.cancel();
      debouncedCalculateFrom.cancel();
    };
  }, [debouncedCalculateTo, debouncedCalculateFrom]);
  // Handlers for input changes
  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFromAmount(value);
    setError(null);
    debouncedCalculateTo(value);
  };

  // If the 'to' field is ever enabled, this will calculate the 'from' value
  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setToAmount(value);
    setError(null);
    debouncedCalculateFrom(value);
  };

  // Nota: el campo "To" está oculto en la UI actual; si se habilita, reimplementar handleToChange

  // Effect to switch currencies when operation type changes
  useEffect(() => {
    const newOperationType = initialMode;
    setOperationType(newOperationType);

    // When buying USD: user pays MXN, receives USD
    // When selling USD: user delivers USD, receives MXN
    if (newOperationType === 'buy') {
      setFromCurrency('MXN');
      setToCurrency('USD');
    } else {
      setFromCurrency('USD');
      setToCurrency('MXN');
    }

    // Clear amounts on mode change
    setFromAmount('');
    setToAmount('');
  }, [initialMode]);

  // Effect to fetch branches on component mount
  useEffect(() => {
    (async () => {
      try {
        const branchList = await listBranches();
        setBranches(branchList.map(b => ({ id: b.id, name: b.name })));
        if (branchList.length > 0) {
          setBranchId(branchList[0].id);
        }
      } catch (e) {
        console.error('Error loading branches', e);
        setError("No se pudieron cargar las sucursales.");
      }
    })();
  }, []);

  // Socket listener para actualizaciones de inventario
  useEffect(() => {
    const handler = (payload: unknown) => {
      console.log('inventory.updated received in OperationForm:', payload);
      try {
        if (typeof payload === 'object' && payload !== null) {
          const p = payload as InventoryPayload;
          if (p.branch_id && Number(p.branch_id) === Number(branchId)) {
            // Si la actualización pertenece a la sucursal seleccionada, refrescar branches/inventario
            (async () => {
              try {
                const refreshed = await listBranches();
                setBranches(refreshed.map(b => ({ id: b.id, name: b.name })));
              } catch {
                // noop
              }
            })();

            // Comprobar umbrales y mostrar toast si está por debajo o igual
            const inv = p.inventory as Record<string, { amount: number; low_stock_threshold: number | null }> | undefined;
            if (inv) {
              Object.entries(inv).forEach(([currency, info]) => {
                if (info && typeof info.amount === 'number' && typeof info.low_stock_threshold === 'number') {
                  if (info.amount <= info.low_stock_threshold) {
                    toast.warning(`Inventario bajo en sucursal: ${currency} ${info.amount.toFixed(2)} (umbral ${info.low_stock_threshold.toFixed(2)})`);
                  }
                }
              });
            }
          }
        }
      } catch {
        // noop
      }
    };

    if (socket && socket.on) {
      socket.on('inventory.updated', handler);
    }

    return () => {
      if (socket && socket.off) {
        socket.off('inventory.updated', handler);
      }
    };
  }, [branchId, socket]);

  // Fetch commission percent from backend public endpoint
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch((process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '') + '/public/config/commission');
        if (!resp.ok) return;
        const data = await resp.json();
        if (data && typeof data.commissionPercent === 'number') setCommissionPercent(data.commissionPercent);
      } catch (e) {
        console.error('Error loading commission percent', e);
      }
    })();
  }, []);

  const onReserve = async () => {
    const rate = baseRate;
    if (!rate) {
      setError('Las tasas de cambio no están disponibles. Intenta de nuevo.');
      return;
    }
    if (!branchId) {
      setError('Debes seleccionar una sucursal.');
      return;
    }
    let finalFromAmount = parseFloat(fromAmount);
    let finalToAmount = parseFloat(toAmount);

    if (isNaN(finalFromAmount) || finalFromAmount <= 0 || isNaN(finalToAmount) || finalToAmount <= 0) {
      setError('Ingresa un monto válido para la operación.');
      return;
    }

    // Redondear MXN antes de enviar al backend
    if (operationType === 'buy') {
      // Compra: fromAmount es MXN (lo que paga el cliente)
      finalFromAmount = roundMXN(finalFromAmount);
    } else {
      // Venta: toAmount es MXN (lo que recibe el cliente)
      finalToAmount = roundMXN(finalToAmount);
    }

    setIsLoading(true);
    setError(null);

    const payload = {
      branch_id: branchId,
      type: operationType,
      amount_from: finalFromAmount,
      currency_from: fromCurrency,
      amount_to: finalToAmount,
      currency_to: toCurrency,
      // Calculate effective rate (spread) based on commissionPercent if available
      exchange_rate: (() => {
        const cp = commissionPercent ?? 0;
        if (!cp) return rate;
        if (operationType === 'buy') {
          // For buying USD, branch sells USD at a higher rate
          return Number((rate * (1 + cp / 100)).toFixed(6));
        }
        // For selling USD, branch buys USD at a lower rate
        return Number((rate * (1 - cp / 100)).toFixed(6));
      })(),
      method: method,
    };

    try {
      const token = Cookies.get('token');
      if (!token) {
        setError('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.');
        setIsLoading(false);
        return;
      }

      const res = await createTransactionApi(payload, token);

      if (res.transaction?.transaction_code) {
        if (onReserved) onReserved(res.transaction.transaction_code);
        // Emitir actualización de inventario por socket para notificar a otros clientes
        try {
          // Construir payload de inventario mínimo esperado por admin: { branch_id, inventory: { USD: { amount, low_stock_threshold }, MXN: { ... } } }
          const branchIdNum = Number(branchId);
          // Intentar leer inventario actualizado desde la respuesta del backend si viene en res.inventory
          const invFromRes = (res.inventory && typeof res.inventory === 'object') ? res.inventory as Record<string, unknown> : undefined;
          if (socket && socket.emit) {
            console.log('Emitiendo inventory.updated por socket para branch:', branchIdNum, 'invFromRes?', !!invFromRes);
            if (invFromRes) {
              socket.emit('inventory.updated', { branch_id: branchIdNum, inventory: invFromRes, transaction: res.transaction });
            } else {
              // Si backend no devolvió inventario, enviar una señal para que los suscriptores refresquen la sucursal
              socket.emit('inventory.updated', { branch_id: branchIdNum, refresh: true, transaction: res.transaction });
            }
          }
        } catch (e) {
          console.warn('No se pudo emitir evento de socket inventory.updated', e);
        }
      } else {
        // Si el backend respondió 200 pero sin transaction_code, mostrar mensaje claro
        setError('No se pudo crear la transacción. Intenta nuevamente.');
        return;
      }
    } catch (err: unknown) {
      console.error('Error creating transaction:', err);
      const httpErr = err as { response?: { status?: number; data?: { message?: string } } };
      if (httpErr.response?.status === 409) {
        // Specific error for insufficient funds
        setError(httpErr.response.data?.message || 'Fondos insuficientes.');
      } else if (httpErr.response?.data?.message) {
        // Other backend errors
        setError(httpErr.response.data.message);
      } else {
        // Generic network or other errors
        setError('Ocurrió un error inesperado al crear la transacción.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white shadow-sm p-4 border border-gray-300 rounded-lg w-full">
      <header className="flex sm:flex-row flex-col justify-between items-start sm:items-center gap-3 mb-4">
        <h3 className="font-semibold text-primary text-lg">Generar Orden</h3>
        <div className="flex sm:flex-row flex-col items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <button
            className={`cursor-pointer w-full sm:w-auto px-3 py-2 rounded-md font-medium ${operationType === 'buy' ? 'bg-primary hover:bg-primary/90 text-white' : 'bg-white text-primary border border-light-green hover:bg-accent/50'}`}
            onClick={() => {
              setOperationType('buy');
              setFromCurrency('MXN');
              setToCurrency('USD');
              setFromAmount('');
              setToAmount('');
              setMethod('En sucursal');
            }}
          >
            Quiero Comprar Dólares
          </button>
          <button
            className={`cursor-pointer w-full sm:w-auto px-3 py-2 rounded-md font-medium ${operationType === 'sell' ? 'bg-primary hover:bg-primary/90 text-white' : 'bg-white text-primary border border-light-green hover:bg-accent/50'}`}
            onClick={() => {
              setOperationType('sell');
              setFromCurrency('USD');
              setToCurrency('MXN');
              setFromAmount('');
              setToAmount('');
              setMethod('En sucursal');
            }}
          >
            Quiero Vender Dólares
          </button>
        </div>
      </header>

      <div className="gap-4 grid grid-cols-1">
        {/* Main input: when buying we show the USD amount the user wants to receive (toAmount),
            when selling we show the USD the user delivers (fromAmount) */}
        {operationType === 'buy' ? (
          <div>
            <label className="block mb-2 font-medium text-primary">
              ¿Cuánto Dólar(s) Quieres Recibir?
            </label>
            <div className="relative">
              <NumberInput
                value={toAmount}
                onChange={handleToChange}
                placeholder="0.00"
                decimals={2}
                className="p-3 border-2 border-light-green focus:border-secondary rounded-lg focus:outline-none w-full font-['Roboto'] text-lg"
                disabled={isLoading}
              />
              <span className="top-1/2 right-3 absolute font-semibold text-gray-500 -translate-y-1/2">{toCurrency}</span>
            </div>
          </div>
        ) : (
          <div>
            <label className="block mb-2 font-medium text-primary">
              ¿Cuánto Dólar(s) Quieres Vender?
            </label>
            <div className="relative">
              <NumberInput
                value={fromAmount}
                onChange={handleFromChange}
                placeholder="0.00"
                decimals={2}
                className="p-3 border-2 border-light-green focus:border-secondary rounded-lg focus:outline-none w-full font-['Roboto'] text-lg"
                disabled={isLoading}
              />
              <span className="top-1/2 right-3 absolute font-semibold text-gray-500 -translate-y-1/2">{fromCurrency}</span>
            </div>
          </div>
        )}


        {/* Rate and Commission Info */}
        <div className="bg-gray-50 p-4 border border-gray-200 rounded-lg text-sm" aria-live="polite">
          {baseRate && (
            <div className="mb-3">
              <span className="font-medium text-gray-700">Tasa de {operationType === 'buy' ? 'Venta' : 'Compra'}:</span>
              <span className="ml-2 text-gray-600">1 USD ≈ {baseRate.toFixed(4)} MXN</span>
            </div>
          )}

          {commissionPercent !== null && toAmount && !isNaN(Number(toAmount)) && Number(toAmount) > 0 && (
            <div className="space-y-2 pt-3 border-gray-200 border-t">
              {operationType === 'buy' ? (
                <>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Monto según tasa de cambio (sin comisión):</span>
                    <span className="font-medium text-gray-800">{amountAccordingToBase !== null ? amountAccordingToBase.toFixed(2) : '—'} USD</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Tasa base:</span>
                    <span className="font-medium text-gray-800">{baseRate ? baseRate.toFixed(4) : '—'} MXN/USD</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Tasa aplicada (con comisión {commissionPercent}%):</span>
                    <span className="font-medium text-gray-800">{effectiveRate ? effectiveRate.toFixed(4) : '—'} MXN/USD</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Comisión sucursal aprox.:</span>
                    <span className="font-medium text-red-600">- {commissionAmountMXN !== null ? commissionAmountMXN.toFixed(0) : '—'} MXN</span>
                  </div>
                  <div className="bg-green-50 mt-3 p-3 border border-green-200 rounded-md">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-green-800">Tú recibirás:</span>
                      <span className="font-bold text-green-900 text-lg">{toAmount} USD</span>
                    </div>
                    <div className="flex justify-between items-center mt-1 text-green-700 text-xs">
                      <span>Pagas en total:</span>
                      <span>{fromAmount} MXN</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Entregas:</span>
                    <span className="font-medium text-gray-800">{fromAmount} USD</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Monto según tasa de cambio (sin comisión):</span>
                    <span className="font-medium text-gray-800">{amountAccordingToBase !== null ? amountAccordingToBase.toFixed(0) : '—'} MXN</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Tasa base:</span>
                    <span className="font-medium text-gray-800">{baseRate ? baseRate.toFixed(4) : '—'} MXN/USD</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Tasa aplicada (con comisión {commissionPercent}%):</span>
                    <span className="font-medium text-gray-800">{effectiveRate ? effectiveRate.toFixed(4) : '—'} MXN/USD</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Comisión sucursal aprox.:</span>
                    <span className="font-medium text-red-600">- {commissionAmountMXN !== null ? commissionAmountMXN.toFixed(0) : '—'} MXN</span>
                  </div>
                  <div className="bg-green-50 mt-3 p-3 border border-green-200 rounded-md">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-green-800">Tú recibirás (después de comisión):</span>
                      <span className="font-bold text-green-900 text-lg">{toAmount} MXN</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Branch and Method */}
        <div className="flex sm:flex-row flex-col gap-3">
          <div className="flex-1">
            <label htmlFor="branch" className="block mb-2 font-medium text-primary">Sucursal:</label>
            <select id="branch" value={branchId} onChange={(e) => setBranchId(e.target.value === '' ? '' : Number(e.target.value))} className="p-3 border-2 border-light-green focus:border-secondary rounded-lg focus:outline-none w-full font-['Roboto'] text-lg cursor-pointer" disabled={isLoading}>
              {branches.length > 0 ? (
                branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)
              ) : (
                <option>Cargando sucursales...</option>
              )}
            </select>
          </div>

          {/* Method only shows when buying USD */}
          {operationType === 'buy' && (
            <div className="flex-1">
              <label htmlFor="method" className="block mb-2 font-medium text-primary">Método de Pago:</label>
              <select id="method" value={method} onChange={(e) => setMethod(e.target.value)} className="p-3 border-2 border-light-green focus:border-secondary rounded-lg focus:outline-none w-full font-['Roboto'] text-lg cursor-pointer" disabled={isLoading}>
                <option value="En sucursal">En sucursal (efectivo)</option>

                <option value="Tarjeta">Tarjeta de débito/prepago</option>
              </select>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive" className="mt-2">
            <AlertTitle>Error en la operación</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Action Button */}
        <div className="mt-2">
          <button
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 px-4 py-3 rounded-lg w-full font-medium text-white transition-colors cursor-pointer disabled:cursor-not-allowed"
            onClick={onReserve}
            disabled={isLoading}
          >
            {isLoading ? 'Procesando...' : 'Revisar Orden'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OperationForm;