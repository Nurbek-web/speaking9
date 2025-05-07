'use client'

import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function ProtectedRoute({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // If not loading and no user, redirect to sign-in
    if (!isLoading && !user) {
      router.push('/sign-in')
    }
  }, [isLoading, user, router])

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="animate-spin rounded-full border-t-2 border-b-2 border-indigo-500 h-8 w-8"></div>
      </div>
    )
  }

  // If we have a user, render the children
  if (user) {
    return <>{children}</>
  }

  // Otherwise render nothing while redirecting
  return null
} 