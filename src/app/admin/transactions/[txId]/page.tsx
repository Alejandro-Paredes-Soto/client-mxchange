"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Cookies from 'js-cookie';
import { humanizeStatus, getStatusColor } from '../../../../lib/statuses';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, Building2, Calendar, CreditCard, Hash, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { putTransactionStatus } from '../../../services/api';
import { getSocket } from '@/lib/socket';
import { toast } from 'sonner';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function AdminTransactionDetail() {
  const params = useParams();
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

  if (!txId) return <div className="p-6">Falta el código de transacción.</div>;
  if (loading) return <div className="p-6">Cargando...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!tx) return <div className="p-6">No se encontró la transacción.</div>;

  const amountFrom = Number(getValue('amount_from') ?? getValue('amountFrom') ?? tx.amount_from ?? tx.amountFrom ?? 0);
  const amountTo = Number(getValue('amount_to') ?? getValue('amountTo') ?? tx.amount_to ?? tx.amountTo ?? 0);
  const rate = Number(getValue('exchange_rate') ?? getValue('rate') ?? tx.exchange_rate ?? tx.rate ?? 0);
  const commissionAmount = getValue('commission_amount') ?? getValue('commissionAmount') ?? tx.commission_amount ?? tx.commissionAmount;
  const commissionPercent = tx.commission_percent ?? tx.commissionPercent;
  const method = String(getValue('method') ?? tx.method ?? '-');
  const branch = String(getValue('branch') ?? (tx.branch_id ? `Sucursal ${tx.branch_id}` : tx.branch) ?? '-');
  const rawStatus = String(getValue('status') ?? tx.status ?? '-');
  const humanStatus = String(humanizeStatus(rawStatus || String(rawStatus)));

  const txType = String(getValue('type') ?? tx.type ?? '').toLowerCase();
  const isBuying = txType === 'buy';
  const currencyFrom = String(getValue('currency_from') ?? getValue('currencyFrom') ?? tx.currency_from ?? tx.currencyFrom ?? 'MXN');
  const currencyTo = String(getValue('currency_to') ?? getValue('currencyTo') ?? tx.currency_to ?? tx.currencyTo ?? 'USD');

  return (
    <section className="space-y-6 mx-auto p-6 max-w-5xl">
      {/* Header */}
      <div className="flex sm:flex-row flex-col justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-4">
            <h1 className="font-bold text-3xl tracking-tight">Transacción</h1>
            {/* Tipo de operación grande y visible */}
            <span
              aria-label={`Tipo de operación: ${txType === 'buy' ? 'Compra' : txType === 'sell' ? 'Venta' : txType}`}
              className={`inline-flex items-center px-4 py-2 rounded-full text-white font-semibold text-lg uppercase select-none ${isBuying ? 'bg-emerald-600' : 'bg-rose-600'}`}
            >
              {txType === 'buy' ? 'COMPRA' : txType === 'sell' ? 'VENTA' : (txType || '-').toString().toUpperCase()}
            </span>
          </div>

          <p className="flex items-center gap-2 mt-2 text-muted-foreground">
            <Hash className="w-4 h-4" />
            <span className="font-mono">{txId}</span>
          </p>
        </div>
        <div className={`px-4 py-2 rounded-lg border ${getStatusColor(rawStatus)}`}>
          <div className="font-semibold">{humanStatus || rawStatus}</div>
        </div>
      </div>

      {/* Main Exchange Info */}
      <Card>
        <CardHeader>
          <CardTitle>Operación de Cambio</CardTitle>
          <CardDescription className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {formatPrettyDate(getValue('created_at') ?? getValue('createdAt') ?? getValue('created') ?? tx.created_at ?? tx.createdAt)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex sm:flex-row flex-col justify-between items-center gap-8 py-4">
            <div className="sm:text-left text-center">
              <p className="mb-2 text-muted-foreground text-sm">
                {isBuying ? 'Cliente paga' : 'Cliente recibe'}
              </p>
              <p className="font-bold text-4xl">
                ${amountFrom.toFixed(2)}
              </p>
              <p className="mt-1 text-muted-foreground text-lg">{currencyFrom}</p>
            </div>

            <ArrowRight className="w-8 h-8 text-muted-foreground" />

            <div className="text-center sm:text-right">
              <p className="mb-2 text-muted-foreground text-sm">
                {isBuying ? 'Cliente recibe' : 'Cliente paga'}
              </p>
              <p className="font-bold text-4xl">
                ${amountTo.toFixed(2)}
              </p>
              <p className="mt-1 text-muted-foreground text-lg">{currencyTo}</p>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Action Summary */}
          <div className="space-y-4 bg-muted/50 p-6 rounded-lg">
            <div>
              <h3 className="mb-2 font-semibold text-lg">Instrucciones de operación</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex flex-shrink-0 justify-center items-center bg-primary rounded-full w-8 h-8 font-semibold text-primary-foreground">
                    1
                  </div>
                  <div>
                    <p className="font-medium">
                      {isBuying ? 'Recibir del cliente' : 'Dar al cliente'}
                    </p>
                    <p className="font-bold text-2xl">
                      ${isBuying ? amountFrom.toFixed(2) : amountTo.toFixed(2)} {isBuying ? currencyFrom : currencyTo}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="flex flex-shrink-0 justify-center items-center bg-primary rounded-full w-8 h-8 font-semibold text-primary-foreground">
                    2
                  </div>
                  <div>
                    <p className="font-medium">
                      {isBuying ? 'Entregar al cliente' : 'Recibir del cliente'}
                    </p>
                    <p className="font-bold text-2xl">
                      ${isBuying ? amountTo.toFixed(2) : amountFrom.toFixed(2)} {isBuying ? currencyTo : currencyFrom}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Acciones según estatus/tipo */}
      <div className="flex flex-wrap gap-3">
        {(() => {
          const s = rawStatus.toLowerCase();
          const actions: { label: string; status: string; variant?: 'default' | 'destructive' | 'secondary' }[] = [];
          if (isBuying) {
            if (s === 'reserved') {
              // Cliente compra y paga en sucursal - marcar dinero listo
              actions.push({ label: 'Dinero Preparado y Listo', status: 'ready_for_pickup' });
              actions.push({ label: 'Cancelar Orden', status: 'cancelled', variant: 'destructive' });
            } else if (s === 'paid') {
              // Cliente compra y paga en línea - preparar para recoger
              actions.push({ label: 'Dinero Preparado y Listo', status: 'ready_for_pickup' });
              actions.push({ label: 'Cancelar Orden', status: 'cancelled', variant: 'destructive' });
            } else if (s === 'ready_for_pickup') {
              actions.push({ label: 'Completar Orden', status: 'completed' });
              actions.push({ label: 'Cancelar Orden', status: 'cancelled', variant: 'destructive' });
            }
          } else if (txType === 'sell') {
            if (s === 'reserved') {
              actions.push({ label: 'Dinero Preparado y Listo', status: 'ready_to_receive' });
              actions.push({ label: 'Cancelar Orden', status: 'cancelled', variant: 'destructive' });
            } else if (s === 'ready_to_receive') {
              actions.push({ label: 'Completar Orden', status: 'completed' });
              actions.push({ label: 'Cancelar Orden', status: 'cancelled', variant: 'destructive' });
            }
          }
          if (!actions.length) return null;
          return actions.map((a) => (
            <Button key={a.label} variant={a.variant || 'default'} disabled={updating} onClick={() => performAction(a.status)}>
              {updating ? 'Procesando...' : a.label}
            </Button>
          ));
        })()}
      </div>

      {/* Details Grid */}
      <div className="gap-6 grid md:grid-cols-2">
        {/* Transaction Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detalles de la transacción</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Tipo de operación</span>
                <Badge
                  variant={txType === 'buy' ? 'default' : 'secondary'}
                  className="px-3 py-1 font-semibold text-sm uppercase"
                >
                  {txType === 'buy' ? 'Compra' : txType === 'sell' ? 'Venta' : txType}
                </Badge>
            </div>
            
            <Separator />
            
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2 text-muted-foreground text-sm">
                <TrendingUp className="w-4 h-4" />
                Tasa de cambio
              </span>
              <span className="font-semibold">{isNaN(rate) ? '-' : `$${rate.toFixed(4)}`}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Comisión</span>
              <span className="font-semibold">
                {commissionPercent 
                  ? `${Number(commissionPercent).toFixed(2)}% ($${Number(commissionAmount || 0).toFixed(2)})` 
                  : (commissionAmount ? `$${Number(commissionAmount).toFixed(2)}` : '—')}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Operational Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Información operativa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2 text-muted-foreground text-sm">
                <Building2 className="w-4 h-4" />
                Sucursal
              </span>
              <span className="font-semibold">{branch}</span>
            </div>
            
            <Separator />
            
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2 text-muted-foreground text-sm">
                <CreditCard className="w-4 h-4" />
                Método de pago
              </span>
              <span className="font-semibold">{method}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Estado actual</span>
              <div className={`px-3 py-1 rounded-md border ${getStatusColor(rawStatus)}`}>
                <div className="font-semibold text-sm">{humanStatus || rawStatus}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}