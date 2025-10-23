import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const jwtSecret = process.env.JWT_SECRET || 'secretkey';

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Protect admin routes
    if (pathname.startsWith('/admin')) {
        const token = request.cookies.get('token')?.value;

        // No token - redirect to login
        if (!token) {
            return NextResponse.redirect(new URL('/login', request.url));
        }

        try {
            // Verify and decode token
            const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload & { role?: string };
            console.log('Decoded JWT:', decoded);
            // Check if user has admin role
            if (decoded.role !== 'admin') {
                // Client or other roles - redirect to inicio
                return NextResponse.redirect(new URL('/inicio', request.url));
            }

            // Valid admin token - allow access
            return NextResponse.next();
        } catch (err) {
            // Invalid or expired token - redirect to login
            console.error('JWT verification failed:', err);
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    // Non-admin routes - allow access
    return NextResponse.next();
}

export const config = {
    matcher: ['/admin/:path*'],
};