"use client";
import React, { useEffect, useState } from 'react';
import { getCurrentRates, updateRates, listBranchesAdmin, createBranch, updateBranch, deleteBranch, getAlertSettings, updateAlertSettings, getSetting, updateSetting } from '../../services/api';
import Cookies from 'js-cookie';
import { toast } from 'sonner';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/ui/button';

const AdminConfigPage = () => {
  const [rates, setRates] = useState<{ buy: number; sell: number }>({ buy: 0, sell: 0 });
  const [branches, setBranches] = useState<{ id: number; name: string; address: string; city: string; state: string }[]>([]);
  const [alertEmails, setAlertEmails] = useState('');
  const [commission, setCommission] = useState<string>('');
  const [loadingCommission, setLoadingCommission] = useState<boolean>(true);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) return;
    (async () => {
      const r = await getCurrentRates(token);
      setRates(r);
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
    const buy = Number(prompt('Nueva tasa compra', String(rates.buy)));
    const sell = Number(prompt('Nueva tasa venta', String(rates.sell)));
    if (buy && sell) {
      await updateRates({ buy, sell }, token);
      setRates({ buy, sell });
    }
  };

  const onAddBranch = async () => {
    const token = Cookies.get('token');
    if (!token) return;
    const name = prompt('Nombre sucursal');
    const address = prompt('Dirección');
    if (name && address) {
      await createBranch({ name, address }, token);
      const b = await listBranchesAdmin(token);
      setBranches(b);
    }
  };

  const onUpdateBranch = async (id: number) => {
    const token = Cookies.get('token');
    if (!token) return;
    const branch = branches.find(b => b.id === id);
    if (!branch) return;
    const name = prompt('Nombre', branch.name);
    const address = prompt('Dirección', branch.address);
    if (name && address) {
      await updateBranch(id, { name, address }, token);
      const b = await listBranchesAdmin(token);
      setBranches(b);
    }
  };

  const onDeleteBranch = async (id: number) => {
    const token = Cookies.get('token');
    if (!token) return;
    if (confirm('¿Eliminar sucursal?')) {
      await deleteBranch(id, token);
      const b = await listBranchesAdmin(token);
      setBranches(b);
    }
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
    <section className="p-5">
      <h1 className="mb-4 font-bold text-primary text-2xl">Configuración del Sistema</h1>

      <div className="mb-6">
        <h3 className="mb-2 font-semibold text-primary text-xl">Tasas de Cambio</h3>
        <p className="mb-2">Compra: {rates.buy} — Venta: {rates.sell}</p>
  <Button onClick={onUpdateRates} className="bg-gradient-primary-to-accent hover:bg-gradient-primary-to-accent px-4 py-2 rounded-lg font-medium text-white transition-all hover:-translate-y-1 cursor-pointer">Actualizar Tasas</Button>
      </div>

      <div className="mb-6">
        <h3 className="mb-2 font-semibold text-primary text-xl">Comisión</h3>
        <Label>Porcentaje (%)</Label>
        <div className="flex items-center gap-4">
          <div className="w-40">

            <Input value={commission} placeholder={loadingCommission ? 'Cargando...' : '0.00'} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCommission(e.target.value)} />
          </div>
          <Button onClick={onUpdateCommission} className='bg-gradient-primary-to-accent hover:bg-gradient-primary-to-accent cursor-pointer'  >Guardar Comisión</Button>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="mb-2 font-semibold text-primary text-xl">Sucursales</h3>
  <Button onClick={onAddBranch} className="bg-gradient-primary-to-accent hover:bg-gradient-primary-to-accent mb-4 px-4 py-2 rounded-lg font-medium text-white transition-all hover:-translate-y-1 cursor-pointer">Agregar Sucursal</Button>
        <ul className="space-y-2">
          {branches.map((b) => (
            <li key={b.id} className="flex justify-between items-center bg-white shadow p-3 rounded-lg">
              <span>{b.name} - {b.address}</span>
              <div className="space-x-2">
                <Button onClick={() => onUpdateBranch(b.id)} className="bg-secondary hover:bg-secondary px-3 py-1 rounded font-medium text-white transition-all hover:-translate-y-1 cursor-pointer">Editar</Button>
                <Button onClick={() => onDeleteBranch(b.id)} className="bg-red-500 hover:bg-red-600 px-3 py-1 rounded font-medium text-white transition-all hover:-translate-y-1 cursor-pointer">Eliminar</Button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-6">
        <h3 className="mb-2 font-semibold text-primary text-xl">Configuración de Alertas</h3>
        <p className="mb-2">Emails: {alertEmails}</p>
  <Button onClick={onUpdateAlerts} className="bg-gradient-primary-to-accent hover:bg-gradient-primary-to-accent px-4 py-2 rounded-lg font-medium text-white transition-all hover:-translate-y-1 cursor-pointer">Actualizar Emails</Button>
      </div>
    </section>
  );
};

export default AdminConfigPage;