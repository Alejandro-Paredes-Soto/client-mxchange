"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowLeft } from 'lucide-react';
import Cookies from 'js-cookie';
import StripeCheckout from '@/components/StripeCheckout';
import { BackendTransaction, getUserTransactions } from '@/app/services/api';
import { Button } from '@/components/ui/button';

export default function CheckoutPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const txId = params.get('txId');
  const [tx, setTx] = useState<BackendTransaction | null>(null);
  const [token, setToken] = useState<string | undefined>(undefined);

  // Obtener datos del usuario desde la sesión
  const userName = session?.user?.name || 'Cliente';
  const userEmail = session?.user?.email || 'cliente@example.com';

  useEffect(() => {
    const t = Cookies.get('token');
    setToken(t || undefined);
  }, []);

  useEffect(() => {
    (async () => {
      if (!txId) return;
      try {
        const t = Cookies.get('token');
        if (!t) return;
        const list = await getUserTransactions(t);
        const found = (list || []).find((r: BackendTransaction) => r.transaction_code === txId || String(r.id) === txId) || null;
        setTx(found);
      } catch (e) {
        console.error('No se pudo cargar la transacción para checkout', e);
      }
    })();
  }, [txId]);

  if (!txId) return <div className="p-6">Falta parámetro txId.</div>;
  if (!tx) return <div className="p-6">Cargando datos de la transacción…</div>;

  const isBuying = tx.type === 'buy';
  const amountToPay = Number(tx.amount_from || 0); // pago en MXN

  return (
    <section className="mx-auto p-5 max-w-xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => router.push(`/operacion/confirm?txId=${encodeURIComponent(txId || '')}`)}
        >
          <ArrowLeft className="mr-2 w-4 h-4" />
          Volver a detalles de la transacción
        </Button>
        <h1 className="mt-2 font-bold text-2xl">Pagar con tarjeta</h1>
        <p className="text-gray-600 text-sm">Folio: <span className="font-mono">{txId}</span></p>
      </div>

      <div className="space-y-4 bg-white shadow-sm p-6 border border-gray-200 rounded-xl">
        <div className="flex justify-between items-center">
          <div className="text-gray-700">Monto a pagar</div>
          <div className="font-bold text-lg">${amountToPay.toFixed(2)} MXN</div>
        </div>

        <StripeCheckout
          amount={amountToPay}
          currency="MXN"
          description={`Pago reserva ${txId}`}
          transaction_code={String(txId)}
          customer={{ name: userName, email: userEmail }}
          token={token}
          onSuccess={() => {
            // El backend actualiza el estado a 'paid' inmediatamente
            router.push(`/operacion/confirm/success?txId=${encodeURIComponent(String(txId))}`);
          }}
          onError={(e) => {
            console.error('stripe error', e);
          }}
        />
      </div>

      <p className="mt-4 text-gray-500 text-xs">
        Al confirmar el pago, tu transacción será procesada inmediatamente y podrás ver el estado actualizado.
      </p>
    </section>
  );
}
