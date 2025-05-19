import { useSession } from '@clerk/nextjs';
import { createBrowserClient } from '@supabase/ssr';
import { useState, useEffect } from 'react';
import { CLERK_SUPABASE_TEMPLATE } from '@/lib/clerk';

/**
 * A hook that provides a Supabase client with authentication from Clerk
 * This follows the official Supabase-Clerk integration pattern
 */
export function useSupabaseAuth() {
  const { session } = useSession();
  const [supabaseClient, setSupabaseClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState(false);

  useEffect(() => {
    async function initializeClient() {
      try {
        setLoading(true);
        
        // Create the client 
        const client = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            auth: {
              persistSession: false, // We don't need Supabase to persist the session
              autoRefreshToken: false, // Let Clerk handle token refreshing
              detectSessionInUrl: false, // Disable Supabase Auth detection
            },
            global: {
              fetch: async (url, options = {}) => {
                let token = null;
                const apiKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
                
                // ALWAYS ensure we have the anon key in headers
                options.headers = {
                  ...options.headers,
                  'apikey': apiKey,
                  'Content-Type': 'application/json',
                };
                
                if (!templateError) {
                  try {
                    // Try to get the token if session exists
                    if (session) {
                      token = await session.getToken({ template: CLERK_SUPABASE_TEMPLATE });
                      
                      // If we successfully got a token, clear any previous template error state
                      setTemplateError(false);
                    }
                  } catch (tokenError: any) {
                    console.error('[useSupabaseAuth] Error getting token:', tokenError);
                    
                    // Check if this is a missing template error
                    if (tokenError?.message?.includes('No JWT template exists')) {
                      console.warn(`[useSupabaseAuth] JWT template "${CLERK_SUPABASE_TEMPLATE}" is missing. ` +
                        `Please create it in the Clerk dashboard with the "role" claim set to "authenticated".`);
                      setTemplateError(true);
                      
                      // Log help instructions
                      console.info(`
                        [useSupabaseAuth] SETUP INSTRUCTIONS:
                        1. Go to Clerk Dashboard > JWT Templates
                        2. Create a new template named "${CLERK_SUPABASE_TEMPLATE}"
                        3. Add a claim "role" with value "authenticated"
                        4. Save the template
                      `);
                      
                      // Set an error message that can be displayed to the user
                      setError(`Authentication setup incomplete. Missing JWT template "${CLERK_SUPABASE_TEMPLATE}".`);
                    }
                  }
                }
                
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
        
        setSupabaseClient(client);
        
        // Only clear error if there's no template error
        if (!templateError) {
          setError(null);
        }
      } catch (err) {
        console.error('[useSupabaseAuth] Error initializing Supabase client:', err);
        
        // Check if we have a template error already
        if (!templateError) {
          setError('Failed to initialize authenticated Supabase client');
        }
      } finally {
        setLoading(false);
      }
    }
    
    initializeClient();
  }, [session, templateError]);
  
  // Return the client, loading state, and error
  return { 
    supabase: supabaseClient, 
    loading, 
    error,
    hasTemplateError: templateError // Expose template error state specifically
  };
}

export default useSupabaseAuth; 