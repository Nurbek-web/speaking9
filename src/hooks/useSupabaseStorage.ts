import { useCallback } from 'react';
import { useSupabaseAuth } from './useSupabaseAuth';
import { useSupabaseAnonymous } from './useSupabaseAnonymous';
import { isTemporaryId } from '@/lib/clerkSupabaseAdapter';

/**
 * A hook that provides access to Supabase storage
 * Works with both authenticated and anonymous users
 */
export function useSupabaseStorage() {
  const { supabase: authSupabase, loading: authLoading, error: authError } = useSupabaseAuth();
  const { supabase: anonSupabase, anonymousId, loading: anonLoading, error: anonError } = useSupabaseAnonymous();

  // Loading and error states are derived from both auth systems
  const loading = authLoading || anonLoading;
  const error = authError || anonError;

  // Determine which client to use and add required headers for temp IDs
  const getSupabaseClient = useCallback(() => {
    // For authenticated users, prefer the auth client
    if (authSupabase && !authError) {
      return { client: authSupabase, headers: {} };
    }
    
    // For anonymous users, use the anonymous client with user_id header
    if (anonSupabase && anonymousId) {
      // For temporary IDs, we need to add the user_id header
      if (isTemporaryId(anonymousId)) {
        return { 
          client: anonSupabase, 
          headers: { 'user_id': anonymousId } 
        };
      }
      return { client: anonSupabase, headers: {} };
    }
    
    // Fallback to any available client
    if (authSupabase) {
      return { client: authSupabase, headers: {} };
    }
    
    if (anonSupabase) {
      return { client: anonSupabase, headers: {} };
    }
    
    return null;
  }, [authSupabase, authError, anonSupabase, anonymousId]);

  // Get presigned URL for uploads
  const getUploadUrl = useCallback(async (
    bucket: string,
    path: string,
    options?: {
      transform?: {
        width?: number;
        height?: number;
        resize?: 'cover' | 'contain' | 'fill';
      };
    }
  ) => {
    const clientInfo = getSupabaseClient();
    if (!clientInfo) {
      throw new Error('No Supabase client available');
    }
    
    const { client, headers } = clientInfo;
    
    try {
      const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(
        path,
        { ...(options || {}) }
      );
      
      if (error) {
        throw error;
      }
      
      // Return the signed URL and any headers needed for temp users
      return {
        signedUrl: data.signedUrl,
        path: data.path, 
        headers
      };
    } catch (err) {
      console.error('[useSupabaseStorage] Error getting upload URL:', err);
      throw err;
    }
  }, [getSupabaseClient]);

  // Upload file directly (not using presigned URL)
  const uploadFile = useCallback(async (
    bucket: string,
    path: string,
    file: File,
    options?: {
      cacheControl?: string;
      upsert?: boolean;
    }
  ) => {
    const clientInfo = getSupabaseClient();
    if (!clientInfo) {
      throw new Error('No Supabase client available');
    }
    
    const { client, headers } = clientInfo;
    
    try {
      // For temporary IDs, we need to pass the headers as options
      const uploadOptions = {
        ...(options || {}),
        ...(Object.keys(headers).length > 0 ? { headers } : {})
      };
      
      const { data, error } = await client.storage.from(bucket).upload(
        path,
        file,
        uploadOptions
      );
      
      if (error) {
        throw error;
      }
      
      return {
        path: data.path
      };
    } catch (err) {
      console.error('[useSupabaseStorage] Error uploading file:', err);
      throw err;
    }
  }, [getSupabaseClient]);

  // Get download URL
  const getPublicUrl = useCallback((
    bucket: string,
    path: string
  ) => {
    const clientInfo = getSupabaseClient();
    if (!clientInfo) {
      // Public URLs can be generated without a client if we have the URL format
      return {
        publicUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
      };
    }
    
    const { client } = clientInfo;
    
    try {
      const { data } = client.storage.from(bucket).getPublicUrl(path);
      return {
        publicUrl: data.publicUrl
      };
    } catch (err) {
      console.error('[useSupabaseStorage] Error getting public URL:', err);
      // Return a fallback URL using the known format
      return {
        publicUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
      };
    }
  }, [getSupabaseClient]);

  // Delete file
  const deleteFile = useCallback(async (
    bucket: string,
    path: string
  ) => {
    const clientInfo = getSupabaseClient();
    if (!clientInfo) {
      throw new Error('No Supabase client available');
    }
    
    const { client, headers } = clientInfo;
    
    try {
      // For temporary IDs, pass headers directly in options if needed
      const options = Object.keys(headers).length > 0 ? { headers } : undefined;
      
      const { error } = await client.storage.from(bucket).remove([path], options);
      
      if (error) {
        throw error;
      }
      
      return true;
    } catch (err) {
      console.error('[useSupabaseStorage] Error deleting file:', err);
      throw err;
    }
  }, [getSupabaseClient]);

  return {
    uploadFile,
    getUploadUrl,
    getPublicUrl,
    deleteFile,
    loading,
    error
  };
} 