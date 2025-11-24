"use client";

import { useState } from "react";
import useUtils from "../../services/utils";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";

const useResetPassword = (token: string | null) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);
  const { requestPost } = useUtils();
  const { toast } = useToast();
  const router = useRouter();

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
  };

  const handleResetPassword = async () => {
    // Validaciones
    if (!token) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Token no válido. Por favor solicita un nuevo enlace.",
      });
      return;
    }

    if (!password || !confirmPassword) {
      toast({
        variant: "destructive",
        title: "Error de validación",
        description: "Por favor completa todos los campos",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        variant: "destructive",
        title: "Error de validación",
        description: "La contraseña debe tener al menos 6 caracteres",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Error de validación",
        description: "Las contraseñas no coinciden",
      });
      return;
    }

    setLoading(true);

    try {
      const res = await requestPost(
        { token, newPassword: password },
        "/auth/reset-password"
      );

      setLoading(false);

      if (res && res.status === 200) {
        setSuccess(true);
        toast({
          title: "¡Contraseña actualizada!",
          description: "Tu contraseña ha sido restablecida exitosamente",
        });
        
        // Redirigir al login después de 2 segundos
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      }
    } catch (error: any) {
      setLoading(false);
      const errorMsg = error?.response?.data?.message || "Error al restablecer la contraseña";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMsg,
      });
    }
  };

  const handleKeyup = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (password && confirmPassword && e.key === "Enter") {
      handleResetPassword();
    }
  };

  return {
    loading,
    password,
    confirmPassword,
    success,
    handlePasswordChange,
    handleConfirmPasswordChange,
    handleResetPassword,
    handleKeyup,
  };
};

export default useResetPassword;
