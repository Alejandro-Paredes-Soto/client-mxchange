/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Cookies from 'js-cookie';
import useUtils from "../../services/utils";
import useLogin from "./useLogin";
import { getRates } from '../../services/api';
import { FcGoogle } from "react-icons/fc";
import { MdAutorenew } from "react-icons/md";
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { NumberInput } from '@/components/ui/number-input';
import { toast } from "sonner";


const LoginContent = () => {

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
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordRegister, setShowPasswordRegister] = useState(false);

  // Detectar errores de OAuth en la URL
  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      // Limpiar la cookie de googleAuthAction
      Cookies.remove('googleAuthAction');
      
      // Primero cambiar al tab correcto antes de mostrar el toast
      if (error === 'REGISTRATION_REQUIRED') {
        setActiveForm("register");
      }
      
      // Usar setTimeout para asegurar que el toast se muestre después del render
      const timer = setTimeout(() => {
        if (error === 'REGISTRATION_REQUIRED') {
          toast.error("No tienes una cuenta registrada", {
            description: "Por favor regístrate primero usando el formulario de abajo.",
            duration: 6000, // Mostrar por más tiempo
          });
        } else if (error === 'EMAIL_PASSWORD_ACCOUNT') {
          toast.error("Esta cuenta usa email y contraseña", {
            description: "Por favor, inicia sesión con tu correo y contraseña.",
            duration: 5000,
          });
        } else {
          toast.error("Error al iniciar sesión con Google", {
            description: error,
            duration: 5000,
          });
        }
        
        // Limpiar el parámetro de error de la URL después de mostrar el toast
        window.history.replaceState({}, '', '/login');
      }, 100); // Pequeño delay para asegurar que la UI esté lista
      
      return () => clearTimeout(timer);
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
    <div className="flex lg:flex-row flex-col justify-center items-center gap-6 lg:gap-8 bg-background p-6 md:p-8 lg:p-12 w-full min-h-screen" >
      <div className="bg-white shadow-lg p-6 md:p-8 lg:p-10 border border-light-green rounded-2xl w-full max-w-[500px]">
        <div className="mb-6">
          <div className="mb-4 text-center">
            <h1 className="font-bold text-primary text-4xl md:text-5xl">
              M<span className="text-secondary text-5xl md:text-6xl">X</span>ange
            </h1>
            <p className="mt-2 font-light text-gray-600 text-sm md:text-base">Compra y vende divisas al mejor precio</p>
          </div>



          <div className="flex bg-light-green mb-6 p-1 rounded-full">
            <button
              className={`flex-1 py-3 px-4 md:px-6 rounded-full bg-transparent text-primary font-medium cursor-pointer transition-all duration-300 ease-in-out border-none text-sm md:text-base ${
                activeForm === "login" ? "bg-white shadow-md" : ""
              }`}
              onClick={() => setActiveForm("login")}
            >
              Iniciar Sesión
            </button>
            <button
              className={`flex-1 py-3 px-4 md:px-6 rounded-full bg-transparent text-primary font-medium cursor-pointer transition-all duration-300 ease-in-out border-none text-sm md:text-base ${
                activeForm === "register" ? "bg-white shadow-md" : ""
              }`}
              onClick={() => setActiveForm("register")}
            >
              Registrarse
            </button>
          </div>

          <div className="relative overflow-hidden">
            {activeForm === "login" ? (
              <form
                className="block space-y-4"
                onSubmit={onSubmitLogin}
              >
                <div className="text-left">
                  <label className="block mb-2 font-medium text-primary text-sm">Email o Teléfono</label>
                  <input
                    type="text"
                    placeholder="Ingresa tu email o teléfono"
                    name="email"
                    required
                    onChange={handleOnchangeLogin}
                    className="px-4 py-3 border-2 border-light-green focus:border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-primary w-full text-sm md:text-base transition duration-300 cursor-pointer"
                  />
                </div>
                <div className="text-left">
                  <label className="block mb-2 font-medium text-primary text-sm">Contraseña</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      placeholder="Ingresa tu contraseña"
                      onChange={handleOnchangeLogin}
                      required
                      className="px-4 py-3 pr-12 border-2 border-light-green focus:border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-primary w-full text-sm md:text-base transition duration-300 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="top-1/2 right-3 absolute text-gray-500 hover:text-gray-700 -translate-y-1/2 cursor-pointer transform"
                    >
                      {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
                </div>
                <button 
                  disabled={loadingLogin} 
                  type="submit" 
                  className="bg-primary hover:opacity-95 disabled:opacity-50 shadow-lg hover:shadow-xl px-4 py-3 rounded-lg w-full font-medium text-white text-sm md:text-base transition-all hover:-translate-y-0.5 duration-300 cursor-pointer disabled:cursor-not-allowed transform"
                >
                  {loadingLogin ? (
                    <MdAutorenew size={20} className="m-auto the-spinner" />
                  ) : (
                    "Iniciar Sesión"
                  )}
                </button>
                <div className="text-center">
                  <a 
                    role="button" 
                    className="text-secondary hover:text-primary text-sm no-underline transition-colors cursor-pointer" 
                    onClick={() => onRouterLink('/forgotpassword')}
                  >
                    ¿Olvidaste tu contraseña?
                  </a>
                </div>
              </form>
            ) : (
              <form className={activeForm === "register" ? "block space-y-4" : "hidden"} onSubmit={onSubmitRegister}>
                <div className="text-left">
                  <label className="block mb-2 font-medium text-primary text-sm">Nombre Completo</label>
                  <input
                    type="text"
                    placeholder="Ingresa tu nombre completo"
                    required
                    name="name"
                    onChange={handleOnchangeRegister}
                    className="px-4 py-3 border-2 border-light-green focus:border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-primary w-full text-sm md:text-base transition duration-300 cursor-pointer"
                  />
                </div>
                <div className="text-left">
                  <label className="block mb-2 font-medium text-primary text-sm">Email</label>
                  <input
                    type="email"
                    placeholder="Ingresa tu email"
                    required
                    name="email"
                    onChange={handleOnchangeRegister}
                    className="px-4 py-3 border-2 border-light-green focus:border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-primary w-full text-sm md:text-base transition duration-300 cursor-pointer"
                  />
                </div>

                <div className="text-left">
                  <label className="block mb-2 font-medium text-primary text-sm">Contraseña</label>
                  <div className="relative">
                    <input
                      type={showPasswordRegister ? "text" : "password"}
                      placeholder="Crea una contraseña segura"
                      required
                      name="password"
                      onChange={handleOnchangeRegister}
                      className="px-4 py-3 pr-12 border-2 border-light-green focus:border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-primary w-full text-sm md:text-base transition duration-300 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordRegister(!showPasswordRegister)}
                      className="top-1/2 right-3 absolute text-gray-500 hover:text-gray-700 -translate-y-1/2 cursor-pointer transform"
                    >
                      {showPasswordRegister ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
                </div>
                <button 
                  type="submit" 
                  disabled={loadingRegister} 
                  className="bg-primary hover:opacity-95 disabled:opacity-50 shadow-lg hover:shadow-xl px-4 py-3 rounded-lg w-full font-medium text-white text-sm md:text-base transition-all hover:-translate-y-0.5 duration-300 cursor-pointer disabled:cursor-not-allowed transform"
                >
                  {loadingRegister ? (
                    <MdAutorenew size={20} className="m-auto the-spinner" />
                  ) : (
                    "Crear Cuenta"
                  )}
                </button>
              </form>
            )}



          </div>

          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="border-light-green border-t w-full"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-4 text-gray-500 text-sm">o continúa con</span>
            </div>
          </div>

          <button 
            disabled={loadingGoogle} 
              className="flex justify-center items-center gap-2 bg-white hover:bg-light-green disabled:opacity-50 hover:shadow-md px-4 py-3 border-2 border-light-green rounded-lg w-full font-medium text-primary text-sm md:text-base transition-all duration-300 cursor-pointer disabled:cursor-not-allowed" 
            onClick={handleLoginGoogle}
          >
            {loadingGoogle ? (
              <MdAutorenew size={20} className="m-auto the-spinner" />
            ) : (
              <>
                <FcGoogle size={22} />
                <span>Iniciar Sesión con Google</span>
              </>
            )}
          </button>
        </div>
      </div>
      <div className="w-full max-w-[500px]">
        <div className="bg-primary shadow-xl p-6 md:p-8 rounded-2xl">
          <div className="mb-6 font-semibold text-white text-center">
            <div className="mb-2 text-4xl md:text-5xl">💱</div>
            <div className="text-xl md:text-2xl">Compra y Venta de Divisas</div>
          </div>

          <div className="flex bg-white/20 backdrop-blur-sm mb-4 p-1 rounded-xl">
            <button 
              className={`flex-1 py-2.5 px-3 md:px-4 border-none rounded-lg font-medium cursor-pointer transition-all duration-300 text-xs md:text-sm ${
                operation === 'buyUsd' ? 'bg-white text-primary shadow-md' : 'bg-transparent text-white'
              }`}
              onClick={() => setOperation('buyUsd')}
            >
              🟢 Comprar USD
            </button>
            <button 
              className={`flex-1 py-2.5 px-3 md:px-4 border-none rounded-lg font-medium cursor-pointer transition-all duration-300 text-xs md:text-sm ${
                operation === 'sellUsd' ? 'bg-white text-primary shadow-md' : 'bg-transparent text-white'
              }`}
              onClick={() => setOperation('sellUsd')}
            >
              🔴 Vender USD
            </button>
          </div>

          {/* Opciones MXN removidas intencionalmente para simplificar la UI */}

          <div className="flex md:flex-row flex-col items-center gap-4 my-6">
            <div className="relative flex-1 w-full">
              <NumberInput
                placeholder="1000"
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
                decimals={2}
                className="bg-white shadow-sm px-4 py-3 pr-16 border-2 border-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary w-full font-semibold text-primary text-lg cursor-pointer"
              />
              <div className="top-1/2 right-4 absolute bg-primary px-3 py-1.5 rounded-md font-bold text-white text-xs -translate-y-1/2">{inputCurrency}</div>
            </div>
            <div className="font-bold text-white text-2xl rotate-90 md:rotate-0">→</div>
            <div className="relative flex-1 w-full">
              <input
                type="text"
                placeholder="0.00"
                value={outputAmount.toFixed(2)}
                readOnly
                className="bg-white/90 shadow-sm px-4 py-3 pr-16 border-2 border-white/50 rounded-lg focus:outline-none w-full font-semibold text-primary text-lg cursor-pointer"
              />
              <div className="top-1/2 right-4 absolute bg-primary px-3 py-1.5 rounded-md font-bold text-white text-xs -translate-y-1/2">{outputCurrency}</div>
            </div>
          </div>

          <div className="bg-white/95 shadow-lg backdrop-blur-sm p-4 md:p-5 rounded-xl">
            <div className="mb-3 font-semibold text-primary text-sm md:text-base text-center">
              {operationText}
            </div>
            <div className="flex justify-around items-center gap-4">
              <div className="flex-1 text-center">
                <div className="mb-1 text-gray-600 text-xs">Compramos USD</div>
                <div className="font-bold text-secondary text-base md:text-lg">${rates.buy.toFixed(2)}</div>
              </div>
              <div className="bg-light-green w-px h-12"></div>
              <div className="flex-1 text-center">
                <div className="mb-1 text-gray-600 text-xs">Vendemos USD</div>
                <div className="font-bold text-primary text-base md:text-lg">${rates.sell.toFixed(2)}</div>
              </div>
            </div>
            {/* Tasas MXN removidas para mostrar solo tasas USD */}
          </div>
        </div>
      </div>
    </div>
  );
};

// Wrapper con Suspense para useSearchParams
const Login = () => {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center bg-background min-h-screen">
        <MdAutorenew size={40} className="text-primary the-spinner" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
};

export default Login; 