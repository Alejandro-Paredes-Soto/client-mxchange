"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Package, Users, Eye, Settings, BarChart3, LogOut, Search, Bell } from "lucide-react";
import { useNotifications, SocketProvider } from '@/providers/SocketProvider';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useState, useEffect } from "react";
import Cookies from 'js-cookie';
import { signOut } from "next-auth/react";

const menuItems = [
  {
    title: "Dashboard",
    url: "/admin",
    icon: BarChart3,
    roles: ['admin', 'sucursal'], // Ambos roles pueden ver
  },
  {
    title: "Ver Inventario",
    url: "/admin/inventory",
    icon: Package,
    roles: ['admin', 'sucursal'],
  },
  {
    title: "Gestionar Usuarios",
    url: "/admin/users",
    icon: Users,
    roles: ['admin', 'sucursal'],
  },
  {
    title: "Ver Transacciones",
    url: "/admin/transactions",
    icon: Eye,
    roles: ['admin', 'sucursal'],
  },
  {
    title: "Buscar Transacción",
    url: "/admin/transactions/lookup",
    icon: Search,
    roles: ['admin', 'sucursal'],
  },
  {
    title: "Configuración",
    url: "/admin/config",
    icon: Settings,
    roles: ['admin'], // Solo admin puede ver
  },
];

// Componente interno que SÍ puede usar useNotifications
function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { notifications, unreadCount, markAllAsRead, reloadFromServer } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    // Decodificar el token para obtener el rol del usuario
    const token = Cookies.get('token');
    if (token) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          setUserRole(payload.role || null);
        }
      } catch (err) {
        console.error('Error decoding token:', err);
      }
    }
  }, []);

  console.log('[ADMIN] notifications:', notifications);
  console.log('[ADMIN] unreadCount:', unreadCount);
  console.log('[ADMIN] userRole:', userRole);

  async function handleLogout() {
    try {
      // Limpia tu token custom y storage primero (usado por el backend/middleware)
      Cookies.remove('token', { path: '/' });
      if (typeof window !== 'undefined') localStorage.clear();

      // Cierra la sesión de NextAuth y redirige al login
      await signOut({ callbackUrl: '/login' });
    } catch (err) {
      console.error('Logout failed', err);
      // Fallback de navegación si algo falla
      router.push('/login');
    }
  }

  const handleOpenNotifications = async (open: boolean) => {
    console.log('[handleOpenNotifications] open:', open);
    if (open) {
      // Marcar como leídas inmediatamente cuando se abre el panel
      console.log('[handleOpenNotifications] Llamando a markAllAsRead...');
      await markAllAsRead();
      console.log('[handleOpenNotifications] markAllAsRead completado');
    }
    setNotifOpen(open);
  };

  // Filtrar elementos del menú según el rol del usuario
  const filteredMenuItems = menuItems.filter(item => {
    if (!userRole) return false;
    return item.roles.includes(userRole);
  });

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 px-4 py-2">
            <h2 className="font-semibold text-primary text-lg">Admin Panel</h2>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Accesos Rápidos</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredMenuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.url}
                    >
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <div className="mt-auto px-4 py-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full text-red-600 hover:text-red-700 text-sm"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Cerrar sesión</span>
                </button>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </Sidebar>
      <SidebarInset>
        <header className="flex items-center gap-2 px-4 border-b h-16 shrink-0">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1" />
          <Sheet open={notifOpen} onOpenChange={handleOpenNotifications}>
            <button
              aria-label="Notificaciones"
              className="relative hover:bg-gray-100 p-2 rounded-md"
              title="Notificaciones"
              type="button"
              onClick={() => handleOpenNotifications(true)}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="-top-1 -right-1 absolute flex justify-center items-center bg-red-500 px-1 rounded-full min-w-5 h-5 text-white text-xs">
                  {unreadCount}
                </span>
              )}
            </button>
            <SheetContent side="right" className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Notificaciones</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                {notifications.length === 0 ? (
                  <div className="text-gray-500 text-sm">No hay notificaciones.</div>
                ) : (
                  <ul className="space-y-2">
                    {notifications.map((n, idx) => (
                      <li 
                        key={idx} 
                        className={`border rounded p-3 ${n.read ? 'bg-white' : 'bg-blue-50'}`}
                      >
                        <div className="font-medium text-sm">{n.title}</div>
                        <div className="text-gray-600 text-xs">{n.message}</div>
                        {n.created_at && (
                          <div className="mt-1 text-[10px] text-gray-400">
                            {new Date(n.created_at).toLocaleString('es-MX')}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </header>
        <div className="flex flex-col flex-1 gap-4 p-4">
          {children}
        </div>
        {/* Toaster provided at root layout to avoid duplicates */}
      </SidebarInset>
    </SidebarProvider>
  );
}

// Layout principal que envuelve con los providers
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Proveer socket específico para el área de admin (separado del provider root)
    <SocketProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </SocketProvider>
  );
}