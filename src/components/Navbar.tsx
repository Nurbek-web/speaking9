'use client'

import Link from 'next/link'
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LogIn, LogOut, User as UserIcon, LayoutDashboard, Menu } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useUser, useAuth, UserButton } from '@clerk/nextjs'
import { ThemeToggle } from './theme-toggle'

export default function Navbar() {
  const { user, isLoaded: isUserLoaded } = useUser()
  const { signOut } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  
  // Track scroll position for navbar styling
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10)
    }
    
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const userInitial = user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() || 'U'

  return (
    <nav 
      className={`bg-background/90 backdrop-blur-md transition-all duration-300 px-4 py-2 sticky top-0 z-50 ${
        scrolled ? 'shadow-sm border-b' : 'border-b border-transparent'
      }`}
    >
      <div className="flex justify-between items-center mx-auto max-w-screen-xl">
        <Link href="/" className="flex items-center py-1">
          {/* Text-only wordmark logo with Inter font */}
          <div className="py-1">
            <span className="font-bold text-xl tracking-tight text-foreground">
              speaking<span className="text-indigo-600">9</span>
            </span>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          <Link href="/" passHref>
            <Button variant="ghost" className="rounded-md font-medium transition-all hover:bg-muted">
              Home
            </Button>
          </Link>
          {user && (
            <Link href="/tests" passHref>
              <Button variant="ghost" className="rounded-md font-medium transition-all hover:bg-muted">
                Tests
              </Button>
            </Link>
          )}
          <ThemeToggle />
          {!isUserLoaded ? (
             <div className="w-8 h-8 rounded-full flex items-center justify-center">
               <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
             </div>
          ) : user ? (
            <UserButton 
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  userButtonBox: "h-9 w-9 rounded-full overflow-hidden border border-transparent hover:border-border transition-colors p-0 ml-1"
                }
              }}
            />
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/sign-in">
                <Button variant="ghost" className="rounded-md font-medium transition-all hover:bg-muted">
                  Sign in
                </Button>
              </Link>
              <Link href="/sign-up">
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium">
                  Sign up
                </Button>
              </Link>
            </div>
          )}
        </div>

        <div className="flex md:hidden items-center gap-1">
          <ThemeToggle />
           {!isUserLoaded ? (
             <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
           ) : (
             <DropdownMenu>
               <DropdownMenuTrigger asChild>
                 <Button variant="ghost" size="icon" className="rounded-md hover:bg-muted transition-colors">
                   <Menu className="h-6 w-6" />
                 </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="w-48 mt-1 border-border rounded-md">
                 <DropdownMenuItem asChild>
                   <Link href="/" className="w-full px-4 py-2 hover:bg-muted transition-colors">
                     Home
                   </Link>
                 </DropdownMenuItem>
                 {user ? (
                   <>
                     <DropdownMenuItem asChild>
                       <Link href="/tests" className="w-full px-4 py-2 hover:bg-muted transition-colors">
                         My Tests
                       </Link>
                     </DropdownMenuItem>
                     <DropdownMenuItem asChild>
                       <Link href="/profile" className="w-full px-4 py-2 hover:bg-muted transition-colors">
                         Profile
                       </Link>
                     </DropdownMenuItem>
                     <DropdownMenuSeparator />
                     <DropdownMenuItem onClick={() => signOut()} className="px-4 py-2 hover:bg-muted transition-colors">
                       Sign out
                     </DropdownMenuItem>
                   </>
                 ) : (
                   <>
                     <DropdownMenuSeparator />
                     <DropdownMenuItem asChild>
                       <Link href="/sign-in" className="w-full px-4 py-2 hover:bg-muted transition-colors">
                         Sign in
                       </Link>
                     </DropdownMenuItem>
                     <DropdownMenuItem asChild>
                       <Link href="/sign-up" className="w-full px-4 py-2 hover:bg-muted transition-colors font-medium text-indigo-600">
                         Sign up
                       </Link>
                     </DropdownMenuItem>
                   </>
                 )}
               </DropdownMenuContent>
             </DropdownMenu>
            )}
        </div>
      </div>
    </nav>
  )
} 