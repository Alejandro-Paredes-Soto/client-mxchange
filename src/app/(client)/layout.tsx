"use client";

import { useState } from 'react';
import { SocketProvider, useNotifications } from '@/providers/SocketProvider';
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
import { DollarSign, ArrowLeftRight, History, LogOut, Bell } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

// Componente interno que usa useNotifications
function ClientLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { notifications, unreadCount, markAllAsRead, reloadFromServer } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);

  const menuItems = [
    { title: "Comprar dólares", url: "/inicio?mode=buy", icon: DollarSign },
    { title: "Vender dólares", url: "/inicio?mode=sell", icon: ArrowLeftRight },
    { title: "Mis movimientos", url: "/mis-movimientos", icon: History },
  ];

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout failed', err);
    } finally {
      router.push('/login');
    }
  }

  const handleOpenNotifications = async (open: boolean) => {
    if (open) {
      // Marcar como leídas INMEDIATAMENTE para que el contador desaparezca
      await markAllAsRead();
      console.log('Abriendo notificaciones, recargando...');
      // Luego recargar las notificaciones del servidor
      await reloadFromServer();
    }
    setNotifOpen(open);
  };

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 px-4 py-2">
            <h2
              className="font-semibold text-lg cursor-pointer"
              onClick={() => router.push('/inicio')}
            >
              MXChange
            </h2>
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
              onClick={() => setNotifOpen(true)}
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
