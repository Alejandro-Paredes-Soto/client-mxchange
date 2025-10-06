"use client";

import { FormEvent, useEffect, useState } from "react";
import useUtils from "../services/utils";
import { signIn } from "next-auth/react";

type OperationType = "buyUsd" | "sellUsd" | "buyMxn" | "sellMxn";

interface Rates {
  buyUsd: number;
  sellUsd: number;
  buyMxn: number;
  sellMxn: number;
}

const useLogin = () => {
    const { requestPost } = useUtils();
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
        const response = await requestPost(login, "/user/login");
        if (response.status == 200) {
            console.log(response);
            setLoadingLogin(false);
            window.location.href = "/inicio";
        }

     } catch (error) {
        setLoadingLogin(false);
        return;
     }
  }

const onSubmitRegister = async (event: FormEvent<HTMLFormElement>) => {
     event.preventDefault();

     try {
         
       setLoadingRegister(true);
        const response = await requestPost(dataRegister, "/user/register");
        console.log(response);
        if (response.status == 200){
            setLoadingRegister(false);
           alert("registrado")
        }

     } catch (error) {
        setLoadingRegister(false);
        return;
     }
  }


  const handleLoginGoogle = async () => {
      setLoadingGoogle(true);
    document.cookie = "mode=login; path=/";

    await signIn("google");
    setLoadingGoogle(true);

    localStorage.setItem("authGoogle", "true");
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