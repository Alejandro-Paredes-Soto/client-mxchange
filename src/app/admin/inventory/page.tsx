"use client";
import React, { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { getAdminInventory, putAdminInventory, AdminInventoryItem as ApiAdminInventoryItem } from '../../services/api';
import { useSocket } from '@/providers/SocketProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";

interface AdminInventoryItem {
  id?: number;
  branch_id?: number;
  branch_name?: string;
  currency: string;
  amount: number;
  reserved_amount?: number;
  low_stock_threshold?: number;
  stock_status?: string;
  last_updated?: string;
}

interface BranchInventory {
  branch_id: number;
  branch_name: string;
  usd: AdminInventoryItem | null;
  mxn: AdminInventoryItem | null;
}

const AdminInventoryPage = () => {
  const [branches, setBranches] = useState<BranchInventory[]>([]);
  const [loading, setLoading] = useState(true); // true inicial para la carga inicial
  const [saving, setSaving] = useState(false); // para operaciones de guardado
  const socket = useSocket();

  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<{
    id: number;
    key: 'usd_amount' | 'mxn_amount';
    currentAmount: number;
    adjustment: string;
    currency: string;
  } | null>(null);

  const [thresholdDialogOpen, setThresholdDialogOpen] = useState<boolean>(false);
  const [editingBranch, setEditingBranch] = useState<BranchInventory | null>(null);
  const [usdThreshold, setUsdThreshold] = useState<number>(0);
  const [mxnThreshold, setMxnThreshold] = useState<number>(0);

  const openAdjustDialog = (it: AdminInventoryItem) => {
    const key = it.currency === 'USD' ? 'usd_amount' : 'mxn_amount';
    setEditingItem({ id: it.id!, key, currentAmount: Number(it.amount || 0), adjustment: '0', currency: it.currency });
    setDialogOpen(true);
  };

  const openThresholdDialog = (branch: BranchInventory) => {
    setEditingBranch(branch);
    setUsdThreshold(branch.usd?.low_stock_threshold || 0);
    setMxnThreshold(branch.mxn?.low_stock_threshold || 0);
    setThresholdDialogOpen(true);
  };

  // load real inventory from backend
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const token = Cookies.get('token');
        const items: ApiAdminInventoryItem[] = await getAdminInventory(token);
        if (!mounted) return;
        // convert flat list to BranchInventory grouped by branch
        const grouped: Record<number, BranchInventory> = {};
        items.forEach((it) => {
          const bid = Number(it.branch_id);
          if (!grouped[bid]) grouped[bid] = { branch_id: bid, branch_name: it.branch_name || '', usd: null, mxn: null };
          const target = it.currency === 'USD' ? 'usd' : 'mxn';
          grouped[bid][target] = {
            id: Number(it.id),
            branch_id: bid,
            branch_name: it.branch_name || grouped[bid].branch_name,
            currency: it.currency,
            amount: Number(it.amount),
            reserved_amount: it.reserved_amount != null ? Number(it.reserved_amount) : 0,
            low_stock_threshold: it.low_stock_threshold != null ? Number(it.low_stock_threshold) : undefined,
            stock_status: it.stock_status || undefined,
            last_updated: it.last_updated || undefined,
          } as AdminInventoryItem;
        });
        setBranches(Object.values(grouped));
      } catch (err) {
        console.error('Error cargando inventario:', err);
      } finally {
        setLoading(false);
      }
    };

    // handler para actualizaciones por socket
    const handler = (payload: unknown) => {
      console.log('📡 Evento inventory.updated recibido:', payload);
      try {
        if (typeof payload !== 'object' || payload === null) return;
        const p = payload as { branch_id?: number; inventory?: Record<string, unknown>; refresh?: boolean };
        if (!p.branch_id) return;

        // SIEMPRE recargar desde el backend para obtener datos completos y actualizados
        // Esto incluye reserved_amount que se calcula en el backend
        console.log('🔄 Recargando inventario desde el backend...');
        load();
      } catch (err) {
        console.error('Error procesando evento inventory.updated:', err);
      }
    };

    load();
    if (socket && socket.on) {
      socket.on('inventory.updated', handler);
    }

    return () => {
      mounted = false;
      if (socket && socket.off) {
        socket.off('inventory.updated', handler);
      }
    };
  }, [socket]);

  const confirmAdjust = async () => {
    if (!editingItem) return;
    const adjustmentNum = Number(editingItem.adjustment);
    if (isNaN(adjustmentNum)) return;
    const newAmount = editingItem.currentAmount + adjustmentNum;
    setSaving(true);
    try {
      const token = Cookies.get('token');
      const res = await putAdminInventory(editingItem.id, { amount: newAmount }, token);
      if (res && (res.error || res.ok === false)) {
        console.error('Error updating:', res);
        // TODO: show toast
      } else {
        // Función para calcular el stock_status basado en amount y threshold
        const calculateStatus = (amount: number, threshold: number): string => {
          if (amount > threshold) return 'normal';
          if (amount > threshold * 0.5) return 'low';
          return 'critical';
        };

        // update local state
        setBranches(prev => prev.map(b => {
          const usd = b.usd && b.usd.id === editingItem.id
            ? {
              ...b.usd,
              amount: newAmount,
              stock_status: calculateStatus(newAmount, b.usd.low_stock_threshold || 0)
            }
            : b.usd;
          const mxn = b.mxn && b.mxn.id === editingItem.id
            ? {
              ...b.mxn,
              amount: newAmount,
              stock_status: calculateStatus(newAmount, b.mxn.low_stock_threshold || 0)
            }
            : b.mxn;
          return { ...b, usd, mxn };
        }));
      }
    } catch (e) {
      console.error('confirmAdjust error', e);
    } finally {
      setDialogOpen(false);
      setEditingItem(null);
      setSaving(false);
    }
  };

  const confirmThresholds = async () => {
    if (!editingBranch) return;
    setSaving(true);
    try {
      const token = Cookies.get('token');
      // update USD item
      if (editingBranch.usd) {
        await putAdminInventory(editingBranch.usd!.id!, { low_stock_threshold: usdThreshold }, token);
      }
      if (editingBranch.mxn) {
        await putAdminInventory(editingBranch.mxn!.id!, { low_stock_threshold: mxnThreshold }, token);
      }
      // update local state
      setBranches(prev => prev.map(b => {
        if (b.branch_id !== editingBranch.branch_id) return b;
        return {
          ...b,
          usd: b.usd ? { ...b.usd, low_stock_threshold: usdThreshold } : b.usd,
          mxn: b.mxn ? { ...b.mxn, low_stock_threshold: mxnThreshold } : b.mxn,
        };
      }));
    } catch (e) {
      console.error('confirmThresholds error', e);
    } finally {
      setThresholdDialogOpen(false);
      setEditingBranch(null);
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      normal: { variant: 'default' as const, label: 'Normal', className: '' },
      low: { variant: 'destructive' as const, label: 'Bajo', className: 'text-white' },
      critical: { variant: 'destructive' as const, label: 'Crítico', className: 'text-white' }
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.normal;
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>;
  };

  return (
    <section className="p-5">
      <div className="mb-6">
        <h1 className="mb-4 font-bold text-primary text-2xl">Gestión de Inventario</h1>
        <p className="mt-1 text-gray-600">Administra el inventario de USD y MXN por sucursal</p>
      </div>

      {loading ? (
        <div className="bg-white shadow-sm p-8 border border-gray-300 rounded-lg text-center">
          <p className="text-gray-500">Cargando inventario...</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead rowSpan={2}>Sucursal</TableHead>
              <TableHead colSpan={6} className="bg-blue-50 text-center">Dólares (USD)</TableHead>
              <TableHead colSpan={6} className="bg-green-50 text-center">Pesos (MXN)</TableHead>
            </TableRow>
            <TableRow>
              <TableHead className="bg-blue-50">En Sucursal</TableHead>
              <TableHead className="bg-blue-50">Reservado</TableHead>
              <TableHead className="bg-blue-50">Disponible</TableHead>
              <TableHead className="bg-blue-50">Umbral</TableHead>
              <TableHead className="bg-blue-50">Estado</TableHead>
              <TableHead className="bg-blue-50 text-center">Acciones</TableHead>
              <TableHead className="bg-green-50">En Sucursal</TableHead>
              <TableHead className="bg-green-50">Reservado</TableHead>
              <TableHead className="bg-green-50">Disponible</TableHead>
              <TableHead className="bg-green-50">Umbral</TableHead>
              <TableHead className="bg-green-50">Estado</TableHead>
              <TableHead className="bg-green-50 text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.map((branch) => {
              const usdDisponible = (branch.usd?.amount || 0) - (branch.usd?.reserved_amount || 0);
              const mxnDisponible = (branch.mxn?.amount || 0) - (branch.mxn?.reserved_amount || 0);
              const usdBajoUmbral = usdDisponible <= (branch.usd?.low_stock_threshold || 0);
              const mxnBajoUmbral = mxnDisponible <= (branch.mxn?.low_stock_threshold || 0);

              return (
                <TableRow key={branch.branch_id}>
                  <TableCell className="font-semibold">{branch.branch_name}</TableCell>
                  <TableCell>{branch.usd ? formatCurrency(branch.usd.amount, 'USD') : '—'}</TableCell>
                  <TableCell className="font-medium text-black">{branch.usd ? formatCurrency(branch.usd.reserved_amount || 0, 'USD') : '—'}</TableCell>
                  <TableCell className={`font-semibold ${usdBajoUmbral ? 'text-red-600' : 'text-green-700'}`}>
                    {branch.usd ? formatCurrency(usdDisponible, 'USD') : '—'}
                  </TableCell>
                  <TableCell>{branch.usd ? formatCurrency(branch.usd.low_stock_threshold || 0, 'USD') : '—'}</TableCell>
                  <TableCell>{branch.usd?.stock_status ? getStatusBadge(branch.usd.stock_status) : '—'}</TableCell>
                  <TableCell className="text-center">
                    {branch.usd && (
                      <div className="flex justify-center gap-2">
                        <Button size="sm" onClick={() => openAdjustDialog(branch.usd!)}>Ajustar</Button>
                        <Button size="sm" variant="outline" onClick={() => openThresholdDialog(branch)}>Umbral</Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{branch.mxn ? formatCurrency(branch.mxn.amount, 'MXN') : '—'}</TableCell>
                  <TableCell className="font-medium text-black">{branch.mxn ? formatCurrency(branch.mxn.reserved_amount || 0, 'MXN') : '—'}</TableCell>
                  <TableCell className={`font-semibold ${mxnBajoUmbral ? 'text-red-600' : 'text-green-700'}`}>
                    {branch.mxn ? formatCurrency(mxnDisponible, 'MXN') : '—'}
                  </TableCell>
                  <TableCell>{branch.mxn ? formatCurrency(branch.mxn.low_stock_threshold || 0, 'MXN') : '—'}</TableCell>
                  <TableCell>{branch.mxn?.stock_status ? getStatusBadge(branch.mxn.stock_status) : '—'}</TableCell>
                  <TableCell className="text-center">
                    {branch.mxn && (
                      <div className="flex justify-center gap-2">
                        <Button size="sm" onClick={() => openAdjustDialog(branch.mxn!)}>Ajustar</Button>
                        <Button size="sm" variant="outline" onClick={() => openThresholdDialog(branch)}>Umbral</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Adjust Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar Inventario</DialogTitle>
            <DialogDescription>
              Modifica el monto de {editingItem?.currency} disponible
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Monto Actual</Label>
              <Input
                type="text"
                value={formatCurrency(editingItem?.currentAmount || 0, editingItem?.currency || 'USD')}
                disabled
                className="bg-gray-50"
              />
            </div>
            <div>
              <Label>Ajuste (positivo para agregar, negativo para restar)</Label>
              <NumberInput
                value={editingItem?.adjustment || ''}
                onChange={(e) => setEditingItem(prev => prev ? { ...prev, adjustment: e.target.value } : null)}
                placeholder="Ej: 5000 o -3000"
                allowNegative={true}
              />
            </div>
            <div>
              <Label>Nuevo Monto</Label>
              <Input
                type="text"
                value={formatCurrency((editingItem?.currentAmount || 0) + Number(editingItem?.adjustment || '0'), editingItem?.currency || 'USD')}
                disabled
                className="bg-gray-50 font-semibold"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={saving}>Cancelar</Button>
            </DialogClose>
            <Button onClick={confirmAdjust} disabled={saving}>
              {saving ? 'Guardando...' : 'Confirmar Ajuste'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Threshold Dialog */}
      <Dialog open={thresholdDialogOpen} onOpenChange={setThresholdDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Umbrales</DialogTitle>
            <DialogDescription>
              Establece los umbrales de bajo stock para notificar cuando el inventario de {editingBranch?.branch_name} esté por debajo de estos valores.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Umbral USD</Label>
              <NumberInput
                value={usdThreshold}
                onChange={(e) => setUsdThreshold(Number(e.target.value))}
                placeholder="Ej: 10000"
              />
            </div>
            <div>
              <Label>Umbral MXN</Label>
              <NumberInput
                value={mxnThreshold}
                onChange={(e) => setMxnThreshold(Number(e.target.value))}
                placeholder="Ej: 100000"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={saving}>Cancelar</Button>
            </DialogClose>
            <Button onClick={confirmThresholds} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Umbrales'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default AdminInventoryPage;