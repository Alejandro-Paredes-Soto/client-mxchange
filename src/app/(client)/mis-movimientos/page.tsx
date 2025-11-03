"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { listTransactionsMock, getUserTransactions, Transaction, BackendTransaction } from '../../services/api';
import { humanizeStatus, getStatusColor } from '@/lib/statuses';
import Image from 'next/image';
import Cookies from 'js-cookie';
import Link from 'next/link';
// shadcn components: si no están, se usan elementos nativos con clases similares
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';


const humanizeType = (t: 'buy' | 'sell') => (t === 'buy' ? 'Compra de Dólares' : 'Venta de Dólares');
const formatAmount = (n: number) => Number(n).toFixed(2);
const humanizeMethod = (m?: string) => {
  if (!m) return 'N/A';
  const v = m.toLowerCase();
  if (v.includes('transfer') || v.includes('transferencia')) return 'Transferencia';
  if (v.includes('vent') || v.includes('cash') || v.includes('efectivo') || v.includes('sucursal')) return 'Ventanilla';
  return m;
};

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
    <div className="mx-auto p-5 max-w-7xl">
      <h1 className="mb-6 font-bold text-primary text-3xl">Mis Movimientos</h1>
      <div className="text-gray-600">Cargando transacciones...</div>
    </div>
  );

  if (error) return (
    <div className="mx-auto p-5 max-w-7xl">
      <h1 className="mb-6 font-bold text-primary text-3xl">Mis Movimientos</h1>
      <div className="bg-red-50 p-4 border border-red-200 rounded-lg text-red-700">{error}</div>
    </div>
  );

  if (!items || items.length === 0) return (
    <div className="mx-auto p-5 max-w-7xl">
      <h1 className="mb-6 font-bold text-primary text-3xl">Mis Movimientos</h1>
      <div className="bg-gray-50 p-8 border border-gray-200 rounded-lg text-gray-600 text-center">
        No hay transacciones registradas.
      </div>
    </div>
  );

  return (
    <section className="mx-auto p-5 max-w-7xl">
      <h1 className="mb-6 font-bold text-primary text-3xl">Mis Movimientos</h1>
      {/* Filters */}
      <div className="gap-4 grid grid-cols-1 md:grid-cols-4 mb-6">
        <div>
          <Label>Folio</Label>
          <Input value={qFolio} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQFolio(e.target.value)} placeholder="Buscar por folio" />
        </div>

        <div>
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

        <div>
          <Label>Desde</Label>
          <Input type="date" value={dateFrom} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateFrom(e.target.value)} />
        </div>

        <div>
          <Label>Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateTo(e.target.value)} />
        </div>
      </div>

      <div className="space-y-4">
        {filtered.map((t) => {
          // Mostrar QR cuando la transacción está en proceso o está reservada (antes 'pending')
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

              {/* Mostrar mensaje si ya fue pagado */}
              {(sLower.includes('paid') || sLower.includes('pagado')) && (
                <div className="bg-green-50 mb-4 p-4 border border-green-200 rounded-lg text-green-800 text-sm">
                  {"Gracias por tu pago. Hemos enviado tu solicitud a la sucursal. Por favor, espera a que nuestro personal prepare tu dinero. El estado cambiará a \"Listo para Recoger\" cuando puedas pasar por él."}
                </div>
              )}

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
  );
};

export default MisMovimientos;