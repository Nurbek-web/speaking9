import React, { useState, useEffect, useRef } from 'react';
import { Progress } from '@/components/ui/progress';
import { ClipboardList, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PreparationTimerProps {
  initialSeconds: number;
  onComplete: () => void;
}

const PreparationTimer: React.FC<PreparationTimerProps> = ({ 
  initialSeconds, 
  onComplete 
}) => {
  const [timeRemaining, setTimeRemaining] = useState(initialSeconds);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  
  // Cleanup function to clear interval
  const clearTimerInterval = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };
  
  useEffect(() => {
    console.log(`[PreparationTimer] Starting timer with ${initialSeconds} seconds`);
    setTimeRemaining(initialSeconds);
    startTimeRef.current = Date.now();
    
    intervalRef.current = setInterval(() => {
      const elapsedTimeMs = Date.now() - startTimeRef.current;
      const remainingSeconds = Math.max(0, initialSeconds - Math.floor(elapsedTimeMs / 1000));
      
      setTimeRemaining(remainingSeconds);
      
      // Check if timer completed
      if (remainingSeconds <= 0) {
        clearTimerInterval();
        console.log("[PreparationTimer] Timer complete");
        onComplete();
      }
    }, 250);
    
    // Clean up interval on unmount or when initialSeconds changes
    return clearTimerInterval;
  }, [initialSeconds, onComplete]);
  
  // Progress percentage (inverted for countdown)
  const progressPercentage = Math.max(0, (timeRemaining / initialSeconds) * 100);
  
  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle skip button click
  const handleSkip = () => {
    console.log("[PreparationTimer] Skip button clicked, calling onComplete");
    clearTimerInterval();
    onComplete();
  };
  
  return (
    <div className="p-6 bg-amber-50 rounded-lg border border-amber-200 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-5 w-5 text-amber-600" />
          <h3 className="font-medium text-amber-800">Preparation Time</h3>
        </div>
        <Button 
          onClick={handleSkip}
          className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1"
          size="sm"
        >
          <SkipForward size={16} />
          <span>Skip Preparation</span>
        </Button>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium text-amber-800">Time Remaining</span>
          <span className="text-amber-900 font-mono">{formatTime(timeRemaining)}</span>
        </div>
        
        <Progress
          value={progressPercentage}
          className="h-2 bg-amber-200"
        />
        
        <p className="text-sm mt-4 text-amber-700">
          Use this time to prepare your answer. Click "Skip Preparation" when ready.
        </p>
      </div>
    </div>
  );
};

export default PreparationTimer; 