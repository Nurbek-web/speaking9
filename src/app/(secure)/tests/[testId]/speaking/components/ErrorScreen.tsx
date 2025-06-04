'use client'

import { useEffect, useState } from 'react'
import { ErrorScreenProps } from './types'

const ErrorScreen: React.FC<ErrorScreenProps> = ({ error, onRetry, onBack }) => {
  const [showAnimation, setShowAnimation] = useState(false);
  
  // Trigger animation after component mounts
  useEffect(() => {
    const timer = setTimeout(() => setShowAnimation(true), 100);
    return () => clearTimeout(timer);
  }, []);
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted/50">
      <div className="w-full max-w-md px-6">
        {/* Error icon with animation */}
        <div className="flex justify-center mb-10">
          <div className={`relative h-24 w-24 rounded-full bg-red-50 dark:bg-red-950 flex items-center justify-center transition-all duration-700 ${showAnimation ? 'scale-100' : 'scale-90 opacity-80'}`}>
            <svg 
              className={`h-12 w-12 text-red-500 dark:text-red-400 transition-all duration-700 delay-300 ${showAnimation ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`} 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <div className={`absolute inset-0 border-2 border-red-200 dark:border-red-800 rounded-full transition-all duration-1000 ${showAnimation ? 'opacity-0 scale-150' : 'opacity-100 scale-100'}`}></div>
          </div>
        </div>
        
        {/* Error content */}
        <div className={`text-center mb-10 transition-all duration-500 delay-200 ${showAnimation ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <h1 className="text-2xl font-medium text-foreground mb-3">We encountered a problem</h1>
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-5 py-4 mb-4">
            <p className="text-red-700 dark:text-red-300 font-medium">{error}</p>
          </div>
          <p className="text-muted-foreground text-base">
            This might be due to a network issue, a problem with your account, 
            or the test may not be available at this time.
          </p>
        </div>
        
        {/* Action buttons */}
        <div className={`flex flex-col gap-3 transition-all duration-500 delay-400 ${showAnimation ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {onRetry && (
            <button 
              onClick={onRetry}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all duration-200 shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Try Again
            </button>
          )}
          
          {onBack && (
            <button 
              onClick={onBack}
              className="w-full py-3.5 bg-card hover:bg-muted text-card-foreground font-medium rounded-xl border border-border transition-all duration-200 shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-border focus:ring-offset-2"
            >
              Return to Tests
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorScreen; 