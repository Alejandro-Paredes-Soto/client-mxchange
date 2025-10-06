"use client";

import { useState } from "react";
import useUtils from "../services/utils";

const useForgotPassword = () => {
  

    const [loading, setLoading] = useState<boolean>(false);
  const [emailR, setEmailR] = useState<string>("");

  const { requestPost } = useUtils();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmailR(e.target.value);
  };

  const handleClick = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (emailR) {
      const isValid = emailRegex.test(emailR);
      if (!isValid) {
      alert("formato de correo no valido")
      } else {
        setLoading(true);

        try {
          const res = await requestPost(
            { email: emailR },
            "/resetpassword/forgotPassword"
          );

          setLoading(false);

          if (res && res.status == 200) {
            alert("correo enviado")
          }
        } catch (error) {
          setLoading(false);
         
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
  };
}

export default useForgotPassword;