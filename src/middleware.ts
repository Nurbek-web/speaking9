import { clerkMiddleware } from "@clerk/nextjs/server";

// Use the basic middleware with simpler configuration
export default clerkMiddleware();

// Fix the route conflict by using a simpler matcher pattern
export const config = {
  matcher: [
    // Protect specific routes
    "/tests/:path*",
    "/profile/:path*",
    "/dashboard/:path*",
    
    // Include API routes
    "/api/:path*"
  ]
}; 

