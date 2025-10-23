"use client";

import axios from "axios";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Cookies from 'js-cookie';


const useUtils = () => {
  const router = useRouter();
    const token = typeof window !== 'undefined' ? Cookies.get('token') : null;

  
    const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const api = axios.create({
    baseURL,
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
    }
  })

   api.interceptors.response.use(
    (response) => response,
    (er) => {
      if (er.response?.status === 401) {
        // Token inválido o expirado, redirigir al login
        alert('Sesión expirada. Redirigiendo al login.');
        localStorage.clear();
        Cookies.remove('token');
        window.location.href = '/login';
        return;
      }
      alert(er.response?.data.message || er?.message);
      return;
    }
  );


    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestPost = async (data: any, endPoint: string) => {
    try {
      const res = await api.post(endPoint, data, {
        headers: {
          Authorization: `Bearer ${Cookies.get("token")}`,
        },
      });
      return res;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      throw error;
    }
  };

  const requestGet = async (
    endPoint: string,
  ) => {
    try {
      const res = await api.get(endPoint, {
        headers: {
          Authorization: `Bearer ${Cookies.get("token")}`,
        },
      });

      return res;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      throw error;
    }
  };

  const isTokenExpired = (token: string): boolean => {
    try {
      const payloadBase64 = token.split(".")[1];
      const decodedPayload = JSON.parse(atob(payloadBase64)) as {
        email: string;
        idUser: string;
        rol: string;
        iat: number;
        exp: number;
      };

      const currentTime = Math.floor(Date.now() / 1000);
      return decodedPayload.exp < currentTime;
    } catch (error) {
      console.log("error al detectar expiracion del token");
      return true;
    }
  };

  const onRouterLink = (route: string): void => {
    router.push(route);
  };


  const onLogout = async () => {
     await signOut();
     localStorage.clear();
     Cookies.remove('token', { path: '/' });
   window.location.href = "/login";

  }
  
  return {
    requestGet,
    requestPost,
    isTokenExpired,
    onRouterLink,
    onLogout
  }
  

}

export default useUtils;