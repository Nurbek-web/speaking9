import React, { useState, useEffect, useRef } from 'react';

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
  const callbackRef = useRef(onComplete); // Store the callback in a ref to avoid stale closures
  
  // Animation state
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Update the callback ref when onComplete changes
  useEffect(() => {
    callbackRef.current = onComplete;
  }, [onComplete]);
  
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
    
    // Start animation after a small delay
    setTimeout(() => setIsAnimating(true), 100);
    
    intervalRef.current = setInterval(() => {
      const elapsedTimeMs = Date.now() - startTimeRef.current;
      const remainingSeconds = Math.max(0, initialSeconds - Math.floor(elapsedTimeMs / 1000));
      
      setTimeRemaining(remainingSeconds);
      
      // Check if timer completed
      if (remainingSeconds <= 0) {
        clearTimerInterval();
        console.log("[PreparationTimer] Timer complete, calling onComplete");
        callbackRef.current(); // Use the ref to avoid stale closure
      }
    }, 250);
    
    // Clean up interval on unmount or when initialSeconds changes
    return clearTimerInterval;
  }, [initialSeconds]); // Remove onComplete from dependencies to avoid re-initializing timer
  
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
    console.log("[PreparationTimer] Skip button clicked, calling onComplete directly");
    clearTimerInterval();
    // Use the callbackRef to ensure we have the latest version of the callback
    callbackRef.current();
  };
  
  // Calculate warning state
  const isWarning = timeRemaining <= 10;
  const strokeDasharray = 283; // 2 * PI * 45 (circle radius)
  const strokeDashoffset = strokeDasharray * (1 - progressPercentage / 100);
  
  return (
    <div className="flex flex-col items-center">
      {/* Circular timer */}
      <div className="relative w-48 h-48 mb-6">
        {/* Background circle */}
        <svg className="w-full h-full" viewBox="0 0 100 100">
          <circle
            className="text-gray-200"
            strokeWidth="4"
            stroke="currentColor"
            fill="transparent"
            r="45"
            cx="50"
            cy="50"
          />
          {/* Progress circle with animation */}
          <circle
            className={`${isWarning ? 'text-red-500' : 'text-indigo-500'} transition-colors duration-300`}
            strokeWidth="4"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r="45"
            cx="50"
            cy="50"
            style={{
              transition: isAnimating ? 'stroke-dashoffset 0.25s ease-in-out' : 'none'
            }}
          />
        </svg>
        
        {/* Time display in the center */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-bold ${isWarning ? 'text-red-600' : 'text-gray-800'} transition-colors duration-300`}>
            {formatTime(timeRemaining)}
          </span>
          <span className="text-sm text-gray-500 mt-1">remaining</span>
        </div>
        
        {/* Pulse animation for warning state */}
        {isWarning && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-full rounded-full bg-red-500 opacity-0 animate-ping absolute"></div>
          </div>
        )}
      </div>
      
      {/* Instructions */}
      <div className={`text-center mb-6 transition-opacity duration-300 ${isWarning ? 'opacity-60' : 'opacity-100'}`}>
        <p className="text-gray-600 max-w-xs">
          Use this time to prepare your answer. The timer will automatically end when it reaches zero.
        </p>
      </div>
      
      {/* Skip button */}
      <button
        onClick={handleSkip}
        className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-full text-gray-700 hover:bg-gray-50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2"
      >
        <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 4 15 12 5 20 5 4"></polygon>
          <line x1="19" y1="5" x2="19" y2="19"></line>
        </svg>
        <span>I'm ready, start now</span>
      </button>
    </div>
  );
};

export default PreparationTimer; 