"use client";

import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
    console.log('Initializing socket.io-client to', url);
  const token = (typeof window !== 'undefined') ? Cookies.get('token') : undefined;
  socket = io(url, { transports: ['websocket', 'polling'], auth: token ? { token } : undefined });

    // Add helpful debug listeners so the app logs connection issues to the browser console
    try {
      socket.on('connect_error', (err: unknown) => {
        console.error('Socket connect_error:', err);
      });
      socket.on('connect_timeout', (timeout) => {
        console.warn('Socket connect_timeout:', timeout);
      });
      socket.on('reconnect_attempt', (attempt) => {
        console.info('Socket reconnect_attempt:', attempt);
      });
      socket.on('reconnect_failed', () => {
        console.error('Socket reconnect_failed');
      });
    } catch (e) {
      // ignore if socket handlers can't be attached for some reason
      // (safety for SSR or edge cases)
      console.warn('Could not attach debug listeners to socket', e);
    }
  }
  return socket;
}

export function closeSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
