"use client";
import React, { useEffect, useState } from 'react';
import { getAdminUsers, AdminUser, toggleUserStatus } from '../../services/api';
import Cookies from 'js-cookie';

const AdminUsersPage = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) return;
    (async () => {
      setLoading(true);
      const us = await getAdminUsers(token);
      setUsers(us);
      setLoading(false);
    })();
  }, []);

  const onToggleStatus = async (id: number, currentActive: boolean) => {
    const token = Cookies.get('token');
    if (!token) return;
    await toggleUserStatus(id, !currentActive, token);
    const us = await getAdminUsers(token);
    setUsers(us);
  };

  return (
    <section className="p-5">
      <h1 className="mb-4 font-bold text-primary text-2xl">Gestión de Usuarios</h1>
      {loading ? <div>Cargando...</div> : (
        <table className="border border-gray-300 w-full border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border border-gray-300">ID</th>
              <th className="p-2 border border-gray-300">Nombre</th>
              <th className="p-2 border border-gray-300">Email</th>
              <th className="p-2 border border-gray-300">Rol</th>
              <th className="p-2 border border-gray-300">Fecha Registro</th>
              <th className="p-2 border border-gray-300">Estado</th>
              <th className="p-2 border border-gray-300">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.idUser} className="hover:bg-gray-50">
                <td className="p-2 border border-gray-300">{u.idUser}</td>
                <td className="p-2 border border-gray-300">{u.name}</td>
                <td className="p-2 border border-gray-300">{u.email}</td>
                <td className="p-2 border border-gray-300">{u.role}</td>
                <td className="p-2 border border-gray-300">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="p-2 border border-gray-300">{u.active ? 'Activo' : 'Inactivo'}</td>
                <td className="p-2 border border-gray-300">
                  <button className={`px-3 py-1 rounded font-medium transition-all hover:-translate-y-1 ${u.active ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`} onClick={() => onToggleStatus(u.idUser, u.active)}>{u.active ? 'Desactivar' : 'Activar'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};

export default AdminUsersPage;