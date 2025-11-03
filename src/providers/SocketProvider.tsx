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
        console.log('No hay sesión válida para cargar notificaciones');
        setNotifications([]);
        return;
      }

      const token = Cookies.get('token') || '';
      
      if (!token) {
        console.warn('No hay token disponible para cargar notificaciones');
        setNotifications([]);
        return;
      }

      console.log('Cargando notificaciones para userId:', userId, 'role:', role);

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
      console.log('Notificaciones recibidas:', j);

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
  s.on('connect', () => console.log('Socket connected:', s.id));
  s.on('disconnect', () => console.log('Socket disconnected'));
  s.on('connect_error', (err: unknown) => console.error('Socket connect_error:', err));

    // Registrar sala con base en la sesión (admin, sucursal o usuario)
    try {
      const { userId, role, branchId } = getSessionInfo();
      console.log('Registrando socket con userId:', userId, 'role:', role, 'branchId:', branchId);
      if (role === 'admin' || role === 'sucursal' || userId) {
        s.emit('register', { userId, role, branchId });
      }
    } catch (e) {
      console.warn('No se pudo registrar socket con la sesión:', e);
    }

    // Escuchar notificaciones genéricas
    const onNotification = (payload: { title: string; message: string; event_type?: string; transaction_id?: number | string; created_at?: string }) => {
      try {
        console.log('Nueva notificación recibida:', payload);
        const key = payload.transaction_id ? `tx:${payload.transaction_id}` : `note:${payload.title}:${payload.message}`;
        const now = Date.now();
        const last = recentKeysRef.current.get(key) || 0;
        if (now - last < DEDUP_MS) {
          console.log('Notificación duplicada ignorada por dedupe:', key);
          return;
        }
        recentKeysRef.current.set(key, now);
        toast.info(payload.title || 'Notificación', {
          description: payload.message || '',
        });
        setNotifications(prev => [{ ...payload, read: false }, ...prev].slice(0, 100));
      } catch (err) {
        console.log('Notification error:', err, payload);
      }
    };
    s.on('notification', onNotification);

    // Fallback: algunos backends emiten 'notifications' (plural) con una lista
    const onNotificationsArray = (payload: unknown) => {
      try {
        console.log('notifications (array) recibidas:', payload);
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

    // Escuchar actualizaciones de inventario a nivel global y mostrar toast cuando venga desde el server
    const onInventoryUpdated = (payload: unknown) => {
      try {
        console.log('inventory.updated global recibido en SocketProvider:', payload);
        if (payload && typeof payload === 'object') {
          const p = payload as any;
          const tx = p.transaction;
          const inv = p.inventory;
          const branchName = p.branch_name || p.branch || `Sucursal ${p.branch_id || ''}`;
          if (tx && tx.transaction_code) {
            const key = `tx:${tx.transaction_code}`;
            const now = Date.now();
            const last = recentKeysRef.current.get(key) || 0;
            if (now - last < DEDUP_MS) {
              console.log('inventory.updated duplicado ignorado por dedupe:', key);
              return;
            }
            recentKeysRef.current.set(key, now);

            // Construir título y mensaje legible
            const title = tx.status === 'reserved' ? `Operación reservada: ${tx.transaction_code}` : `Inventario actualizado`;
            const messageParts: string[] = [];
            if (tx.amount_to && tx.currency_to) {
              messageParts.push(`${tx.amount_to} ${tx.currency_to}`);
            }
            if (tx.amount_from && tx.currency_from) {
              messageParts.push(`Pagos ${tx.amount_from} ${tx.currency_from}`);
            }
            if (branchName) messageParts.push(branchName);
            const message = messageParts.join(' · ');

            // Mostrar un único toast legible
            toast.info(title || 'Inventario', { description: message });

            // Añadir a la lista de notificaciones para el panel
            const notif: AppNotification = {
              title: title,
              message: message,
              event_type: 'inventory.updated',
              transaction_id: tx.transaction_code || tx.id,
              created_at: p.timestamp || tx.created_at || new Date().toISOString(),
              read: false,
            };
            setNotifications(prev => [notif, ...prev].slice(0, 100));
            return;
          }
        }

        // Fallback genérico si no tiene transaction
        const msg = JSON.stringify(payload || {});
        toast('Inventario actualizado', { description: msg.slice(0, 500) });
      } catch (err) {
        console.warn('Error manejando inventory.updated en SocketProvider:', err);
      }
    };
    s.on('inventory.updated', onInventoryUpdated);

    return () => {
      // cerrar socket al desmontar
      try { s.off('notification', onNotification); } catch { }
      closeSocket();
    };
  }, [getSessionInfo]);

  // Cargar desde servidor al montar/cambiar sesión
  useEffect(() => {
    const { userId, role } = getSessionInfo();
    if (!userId && role !== 'admin') {
      setNotifications([]);
      return;
    }
    console.log('Llamando a reloadFromServer...');
    reloadFromServer();
  }, [reloadFromServer, getSessionInfo]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);
  
  const markAllAsRead = useCallback(async () => {
    try {
      const token = Cookies.get('token') || '';
      await fetch(`${API_BASE}/notifications/mark-read`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (e) {
      console.error('Error marcando notificaciones como leídas:', e);
    }
  }, [API_BASE]);

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