"use client";

import useForgotPassword from "./useForgotPassword";

const ForgotPassword = () => {

    const {  emailR, loading, handleKeyup, handleClick, handleInputChange}  = useForgotPassword();
  
    return (  <div className="flex justify-center items-center p-4 w-full min-h-screen">
      <div className="bg-white shadow w-full max-w-md overflow-hidden radius">
        <div className="p-8">
          <div className="space-y-1">
           

            <div className="bg-white w-full">
              <div className="flex justify-center bg-primary px-8 py-2.5 rounded-t-lg w-full text-white">
                <span className="font-semibold text-white text-xl text-start">Recuperar Contraseña</span>
              </div>
              <div className="flex flex-col justify-center items-center mx-auto pt-2.5 pb-2.5 rounded-lg w-full">
            

                <div className="flex flex-col items-center p-2.5 w-11/12">
                  <h3 className="mb-5 font-bold text-primary text-2xl">¿Olvidaste tu contraseña?</h3>
                  <span className="block text-center">
                    Te enviaremos un correo con instrucciones para recuperarla
                  </span>
                  <br />
                  <form className="flex flex-col items-center w-full">
                    <div className="flex w-full">
                      <div className="flex justify-center items-center px-1 py-1 border border-gray-300 rounded-l">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="13"
                          height="13"
                          fill="currentColor"
                          className="bi bi-envelope-fill"
                          viewBox="0 0 16 16"
                        >
                          <path d="M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414zM0 4.697v7.104l5.803-3.558zM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586zm3.436-.586L16 11.801V4.697z" />
                        </svg>
                      </div>
                      <input
                        className="p-1 border border-gray-300 w-full"
                        type="email"
                        placeholder="Correo Electronico"
                        onKeyUp={handleKeyup}
                        onChange={handleInputChange}
                        value={emailR}
                      />
                    </div>
                    <button
                      className="bg-primary disabled:opacity-50 mt-5 border-none rounded-lg outline-none w-36 min-h-9 font-bold text-white cursor-pointer"
                      onClick={handleClick}
                      disabled={loading || !emailR}
                    >
                      {loading ? (
                        <div className="mx-auto border-2 border-white border-t-transparent rounded-full w-5 h-5 animate-spin"></div>
                      ) : (
                        "Enviar correo"
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>)
}

export default ForgotPassword;