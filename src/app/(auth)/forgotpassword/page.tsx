"use client";

import { Mail, CheckCircle2, Lock } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import useForgotPassword from "./useForgotPassword";
import useResetPassword from "./useResetPassword";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

const ForgotPasswordContent = () => {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const { 
    emailR, 
    loading: forgotLoading, 
    handleKeyup: forgotKeyup, 
    handleClick, 
    handleInputChange, 
    success: forgotSuccess 
  } = useForgotPassword();

  const {
    password,
    confirmPassword,
    loading: resetLoading,
    success: resetSuccess,
    handlePasswordChange,
    handleConfirmPasswordChange,
    handleResetPassword,
    handleKeyup: resetKeyup,
  } = useResetPassword(token);

  // Si hay un token en la URL, mostrar formulario de reset password
  if (token) {
    return (
      <div className="flex justify-center items-center p-4 w-full min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="font-bold text-2xl text-center">
              Restablecer Contraseña
            </CardTitle>
            <CardDescription className="text-center">
              Ingresa tu nueva contraseña
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resetSuccess ? (
              <div className="space-y-4">
                <Alert className="bg-green-50 border-green-500">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    ¡Contraseña actualizada exitosamente! Redirigiendo al inicio de sesión...
                  </AlertDescription>
                </Alert>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleResetPassword();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="password">Nueva Contraseña</Label>
                  <div className="relative">
                    <Lock className="top-3 left-3 absolute w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      className="pl-10"
                      onChange={handlePasswordChange}
                      value={password}
                      disabled={resetLoading}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
                  <div className="relative">
                    <Lock className="top-3 left-3 absolute w-4 h-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Confirma tu contraseña"
                      className="pl-10"
                      onKeyUp={resetKeyup}
                      onChange={handleConfirmPasswordChange}
                      value={confirmPassword}
                      disabled={resetLoading}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={resetLoading || !password || !confirmPassword}
                >
                  {resetLoading ? (
                    <>
                      <div className="mr-2 border-2 border-white border-t-transparent rounded-full w-4 h-4 animate-spin" />
                      Actualizando...
                    </>
                  ) : (
                    "Restablecer Contraseña"
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Si no hay token, mostrar formulario de forgot password
  return (
    <div className="flex justify-center items-center p-4 w-full min-h-screen">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="font-bold text-2xl text-center">
            ¿Olvidaste tu contraseña?
          </CardTitle>
          <CardDescription className="text-center">
            Te enviaremos un correo con instrucciones para recuperarla
          </CardDescription>
        </CardHeader>
        <CardContent>
          {forgotSuccess ? (
            <div className="space-y-4">
              <Alert className="bg-green-50 border-green-500">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Correo enviado exitosamente. Revisa tu bandeja de entrada y la carpeta de spam.
                </AlertDescription>
              </Alert>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                className="w-full"
              >
                Enviar otro correo
              </Button>
              <Button
                asChild
                className="w-full"
              >
                <Link href="/login">Volver al inicio de sesión</Link>
              </Button>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleClick();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <div className="relative">
                  <Mail className="top-3 left-3 absolute w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="correo@ejemplo.com"
                    className="pl-10"
                    onKeyUp={forgotKeyup}
                    onChange={handleInputChange}
                    value={emailR}
                    disabled={forgotLoading}
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={forgotLoading || !emailR}
              >
                {forgotLoading ? (
                  <>
                    <div className="mr-2 border-2 border-white border-t-transparent rounded-full w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar correo"
                )}
              </Button>
              <div className="text-center">
                <Link 
                  href="/login" 
                  className="text-muted-foreground hover:text-primary text-sm"
                >
                  Volver al inicio de sesión
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const ForgotPassword = () => {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center p-4 w-full min-h-screen">
        <Card className="w-full max-w-md">
          <CardContent className="p-8">
            <div className="flex justify-center">
              <div className="border-4 border-gray-300 border-t-primary rounded-full w-8 h-8 animate-spin" />
            </div>
          </CardContent>
        </Card>
      </div>
    }>
      <ForgotPasswordContent />
    </Suspense>
  );
};

export default ForgotPassword;