"use client";
import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getRatesMock, Rates } from '../services/api';
import { useEffect, useState } from 'react';
import OperationForm from '@/components/OperationForm';

const OperacionPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const modeParam = searchParams?.get('mode');
  const initialMode: 'buy' | 'sell' = modeParam === 'sell' ? 'sell' : 'buy';
  const [rates, setRates] = useState<Rates | null>(null);

  useEffect(() => {
    const fetch = async () => setRates(await getRatesMock());
    fetch();
    const id = setInterval(fetch, 5000);
    return () => { clearInterval(id); };
  }, []);

  return (
    <section className="mx-auto p-5 max-w-3xl">
      <h1 className="mb-4 font-bold text-primary text-2xl">Operación</h1>
      <OperationForm initialMode={initialMode} rates={rates} onReserved={(txId: string) => router.push(`/operacion/confirm?txId=${txId}`)} />
    </section>
  );
}

export default OperacionPage;
