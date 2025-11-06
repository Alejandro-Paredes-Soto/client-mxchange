import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
const secretString = process.env.JWT_SECRET || 'your_jwt_secret_key';
const jwtSecret = new TextEncoder().encode(secretString);

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const token = request.cookies.get('token')?.value;

    // Verificar si el usuario está autenticado
    let isAuthenticated = false;
    let userRole: string | undefined;

    if (token) {
        try {
            const { payload } = await jwtVerify(token, jwtSecret, {
                algorithms: ['HS256']
            });
            isAuthenticated = true;
            userRole = (payload as { role?: string }).role;
        } catch (err) {
            // Token inválido o expirado
            isAuthenticated = false;
        }
    }

    // Redirigir usuarios autenticados que intentan acceder a rutas de auth
    const authRoutes = ['/login', '/register', '/forgotpassword'];
    const isAuthRoute = authRoutes.some(route => pathname.startsWith(route));

    if (isAuthenticated && isAuthRoute) {
        // Redirigir según el rol del usuario
        if (userRole === 'admin' || userRole === 'sucursal') {
            return NextResponse.redirect(new URL('/admin', request.url));
        } else {
            // Cliente u otro rol
            return NextResponse.redirect(new URL('/inicio', request.url));
        }
    }

    // Proteger rutas de admin
    if (pathname.startsWith('/admin')) {
        if (!token) {
            return NextResponse.redirect(new URL('/login', request.url));
        }

        console.log('[middleware] Token recibido:', token?.substring(0, 50) + '...');
        console.log('[middleware] Secret usado:', secretString?.substring(0, 10) + '...');

        // Decodifica sin verificar para ver el contenido
        const parts = token.split('.');
        if (parts.length === 3) {
            const header = JSON.parse(atob(parts[0]));
            const payload = JSON.parse(atob(parts[1]));
            console.log('[middleware] Header:', header);
            console.log('[middleware] Payload:', payload);
        }

        try {
            // Verifica con el mismo algoritmo que jsonwebtoken
            const { payload } = await jwtVerify(token, jwtSecret, {
                algorithms: ['HS256']
            });

            console.log('[middleware] JWT verified successfully');

            const role = (payload as { role?: string }).role;

            // Permitir acceso tanto a admin como a sucursal
            if (role !== 'admin' && role !== 'sucursal') {
                return NextResponse.redirect(new URL('/inicio', request.url));
            }

            return NextResponse.next();
        } catch (err) {
            console.error('[middleware] JWT verification failed:', err);
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/admin',
        '/admin/:path*',
        '/login',
        '/register',
        '/forgotpassword',
    ],
};