"use client";

import { useState } from "react";
import useUtils from "../../services/utils";
import { useToast } from "@/components/ui/use-toast";

const useForgotPassword = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [emailR, setEmailR] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);
  const { requestPost } = useUtils();
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmailR(e.target.value);
  };

  const handleClick = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (emailR) {
      const isValid = emailRegex.test(emailR);
      if (!isValid) {
        toast({
          variant: "destructive",
          title: "Error de validación",
          description: "Por favor ingresa un formato de correo válido",
        });
      } else {
        setLoading(true);

        try {
          const res = await requestPost(
            { email: emailR },
            "/auth/forgot-password"
          );

          setLoading(false);

          if (res && res.status == 200) {
            setSuccess(true);
            toast({
              title: "Correo enviado",
              description: "Si el correo existe, recibirás un enlace para restablecer tu contraseña",
            });
            setEmailR("");
          }
        } catch (error: any) {
          setLoading(false);
          const errorMsg = error?.response?.data?.message || "Error al enviar el correo";
          toast({
            variant: "destructive",
            title: "Error",
            description: errorMsg,
          });
        }
      }
    }
  };

  const handleKeyup = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (emailR && e.key === "Enter") {
      handleClick();
    }
  };

  return {
    loading,
    handleInputChange,
    emailR,
    handleClick,
    handleKeyup,
    success,
  };
}

export default useForgotPassword;