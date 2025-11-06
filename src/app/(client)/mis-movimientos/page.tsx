"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { listTransactionsMock, getUserTransactions, Transaction, BackendTransaction } from '../../services/api';
import { humanizeStatus } from '@/lib/statuses';
import Cookies from 'js-cookie';
import { TransactionCard } from '@/components/TransactionCard';
// shadcn components: si no están, se usan elementos nativos con clases similares
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const mapBackend = (b: BackendTransaction): Transaction => {
  const id = b.transaction_code ? String(b.transaction_code) : b.id ? String(b.id) : '';
  // Usar humanizeStatus directamente para preservar todos los estatus
  const human = humanizeStatus(b.status, b.type === 'buy' ? 'buy_card' : 'sell_cash');

  // Asegurarnos que el tipo encaje con Transaction['status'] sin perder información.
  // Hacemos un cast seguro porque humanizeStatus devuelve cadenas ya humanizadas
  const status = (human as unknown) as Transaction['status'];

  return {
    id,
    type: b.type,
    amountFrom: Number(b.amount_from || 0),
    amountTo: Number(b.amount_to || 0),
    rate: Number(b.exchange_rate || 0),
    commissionPercent: b.commission_percent ? Number(b.commission_percent) : undefined,
    commissionAmount: b.commission_amount ? Number(b.commission_amount) : undefined,
    method: b.method,
    branch: b.branch || (b.branch_id ? String(b.branch_id) : undefined),
    status,
    createdAt: b.created_at ? new Date(b.created_at).getTime() : Date.now(),
  };
};

// usar getStatusColor importado arriba

const MisMovimientos = () => {
  const [items, setItems] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // filtros
  const [qFolio, setQFolio] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

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

  useEffect(() => {
    const token = typeof window !== 'undefined' ? Cookies.get('token') : null;
    const fetchList = async () => {
      setError(null);
      try {
        if (token) {
          const data = await getUserTransactions(token);
          if (data && Array.isArray(data) && data.length > 0) {
            setItems(data.map(mapBackend));
            setLoading(false);
            return;
          }
        }

        // Fallback to local mock when no token or empty result
        const local = listTransactionsMock();
        setItems(local);
      } catch (e) {
        console.error('mis-movimientos fetch error', e);
        setError('Error al obtener transacciones');
      } finally {
        setLoading(false);
      }
    };
    fetchList();
    const interval = setInterval(fetchList, 30000); // Polling every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // lista filtrada usando useMemo
  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter((t) => {
      // filtrar folio/id
      if (qFolio && !t.id.toLowerCase().includes(qFolio.toLowerCase())) return false;

      // filtrar estatus
      if (statusFilter && statusFilter !== 'all') {
        const s = (t.status || '').toLowerCase();
        if (!s.includes(statusFilter.toLowerCase())) return false;
      }

      // filtrar por rango de fecha (si hay)
      if (dateFrom) {
        const fromTs = new Date(dateFrom).setHours(0, 0, 0, 0);
        if (t.createdAt < fromTs) return false;
      }
      if (dateTo) {
        const toTs = new Date(dateTo).setHours(23, 59, 59, 999);
        if (t.createdAt > toTs) return false;
      }

      return true;
    });
  }, [items, qFolio, statusFilter, dateFrom, dateTo]);

  if (loading) return (
    <div className="mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="mb-2 font-bold text-4xl">Mis Movimientos</h1>
        <p className="text-muted-foreground text-base">Historial completo de tus transacciones</p>
      </div>
      <div className="bg-card p-8 border rounded-lg text-center">
        <div className="space-y-4 animate-pulse">
          <div className="bg-muted mx-auto rounded w-1/4 h-4"></div>
          <div className="bg-muted mx-auto rounded w-1/2 h-4"></div>
        </div>
        <p className="mt-4 text-muted-foreground">Cargando transacciones...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="mb-2 font-bold text-4xl">Mis Movimientos</h1>
        <p className="text-muted-foreground text-base">Historial completo de tus transacciones</p>
      </div>
      <div className="bg-destructive/10 p-6 border border-destructive/20 rounded-lg">
        <p className="font-medium text-destructive">{error}</p>
      </div>
    </div>
  );

  if (!items || items.length === 0) return (
    <div className="mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="mb-2 font-bold text-4xl">Mis Movimientos</h1>
        <p className="text-muted-foreground text-base">Historial completo de tus transacciones</p>
      </div>
      <div className="bg-card p-12 border rounded-lg text-center">
        <div className="mb-4 text-muted-foreground text-5xl">📭</div>
        <h3 className="mb-2 font-semibold text-xl">No hay transacciones</h3>
        <p className="text-muted-foreground">Aún no has realizado ninguna transacción.</p>
      </div>
    </div>
  );

  return (
    <section className="mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="mb-2 font-bold text-4xl">Mis Movimientos</h1>
        <p className="text-muted-foreground text-base">Historial completo de tus transacciones</p>
      </div>
      
      {/* Filters */}
      <div className="bg-card mb-8 p-6 border rounded-lg">
        <h2 className="mb-4 font-semibold text-lg">Filtros de búsqueda</h2>
        <div className="gap-4 grid grid-cols-1 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Folio</Label>
            <Input value={qFolio} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQFolio(e.target.value)} placeholder="Buscar por folio" />
          </div>

          <div className="space-y-2">
            <Label>Estatus</Label>
            <Select onValueChange={(v) => setStatusFilter(v)} defaultValue="all">
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="proceso">En proceso / Pending</SelectItem>
                <SelectItem value="listo">Listo para recoger / Ready</SelectItem>
                <SelectItem value="completado">Completado / Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Desde</Label>
            <Input type="date" value={dateFrom} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateFrom(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Hasta</Label>
            <Input type="date" value={dateTo} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="bg-card p-12 border rounded-lg text-center">
            <div className="mb-4 text-muted-foreground text-4xl">🔍</div>
            <h3 className="mb-2 font-semibold text-lg">No se encontraron resultados</h3>
            <p className="text-muted-foreground text-sm">Intenta ajustar los filtros de búsqueda</p>
          </div>
        ) : (
          filtered.map((t) => {
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
  );
};

export default MisMovimientos;