"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import useUtils from "../services/utils";
const Inicio = () => {
  const { data: session, status } = useSession();
  
  const[token, setHasToken] = useState(false);  
   const { isTokenExpired, onLogout } = useUtils();


       useEffect(() => {
    const authGoogle = localStorage.getItem("authGoogle");

    if (session && status == "authenticated" && authGoogle == "true") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const token = (session as any)?.token;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const idUser = (session as any)?.idUser
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isValidToken = (session as any)?.isValidToken;
      if (token && token !== "undefined" && token !== "null") {
       
        localStorage.setItem("email", session.user?.email == null ? "" : session.user?.email );
        localStorage.setItem("name", session.user?.name == null ? "" :  session.user?.name );
        localStorage.setItem("idUser", idUser);
        localStorage.setItem("lastname", "");

        if (isValidToken.idUser) {
          setHasToken(true);
           localStorage.setItem("token", token);
        } else {
            localStorage.removeItem("token")
          setHasToken(false);
        }
      }
    } else if (authGoogle == "false") {
      if (localStorage.getItem("token")) {
        const validToken = isTokenExpired(localStorage.getItem("token")!);

        setHasToken(validToken == true ? false : true);
        // setHasToken(true);
      } else {
        setHasToken(false);
      }
    }
  }, [session, status]);
  
    return (
        <section>
            holas inicio

            <button onClick={onLogout}>Cerrar sesion</button>
        </section>
    );

}


export default Inicio;