// Environment variable validation and defaults
// These should match the ones you've configured in Clerk dashboard

/**
 * Clerk JWT template for Supabase integration
 * Ensure you've configured this in the Clerk dashboard
 * 
 * Template should include:
 * 1. A "role" claim with value "authenticated" 
 * 2. User metadata as needed
 */
export const CLERK_SUPABASE_TEMPLATE = 'supabase';

/**
 * Function to get the JWT Auth token from Clerk for a specific template
 * @param template JWT template name
 * @returns Promise with the token or null if not available
 */
export async function getClerkJWTForTemplate(template: string): Promise<string | null> {
  try {
    // For client-side, we can use window
    if (typeof window !== 'undefined') {
      const Clerk = (window as any)?.Clerk;
      
      if (Clerk?.session) {
        return await Clerk.session.getToken({ template });
      }
    }
    
    // No session available
    return null;
  } catch (error) {
    console.error(`[Clerk] Error getting JWT for template ${template}:`, error);
    return null;
  }
}

/**
 * Ensure that Clerk is properly configured
 * Called during app initialization to validate settings
 */
export function validateClerkConfig() {
  const publicKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  
  if (!publicKey) {
    console.warn('[Clerk] Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
  }
  
  const secretKey = process.env.CLERK_SECRET_KEY;
  
  if (!secretKey && process.env.NODE_ENV === 'production') {
    console.warn('[Clerk] Missing CLERK_SECRET_KEY in production');
  }
} 