"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import useUtils from "../../services/utils";
import { getRatesMock, listTransactionsMock, getUserTransactions, Transaction, Rates } from "../../services/api";
import { humanizeStatus } from '@/lib/statuses';

import Cookies from 'js-cookie';
import RateCard from "@/components/RateCard";
import { TransactionCard } from "@/components/TransactionCard";

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
      
      console.log('🔍 [inicio/page] Google Login detected');
      console.log('🔍 [inicio/page] token:', token ? `${token.substring(0, 50)}...` : 'undefined');
      console.log('🔍 [inicio/page] idUser:', idUser);
      console.log('🔍 [inicio/page] isValidToken:', isValidToken);
      
      if (token && token !== "undefined" && token !== "null") {
        localStorage.setItem("email", session.user?.email == null ? "" : session.user?.email);
        localStorage.setItem("name", session.user?.name == null ? "" : session.user?.name);
        localStorage.setItem("idUser", idUser);
        localStorage.setItem("lastname", "");

        // Verificar si el token es válido
        // isValidToken es el payload decodificado del JWT, que contiene { id, email, role, branch_id, iat, exp }
        const tokenIsValid = isValidToken && typeof isValidToken === 'object' && (isValidToken.id || isValidToken.idUser);
        
        console.log('🔍 [inicio/page] tokenIsValid:', tokenIsValid);
        
        if (tokenIsValid) {
          localStorage.setItem("token", token);
          // IMPORTANTE: También guardar el token en cookies para que OperationForm y otros componentes lo puedan usar
          Cookies.set('token', token, { path: '/', expires: 0.33 }); // expires en 0.33 días = 8 horas (igual que el JWT)
          console.log('✅ [inicio/page] Token guardado en localStorage y cookies');
        } else {
          localStorage.removeItem("token");
          Cookies.remove('token', { path: '/' });
          console.log('❌ [inicio/page] Token inválido, removido de localStorage y cookies');
        }
      }
    } else if (authGoogle == "false") {
      if (localStorage.getItem("token")) {
        const validToken = isTokenExpired(localStorage.getItem("token")!);
        if (validToken) {
          localStorage.removeItem("token");
          Cookies.remove('token', { path: '/' });
        }
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
    <section className="mx-auto p-6">
      <header className="mb-8">
        <h1 className="mb-2 font-bold text-primary text-4xl">
          Bienvenido{displayName ? `, ${displayName}` : ''}
        </h1>
        <p className="text-muted-foreground text-base">
          Gestiona tus operaciones de cambio de divisas
        </p>
      </header>

      <main className="gap-6 grid grid-cols-1 md:grid-cols-[1fr_320px]">
        <div>
          <RateCard rates={rates} />

          <section className="my-12">
            <div className="mb-6">
              <h2 className="mb-2 font-semibold text-primary text-2xl">Resumen de actividad</h2>
              <p className="text-muted-foreground text-sm">Tus últimas 5 transacciones</p>
            </div>
            <div className="space-y-4">
              {transactions.length === 0 ? (
                <div className="bg-card p-12 border rounded-lg text-center">
                  <h3 className="mb-2 font-semibold text-xl">No tienes transacciones recientes</h3>
                  <p className="mb-6 text-muted-foreground">Comienza a operar usando los accesos rápidos</p>
                </div>
              ) : (
                transactions.map((t) => {
                  const sLower = (t.status || '').toLowerCase();
                  const showQr = sLower.includes('proceso') || sLower.includes('pending') || sLower.includes('reserv');

                  return (
                    <TransactionCard
                      key={t.id}
                      id={t.id}
                      type={t.type}
                      amountFrom={t.amountFrom}
                      amountTo={t.amountTo}
                      rate={t.rate}
                      commissionPercent={t.commissionPercent}
                      commissionAmount={t.commissionAmount}
                      method={t.method}
                      branch={t.branch}
                      status={t.status}
                      createdAt={t.createdAt}
                      showQR={showQr}
                      onDownloadQR={downloadQR}
                    />
                  );
                })
              )}
            </div>
          </section>
        </div>

        <aside>
          <div className="top-6 sticky bg-card p-5 border rounded-lg">
            <h3 className="mb-4 font-semibold text-xl">Accesos rápidos</h3>
            <div className="flex flex-col gap-3">
              <button className="bg-primary hover:bg-primary/90 hover:shadow-md px-4 py-3 rounded-lg w-full font-medium text-white transition-all cursor-pointer" onClick={() => onRouterLink('/operacion?mode=buy')}>Comprar Dólares</button>
              <button className="bg-primary hover:bg-primary/90 hover:shadow-md px-4 py-3 rounded-lg w-full font-medium text-white transition-all cursor-pointer" onClick={() => onRouterLink('/operacion?mode=sell')}>Vender Dólares</button>
              <button className="bg-secondary hover:bg-secondary/90 hover:shadow-md px-4 py-3 rounded-lg w-full font-medium text-secondary-foreground transition-all cursor-pointer" onClick={() => onRouterLink('/mis-movimientos')}>Mis movimientos</button>
            </div>
          </div>
        </aside>
      </main>
    </section>
  );
}

export default Inicio;