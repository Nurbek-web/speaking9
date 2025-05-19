import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { tryCreateAnonymousUser, createTemporaryUserId } from '@/lib/clerkSupabaseAdapter';

/**
 * A hook that provides anonymous access to Supabase
 * with a temporary user ID for tracking purposes
 */
export function useSupabaseAnonymous() {
  const [supabaseClient, setSupabaseClient] = useState<any>(null);
  const [anonymousId, setAnonymousId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initializeAnonymousClient() {
      try {
        setLoading(true);
        
        // Get or create a temporary ID
        let tempId: string | null = null;
        
        // First try to get from localStorage
        if (typeof window !== 'undefined') {
          try {
            tempId = localStorage.getItem('app_user_id');
          } catch (e) {
            console.error('[useSupabaseAnonymous] Error accessing localStorage:', e);
          }
        }
        
        // If no existing ID, create a new one
        if (!tempId) {
          tempId = createTemporaryUserId();
          console.log('[useSupabaseAnonymous] Created new temporary ID:', tempId);
        } else {
          console.log('[useSupabaseAnonymous] Using existing temporary ID:', tempId);
        }
        
        // Set the anonymous ID in state
        setAnonymousId(tempId);
        
        // Create client with anon key
        const apiKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        
        const client = createBrowserClient(
          apiUrl,
          apiKey,
          {
            global: {
              fetch: async (url, options = {}) => {
                // Ensure the API key is included in all requests
                options.headers = {
                  ...options.headers,
                  'apikey': apiKey,
                  'Content-Type': 'application/json',
                };
                
                return fetch(url, options);
              },
            }
          }
        );
        
        setSupabaseClient(client);
        
        // Ensure the anonymous user exists in database
        if (tempId) {
          await tryCreateAnonymousUser(client, tempId);
        }
        
        setError(null);
      } catch (initError) {
        console.error('[useSupabaseAnonymous] Error initializing anonymous Supabase client:', initError);
        setError('Failed to initialize anonymous Supabase client');
      } finally {
        setLoading(false);
      }
    }
    
    initializeAnonymousClient();
  }, []);

  return { supabase: supabaseClient, anonymousId, loading, error };
}

export default useSupabaseAnonymous; 