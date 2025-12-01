"use client";

import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie';

let socket: Socket | null = null;
let debugListenersBound = false;

/**
 * Obtiene o crea la instancia singleton del socket
 * IMPORTANTE: Los listeners de debug solo se agregan una vez para evitar memory leaks
 */
export function getSocket(): Socket {
  if (!socket) {
    const url = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
    const token = (typeof window !== 'undefined') ? Cookies.get('token') : undefined;
    
    socket = io(url, { 
      transports: ['websocket', 'polling'], 
      auth: token ? { token } : undefined,
      // Configuración para evitar reconexiones infinitas y memory leaks
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    // Solo agregar listeners de debug UNA VEZ para evitar memory leaks
    if (!debugListenersBound) {
      debugListenersBound = true;
      
      socket.on('connect_error', (err: unknown) => {
        console.error('Socket connect_error:', err);
      });
      socket.on('connect_timeout', (timeout: unknown) => {
        console.warn('Socket connect_timeout:', timeout);
      });
      socket.on('reconnect_attempt', (attempt: number) => {
        console.info('Socket reconnect_attempt:', attempt);
      });
      socket.on('reconnect_failed', () => {
        console.error('Socket reconnect_failed');
      });
    }
  }
  return socket;
}

/**
 * Cierra el socket y limpia TODOS los listeners para evitar memory leaks
 * IMPORTANTE: Resetea el flag de listeners para permitir reconexión limpia
 */
export function closeSocket() {
  if (socket) {
    // Remover TODOS los listeners antes de desconectar para evitar memory leaks
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    debugListenersBound = false;
  }
}

/**
 * Verifica si el socket está conectado
 */
export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}
