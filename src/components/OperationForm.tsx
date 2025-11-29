"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import Cookies from 'js-cookie';
import { listBranches, Rates, createTransactionApi, calculateOperation, OperationCalculation } from "@/app/services/api";
import { debounce } from 'lodash';
import { useSocket } from '@/providers/SocketProvider';
import { toast } from 'sonner';
import { NumberInput } from "./ui/number-input";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";

type OperationType = 'buy' | 'sell';

type Props = {
  initialMode?: OperationType;
  rates: Rates | null; // Solo para mostrar en UI, NO para cálculos
  onReserved?: (txCode: string) => void;
};

/**
 * OperationForm - Formulario de operaciones de cambio
 * 
 * IMPORTANTE: Este componente NO realiza cálculos de montos, comisiones ni tasas.
 * Todos los cálculos son realizados por el backend para evitar manipulación.
 * 
 * Flujo:
 * 1. Usuario ingresa monto en USD
 * 2. Frontend llama a /public/calculate-operation
 * 3. Backend devuelve todos los valores calculados
 * 4. Frontend muestra los valores (sin modificarlos)
 * 5. Al reservar, se envían solo datos mínimos al backend que recalcula todo
 */
const OperationForm: React.FC<Props> = ({ initialMode = 'buy', rates, onReserved }) => {
  const [operationType, setOperationType] = useState<OperationType>(initialMode);

  // Input del usuario: solo USD amount
  const [usdInput, setUsdInput] = useState<string>('');

  // Datos calculados por el backend (NUNCA calculados en frontend)
  const [calculation, setCalculation] = useState<OperationCalculation | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationError, setCalculationError] = useState<string | null>(null);

  // Branch and method state
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [branchId, setBranchId] = useState<number | ''>('');
  const [method, setMethod] = useState<string>('En sucursal');

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [negativeWarning, setNegativeWarning] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const socket = useSocket();

  // Referencia para el debounce
  const calculateDebounceRef = useRef<ReturnType<typeof debounce> | null>(null);

  // Tipos para payload de inventory.updated
  type InventoryItem = { amount: number; low_stock_threshold: number | null };
  type InventoryPayload = { transaction?: unknown; inventory?: Record<string, InventoryItem>; branch_id?: number };

  // ============================================================================
  // CÁLCULO VÍA BACKEND (única fuente de verdad)
  // ============================================================================
  const fetchCalculation = useCallback(async (usdAmount: number, type: OperationType, branch?: number) => {
    if (usdAmount <= 0) {
      setCalculation(null);
      setCalculationError(null);
      return;
    }

    setIsCalculating(true);
    setCalculationError(null);

    try {
      const response = await calculateOperation(type, usdAmount, branch || undefined);
      
      if (response.success && response.calculation) {
        setCalculation(response.calculation);
        
        // Verificar inventario
        if (response.calculation.inventory?.status === 'insufficient') {
          setCalculationError('Fondos insuficientes en esta sucursal para el monto solicitado.');
        }
      }
    } catch (err: unknown) {
      console.error('Error calculando operación:', err);
      const httpErr = err as { response?: { status?: number; data?: { message?: string } } };
      setCalculationError(httpErr.response?.data?.message || 'Error calculando la operación. Intenta de nuevo.');
      setCalculation(null);
    } finally {
      setIsCalculating(false);
    }
  }, []);

  // Crear debounce para el cálculo
  useEffect(() => {
    calculateDebounceRef.current = debounce((amount: string, type: OperationType, branch: number | '') => {
      const numAmount = parseFloat(amount);
      if (!isNaN(numAmount) && numAmount > 0) {
        fetchCalculation(numAmount, type, branch ? Number(branch) : undefined);
      } else {
        setCalculation(null);
        setCalculationError(null);
      }
    }, 500);

    return () => {
      calculateDebounceRef.current?.cancel();
    };
  }, [fetchCalculation]);

  // Trigger cálculo cuando cambia el input, tipo de operación o sucursal
  useEffect(() => {
    if (usdInput && calculateDebounceRef.current) {
      calculateDebounceRef.current(usdInput, operationType, branchId);
    } else {
      setCalculation(null);
      setCalculationError(null);
    }
  }, [usdInput, operationType, branchId]);

  // Handler para cambio de input USD
  const handleUsdInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    
    // Detectar y eliminar signos negativos
    if (value.includes('-')) {
      value = value.replace(/-/g, '');
      setNegativeWarning(true);
      // Ocultar el warning después de 3 segundos
      setTimeout(() => setNegativeWarning(false), 3000);
    }
    
    setUsdInput(value);
    setError(null);
  };

  // Effect to switch operation type
  useEffect(() => {
    setOperationType(initialMode);
    setUsdInput('');
    setCalculation(null);
    setCalculationError(null);
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
            // Refrescar cálculo si hay un monto ingresado
            if (usdInput && parseFloat(usdInput) > 0) {
              fetchCalculation(parseFloat(usdInput), operationType, branchId ? Number(branchId) : undefined);
            }

            // Comprobar umbrales y mostrar toast si está por debajo
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
  }, [branchId, socket, usdInput, operationType, fetchCalculation]);

  // ============================================================================
  // RESERVAR OPERACIÓN
  // El backend recalcula todo, solo enviamos datos mínimos
  // ============================================================================
  const onReserve = async () => {
    if (!calculation) {
      setError('Por favor ingresa un monto válido para calcular la operación.');
      return;
    }

    if (!branchId) {
      setError('Debes seleccionar una sucursal.');
      return;
    }

    if (calculation.inventory?.status === 'insufficient') {
      setError('Fondos insuficientes en la sucursal seleccionada.');
      return;
    }

    setIsLoading(true);
    setError(null);

    // Payload mínimo: el backend recalcula TODOS los valores
    const payload = {
      branch_id: branchId,
      type: operationType,
      // Enviamos el monto USD que el usuario quiere (el backend recalcula todo lo demás)
      usd_amount: calculation.usd_amount,
      // El método de pago solo es relevante para el flujo
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
        
        // Emitir actualización de inventario por socket
        try {
          const branchIdNum = Number(branchId);
          const invFromRes = (res.inventory && typeof res.inventory === 'object') ? res.inventory as Record<string, unknown> : undefined;
          if (socket && socket.emit) {
            if (invFromRes) {
              socket.emit('inventory.updated', { branch_id: branchIdNum, inventory: invFromRes, transaction: res.transaction });
            } else {
              socket.emit('inventory.updated', { branch_id: branchIdNum, refresh: true, transaction: res.transaction });
            }
          }
        } catch (e) {
          console.warn('No se pudo emitir evento de socket inventory.updated', e);
        }
      } else {
        setError('No se pudo crear la transacción. Intenta nuevamente.');
        return;
      }
    } catch (err: unknown) {
      console.error('Error creating transaction:', err);
      const httpErr = err as { response?: { status?: number; data?: { message?: string } } };
      if (httpErr.response?.status === 409) {
        setError(httpErr.response.data?.message || 'Fondos insuficientes.');
      } else if (httpErr.response?.data?.message) {
        setError(httpErr.response.data.message);
      } else {
        setError('Ocurrió un error inesperado al crear la transacción.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Cambiar tipo de operación
  const switchOperationType = (newType: OperationType) => {
    setOperationType(newType);
    setUsdInput('');
    setCalculation(null);
    setCalculationError(null);
    setMethod('En sucursal');
    setError(null);
    setNegativeWarning(false);
  };

  return (
    <div className="bg-white shadow-sm p-4 border border-gray-300 rounded-lg w-full">
      <header className="flex sm:flex-row flex-col justify-between items-start sm:items-center gap-3 mb-4">
        <h3 className="font-semibold text-primary text-lg">Generar Orden</h3>
        <div className="flex sm:flex-row flex-col items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <button
            className={`cursor-pointer w-full sm:w-auto px-3 py-2 rounded-md font-medium ${operationType === 'buy' ? 'bg-primary hover:bg-primary/90 text-white' : 'bg-white text-primary border border-light-green hover:bg-accent/50'}`}
            onClick={() => switchOperationType('buy')}
          >
            Quiero Comprar Dólares
          </button>
          <button
            className={`cursor-pointer w-full sm:w-auto px-3 py-2 rounded-md font-medium ${operationType === 'sell' ? 'bg-primary hover:bg-primary/90 text-white' : 'bg-white text-primary border border-light-green hover:bg-accent/50'}`}
            onClick={() => switchOperationType('sell')}
          >
            Quiero Vender Dólares
          </button>
        </div>
      </header>

      <div className="gap-4 grid grid-cols-1">
        {/* Input principal: siempre USD */}
        <div>
          <label className="block mb-2 font-medium text-primary">
            {operationType === 'buy' 
              ? '¿Cuántos Dólares Quieres Comprar?' 
              : '¿Cuántos Dólares Quieres Vender?'}
          </label>
          <div className="relative">
            <NumberInput
              value={usdInput}
              onChange={handleUsdInputChange}
              placeholder="0.00"
              decimals={2}
              className="p-3 border-2 border-light-green focus:border-secondary rounded-lg focus:outline-none w-full font-['Roboto'] text-lg"
              disabled={isLoading}
            />
            <span className="top-1/2 right-3 absolute font-semibold text-gray-500 -translate-y-1/2">USD</span>
          </div>
          <p className="mt-1 text-gray-500 text-xs">Mínimo: $1 USD • Máximo: $50,000 USD</p>
          {negativeWarning && (
            <p className="mt-1 font-medium text-red-500 text-xs">
              ⚠ No se permiten números negativos
            </p>
          )}
        </div>

        {/* Indicador de cálculo */}
        {isCalculating && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            Calculando...
          </div>
        )}

        {/* Error de cálculo */}
        {calculationError && !isCalculating && (
          <Alert variant="destructive">
            <AlertDescription>{calculationError}</AlertDescription>
          </Alert>
        )}

        {/* Información calculada por el backend */}
        {calculation && !isCalculating && !calculationError && (
          <div className="bg-gray-50 p-4 border border-gray-200 rounded-lg text-sm" aria-live="polite">
            {/* Tasas */}
            <div className="mb-3">
              <span className="font-medium text-gray-700">
                Tasa de {operationType === 'buy' ? 'Compra' : 'Venta'}:
              </span>
              <span className="ml-2 text-gray-600">
                1 USD = {calculation.base_rate.toFixed(4)} MXN
              </span>
            </div>

            {/* Desglose de la operación */}
            <div className="space-y-2 pt-3 border-gray-200 border-t">
              {operationType === 'buy' ? (
                <>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Dólares a comprar:</span>
                    <span className="font-medium text-gray-800">${calculation.usd_amount.toFixed(2)} USD</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Tasa base:</span>
                    <span className="font-medium text-gray-800">{calculation.base_rate.toFixed(4)} MXN/USD</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Tasa aplicada (con comisión {calculation.commission_percent}%):</span>
                    <span className="font-medium text-gray-800">{calculation.effective_rate.toFixed(4)} MXN/USD</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Comisión sucursal:</span>
                    <span className="font-medium text-red-600">${calculation.commission_mxn.toLocaleString()} MXN</span>
                  </div>
                  <div className="bg-green-50 mt-3 p-3 border border-green-200 rounded-md">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-green-800">Tú recibirás:</span>
                      <span className="font-bold text-green-900 text-lg">${calculation.usd_amount.toFixed(2)} USD</span>
                    </div>
                    <div className="flex justify-between items-center mt-1 text-green-700 text-xs">
                      <span>Pagas en total:</span>
                      <span>${calculation.mxn_amount.toLocaleString()} MXN</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Dólares a entregar:</span>
                    <span className="font-medium text-gray-800">${calculation.usd_amount.toFixed(2)} USD</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Tasa base:</span>
                    <span className="font-medium text-gray-800">{calculation.base_rate.toFixed(4)} MXN/USD</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Tasa aplicada (con comisión {calculation.commission_percent}%):</span>
                    <span className="font-medium text-gray-800">{calculation.effective_rate.toFixed(4)} MXN/USD</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Comisión sucursal:</span>
                    <span className="font-medium text-red-600">${calculation.commission_mxn.toLocaleString()} MXN</span>
                  </div>
                  <div className="bg-green-50 mt-3 p-3 border border-green-200 rounded-md">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-green-800">Tú recibirás:</span>
                      <span className="font-bold text-green-900 text-lg">${calculation.mxn_amount.toLocaleString()} MXN</span>
                    </div>
                    <div className="flex justify-between items-center mt-1 text-green-700 text-xs">
                      <span>Entregas:</span>
                      <span>${calculation.usd_amount.toFixed(2)} USD</span>
                    </div>
                  </div>
                </>
              )}

              {/* Estado del inventario */}
              {calculation.inventory && (
                <div className={`mt-2 text-xs ${calculation.inventory.status === 'available' ? 'text-green-600' : 'text-orange-600'}`}>
                  {calculation.inventory.status === 'available' 
                    ? '✓ Fondos disponibles en esta sucursal'
                    : '⚠ Fondos insuficientes en esta sucursal'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sucursal y Método de pago */}
        <div className="flex sm:flex-row flex-col gap-3">
          <div className="flex-1">
            <label htmlFor="branch" className="block mb-2 font-medium text-primary">Sucursal:</label>
            <select 
              id="branch" 
              value={branchId} 
              onChange={(e) => setBranchId(e.target.value === '' ? '' : Number(e.target.value))} 
              className="p-3 border-2 border-light-green focus:border-secondary rounded-lg focus:outline-none w-full font-['Roboto'] text-lg cursor-pointer" 
              disabled={isLoading}
            >
              {branches.length > 0 ? (
                branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)
              ) : (
                <option>Cargando sucursales...</option>
              )}
            </select>
          </div>

          {/* Método de pago solo para compra */}
          {operationType === 'buy' && (
            <div className="flex-1">
              <label htmlFor="method" className="block mb-2 font-medium text-primary">Método de Pago:</label>
              <select 
                id="method" 
                value={method} 
                onChange={(e) => setMethod(e.target.value)} 
                className="p-3 border-2 border-light-green focus:border-secondary rounded-lg focus:outline-none w-full font-['Roboto'] text-lg cursor-pointer" 
                disabled={isLoading}
              >
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
            disabled={isLoading || isCalculating || !calculation || !!calculationError}
          >
            {isLoading ? 'Procesando...' : 'Revisar Orden'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OperationForm;
