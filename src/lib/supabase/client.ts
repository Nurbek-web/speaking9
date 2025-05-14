import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Before creating the client, check for and fix any problematic cookies
  // This should only run on the client-side
  if (typeof window !== 'undefined') {
    fixCodeVerifierCookie();
  }
  
  // Create a supabase client on the browser with project's credentials
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
} 

// Fix the code verifier cookie if it has the base64 prefix
function fixCodeVerifierCookie() {
  // Ensure this runs only in the browser
  if (typeof document === 'undefined') {
    return;
  }
  try {
    const cookies = document.cookie.split(';');
    
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      
      if (name.includes('code-verifier') && value.startsWith('base64-')) {
        console.log('[SupabaseClient] Fixing code verifier cookie with base64 prefix');
        const fixedValue = value.substring(7); // Remove 'base64-' prefix
        
        // Set the fixed cookie
        document.cookie = `${name}=${fixedValue}; path=/; secure; SameSite=Lax`;
      }
    }
  } catch (error) {
    console.error('[SupabaseClient] Error fixing code verifier cookie:', error);
  }
} 