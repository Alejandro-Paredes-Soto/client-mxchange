/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";


import useUtils from "../services/utils";
import "./login.css";
import useLogin from "./useLogin";
import { FcGoogle } from "react-icons/fc";
import { MdAutorenew } from "react-icons/md";


const Login = () => {

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


    const {onRouterLink} = useUtils();
   
  return (
   <div className="container-login grid grid-cols-[1fr_1fr] gap-5" >
       <div className="container-primero">
          <div>
             <div  className="logo">
        <h1>M<span className="x-highlight">X</span>ange</h1>
      
        <p className="subtitle">Compra y vende divisas al mejor precio</p>
      </div>

   

      <div className="form-tabs">
        <button 
           className={`tab-button px-4 py-2 rounded-md ${
            activeForm === "login" ? "active" : ""
          }`}
          onClick={() => setActiveForm("login")}
        >
          Iniciar Sesión
        </button>
        <button 
         className={`tab-button px-4 py-2 rounded-md ${
            activeForm === "register" ? "active" : ""
          }`}
          onClick={() => setActiveForm("register")}
        >
          Registrarse
        </button>
      </div>

      <div className="form-container">
         {activeForm === "login" ? (
             <form 
             className={activeForm === "login"  ? 'form active' : 'form '} 
             onSubmit={onSubmitLogin}
             >
          <div className="form-group">
            <label>Email o Teléfono</label>
            <input
              type="text"
              placeholder="Ingresa tu email o teléfono"
              name="email"
              required
              onChange={handleOnchangeLogin}
            />
          </div>
          <div className="form-group">
            <label>Contraseña</label>
            <input
              type="password"
              name="password"
              placeholder="Ingresa tu contraseña"
              onChange={handleOnchangeLogin}
              required
            />
          </div>
          <button disabled={loadingLogin} type="submit" className="submit-button">
             {loadingLogin ? (
                <MdAutorenew size={20} className="m-auto the-spinner" />
              ) : (
                <>
                 
                  Iniciar Sesión
                </>)
                 
                }
          </button>
          <div className="forgot-password">
            <a role="button" className="cursor-pointer" onClick={() => onRouterLink('/forgotpassword')}>¿Olvidaste tu contraseña?</a>
          </div>
        </form>
         ) : (
 <form className={activeForm === "register"  ? 'form active' : 'form'} onSubmit={onSubmitRegister}>
          <div className="form-group">
            <label>Nombre Completo</label>
            <input
              type="text"
              placeholder="Ingresa tu nombre completo"
              required
              name="name"
              onChange={handleOnchangeRegister}
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input 
              type="email" 
               placeholder="Ingresa tu email" 
               required 
               name="email"
              onChange={handleOnchangeRegister}
               />
          </div>
          
          <div className="form-group">
            <label>Contraseña</label>
            <input
              type="password"
              placeholder="Crea una contraseña segura"
              required
              name="password"
              onChange={handleOnchangeRegister}
            />
          </div>
          <button type="submit" disabled={loadingRegister} className="submit-button">
             {loadingRegister ? (
                <MdAutorenew size={20} className="m-auto the-spinner" />
              ) : (
                <>
                 
                 Crear Cuenta
                </>)
                 
                }
          </button>
        </form>
         ) }
     

       
      </div>

      <div className="divider">
        <span>o continúa con</span>
      </div>

      <div className="social-buttons">
        <button disabled={loadingGoogle} className="social-button flex justify-center items-center gap-2" onClick={handleLoginGoogle}>
           

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
         <div>
               <div className="converter-section">
        <div className="converter-title">💱 Compra y Venta de Divisas</div>

        <div className="operation-tabs">
          <button className="operation-btn active" 
          //onClick="setOperation('buyUsd')"
          >
            🟢 Comprar USD
          </button>
          <button className="operation-btn" 
          //onclick="setOperation('sellUsd')"
          >
            🔴 Vender USD
          </button>
        </div>

        <div className="operation-tabs">
          <button className="operation-btn"
           //onclick="setOperation('buyMxn')"
           >
            🟢 Comprar MXN
          </button>
          <button className="operation-btn"
           //onclick="setOperation('sellMxn')"
           >
            🔴 Vender MXN
          </button>
        </div>

        <div className="converter-row">
          <div className="currency-input">
            <input
              type="number"
              id="inputAmount"
              placeholder="1000"
              value="1000"
            />
            <div className="currency-label" id="inputCurrency">MXN</div>
          </div>
          <div className="arrow-right">→</div>
          <div className="currency-input">
            <input
              type="number"
              id="outputAmount"
              placeholder="0.00"
              readOnly
            />
            <div className="currency-label" id="outputCurrency">USD</div>
          </div>
        </div>

        <div className="rate-info">
          <div className="current-operation" id="operationText">
            Comprando USD con MXN
          </div>
          <div className="rates-display">
            <div className="rate-box">
              <div className="rate-label">Compramos USD</div>
              <div className="rate-value rate-buy" id="buyUsdRate">$17.50</div>
            </div>
            <div className="rate-box">
              <div className="rate-label">Vendemos USD</div>
              <div className="rate-value rate-sell" id="sellUsdRate">$18.20</div>
            </div>
          </div>
          <div className="rates-display">
            <div className="rate-box">
              <div className="rate-label">Compramos MXN</div>
              <div className="rate-value rate-buy" id="buyMxnRate">$0.055</div>
            </div>
            <div className="rate-box">
              <div className="rate-label">Vendemos MXN</div>
              <div className="rate-value rate-sell" id="sellMxnRate">$0.057</div>
            </div>
          </div>
        </div>
      </div>
          </div>
    </div>
  );
};

export default Login;
