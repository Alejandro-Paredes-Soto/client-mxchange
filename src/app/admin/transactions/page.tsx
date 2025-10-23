"use client";
import React, { useEffect, useState, useCallback } from 'react';
import { humanizeStatus, getStatusColor } from '../../../lib/statuses';
import { getAdminTransactions, AdminTransaction, putTransactionStatus, getTransactionDetails } from '../../services/api';
import Cookies from 'js-cookie';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';

const AdminTransactionsPage = () => {
  const [items, setItems] = useState<AdminTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ code: '', branch_id: '', status: '', start_date: '', end_date: '', month: '', year: '' });
  const [kpis, setKpis] = useState({ total: 0, reserved: 0, completed: 0, cancelled: 0, paid: 0 });
  const [changeStatusDialog, setChangeStatusDialog] = useState<{ open: boolean; transaction: AdminTransaction | null; newStatus: string }>({ open: false, transaction: null, newStatus: '' });
  const [detailsDialog, setDetailsDialog] = useState<{ open: boolean; details: { transaction: AdminTransaction } | null }>({ open: false, details: null });

  const getStatusText = (status: string) => humanizeStatus(status, 'generic');

  const humanizeType = (type: string) => {
    if (type === 'buy') return 'Compra';
    if (type === 'sell') return 'Venta';
    return type;
  };

  const loadTransactions = useCallback(async () => {
    const token = Cookies.get('token');
    if (!token) return;
    setLoading(true);
  const txs = await getAdminTransactions(filters, token);
  // calcular KPIs a partir de estados crudos
  const total = txs.length;
  // Contar transacciones reservadas (nuevo estado). Mantener compatibilidad con registros antiguos que puedan tener 'pending'.
  const reservedCount = txs.filter(t => {
    const s = (t.status || '').toString().toLowerCase();
    return s === 'reserved' || s === 'pending' || s.includes('reserv');
  }).length;
  const completed = txs.filter(t => (t.status || '').toString().toLowerCase() === 'completed').length;
  const cancelled = txs.filter(t => (t.status || '').toString().toLowerCase() === 'cancelled').length;
  // Contar transacciones pagadas / liquidadas
  const paid = txs.filter(t => {
    const s = (t.status || '').toString().toLowerCase();
    return s === 'paid' || s === 'paid_success' || s === 'settled' || s.includes('paid');
  }).length;
  setKpis({ total, reserved: reservedCount, completed, cancelled, paid });

  // Humanizar estatus para mostrar en UI
  const humanized = txs.map(t => ({ ...t, raw_status: t.status, status: humanizeStatus(t.status, 'generic') }));
  setItems(humanized as AdminTransaction[]);
  setLoading(false);
  }, [filters]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const onChangeStatus = async (id?: number) => {
    if (!id) return;
    const transaction = items.find(t => t.id === id);
    if (!transaction) return;
    // usar raw_status si está disponible para permitir enviar valores backend al cambiar estado
    const initial = (transaction as any).raw_status || transaction.status || '';
    setChangeStatusDialog({ open: true, transaction, newStatus: initial });
  };

  const onViewDetails = async (id?: number) => {
    if (!id) return;
    const token = Cookies.get('token');
    if (!token) return;
    const details = await getTransactionDetails(id, token);
    setDetailsDialog({ open: true, details });
  };

  const confirmChangeStatus = async () => {
    if (!changeStatusDialog.transaction || !changeStatusDialog.newStatus) return;
    const token = Cookies.get('token');
    if (!token) return;
    await putTransactionStatus(changeStatusDialog.transaction.id!, changeStatusDialog.newStatus, token);
    loadTransactions();
    setChangeStatusDialog({ open: false, transaction: null, newStatus: '' });
  };

  return (
    <section className="p-5">
      <h1 className="mb-4 font-bold text-primary text-2xl">Transacciones</h1>

  <div className="flex gap-4 mb-4">
        <Input type="text" placeholder="Buscar por código" value={filters.code} onChange={(e) => setFilters({ ...filters, code: e.target.value })} />
        <Select value={filters.status || "all"} onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? "" : value })}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="reserved">Reservado</SelectItem>
            <SelectItem value="processing">Procesando</SelectItem>
            <SelectItem value="paid">Pagado</SelectItem>
            <SelectItem value="ready_for_pickup">Listo para recoger</SelectItem>
            <SelectItem value="ready_to_receive">Listo para recibir</SelectItem>
            <SelectItem value="completed">Completado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
            <SelectItem value="expired">Expirado</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" placeholder="Fecha inicio" value={filters.start_date} onChange={(e) => setFilters({ ...filters, start_date: e.target.value })} />
        <Input type="date" placeholder="Fecha fin" value={filters.end_date} onChange={(e) => setFilters({ ...filters, end_date: e.target.value })} />
        <Select value={filters.month} onValueChange={(value) => {
          const newFilters = { ...filters, month: value };
          if (newFilters.year) {
            const start = `${newFilters.year}-${value}-01`;
            const end = new Date(parseInt(newFilters.year), parseInt(value), 0).toISOString().split('T')[0];
            newFilters.start_date = start;
            newFilters.end_date = end;
          }
          setFilters(newFilters);
        }}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Mes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="01">Enero</SelectItem>
            <SelectItem value="02">Febrero</SelectItem>
            <SelectItem value="03">Marzo</SelectItem>
            <SelectItem value="04">Abril</SelectItem>
            <SelectItem value="05">Mayo</SelectItem>
            <SelectItem value="06">Junio</SelectItem>
            <SelectItem value="07">Julio</SelectItem>
            <SelectItem value="08">Agosto</SelectItem>
            <SelectItem value="09">Septiembre</SelectItem>
            <SelectItem value="10">Octubre</SelectItem>
            <SelectItem value="11">Noviembre</SelectItem>
            <SelectItem value="12">Diciembre</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.year} onValueChange={(value) => {
          const newFilters = { ...filters, year: value };
          if (newFilters.month) {
            const start = `${value}-${newFilters.month}-01`;
            const end = new Date(parseInt(value), parseInt(newFilters.month), 0).toISOString().split('T')[0];
            newFilters.start_date = start;
            newFilters.end_date = end;
          }
          setFilters(newFilters);
        }}>
          <SelectTrigger className="w-[100px]">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2024">2024</SelectItem>
            <SelectItem value="2025">2025</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={loadTransactions}>Buscar</Button>
      </div>

  <div className="gap-4 grid grid-cols-5 mb-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">Total Transacciones</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-primary text-3xl">{kpis.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">Reservados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-primary text-3xl">{kpis.reserved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">Completadas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-primary text-3xl">{kpis.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">Canceladas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-primary text-3xl">{kpis.cancelled}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">Pagadas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-bold text-primary text-3xl">{kpis.paid}</p>
          </CardContent>
        </Card>
      </div>

      {loading ? <div>Cargando...</div> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Monto Entregado</TableHead>
              <TableHead>Monto Recibido</TableHead>
              <TableHead>Sucursal</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((t) => (
              <TableRow key={t.id || t.transaction_code}>
                <TableCell>{t.transaction_code || t.id}</TableCell>
                <TableCell>{t.user_name || '—'}</TableCell>
                <TableCell>{t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</TableCell>
                <TableCell>{humanizeType(t.type)}</TableCell>
                <TableCell>{t.amount_from} {t.currency_from || 'USD'}</TableCell>
                <TableCell>{t.amount_to} {t.currency_to || 'MXN'}</TableCell>
                <TableCell>{t.branch_name}</TableCell>
                <TableCell>
                  <span className={`px-3 py-1 border rounded-full font-medium text-xs ${getStatusColor(getStatusText(t.status || ''))}`}>
                    {getStatusText(t.status || '')}
                  </span>
                </TableCell>
                <TableCell className="space-x-2">
                  <Button variant="secondary" onClick={() => onChangeStatus(t.id)}>Cambiar estado</Button>
                  <Button onClick={() => onViewDetails(t.id)}>Ver detalles</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={changeStatusDialog.open} onOpenChange={(open) => setChangeStatusDialog({ ...changeStatusDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Estado de Transacción</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>Transacción: {changeStatusDialog.transaction?.transaction_code}</p>
            <Select value={changeStatusDialog.newStatus} onValueChange={(value) => setChangeStatusDialog({ ...changeStatusDialog, newStatus: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reserved">Reservado</SelectItem>
                <SelectItem value="processing">Procesando</SelectItem>
                <SelectItem value="paid">Pagado</SelectItem>
                <SelectItem value="ready_for_pickup">Listo para recoger</SelectItem>
                <SelectItem value="ready_to_receive">Listo para recibir</SelectItem>
                <SelectItem value="completed">Completado</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
                <SelectItem value="expired">Expirado</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={confirmChangeStatus}>Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={detailsDialog.open} onOpenChange={(open) => setDetailsDialog({ ...detailsDialog, open })}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalles de Transacción</DialogTitle>
          </DialogHeader>
          {detailsDialog.details?.transaction && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Información General</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium text-muted-foreground text-sm">ID</span>
                    <span className="font-semibold">{detailsDialog.details.transaction.id}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium text-muted-foreground text-sm">Código de Transacción</span>
                    <span className="font-mono font-semibold">{detailsDialog.details.transaction.transaction_code}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium text-muted-foreground text-sm">Estado</span>
                    <Badge className={getStatusColor(getStatusText(detailsDialog.details.transaction.status || ''))}>{getStatusText(detailsDialog.details.transaction.status || '')}</Badge>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium text-muted-foreground text-sm">Tipo de Operación</span>
                    <Badge variant="outline">{humanizeType(detailsDialog.details.transaction.type)}</Badge>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="font-medium text-muted-foreground text-sm">Fecha de Creación</span>
                    <span className="font-semibold">{detailsDialog.details.transaction.created_at ? new Date(detailsDialog.details.transaction.created_at).toLocaleString() : 'N/A'}</span>
                  </div>
                </CardContent>
              </Card>

              <div className="gap-4 grid grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Cliente y Sucursal</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-muted-foreground text-sm">Cliente</span>
                      <span className="font-semibold">{detailsDialog.details.transaction.user_name}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-muted-foreground text-sm">Sucursal</span>
                      <span className="font-semibold">{detailsDialog.details.transaction.branch_name}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Método y Tasa</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-muted-foreground text-sm">Método de Pago</span>
                      <span className="font-semibold">{detailsDialog.details.transaction.method}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-muted-foreground text-sm">Tasa de Cambio</span>
                      <span className="font-mono font-semibold">{parseFloat(detailsDialog.details.transaction.exchange_rate).toFixed(4)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Montos de la Transacción</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="gap-4 grid grid-cols-2">
                    <div className="flex flex-col gap-2 p-4 border rounded-lg">
                      <span className="font-medium text-muted-foreground text-sm">Monto Entregado</span>
                      <span className="font-bold text-2xl">{parseFloat(detailsDialog.details.transaction.amount_from).toFixed(2)}</span>
                      <span className="font-medium text-muted-foreground text-sm">{detailsDialog.details.transaction.currency_from}</span>
                    </div>
                    <div className="flex flex-col gap-2 p-4 border rounded-lg">
                      <span className="font-medium text-muted-foreground text-sm">Monto Recibido</span>
                      <span className="font-bold text-2xl">{parseFloat(detailsDialog.details.transaction.amount_to).toFixed(2)}</span>
                      <span className="font-medium text-muted-foreground text-sm">{detailsDialog.details.transaction.currency_to}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default AdminTransactionsPage;
