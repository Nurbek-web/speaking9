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
 * Checks if a user ID is a temporary ID
 * Temporary IDs start with 'temp-' or 'emergency-'
 * 
 * @param userId - The user ID to check
 * @returns True if the ID is temporary
 */
export function isTemporaryId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return userId.startsWith('temp-') || userId.startsWith('emergency-');
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
 * Create an anonymous user in the database
 * This is a fallback when normal authentication fails
 * 
 * @param supabaseClient - The Supabase client
 * @param userId - The user ID to create
 * @returns Success status
 */
export async function tryCreateAnonymousUser(supabaseClient: any, userId: string): Promise<boolean> {
  if (!userId) return false;
  
  try {
    console.log(`[tryCreateAnonymousUser] Creating anonymous user: ${userId}`);
    
    // Try to insert the user into anonymous_users table
    const { data, error } = await supabaseClient
      .from('anonymous_users')
      .upsert({ 
        id: userId,
        created_at: new Date().toISOString()
      })
      .select()
      .maybeSingle();
      
    if (error) {
      console.error('[tryCreateAnonymousUser] Error creating anonymous user:', error);
      
      // Despite the error, we'll still store the ID locally
      // This allows the app to function even if DB writes fail
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('app_user_id', userId);
          console.log('[tryCreateAnonymousUser] Saved ID to localStorage despite DB error');
        } catch (e) {
          console.error('[tryCreateAnonymousUser] Error saving to localStorage:', e);
        }
      }
      
      // If it's a policy violation, check if the user already exists
      if (error.code === '42501') { // Permission denied
        try {
          // Try reading instead of writing
          const { data: existingUser } = await supabaseClient
            .from('anonymous_users')
            .select('id')
            .eq('id', userId)
            .maybeSingle();
            
          if (existingUser) {
            console.log('[tryCreateAnonymousUser] User already exists, ignoring policy error');
            return true;
          }
        } catch (readError) {
          console.error('[tryCreateAnonymousUser] Error checking existing user:', readError);
        }
      }
      
      return false;
    }
    
    console.log('[tryCreateAnonymousUser] Anonymous user created successfully');
    
    // Store the ID in localStorage for future use
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('app_user_id', userId);
      } catch (e) {
        console.error('[tryCreateAnonymousUser] Error saving to localStorage:', e);
      }
    }
    
    return true;
  } catch (err) {
    console.error('[tryCreateAnonymousUser] Unexpected error:', err);
    
    // Still store the ID locally despite the error
    if (typeof window !== 'undefined' && userId) {
      try {
        localStorage.setItem('app_user_id', userId);
        console.log('[tryCreateAnonymousUser] Saved ID to localStorage as fallback');
      } catch (e) {
        console.error('[tryCreateAnonymousUser] Error saving to localStorage:', e);
      }
    }
    
    return false;
  }
}

/**
 * Create a temporary user ID
 * This is used when no authentication is available
 * 
 * @returns A temporary user ID
 */
export function createTemporaryUserId(): string {
  const tempId = `temp-${Math.random().toString(36).substring(2, 10)}-${Date.now()}`;
  
  // Store the user ID in localStorage for future use
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('app_user_id', tempId);
    } catch (e) {
      console.error('[createTemporaryUserId] Error saving to localStorage:', e);
    }
  }
  
  return tempId;
}

/**
 * Synchronizes a Clerk user to Supabase database
 * This ensures the user exists in the Supabase database, creating if needed
 * 
 * @param supabaseClient - The Supabase client
 * @param clerkUser - The Clerk user object
 * @returns The Supabase UUID for the user
 */
export async function syncUserToSupabase(supabaseClient: any, clerkUser: any): Promise<string> {
  if (!clerkUser?.id) {
    throw new Error('No Clerk user ID provided');
  }
  
  const supabaseId = clerkToSupabaseId(clerkUser.id);
  const email = clerkUser.emailAddresses?.[0]?.emailAddress || '';
  const emailVerified = clerkUser.emailAddresses?.[0]?.verification?.status === 'verified' || false;

  console.log(`[syncUserToSupabase] Syncing user ${clerkUser.id} to Supabase ID: ${supabaseId}`);
  
  // First check if we already have this ID in anonymous_users table - this is our fail-safe
  try {
    const { data: existingAnon } = await supabaseClient
      .from('anonymous_users')
      .select('id')
      .eq('id', supabaseId)
      .maybeSingle();
      
    if (existingAnon) {
      console.log('[syncUserToSupabase] User already exists in anonymous_users');
      return supabaseId;
    }
  } catch (anonError) {
    // Anonymous table might not exist yet, that's OK
    console.log('[syncUserToSupabase] Could not check anonymous_users:', anonError);
  }
  
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
        
        // If this is a foreign key constraint error, bypass the users table entirely
        if (insertError.code === '23503' && insertError.message.includes('foreign key constraint')) {
          console.log('[syncUserToSupabase] Foreign key constraint detected, bypassing users table');
          
          // Insert into anonymous_users instead
          try {
            const { data: anonUser, error: anonError } = await supabaseClient
              .from('anonymous_users')
              .upsert({ id: supabaseId, created_at: new Date().toISOString() })
              .select('id')
              .maybeSingle();
              
            if (anonError) {
              console.error('[syncUserToSupabase] Failed to insert into anonymous_users:', anonError);
            } else {
              console.log('[syncUserToSupabase] Successfully inserted into anonymous_users');
              return supabaseId;
            }
          } catch (anonInsertErr) {
            console.error('[syncUserToSupabase] Exception creating anonymous user:', anonInsertErr);
          }
        }
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
    // Create a fallback entry in anonymous_users as last resort
    try {
      const { data: anonUser, error: anonError } = await supabaseClient
        .from('anonymous_users')
        .upsert({ id: supabaseId, created_at: new Date().toISOString() })
        .select('id')
        .maybeSingle();
        
      if (anonError) {
        console.error('[syncUserToSupabase] Failed in final fallback to anonymous_users:', anonError);
      } else {
        console.log('[syncUserToSupabase] Successfully inserted as fallback into anonymous_users');
      }
    } catch (anonErr) {
      console.error('[syncUserToSupabase] Final fallback failed:', anonErr);
    }
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
    
    // Try with a better formatted email first (with gmail domain)
    try {
      console.log('[createTemporarySession] Attempting valid email format session fallback');
      // Use a proper email format with a valid domain
      const { data, error } = await supabaseClient.auth.signUp({
        email: `temp-${userId.substring(0, 8)}@gmail.com`, // Use gmail domain which is more likely to be accepted
        password: `Temp-${Math.random().toString(36).substring(2, 10)}!${Math.random().toString(36).substring(2, 6)}`,
        options: {
          data: {
            mapped_user_id: userId
          }
        }
      });
      
      if (error) {
        console.error('[createTemporarySession] Fallback signup failed:', error);
        
        // Try manual cookie/session storage if signup methods fail
        console.log('[createTemporarySession] Authentication methods failed, using local identifier');
        
        // Store the user ID in localStorage for client-side tracking
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('app_user_id', userId);
            console.log('[createTemporarySession] Saved user ID to localStorage');
          } catch (storageErr) {
            console.error('[createTemporarySession] Could not access localStorage:', storageErr);
          }
        }
        
        // Allow the application to continue without auth
        return true;
      }
      
      if (data?.session) {
        console.log('[createTemporarySession] Created email-based session successfully');
        return true;
      }
      
      // No session created but we'll continue
      return true;
    } catch (err) {
      console.error('[createTemporarySession] Session fallback error:', err);
      // Continue without auth as a last resort
      return true;
    }
  }
  
  try {
    // Sign in the user with their UUID using service role client
    const { data, error } = await serviceRoleClient.auth.admin.signInWithUserId(userId);
    
    if (error) {
      console.error('[createTemporarySession] Failed to create service role session:', error);
      // Continue without auth as a last resort
      return true;
    }
    
    if (data?.session) {
      // Set the session in the client
      await supabaseClient.auth.setSession(data.session);
      console.log('[createTemporarySession] Temporary session created successfully via service role');
      return true;
    }
    
    // No session created but we'll continue
    return true;
  } catch (err) {
    console.error('[createTemporarySession] Unexpected error with service role:', err);
    // Continue without auth as a last resort
    return true;
  }
} 