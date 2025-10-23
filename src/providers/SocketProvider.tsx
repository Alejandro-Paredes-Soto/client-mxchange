"use client";

import React, { createContext, useContext, useEffect } from 'react';
import { getSocket, closeSocket } from '@/lib/socket';

// Context vacío (por si queremos añadir info más adelante)
const SocketContext = createContext({});

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    const s = getSocket();
    s.on('connect', () => console.log('Socket connected:', s.id));
    s.on('disconnect', () => console.log('Socket disconnected'));

    return () => {
      // cerrar socket al desmontar
      closeSocket();
    };
  }, []);

  return (
    <SocketContext.Provider value={{}}>
      {children}
    </SocketContext.Provider>
  );
};

export function useSocket() {
  // Exponemos la instancia del socket directamente
  useContext(SocketContext);
  return getSocket();
}
