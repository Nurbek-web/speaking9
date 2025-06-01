import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import useSupabaseAuth from '@/hooks/useSupabaseAuth'
import { clerkToSupabaseId } from '@/lib/clerkSupabaseAdapter'

interface UseAuthReturn {
  user: any | null
  supabaseUserId: string | null
  supabase: any
  isLoading: boolean
  error: string | null
}

export function useAuth(): UseAuthReturn {
  const { user } = useUser()
  const router = useRouter()
  const { supabase, loading: supabaseLoading } = useSupabaseAuth()
  
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initialize authentication
  useEffect(() => {
    const initAuth = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Check if user is authenticated
        if (!user) {
          if (!supabaseLoading) {
            console.log('[useAuth] No authenticated user, redirecting to login')
            router.push('/sign-in')
          }
          return
        }

        // Convert Clerk ID to Supabase format
        const mappedId = clerkToSupabaseId(user.id)
        setSupabaseUserId(mappedId)
        
        console.log('[useAuth] Authentication successful:', mappedId)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Authentication failed'
        setError(errorMessage)
        console.error('[useAuth] Authentication error:', err)
      } finally {
        setIsLoading(false)
      }
    }

    if (!supabaseLoading) {
      initAuth()
    }
  }, [user, supabaseLoading, router])

  return {
    user,
    supabaseUserId,
    supabase,
    isLoading: isLoading || supabaseLoading,
    error
  }
} 