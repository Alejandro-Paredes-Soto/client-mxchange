"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import useUtils from "../services/utils";
import { getRatesMock, listTransactionsMock, getUserTransactions, Transaction, Rates } from "../services/api";
import { humanizeStatus, getStatusColor } from '../../lib/statuses';

import Cookies from 'js-cookie';
import RateCard from "@/components/RateCard";
import Image from 'next/image';
import Link from 'next/link';

const humanizeType = (t: 'buy' | 'sell') => (t === 'buy' ? 'Compra de Dólares' : 'Venta de Dólares');
const formatAmount = (n: number) => Number(n).toFixed(2);
const humanizeMethod = (m?: string) => {
  if (!m) return 'N/A';
  const v = m.toLowerCase();
  if (v.includes('transfer') || v.includes('transferencia')) return 'Transferencia';
  if (v.includes('vent') || v.includes('cash') || v.includes('efectivo') || v.includes('sucursal')) return 'Ventanilla';
  return m;
};

// getStatusColor importado desde lib/statuses

const downloadQR = async (id: string) => {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(id)}`;
  try {
    const response = await fetch(qrUrl);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${id}.png`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading QR:', error);
  }
};

const Inicio = () => {
  const { data: session, status } = useSession();
  const [rates, setRates] = useState<Rates | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [displayName, setDisplayName] = useState<string>('');
  const { isTokenExpired, onLogout, onRouterLink } = useUtils();

  // token/session handling (kept as existing logic)
  // token presence is tracked in localStorage/session; no local state required

  useEffect(() => {
    const authGoogle = localStorage.getItem("authGoogle");

    if (session && status == "authenticated" && authGoogle == "true") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const token = (session as any)?.token;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const idUser = (session as any)?.idUser
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isValidToken = (session as any)?.isValidToken;
      if (token && token !== "undefined" && token !== "null") {
        localStorage.setItem("email", session.user?.email == null ? "" : session.user?.email);
        localStorage.setItem("name", session.user?.name == null ? "" : session.user?.name);
        localStorage.setItem("idUser", idUser);
        localStorage.setItem("lastname", "");

        if (isValidToken.idUser) {
          localStorage.setItem("token", token);
        } else {
          localStorage.removeItem("token");
        }
      }
    } else if (authGoogle == "false") {
      if (localStorage.getItem("token")) {
        const validToken = isTokenExpired(localStorage.getItem("token")!);
        if (validToken) localStorage.removeItem("token");
      }
    }
  }, [session, status, isTokenExpired]);

  // leer nombre del usuario en cliente de forma segura
  useEffect(() => {
    try {
      const name = typeof window !== 'undefined' ? localStorage.getItem('name') : null;
      if (name) setDisplayName(name);
    } catch (e) {
      console.error('Error reading name from localStorage', e);
    }
  }, []);

  // rates polling
  useEffect(() => {
    let mounted = true;
    const fetchRates = async () => {
      const r = await getRatesMock();
      if (mounted) setRates(r);
    };
    fetchRates();
    const id = setInterval(fetchRates, 30000); // cada 30s
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchTransactions = async () => {
      try {
        const token = typeof window !== 'undefined' ? Cookies.get('token') : null;
        if (token) {
          const remote = await getUserTransactions(token);
          if (!mounted) return;
          // mapear BackendTransaction -> Transaction
          const mapped: Transaction[] = (remote || []).map(r => ({
            id: r.transaction_code || `tx-${r.id}`,
            type: r.type,
            amountFrom: Number(r.amount_from),
            amountTo: Number(r.amount_to),
            rate: Number(r.exchange_rate),
            commissionPercent: r.commission_percent ? Number(r.commission_percent) : undefined,
            commissionAmount: r.commission_amount ? Number(r.commission_amount) : undefined,
            method: r.method,
            branch: r.branch || (r.branch_id ? `Sucursal ${r.branch_id}` : undefined),
            status: (humanizeStatus(r.status, r.type === 'buy' ? 'buy_card' : 'sell_cash')) as Transaction['status'],
            createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
          })).sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
          setTransactions(mapped);
          return;
        }
      } catch (e) {
        console.error('Error loading remote transactions in Inicio', e);
      }
      // fallback local
      if (mounted) setTransactions(listTransactionsMock().sort((a, b) => b.createdAt - a.createdAt).slice(0, 5));
    };
    fetchTransactions();
    const id = setInterval(fetchTransactions, 30000); // Polling every 30 seconds
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <section className="mx-auto p-5 max-w-7xl">
      <header className="flex sm:flex-row flex-col justify-between items-start sm:items-center gap-4">
        <h1 className="font-bold text-primary text-2xl">Bienvenido{displayName ? `, ${displayName}` : ''}</h1>
        <div className="flex sm:flex-row flex-col gap-2 w-full sm:w-auto">
          <button className="bg-gradient-primary-to-accent hover:bg-gradient-primary-to-accent px-4 py-2 rounded-lg w-full sm:w-auto font-medium text-white transition-all hover:-translate-y-1" onClick={() => onRouterLink('/operacion?mode=buy')}>Comprar Dólares</button>
          <button className="bg-gradient-primary-to-accent hover:bg-gradient-primary-to-accent px-4 py-2 rounded-lg w-full sm:w-auto font-medium text-white transition-all hover:-translate-y-1" onClick={() => onRouterLink('/operacion?mode=sell')}>Vender Dólares</button>
          <button className="bg-white hover:bg-light-green px-4 py-2 border border-light-green rounded-lg w-full sm:w-auto font-medium text-primary transition-all hover:-translate-y-1" onClick={onLogout}>Cerrar sesión</button>
        </div>
      </header>

      <main className="gap-5 grid grid-cols-1 md:grid-cols-[1fr_320px] mt-5">
        <div>
          <RateCard rates={rates} />

          <section className="my-20">
            <h2 className="mb-4 font-semibold text-primary text-xl">Resumen de actividad</h2>
            <div className="space-y-4">
              {transactions.map((t) => {
                const sLower = (t.status || '').toLowerCase();
                const showQr = sLower.includes('proceso') || sLower.includes('pending') || sLower.includes('reserv');
                const methodLabel = humanizeMethod(t.method);

                // Determinar monedas y etiquetas según tipo de operación
                const isBuying = t.type === 'buy';
                const fromCurrency = isBuying ? 'MXN' : 'USD';
                const toCurrency = isBuying ? 'USD' : 'MXN';
                const fromLabel = isBuying ? 'Pagas' : 'Entregas';
                const toLabel = 'Recibes';
                const rateLabel = isBuying ? 'Tasa de Venta' : 'Tasa de Compra';

                return (
                  <div key={t.id} className="bg-white shadow-md hover:shadow-lg p-5 border border-gray-200 rounded-xl transition-shadow">
                    {/* Header con tipo y fecha */}
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-bold text-gray-900 text-2xl">
                            {humanizeType(t.type)}
                          </div>
                          <div className="text-gray-500 text-xs">
                            {new Date(t.createdAt).toLocaleDateString('es-MX', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      </div>

                      <span className={`px-3 py-1 border rounded-full font-medium text-xs ${getStatusColor(t.status)}`}>
                        {t.status}
                      </span>
                    </div>

                    {/* Montos principales */}
                    <div className="bg-gradient-to-r from-primary/5 to-secondary/5 mb-4 p-4 rounded-lg">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="mb-1 text-gray-600 text-xs uppercase tracking-wide">{fromLabel}</div>
                          <div className="font-bold text-secondary text-2xl">
                            ${formatAmount(t.amountFrom)} {fromCurrency}
                          </div>
                        </div>

                        <div className="text-gray-400 text-2xl">→</div>

                        <div className="text-right">
                          <div className="mb-1 text-gray-600 text-xs uppercase tracking-wide">{toLabel}</div>
                          <div className="font-bold text-primary text-2xl">
                            ${formatAmount(t.amountTo)} {toCurrency}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Grid de detalles */}
                    <div className="gap-4 grid grid-cols-2 md:grid-cols-5 mb-4">
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="mb-1 text-gray-500 text-xs uppercase tracking-wide">Sucursal</div>
                        <div className="font-medium text-gray-900 text-sm">{t.branch || 'N/D'}</div>
                      </div>

                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="mb-1 text-gray-500 text-xs uppercase tracking-wide">Método</div>
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-gray-900 text-sm">{methodLabel}</div>
                        </div>
                      </div>

                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="mb-1 text-gray-500 text-xs uppercase tracking-wide">{rateLabel}</div>
                        <div className="font-medium text-gray-900 text-sm">{Number(t.rate).toFixed(4)} MXN</div>
                      </div>

                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="mb-1 text-gray-500 text-xs uppercase tracking-wide">Comisión</div>
                        <div className="font-medium text-gray-900 text-sm">{t.commissionPercent ? `${t.commissionPercent.toFixed(2)}% ($${t.commissionAmount?.toFixed(2)} MXN)` : '—'}</div>
                      </div>

                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="mb-1 text-gray-500 text-xs uppercase tracking-wide">Folio</div>
                        <div className="font-mono font-medium text-gray-900 text-xs truncate">{t.id}</div>
                      </div>
                    </div>

                    {/* Mostrar mensaje si ya fue pagado */}
                    {(sLower.includes('paid') || sLower.includes('pagado')) && (
                      <div className="bg-green-50 p-4 border border-green-200 rounded-lg text-green-800 text-sm">
                        {"Gracias por tu pago. Hemos enviado tu solicitud a la sucursal. Por favor, espera a que nuestro personal prepare tu dinero. El estado cambiará a \"Listo para Recoger\" cuando puedas pasar por él."}
                      </div>
                    )}

                    {/* QR Code si está en proceso */}
                    {showQr && t.id && (
                      <div className="bg-slate-50 p-4 border border-slate-200 rounded-lg">
                        <div className="flex sm:flex-row flex-col items-center gap-4">
                          <Image
                            className="shadow-sm border-2 border-slate-300 rounded-lg"
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(t.id)}`}
                            alt={`QR ${t.id}`}
                            width={120}
                            height={120}
                          />
                          <div className="flex-1 sm:text-left text-center">
                            <div className="mb-1 font-semibold text-slate-900">
                              Presenta este código QR en sucursal
                            </div>
                            <div className="text-slate-700 text-sm">
                              Escanea este código en la sucursal para completar tu transacción
                            </div>
                            <button
                              onClick={() => downloadQR(t.id)}
                              className="bg-primary hover:bg-primary/90 mt-4 px-4 py-2 rounded-md font-medium text-white text-sm"
                            >
                              Descargar QR
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Botón Ver más */}
                    <div className="mt-4 text-center">
                      <Link href={`/operacion/confirm?txId=${t.id}`}>
                        <button className="bg-primary hover:bg-primary/90 px-4 py-2 rounded-md font-medium text-white text-sm">
                          Ver más
                        </button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="mt-5 md:mt-0">
          <div className="p-3 border border-gray-300 rounded-lg w-full">
            <h3 className="mb-2 font-semibold text-primary text-lg">Accesos rápidos</h3>
            <div className="flex flex-col gap-2 mt-2">
              <button className="bg-gradient-primary-to-accent hover:bg-gradient-primary-to-accent px-4 py-2 rounded-lg w-full font-medium text-white transition-all hover:-translate-y-1" onClick={() => onRouterLink('/operacion?mode=buy')}>Comprar Dólares</button>
              <button className="bg-gradient-primary-to-accent hover:bg-gradient-primary-to-accent px-4 py-2 rounded-lg w-full font-medium text-white transition-all hover:-translate-y-1" onClick={() => onRouterLink('/operacion?mode=sell')}>Vender Dólares</button>
              <button className="bg-white hover:bg-light-green px-4 py-2 border border-light-green rounded-lg w-full font-medium text-primary transition-all hover:-translate-y-1" onClick={() => onRouterLink('/mis-movimientos')}>Mis movimientos</button>
            </div>
          </div>
        </aside>
      </main>
    </section>
  );
}

export default Inicio;