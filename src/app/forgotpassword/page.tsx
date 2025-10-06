"use client";

import styles from "./forgotpassword.module.css"
import useForgotPassword from "./useForgotPassword";

const ForgotPassword = () => {

    const {  emailR, loading, handleKeyup, handleClick, handleInputChange}  = useForgotPassword();
  
    return (  <div className="w-full flex items-center justify-center p-4" style={{minHeight: "100vh"}}>
      <div className="w-full max-w-md bg-white  overflow-hidden radius shadow">
        <div className="p-8">
          <div className="space-y-1">
           

            <div className={styles.container}>
              <div className={styles.head}>
                <span>Recuperar Contraseña</span>
              </div>
              <div className={styles.card}>
            

                <div className={styles.containerbody}>
                  <h3 className="font-bold text-[#028f61] text-[25px] mb-5">¿Olvidaste tu contraseña?</h3>
                  <span style={{ textAlign: "center", display: "block" }}>
                    Te enviaremos un correo con instrucciones para recuperarla
                  </span>
                  <br />
                  <form className={styles.form}>
                    <div className={styles.containerinput}>
                      <div className={styles.containericonoemail}>
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
                        className={styles.input}
                        type="email"
                        placeholder="Correo Electronico"
                        onKeyUp={handleKeyup}
                        onChange={handleInputChange}
                        value={emailR}
                      />
                    </div>
                    <button
                      className={styles.button}
                      onClick={handleClick}
                      disabled={loading || !emailR}
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
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