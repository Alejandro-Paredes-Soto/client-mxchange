"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';
import { listTransactionsMock, Transaction, getUserTransactions, BackendTransaction } from '../../services/api';
import { humanizeStatus, getStatusColor } from '../../../lib/statuses';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import Cookies from 'js-cookie';
import { CreditCard, Banknote } from 'lucide-react';
// types for TSX loosened (file is .tsx but project may not strictly type everything)

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

const humanizeMethod = (m?: string) => {
  if (!m) return 'N/A';
  const v = m.toLowerCase();
  if (v.includes('transfer') || v.includes('transferencia')) return 'Transferencia bancaria';
  if (v.includes('vent') || v.includes('cash') || v.includes('efectivo') || v.includes('sucursal')) return 'En sucursal';
  return m;
};

// Componente local para capturar datos de tarjeta (minimal)
const CardForm = ({ onSubmit, onCancel, processing, error }: { onSubmit: (card: any) => Promise<any>, onCancel: () => void, processing?: boolean, error?: any }) => {
  const [number, setNumber] = useState('4242424242424242');
  const [name, setName] = useState('Cliente Prueba');
  const [exp_month, setExpMonth] = useState('12');
  const [exp_year, setExpYear] = useState('2026');
  const [cvc, setCvc] = useState('123');
  const [localError, setLocalError] = useState<string | null>(null);

  const luhn = (num: string) => {
    const s = num.replace(/\s+/g, '').replace(/-/g, '');
    if (!/^[0-9]+$/.test(s)) return false;
    let sum = 0;
    let shouldDouble = false;
    for (let i = s.length - 1; i >= 0; i--) {
      let d = parseInt(s.charAt(i), 10);
      if (shouldDouble) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  };

  const validExpiry = (mm: string, yyyy: string) => {
    const m = parseInt(mm, 10);
    const y = parseInt(yyyy, 10);
    if (isNaN(m) || isNaN(y) || m < 1 || m > 12) return false;
    const now = new Date();
    const exp = new Date(y, m - 1, 1);
    // set to last day of month
    exp.setMonth(exp.getMonth() + 1);
    exp.setDate(0);
    return exp >= new Date(now.getFullYear(), now.getMonth(), 1);
  };

  const validCVC = (c: string) => {
    return /^[0-9]{3,4}$/.test(c);
  };

  const handleSubmit = async () => {
    setLocalError(null);
    // basic normalization
    const cardNum = number.replace(/\s+/g, '').replace(/-/g, '');
    if (!luhn(cardNum)) return setLocalError('Número de tarjeta inválido');
    if (!validExpiry(exp_month, exp_year)) return setLocalError('Fecha de vencimiento inválida');
    if (!validCVC(cvc)) return setLocalError('CVC inválido');

    // enviar al padre
    try {
      await onSubmit({ number: cardNum, name, exp_month, exp_year, cvc });
    } catch {
      // onSubmit ya maneja errores; aquí solo capturamos
    }
  };

  return (
    <div>
      <div className="space-y-3">
        <div>
          <label className="text-gray-600 text-sm">Número de tarjeta</label>
          <input placeholder="4242 4242 4242 4242" value={number} onChange={e => setNumber(e.target.value)} className="px-3 py-2 border rounded w-full" />
        </div>
        <div>
          <label className="text-gray-600 text-sm">Nombre en la tarjeta</label>
          <input placeholder="Nombre en la tarjeta" value={name} onChange={e => setName(e.target.value)} className="px-3 py-2 border rounded w-full" />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-gray-600 text-sm">MM</label>
            <input placeholder="MM" value={exp_month} onChange={e => setExpMonth(e.target.value)} className="px-3 py-2 border rounded w-full" />
          </div>
          <div className="flex-1">
            <label className="text-gray-600 text-sm">YYYY</label>
            <input placeholder="YYYY" value={exp_year} onChange={e => setExpYear(e.target.value)} className="px-3 py-2 border rounded w-full" />
          </div>
          <div className="flex-1">
            <label className="text-gray-600 text-sm">CVC</label>
            <input placeholder="CVC" value={cvc} onChange={e => setCvc(e.target.value)} className="px-3 py-2 border rounded w-full" />
          </div>
        </div>
      </div>

      {(localError || error) && <div className="mt-2 text-red-600 text-sm">{localError || String(error)}</div>}

      <div className="flex gap-2 mt-4">
        <button disabled={processing} onClick={handleSubmit} className="bg-primary px-4 py-2 rounded text-white">{processing ? 'Procesando...' : 'Pagar'}</button>
        <button onClick={onCancel} disabled={processing} className="px-4 py-2 border rounded">Cancelar</button>
      </div>
    </div>
  );
};

const ConfirmPage = () => {
  const params = useSearchParams();
  const txId = params.get('txId');
  const [tx, setTx] = useState<Transaction | null>(null);
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
            branch: foundRemote.branch_id ? `Sucursal ${foundRemote.branch_id}` : foundRemote.branch || 'Sucursal Centro',
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

  // rates polling removed (no uso actual en esta vista)

  // nota: la comparación de "amountToNow" se dejó comentada en el JSX; mantener hook vacío

  // --- Conekta / Pago con tarjeta (frontend) ---
  const [showCardModal, setShowCardModal] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [cardProcessing, setCardProcessing] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const router = useRouter();

  // Cargar clave pública al montar (si existe en backend)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/payments/config`);
        const j = await res.json();
        if (!mounted) return;
        setPublicKey(j.publicKey || null);
      } catch (_e) {
        console.error('Error fetching payments config:', _e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const loadConektaScript = (key: string) => {
    return new Promise<void>((resolve, reject) => {
      if (typeof window === 'undefined') return reject(new Error('no-window'));
      if ((window as any).Conekta) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdn.conekta.io/js/latest/conekta.js';
      s.async = true;
      s.onload = () => {
        try {
          (window as any).Conekta.setPublicKey(key);
          resolve();
        } catch (err) { reject(err); }
      };
      s.onerror = () => reject(new Error('Failed to load Conekta JS'));
      document.head.appendChild(s);
    });
  };

  const handleCreateCardTokenAndCharge = async (cardData: any) => {
    setCardError(null);
    setCardProcessing(true);
    try {
      // Si no hay publicKey, simulamos tokenización en desarrollo
      if (!publicKey) {
        console.warn('No publicKey available; using mock token for development');
        return await sendChargeToBackend({ token_id: `tok-mock-${Date.now()}` });
      }

      await loadConektaScript(publicKey);

      const Conekta = (window as any).Conekta;
      if (!Conekta) throw new Error('Conekta JS no cargado');

      // Crear token con Conekta
      return new Promise<void>((resolve, reject) => {
        Conekta.Token.create({ card: cardData }, async (tokenRes: any) => {
          try {
            console.log('Conekta token response:', tokenRes);
            const token_id = tokenRes.id;
            await sendChargeToBackend({ token_id });
            resolve();
          } catch (err) { reject(err); }
        }, (err: any) => {
          console.error('Conekta token error', err);
          setCardError(err && err.message ? err.message : JSON.stringify(err));
          setCardProcessing(false);
          reject(err);
        });
      });
    } catch (err: any) {
      console.error('Error creating token/charge:', err);
      setCardError(err && err.message ? err.message : String(err));
      setCardProcessing(false);
      throw err;
    }
  };

  const sendChargeToBackend = async ({ token_id }: { token_id: string }) => {
    try {
      if (!tx) throw new Error('No transaction to charge');
      // construir payload
      const payload = {
        amount: tx.amountFrom,
        currency: 'MXN',
        description: `Pago reserva ${tx.id}`,
        card: { token_id },
        transaction_code: tx.id,
        customer: { name: 'Cliente', email: 'cliente@example.com' }
      };

      const userToken = Cookies.get('token') || '';
      const res = await fetch(`${API_BASE}/payments/card`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify(payload)
      });
      const j = await res.json();
      if (!res.ok) throw j;
      // éxito
      console.log('Charge success:', j);
      // Si el pago fue exitoso y no requiere acción adicional, redirigir a la página de success
      // No forzar redirección si se requiere acción (3DS/offsite)
      if (!j.requires_action) {
        // construir txId a partir de la transacción o usar tx.id
        const txCode = tx?.id || '';
        if (txCode) {
          try { router.push(`/operacion/confirm/success?txId=${encodeURIComponent(txCode)}`); } catch (_err) { console.warn('No se pudo redirigir automáticamente al success:', _err); }
        }
      }
      // Si el backend indica que se requiere una acción (3DS/offsite), abrir la URL
      if (j && j.requires_action && j.action && j.action.url) {
        // Abrir en nueva ventana para que el usuario complete la autenticación
        window.open(j.action.url, '_blank');
        // También podemos indicar al usuario que vuelva a la app cuando termine
        alert('Se ha abierto una ventana para completar la autenticación del pago. Completa los pasos y verifica el estado de tu reserva.');
      }
      setCardProcessing(false);
      setShowCardModal(false);
      // Opcional: actualizar tx/status aquí o redirigir
      return j;
    } catch (err: any) {
      console.error('Error sending charge to backend:', err);
      setCardError(err && err.message ? err.message : JSON.stringify(err));
      setCardProcessing(false);
      throw err;
    }
  };

  if (!tx) return <div>No se encontró la transacción.</div>;

  // Mostrar QR siempre cuando exista tx.id
  const qrUrl = tx.id ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(tx.id)}` : null;

  const downloadQR = async () => {
    if (!qrUrl) return;
    try {
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
    }
  };

  // Determinar las etiquetas y monedas según el tipo de operación
  const isBuying = tx.type === 'buy';
  const fromCurrency = isBuying ? 'MXN' : 'USD';
  const toCurrency = isBuying ? 'USD' : 'MXN';
  const fromLabel = isBuying ? 'Pagas' : 'Entregas';
  const toLabel = 'Recibes';
  // Ocultar métodos de pago si la transacción ya está pagada (solo 'paid'/'pagado')
  const humanStatus = (tx.status || '').toString().toLowerCase();
  const isPaid = humanStatus.includes('pagado') || humanStatus.includes('paid');

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

  return (
    <section className="mx-auto p-5 max-w-5xl">
      <div className="flex sm:flex-row flex-col justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="font-bold text-primary text-3xl">¡Reserva Confirmada!</h1>
          <p className="mt-1 text-gray-600 text-sm">Tu operación ha sido registrada exitosamente</p>
        </div>
        <Link
          href="/inicio"
          aria-label="Ir a inicio"
          className="inline-flex items-center gap-2 bg-primary hover:opacity-95 px-4 py-2 rounded-md text-white whitespace-nowrap"
        >
          Ir al inicio
        </Link>
      </div>

      <div className="gap-6 grid grid-cols-1 lg:grid-cols-3">
        {/* Columna Principal - Información de la Transacción */}
        <div className="space-y-6 lg:col-span-2">
          {/* Folio y Estado */}
          <div className="bg-white shadow-sm p-6 border border-gray-200 rounded-xl">
            <div className="flex flex-row justify-between sm:items-center gap-4">
              <div>
                <div className="mb-1 text-gray-500 text-xs uppercase tracking-wide">Folio de Operación</div>
                <div className="font-mono font-bold text-primary text-xl">{tx.id}</div>
              </div>
              <div className={`px-4 py-2 rounded-lg border ${getStatusColor(tx.status)}`}>
                <div className="font-semibold">{tx.status}</div>
              </div>

            </div>
            {/* Mostrar mensaje si ya fue pagado */}
            {((tx.status || '').toString().toLowerCase().includes('paid') || (tx.status || '').toString().toLowerCase().includes('pagado')) && (
              <div className="bg-green-50 mt-4 p-4 border border-green-200 rounded-lg text-green-800 text-sm">
                {"Gracias por tu pago. Hemos enviado tu solicitud a la sucursal. Por favor, espera a que nuestro personal prepare tu dinero. El estado cambiará a \"Listo para Recoger\" cuando puedas pasar por él."}
              </div>
            )}
          </div>

          {/* Resumen de la Operación */}
          <div className="bg-white shadow-sm p-6 border border-gray-200 rounded-xl">
            <h2 className="mb-4 font-semibold text-gray-900 text-lg">Resumen de la Operación</h2>

            <div className="bg-gradient-to-br from-primary/5 to-secondary/5 mb-6 p-6 rounded-lg">
              <div className="flex sm:flex-row flex-col justify-between items-center gap-6">
                <div className="sm:text-left text-center">
                  <div className="mb-2 text-gray-600 text-sm">Tú {fromLabel}</div>
                  <div className="font-bold text-secondary text-3xl">${tx.amountFrom.toFixed(2)}</div>
                  <div className="mt-1 font-medium text-gray-700 text-lg">{fromCurrency}</div>
                </div>

                <div className="text-gray-400 text-3xl">→</div>

                <div className="text-center sm:text-right">
                  <div className="mb-2 text-gray-600 text-sm">Tú {toLabel}</div>
                  <div className="font-bold text-primary text-3xl">${tx.amountTo.toFixed(2)}</div>
                  <div className="mt-1 font-medium text-gray-700 text-lg">{toCurrency}</div>
                </div>
              </div>
            </div>



            <div className="gap-4 grid grid-cols-2 sm:grid-cols-4">
              <div>
                <div className="mb-1 text-gray-500 text-xs">Tipo</div>
                <div className="font-medium text-gray-900">{isBuying ? 'Compra' : 'Venta'}</div>
              </div>
              <div>
                <div className="mb-1 text-gray-500 text-xs">Tasa aplicada</div>
                <div className="font-medium text-gray-900">${tx.rate.toFixed(4)}</div>
              </div>
              <div>
                <div className="mb-1 text-gray-500 text-xs">Comisión</div>
                <div className="font-medium text-gray-900">{tx.commissionPercent ? `${tx.commissionPercent.toFixed(2)}% ($${tx.commissionAmount?.toFixed(2)} MXN)` : '—'}</div>
              </div>
              <div>
                <div className="mb-1 text-gray-500 text-xs">Sucursal</div>
                <div className="font-medium text-gray-900">{tx.branch}</div>
              </div>
              <div>
                <div className="mb-1 text-gray-500 text-xs">Fecha y hora de la
                  operación
                </div>
                <div className="font-medium text-gray-900">{formatPrettyDate(tx.createdAt)}</div>
              </div>
            </div>



            {/* {amountToNow !== null && (
              <div className="mt-3 text-gray-600 text-sm">
                {isBuying ? (
                  <div>Con la tasa actual recibirías aproximadamente <strong>{amountToNow} {toCurrency}</strong> (comparado con la reserva de <strong>{tx.amountTo} {toCurrency}</strong>).</div>
                ) : (
                  <div>Con la tasa actual recibirías aproximadamente <strong>{amountToNow} {toCurrency}</strong> (comparado con la reserva de <strong>{tx.amountTo} {toCurrency}</strong>).</div>
                )}
              </div>
            )} */}
          </div>

          {/* Método de Pago - Solo para compras (oculto si ya pagado/completado) */}
          {isBuying && tx.method && !isPaid && (
            <div className="bg-white shadow-sm p-6 border border-gray-200 rounded-xl">
              <h2 className="mb-4 font-semibold text-gray-900 text-lg">Método de Pago</h2>

              {tx.method.toLowerCase().includes('transfer') ? (
                <div>
                  <p className="mb-4 text-gray-600 text-sm">Selecciona cómo quieres completar tu pago:</p>
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => setShowCardModal(true)}
                      className="flex justify-center items-center gap-3 bg-gradient-to-r from-blue-500 hover:from-blue-600 to-blue-600 hover:to-blue-700 shadow-lg px-6 py-4 rounded-lg font-semibold text-white hover:scale-105 transition-all duration-200 transform"
                    >
                      <CreditCard className="w-6 h-6" />
                      Pagar con Tarjeta
                    </button>
                    <button className="flex justify-center items-center gap-3 bg-gradient-to-r from-green-500 hover:from-green-600 to-green-600 hover:to-green-700 shadow-lg px-6 py-4 rounded-lg font-semibold text-white hover:scale-105 transition-all duration-200 transform">
                      <Banknote className="w-6 h-6" />
                      Transferencia Bancaria
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="font-medium text-gray-900">{humanizeMethod(tx.method)}</div>
                  <p className="mt-2 text-gray-600 text-sm">Completa tu pago directamente en la sucursal seleccionada</p>
                </div>
              )}
            </div>
          )}

          {/* Modal simple para tarjeta */}
          {showCardModal && (
            <div className="z-50 fixed inset-0 flex justify-center items-center bg-black bg-opacity-50">
              <div className="bg-white p-6 rounded-lg w-full max-w-md">
                <h3 className="mb-4 font-semibold text-lg">Pagar con tarjeta</h3>
                <CardForm onSubmit={async (card) => {
                  try {
                    await handleCreateCardTokenAndCharge(card);
                  } catch {
                    // error tratado en la función
                  }
                }} onCancel={() => setShowCardModal(false)} processing={cardProcessing} error={cardError} />
              </div>
            </div>
          )}
        </div>

        {/* Columna Lateral - QR Code (mostrar siempre si hay tx.id) */}
        {qrUrl && (
          <div className="lg:col-span-1">
            <div className="lg:top-6 lg:sticky bg-white shadow-sm p-6 border border-gray-200 rounded-xl">
              <h2 className="mb-4 font-semibold text-gray-900 text-lg text-center">Tu Código QR</h2>

              <div className="flex flex-col items-center">
                <Image
                  className="shadow-md border-4 border-gray-300 rounded-lg"
                  src={qrUrl}
                  alt={`QR ${tx.id}`}
                  width={200}
                  height={200}
                />

                <div className="space-y-2 mt-4 text-center">
                  <p className="font-medium text-gray-700 text-sm">
                    Presenta este código en la sucursal
                  </p>
                  <p className="text-gray-500 text-xs">
                    El personal escaneará este código para procesar tu operación
                  </p>
                </div>

                <button
                  onClick={downloadQR}
                  className="bg-primary hover:bg-primary/90 mt-4 px-6 py-2 rounded-lg w-full font-medium text-white transition-colors"
                >
                  Descargar QR
                </button>
              </div>

              <div className="bg-blue-50 mt-6 p-4 border border-blue-200 rounded-lg">
                <p className="font-medium text-blue-900 text-sm">💡 Próximos pasos:</p>
                <ol className="space-y-1 mt-2 text-blue-800 text-xs list-decimal list-inside">
                  <li>Acude a la sucursal seleccionada</li>
                  <li>Presenta este código QR</li>
                  <li>Completa tu operación</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default ConfirmPage;