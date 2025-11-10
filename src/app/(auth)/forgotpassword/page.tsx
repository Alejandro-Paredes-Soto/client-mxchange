"use client";

import { Mail } from "lucide-react";
import useForgotPassword from "./useForgotPassword";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const ForgotPassword = () => {
  const { emailR, loading, handleKeyup, handleClick, handleInputChange } =
    useForgotPassword();

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
                  onKeyUp={handleKeyup}
                  onChange={handleInputChange}
                  value={emailR}
                  disabled={loading}
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading || !emailR}
            >
              {loading ? (
                <>
                  <div className="mr-2 border-2 border-white border-t-transparent rounded-full w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar correo"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPassword;