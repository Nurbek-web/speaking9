'use client'

import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function SecureLayout({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const { user, isLoaded } = useUser()
  const router = useRouter()

  useEffect(() => {
    // If loaded and no user, redirect to sign-in
    if (isLoaded && !user) {
      router.push('/sign-in')
    }
  }, [isLoaded, user, router])

  // Show loading state while checking auth
  if (!isLoaded) {
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
