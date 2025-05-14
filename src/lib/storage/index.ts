import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { createTemporarySession } from "@/lib/clerkSupabaseAdapter"

const BUCKET_NAME = 'recordings'

// Helper class to manage storage operations
export class StorageService {
  private supabase = createClientComponentClient()
  
  // Function to check if bucket exists (optional, can be removed if relying on manual creation)
  async checkBucketExists() {
    try {
      const { data: buckets, error } = await this.supabase.storage.listBuckets()
      if (error) {
        console.error('StorageService: Error listing buckets:', error)
        return false // Assume doesn't exist or cannot verify
      }
      const bucketExists = buckets?.some(bucket => bucket.name === BUCKET_NAME)
      if (!bucketExists) {
        console.warn(`StorageService: Storage bucket "${BUCKET_NAME}" not found.`)
      }
      return bucketExists
    } catch (error) {
      console.error('StorageService: Error checking bucket existence:', error)
      return false
    }
  }
  
  // Upload audio file
  async uploadAudio(file: File, userId: string, fileId: string): Promise<string | null> {
    // Validate inputs to avoid errors
    if (!file) {
      console.error('StorageService: Missing file for upload');
      return null;
    }
    
    if (!userId) {
      console.warn('StorageService: No user ID provided, using data URL fallback');
      return await this.createDataUrl(file);
    }
    
    // Generate a filepath that includes userId and fileId with timestamp to avoid collisions
    const filePath = `${userId}/${fileId}-${Date.now()}.wav`;
    
    try {
      // First check if we have a valid session
      const { data: { session }, error: sessionError } = await this.supabase.auth.getSession();
      
      if (sessionError) {
        console.error('StorageService: Session error:', sessionError);
        return await this.createDataUrl(file);
      }
      
      if (!session) {
        console.log('StorageService: No valid session found for upload, attempting to create session');
        
        try {
          // Try to create a temporary session
          const sessionCreated = await createTemporarySession(this.supabase, userId);
          if (!sessionCreated) {
            console.warn('StorageService: Could not create temporary session');
            return await this.createDataUrl(file);
          }
        } catch (sessionCreationError) {
          console.error('StorageService: Error creating temporary session:', sessionCreationError);
          return await this.createDataUrl(file);
        }
      }
      
      console.log(`StorageService: Attempting to upload to bucket: "${BUCKET_NAME}", path: "${filePath}"`);
      
      // Try to upload the file
      const { data, error } = await this.supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });
      
      // If there's an error, log it and fall back to data URL
      if (error) {
        console.error('StorageService: Error uploading file:', error.message);
        
        // Check if this might be a bucket existence issue
        if (error.message.includes('bucket') || 
            (typeof error === 'object' && 'statusCode' in error && error.statusCode === 404)) {
          console.warn('StorageService: Bucket may not exist, checking...');
          const bucketExists = await this.checkBucketExists();
          console.log(`StorageService: Bucket check result: ${bucketExists ? 'exists' : 'does not exist'}`);
        }
        
        // Check if this is an auth error
        if ((typeof error === 'object' && 'statusCode' in error && error.statusCode === 401) || 
            error.message.includes('auth') || 
            error.message.includes('permission')) {
          console.warn('StorageService: Authentication error, falling back to data URL');
        }
        
        return await this.createDataUrl(file);
      }
      
      // If upload was successful, get the public URL
      try {
        const { data: publicUrlData } = await this.supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(data.path);
        
        if (publicUrlData.publicUrl) {
          console.log('StorageService: Upload successful, returning public URL');
          return publicUrlData.publicUrl;
        } else {
          console.warn('StorageService: Missing public URL, falling back to data URL');
          return await this.createDataUrl(file);
        }
      } catch (urlError) {
        console.error('StorageService: Error getting public URL:', urlError);
        return await this.createDataUrl(file);
      }
    } catch (error) {
      console.error('StorageService: Upload failed with exception:', error);
      // Fall back to data URL
      return await this.createDataUrl(file);
    }
  }
  
  // Upload recording (convenience method for Blob based recordings)
  async uploadRecording(blob: Blob, path: string): Promise<string | null> {
    // Convert Blob to File for compatibility with uploadAudio
    const parts = path.split('/');
    if (parts.length < 2) {
      console.error('StorageService: Invalid path format, expected userId/fileId');
      return this.createDataUrl(blob);
    }
    
    const userId = parts[0];
    const fileId = parts[1].split('.')[0]; // Remove extension if present
    
    // Convert Blob to File object
    const file = new File([blob], `${fileId}.webm`, { 
      type: blob.type || 'audio/webm' 
    });
    
    return this.uploadAudio(file, userId, fileId);
  }
  
  // Create a data URL for the Blob (for fallback when storage uploads fail)
  async createDataUrl(blob: Blob | File): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        console.log('StorageService: Creating data URL as fallback');
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            console.log('StorageService: Data URL created successfully');
            resolve(reader.result);
          } else {
            reject(new Error('StorageService: Failed to convert blob to data URL'));
          }
        };
        reader.onerror = () => {
          console.error('StorageService: FileReader error:', reader.error);
          reject(reader.error);
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        console.error('StorageService: Error creating data URL:', error);
        reject(error);
      }
    });
  }
}

export const storageService = new StorageService()

export default storageService 