"use client";
import React, { useEffect, useState } from 'react';
import { getCurrentRates, updateRates, listBranchesAdmin, createBranch, updateBranch, deleteBranch, getAlertSettings, updateAlertSettings, getSetting, updateSetting } from '../../services/api';
import Cookies from 'js-cookie';
import { toast } from 'sonner';
import { Input } from '../../../components/ui/input';
import { NumberInput } from '../../../components/ui/number-input';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/ui/button';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Separator } from '../../../components/ui/separator';

const AdminConfigPage = () => {
  const router = useRouter();
  const [rates, setRates] = useState<{ buy: number; sell: number }>({ buy: 0, sell: 0 });
  const [editRates, setEditRates] = useState<{ buy: string; sell: string }>({ buy: '', sell: '' });
  const [branches, setBranches] = useState<{ id: number; name: string; address: string; city: string; state: string; user_email?: string }[]>([]);
  const [alertEmails, setAlertEmails] = useState('');
  const [commission, setCommission] = useState<string>('');
  const [loadingCommission, setLoadingCommission] = useState<boolean>(true);
  const [loadingRates, setLoadingRates] = useState<boolean>(true);
  const [isAddBranchOpen, setIsAddBranchOpen] = useState(false);
  const [isEditBranchOpen, setIsEditBranchOpen] = useState(false);
  const [isDeleteBranchOpen, setIsDeleteBranchOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null);
  const [newBranchData, setNewBranchData] = useState({
    name: '',
    address: '',
    email: '',
    password: ''
  });
  const [editBranchData, setEditBranchData] = useState({
    name: '',
    address: '',
    email: '',
    password: ''
  });

  useEffect(() => {
    // Verificar que el usuario sea admin
    const token = Cookies.get('token');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.role !== 'admin') {
          toast.error('Acceso denegado: Solo administradores pueden acceder a la configuración');
          router.push('/admin');
          return;
        }
      }
    } catch (err) {
      console.error('Error decoding token:', err);
      router.push('/login');
      return;
    }

    (async () => {
      setLoadingRates(true);
      const r = await getCurrentRates(token);
      setRates(r);
      setEditRates({ buy: String(r.buy), sell: String(r.sell) });
      setLoadingRates(false);

      const b = await listBranchesAdmin(token);
      setBranches(b);
      const a = await getAlertSettings(token);
      setAlertEmails(a.alertEmails || '');
      // load commission_percent setting
      setLoadingCommission(true);
      const s = await getSetting('commission_percent', token);
      if (s && s.value !== undefined && s.value !== null) setCommission(String(s.value));
      setLoadingCommission(false);
    })();
  }, []);

  const onUpdateRates = async () => {
    const token = Cookies.get('token');
    if (!token) return;

    const buy = Number(editRates.buy);
    const sell = Number(editRates.sell);

    if (Number.isNaN(buy) || Number.isNaN(sell)) {
      toast.error('Valores de tasas inválidos');
      return;
    }

    if (buy <= 0 || sell <= 0) {
      toast.error('Las tasas deben ser mayores a 0');
      return;
    }

    const result = await updateRates({ buy, sell }, token);
    if (result && !result.error) {
      setRates({ buy, sell });
      toast.success('Tasas actualizadas correctamente');
    } else {
      toast.error('Error al actualizar tasas');
    }
  };

  const onAddBranch = async () => {
    const token = Cookies.get('token');
    if (!token) return;

    // Validaciones
    if (!newBranchData.name.trim()) {
      toast.error('El nombre de la sucursal es requerido');
      return;
    }
    if (!newBranchData.address.trim()) {
      toast.error('La dirección es requerida');
      return;
    }
    if (!newBranchData.email.trim()) {
      toast.error('El email es requerido');
      return;
    }
    if (!newBranchData.password.trim()) {
      toast.error('La contraseña es requerida');
      return;
    }

    const result = await createBranch(newBranchData, token);
    if (result && result.error) {
      toast.error(result.error.message || 'Error al crear sucursal');
    } else {
      toast.success('Sucursal y usuario creados correctamente');
      const b = await listBranchesAdmin(token);
      setBranches(b);
      setIsAddBranchOpen(false);
      setNewBranchData({ name: '', address: '', email: '', password: '' });
    }
  };

  const onUpdateBranch = async (id: number) => {
    const token = Cookies.get('token');
    if (!token) return;

    // Validaciones
    if (!editBranchData.name.trim()) {
      toast.error('El nombre de la sucursal es requerido');
      return;
    }
    if (!editBranchData.address.trim()) {
      toast.error('La dirección es requerida');
      return;
    }
    if (!editBranchData.email.trim()) {
      toast.error('El email es requerido');
      return;
    }

    const payload: any = {
      name: editBranchData.name,
      address: editBranchData.address,
      email: editBranchData.email
    };

    // Solo incluir password si se proporcionó uno nuevo
    if (editBranchData.password.trim()) {
      payload.password = editBranchData.password;
    }

    const result = await updateBranch(id, payload, token);
    if (result && result.error) {
      toast.error(result.error.message || 'Error al actualizar sucursal');
    } else {
      toast.success('Sucursal actualizada correctamente');
      const b = await listBranchesAdmin(token);
      setBranches(b);
      setIsEditBranchOpen(false);
      setSelectedBranch(null);
      setEditBranchData({ name: '', address: '', email: '', password: '' });
    }
  };

  const onDeleteBranch = async (id: number) => {
    const token = Cookies.get('token');
    if (!token) return;

    const result = await deleteBranch(id, token);
    if (result && result.error) {
      toast.error('Error al eliminar sucursal');
    } else {
      toast.success('Sucursal eliminada correctamente');
      const b = await listBranchesAdmin(token);
      setBranches(b);
      setIsDeleteBranchOpen(false);
      setSelectedBranch(null);
    }
  };

  const openEditDialog = (branch: any) => {
    setSelectedBranch(branch.id);
    setEditBranchData({
      name: branch.name,
      address: branch.address,
      email: branch.user_email || '',
      password: ''
    });
    setIsEditBranchOpen(true);
  };

  const openDeleteDialog = (branchId: number) => {
    setSelectedBranch(branchId);
    setIsDeleteBranchOpen(true);
  };

  const onUpdateAlerts = async () => {
    const token = Cookies.get('token');
    if (!token) return;
    const emails = prompt('Emails para alertas', alertEmails);
    if (emails !== null) {
      await updateAlertSettings({ alertEmails: emails }, token);
      setAlertEmails(emails);
    }
  };

  const onUpdateCommission = async () => {
    const token = Cookies.get('token');
    if (!token) return;
    // validate numeric
    const num = Number(commission);
    if (Number.isNaN(num)) return alert('Valor de comisión inválido');
    const res = await updateSetting('commission_percent', String(num), token);
    if (res && (res.error === undefined)) {
      toast.success('Comisión actualizada');
    } else {
      toast.error('Error al guardar comisión');
    }
  };

  return (
    <div className="mx-auto px-4 py-8 max-w-6xl container">
      <div className="mb-8">
        <h1 className="font-bold text-3xl tracking-tight">Configuración del Sistema</h1>
        <p className="mt-2 text-muted-foreground">
          Administra las tasas de cambio, sucursales y configuraciones generales
        </p>
      </div>

      <div className="space-y-6">
        {/* Tasas de Cambio */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Tasas de Cambio</CardTitle>
            <CardDescription>
              Configure manualmente las tasas de compra y venta de USD
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="gap-6 grid grid-cols-1 md:grid-cols-2 mb-6">
              <div className="space-y-2">
                <Label htmlFor="buy-rate" className="font-medium text-sm">
                  Tasa de Compra (USD)
                </Label>
                <NumberInput
                  id="buy-rate"
                  decimals={4}
                  value={editRates.buy}
                  placeholder={loadingRates ? 'Cargando...' : '17.8000'}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditRates({ ...editRates, buy: e.target.value })}
                  className="h-10"
                />
                <p className="text-muted-foreground text-xs">
                  Tasa actual: <span className="font-medium">{rates.buy}</span>
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sell-rate" className="font-medium text-sm">
                  Tasa de Venta (USD)
                </Label>
                <NumberInput
                  id="sell-rate"
                  decimals={4}
                  value={editRates.sell}
                  placeholder={loadingRates ? 'Cargando...' : '18.2000'}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditRates({ ...editRates, sell: e.target.value })}
                  className="h-10"
                />
                <p className="text-muted-foreground text-xs">
                  Tasa actual: <span className="font-medium">{rates.sell}</span>
                </p>
              </div>
            </div>
            <Button
              onClick={onUpdateRates}
              size="default"
              className="bg-gradient-primary-to-accent hover:bg-gradient-primary-to-accent"
            >
              Guardar Tasas
            </Button>
          </CardContent>
        </Card>

        {/* Comisión */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Comisión</CardTitle>
            <CardDescription>
              Establece el porcentaje de comisión para las transacciones
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex sm:flex-row flex-col items-start sm:items-end gap-4">
              <div className="space-y-2 w-full sm:w-64">
                <Label htmlFor="commission" className="font-medium text-sm">
                  Porcentaje (%)
                </Label>
                <NumberInput
                  id="commission"
                  decimals={2}
                  value={commission}
                  placeholder={loadingCommission ? 'Cargando...' : '0.00'}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCommission(e.target.value)}
                  className="h-10"
                />
              </div>
              <Button
                onClick={onUpdateCommission}
                size="default"
                className="bg-gradient-primary-to-accent hover:bg-gradient-primary-to-accent"
              >
                Guardar Comisión
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sucursales */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-xl">Sucursales</CardTitle>
                <CardDescription>
                  Administra las sucursales y sus usuarios
                </CardDescription>
              </div>
              <Dialog open={isAddBranchOpen} onOpenChange={setIsAddBranchOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-primary-to-accent hover:bg-gradient-primary-to-accent">
                    Agregar Sucursal
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Agregar Nueva Sucursal</DialogTitle>
                    <DialogDescription>
                      Completa la información de la sucursal y el usuario administrador de la misma.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="gap-4 grid py-4">
                    <div className="space-y-2">
                      <Label htmlFor="branch-name">Nombre de la Sucursal</Label>
                      <Input
                        id="branch-name"
                        value={newBranchData.name}
                        onChange={(e) => setNewBranchData({ ...newBranchData, name: e.target.value })}
                        placeholder="Ej: Sucursal Centro"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="branch-address">Dirección</Label>
                      <Input
                        id="branch-address"
                        value={newBranchData.address}
                        onChange={(e) => setNewBranchData({ ...newBranchData, address: e.target.value })}
                        placeholder="Ej: Av. Principal #123"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="branch-email">Email del Usuario</Label>
                      <Input
                        id="branch-email"
                        type="email"
                        value={newBranchData.email}
                        onChange={(e) => setNewBranchData({ ...newBranchData, email: e.target.value })}
                        placeholder="usuario@ejemplo.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="branch-password">Contraseña</Label>
                      <Input
                        id="branch-password"
                        type="password"
                        value={newBranchData.password}
                        onChange={(e) => setNewBranchData({ ...newBranchData, password: e.target.value })}
                        placeholder="•••••••••"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsAddBranchOpen(false);
                        setNewBranchData({ name: '', address: '', email: '', password: '' });
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={onAddBranch}
                      className="bg-gradient-primary-to-accent hover:bg-gradient-primary-to-accent"
                    >
                      Crear Sucursal
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {branches.length === 0 ? (
              <div className="py-8 text-muted-foreground text-center">
                <p>No hay sucursales registradas</p>
              </div>
            ) : (
              <div className="space-y-3">
                {branches.map((b) => (
                  <div
                    key={b.id}
                    className="flex sm:flex-row flex-col justify-between sm:items-center gap-4 hover:bg-accent/50 p-4 border rounded-lg transition-colors"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{b.name}</p>
                      <p className="text-muted-foreground text-sm">{b.address}</p>
                      {b.user_email && (
                        <p className="text-muted-foreground text-xs">
                          Usuario: {b.user_email}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => openEditDialog(b)}
                        variant="secondary"
                        size="sm"
                      >
                        Editar
                      </Button>
                      <Button
                        onClick={() => openDeleteDialog(b.id)}
                        variant="destructive"
                        size="sm"
                      >
                        Eliminar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Configuración de Alertas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Configuración de Alertas</CardTitle>
            <CardDescription>
              Administra los emails que recibirán notificaciones del sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="font-medium text-sm">Emails configurados</Label>
                <div className="bg-muted p-3 rounded-md">
                  <p className="font-mono text-sm">
                    {alertEmails || 'No hay emails configurados'}
                  </p>
                </div>
              </div>
              <Button
                onClick={onUpdateAlerts}
                size="default"
                className="bg-gradient-primary-to-accent hover:bg-gradient-primary-to-accent"
              >
                Actualizar Emails
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog para editar sucursal */}
      <Dialog open={isEditBranchOpen} onOpenChange={setIsEditBranchOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar Sucursal</DialogTitle>
            <DialogDescription>
              Modifica la información de la sucursal y su usuario. La contraseña solo se actualizará si ingresas una nueva.
            </DialogDescription>
          </DialogHeader>
          <div className="gap-4 grid py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-branch-name">Nombre de la Sucursal</Label>
              <Input
                id="edit-branch-name"
                value={editBranchData.name}
                onChange={(e) => setEditBranchData({ ...editBranchData, name: e.target.value })}
                placeholder="Ej: Sucursal Centro"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-branch-address">Dirección</Label>
              <Input
                id="edit-branch-address"
                value={editBranchData.address}
                onChange={(e) => setEditBranchData({ ...editBranchData, address: e.target.value })}
                placeholder="Ej: Av. Principal #123"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-branch-email">Email del Usuario</Label>
              <Input
                id="edit-branch-email"
                type="email"
                value={editBranchData.email}
                onChange={(e) => setEditBranchData({ ...editBranchData, email: e.target.value })}
                placeholder="usuario@ejemplo.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-branch-password">Nueva Contraseña (opcional)</Label>
              <Input
                id="edit-branch-password"
                type="password"
                value={editBranchData.password}
                onChange={(e) => setEditBranchData({ ...editBranchData, password: e.target.value })}
                placeholder="Dejar vacío para no cambiar"
              />
              <p className="text-muted-foreground text-xs">
                Solo ingresa una contraseña si deseas cambiarla
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditBranchOpen(false);
                setSelectedBranch(null);
                setEditBranchData({ name: '', address: '', email: '', password: '' });
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => selectedBranch && onUpdateBranch(selectedBranch)}
              className="bg-gradient-primary-to-accent hover:bg-gradient-primary-to-accent"
            >
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog para eliminar sucursal */}
      <AlertDialog open={isDeleteBranchOpen} onOpenChange={setIsDeleteBranchOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente la sucursal
              y el usuario asociado a ella.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setIsDeleteBranchOpen(false);
              setSelectedBranch(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedBranch && onDeleteBranch(selectedBranch)}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminConfigPage;