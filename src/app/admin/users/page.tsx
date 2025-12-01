"use client";
import React, { useEffect, useState } from 'react';
import { getAdminUsers, AdminUser, toggleUserStatus, updateUserRole, getAdminBranches, createAdminUser } from '../../services/api';
import Cookies from 'js-cookie';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Label } from '../../../components/ui/label';
import { Shield, User, Building2, UserCog, Plus, Eye, EyeOff } from 'lucide-react';

const AdminUsersPage = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<{ id: number; name: string; active: boolean } | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [roleUser, setRoleUser] = useState<{ id: number; name: string; currentRole: string; currentBranchId?: number | null } | null>(null);
  const [newRole, setNewRole] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [branches, setBranches] = useState<{ id: number; name: string; address: string; city: string; state: string }[]>([]);
  
  // Estados para el modal de crear usuario
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'client',
    branch_id: ''
  });

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) return;
    (async () => {
      setLoading(true);
      const [us, br] = await Promise.all([
        getAdminUsers(token),
        getAdminBranches(token)
      ]);
      // Normalizar el campo active de 0/1 a boolean
      const normalizedUsers = us.map(user => ({
        ...user,
        active: Boolean(user.active)
      }));
      setUsers(normalizedUsers);
      setBranches(br);
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

  const handleChangeRole = (user: AdminUser) => {
    setRoleUser({
      id: user.idUser,
      name: user.name,
      currentRole: user.role,
      currentBranchId: user.branch_id
    });
    setNewRole(user.role);
    setSelectedBranchId(user.branch_id ? String(user.branch_id) : '');
    setIsRoleDialogOpen(true);
  };

  const confirmChangeRole = async () => {
    if (!roleUser || !newRole) return;

    const token = Cookies.get('token');
    if (!token) return;

    // Validar que si el rol es sucursal, se haya seleccionado una sucursal
    if (newRole === 'sucursal' && !selectedBranchId) {
      toast.error('Debes seleccionar una sucursal');
      return;
    }

    const branchId = newRole === 'sucursal' ? parseInt(selectedBranchId) : null;
    const result = await updateUserRole(roleUser.id, newRole, branchId, token);

    if (result && result.error) {
      toast.error('Error al cambiar el rol del usuario');
    } else {
      const roleName = newRole === 'admin' ? 'Administrador' : newRole === 'sucursal' ? 'Sucursal' : 'Cliente';
      const branchName = newRole === 'sucursal' && selectedBranchId
        ? ` en ${branches.find(b => b.id === parseInt(selectedBranchId))?.name}`
        : '';
      toast.success(`Rol de ${roleUser.name} cambiado a ${roleName}${branchName}`);

      const us = await getAdminUsers(token);
      const normalizedUsers = us.map(user => ({
        ...user,
        active: Boolean(user.active)
      }));
      setUsers(normalizedUsers);
    }

    setIsRoleDialogOpen(false);
    setRoleUser(null);
    setNewRole('');
    setSelectedBranchId('');
  };

  const handleCreateUser = async () => {
    const token = Cookies.get('token');
    if (!token) return;

    // Validaciones
    if (!newUser.name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    if (!newUser.email.trim()) {
      toast.error('El correo electrónico es requerido');
      return;
    }
    if (!newUser.password.trim()) {
      toast.error('La contraseña es requerida');
      return;
    }
    if (newUser.password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (newUser.role === 'sucursal' && !newUser.branch_id) {
      toast.error('Debes seleccionar una sucursal');
      return;
    }

    setIsCreating(true);

    const userData = {
      name: newUser.name.trim(),
      email: newUser.email.trim().toLowerCase(),
      password: newUser.password,
      role: newUser.role,
      branch_id: newUser.role === 'sucursal' ? parseInt(newUser.branch_id) : null
    };

    const result = await createAdminUser(userData, token);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Usuario ${newUser.name} creado correctamente`);
      
      // Recargar la lista de usuarios
      const us = await getAdminUsers(token);
      const normalizedUsers = us.map(user => ({
        ...user,
        active: Boolean(user.active)
      }));
      setUsers(normalizedUsers);
      
      // Cerrar modal y limpiar formulario
      setIsCreateDialogOpen(false);
      setNewUser({
        name: '',
        email: '',
        password: '',
        role: 'client',
        branch_id: ''
      });
      setShowPassword(false);
    }

    setIsCreating(false);
  };

  const resetCreateForm = () => {
    setNewUser({
      name: '',
      email: '',
      password: '',
      role: 'client',
      branch_id: ''
    });
    setShowPassword(false);
    setIsCreateDialogOpen(false);
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
    <div className="mx-auto px-4 py-8 max-w-6xl container">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="font-bold text-primary text-3xl tracking-tight">Gestión de Usuarios</h1>
          <p className="mt-2 text-muted-foreground">
            Administra los usuarios del sistema y controla su acceso
          </p>
        </div>
        <Button 
          onClick={() => setIsCreateDialogOpen(true)}
          className="cursor-pointer"
        >
          <Plus className="mr-2 w-4 h-4" />
          Agregar Usuario
        </Button>
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
                    <TableHead>Sucursal</TableHead>
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
                        {u.role === 'sucursal' && u.branch_id
                          ? branches.find(b => b.id === u.branch_id)?.name || 'N/A'
                          : '-'
                        }
                      </TableCell>
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
                        <div className="flex justify-end gap-2">
                          <Button
                            onClick={() => handleChangeRole(u)}
                            variant="outline"
                            size="sm"
                            className='cursor-pointer'
                          >
                            <UserCog className="mr-1 w-4 h-4" />
                            Cambiar Rol
                          </Button>
                          <Button
                            onClick={() => handleToggleStatus(u)}
                            className={`cursor-pointer ${u.active ? 'text-white' : ''}`}
                            variant={u.active ? "destructive" : "default"}
                            size="sm"
                          >
                            {u.active ? 'Desactivar' : 'Activar'}
                          </Button>
                        </div>
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

      {/* Dialog para cambiar rol */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Cambiar Rol de Usuario</DialogTitle>
            <DialogDescription>
              Modifica el rol de <strong>{roleUser?.name}</strong> en el sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="gap-4 grid py-4">
            <div className="gap-2 grid">
              <Label htmlFor="role">Rol</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger id="role">
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">
                    <div className="flex items-center">
                      <User className="mr-2 w-4 h-4" />
                      Cliente
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center">
                      <Shield className="mr-2 w-4 h-4" />
                      Administrador
                    </div>
                  </SelectItem>
                  <SelectItem value="sucursal">
                    <div className="flex items-center">
                      <Building2 className="mr-2 w-4 h-4" />
                      Sucursal
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newRole === 'sucursal' && (
              <div className="gap-2 grid">
                <Label htmlFor="branch">Sucursal Asignada</Label>
                <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                  <SelectTrigger id="branch">
                    <SelectValue placeholder="Selecciona una sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.length === 0 ? (
                      <div className="px-2 py-1 text-muted-foreground text-sm">
                        No hay sucursales disponibles
                      </div>
                    ) : (
                      branches.map((branch) => (
                        <SelectItem key={branch.id} value={String(branch.id)}>
                          {branch.name} - {branch.city}, {branch.state}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {newRole === 'admin' && (
              <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md">
                <p className="text-blue-900 dark:text-blue-200 text-sm">
                  <Shield className="inline mr-1 w-4 h-4" />
                  Los administradores tienen acceso completo al sistema.
                </p>
              </div>
            )}

            {newRole === 'client' && (
              <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-md">
                <p className="text-gray-700 dark:text-gray-300 text-sm">
                  <User className="inline mr-1 w-4 h-4" />
                  Los clientes solo pueden gestionar sus propias transacciones.
                </p>
              </div>
            )}

            {newRole === 'sucursal' && (
              <div className="bg-purple-50 dark:bg-purple-950 p-3 rounded-md">
                <p className="text-purple-900 dark:text-purple-200 text-sm">
                  <Building2 className="inline mr-1 w-4 h-4" />
                  El usuario de sucursal podrá gestionar inventario y transacciones de la sucursal asignada.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className='cursor-pointer'
              onClick={() => {
                setIsRoleDialogOpen(false);
                setRoleUser(null);
                setNewRole('');
                setSelectedBranchId('');
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmChangeRole}
              disabled={newRole === 'sucursal' && !selectedBranchId}
              className='cursor-pointer'
            >
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para crear nuevo usuario */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Agregar Nuevo Usuario</DialogTitle>
            <DialogDescription>
              Crea un nuevo usuario en el sistema. Completa todos los campos requeridos.
            </DialogDescription>
          </DialogHeader>
          <div className="gap-4 grid py-4">
            <div className="gap-2 grid">
              <Label htmlFor="new-name">Nombre completo</Label>
              <Input
                id="new-name"
                placeholder="Juan Pérez"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
            </div>

            <div className="gap-2 grid">
              <Label htmlFor="new-email">Correo electrónico</Label>
              <Input
                id="new-email"
                type="email"
                placeholder="juan@ejemplo.com"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
            </div>

            <div className="gap-2 grid">
              <Label htmlFor="new-password">Contraseña</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="right-3 absolute inset-y-0 flex items-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="gap-2 grid">
              <Label htmlFor="new-role">Rol</Label>
              <Select 
                value={newUser.role} 
                onValueChange={(value) => setNewUser({ ...newUser, role: value, branch_id: '' })}
              >
                <SelectTrigger id="new-role">
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">
                    <div className="flex items-center">
                      <User className="mr-2 w-4 h-4" />
                      Cliente
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center">
                      <Shield className="mr-2 w-4 h-4" />
                      Administrador
                    </div>
                  </SelectItem>
                  <SelectItem value="sucursal">
                    <div className="flex items-center">
                      <Building2 className="mr-2 w-4 h-4" />
                      Sucursal
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newUser.role === 'sucursal' && (
              <div className="gap-2 grid">
                <Label htmlFor="new-branch">Sucursal Asignada</Label>
                <Select value={newUser.branch_id} onValueChange={(value) => setNewUser({ ...newUser, branch_id: value })}>
                  <SelectTrigger id="new-branch">
                    <SelectValue placeholder="Selecciona una sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.length === 0 ? (
                      <div className="px-2 py-1 text-muted-foreground text-sm">
                        No hay sucursales disponibles
                      </div>
                    ) : (
                      branches.map((branch) => (
                        <SelectItem key={branch.id} value={String(branch.id)}>
                          {branch.name} - {branch.city}, {branch.state}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {newUser.role === 'admin' && (
              <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md">
                <p className="text-blue-900 dark:text-blue-200 text-sm">
                  <Shield className="inline mr-1 w-4 h-4" />
                  Los administradores tienen acceso completo al sistema.
                </p>
              </div>
            )}

            {newUser.role === 'client' && (
              <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-md">
                <p className="text-gray-700 dark:text-gray-300 text-sm">
                  <User className="inline mr-1 w-4 h-4" />
                  Los clientes solo pueden gestionar sus propias transacciones.
                </p>
              </div>
            )}

            {newUser.role === 'sucursal' && (
              <div className="bg-purple-50 dark:bg-purple-950 p-3 rounded-md">
                <p className="text-purple-900 dark:text-purple-200 text-sm">
                  <Building2 className="inline mr-1 w-4 h-4" />
                  El usuario de sucursal podrá gestionar inventario y transacciones de la sucursal asignada.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className='cursor-pointer'
              onClick={resetCreateForm}
              disabled={isCreating}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateUser}
              disabled={isCreating || (newUser.role === 'sucursal' && !newUser.branch_id)}
              className='cursor-pointer'
            >
              {isCreating ? (
                <>
                  <div className="mr-2 border-2 border-white border-t-transparent rounded-full w-4 h-4 animate-spin"></div>
                  Creando...
                </>
              ) : (
                <>
                  <Plus className="mr-2 w-4 h-4" />
                  Crear Usuario
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsersPage;