"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

function FailedContent() {
  const params = useSearchParams();
  const txCode = params.get('txId');
  const router = useRouter();
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    if (!txCode) return;
    (async () => {
      try {
  const res = await fetch(`${API_BASE}/payments/status/${encodeURIComponent(txCode)}`);
        if (!res.ok) { setStatus({ error: 'No se pudo obtener estado' }); return; }
        const j = await res.json();
        setStatus(j);
      } catch {
        setStatus({ error: 'Error de red' });
      }
    })();
  }, [txCode]);

  return (
    <section className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Button variant="ghost" className="mb-4" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 w-4 h-4" />
          Regresar
        </Button>
        <h1 className="mb-4 font-bold text-red-600 text-2xl">Pago fallido</h1>
      </div>
      {!status && <p>Consultando estado...</p>}
      {status && status.error && <p className="text-red-600">{status.error}</p>}
      {status && !status.error && (
        <div>
          <p>Transacción: {status.transaction?.id}</p>
          <p>Estado: {status.transaction?.status}</p>
          <h3 className="mt-4 font-semibold">Pagos relacionados</h3>
          <ul>
            {(status.payments || []).map((p: any) => (
              <li key={p.id}>{p.amount} {p.currency} — {p.status} — {p.created_at}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function FailedPage() {
  return (
    <Suspense fallback={<div className="p-6">Cargando…</div>}>
      <FailedContent />
    </Suspense>
  );
}
