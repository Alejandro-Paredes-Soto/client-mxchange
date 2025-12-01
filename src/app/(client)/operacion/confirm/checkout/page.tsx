"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import Cookies from 'js-cookie';
import StripeCheckout from '@/components/StripeCheckout';
import { BackendTransaction, getUserTransactions } from '@/app/services/api';
import { Button } from '@/components/ui/button';

function CheckoutContent() {
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
    <section className="mx-auto max-w-xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => router.push(`/operacion/confirm?txId=${encodeURIComponent(txId || '')}`)}
        >
          <ArrowLeft className="mr-2 w-4 h-4 cursor-pointer" />
          Volver a detalles de la transacción
        </Button>
        <h1 className="mt-2 font-bold text-primary text-2xl">Pagar con tarjeta</h1>
        <p className="text-gray-600 text-sm">Folio: <span className="font-mono">{txId}</span></p>
      </div>

      {/* Aviso importante sobre tipo de tarjetas */}
      <div className="bg-blue-50 mb-4 p-4 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-3">
          <svg className="flex-shrink-0 mt-0.5 w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 text-sm">Importante</h3>
            <p className="mt-1 text-blue-800 text-sm">
              Solo aceptamos <strong>tarjetas de débito</strong> o <strong>prepagadas</strong>.
              No se permiten tarjetas de crédito por políticas de la plataforma.
            </p>
          </div>
        </div>
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

      {/* Nota de acción: El procesamiento ocurre en el backend y la página de detalles mostrará los cambios */}
        {/* compra segura a través de Stripe - diseño mejorado */}
        <section className="mt-6 text-center" aria-label="Pago seguro">
          <p className="text-gray-500 text-xs">Al confirmar el pago, tu transacción será procesada inmediatamente y podrás ver el estado actualizado.</p>

          <div className="inline-flex justify-center items-center gap-3 bg-muted/10 mt-4 px-3 py-2 border border-muted/20 rounded-full">
            <ShieldCheck className="w-5 h-5 text-green-600" aria-hidden="true" />
            <div className="text-left">
              <div className="font-medium text-sm">Compra segura</div>
              <div className="text-muted-foreground text-xs">con tecnología de <span className="font-semibold text-primary">Stripe</span></div>
            </div>
          </div>
        </section>
    </section>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="p-6">Cargando…</div>}>
      <CheckoutContent />
    </Suspense>
  );
}
