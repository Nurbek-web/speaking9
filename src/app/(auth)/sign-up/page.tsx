'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Icons } from "@/components/ui/icons"

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const { signUp, signInWithGoogle } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }

    setIsLoading(true)

    try {
      const { error, data } = await signUp(email, password)

      if (error) {
        setError(error.message)
      } else {
        // Check if email confirmation is required (user might already exist but unconfirmed)
        if (data?.user?.identities?.length === 0 || data?.session === null) {
           setSuccessMessage('Please check your email for a confirmation link.')
        } else {
           // If email confirmation is not required or user is auto-confirmed, redirect
           router.push('/tests')
        }
      }
    } catch (err: any) { // Catch any type of error
      setError(err.message || 'An unexpected error occurred')
      console.error('Sign up error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError(null)
    setIsGoogleLoading(true)
    try {
      await signInWithGoogle()
      // Redirect will happen automatically after OAuth flow
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred with Google sign in')
      console.error('Google sign in error:', err)
    } finally {
      // Don't set loading to false here, as the redirect should happen
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl">Create an account</CardTitle>
          <CardDescription>
            Enter your email below to create your account
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="rounded-md border border-green-500 bg-green-500/10 p-3 text-sm text-green-700">
              {successMessage}
            </div>
          )}
          {!successMessage && (
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading || isGoogleLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading || isGoogleLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading || isGoogleLoading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading || isGoogleLoading}>
                {isLoading && (
                  <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create account
              </Button>
            </form>
          )}
          
          {!successMessage && (
             <>
               <div className="relative">
                 <div className="absolute inset-0 flex items-center">
                   <span className="w-full border-t" />
                 </div>
                 <div className="relative flex justify-center text-xs uppercase">
                   <span className="bg-background px-2 text-muted-foreground">
                     Or continue with
                   </span>
                 </div>
               </div>
               <Button 
                 variant="outline" 
                 className="w-full" 
                 onClick={handleGoogleSignIn} 
                 disabled={isLoading || isGoogleLoading}
               >
                 {isGoogleLoading ? (
                   <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                 ) : (
                   <Icons.google className="mr-2 h-4 w-4" />
                 )}{ ' '}
                 Google
               </Button>
             </>
          )}
        </CardContent>
        <CardFooter className="text-sm">
           {!successMessage ? (
             <p className="text-muted-foreground w-full text-center">
               Already have an account?{' '}
               <Link
                 href="/sign-in"
                 className="font-medium text-primary underline-offset-4 hover:underline"
               >
                 Sign in
               </Link>
             </p>
           ) : (
             <p className="text-muted-foreground w-full text-center">
               Go back to {' '}
               <Link
                 href="/sign-in"
                 className="font-medium text-primary underline-offset-4 hover:underline"
               >
                 Sign in
               </Link>
             </p>
           )}
        </CardFooter>
      </Card>
    </div>
  )
} 