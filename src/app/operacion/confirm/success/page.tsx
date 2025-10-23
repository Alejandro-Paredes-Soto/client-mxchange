"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function SuccessPage() {
  const params = useSearchParams();
  const txCode = params.get('txId');
  const [status, setStatus] = useState<any>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!txCode) return;
    let mounted = true;
    let tries = 0;
    const doFetch = async () => {
      try {
        const res = await fetch(`${API_BASE}/payments/status/${encodeURIComponent(txCode)}`);
        if (!mounted) return;
        if (!res.ok) { setStatus({ error: 'No se pudo obtener estado' }); return; }
        const j = await res.json();
        setStatus(j);
        tries += 1;
        // si no está finalizado, seguir polling hasta 20 intentos (~60s)
        const txStatus = j && j.transaction && j.transaction.status ? j.transaction.status : null;
        if (txStatus && txStatus !== 'completed' && tries < 20) {
          setPolling(true);
          setTimeout(doFetch, 3000);
        } else {
          setPolling(false);
        }
      } catch {
        if (!mounted) return;
        setStatus({ error: 'Error de red' });
        setPolling(false);
      }
    };
    doFetch();
    return () => { mounted = false; };
  }, [txCode]);

  return (
    <section className="mx-auto p-6 max-w-3xl">
      <h1 className="mb-4 font-bold text-green-600 text-2xl">Pago recibido</h1>
  {!status && <p>{polling ? 'Consultando estado...' : 'Consultando estado...'}</p>}
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
