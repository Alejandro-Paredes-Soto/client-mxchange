"use client";
import React, { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { getAdminInventory, putAdminInventory, AdminInventoryItem as ApiAdminInventoryItem } from '../../services/api';
import { useSocket } from '@/providers/SocketProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const [loading, setLoading] = useState(false);
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
      try {
        if (typeof payload !== 'object' || payload === null) return;
        const p = payload as { branch_id?: number; inventory?: Record<string, unknown>; refresh?: boolean };
        if (!p.branch_id) return;
        // Si el payload indica refresh, volver a cargar desde el backend
        if (p.refresh) {
          load();
          return;
        }
        // Actualizar estado localmente usando inventory si viene
        if (p.inventory) {
          const inv = p.inventory as Record<string, unknown>;
          const getInfo = (key: string) => {
            const raw = inv[key];
            if (!raw || typeof raw !== 'object') return undefined;
            const obj = raw as { amount?: unknown; low_stock_threshold?: unknown };
            let amount: number | undefined;
            if (typeof obj.amount === 'number') amount = obj.amount;
            else if (typeof obj.amount === 'string' && obj.amount !== '') amount = Number(obj.amount);
            let low: number | null = null;
            if (typeof obj.low_stock_threshold === 'number') low = obj.low_stock_threshold;
            else if (typeof obj.low_stock_threshold === 'string' && obj.low_stock_threshold !== '') low = Number(obj.low_stock_threshold);
            if (amount === undefined) return undefined;
            return { amount, low_stock_threshold: low };
          };

          const usdInfo = getInfo('USD');
          const mxnInfo = getInfo('MXN');

          setBranches(prev => prev.map(b => {
            if (b.branch_id !== Number(p.branch_id)) return b;
            const usd = usdInfo ? {
              ...b.usd,
              amount: usdInfo.amount,
              low_stock_threshold: usdInfo.low_stock_threshold != null ? usdInfo.low_stock_threshold : b.usd?.low_stock_threshold,
            } : b.usd;
            const mxn = mxnInfo ? {
              ...b.mxn,
              amount: mxnInfo.amount,
              low_stock_threshold: mxnInfo.low_stock_threshold != null ? mxnInfo.low_stock_threshold : b.mxn?.low_stock_threshold,
            } : b.mxn;
            return { ...b, usd, mxn } as BranchInventory;
          }));
        }
      } catch {
        // noop
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
    setLoading(true);
    try {
  const token = Cookies.get('token');
  const res = await putAdminInventory(editingItem.id, { amount: newAmount }, token);
      if (res && (res.error || res.ok === false)) {
        console.error('Error updating:', res);
        // TODO: show toast
      } else {
        // update local state
        setBranches(prev => prev.map(b => {
          const usd = b.usd && b.usd.id === editingItem.id ? { ...b.usd, amount: newAmount } : b.usd;
          const mxn = b.mxn && b.mxn.id === editingItem.id ? { ...b.mxn, amount: newAmount } : b.mxn;
          return { ...b, usd, mxn };
        }));
      }
    } catch (e) {
      console.error('confirmAdjust error', e);
    } finally {
      setDialogOpen(false);
      setEditingItem(null);
      setLoading(false);
    }
  };

  const confirmThresholds = async () => {
    if (!editingBranch) return;
    setLoading(true);
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
      setLoading(false);
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
      normal: { variant: 'default' as const, label: 'Normal' },
      low: { variant: 'secondary' as const, label: 'Bajo' },
      critical: { variant: 'destructive' as const, label: 'Crítico' }
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.normal;
    return <Badge variant={config.variant}>{config.label}</Badge>;
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
              <TableHead colSpan={5} className="bg-blue-50 text-center">Dólares (USD)</TableHead>
              <TableHead colSpan={5} className="bg-green-50 text-center">Pesos (MXN)</TableHead>
              <TableHead rowSpan={2} className="text-center">Configuración</TableHead>
            </TableRow>
            <TableRow>
              <TableHead className="bg-blue-50">Disponible</TableHead>
              <TableHead className="bg-blue-50">Umbral</TableHead>
              <TableHead className="bg-blue-50">Estado</TableHead>
              <TableHead className="bg-blue-50">Última Act.</TableHead>
              <TableHead className="bg-blue-50 text-center">Acciones</TableHead>
              <TableHead className="bg-green-50">Disponible</TableHead>
              <TableHead className="bg-green-50">Umbral</TableHead>
              <TableHead className="bg-green-50">Estado</TableHead>
              <TableHead className="bg-green-50">Última Act.</TableHead>
              <TableHead className="bg-green-50 text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.map((branch) => (
              <TableRow key={branch.branch_id}>
                <TableCell className="font-semibold">{branch.branch_name}</TableCell>
                <TableCell>{branch.usd ? formatCurrency(branch.usd.amount, 'USD') : '—'}</TableCell>
                <TableCell>{branch.usd ? formatCurrency(branch.usd.low_stock_threshold || 0, 'USD') : '—'}</TableCell>
                <TableCell>{branch.usd?.stock_status ? getStatusBadge(branch.usd.stock_status) : '—'}</TableCell>
                <TableCell className="text-gray-600 text-sm">{branch.usd?.last_updated ? new Date(branch.usd.last_updated).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</TableCell>
                <TableCell className="text-center">
                  {branch.usd && <Button size="sm" onClick={() => openAdjustDialog(branch.usd!)}>Ajustar</Button>}
                </TableCell>
                <TableCell>{branch.mxn ? formatCurrency(branch.mxn.amount, 'MXN') : '—'}</TableCell>
                <TableCell>{branch.mxn ? formatCurrency(branch.mxn.low_stock_threshold || 0, 'MXN') : '—'}</TableCell>
                <TableCell>{branch.mxn?.stock_status ? getStatusBadge(branch.mxn.stock_status) : '—'}</TableCell>
                <TableCell className="text-gray-600 text-sm">{branch.mxn?.last_updated ? new Date(branch.mxn.last_updated).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</TableCell>
                <TableCell className="text-center">
                  {branch.mxn && <Button size="sm" onClick={() => openAdjustDialog(branch.mxn!)}>Ajustar</Button>}
                </TableCell>
                <TableCell className="text-center">
                  <Button size="sm" variant="outline" onClick={() => openThresholdDialog(branch)}>Umbrales</Button>
                </TableCell>
              </TableRow>
            ))}
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
              <Input
                type="number"
                value={editingItem?.adjustment || ''}
                onChange={(e) => setEditingItem(prev => prev ? { ...prev, adjustment: e.target.value } : null)}
                placeholder="Ej: 5000 o -3000"
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
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={confirmAdjust}>Confirmar Ajuste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Threshold Dialog */}
      <Dialog open={thresholdDialogOpen} onOpenChange={setThresholdDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Umbrales</DialogTitle>
            <DialogDescription>
              Establece los umbrales de bajo inventario para {editingBranch?.branch_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Umbral USD</Label>
              <Input
                type="number"
                value={usdThreshold}
                onChange={(e) => setUsdThreshold(Number(e.target.value))}
                placeholder="Ej: 10000"
              />
            </div>
            <div>
              <Label>Umbral MXN</Label>
              <Input
                type="number"
                value={mxnThreshold}
                onChange={(e) => setMxnThreshold(Number(e.target.value))}
                placeholder="Ej: 100000"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={confirmThresholds}>Guardar Umbrales</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default AdminInventoryPage;