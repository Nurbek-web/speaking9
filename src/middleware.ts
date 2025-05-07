import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/middleware'

// This middleware intercepts requests and adds Supabase auth refresh and session handling
export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  
  // Create a Supabase client for the middleware
  const supabase = createClient(request, response)

  // Get the user's session
  const { data: { session } } = await supabase.auth.getSession()

  // Check auth condition for protected pages
  const isProtectedRoute = request.nextUrl.pathname.startsWith('/tests') ||
                          request.nextUrl.pathname.startsWith('/dashboard')
  
  const isAuthRoute = request.nextUrl.pathname.startsWith('/sign-in') ||
                     request.nextUrl.pathname.startsWith('/sign-up')

  // If user is trying to access a protected page and is not authenticated, redirect to login
  if (isProtectedRoute && !session) {
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  // If user is authenticated and trying to access login/signup pages, redirect to tests page
  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL('/tests', request.url))
  }

  return response
}

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     * - api/auth (auth API routes)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|api/auth).*)',
  ],
} 