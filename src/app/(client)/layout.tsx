"use client";

import { useState } from 'react';
import { SocketProvider, useNotifications } from '@/providers/SocketProvider';
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import Cookies from 'js-cookie';
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
import { DollarSign, ArrowLeftRight, History, LogOut, Bell } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

// Componente interno que usa useNotifications
function ClientLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { notifications, unreadCount, markAllAsRead, reloadFromServer } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);

  const menuItems = [
    { title: "Comprar dólares", url: "/operacion?mode=buy", icon: DollarSign },
    { title: "Vender dólares", url: "/operacion?mode=sell", icon: ArrowLeftRight },
    { title: "Mis movimientos", url: "/mis-movimientos", icon: History },
  ];

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
    console.log('[CLIENT handleOpenNotifications] open:', open);
    if (open) {
      // Marcar como leídas inmediatamente cuando se abre el panel
      console.log('[CLIENT handleOpenNotifications] Llamando a markAllAsRead...');
      await markAllAsRead();
      console.log('[CLIENT handleOpenNotifications] markAllAsRead completado');
    }
    setNotifOpen(open);
  };

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 px-4 py-2">
            <div
              className="text-center cursor-pointer"
              onClick={() => router.push('/inicio')}
            >
              <h1 className="font-bold text-primary text-xl">
                M<span className="text-secondary text-2xl">X</span>change
              </h1>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menú</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.url}
                    >
                      <Link href={item.url} className="cursor-pointer">
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
          <hr className="mb-4 border-gray-300" />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full text-red-600 hover:text-red-700 text-sm cursor-pointer"
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
              <div className="px-3">
                {notifications.length === 0 ? (
                  <div className="text-gray-500 text-sm">No hay notificaciones.</div>
                ) : (
                  <ul className="gap-2 grid">
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
      </SidebarInset>
    </SidebarProvider>
  );
}

// Layout principal para clientes
export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SocketProvider>
      <ClientLayoutContent>{children}</ClientLayoutContent>
    </SocketProvider>
  );
}
