"use client";

import { SessionProvider } from "next-auth/react";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <SessionProvider>
          {children}
        </SessionProvider>
        <Toaster 
          position="top-center"
          toastOptions={{ duration: 4000 }}
          expand={true}
          closeButton
          theme="light"
          
        />
      </body>
    </html>
  );
}