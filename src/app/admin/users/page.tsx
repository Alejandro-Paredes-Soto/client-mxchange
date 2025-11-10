"use client";
import React, { useEffect, useState } from 'react';
import { getAdminUsers, AdminUser, toggleUserStatus } from '../../services/api';
import Cookies from 'js-cookie';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
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
import { Shield, User, Building2 } from 'lucide-react';

const AdminUsersPage = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<{ id: number; name: string; active: boolean } | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) return;
    (async () => {
      setLoading(true);
      const us = await getAdminUsers(token);
      // Normalizar el campo active de 0/1 a boolean
      const normalizedUsers = us.map(user => ({
        ...user,
        active: Boolean(user.active)
      }));
      setUsers(normalizedUsers);
      setLoading(false);
    })();
  }, []);

  const handleToggleStatus = (user: AdminUser) => {
    // Asegurar que active sea boolean
    const isActive = Boolean(user.active);
    setSelectedUser({
      id: user.idUser,
      name: user.name,
      active: isActive
    });
    setIsAlertOpen(true);
  };

  const confirmToggleStatus = async () => {
    if (!selectedUser) return;
    
    const token = Cookies.get('token');
    if (!token) return;
    
    const newStatus = !selectedUser.active;
    const result = await toggleUserStatus(selectedUser.id, newStatus, token);
    
    if (result && result.error) {
      toast.error('Error al cambiar el estado del usuario');
    } else {
      toast.success(
        newStatus 
          ? `Usuario ${selectedUser.name} activado correctamente` 
          : `Usuario ${selectedUser.name} desactivado. No podrá acceder al sistema.`
      );
      const us = await getAdminUsers(token);
      // Normalizar el campo active de 0/1 a boolean
      const normalizedUsers = us.map(user => ({
        ...user,
        active: Boolean(user.active)
      }));
      setUsers(normalizedUsers);
    }
    
    setIsAlertOpen(false);
    setSelectedUser(null);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return (
          <Badge className="bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
            <Shield className="mr-1 w-3 h-3" />
            Admin
          </Badge>
        );
      case 'sucursal':
        return (
          <Badge className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
            <Building2 className="mr-1 w-3 h-3" />
            Sucursal
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
            <User className="mr-1 w-3 h-3" />
            Cliente
          </Badge>
        );
    }
  };

  return (
    <div className="mx-auto px-4 py-8 max-w-7xl container">
      <div className="mb-8">
        <h1 className="font-bold text-primary text-3xl tracking-tight">Gestión de Usuarios</h1>
        <p className="mt-2 text-muted-foreground">
          Administra los usuarios del sistema y controla su acceso
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Usuarios</CardTitle>
          <CardDescription>
            Visualiza todos los usuarios registrados en el sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="border-4 border-gray-200 border-t-primary rounded-full w-12 h-12 animate-spin"></div>
            </div>
          ) : users.length === 0 ? (
            <div className="py-12 text-muted-foreground text-center">
              <p>No hay usuarios registrados</p>
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">ID</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Fecha Registro</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.idUser}>
                      <TableCell className="font-medium">{u.idUser}</TableCell>
                      <TableCell>{u.name}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>{getRoleBadge(u.role)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString('es-MX', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant={u.active ? "default" : "secondary"}
                          className={u.active 
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          }
                        >
                          {u.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          onClick={() => handleToggleStatus(u)}
                          variant={u.active ? "destructive" : "default"}
                          size="sm"
                        >
                          {u.active ? 'Desactivar' : 'Activar'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AlertDialog para confirmar cambio de estado */}
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedUser?.active ? '¿Desactivar usuario?' : '¿Activar usuario?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedUser?.active ? (
                <>
                  Estás a punto de desactivar al usuario <strong>{selectedUser?.name}</strong>.
                  <br /><br />
                  <span className="font-semibold text-destructive">
                    El usuario NO podrá acceder al sistema hasta que sea reactivado.
                  </span>
                  <br />
                  Sus sesiones actuales serán invalidadas y no podrá iniciar sesión.
                </>
              ) : (
                <>
                  Estás a punto de activar al usuario <strong>{selectedUser?.name}</strong>.
                  <br /><br />
                  El usuario podrá acceder nuevamente al sistema.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setIsAlertOpen(false);
              setSelectedUser(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmToggleStatus}
              className={selectedUser?.active 
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" 
                : "bg-green-600 hover:bg-green-700"
              }
            >
              {selectedUser?.active ? 'Desactivar' : 'Activar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminUsersPage;