"use client";

// Layout para páginas de autenticación (login, registro, forgot password)
// No tiene sidebar ni navegación
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
