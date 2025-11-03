import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
const secretString = process.env.JWT_SECRET || 'your_jwt_secret_key';
const jwtSecret = new TextEncoder().encode(secretString);

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (pathname.startsWith('/admin')) {
        const token = request.cookies.get('token')?.value;

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

            const userRole = (payload as { role?: string }).role;

            // Permitir acceso tanto a admin como a sucursal
            if (userRole !== 'admin' && userRole !== 'sucursal') {
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
    matcher: ['/admin', '/admin/:path*'],
};