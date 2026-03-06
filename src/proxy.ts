import { auth } from '@/lib/auth'
import { buildContentSecurityPolicy } from '@/lib/csp'
import { NextResponse } from 'next/server'

// Protected routes - require authentication
const protectedRoutes = ['/admin']

// Public routes that should redirect authenticated users
const authRoutes = ['/auth/signin', '/auth/signup']

// Built once at server startup. Env changes still require a process restart.
const cspHeader = buildContentSecurityPolicy({
  rawScriptOrigins: process.env.HEAD_INJECT_SCRIPT_ORIGINS || '',
  allowUnsafeInlineScript: process.env.CSP_ALLOW_UNSAFE_INLINE_SCRIPT !== 'false',
})

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const path = req.nextUrl.pathname

  // Check if the route is protected
  const isProtectedRoute = protectedRoutes.some((route) => path.startsWith(route))
  const isAuthRoute = authRoutes.some((route) => path.startsWith(route))

  // Redirect to login if trying to access protected route without authentication
  if (isProtectedRoute && !isLoggedIn) {
    const response = NextResponse.redirect(new URL('/auth/signin', req.url))
    response.headers.set('Content-Security-Policy', cspHeader)
    return response
  }

  // Redirect to admin if already logged in and trying to access auth routes
  if (isAuthRoute && isLoggedIn) {
    const response = NextResponse.redirect(new URL('/admin', req.url))
    response.headers.set('Content-Security-Policy', cspHeader)
    return response
  }

  const response = NextResponse.next()
  // Override the build-time CSP from next.config.ts with runtime-aware version.
  response.headers.set('Content-Security-Policy', cspHeader)
  return response
})

// Routes that proxy should not run on
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
