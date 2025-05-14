import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = cookies()

  // Create a supabase client on the server with project's credentials
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          const cookie = cookieStore.get(name);
          let value = cookie?.value;
          
          // Handle code verifier cookie prefix
          if (name.includes('code-verifier') && value?.startsWith('base64-')) {
            console.warn(`[SupabaseServerClient WORKAROUND] Stripping "base64-" prefix from code-verifier: ${name}`);
            value = value.substring(7); // Length of "base64-"
          }
          
          return value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            let cleanedValue = value;
            // Check if it's a Supabase auth token cookie and if it has the erroneous prefix
            if ((name.startsWith('sb-') || name.startsWith('supabase-')) && value.startsWith('base64-')) {
              console.warn(`[SupabaseServerClient WORKAROUND] Stripping "base64-" prefix from cookie: ${name}`);
              cleanedValue = value.substring(7); // Length of "base64-"
            }
            
            // Important auth cookies logging
            if (name.includes('access') || name.includes('refresh') || name === 'supabase-auth-token' || name.includes('code-verifier')) {
              console.log(`[SupabaseServerClient] Setting cookie: ${name} (length: ${cleanedValue.length})`);
            }
            
            cookieStore.set({
              name,
              value: cleanedValue,
              ...options,
              // Ensure path is set correctly
              path: options.path || '/',
              // Make sure the SameSite attribute is compatible with OAuth flows
              sameSite: options.sameSite || 'lax',
            });
          } catch (error) {
            console.warn(`[SupabaseServerClient] Error setting cookie ${name}:`, error);
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            // Don't remove code verifier cookies during OAuth flow
            if (name.includes('code-verifier')) {
              console.log(`[SupabaseServerClient] Preserving code verifier cookie: ${name}`);
              return;
            }
            
            console.log(`[SupabaseServerClient] Removing cookie: ${name}`);
            cookieStore.set({
              name,
              value: '',
              ...options,
              path: options.path || '/',
            })
          } catch (error) {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
} 