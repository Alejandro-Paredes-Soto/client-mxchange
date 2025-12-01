"use client";

import { FormEvent, useEffect, useState } from "react";
import useUtils from "../../services/utils";
import { signIn } from "next-auth/react";
import Cookies from 'js-cookie';
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type OperationType = "buyUsd" | "sellUsd" | "buyMxn" | "sellMxn";

interface Rates {
  buyUsd: number;
  sellUsd: number;
  buyMxn: number;
  sellMxn: number;
}

const useLogin = () => {
    const { requestPost } = useUtils();
    const router = useRouter();
   const [activeForm, setActiveForm] = useState<"login" | "register">("login");

     const [rates, setRates] = useState<Rates>({
    buyUsd: 17.5,
    sellUsd: 18.2,
    buyMxn: 0.055,
    sellMxn: 0.057,
  });

  const [currentOperation, setCurrentOperation] = useState<OperationType>("buyUsd");
  const [inputValue, setInputValue] = useState<number>(0);
  const [outputValue, setOutputValue] = useState<string>("0");
  const [login, setLogin] = useState({
    email: "",
    password: ""
  })

  const [dataRegister, setDataRegister] = useState({
    name: "",
    email: "",
    password: ""
  })
  const [loadingLogin, setLoadingLogin] = useState<boolean>(false);
  const [loadingGoogle, setLoadingGoogle] = useState<boolean>(false);

   const [loadingRegister, setLoadingRegister] = useState<boolean>(false);
  // Mapeo de configuraciones por operación
  const operationConfigs = {
    buyUsd: { text: "Comprando USD con MXN", inputCur: "MXN", outputCur: "USD" },
    sellUsd: { text: "Vendiendo USD por MXN", inputCur: "USD", outputCur: "MXN" },
    buyMxn: { text: "Comprando MXN con USD", inputCur: "USD", outputCur: "MXN" },
    sellMxn: { text: "Vendiendo MXN por USD", inputCur: "MXN", outputCur: "USD" },
  };

  const config = operationConfigs[currentOperation];

  // Actualizar conversión
  useEffect(() => {
    let result = 0;
    switch (currentOperation) {
      case "buyUsd":
        result = inputValue / rates.sellUsd;
        break;
      case "sellUsd":
        result = inputValue * rates.buyUsd;
        break;
      case "buyMxn":
        result = inputValue / rates.sellMxn;
        break;
      case "sellMxn":
        result = inputValue * rates.buyMxn;
        break;
    }
    setOutputValue(result.toFixed(currentOperation.includes("Mxn") ? 4 : 2));
  }, [inputValue, currentOperation, rates]);

  // Simular actualización de tasas en tiempo real
  useEffect(() => {
    const interval = setInterval(() => {
      const fluctuation = (Math.random() - 0.5) * 0.2;
      const newBuyUsd = Math.max(17.3, Math.min(17.7, 17.5 + fluctuation));
      let newSellUsd = Math.max(18.0, Math.min(18.4, 18.2 + fluctuation));

      if (newSellUsd - newBuyUsd < 0.5) {
        newSellUsd = newBuyUsd + 0.7;
      }

      const newBuyMxn = 1 / newSellUsd;
      const newSellMxn = 1 / newBuyUsd;

      setRates({
        buyUsd: newBuyUsd,
        sellUsd: newSellUsd,
        buyMxn: newBuyMxn,
        sellMxn: newSellMxn,
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Animación simple de símbolos (opcional)
  useEffect(() => {
    const symbols = document.querySelectorAll(".currency-symbol");
    const interval = setInterval(() => {
      symbols.forEach((symbol, index) => {
        setTimeout(() => {
          (symbol as HTMLElement).style.transform = "scale(1.2)";
          setTimeout(() => {
            (symbol as HTMLElement).style.transform = "scale(1)";
          }, 200);
        }, index * 100);
      });
    }, 6000);
    return () => clearInterval(interval);
  }, []);


  const handleOnchangeLogin = (event: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = event.target;
      setLogin((prev) => ({
        ...prev,
        [name]: value
      }))
  }

   const handleOnchangeRegister = (event: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = event.target;
      setDataRegister((prev) => ({
        ...prev,
        [name]: value
      }))
  }

  const onSubmitLogin = async (event: FormEvent<HTMLFormElement>) => {
     event.preventDefault();

     try {
         
        setLoadingLogin(true);
    const response = await requestPost(login, "/auth/login");
    if (response?.status === 200) {
      // save token if present
      const token = response.data?.token;
      if (token) Cookies.set('token', token, { path: '/' });
      const user = response.data?.user;
      toast.success("¡Bienvenido de nuevo!");
      // Redirigir a admin si es admin o sucursal
      if (user?.role === 'admin' || user?.role === 'sucursal') {
        window.location.href = "/admin";
      } else {
        window.location.href = "/inicio";
      }
     
      setLoadingLogin(false);
    }

     } catch (error: any) {
        setLoadingLogin(false);
        const errorMessage = error?.response?.data?.message || 'Error al iniciar sesión. Verifica tus credenciales.';
        toast.error(errorMessage);
        return;
     }
  }

const onSubmitRegister = async (event: FormEvent<HTMLFormElement>) => {
     event.preventDefault();

     try {
       setLoadingRegister(true);
       const response = await requestPost(dataRegister, "/auth/register");
  

       if (response?.status === 201 || response?.status === 200){
         // If backend returned a token on registration, use it and redirect
         const tokenFromRegister = response.data?.token;
         if (tokenFromRegister) {
           Cookies.set('token', tokenFromRegister);
           toast.success("¡Registro exitoso! Bienvenido a MXange");
           setLoadingRegister(false);
           window.location.href = "/inicio";
           return;
         }

         // Otherwise, try to login automatically using the provided credentials
         try {
           const loginResp = await requestPost({ email: dataRegister.email, password: dataRegister.password }, "/auth/login");
           if (loginResp?.status === 200) {
             const token = loginResp.data?.token;
             if (token) Cookies.set('token', token);
             toast.success("¡Registro exitoso! Bienvenido a MXange");
             setLoadingRegister(false);
             window.location.href = "/inicio";
             return;
           }
         } catch (loginError) {
           // If auto-login fails, keep the user on the page and show a message
           toast.warning("Registro exitoso pero no se pudo iniciar sesión automáticamente. Por favor inicia sesión.");
           console.error(loginError);
         }

         setLoadingRegister(false);
       }

     } catch (error: any) {
        setLoadingRegister(false);
        console.error(error);
        const errorMessage = error?.response?.data?.message || 'Error al registrar. Inténtalo de nuevo.';
        const authProvider = error?.response?.data?.authProvider;
        
        // Mostrar mensaje específico según el proveedor de autenticación
        if (authProvider === 'google') {
          toast.error(errorMessage, {
            description: "Usa el botón 'Continuar con Google' para iniciar sesión."
          });
        } else if (authProvider === 'email') {
          toast.error(errorMessage, {
            description: "Usa el formulario de inicio de sesión con tu correo y contraseña."
          });
        } else {
          toast.error(errorMessage);
        }
        return;
     }
  }


  const handleLoginGoogle = async () => {
    try {
      setLoadingGoogle(true);
      
      // Establecer la bandera en localStorage para que inicio/page.tsx sepa que es login de Google
      localStorage.setItem("authGoogle", "true");
      
      // Guardar el action (login o register) en una cookie para que NextAuth lo use
      // Las cookies son accesibles desde el servidor (a diferencia de localStorage)
      const googleAction = activeForm === 'register' ? 'register' : 'login';
      Cookies.set('googleAuthAction', googleAction, { path: '/', expires: 1/24 }); // Expira en 1 hora

      // Dejar que NextAuth maneje la redirección automáticamente
      await signIn("google", { callbackUrl: "/inicio" });
      
    } catch (error: any) {
      setLoadingGoogle(false);
      const errorMessage = error?.message || 'Error al iniciar sesión con Google.';
      toast.error(errorMessage);
      localStorage.removeItem("authGoogle");
      Cookies.remove('googleAuthAction');
    }
  }

   return {
    activeForm,
    loadingLogin,
    loadingGoogle,
    loadingRegister,
    setActiveForm,
    handleOnchangeLogin,
    onSubmitLogin,
    handleLoginGoogle,
    handleOnchangeRegister,
    onSubmitRegister
   }
}

export default useLogin;