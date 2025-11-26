"use client";
import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getDashboardChartData, getDashboardKPIs, getRecentTransactions, getInventorySummary } from '../services/api';
import RateCard from '@/components/RateCard';

// Mock data and types for demonstration
type Rates = {
  usd: { buy: number; sell: number };
};

type KPIs = {
  volumenTransacciones: number;
  totalUSDVendidos: number;
  totalUSDComprados: number;
  incumplimientos: number;
};

type ChartDataPoint = {
  date: string;
  total_movimientos: number;
  no_realizados: number;
};

type Transaction = {
  id: string;
  type: 'buy' | 'sell';
  amountFrom: number;
  amountTo: number;
  rate: number;
  branch?: string;
  status: 'En proceso' | 'Listo para recoger' | 'Completado' | 'Cancelado';
  createdAt: number;
};

const TransactionList = ({ items }: { items: Transaction[] }) => {
  if (!items.length) return <div className="bg-white shadow-sm p-6 border border-gray-300 rounded-lg text-gray-500 text-center">No hay transacciones recientes</div>;

  return (
    <div className="bg-white shadow-sm border border-gray-300 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-gray-200 border-b">
            <tr>
              <th className="px-4 py-3 font-semibold text-primary text-sm text-left">ID</th>
              <th className="px-4 py-3 font-semibold text-primary text-sm text-left">Tipo</th>
              <th className="px-4 py-3 font-semibold text-primary text-sm text-right">Monto</th>
              <th className="px-4 py-3 font-semibold text-primary text-sm text-left">Estado</th>
              <th className="px-4 py-3 font-semibold text-primary text-sm text-left">Sucursal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map((tx) => (
              <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono text-sm">{tx.id}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex px-2 py-1 rounded-full font-medium text-xs ${tx.type === 'buy' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                    {tx.type === 'buy' ? 'Compra' : 'Venta'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  <div className="font-semibold">${tx.amountFrom.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div className="text-gray-500 text-xs">→ ${tx.amountTo.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex px-2 py-1 rounded-full font-medium text-xs ${tx.status === 'Completado' ? 'bg-green-100 text-green-800' : tx.status === 'Listo para recoger' ? 'bg-yellow-100 text-yellow-800' : tx.status === 'Cancelado' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                    {tx.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 text-sm">{tx.branch || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AdminIndex = () => {
  const [rates, setRates] = useState<Rates | null>({ usd: { buy: 18.5, sell: 19.5 } });
  const [kpis, setKpis] = useState<KPIs>({
    volumenTransacciones: 0,
    totalUSDVendidos: 0,
    totalUSDComprados: 0,
    incumplimientos: 0
  });
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [inventorySummary, setInventorySummary] = useState<{ [key: string]: number }>({});
  const [recentTx, setRecentTx] = useState<Transaction[]>([]);
  const [displayName, setDisplayName] = useState<string>('Admin');

  const mapStatus = (status: string): 'En proceso' | 'Listo para recoger' | 'Completado' | 'Cancelado' => {
    switch (status) {
      case 'completed': return 'Completado';
      case 'in_progress': return 'En proceso';
      case 'ready_for_pickup': return 'Listo para recoger';
      case 'cancelled': return 'Cancelado';
      default: return 'En proceso';
    }
  };

  useEffect(() => {
    const token = Cookies.get('token');
    const fetchData = async () => {
      // Fetch chart data
      const chartResponse = await getDashboardChartData(token);
      if (chartResponse.chartData) {
        setChartData(chartResponse.chartData);
      }

      // Fetch KPIs
      const kpisResponse = await getDashboardKPIs(token);
      setKpis(kpisResponse);

      // Fetch inventory summary
      const summaryResponse = await getInventorySummary(token);
      setInventorySummary(summaryResponse.summary);

      // Fetch recent transactions
      const recentResponse = await getRecentTransactions(token);
      if (recentResponse.transactions) {
        const mappedTx = recentResponse.transactions.map(tx => ({
          id: tx.transaction_code || 'N/A',
          type: tx.type as 'buy' | 'sell',
          amountFrom: Number(tx.amount_from),
          amountTo: Number(tx.amount_to),
          rate: Number(tx.exchange_rate),
          branch: tx.branch_name || 'N/A',
          status: mapStatus(tx.status || 'in_progress'),
          createdAt: new Date(tx.created_at || Date.now()).getTime()
        }));
        setRecentTx(mappedTx);
      }
    };
    fetchData();
  }, []);

  const totalUsd = inventorySummary.USD || 0;
  const totalMxn = inventorySummary.MXN || 0;

  const formatCurrency = (amount: number, currency: string = 'MXN') => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatChartDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
  };

  return (
    <section className="">
      <header className="flex sm:flex-row flex-col justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="font-bold text-primary text-3xl">Dashboard Admin</h1>
          {displayName && <p className="mt-1 text-gray-600">Bienvenido, {displayName}</p>}
        </div>

      </header>

      <main className="space-y-6">
        <RateCard rates={rates} />

        <section>
          <h2 className="mb-4 font-semibold text-primary text-xl">Indicadores del Día</h2>
          <div className="gap-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white shadow-sm p-5 border border-gray-300 rounded-lg">
              <div className="mb-2 font-medium text-gray-600 text-sm">Volumen de Transacciones</div>
              <div className="font-bold text-primary text-3xl">{kpis?.volumenTransacciones || 0}</div>
              <div className="mt-1 text-gray-500 text-xs">transacciones hoy</div>
            </div>

            <div className="bg-white shadow-sm p-5 border border-gray-300 rounded-lg">
              <div className="mb-2 font-medium text-gray-600 text-sm">USD Vendidos</div>
              <div className="font-bold text-primary text-3xl">{formatCurrency(kpis?.totalUSDVendidos || 0, 'USD').replace('USD', '').trim()}</div>
              <div className="mt-1 text-gray-500 text-xs">dólares vendidos</div>
            </div>

            <div className="bg-white shadow-sm p-5 border border-gray-300 rounded-lg">
              <div className="mb-2 font-medium text-gray-600 text-sm">USD Comprados</div>
              <div className="font-bold text-primary text-3xl">{formatCurrency(kpis?.totalUSDComprados || 0, 'USD').replace('USD', '').trim()}</div>
              <div className="mt-1 text-gray-500 text-xs">dólares comprados</div>
            </div>

            <div className="bg-white shadow-sm p-5 border border-gray-300 rounded-lg">
              <div className="mb-2 font-medium text-gray-600 text-sm">Incumplimientos</div>
              <div className="font-bold text-red-600 text-3xl">{kpis?.incumplimientos || 0}</div>
              <div className="mt-1 text-gray-500 text-xs">transacciones no realizadas</div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-4 font-semibold text-primary text-xl">Resumen de Inventario General</h2>
          <div className="gap-4 grid grid-cols-1 sm:grid-cols-2">
            <div className="bg-white shadow-sm p-5 border border-gray-300 rounded-lg">
              <div className="mb-2 font-medium text-gray-600 text-sm">Total USD en Sucursales</div>
              <div className="font-bold text-primary text-2xl">{formatCurrency(totalUsd, 'USD')}</div>
            </div>

            <div className="bg-white shadow-sm p-5 border border-gray-300 rounded-lg">
              <div className="mb-2 font-medium text-gray-600 text-sm">Total MXN en Sucursales</div>
              <div className="font-bold text-primary text-2xl">{formatCurrency(totalMxn, 'MXN')}</div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-4 font-semibold text-primary text-xl">Movimientos de los Últimos 30 Días</h2>
          <div className="bg-white shadow-sm p-6 border border-gray-300 rounded-lg">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatChartDate}
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                />
                <YAxis
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                  labelFormatter={formatChartDate}
                />
                <Legend
                  wrapperStyle={{ fontSize: '14px' }}
                  formatter={(value) => value === 'total_movimientos' ? 'Total Movimientos' : 'No Realizados'}
                />
                <Bar dataKey="total_movimientos" fill="#2E7D32" name="Total Movimientos" radius={[4, 4, 0, 0]} />
                <Bar dataKey="no_realizados" fill="#ef4444" name="No Realizados" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section>
          <h2 className="mb-4 font-semibold text-primary text-xl">Transacciones Recientes</h2>
          <TransactionList items={recentTx} />
        </section>
      </main>
    </section>
  );
};

export default AdminIndex;