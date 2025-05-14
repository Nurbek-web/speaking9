'use client'

import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ErrorScreenProps } from './types'

const ErrorScreen: React.FC<ErrorScreenProps> = ({ error, onRetry, onBack }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <div className="max-w-md w-full mx-auto p-6">
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-5 w-5 mr-2" />
          <AlertTitle>Error Loading Test</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        
        <div className="text-center space-y-4">
          <p className="text-gray-600">
            We encountered a problem loading your test. This might be due to a network issue,
            a problem with your account, or the test may not be available.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
            {onRetry && (
              <Button onClick={onRetry} variant="outline">
                Try Again
              </Button>
            )}
            
            {onBack && (
              <Button onClick={onBack}>
                Return to Tests
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorScreen; 