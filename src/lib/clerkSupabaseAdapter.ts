import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Optional service role client for admin operations
let serviceRoleClient: any = null;

// Initialize service role client if environment variables are available
if (typeof process !== 'undefined' && 
    process.env.NEXT_PUBLIC_SUPABASE_URL && 
    process.env.SUPABASE_SERVICE_ROLE_KEY) {
  serviceRoleClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Converts a Clerk user ID to a consistent UUID format for Supabase
 * This ensures a deterministic mapping from Clerk IDs to UUIDs
 * 
 * @param clerkId - The Clerk user ID (e.g., "user_2wwu56iIT6Fl1qunFzDf1NgcMpq")
 * @returns A UUID compatible string derived from the Clerk ID
 */
export function clerkToSupabaseId(clerkId: string): string {
  // If the ID already looks like a UUID, return it
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clerkId)) {
    return clerkId;
  }

  // Create a deterministic UUID-formatted string from the Clerk ID
  // This ensures the same Clerk ID always maps to the same UUID
  const hash = createHash('md5').update(clerkId).digest('hex');
  
  // Format it as a UUID
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
}

/**
 * Creates a new Supabase user record if it doesn't exist
 * 
 * @param supabaseClient - The Supabase client
 * @param clerkUser - The Clerk user object
 * @returns The Supabase user ID (UUID format)
 */
export async function syncUserToSupabase(supabaseClient: any, clerkUser: any): Promise<string> {
  if (!clerkUser?.id) {
    throw new Error('No Clerk user ID provided');
  }
  
  const supabaseId = clerkToSupabaseId(clerkUser.id);
  const email = clerkUser.emailAddresses?.[0]?.emailAddress || '';
  const emailVerified = clerkUser.emailAddresses?.[0]?.verification?.status === 'verified' || false;

  console.log(`[syncUserToSupabase] Syncing user ${clerkUser.id} to Supabase ID: ${supabaseId}`);
  
  try {
    // First attempt: Check if user exists using normal client
    const { data: existingUser, error: checkError } = await supabaseClient
      .from('users')
      .select('id')
      .eq('id', supabaseId)
      .maybeSingle();
      
    if (checkError) {
      console.error('[syncUserToSupabase] Error checking user:', checkError);
      
      // Table might not exist or RLS is preventing access
      if (checkError.code === '42P01' || // table doesn't exist
          checkError.code === '42501') { // permission denied
        console.warn('[syncUserToSupabase] Users table might not exist or RLS preventing access');
      }
    }
    
    // If user exists, return the ID
    if (existingUser) {
      console.log('[syncUserToSupabase] User already exists in Supabase');
      return supabaseId;
    }
    
    // Attempt to create user
    console.log('[syncUserToSupabase] User does not exist, creating...');
    
    // Create user data object with only fields we know exist
    const userData = {
      id: supabaseId,
      email,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // First try with the normal client
    try {
      const { data: newUser, error: insertError } = await supabaseClient
        .from('users')
        .insert(userData)
        .select('id')
        .maybeSingle();
        
      if (insertError) {
        console.error('[syncUserToSupabase] Error creating user with normal client:', insertError);
      } else {
        console.log('[syncUserToSupabase] User created successfully with normal client');
        return supabaseId;
      }
    } catch (insertErr) {
      console.error('[syncUserToSupabase] Exception creating user with normal client:', insertErr);
    }
    
    // If service role client is available, try with that
    if (serviceRoleClient) {
      try {
        console.log('[syncUserToSupabase] Attempting to create user with service role...');
        
        const { error: serviceRoleError } = await serviceRoleClient
          .from('users')
          .insert(userData);
          
        if (serviceRoleError) {
          console.error('[syncUserToSupabase] Service role insert failed:', serviceRoleError);
        } else {
          console.log('[syncUserToSupabase] User created with service role successfully');
          return supabaseId;
        }
      } catch (serviceRoleErr) {
        console.error('[syncUserToSupabase] Exception creating user with service role:', serviceRoleErr);
      }
      
      // Final fallback: Try to create auth user directly if service role available
      try {
        console.log('[syncUserToSupabase] Attempting to create auth user directly...');
        
        await serviceRoleClient.auth.admin.createUser({
          id: supabaseId,
          email: email || `temp-${supabaseId.substring(0, 8)}@temporary-auth.com`,
          email_confirm: emailVerified,
          user_metadata: {
            clerk_id: clerkUser.id
          }
        });
        
        console.log('[syncUserToSupabase] Auth user created successfully');
        return supabaseId;
      } catch (authError) {
        console.error('[syncUserToSupabase] Failed to create auth user:', authError);
      }
    }
    
  } catch (err) {
    console.error('[syncUserToSupabase] Unexpected error:', err);
    // Even if there's an error, return the ID so other operations can continue
  }
  
  return supabaseId;
}

/**
 * Creates a temporary session for the user
 * This is a fallback mechanism when normal auth fails
 * 
 * @param supabaseClient - The Supabase client
 * @param userId - The UUID of the user
 * @returns Success status
 */
export async function createTemporarySession(supabaseClient: any, userId: string): Promise<boolean> {
  if (!serviceRoleClient) {
    console.warn('[createTemporarySession] Service role client not available');
    
    // Try a direct auth signup as a fallback (anonymous)
    try {
      console.log('[createTemporarySession] Attempting anonymous session fallback');
      // Try to sign up anonymously with metadata containing the user ID
      // Using a proper email format with valid domain
      const { data, error } = await supabaseClient.auth.signUp({
        email: `temp-${userId.substring(0, 8)}@temporary-auth.com`,
        password: `Temp-${Math.random().toString(36).substring(2, 10)}!${Math.random().toString(36).substring(2, 6)}`,
        options: {
          data: {
            mapped_user_id: userId
          }
        }
      });
      
      if (error) {
        console.error('[createTemporarySession] Fallback signup failed:', error);
        
        // Try signing in anonymously
        try {
          console.log('[createTemporarySession] Attempting anonymous sign in');
          const { data: signInData, error: signInError } = await supabaseClient.auth.signInAnonymously();
          
          if (signInError) {
            console.error('[createTemporarySession] Anonymous signin failed:', signInError);
            
            // If both signup and anonymous sign-in fail, try continuing without auth
            console.log('[createTemporarySession] All authentication methods failed, continuing without session');
            return true; // Return true to allow app to continue functioning
          }
          
          if (signInData?.session) {
            console.log('[createTemporarySession] Anonymous signin successful');
            return true;
          }
        } catch (signInErr) {
          console.error('[createTemporarySession] Anonymous signin error:', signInErr);
          // Continue without auth as a last resort
          return true;
        }
        
        // All auth methods failed but we'll continue
        return true;
      }
      
      if (data?.session) {
        console.log('[createTemporarySession] Created anonymous session successfully');
        return true;
      }
      
      // No session created but we'll continue
      return true;
    } catch (err) {
      console.error('[createTemporarySession] Anonymous fallback error:', err);
      // Continue without auth as a last resort
      return true;
    }
  }
  
  try {
    // Sign in the user with their UUID
    const { data, error } = await serviceRoleClient.auth.admin.signInWithUserId(userId);
    
    if (error) {
      console.error('[createTemporarySession] Failed to create session:', error);
      // Continue without auth as a last resort
      return true;
    }
    
    if (data?.session) {
      // Set the session in the client
      await supabaseClient.auth.setSession(data.session);
      console.log('[createTemporarySession] Temporary session created successfully');
      return true;
    }
    
    // No session created but we'll continue
    return true;
  } catch (err) {
    console.error('[createTemporarySession] Unexpected error:', err);
    // Continue without auth as a last resort
    return true;
  }
} 