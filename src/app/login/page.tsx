/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from 'react';
import useUtils from "../services/utils";
import useLogin from "./useLogin";
import { getRates } from '../services/api';
import { FcGoogle } from "react-icons/fc";
import { MdAutorenew } from "react-icons/md";

const Login = () => {
  const { 
    activeForm,
    loadingLogin,
    loadingGoogle,
    loadingRegister,
    handleLoginGoogle,
    setActiveForm,
    handleOnchangeLogin,
    handleOnchangeRegister,
    onSubmitRegister,
    onSubmitLogin 
  } = useLogin();

  const { onRouterLink } = useUtils();

  const [rates, setRates] = useState({ buy: 17.5, sell: 18.2 });
  const [operation, setOperation] = useState('buyUsd');
  const [inputAmount, setInputAmount] = useState(1000);
  const [outputAmount, setOutputAmount] = useState(0);

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
    if (operation === 'buyUsd') {
      setOutputAmount(inputAmount / currentRate);
    } else {
      setOutputAmount(inputAmount * currentRate);
    }
  }, [inputAmount, operation, rates, currentRate]);

  return (
    <div className="flex sm:flex-row flex-col justify-center items-center gap-4 sm:gap-8 bg-white p-4 sm:p-8 md:p-12 w-full min-h-screen">
      {/* Login Card */}
      <div className="bg-white shadow-lg sm:shadow-xl p-6 sm:p-8 md:p-10 rounded-2xl w-full max-w-md lg:max-w-lg">
        <div className="mb-6 sm:mb-8">
          <div className="mb-2 font-bold text-primary text-3xl sm:text-4xl text-center">
            <h1>M<span className="text-secondary text-4xl sm:text-5xl">X</span>ange</h1>
            <p className="mt-2 font-light text-gray-600 text-sm sm:text-base">Compra y vende divisas al mejor precio</p>
          </div>

          {/* Form Toggle */}
          <div className="flex bg-green-50 mb-6 sm:mb-8 p-1 rounded-2xl">
            <button
              className={`flex-1 py-2 sm:py-3 px-4 rounded-2xl bg-transparent text-primary font-medium cursor-pointer transition-all duration-300 border-none text-sm sm:text-base ${
                activeForm === "login" ? "bg-white shadow-md" : ""
              }`}
              onClick={() => setActiveForm("login")}
            >
              Iniciar Sesión
            </button>
            <button
              className={`flex-1 py-2 sm:py-3 px-4 rounded-2xl bg-transparent text-primary font-medium cursor-pointer transition-all duration-300 border-none text-sm sm:text-base ${
                activeForm === "register" ? "bg-white shadow-md" : ""
              }`}
              onClick={() => setActiveForm("register")}
            >
              Registrarse
            </button>
          </div>

          {/* Forms */}
          <div className="relative overflow-hidden">
            {activeForm === "login" ? (
              <form className="block" onSubmit={onSubmitLogin}>
                <div className="mb-4 sm:mb-5 text-left">
                  <label className="block mb-2 font-medium text-primary text-sm sm:text-base">Email o Teléfono</label>
                  <input
                    type="text"
                    placeholder="Ingresa tu email o teléfono"
                    name="email"
                    required
                    onChange={handleOnchangeLogin}
                    className="p-3 sm:p-4 border-2 border-green-200 focus:border-secondary rounded-xl focus:outline-none w-full text-sm sm:text-base transition duration-300"
                  />
                </div>
                <div className="mb-4 sm:mb-5 text-left">
                  <label className="block mb-2 font-medium text-primary text-sm sm:text-base">Contraseña</label>
                  <input
                    type="password"
                    name="password"
                    placeholder="Ingresa tu contraseña"
                    onChange={handleOnchangeLogin}
                    required
                    className="p-3 sm:p-4 border-2 border-green-200 focus:border-secondary rounded-xl focus:outline-none w-full text-sm sm:text-base transition duration-300"
                  />
                </div>
                <button
                  disabled={loadingLogin}
                  type="submit"
                  className="bg-gradient-to-r from-primary hover:from-primary to-accent hover:to-accent disabled:opacity-50 hover:shadow-lg p-3 sm:p-4 border-none rounded-xl w-full font-medium text-white text-sm sm:text-base transition-all hover:-translate-y-0.5 duration-300 cursor-pointer"
                >
                  {loadingLogin ? (
                    <MdAutorenew size={20} className="mx-auto animate-spin" />
                  ) : (
                    "Iniciar Sesión"
                  )}
                </button>
                <div className="mt-4 sm:mt-5 text-center">
                  <a
                    role="button"
                    className="text-secondary hover:text-primary text-xs sm:text-sm no-underline cursor-pointer"
                    onClick={() => onRouterLink('/forgotpassword')}
                  >
                    ¿Olvidaste tu contraseña?
                  </a>
                </div>
              </form>
            ) : (
              <form className={activeForm === "register" ? "block" : "hidden"} onSubmit={onSubmitRegister}>
                <div className="mb-4 sm:mb-5 text-left">
                  <label className="block mb-2 font-medium text-primary text-sm sm:text-base">Nombre Completo</label>
                  <input
                    type="text"
                    placeholder="Ingresa tu nombre completo"
                    required
                    name="name"
                    onChange={handleOnchangeRegister}
                    className="p-3 sm:p-4 border-2 border-green-200 focus:border-secondary rounded-xl focus:outline-none w-full text-sm sm:text-base transition duration-300"
                  />
                </div>
                <div className="mb-4 sm:mb-5 text-left">
                  <label className="block mb-2 font-medium text-primary text-sm sm:text-base">Email</label>
                  <input
                    type="email"
                    placeholder="Ingresa tu email"
                    required
                    name="email"
                    onChange={handleOnchangeRegister}
                    className="p-3 sm:p-4 border-2 border-green-200 focus:border-secondary rounded-xl focus:outline-none w-full text-sm sm:text-base transition duration-300"
                  />
                </div>
                <div className="mb-4 sm:mb-5 text-left">
                  <label className="block mb-2 font-medium text-primary text-sm sm:text-base">Contraseña</label>
                  <input
                    type="password"
                    placeholder="Crea una contraseña segura"
                    required
                    name="password"
                    onChange={handleOnchangeRegister}
                    className="p-3 sm:p-4 border-2 border-green-200 focus:border-secondary rounded-xl focus:outline-none w-full text-sm sm:text-base transition duration-300"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loadingRegister}
                  className="bg-gradient-to-r from-primary hover:from-primary to-accent hover:to-accent disabled:opacity-50 hover:shadow-lg p-3 sm:p-4 border-none rounded-xl w-full font-medium text-white text-sm sm:text-base transition-all hover:-translate-y-0.5 duration-300 cursor-pointer"
                >
                  {loadingRegister ? (
                    <MdAutorenew size={20} className="mx-auto animate-spin" />
                  ) : (
                    "Crear Cuenta"
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Divider */}
          <div className="relative my-6 sm:my-8 text-center">
            <span className="bg-white px-4 text-gray-600 text-xs sm:text-sm">o continúa con</span>
          </div>

          {/* Google Login */}
          <div className="flex gap-3 sm:gap-4 mb-4 sm:mb-5">
            <button
              disabled={loadingGoogle}
              className="flex flex-1 justify-center items-center gap-2 bg-white hover:bg-green-50 disabled:opacity-50 p-3 border-2 border-green-200 rounded-xl font-medium text-primary text-sm sm:text-base transition-all hover:-translate-y-0.5 duration-300 cursor-pointer"
              onClick={handleLoginGoogle}
            >
              {loadingGoogle ? (
                <MdAutorenew size={20} className="animate-spin" />
              ) : (
                <>
                  <span>Google</span>
                  <FcGoogle size={20} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Exchange Calculator */}
      <div className="w-full max-w-md lg:max-w-lg">
        <div className="bg-gradient-to-r from-primary to-accent shadow-lg p-4 sm:p-6 md:p-8 rounded-2xl">
          <div className="mb-4 sm:mb-6 font-semibold text-white text-xl sm:text-2xl text-center">💱 Compra y Venta de Divisas</div>

          {/* Operation Toggle */}
          <div className="flex bg-white mb-3 sm:mb-4 p-1 rounded-xl">
            <button
              className={`flex-1 py-2 px-2 sm:px-3 border-none bg-transparent rounded-lg font-medium cursor-pointer transition-all duration-300 text-primary text-xs sm:text-sm ${
                operation === 'buyUsd' ? 'bg-secondary text-white' : ''
              }`}
              onClick={() => setOperation('buyUsd')}
            >
              🟢 Comprar USD
            </button>
            <button
              className={`flex-1 py-2 px-2 sm:px-3 border-none bg-transparent rounded-lg font-medium cursor-pointer transition-all duration-300 text-primary text-xs sm:text-sm ${
                operation === 'sellUsd' ? 'bg-secondary text-white' : ''
              }`}
              onClick={() => setOperation('sellUsd')}
            >
              🔴 Vender USD
            </button>
          </div>

          {/* Currency Inputs */}
          <div className="flex sm:flex-row flex-col items-center gap-3 sm:gap-4 my-4 sm:my-6">
            <div className="relative w-full">
              <input
                type="number"
                placeholder="1000"
                value={inputAmount}
                onChange={(e) => setInputAmount(Number(e.target.value))}
                className="p-3 sm:p-4 pr-12 border-2 border-white focus:border-secondary rounded-xl focus:outline-none w-full font-semibold text-primary text-base sm:text-lg"
              />
              <div className="top-1/2 right-3 absolute bg-primary px-2 sm:px-3 py-1 rounded font-bold text-white text-xs -translate-y-1/2">
                {inputCurrency}
              </div>
            </div>
            <div className="font-bold text-white text-2xl sm:rotate-90">→</div>
            <div className="relative w-full">
              <input
                type="number"
                placeholder="0.00"
                value={outputAmount.toFixed(2)}
                readOnly
                className="p-3 sm:p-4 pr-12 border-2 border-white focus:border-secondary rounded-xl focus:outline-none w-full font-semibold text-primary text-base sm:text-lg"
              />
              <div className="top-1/2 right-3 absolute bg-primary px-2 sm:px-3 py-1 rounded font-bold text-white text-xs -translate-y-1/2">
                {outputCurrency}
              </div>
            </div>
          </div>

          {/* Rates Display */}
          <div className="bg-white p-3 sm:p-4 rounded-xl">
            <div className="mb-2 sm:mb-3 font-semibold text-primary text-sm sm:text-base text-center">
              {operationText}
            </div>
            <div className="flex justify-between items-center mb-2">
              <div className="flex-1 text-center">
                <div className="mb-1 text-gray-600 text-xs">Compramos USD</div>
                <div className="font-semibold text-secondary text-sm sm:text-base">${rates.buy.toFixed(2)}</div>
              </div>
              <div className="flex-1 text-center">
                <div className="mb-1 text-gray-600 text-xs">Vendemos USD</div>
                <div className="font-semibold text-primary text-sm sm:text-base">${rates.sell.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;