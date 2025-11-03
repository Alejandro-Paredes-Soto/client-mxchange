"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { getRates, getAdminInventory, AdminInventoryItem, getDashboardKPIs, getDashboardChartData, getRecentTransactions, AdminTransaction } from '../../services/api';
import Cookies from 'js-cookie';

const AdminDashboard = () => {
  const [rates, setRates] = useState<{ buy: number; sell: number } | null>(null);
  const [inventory, setInventory] = useState<AdminInventoryItem[]>([]);
  const [kpis, setKpis] = useState<{ volumenTransacciones: number; totalUSDVendidos: number; totalUSDComprados: number; incumplimientos: number } | null>(null);
  const [chartData, setChartData] = useState<{ date: string; total_movimientos: number; no_realizados: number }[]>([]);
  const [recentTx, setRecentTx] = useState<AdminTransaction[]>([]);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) {
      // Handle not logged in
      return;
    }
    (async () => {
      const r = await getRates();
      setRates(r.usd);
      const inv = await getAdminInventory(token);
      setInventory(inv);
      const k = await getDashboardKPIs(token);
      setKpis(k);
      const c = await getDashboardChartData(token);
      setChartData(c.chartData || []);
      const rt = await getRecentTransactions(token);
      setRecentTx(rt.transactions || []);
    })();
  }, []);

  const totalUsd = inventory.filter(i => i.currency === 'USD').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalMxn = inventory.filter(i => i.currency === 'MXN').reduce((s, i) => s + (Number(i.amount) || 0), 0);

  return (
    <section className="p-5">
      <h1 className="mb-4 font-bold text-primary text-2xl">Dashboard</h1>

      <div className="mb-6">
        <h3 className="mb-2 font-semibold text-primary text-xl">Accesos Rápidos</h3>
        <div className="flex gap-2">
          <Link href="/admin/transactions/lookup" className="bg-primary px-4 py-2 rounded text-white">Buscar transacción</Link>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="mb-2 font-semibold text-primary text-xl">KPIs (Hoy)</h3>
        <div className="mb-1">Volumen de Transacciones: {kpis?.volumenTransacciones || 0}</div>
        <div className="mb-1">Total USD Vendidos: {kpis?.totalUSDVendidos || 0}</div>
        <div className="mb-1">Total USD Comprados: {kpis?.totalUSDComprados || 0}</div>
        <div className="mb-1">Incumplimientos: {kpis?.incumplimientos || 0}</div>
      </div>

      <div className="mb-6">
        <h3 className="mb-2 font-semibold text-primary text-xl">Tasa USD</h3>
        <div>Compra: {rates ? rates.buy : '—'} — Venta: {rates ? rates.sell : '—'}</div>
      </div>

      <div className="mb-6">
        <h3 className="mb-2 font-semibold text-primary text-xl">Resumen de Inventario General</h3>
        <div>Total USD en sucursales: {totalUsd.toFixed(2)}</div>
        <div>Total MXN en sucursales: {totalMxn.toFixed(2)}</div>
      </div>

      <div className="mb-6">
        <h3 className="mb-2 font-semibold text-primary text-xl">Gráfico de Movimientos (Últimos 30 días)</h3>
        {/* Aquí se puede integrar un gráfico, por ahora texto */}
        {chartData.map((d) => (
          <div key={d.date} className="mb-1">{d.date}: Movimientos {d.total_movimientos}, No Realizados {d.no_realizados}</div>
        ))}
      </div>

      <div className="mb-6">
        <h3 className="mb-2 font-semibold text-primary text-xl">Transacciones Recientes</h3>
        <table className="border border-gray-300 w-full border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border border-gray-300">ID</th>
              <th className="p-2 border border-gray-300">Tipo</th>
              <th className="p-2 border border-gray-300">Monto</th>
              <th className="p-2 border border-gray-300">Estado</th>
              <th className="p-2 border border-gray-300">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {recentTx.slice(0, 5).map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="p-2 border border-gray-300">{t.transaction_code || t.id}</td>
                <td className="p-2 border border-gray-300">{t.type}</td>
                <td className="p-2 border border-gray-300">{t.amount_from} {t.currency_from}</td>
                <td className="p-2 border border-gray-300">{t.status}</td>
                <td className="p-2 border border-gray-300">{t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default AdminDashboard;
