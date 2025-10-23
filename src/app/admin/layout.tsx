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
import { Package, Users, Eye, Settings, BarChart3, LogOut } from "lucide-react";
import { Toaster } from "@/components/ui/sonner"


const menuItems = [
  {
    title: "Dashboard",
    url: "/admin",
    icon: BarChart3,
  },
  {
    title: "Ver Inventario",
    url: "/admin/inventory",
    icon: Package,
  },
  {
    title: "Gestionar Usuarios",
    url: "/admin/users",
    icon: Users,
  },
  {
    title: "Ver Transacciones",
    url: "/admin/transactions",
    icon: Eye,
  },
  {
    title: "Configuración",
    url: "/admin/config",
    icon: Settings,
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    try {
      // Llamada al endpoint de logout en el backend (ajusta la ruta si es necesario)
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      // No bloqueamos la redirección si falla la llamada; log para depuración
      console.error('Logout failed', err);
    } finally {
      router.push('/login');
    }
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 px-4 py-2">
            <h2 className="font-semibold text-lg">Admin Panel</h2>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Accesos Rápidos</SidebarGroupLabel>
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
        </header>
        <div className="flex flex-col flex-1 gap-4 p-4">
          {children}
        </div>
        <Toaster
          position="top-center"
        />
      </SidebarInset>
    </SidebarProvider>
  );
}