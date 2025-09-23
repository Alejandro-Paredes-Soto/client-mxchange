"use client";

import { signIn } from "next-auth/react";

const Login = () => {
  return (
    <div>
      <form action="">
        <div>
          <label htmlFor="">Email</label>
          <input type="email" placeholder="Email" />
        </div>

        <div>
          <label htmlFor="">Password</label>
          <input type="password" name="" id="" />
        </div>

        <div>
          <button type="submit">Iniciar sesion</button>
        </div>
      </form>

      <button
        style={{ background: "blue", color: "white", cursor: "pointer" }}
        onClick={() => signIn("facebook")}
      >
        iniciar sesion con facebook
      </button>
      <br />
      <button>cerrar sesion</button>
    </div>
  );
};

export default Login;
