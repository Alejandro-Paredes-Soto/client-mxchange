"use client";

import { SessionProvider } from "next-auth/react";
import "./globals.css";
import { SocketProvider } from '@/providers/SocketProvider';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <SocketProvider>{children}</SocketProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
