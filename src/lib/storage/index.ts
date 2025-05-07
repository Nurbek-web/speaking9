import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

const BUCKET_NAME = 'user_recordings'

// Helper class to manage storage operations
export class StorageService {
  private supabase = createClientComponentClient()
  
  // Ensure the storage bucket exists
  async ensureBucketExists() {
    try {
      const { data: buckets } = await this.supabase.storage.listBuckets()
      
      const bucketExists = buckets?.some(bucket => bucket.name === BUCKET_NAME)
      
      if (!bucketExists) {
        await this.supabase.storage.createBucket(BUCKET_NAME, {
          public: true,
          allowedMimeTypes: ['audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/webm'],
          fileSizeLimit: 50000000 // 50MB limit
        })
      }
      
      // Make sure the bucket is set to public
      await this.supabase.storage.updateBucket(BUCKET_NAME, {
        public: true
      })
      
      return true
    } catch (error) {
      console.error('Error ensuring bucket exists:', error)
      return false
    }
  }
  
  // Upload audio file
  async uploadAudio(file: File, userId: string, fileId: string) {
    try {
      await this.ensureBucketExists()
      
      const filePath = `recordings/${userId}/${fileId}-${Date.now()}.${file.name.split('.').pop()}`
      
      const { data, error } = await this.supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        })
      
      if (error) throw error
      
      // Get the public URL
      const { data: { publicUrl } } = this.supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath)
      
      return publicUrl
    } catch (error) {
      console.error('Error uploading audio:', error)
      throw error
    }
  }
}

export const storageService = new StorageService()

export default storageService 