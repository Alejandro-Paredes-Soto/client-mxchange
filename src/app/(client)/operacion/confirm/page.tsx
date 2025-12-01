"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { Suspense, useEffect, useState } from 'react';
import { listTransactionsMock, Transaction, getUserTransactions, BackendTransaction } from '../../../services/api';
import { humanizeStatus, getStatusColor } from '@/lib/statuses';

import Cookies from 'js-cookie';
import { CreditCard, Banknote, AlertCircle, ArrowLeft } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';

import Link from 'next/link';
import Image from 'next/image';
import { getSocket } from '@/lib/socket';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

const humanizeMethod = (m?: string) => {
  if (!m) return 'N/A';
  const v = m.toLowerCase();
  if (v.includes('card') || v.includes('tarjeta')) return 'Tarjeta';
  if (v.includes('vent') || v.includes('cash') || v.includes('efectivo') || v.includes('sucursal')) return 'En sucursal';
  return m;
};

const ConfirmContent = () => {
  const params = useSearchParams();
  const txId = params.get('txId');
  const [tx, setTx] = useState<Transaction | null>(null);
  const [downloading, setDownloading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const list = listTransactionsMock();
    const found = list.find(t => t.id === txId) || null;
    if (found) {
      setTx(found);
      return;
    }

    (async () => {
      try {
        const token = typeof window !== 'undefined' ? Cookies.get('token') : null;
        if (!token) { setTx(null); return; }
        const remote = await getUserTransactions(token);
        const foundRemote = (remote || []).find((r: BackendTransaction) => r.transaction_code === txId || String(r.id) === txId) || null;

        if (foundRemote) {
          const mapped: Transaction = {
            id: foundRemote.transaction_code || `tx-${foundRemote.id}`,
            type: foundRemote.type,
            amountFrom: Number(foundRemote.amount_from),
            amountTo: Number(foundRemote.amount_to),
            rate: Number(foundRemote.exchange_rate),
            commissionPercent: foundRemote.commission_percent ? Number(foundRemote.commission_percent) : undefined,
            commissionAmount: foundRemote.commission_amount ? Number(foundRemote.commission_amount) : undefined,
            method: foundRemote.method,
            branch: foundRemote.branch || 'Sucursal Centro',
            branchAddress: foundRemote.branch_address,
            branchCity: foundRemote.branch_city,
            branchState: foundRemote.branch_state,
            status: humanizeStatus(foundRemote.status, foundRemote.type === 'buy' ? 'buy_card' : 'sell_cash') as Transaction['status'],
            createdAt: foundRemote.created_at ? new Date(foundRemote.created_at).getTime() : Date.now(),
          };
          setTx(mapped);
          return;
        }
        setTx(null);
      } catch {
        console.error('Error fetching remote transactions in ConfirmPage');
        setTx(null);
      }
    })();
  }, [txId]);

  useEffect(() => {
    if (!tx || !txId) return;
    const socket = getSocket();

    const handleTransactionUpdate = (payload: any) => {
      const payloadTxCode = payload.transaction_code || payload.code || payload.id;
      if (payloadTxCode && String(payloadTxCode) === String(txId)) {
        const newStatus = humanizeStatus(payload.status, tx.type === 'buy' ? 'buy_card' : 'sell_cash');
        toast.success('Estado actualizado', { description: `Tu transacción cambió a: ${newStatus}` });
        setTx(prev => prev ? { ...prev, status: newStatus as any } : null);
      }
    };

    const handleStatusChange = (payload: any) => {
      const payloadTxCode = payload.transaction_code;
      if (payloadTxCode && String(payloadTxCode) === String(txId)) {
        const newStatus = humanizeStatus(payload.new_status || payload.status, tx.type === 'buy' ? 'buy_card' : 'sell_cash');
        toast.success('Estado actualizado', { description: `Tu transacción cambió a: ${newStatus}` });
        setTx(prev => prev ? { ...prev, status: newStatus as any } : null);
      }
    };

    socket.on('transaction.updated', handleTransactionUpdate);
    socket.on('transaction.status_changed', handleStatusChange);

    return () => {
      socket.off('transaction.updated', handleTransactionUpdate);
      socket.off('transaction.status_changed', handleStatusChange);
    };
  }, [tx, txId]);

  const goToStripeCheckout = () => {
    if (!tx) return;
    const txCode = tx.id;
    router.push(`/operacion/confirm/checkout?txId=${encodeURIComponent(txCode)}`);
  };

  if (!tx) {
    return (
      <div className="mx-auto px-4 py-10 max-w-3xl container">
        <Button variant="ghost" onClick={() => router.back()} className="mb-6">
          <ArrowLeft className="mr-2 w-4 h-4" />
          Regresar
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertTitle>No encontrada</AlertTitle>
          <AlertDescription>La transacción que buscas no existe o ha expirado.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const qrUrl = tx.id ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(tx.id)}` : null;

  const downloadQR = async () => {
    if (!qrUrl) return;
    try {
      setDownloading(true);
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-${tx.id}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading QR:', error);
      toast.error('Error al descargar el QR');
    } finally {
      setDownloading(false);
    }
  };

  const isBuying = tx.type === 'buy';
  const fromCurrency = isBuying ? 'MXN' : 'USD';
  const toCurrency = isBuying ? 'USD' : 'MXN';
  const fromLabel = isBuying ? 'Pagas' : 'Entregas';
  const toLabel = 'Recibes';

  const humanStatus = (tx.status || '').toString().toLowerCase();
  const hidePaymentMethod = humanStatus.includes('pagado') || humanStatus.includes('paid')
    || humanStatus.includes('listo para recoger') || humanStatus.includes('ready_for_pickup')
    || humanStatus.includes('ready_to_receive') || humanStatus.includes('listo para recibir')
    || humanStatus.includes('completed') || humanStatus.includes('completado')
    || humanStatus.includes('cancelled') || humanStatus.includes('cancelado')
    || humanStatus.includes('expired') || humanStatus.includes('expirado');
  const formatPrettyDate = (ts: number) => {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return new Date(ts).toLocaleString('es-ES');
    }
  };

  const getHeadingAndSubtitle = (status?: string) => {
    const s = (status || '').toString().toLowerCase();
    if (s.includes('reservado') || s.includes('pendiente')) {
      if (tx && tx.type === 'buy' && ((tx.method || '').toLowerCase().includes('card') || (tx.method || '').toLowerCase().includes('tarjeta'))) {
        return { title: '¡Operación Registrada!', subtitle: 'Tu operación ha sido registrada. Haz tu pago para continuar.' };
      }
      return { title: '¡Reserva Confirmada!', subtitle: 'Tu operación ha sido registrada. Se esta procesando tu solicitud y te notificaremos cuando puedas recoger tu dinero.' };
    }
    if (s.includes('cancelado') || s.includes('cancel')) {
      return { title: 'Operación Cancelada', subtitle: 'Esta transacción ha sido cancelada.' };
    }
    if (s.includes('expirado') || s.includes('expired')) {
      return { title: 'Reserva Expirada', subtitle: 'El tiempo de reserva ha finalizado.' };
    }
    if (s.includes('pagado') || s.includes('paid')) {
      return { title: 'Pago Recibido', subtitle: 'Hemos confirmado tu pago. Te notificaremos cuando puedas recoger tu dinero.' };
    }
    if (s.includes('listo') || s.includes('ready')) {
      return { title: 'Listo para Recoger', subtitle: 'Puedes pasar a la sucursal para completar tu operación.' };
    }
    if (s.includes('completado') || s.includes('completed')) {
      return { title: 'Operación Completada', subtitle: 'Gracias por utilizar nuestros servicios.' };
    }
    return { title: 'Operación Registrada', subtitle: 'Consulta los detalles a continuación.' };
  };

  const headings = getHeadingAndSubtitle(tx.status);

  return (
    <div className="mx-auto px-4 py-10 max-w-5xl container">
      {/* Header */}
      <div className="space-y-2 mb-10 text-center">
        <h1 className="font-bold text-primary text-3xl tracking-tight">{headings.title}</h1>
        <p className="text-muted-foreground text-lg">{headings.subtitle}</p>
      </div>

      <div className="gap-8 grid grid-cols-1 lg:grid-cols-3">
        {/* Left Column: Details */}
        <div className="space-y-6 lg:col-span-2">

          {/* Status & Folio Card */}
          <Card>
            <CardHeader>
              <CardTitle>Información General</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex sm:flex-row flex-col justify-between items-start sm:items-center gap-4">
                <div>
                  <p className="font-medium text-muted-foreground text-sm uppercase tracking-wider">Estatus Actual</p>
                  <p className="mt-1 font-bold text-primary text-2xl">{tx.status}</p>
                </div>
                <div className="bg-muted/30 p-3 rounded-md text-left sm:text-right">
                  <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">Folio de Operación</p>
                  <p className="mt-1 font-mono font-semibold text-xl">{tx.id}</p>
                </div>
              </div>
              <Separator />
              <div className="gap-4 grid grid-cols-1 sm:grid-cols-2 text-sm">
                <div>
                  <span className="font-medium text-muted-foreground">Fecha de registro:</span>
                  <p className="mt-1">{formatPrettyDate(tx.createdAt)}</p>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Tipo de operación:</span>
                  <p className="mt-1 font-semibold">{isBuying ? 'Compra de Divisas' : 'Venta de Divisas'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Financial Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle>Resumen Financiero</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="gap-8 grid grid-cols-1 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="font-medium text-muted-foreground text-sm">{fromLabel}</p>
                  <p className="font-bold text-3xl tracking-tight">
                    ${fromCurrency === 'MXN' ? tx.amountFrom.toFixed(2) : tx.amountFrom.toFixed(2)} <span className="font-normal text-muted-foreground text-lg">{fromCurrency}</span>
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-muted-foreground text-sm">{toLabel}</p>
                  <p className="font-bold text-primary text-3xl tracking-tight">
                    ${toCurrency === 'MXN' ? tx.amountTo.toFixed(2) : tx.amountTo.toFixed(2)} <span className="font-normal text-muted-foreground text-lg">{toCurrency}</span>
                  </p>
                </div>
              </div>

              <Separator />

              <div className="gap-4 grid grid-cols-2 sm:grid-cols-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Tasa de cambio</p>
                  <p className="font-medium">${tx.rate.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Comisión</p>
                  <p className="font-medium">{tx.commissionPercent ? `${tx.commissionPercent}%` : '—'}</p>
                </div>
                <div className="col-span-2 sm:col-span-2">
                  <p className="text-muted-foreground">Método de pago</p>
                  <p className="font-medium">{humanizeMethod(tx.method)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Branch Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Ubicación</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-4">
                <div className="bg-primary/10 p-2 rounded-full text-primary">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{tx.branch}</h3>
                  <p className="text-muted-foreground">{tx.branchAddress}</p>
                  {(tx.branchCity || tx.branchState) && (
                    <p className="mt-1 text-muted-foreground text-sm">
                      {[tx.branchCity, tx.branchState].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: QR & Actions */}
        <div className="space-y-6">
          {/* Payment Action Card (High Priority) */}
          {isBuying && (tx.method?.toLowerCase().includes('card') || tx.method?.toLowerCase().includes('tarjeta')) && !hidePaymentMethod && (
            <Card className="bg-primary/5 shadow-lg border-primary">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-primary">
                  <CreditCard className="w-5 h-5" />
                  Pago Pendiente
                </CardTitle>
                <CardDescription className="text-foreground/80">
                  Para completar tu reserva, es necesario realizar el pago.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={goToStripeCheckout}
                  className="shadow-md w-full h-12 font-bold text-lg animate-pulse hover:animate-none cursor-pointer"
                  size="lg"
                >
                  Pagar Ahora
                </Button>
              </CardContent>
            </Card>
          )}

          {/* QR Card */}
          {qrUrl && (
            <Card className="shadow-md border-primary/20 overflow-hidden">
              <CardHeader className="bg-muted/30 pb-6 text-center">
                <CardTitle>Código QR</CardTitle>
                <CardDescription>Presenta este código en la sucursal</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center pt-6">
                <div className="bg-white shadow-sm p-3 border rounded-xl">
                  <Image
                    src={qrUrl}
                    alt={`QR ${tx.id}`}
                    width={200}
                    height={200}
                    className="rounded-lg"
                  />
                </div>
                <p className="mt-4 px-4 text-muted-foreground text-sm text-center">
                  El personal escaneará este código para procesar tu operación de forma segura.
                </p>
              </CardContent>
              <CardFooter className="bg-muted/30 pt-4 pb-6">
                <Button
                  onClick={downloadQR}
                  disabled={downloading}
                  className="w-full"
                  variant="outline"
                >
                  {downloading ? (
                    <>
                      <Spinner className="mr-2 w-4 h-4" />
                      Descargando...
                    </>
                  ) : (
                    'Descargar QR'
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Actions Card */}
          <Card>
            <CardHeader>
              <CardTitle>Acciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="default"
                className="w-full"
                onClick={() => router.push('/operacion')}
              >
                Nueva Operación
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => router.push('/dashboard')}
              >
                Volver al Inicio
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

const ConfirmPage = () => {
  return (
    <Suspense fallback={<div className="p-6">Cargando…</div>}>
      <ConfirmContent />
    </Suspense>
  );
}

export default ConfirmPage;