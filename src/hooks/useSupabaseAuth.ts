import { useSession } from '@clerk/nextjs';
import { createBrowserClient } from '@supabase/ssr';
import { useState, useEffect } from 'react';

/**
 * A hook that provides a Supabase client with authentication from Clerk
 * This follows the new official Supabase-Clerk integration pattern
 */
export function useSupabaseAuth() {
  const { session } = useSession();
  const [supabaseClient, setSupabaseClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initializeClient() {
      try {
        setLoading(true);
        
        // Create the client using the new Clerk integration approach
        const client = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            // Use Clerk session tokens directly (new approach)
            accessToken: async () => session?.getToken() ?? null,
          }
        );
        
        setSupabaseClient(client);
        setError(null);
      } catch (err) {
        console.error('[useSupabaseAuth] Error initializing client:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize Supabase client');
      } finally {
        setLoading(false);
      }
    }

    initializeClient();
  }, [session]);

  return {
    supabase: supabaseClient,
    loading,
    error
  };
}

export default useSupabaseAuth; 