'use client'

import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
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

export default function Navbar() {
  const { user, signOut, isLoading } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  
  // Track scroll position for navbar styling
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10)
    }
    
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const userInitial = user?.email?.[0]?.toUpperCase() || 'U'

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
            <span className="font-bold text-xl tracking-tight text-gray-900">
              speaking<span className="text-indigo-600">9</span>
            </span>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          <Link href="/" passHref>
            <Button variant="ghost" className="rounded-md font-medium transition-all hover:bg-gray-100 dark:hover:bg-gray-800">
              Home
            </Button>
          </Link>
          {user && (
            <Link href="/tests" passHref>
              <Button variant="ghost" className="rounded-md font-medium transition-all hover:bg-gray-100 dark:hover:bg-gray-800">
                Tests
              </Button>
            </Link>
          )}
          {isLoading ? (
             <div className="w-8 h-8 rounded-full flex items-center justify-center">
               <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
             </div>
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full overflow-hidden border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-colors p-0 ml-1">
                  <Avatar className="h-8 w-8">
                     {/* Add AvatarImage if you store user profile pictures */}
                     {/* <AvatarImage src={user.imageUrl || undefined} alt={user.email || 'User Avatar'} /> */}
                    <AvatarFallback className="bg-indigo-600 text-white font-medium">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 mt-1 overflow-hidden border border-gray-200 dark:border-gray-800 rounded-md" align="end" forceMount>
                <DropdownMenuLabel className="font-normal bg-gray-50 dark:bg-gray-900 px-4 py-3">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.email?.split('@')[0] || 'User'}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                   <Link href="/profile" className="flex items-center w-full cursor-pointer px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                     <UserIcon className="mr-2 h-4 w-4 text-indigo-600" /> Profile
                   </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                   <Link href="/tests" className="flex items-center w-full cursor-pointer px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                     <LayoutDashboard className="mr-2 h-4 w-4 text-indigo-600" /> My Tests
                   </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()} className="px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                  <LogOut className="mr-2 h-4 w-4 text-indigo-600" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/sign-in" passHref>
                <Button variant="ghost" className="rounded-md font-medium transition-all hover:bg-gray-100 dark:hover:bg-gray-800">
                  Sign in
                </Button>
              </Link>
              <Link href="/sign-up" passHref>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium">
                  Sign up
                </Button>
              </Link>
            </div>
          )}
        </div>

        <div className="flex md:hidden items-center">
           {isLoading ? (
             <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
           ) : (
             <DropdownMenu>
               <DropdownMenuTrigger asChild>
                 <Button variant="ghost" size="icon" className="rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                   <Menu className="h-6 w-6" />
                 </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="w-48 mt-1 border border-gray-200 dark:border-gray-800 rounded-md">
                 <DropdownMenuItem asChild>
                   <Link href="/" className="w-full px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                     Home
                   </Link>
                 </DropdownMenuItem>
                 {user ? (
                   <>
                     <DropdownMenuItem asChild>
                       <Link href="/tests" className="w-full px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                         My Tests
                       </Link>
                     </DropdownMenuItem>
                     <DropdownMenuItem asChild>
                       <Link href="/profile" className="w-full px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                         Profile
                       </Link>
                     </DropdownMenuItem>
                     <DropdownMenuSeparator />
                     <DropdownMenuItem onClick={() => signOut()} className="px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                       Sign out
                     </DropdownMenuItem>
                   </>
                 ) : (
                   <>
                     <DropdownMenuSeparator />
                     <DropdownMenuItem asChild>
                       <Link href="/sign-in" className="w-full px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                         Sign in
                       </Link>
                     </DropdownMenuItem>
                     <DropdownMenuItem asChild>
                       <Link href="/sign-up" className="w-full px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors font-medium text-indigo-600">
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