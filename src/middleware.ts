import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { getToken } from 'next-auth/jwt';

const secretString = process.env.JWT_SECRET || 'your_jwt_secret_key';
const jwtSecret = new TextEncoder().encode(secretString);

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const token = request.cookies.get('token')?.value;
    
    // También verificar sesión de NextAuth (Google OAuth)
    const nextAuthToken = await getToken({ 
        req: request, 
        secret: process.env.NEXTAUTH_SECRET 
    });

    console.log('[middleware] Pathname:', pathname);

    // Permitir rutas de NextAuth sin interceptar
    if (pathname.startsWith('/api/auth')) {
        return NextResponse.next();
    }

    // Verificar si el usuario está autenticado y obtener su rol
    let isAuthenticated = false;
    let userRole: string | undefined;

    // Variable para rastrear si el token JWT expiró
    let tokenExpired = false;

    // Primero verificar token de NextAuth (Google OAuth)
    if (nextAuthToken) {
        isAuthenticated = true;
        userRole = (nextAuthToken as any).rol || 'client';
        console.log('[middleware] Usuario autenticado con NextAuth. Rol:', userRole);
    }
    // Si no, verificar token normal (email/password)
    else if (token) {
        try {
            const { payload } = await jwtVerify(token, jwtSecret, {
                algorithms: ['HS256']
            });
            isAuthenticated = true;
            userRole = (payload as { role?: string }).role;
            console.log('[middleware] Usuario autenticado con token. Rol:', userRole);
        } catch (err: any) {
            console.error('[middleware] Token inválido o expirado:', err?.code || err);
            isAuthenticated = false;
            // Marcar que el token expiró para limpiar la cookie
            if (err?.code === 'ERR_JWT_EXPIRED') {
                tokenExpired = true;
            }
        }
    }

    // Si el token expiró, limpiar la cookie y redirigir a login
    if (tokenExpired) {
        console.log('[middleware] Token expirado, limpiando cookie y redirigiendo a /login');
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('token');
        return response;
    }

    // Definir rutas públicas (auth)
    const authRoutes = ['/login', '/register', '/forgotpassword'];
    const isAuthRoute = authRoutes.some(route => pathname.startsWith(route));

    // CASO 1: Usuario autenticado intenta acceder a rutas de auth
    if (isAuthenticated && isAuthRoute) {
        console.log('[middleware] Usuario autenticado intentando acceder a auth, redirigiendo según rol');
        // Redirigir según el rol del usuario
        if (userRole === 'admin' || userRole === 'sucursal') {
            return NextResponse.redirect(new URL('/admin', request.url));
        } else {
            // Cliente u otro rol
            return NextResponse.redirect(new URL('/inicio', request.url));
        }
    }

    // CASO 2: Proteger rutas de ADMIN (solo admin y sucursal)
    if (pathname.startsWith('/admin')) {
        if (!isAuthenticated) {
            console.log('[middleware] No autenticado, redirigiendo a /login');
            return NextResponse.redirect(new URL('/login', request.url));
        }

        // Verificar que sea admin o sucursal
        if (userRole !== 'admin' && userRole !== 'sucursal') {
            console.log('[middleware] Usuario sin permisos de admin, redirigiendo a /inicio');
            return NextResponse.redirect(new URL('/inicio', request.url));
        }

        console.log('[middleware] Acceso permitido a /admin');
        return NextResponse.next();
    }

    // CASO 3: Proteger rutas de CLIENTE (solo clientes autenticados)
    if (pathname.startsWith('/inicio') || pathname.startsWith('/operacion') || pathname.startsWith('/mis-movimientos')) {
        if (!isAuthenticated) {
            console.log('[middleware] No autenticado, redirigiendo a /login');
            return NextResponse.redirect(new URL('/login', request.url));
        }

        // Verificar que NO sea admin o sucursal (solo clientes)
        if (userRole === 'admin' || userRole === 'sucursal') {
            console.log('[middleware] Admin/Sucursal intentando acceder a rutas de cliente, redirigiendo a /admin');
            return NextResponse.redirect(new URL('/admin', request.url));
        }

        console.log('[middleware] Acceso permitido a ruta de cliente');
        return NextResponse.next();
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        // Rutas de admin
        '/admin',
        '/admin/:path*',
        // Rutas de cliente
        '/inicio',
        '/inicio/:path*',
        '/operacion',
        '/operacion/:path*',
        '/mis-movimientos',
        '/mis-movimientos/:path*',
        // Rutas de autenticación
        '/login',
        '/register',
        '/forgotpassword',
    ],
};