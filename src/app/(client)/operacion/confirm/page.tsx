"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';
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
// types for TSX loosened (file is .tsx but project may not strictly type everything)

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

const humanizeMethod = (m?: string) => {
  if (!m) return 'N/A';
  const v = m.toLowerCase();
  if (v.includes('card') || v.includes('tarjeta')) return 'Tarjeta';
  if (v.includes('vent') || v.includes('cash') || v.includes('efectivo') || v.includes('sucursal')) return 'En sucursal';
  return m;
};

/**
 * Detecta el tipo de tarjeta basado en los primeros dígitos
 */
const detectCardType = (cardNumber: string): string => {
  const cleaned = cardNumber.replace(/\s+/g, '').replace(/-/g, '');

  // Visa: empieza con 4
  if (/^4/.test(cleaned)) return 'visa';

  // Mastercard: 51-55, 2221-2720
  if (/^5[1-5]/.test(cleaned) || /^2(22[1-9]|2[3-9][0-9]|[3-6][0-9]{2}|7[01][0-9]|720)/.test(cleaned)) {
    return 'mastercard';
  }

  // American Express: 34 o 37
  if (/^3[47]/.test(cleaned)) return 'amex';

  // Discover: 6011, 622126-622925, 644-649, 65
  if (/^6011|^622(12[6-9]|1[3-9][0-9]|[2-8][0-9]{2}|9[01][0-9]|92[0-5])|^64[4-9]|^65/.test(cleaned)) {
    return 'discover';
  }

  // Diners Club: 36, 38, 300-305
  if (/^3(6|8|0[0-5])/.test(cleaned)) return 'diners';

  // JCB: 2131, 1800, 35
  if (/^(2131|1800|35)/.test(cleaned)) return 'jcb';

  return 'unknown';
};

/**
 * Formatea el número de tarjeta con espacios
 */
const formatCardNumber = (value: string): string => {
  const cleaned = value.replace(/\s+/g, '').replace(/[^0-9]/g, '');
  const cardType = detectCardType(cleaned);

  // American Express usa formato 4-6-5
  if (cardType === 'amex') {
    return cleaned.replace(/(\d{4})(\d{6})(\d{5})/, '$1 $2 $3').trim();
  }

  // Otros usan formato 4-4-4-4
  return cleaned.replace(/(\d{4})/g, '$1 ').trim();
};

// Eliminado formulario de tarjeta local: usaremos StripeCheckout en una vista dedicada

const ConfirmPage = () => {
  const params = useSearchParams();
  const txId = params.get('txId');
  const [tx, setTx] = useState<Transaction | null>(null);
  const [downloading, setDownloading] = useState(false);
  // rates and amountToNow removed (secciones informativas comentadas)

  useEffect(() => {
    const list = listTransactionsMock();
    const found = list.find(t => t.id === txId) || null;
    if (found) {
      setTx(found);
      return;
    }

    // si no está en local, intentar leer desde backend (si hay token)
    (async () => {
      try {
        const token = typeof window !== 'undefined' ? Cookies.get('token') : null;
        console.log('token in confirm:', token);
        if (!token) { setTx(null); return; }
        const remote = await getUserTransactions(token);
        console.log('remote transactions:', remote);
        const foundRemote = (remote || []).find((r: BackendTransaction) => r.transaction_code === txId || String(r.id) === txId) || null;
        console.log('foundRemote:', foundRemote, 'txId:', txId);
        if (foundRemote) {
          // mapear campos para que coincidan con Transaction
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

  // Escuchar cambios de estado en tiempo real vía WebSocket
  useEffect(() => {
    if (!tx || !txId) return;

    const socket = getSocket();

    const handleTransactionUpdate = (payload: any) => {
      console.log('transaction.updated recibido en ConfirmPage:', payload);

      // Verificar si es la transacción actual
      const payloadTxCode = payload.transaction_code || payload.code || payload.id;

      if (payloadTxCode && String(payloadTxCode) === String(txId)) {
        const newStatus = humanizeStatus(payload.status, tx.type === 'buy' ? 'buy_card' : 'sell_cash');

        toast.success('Estado actualizado', {
          description: `Tu transacción cambió a: ${newStatus}`,
        });

        // Actualizar el estado local
        setTx(prev => prev ? { ...prev, status: newStatus as any } : null);
      }
    };

    const handleStatusChange = (payload: any) => {
      console.log('transaction.status_changed recibido en ConfirmPage:', payload);

      const payloadTxCode = payload.transaction_code;

      if (payloadTxCode && String(payloadTxCode) === String(txId)) {
        const newStatus = humanizeStatus(payload.new_status || payload.status, tx.type === 'buy' ? 'buy_card' : 'sell_cash');

        toast.success('Estado actualizado', {
          description: `Tu transacción cambió a: ${newStatus}`,
        });

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

  // rates polling removed (no uso actual en esta vista)

  // nota: la comparación de "amountToNow" se dejó comentada en el JSX; mantener hook vacío

  // --- Stripe / Pago con tarjeta (backend maneja todo) ---
  // Sin modal: llevaremos al usuario a la página de StripeCheckout
  const router = useRouter();

  const goToStripeCheckout = () => {
    if (!tx) return;
    const txCode = tx.id;
    router.push(`/operacion/confirm/checkout?txId=${encodeURIComponent(txCode)}`);
  };

  if (!tx) {
    return (
      <section className="mx-auto max-w-6xl">
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

  // Mostrar QR siempre cuando exista tx.id
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

  // Determinar las etiquetas y monedas según el tipo de operación
  const isBuying = tx.type === 'buy';
  const fromCurrency = isBuying ? 'MXN' : 'USD';
  const toCurrency = isBuying ? 'USD' : 'MXN';
  const fromLabel = isBuying ? 'Pagas' : 'Entregas';
  const toLabel = 'Recibes';
  // Ocultar métodos de pago si la transacción ya está pagada o completada
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
      // weekday, day number, month name, hour:minute
      const weekday = d.toLocaleDateString('es-ES', { weekday: 'long' }); // e.g., 'jueves'
      const day = d.getDate();
      const month = d.toLocaleDateString('es-ES', { month: 'long' }); // e.g., 'diciembre'
      const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); // '12:23'
      // Lowercase weekday and month for consistency
      return `${weekday.toLowerCase()} ${day} de ${month.toLowerCase()} a las ${time}`;
    } catch {
      return new Date(ts).toLocaleString('es-ES');
    }
  };

  const getHeadingAndSubtitle = (status?: string) => {
    const s = (status || '').toString().toLowerCase();

    if (s.includes('reservado') || s.includes('pendiente')) {
      return { title: '¡Reserva Confirmada!', subtitle: 'Tu operación ha sido registrada exitosamente. Estamos procesando tu operación y te notificaremos cuando esté lista para ser recogida.' };
    }
    if (s.includes('cancelado') || s.includes('cancel')) {
      return { title: 'Reserva cancelada', subtitle: 'La transacción fue cancelada y ya no está activa.' };
    }
    if (s.includes('expirado') || s.includes('expired')) {
      return { title: 'Reserva expirada', subtitle: 'La reserva venció y ya no es válida.' };
    }
    if (s.includes('pagado') || s.includes('paid')) {
      return { title: 'Pago recibido', subtitle: 'Tu pago ha sido confirmado exitosamente. Estamos procesando tu operación y te notificaremos cuando esté lista para ser recogida.' };
    }
    if (s.includes('listo para recoger') || s.includes('ready_for_pickup') || s.includes('listo para recibir') || s.includes('ready_to_receive')) {
      // Usamos el texto tal cual para que se refleje la diferencia de "recibir" vs "recoger"
      const title = s.includes('recibir') ? 'Listo para recibir' : 'Listo para recoger';
      return { title, subtitle: 'Tu operación está lista para ser procesada en sucursal.' };
    }
    if (s.includes('completado') || s.includes('completed')) {
      return { title: 'Operación completada', subtitle: 'La operación se completó con éxito.' };
    }

    // Fallback
    return { title: '¡Reserva Confirmada!', subtitle: 'Tu operación ha sido registrada exitosamente' };
  };

  const headings = getHeadingAndSubtitle(tx.status);

  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-8">
        <Button variant="ghost" className="mb-6 cursor-pointer" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 w-4 h-4" />
          Regresar
        </Button>
        <h1 className="mb-2 font-bold text-primary text-4xl">{headings.title}</h1>
        <p className="text-muted-foreground text-base">{headings.subtitle}</p>
      </div>

      <div className="gap-8 grid grid-cols-1 lg:grid-cols-3">
        {/* Columna Principal - Información de la Transacción */}
        <div className="space-y-6 lg:col-span-2">
          {/* Folio y Estado */}
          <div className="bg-card shadow-sm p-8 border rounded-lg">
            <div className="flex sm:flex-row flex-col justify-between items-start sm:items-center gap-6 mb-6">
              <div className="flex-1">
                <div className="mb-2 font-medium text-muted-foreground text-sm uppercase tracking-wide">Folio de Operación</div>
                <div className="font-mono font-bold text-2xl">{tx.id}</div>
              </div>
              <div className={`px-5 py-2.5 rounded-md border ${getStatusColor(tx.status)}`}>
                <div className="font-semibold text-sm">{tx.status}</div>
              </div>
            </div>

            <div className="mb-6 text-muted-foreground text-sm">
              <span className="font-medium">Fecha:</span> {formatPrettyDate(tx.createdAt)}
            </div>

            {/* Mostrar mensaje si ya fue pagado */}
            {((tx.status || '').toString().toLowerCase().includes('paid') || (tx.status || '').toString().toLowerCase().includes('pagado')) && (
              <div className="bg-muted/50 p-4 border rounded-md text-sm">
                {"Tu pago ha sido confirmado exitosamente. Hemos notificado a la sucursal para preparar tu dinero. El estado cambiará a \"Listo para Recoger\" cuando puedas pasar por él."}
              </div>
            )}
          </div>

          {/* Resumen de la Operación */}
          <div className="bg-card shadow-sm p-8 border rounded-lg">
            <h2 className="mb-6 font-semibold text-primary text-xl">Resumen de la Operación</h2>

            <div className="bg-muted/30 mb-8 p-8 rounded-lg">
              <div className="flex sm:flex-row flex-col justify-between items-center gap-8">
                <div className="flex-1 sm:text-left text-center">
                  <div className="mb-3 font-medium text-muted-foreground text-sm">Tú {fromLabel}</div>
                  <div className="mb-2 font-bold text-4xl">${fromCurrency === 'MXN' ? tx.amountFrom.toFixed(0) : tx.amountFrom.toFixed(2)}</div>
                  <div className="font-semibold text-lg">{fromCurrency}</div>
                </div>

                <div className="text-muted-foreground text-4xl">→</div>

                <div className="flex-1 text-center sm:text-right">
                  <div className="mb-3 font-medium text-muted-foreground text-sm">Tú {toLabel}</div>
                  <div className="mb-2 font-bold text-4xl">${toCurrency === 'MXN' ? tx.amountTo.toFixed(0) : tx.amountTo.toFixed(2)}</div>
                  <div className="font-semibold text-lg">{toCurrency}</div>
                </div>
              </div>
            </div>

            <div className="gap-6 grid grid-cols-1 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="font-medium text-muted-foreground text-xs">Tipo de Operación</div>
                <div className="font-semibold text-base">{isBuying ? 'Compra' : 'Venta'}</div>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-muted-foreground text-xs">Tasa Aplicada</div>
                <div className="font-semibold text-base">${tx.rate.toFixed(4)}</div>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-muted-foreground text-xs">Comisión</div>
                <div className="font-semibold text-base">{tx.commissionPercent ? `${tx.commissionPercent.toFixed(2)}% ($${tx.commissionAmount?.toFixed(0)} MXN)` : '—'}</div>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-muted-foreground text-xs">Sucursal</div>
                <div className="font-semibold text-base">{tx.branch}</div>
              </div>
            </div>
          </div>

          {/* Método de Pago - Solo para compras (oculto si ya pagado/completado) */}
          {isBuying && tx.method && !hidePaymentMethod && (
            <div className="bg-card shadow-sm p-8 border rounded-lg">
              <h2 className="mb-6 font-semibold text-primary text-xl">Método de Pago</h2>

              {tx.method.toLowerCase().includes('tarjeta') ? (
                <div>
                  <p className="mb-6 text-muted-foreground">Selecciona cómo quieres completar tu pago:</p>
                  <div className="flex flex-col gap-4">
                    <Button
                      onClick={goToStripeCheckout}
                      size="lg"
                      className="w-full h-14 text-base cursor-pointer"
                    >
                      <CreditCard className="mr-2 w-5 h-5" />
                      Pagar con Tarjeta
                    </Button>
                    {/* <Button
                      variant="outline"
                      size="lg"
                      className="w-full h-14 text-base"
                    >
                      <Banknote className="mr-2 w-5 h-5" />
                      Transferencia Bancaria
                    </Button> */}
                  </div>
                </div>
              ) : (
                <div className="bg-muted/50 p-6 rounded-md">
                  <div className="mb-2 font-semibold text-base">{humanizeMethod(tx.method)}</div>
                  <p className="text-muted-foreground text-sm">Completa tu pago directamente en la sucursal seleccionada</p>
                </div>
              )}
            </div>
          )}

          {/* Modal eliminado; el pago se hace en la vista /checkout */}
        </div>

        {/* Columna Lateral - QR Code (mostrar siempre si hay tx.id) */}
        {qrUrl && (
          <div className="lg:col-span-1">
            <div className="lg:top-6 lg:sticky bg-card shadow-sm p-8 border rounded-lg">
              <h2 className="mb-6 font-semibold text-primary text-xl text-center">Tu Código QR</h2>

              <div className="flex flex-col items-center">
                <div className="bg-muted/30 p-4 rounded-lg">
                  <Image
                    className="shadow-md border-4 border-border rounded-lg"
                    src={qrUrl}
                    alt={`QR ${tx.id}`}
                    width={200}
                    height={200}
                  />
                </div>

                <div className="space-y-3 mt-6 text-center">
                  <p className="font-medium text-base">
                    Presenta este código en la sucursal
                  </p>
                  <p className="text-muted-foreground text-sm">
                    El personal escaneará este código para procesar tu operación
                  </p>
                </div>

                <Button
                  onClick={downloadQR}
                  disabled={downloading}
                  variant="default"
                  size="lg"
                  className="mt-6 w-full cursor-pointer"
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
              </div>

              {/* Información de la Sucursal */}
              {(tx.branch || tx.branchAddress) && (
                <div className="bg-muted/50 mt-8 p-5 border rounded-md">
                  <div className="flex items-start gap-3">
                    <svg className="flex-shrink-0 mt-0.5 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <div className="flex-1">
                      <p className="mb-2 font-semibold text-sm">{tx.branch}</p>
                      {tx.branchAddress && (
                        <p className="mb-1 text-muted-foreground text-xs">{tx.branchAddress}</p>
                      )}
                      {(tx.branchCity || tx.branchState) && (
                        <p className="text-muted-foreground text-xs">
                          {[tx.branchCity, tx.branchState].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Mostrar próximos pasos solo si no está completado, cancelado o expirado */}
              {!humanStatus.includes('completed') && !humanStatus.includes('completado') &&
                !humanStatus.includes('cancelled') && !humanStatus.includes('cancelado') &&
                !humanStatus.includes('expired') && !humanStatus.includes('expirado') && (
                  <div className="bg-muted/50 mt-6 p-5 border rounded-md">
                    <p className="mb-3 font-semibold text-sm">Próximos pasos:</p>
                    <ol className="space-y-2 text-muted-foreground text-sm list-decimal list-inside">
                      <li>Acude a la sucursal seleccionada</li>
                      <li>Presenta este código QR</li>
                      <li>Completa tu operación</li>
                    </ol>
                  </div>
                )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default ConfirmPage;