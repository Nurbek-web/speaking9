'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { LoadingScreenProps } from './types'

const LoadingScreen: React.FC<LoadingScreenProps> = ({ stage, message }) => {
  // Stages: 0 = auth, 1 = data loading, 2 = environment prep
  const [progress, setProgress] = useState(0);
  
  // Animate progress smoothly
  useEffect(() => {
    const targetProgress = Math.min(((stage + 1) / 3) * 100, 100);
    let start: number | null = null;
    const duration = 800; // Animation duration in ms
    
    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const nextProgress = Math.min(
        progress + (targetProgress - progress) * (elapsed / duration),
        targetProgress
      );
      
      setProgress(nextProgress);
      
      if (elapsed < duration && nextProgress < targetProgress) {
        requestAnimationFrame(animate);
      }
    };
    
    const animation = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animation);
  }, [stage, progress]);
  
  // Get stage-specific messages
  const stageMessages = [
    "Verifying your credentials",
    "Loading your test questions",
    "Preparing your speaking environment"
  ];
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-background to-muted/50">
      <div className="w-full max-w-md px-6">
        {/* Logo placeholder */}
        <div className="flex justify-center mb-12">
          <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" x2="12" y1="19" y2="22"></line>
            </svg>
          </div>
        </div>
        
        {/* Main content */}
        <div className="text-center mb-12">
          <h1 className="text-2xl font-medium text-foreground mb-2">{message}</h1>
          <p className="text-muted-foreground text-base">
            {stageMessages[stage] || "Setting up your test"}
          </p>
        </div>
        
        {/* Progress bar */}
        <div className="w-full mb-8">
          <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          
          {/* Progress steps */}
          <div className="flex justify-between mt-4">
            {[0, 1, 2].map((stepStage) => (
              <div key={stepStage} className="flex flex-col items-center">
                <div 
                  className={`w-3 h-3 rounded-full mb-2 transition-all duration-300 ${
                    stepStage <= stage 
                      ? 'bg-blue-500 scale-110' 
                      : 'bg-muted'
                  }`}
                ></div>
                <span className={`text-xs ${
                  stepStage <= stage 
                    ? 'text-blue-500 font-medium' 
                    : 'text-muted-foreground'
                }`}>
                  Step {stepStage + 1}
                </span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Helpful text */}
        <p className="text-center text-sm text-muted-foreground">
          {stage === 0 && "We're verifying your account credentials"}
          {stage === 1 && "Loading your personalized test questions"}
          {stage === 2 && "Preparing the microphone and scoring system"}
        </p>
      </div>
    </div>
  );
};

export default LoadingScreen; 