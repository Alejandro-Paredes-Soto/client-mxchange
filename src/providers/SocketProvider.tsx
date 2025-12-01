"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { getSocket, closeSocket } from '@/lib/socket';
import Cookies from 'js-cookie';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

type AppNotification = {
  title: string;
  message: string;
  event_type?: string;
  transaction_id?: number | string | null;
  created_at?: string;
  read?: boolean;
};

type SocketContextValue = {
  notifications: AppNotification[];
  unreadCount: number;
  markAllAsRead: () => Promise<void>;
  reloadFromServer: () => Promise<void>;
};

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data: session } = useSession();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000').replace(/\/$/, '');
  // Mapa en memoria para evitar mostrar duplicados en un corto periodo
  const recentKeysRef = useRef<Map<string, number>>(new Map());
  const DEDUP_MS = 5_000; // ventana de deduplicación en ms

  const parseJwt = (token: string) => {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = atob(base64);
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  const getSessionInfo = useCallback(() => {
    const s: any = session || {};
    let userId = s?.idUser || s?.user?.id || s?.id || null;
    let roleRaw = s?.rol || s?.role || s?.user?.role || s?.user?.rol || '';
    let branchId = s?.branch_id || s?.user?.branch_id || null;

    if (!userId || !roleRaw) {
      const token = Cookies.get('token') || '';
      const payload = token ? parseJwt(token) : null;
      if (payload && typeof payload === 'object') {
        userId = userId || (payload as any).idUser || (payload as any).id || (payload as any).userId || (payload as any).user?.id || null;
        roleRaw = roleRaw || (payload as any).rol || (payload as any).role || (payload as any).user?.role || '';
        branchId = branchId || (payload as any).branch_id || (payload as any).user?.branch_id || null;
      }
    }
    const role = String(roleRaw || '').toLowerCase();
    return { userId, role, branchId } as { userId: number | string | null; role: string; branchId: number | string | null };
  }, [session]);

  const reloadFromServer = useCallback(async () => {
    try {
      const { userId, role } = getSessionInfo();

      // CORRECCIÓN: Validar que haya userId O que sea admin O que sea sucursal
      if (!userId && role !== 'admin' && role !== 'sucursal') {
        setNotifications([]);
        return;
      }

      const token = Cookies.get('token') || '';

      if (!token) {
        console.warn('No hay token disponible para cargar notificaciones');
        setNotifications([]);
        return;
      }


      const res = await fetch(`${API_BASE}/notifications`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store'
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Error al cargar notificaciones:', res.status, errorText);
        throw new Error(errorText);
      }

      const j = await res.json();

      const list = Array.isArray(j.notifications) ? j.notifications : [];
      setNotifications(list.map((n: any) => ({
        title: n.title,
        message: n.message,
        event_type: n.event_type,
        transaction_id: n.transaction_id,
        created_at: n.created_at,
        read: !!n.read_at,
      })));
    } catch (e) {
      console.error('Error cargando notificaciones:', e);
    }
  }, [API_BASE, getSessionInfo]);

  useEffect(() => {
    const s = getSocket();

    // Definir handlers como funciones nombradas para poder removerlas después
    const onConnect = () => console.log('Socket connected:', s.id);
    const onDisconnect = () => console.log('Socket disconnected');
    const onConnectError = (err: unknown) => console.error('Socket connect_error:', err);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);

    // Registrar sala con base en la sesión (admin, sucursal o usuario)
    try {
      const { userId, role, branchId } = getSessionInfo();
      if (role === 'admin' || role === 'sucursal' || userId) {
        s.emit('register', { userId, role, branchId });
      }
    } catch (e) {
      console.warn('No se pudo registrar socket con la sesión:', e);
    }

    // Escuchar notificaciones genéricas
    const onNotification = (payload: { title: string; message: string; event_type?: string; transaction_id?: number | string; created_at?: string }) => {
      try {
        const key = payload.transaction_id ? `tx:${payload.transaction_id}` : `note:${payload.title}:${payload.message}`;
        const now = Date.now();
        const last = recentKeysRef.current.get(key) || 0;
        if (now - last < DEDUP_MS) {
          return;
        }
        recentKeysRef.current.set(key, now);

        // Mostrar notificación según el tipo
        if (payload.event_type === 'low_inventory') {
          // Alerta de inventario bajo - usar toast de advertencia o error
          const isCritical = payload.title?.includes('CRÍTICO');
          if (isCritical) {
            toast.error(payload.title || 'Inventario Crítico', {
              description: payload.message || '',
              duration: 10000, // 10 segundos para crítico
            });
          } else {
            toast.warning(payload.title || 'Inventario Bajo', {
              description: payload.message || '',
              duration: 8000, // 8 segundos para bajo
            });
          }
        } else {
          toast.info(payload.title || 'Notificación', {
            description: payload.message || '',
          });
        }

        setNotifications(prev => [{ ...payload, read: false }, ...prev].slice(0, 100));
      } catch (err) {
        console.log('Notification error:', err, payload);
      }
    };
    s.on('notification', onNotification);

    // Fallback: algunos backends emiten 'notifications' (plural) con una lista
    const onNotificationsArray = (payload: unknown) => {
      try {
        if (Array.isArray(payload)) {
          const now = Date.now();
          const toAdd: AppNotification[] = [];
          (payload as unknown[]).forEach((p: unknown) => {
            try {
              const item = p as Partial<AppNotification>;
              const key = item.transaction_id ? `tx:${item.transaction_id}` : `note:${item.title}:${item.message}`;
              const last = recentKeysRef.current.get(key) || 0;
              if (now - last < DEDUP_MS) {
                return; // skip duplicate
              }
              recentKeysRef.current.set(key, now);
              toast.info(item.title || 'Notificación', { description: item.message || '' });
              toAdd.push({ ...(item as AppNotification), read: false });
            } catch { /* noop */ }
          });
          if (toAdd.length > 0) setNotifications(prev => [...toAdd, ...prev].slice(0, 100));
        }
      } catch (e) {
        console.warn('Error procesando notifications array', e);
      }
    };
    s.on('notifications', onNotificationsArray);

    // Escuchar actualizaciones de inventario a nivel global
    // Este evento es principalmente para actualizar la UI en tiempo real (dashboard, inventario)
    // NO muestra notificaciones toast porque las notificaciones específicas llegan vía 'notification'
    const onInventoryUpdated = (payload: unknown) => {
      try {
        // Solo registrar el evento, no mostrar toast ni añadir a notificaciones
        // Las notificaciones específicas llegarán por el evento 'notification'
      } catch (err) {
        console.warn('Error manejando inventory.updated en SocketProvider:', err);
      }
    };
    s.on('inventory.updated', onInventoryUpdated);

    // CLEANUP: Remover TODOS los listeners para evitar memory leaks
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onConnectError);
      s.off('notification', onNotification);
      s.off('notifications', onNotificationsArray);
      s.off('inventory.updated', onInventoryUpdated);
      closeSocket();
    };
  }, [getSessionInfo]);

  // Limpieza periódica del mapa de deduplicación para evitar memory leaks
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      recentKeysRef.current.forEach((timestamp, key) => {
        // Eliminar entradas más antiguas que el doble del tiempo de deduplicación
        if (now - timestamp > DEDUP_MS * 2) {
          recentKeysRef.current.delete(key);
          cleaned++;
        }
      });
      if (cleaned > 0) {
        // console.log(`Limpieza de recentKeys: eliminadas ${cleaned} entradas antiguas`);
      }
    }, 60000); // Cada minuto

    return () => clearInterval(cleanupInterval);
  }, []);

  // Cargar desde servidor al montar/cambiar sesión
  useEffect(() => {
    const { userId, role } = getSessionInfo();
    if (!userId && role !== 'admin') {
      setNotifications([]);
      return;
    }
    reloadFromServer();
  }, [reloadFromServer, getSessionInfo]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const markAllAsRead = useCallback(async () => {
    try {
      const token = Cookies.get('token') || '';

      if (!token) {
        console.error('[markAllAsRead] No hay token disponible');
        return;
      }

      // Primero actualizar el estado local inmediatamente para feedback instantáneo
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));

      // Luego hacer la petición al servidor
      const response = await fetch(`${API_BASE}/notifications/mark-read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });


      if (!response.ok) {
        const errorText = await response.text();
        console.error('[markAllAsRead] Error del servidor:', response.status, errorText);
        // Si falla, revertir el estado local recargando del servidor
        await reloadFromServer();
      } else {
        const data = await response.json();
      }
    } catch (e) {
      console.error('[markAllAsRead] Error:', e);
      // Si hay error, recargar del servidor para mantener sincronía
      await reloadFromServer();
    }
  }, [API_BASE, reloadFromServer]);

  const contextValue = useMemo<SocketContextValue>(
    () => ({ notifications, unreadCount, markAllAsRead, reloadFromServer }),
    [notifications, unreadCount, reloadFromServer, markAllAsRead]
  );

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};

export function useSocket() {
  // Exponemos la instancia del socket directamente
  useContext(SocketContext);
  return getSocket();
}

export function useNotifications() {
  const ctx = useContext(SocketContext);
  if (!ctx) return {
    notifications: [],
    unreadCount: 0,
    markAllAsRead: async () => { },
    reloadFromServer: async () => { }
  } as SocketContextValue;
  return ctx;
}