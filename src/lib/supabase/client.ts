import { createBrowserClient } from '@supabase/ssr'
import { useSession } from '@clerk/nextjs'
import { CLERK_SUPABASE_TEMPLATE } from '@/lib/clerk'

// Standard client without Clerk integration (for anonymous access)
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

// Create a Supabase client that uses Clerk's session token for authentication
export function createClientWithAuth() {
  const { session } = useSession();
  
  // Before creating the client, check for and fix any problematic cookies
  if (typeof window !== 'undefined') {
    fixCodeVerifierCookie();
  }
  
  // Create a Supabase client that uses Clerk's session token
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Use the Clerk session token for authentication with accessToken callback
        persistSession: false, // We don't need Supabase to persist the session
        autoRefreshToken: false, // Let Clerk handle token refreshing
        detectSessionInUrl: false, // Disable Supabase Auth's session detection
        flowType: 'pkce', // Use PKCE flow
      },
      global: {
        // Use Clerk's session token via the accessToken callback
        fetch: async (url, options = {}) => {
          const token = await session?.getToken({ template: CLERK_SUPABASE_TEMPLATE });
          
          if (token) {
            // Add authorization header with the token
            options.headers = {
              ...options.headers,
              Authorization: `Bearer ${token}`,
            };
          }
          
          // Use regular fetch with the enhanced options
          return fetch(url, options);
        },
      },
    }
  );
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