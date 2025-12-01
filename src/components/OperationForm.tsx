"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import Cookies from 'js-cookie';
import { listBranches, Rates, createTransactionApi, calculateOperation, OperationCalculation } from "@/app/services/api";
import { debounce } from 'lodash';
import { useSocket } from '@/providers/SocketProvider';
import { toast } from 'sonner';
import { NumberInput } from "./ui/number-input";
import { Spinner } from "./ui/spinner";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, Calculator, Building2, CreditCard, DollarSign, Info } from "lucide-react";

type OperationType = 'buy' | 'sell';

type Props = {
  initialMode?: OperationType;
  rates: Rates | null;
  onReserved?: (txCode: string) => void;
};

const OperationForm: React.FC<Props> = ({ initialMode = 'buy', rates, onReserved }) => {
  const [operationType, setOperationType] = useState<OperationType>(initialMode);
  const [usdInput, setUsdInput] = useState<string>('');
  const [calculation, setCalculation] = useState<OperationCalculation | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationError, setCalculationError] = useState<string | null>(null);

  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);
  const [branchId, setBranchId] = useState<string>('');
  const [method, setMethod] = useState<string>('En sucursal');

  const [error, setError] = useState<string | null>(null);
  const [negativeWarning, setNegativeWarning] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const socket = useSocket();

  const calculateDebounceRef = useRef<ReturnType<typeof debounce> | null>(null);

  type InventoryItem = { amount: number; low_stock_threshold: number | null };
  type InventoryPayload = { transaction?: unknown; inventory?: Record<string, InventoryItem>; branch_id?: number };

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
        if (response.calculation.inventory?.status === 'insufficient') {
          setCalculationError('Fondos insuficientes en esta sucursal para el monto solicitado.');
        }
      }
    } catch (err: unknown) {
      console.error('Error calculando operación:', err);
      const httpErr = err as { response?: { status?: number; data?: { message?: string } } };
      setCalculationError(httpErr.response?.data?.message || 'Error calculando la operación.');
      setCalculation(null);
    } finally {
      setIsCalculating(false);
    }
  }, []);

  useEffect(() => {
    calculateDebounceRef.current = debounce((amount: string, type: OperationType, branch: string) => {
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

  useEffect(() => {
    if (usdInput && calculateDebounceRef.current) {
      calculateDebounceRef.current(usdInput, operationType, branchId);
    } else {
      setCalculation(null);
      setCalculationError(null);
    }
  }, [usdInput, operationType, branchId]);

  const handleUsdInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (value.includes('-')) {
      value = value.replace(/-/g, '');
      setNegativeWarning(true);
      setTimeout(() => setNegativeWarning(false), 3000);
    }
    setUsdInput(value);
    setError(null);
  };

  useEffect(() => {
    setOperationType(initialMode);
    setUsdInput('');
    setCalculation(null);
    setCalculationError(null);
  }, [initialMode]);

  useEffect(() => {
    (async () => {
      try {
        const branchList = await listBranches();
        setBranches(branchList.map(b => ({ id: b.id, name: b.name })));
        if (branchList.length > 0) {
          setBranchId(branchList[0].id.toString());
        }
      } catch (e) {
        console.error('Error loading branches', e);
        setError("No se pudieron cargar las sucursales.");
      }
    })();
  }, []);

  useEffect(() => {
    const handler = (payload: unknown) => {
      try {
        if (typeof payload === 'object' && payload !== null) {
          const p = payload as InventoryPayload;
          if (p.branch_id && branchId && Number(p.branch_id) === Number(branchId)) {
            if (usdInput && parseFloat(usdInput) > 0) {
              fetchCalculation(parseFloat(usdInput), operationType, Number(branchId));
            }
            const inv = p.inventory as Record<string, { amount: number; low_stock_threshold: number | null }> | undefined;
            if (inv) {
              Object.entries(inv).forEach(([currency, info]) => {
                if (info && typeof info.amount === 'number' && typeof info.low_stock_threshold === 'number') {
                  if (info.amount <= info.low_stock_threshold) {
                    toast.warning(`Inventario bajo en sucursal: ${currency} ${info.amount.toFixed(2)}`);
                  }
                }
              });
            }
          }
        }
      } catch { }
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

  const onReserve = async () => {
    if (!calculation) {
      setError('Por favor ingresa un monto válido.');
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

    const payload = {
      branch_id: Number(branchId),
      type: operationType,
      usd_amount: calculation.usd_amount,
      method: method,
    };

    try {
      const token = Cookies.get('token');
      if (!token) {
        setError('Tu sesión ha expirado. Inicia sesión de nuevo.');
        setIsLoading(false);
        return;
      }

      const res = await createTransactionApi(payload, token);

      if (res.transaction?.transaction_code) {
        if (onReserved) onReserved(res.transaction.transaction_code);
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
          console.warn('Socket error', e);
        }
      } else {
        setError('No se pudo crear la transacción.');
      }
    } catch (err: unknown) {
      const httpErr = err as { response?: { status?: number; data?: { message?: string } } };
      setError(httpErr.response?.data?.message || 'Error al crear la transacción.');
    } finally {
      setIsLoading(false);
    }
  };

  const switchOperationType = (newType: string) => {
    setOperationType(newType as OperationType);
    setUsdInput('');
    setCalculation(null);
    setCalculationError(null);
    setMethod('En sucursal');
    setError(null);
    setNegativeWarning(false);
  };

  return (
    <Card className="w-full shadow-lg ">
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl text-center">Cotizador de Divisas</CardTitle>
        <CardDescription className="text-center">
          Consulta el tipo de cambio en tiempo real y reserva tu operación
        </CardDescription>
      </CardHeader>

      <Tabs value={operationType} onValueChange={switchOperationType} className="w-full">
        <div className="px-6">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="buy" className="font-bold">Quiero Comprar USD</TabsTrigger>
            <TabsTrigger value="sell" className="font-bold">Quiero Vender USD</TabsTrigger>
          </TabsList>
        </div>

        <CardContent className="space-y-6">
          {/* Paso 1: Monto */}
          <div className="space-y-2">
            <Label htmlFor="amount" className="text-base font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              {operationType === 'buy' ? '¿Cuántos dólares quieres comprar?' : '¿Cuántos dólares quieres vender?'}
            </Label>
            <div className="relative">
              <NumberInput
                id="amount"
                value={usdInput}
                onChange={handleUsdInputChange}
                placeholder="0.00"
                decimals={2}
                className="pl-4 pr-12 py-6 text-lg font-medium"
                disabled={isLoading}
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                USD
              </div>
            </div>
            {negativeWarning && (
              <p className="text-xs text-destructive font-medium">No se permiten números negativos</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Paso 2: Sucursal */}
            <div className="space-y-2">
              <Label htmlFor="branch" className="text-base font-semibold flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Sucursal
              </Label>
              <Select value={branchId} onValueChange={setBranchId} disabled={isLoading}>
                <SelectTrigger id="branch" className="h-12">
                  <SelectValue placeholder="Selecciona una sucursal" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Paso 3: Método (Solo Compra) */}
            {operationType === 'buy' && (
              <div className="space-y-2">
                <Label htmlFor="method" className="text-base font-semibold flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Método de Pago
                </Label>
                <Select value={method} onValueChange={setMethod} disabled={isLoading}>
                  <SelectTrigger id="method" className="h-12">
                    <SelectValue placeholder="Selecciona método" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="En sucursal">Efectivo en sucursal</SelectItem>
                    <SelectItem value="Tarjeta">Tarjeta (Débito/Prepago)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Estado de Cálculo */}
          {isCalculating && (
            <div className="flex items-center justify-center py-4 text-muted-foreground animate-pulse">
              <Calculator className="w-5 h-5 mr-2" />
              Calculando cotización...
            </div>
          )}

          {/* Errores de Cálculo */}
          {calculationError && !isCalculating && (
            <Alert variant="destructive">
              <Info className="h-4 w-4" />
              <AlertTitle>Atención</AlertTitle>
              <AlertDescription>{calculationError}</AlertDescription>
            </Alert>
          )}

          {/* Resumen de la Operación */}
          {calculation && !isCalculating && !calculationError && (
            <div className="bg-muted/50 rounded-xl p-4 border border-border space-y-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tipo de Cambio Base</span>
                <span className="font-medium">{calculation.base_rate.toFixed(4)} MXN</span>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {operationType === 'buy' ? 'Monto a recibir' : 'Monto a entregar'}
                  </span>
                  <span className="font-medium">${calculation.usd_amount.toFixed(2)} USD</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Comisión ({calculation.commission_percent}%)</span>
                  <span className="text-destructive font-medium">+ ${calculation.commission_mxn.toLocaleString()} MXN</span>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="text-base font-semibold text-primary">
                    {operationType === 'buy' ? 'Total a Pagar' : 'Total a Recibir'}
                  </span>
                  <span className="text-xl font-bold text-primary">
                    ${calculation.mxn_amount.toLocaleString()} MXN
                  </span>
                </div>
              </div>

              {calculation.inventory && (
                <div className={`text-xs flex items-center gap-1.5 ${calculation.inventory.status === 'available' ? 'text-green-600' : 'text-orange-600'}`}>
                  <div className={`w-2 h-2 rounded-full ${calculation.inventory.status === 'available' ? 'bg-green-600' : 'bg-orange-600'}`} />
                  {calculation.inventory.status === 'available'
                    ? 'Fondos disponibles para entrega inmediata'
                    : 'Fondos limitados en esta sucursal'}
                </div>
              )}
            </div>
          )}

          {/* Error General */}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="pt-6">
          <Button
            className="w-full h-12 text-lg font-semibold shadow-md cursor-pointer"
            size="lg"
            onClick={onReserve}
            disabled={isLoading || isCalculating || !calculation || !!calculationError}
          >
            {isLoading ? (
              <>
                <Spinner className="mr-2 h-5 w-5" />
                Procesando...
              </>
            ) : (
              <>
                Confirmar Orden <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>
        </CardFooter>
      </Tabs>
    </Card>
  );
}

export default OperationForm;
