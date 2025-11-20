/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import useUtils from "../../services/utils";
import useLogin from "./useLogin";
import { getRates } from '../../services/api';
import { FcGoogle } from "react-icons/fc";
import { MdAutorenew } from "react-icons/md";
import { NumberInput } from '@/components/ui/number-input';
import { toast } from "sonner";


const Login = () => {

  const searchParams = useSearchParams();
  
  const { activeForm,
    loadingLogin,
    loadingGoogle,
    loadingRegister,
    handleLoginGoogle,
    setActiveForm,
    handleOnchangeLogin,
    handleOnchangeRegister,
    onSubmitRegister,
    onSubmitLogin } = useLogin();

  const { onRouterLink } = useUtils();

  const [rates, setRates] = useState({ buy: 17.5, sell: 18.2 });
  const [operation, setOperation] = useState('buyUsd');
  const [inputAmount, setInputAmount] = useState('1000');
  const [outputAmount, setOutputAmount] = useState(0);

  // Detectar errores de OAuth en la URL
  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      if (error === 'REGISTRATION_REQUIRED') {
        toast.error("No tienes una cuenta registrada", {
          description: "Por favor regístrate primero usando el botón de Registrarse."
        });
        setActiveForm("register");
      } else if (error === 'EMAIL_PASSWORD_ACCOUNT') {
        toast.error("Esta cuenta usa email y contraseña", {
          description: "Por favor, inicia sesión con tu correo y contraseña."
        });
      } else {
        toast.error("Error al iniciar sesión con Google", {
          description: error
        });
      }
      // Limpiar el parámetro de error de la URL
      window.history.replaceState({}, '', '/login');
    }
  }, [searchParams, setActiveForm]);

  useEffect(() => {
    const loadRates = async () => {
      const data = await getRates();
      setRates({ buy: data.usd.buy, sell: data.usd.sell });
    };
    loadRates();
  }, []);

  let currentRate = 0;
  let inputCurrency = '';
  let outputCurrency = '';
  let operationText = '';
  if (operation === 'buyUsd') {
    currentRate = rates.buy;
    inputCurrency = 'MXN';
    outputCurrency = 'USD';
    operationText = 'Comprando USD con MXN';
  } else if (operation === 'sellUsd') {
    currentRate = rates.sell;
    inputCurrency = 'USD';
    outputCurrency = 'MXN';
    operationText = 'Vendiendo USD por MXN';
  }

  useEffect(() => {
    // Para comprar USD (input MXN) dividimos por la tasa de compra.
    // Para vender USD (input USD) multiplicamos por la tasa de venta.
    const numAmount = parseFloat(inputAmount) || 0;
    if (operation === 'buyUsd') {
      setOutputAmount(numAmount / currentRate);
    } else {
      setOutputAmount(numAmount * currentRate);
    }
  }, [inputAmount, operation, rates, currentRate]);

  return (
    <div className="flex sm:flex-row flex-col justify-center items-center gap-8 bg-white p-[50px] sm:p-[30px] sm:px-[20px] w-full min-h-screen" >
      <div className="bg-white shadow-[0_10px_30px_rgba(0,0,0,0.1)] p-[40px] border border-[#f0f0f0] rounded-[20px] w-full max-w-[500px] text-center">
        <div className="mb-[30px]">
          <div className="mb-[5px] font-bold text-[2.5rem] text-primary sm:text-[2rem]">
            <h1>M<span className="text-[3rem] text-secondary sm:text-[2.5rem]">X</span>ange</h1>

            <p className="mb-[20px] font-light text-gray-custom">Compra y vende divisas al mejor precio</p>
          </div>



          <div className="flex bg-light-green mb-[30px] p-[4px] rounded-[25px]">
            <button
              className={`flex-1 p-[12px_20px] rounded-[20px] bg-transparent text-primary font-medium cursor-pointer transition-all duration-300 ease-in-out font-['Roboto'] border-none ${activeForm === "login" ? "bg-white shadow-[0_2px_10px_rgba(0,0,0,0.1)]" : ""
                }`}
              onClick={() => setActiveForm("login")}
            >
              Iniciar Sesión
            </button>
            <button
              className={`flex-1 p-[12px_20px] rounded-[20px] bg-transparent text-primary font-medium cursor-pointer transition-all duration-300 ease-in-out font-['Roboto'] border-none ${activeForm === "register" ? "bg-white shadow-[0_2px_10px_rgba(0,0,0,0.1)]" : ""
                }`}
              onClick={() => setActiveForm("register")}
            >
              Registrarse
            </button>
          </div>

          <div className="relative overflow-hidden">
            {activeForm === "login" ? (
              <form
                className="block"
                onSubmit={onSubmitLogin}
              >
                <div className="mb-[20px] text-left">
                  <label className="block mb-[8px] font-medium text-primary">Email o Teléfono</label>
                  <input
                    type="text"
                    placeholder="Ingresa tu email o teléfono"
                    name="email"
                    required
                    onChange={handleOnchangeLogin}
                    className="p-[15px] border-2 border-light-green focus:border-secondary rounded-[10px] focus:outline-none w-full font-['Roboto'] text-[16px] transition duration-300 ease-in-out"
                  />
                </div>
                <div className="mb-[20px] text-left">
                  <label className="block mb-[8px] font-medium text-primary">Contraseña</label>
                  <input
                    type="password"
                    name="password"
                    placeholder="Ingresa tu contraseña"
                    onChange={handleOnchangeLogin}
                    required
                    className="p-[15px] border-2 border-light-green focus:border-secondary rounded-[10px] focus:outline-none w-full font-['Roboto'] text-[16px] transition duration-300 ease-in-out"
                  />
                </div>
                <button disabled={loadingLogin} type="submit" className="bg-gradient-primary-to-accent hover:bg-gradient-primary-to-accent disabled:opacity-50 hover:shadow-[0_5px_20px_rgba(104,224,127,0.4)] p-[15px] border-none rounded-[10px] w-full font-['Roboto'] font-medium text-[16px] text-white transition-all hover:-translate-y-[2px] duration-300 ease-in-out cursor-pointer">
                  {loadingLogin ? (
                    <MdAutorenew size={20} className="m-auto the-spinner" />
                  ) : (
                    <>

                      Iniciar Sesión
                    </>)

                  }
                </button>
                <div className="mt-[20px] text-center">
                  <a role="button" className="text-[14px] text-secondary hover:text-primary no-underline cursor-pointer" onClick={() => onRouterLink('/forgotpassword')}>¿Olvidaste tu contraseña?</a>
                </div>
              </form>
            ) : (
              <form className={activeForm === "register" ? "block" : "hidden"} onSubmit={onSubmitRegister}>
                <div className="mb-[20px] text-left">
                  <label className="block mb-[8px] font-medium text-primary">Nombre Completo</label>
                  <input
                    type="text"
                    placeholder="Ingresa tu nombre completo"
                    required
                    name="name"
                    onChange={handleOnchangeRegister}
                    className="p-[15px] border-2 border-light-green focus:border-secondary rounded-[10px] focus:outline-none w-full font-['Roboto'] text-[16px] transition duration-300 ease-in-out"
                  />
                </div>
                <div className="mb-[20px] text-left">
                  <label className="block mb-[8px] font-medium text-primary">Email</label>
                  <input
                    type="email"
                    placeholder="Ingresa tu email"
                    required
                    name="email"
                    onChange={handleOnchangeRegister}
                    className="p-[15px] border-2 border-light-green focus:border-secondary rounded-[10px] focus:outline-none w-full font-['Roboto'] text-[16px] transition duration-300 ease-in-out"
                  />
                </div>

                <div className="mb-[20px] text-left">
                  <label className="block mb-[8px] font-medium text-primary">Contraseña</label>
                  <input
                    type="password"
                    placeholder="Crea una contraseña segura"
                    required
                    name="password"
                    onChange={handleOnchangeRegister}
                    className="p-[15px] border-2 border-light-green focus:border-secondary rounded-[10px] focus:outline-none w-full font-['Roboto'] text-[16px] transition duration-300 ease-in-out"
                  />
                </div>
                <button type="submit" disabled={loadingRegister} className="bg-gradient-primary-to-accent hover:bg-gradient-primary-to-accent disabled:opacity-50 hover:shadow-[0_5px_20px_rgba(104,224,127,0.4)] p-[15px] border-none rounded-[10px] w-full font-['Roboto'] font-medium text-[16px] text-white transition-all hover:-translate-y-[2px] duration-300 ease-in-out cursor-pointer">
                  {loadingRegister ? (
                    <MdAutorenew size={20} className="m-auto the-spinner" />
                  ) : (
                    <>

                      Crear Cuenta
                    </>)

                  }
                </button>
              </form>
            )}



          </div>

          <div className="relative my-[30px] text-center">
            <span className="bg-white px-[20px] text-[14px] text-gray-custom">o continúa con</span>
          </div>

          <div className="flex gap-[15px] mb-[20px]">
            <button disabled={loadingGoogle} className="flex flex-1 justify-center items-center gap-2 bg-white hover:bg-light-green disabled:opacity-50 p-[12px] border-2 border-light-green rounded-[10px] font-medium text-primary transition-all hover:-translate-y-[2px] duration-300 ease-in-out cursor-pointer" onClick={handleLoginGoogle}>


              {loadingGoogle ? (
                <MdAutorenew size={20} className="m-auto the-spinner" />
              ) : (
                <>

                  <span> Iniciar Sesión con
                    Google</span>
                  <FcGoogle size={22} />
                </>)

              }
            </button>
          </div>
        </div>
      </div>
      <div className="w-full max-w-[500px]">
        <div className="bg-gradient-primary-to-accent shadow-[0_5px_20px_rgba(104,224,127,0.2)] p-[25px] rounded-[15px]">
          <div className="mb-[20px] font-semibold text-[18px] text-white text-5xl text-center">💱 Compra y Venta de Divisas</div>

          <div className="flex bg-white mb-[10px] p-[4px] rounded-[10px]">
            <button className={`flex-1 p-[8px_6px] border-none bg-transparent rounded-[8px] font-['Roboto'] font-medium cursor-pointer transition-all duration-300 ease-in-out text-primary text-[12px] ${operation === 'buyUsd' ? 'bg-secondary text-white' : ''}`}
              onClick={() => setOperation('buyUsd')}
            >
              🟢 Comprar USD
            </button>
            <button className={`flex-1 p-[8px_6px] border-none bg-transparent rounded-[8px] font-['Roboto'] font-medium cursor-pointer transition-all duration-300 ease-in-out text-primary text-[12px] ${operation === 'sellUsd' ? 'bg-secondary text-white' : ''}`}
              onClick={() => setOperation('sellUsd')}
            >
              🔴 Vender USD
            </button>
          </div>

          {/* Opciones MXN removidas intencionalmente para simplificar la UI */}

          <div className="flex sm:flex-col items-center gap-[15px] sm:gap-[10px] my-[20px]">
            <div className="relative flex-1">
              <NumberInput
                placeholder="1000"
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
                decimals={2}
                className="bg-white focus:shadow-[0_0_10px_rgba(104,224,127,0.3)] p-[15px_50px_15px_15px] border-2 border-white focus:border-secondary rounded-[10px] focus:outline-none w-full font-semibold text-[18px] text-primary"
              />
              <div className="top-1/2 right-[15px] absolute bg-primary p-[5px_10px] rounded-[5px] font-bold text-[12px] text-white -translate-y-1/2">{inputCurrency}</div>
            </div>
            <div className="font-bold text-[24px] text-primary sm:rotate-90">→</div>
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="0.00"
                value={outputAmount.toFixed(2)}
                readOnly
                className="bg-white focus:shadow-[0_0_10px_rgba(104,224,127,0.3)] p-[15px_50px_15px_15px] border-2 border-white focus:border-secondary rounded-[10px] focus:outline-none w-full font-semibold text-[18px] text-primary"
              />
              <div className="top-1/2 right-[15px] absolute bg-primary p-[5px_10px] rounded-[5px] font-bold text-[12px] text-white -translate-y-1/2">{outputCurrency}</div>
            </div>
          </div>

          <div className="bg-white p-[15px] rounded-[10px]">
            <div className="mb-[10px] font-semibold text-[14px] text-primary text-center">
              {operationText}
            </div>
            <div className="flex justify-between items-center mb-[8px]">
              <div className="flex-1 text-center">
                <div className="mb-[2px] text-[10px] text-gray-custom">Compramos USD</div>
                <div className="font-semibold text-[14px] text-secondary">${rates.buy.toFixed(2)}</div>
              </div>
              <div className="flex-1 text-center">
                <div className="mb-[2px] text-[10px] text-gray-custom">Vendemos USD</div>
                <div className="font-semibold text-[14px] text-primary">${rates.sell.toFixed(2)}</div>
              </div>
            </div>
            {/* Tasas MXN removidas para mostrar solo tasas USD */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login; 