'use client'

import { Loader2 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { LoadingScreenProps } from './types'

const LoadingScreen: React.FC<LoadingScreenProps> = ({ stage, message }) => {
  // Stages: 0 = auth, 1 = data loading, 2 = environment prep
  const progressValue = Math.min(((stage + 1) / 3) * 100, 100);
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-6">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mb-4" />
          <h2 className="text-xl font-semibold text-gray-800">{message}</h2>
          <p className="text-gray-500 text-sm mt-2">
            {stage === 0 && "Checking your account..."}
            {stage === 1 && "Loading your test questions..."}
            {stage === 2 && "Setting up test environment..."}
          </p>
        </div>
        
        <div className="space-y-3">
          <Progress
            value={progressValue}
            className="h-2 w-full"
          />
          <p className="text-xs text-gray-500 text-center">This shouldn't take long</p>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen; 