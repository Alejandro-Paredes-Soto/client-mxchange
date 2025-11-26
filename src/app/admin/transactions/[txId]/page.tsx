"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { humanizeStatus, getStatusColor } from '../../../../lib/statuses';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { ArrowRight, Building2, Calendar, CreditCard, Hash, TrendingUp, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { putTransactionStatus } from '../../../services/api';
import { getSocket } from '@/lib/socket';
import { toast } from 'sonner';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function AdminTransactionDetail() {
  const params = useParams();
  const router = useRouter();
  const rawTxId = params?.txId;
  const txId = Array.isArray(rawTxId) ? rawTxId[0] : rawTxId;
  const [tx, setTx] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const reload = useCallback(async () => {
    if (!txId) return;
    setLoading(true);
    try {
      const token = Cookies.get('token') || '';
      const url = `${API_BASE}/admin/transactions?code=${encodeURIComponent(String(txId))}`;
      const res = await fetch(url, { cache: 'no-store', headers: { 'Authorization': token ? `Bearer ${token}` : '' } });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || 'No encontrada');
      }
      const j = await res.json();
      const found = (j && j.transactions && j.transactions.length) ? j.transactions[0] : (j && j.transaction) ? j.transaction : null;
      setTx(found);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Error fetching tx', e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [txId]);

  useEffect(() => { reload(); }, [reload]);

  // Escuchar cambios de estado en tiempo real vía WebSocket
  useEffect(() => {
    if (!tx) return;

    const socket = getSocket();
    const txIdToListen = (tx as any).transaction_code || (tx as any).id || txId;

    const handleTransactionUpdate = (payload: any) => {
      console.log('transaction.updated recibido:', payload);
      
      // Verificar si es la transacción actual
      const payloadTxCode = payload.transaction_code || payload.code || payload.id;
      const currentTxCode = (tx as any).transaction_code || (tx as any).id;
      
      if (payloadTxCode && currentTxCode && String(payloadTxCode) === String(currentTxCode)) {
        toast.info('Estado actualizado', {
          description: `La transacción cambió a: ${humanizeStatus(payload.status)}`,
        });
        
        // Recargar la transacción para obtener los datos actualizados
        reload();
      }
    };

    const handleStatusChange = (payload: any) => {
      console.log('transaction.status_changed recibido:', payload);
      
      const payloadTxId = payload.transaction_id || payload.id;
      const currentTxId = (tx as any).id;
      
      if (payloadTxId && currentTxId && Number(payloadTxId) === Number(currentTxId)) {
        toast.info('Estado actualizado', {
          description: `La transacción cambió a: ${humanizeStatus(payload.status || payload.new_status)}`,
        });
        
        reload();
      }
    };

    socket.on('transaction.updated', handleTransactionUpdate);
    socket.on('transaction.status_changed', handleStatusChange);

    return () => {
      socket.off('transaction.updated', handleTransactionUpdate);
      socket.off('transaction.status_changed', handleStatusChange);
    };
  }, [tx, txId, reload]);

  const performAction = async (nextStatus: string) => {
    if (!tx) return;
    try {
      setUpdating(true);
      const token = Cookies.get('token') || '';
      const idVal = (tx as any).id ?? (tx as any).ID ?? null;
      if (!idVal) throw new Error('ID de transacción no disponible.');
      const resp = await putTransactionStatus(Number(idVal), nextStatus, token);
      if ((resp as any).error) throw new Error('No se pudo actualizar el estado.');
      await reload();
    } catch (e) {
      console.error('performAction error', e);
      setError(e instanceof Error ? e.message : 'Error al realizar la acción');
    } finally {
      setUpdating(false);
    }
  };

  const getValue = (key: string) => {
    if (!tx) return null;
    const v = tx[key] ?? tx[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
    return v === undefined || v === null ? null : v;
  };

  const formatPrettyDate = (v: unknown) => {
    try {
      const t = typeof v === 'number' ? v : v ? Date.parse(String(v)) : NaN;
      if (isNaN(t)) return '-';
      const d = new Date(t);
      const weekday = d.toLocaleDateString('es-ES', { weekday: 'long' });
      const day = d.getDate();
      const month = d.toLocaleDateString('es-ES', { month: 'long' });
      const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${day} de ${month} a las ${time}`;
    } catch {
      return String(v ?? '-');
    }
  };

  if (!txId) return (
    <div className="mx-auto p-6 max-w-5xl">
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">Falta el código de transacción.</p>
      </Card>
    </div>
  );
  
  if (loading) return (
    <div className="mx-auto p-6 max-w-5xl">
      <Card className="p-8 text-center">
        <div className="space-y-4 animate-pulse">
          <div className="bg-muted mx-auto rounded w-1/4 h-4"></div>
          <div className="bg-muted mx-auto rounded w-1/2 h-4"></div>
        </div>
        <p className="mt-4 text-muted-foreground">Cargando transacción...</p>
      </Card>
    </div>
  );
  
  if (error) return (
    <div className="mx-auto p-6 max-w-5xl">
      <Card className="bg-destructive/10 p-8 border-destructive/20">
        <p className="font-medium text-destructive">Error: {error}</p>
      </Card>
    </div>
  );
  
  if (!tx) {
    return (
      <section className="mx-auto p-6 max-w-5xl">
        <div className="mb-8">
          <Button variant="ghost" onClick={() => router.back()} className="mb-6 cursor-pointer">
            <svg className="mr-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Regresar
          </Button>
          <Alert>
            <AlertCircle className="w-4 h-4" />
            <AlertTitle>No se encontró la transacción</AlertTitle>
            <AlertDescription>La transacción que buscas no existe o ha expirado.</AlertDescription>
          </Alert>
        </div>
      </section>
    );
  }

  const amountFrom = Number(getValue('amount_from') ?? getValue('amountFrom') ?? tx.amount_from ?? tx.amountFrom ?? 0);
  const amountTo = Number(getValue('amount_to') ?? getValue('amountTo') ?? tx.amount_to ?? tx.amountTo ?? 0);
  const rate = Number(getValue('exchange_rate') ?? getValue('rate') ?? tx.exchange_rate ?? tx.rate ?? 0);
  const commissionAmount = getValue('commission_amount') ?? getValue('commissionAmount') ?? tx.commission_amount ?? tx.commissionAmount;
  const commissionPercent = tx.commission_percent ?? tx.commissionPercent;
  const method = String(getValue('method') ?? tx.method ?? '-');
  const branch = String(getValue('branch_name') ?? getValue('branchName') ?? tx.branch_name ?? tx.branchName ?? (tx.branch_id ? `Sucursal ${tx.branch_id}` : '-'));
  const rawStatus = String(getValue('status') ?? tx.status ?? '-');
  const humanStatus = String(humanizeStatus(rawStatus || String(rawStatus)));

  const txType = String(getValue('type') ?? tx.type ?? '').toLowerCase();
  const isBuying = txType === 'buy';
  const currencyFrom = String(getValue('currency_from') ?? getValue('currencyFrom') ?? tx.currency_from ?? tx.currencyFrom ?? 'MXN');
  const currencyTo = String(getValue('currency_to') ?? getValue('currencyTo') ?? tx.currency_to ?? tx.currencyTo ?? 'USD');

  // Determinar si el pago es con tarjeta
  const isPaidWithCard = method.toLowerCase().includes('card') || method.toLowerCase().includes('tarjeta') || method.toLowerCase().includes('stripe');
  // Determinar si ya está pagado (para pagos con tarjeta)
  const isPaid = rawStatus.toLowerCase() === 'paid';
  // Si pagó con tarjeta y ya está paid, o si es pago en sucursal
  const showPaymentCompleted = isPaidWithCard && (isPaid || rawStatus.toLowerCase() === 'ready_for_pickup' || rawStatus.toLowerCase() === 'completed');

  return (
    <section className="mx-auto p-6">
      {/* Header compacto */}
      <div className="mb-6">
        <div className="flex sm:flex-row flex-col justify-between items-start gap-3 mb-3">
          <div className="flex-1">
            <h1 className="mb-2 font-bold text-primary text-3xl tracking-tight">Detalle de Transacción</h1>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Hash className="w-4 h-4" />
                <span className="font-mono">{txId}</span>
              </div>
              <Badge 
                variant={txType === 'buy' ? 'default' : 'secondary'}
                className="px-3 py-1"
              >
                {txType === 'buy' ? 'COMPRA' : txType === 'sell' ? 'VENTA' : txType.toUpperCase()}
              </Badge>
            </div>
          </div>
          <Badge className={`${getStatusColor(rawStatus)} px-4 py-2`} variant="outline">
            {humanStatus || rawStatus}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Calendar className="w-4 h-4" />
          <span>
            {formatPrettyDate(getValue('created_at') ?? getValue('createdAt') ?? getValue('created') ?? tx.created_at ?? tx.createdAt)}
          </span>
        </div>
      </div>

      {/* Grid principal - 2 columnas */}
      <div className="gap-6 grid grid-cols-1 lg:grid-cols-2">
        {/* Columna Izquierda */}
        <div className="space-y-6">
          {/* Montos principales */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Operación de Cambio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted/50 p-6 rounded-lg">
                {showPaymentCompleted ? (
                  // Si ya pagó con tarjeta, solo mostrar lo que se le entrega
                  <div className="text-center">
                    <p className="mb-2 font-medium text-muted-foreground text-xs uppercase">
                      {isBuying ? 'Cliente recibe' : 'Cliente recibe'}
                    </p>
                    <p className="mb-1 font-bold text-4xl">
                      ${(isBuying ? amountTo : amountTo).toFixed(2)}
                    </p>
                    <p className="font-semibold text-muted-foreground">{isBuying ? currencyTo : currencyTo}</p>
                    <div className="space-y-2 mt-4 pt-4 border-t">
                      <p className="font-medium text-green-600 dark:text-green-400 text-sm">
                        ✓ Pago con tarjeta completado
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Pagó: ${amountFrom.toFixed(2)} {currencyFrom}
                      </p>
                    </div>
                  </div>
                ) : (
                  // Mostrar flujo normal para pagos en sucursal o antes de pagar
                  <div className="flex justify-between items-center gap-4">
                    <div className="flex-1 text-center">
                      <p className="mb-2 font-medium text-muted-foreground text-xs uppercase">
                        {isBuying ? 'Cliente paga' : 'Cliente entrega'}
                      </p>
                      <p className="mb-1 font-bold text-3xl">
                        ${amountFrom.toFixed(2)}
                      </p>
                      <p className="font-semibold text-muted-foreground text-sm">{currencyFrom}</p>
                    </div>

                    <ArrowRight className="flex-shrink-0 w-6 h-6 text-muted-foreground" />

                    <div className="flex-1 text-center">
                      <p className="mb-2 font-medium text-muted-foreground text-xs uppercase">
                        {isBuying ? 'Cliente recibe' : 'Cliente recibe'}
                      </p>
                      <p className="mb-1 font-bold text-3xl">
                        ${amountTo.toFixed(2)}
                      </p>
                      <p className="font-semibold text-muted-foreground text-sm">{currencyTo}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Detalles Financieros y Operativos en grid */}
          <div className="gap-4 grid grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Detalles Financieros</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-medium text-muted-foreground text-xs uppercase">
                    <TrendingUp className="w-3 h-3" />
                    Tasa
                  </div>
                  <div className="font-bold text-lg">
                    {isNaN(rate) ? '-' : `$${rate.toFixed(4)}`}
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-1">
                  <div className="font-medium text-muted-foreground text-xs uppercase">
                    Comisión
                  </div>
                  <div className="font-semibold text-sm">
                    {commissionPercent 
                      ? `${Number(commissionPercent).toFixed(2)}%` 
                      : '—'}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Info. Operativa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-medium text-muted-foreground text-xs uppercase">
                    <Building2 className="w-3 h-3" />
                    Sucursal
                  </div>
                  <div className="font-semibold text-sm">{branch}</div>
                </div>
                
                <Separator />
                
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-medium text-muted-foreground text-xs uppercase">
                    <CreditCard className="w-3 h-3" />
                    Método
                  </div>
                  <div className="font-semibold text-sm">{method}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Columna Derecha */}
        <div className="space-y-6">
          {/* Instrucciones y Acciones juntas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Instrucciones y Acciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Instrucciones */}
              <div className="space-y-3">
                {showPaymentCompleted ? (
                  // Si ya pagó con tarjeta, solo mostrar instrucción de entrega
                  <div className="flex items-start gap-3 bg-muted/50 p-3 border rounded-lg">
                    <div className="flex flex-shrink-0 justify-center items-center bg-primary rounded-full w-8 h-8 font-bold text-primary-foreground text-sm">
                      ✓
                    </div>
                    <div className="flex-1">
                      <p className="mb-1 font-semibold text-muted-foreground text-xs">
                        {isBuying ? 'Entregar al cliente' : 'Recibir del cliente'}
                      </p>
                      <p className="font-bold text-xl">
                        ${isBuying ? amountTo.toFixed(2) : amountFrom.toFixed(2)} {isBuying ? currencyTo : currencyFrom}
                      </p>
                    </div>
                  </div>
                ) : (
                  // Instrucciones normales para pago en sucursal
                  <>
                    <div className="flex items-start gap-3 bg-muted/50 p-3 border rounded-lg">
                      <div className="flex flex-shrink-0 justify-center items-center bg-primary rounded-full w-8 h-8 font-bold text-primary-foreground text-sm">
                        1
                      </div>
                      <div className="flex-1">
                        <p className="mb-1 font-semibold text-muted-foreground text-xs">
                          {isBuying ? 'Recibir del cliente' : 'Dar al cliente'}
                        </p>
                        <p className="font-bold text-xl">
                          ${isBuying ? amountFrom.toFixed(2) : amountTo.toFixed(2)} {isBuying ? currencyFrom : currencyTo}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 bg-muted/50 p-3 border rounded-lg">
                      <div className="flex flex-shrink-0 justify-center items-center bg-primary rounded-full w-8 h-8 font-bold text-primary-foreground text-sm">
                        2
                      </div>
                      <div className="flex-1">
                        <p className="mb-1 font-semibold text-muted-foreground text-xs">
                          {isBuying ? 'Entregar al cliente' : 'Recibir del cliente'}
                        </p>
                        <p className="font-bold text-xl">
                          ${isBuying ? amountTo.toFixed(2) : amountFrom.toFixed(2)} {isBuying ? currencyTo : currencyFrom}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <Separator />

              {/* Acciones */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Acciones Disponibles</h4>
                <div className="flex flex-col gap-2">
                  {(() => {
                    const s = rawStatus.toLowerCase();
                    const actions: { label: string; status: string; variant?: 'default' | 'destructive' | 'secondary' }[] = [];
                    
                    if (isBuying) {
                      if (s === 'reserved') {
                        // Si es pago con tarjeta y está en 'reserved', no permitir marcar como listo
                        if (isPaidWithCard) {
                          return <p className="text-muted-foreground text-sm">Esperando pago del cliente con tarjeta...</p>;
                        } else {
                          // Pago en sucursal
                          actions.push({ label: 'Marcar Dinero Listo', status: 'ready_for_pickup' });
                          actions.push({ label: 'Cancelar Orden', status: 'cancelled', variant: 'destructive' });
                        }
                      } else if (s === 'paid') {
                        // Cliente ya pagó con tarjeta, ahora sí se puede marcar como listo
                        actions.push({ label: 'Marcar Dinero Listo', status: 'ready_for_pickup' });
                        actions.push({ label: 'Cancelar Orden', status: 'cancelled', variant: 'destructive' });
                      } else if (s === 'ready_for_pickup') {
                        actions.push({ label: 'Completar Orden', status: 'completed' });
                        actions.push({ label: 'Cancelar Orden', status: 'cancelled', variant: 'destructive' });
                      }
                    } else if (txType === 'sell') {
                      if (s === 'reserved') {
                        actions.push({ label: 'Marcar Dinero Listo', status: 'ready_to_receive' });
                        actions.push({ label: 'Cancelar Orden', status: 'cancelled', variant: 'destructive' });
                      } else if (s === 'ready_to_receive') {
                        actions.push({ label: 'Completar Orden', status: 'completed' });
                        actions.push({ label: 'Cancelar Orden', status: 'cancelled', variant: 'destructive' });
                      }
                    }
                    
                    if (!actions.length) return <p className="text-muted-foreground text-sm">No hay acciones disponibles.</p>;
                    
                    return actions.map((a) => (
                      <Button 
                        key={a.label} 
                        variant={a.variant || 'default'} 
                        disabled={updating} 
                        onClick={() => performAction(a.status)}
                        className="w-full"
                      >
                        {updating ? 'Procesando...' : a.label}
                      </Button>
                    ));
                  })()}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}