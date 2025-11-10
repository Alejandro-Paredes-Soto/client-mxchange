"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TransactionLookupPage() {
  const [code, setCode] = useState('');
  const router = useRouter();

  const go = () => {
    const c = (code || '').trim();
    if (!c) return;
    router.push(`/admin/transactions/${encodeURIComponent(c)}`);
  };

  return (
    <div className="mx-auto p-6 max-w-2xl">
      <h1 className="mb-4 font-bold text-primary text-2xl">Buscar transacción por código</h1>
      <p className="mb-4 text-gray-600">Ingresa el código de la transacción para ver su información detallada.</p>

      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Código de transacción"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button onClick={go} className="bg-primary px-4 py-2 rounded text-white">Buscar</button>
      </div>

      <p className="mt-4 text-gray-500 text-sm">También puedes pegar un folio completo (ej. tx-12345).</p>
    </div>
  );
}
