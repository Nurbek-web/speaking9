import React, { useEffect } from 'react';
import { SkipForward, Clock } from 'lucide-react';

// Format time for display
const formatTime = (seconds: number | null) => {
  if (seconds === null) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

interface CountdownDisplayProps {
  timeRemaining: number | null;
  timeTotal: number;
  mode: 'preparation' | 'speaking';
  onSkip?: () => void;
}

const CountdownDisplay: React.FC<CountdownDisplayProps> = ({ 
  timeRemaining, 
  timeTotal,
  mode,
  onSkip
}) => {
  // Use 0 as fallback for null values
  const safeTimeRemaining = timeRemaining ?? 0;
  const percentage = timeTotal > 0 ? (safeTimeRemaining / timeTotal) * 100 : 0;
  
  // Force non-zero minimum to avoid empty display
  const displayTime = Math.max(1, safeTimeRemaining);
  
  // Only show skip in speaking mode, since preparation has its own skip button
  const showSkip = mode === 'speaking' && onSkip !== undefined;
  
  // Add animation styles via useEffect
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      @keyframes timerPulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.05); opacity: 0.9; }
      }
      
      .timer-pulse {
        animation-name: timerPulse;
        animation-duration: 1.2s;
        animation-timing-function: ease-in-out;
        animation-iteration-count: infinite;
      }
    `;
    
    document.head.appendChild(styleElement);
    
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);
  
  // Determine color scheme based on mode and time remaining
  const getColorScheme = () => {
    if (mode === 'preparation') {
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-100',
        progressBg: 'bg-amber-100',
        progressFill: 'bg-amber-500',
        text: 'text-amber-800',
        icon: 'text-amber-500',
        animation: ''
      };
    }
    
    if (safeTimeRemaining < 10) {
      return {
        bg: 'bg-red-50',
        border: 'border-red-100',
        progressBg: 'bg-red-100',
        progressFill: 'bg-red-500',
        text: 'text-red-800',
        icon: 'text-red-500',
        animation: 'timer-pulse'
      };
    }
    
    if (safeTimeRemaining < 20) {
      return {
        bg: 'bg-orange-50',
        border: 'border-orange-100',
        progressBg: 'bg-orange-100',
        progressFill: 'bg-orange-500',
        text: 'text-orange-800',
        icon: 'text-orange-500',
        animation: ''
      };
    }
    
    return {
      bg: 'bg-indigo-50',
      border: 'border-indigo-100',
      progressBg: 'bg-indigo-100',
      progressFill: 'bg-indigo-500',
      text: 'text-indigo-800',
      icon: 'text-indigo-500',
      animation: ''
    };
  };
  
  const colors = getColorScheme();
  
  // Calculate circular progress for a more visually engaging timer
  const strokeWidth = 8;
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - percentage / 100);
  
  return (
    <div className="w-full max-w-md mx-auto">
      <div className={`
        w-full ${colors.bg} ${colors.border} border rounded-xl 
        shadow-sm p-6 flex flex-col items-center
        transition-all duration-300 ease-in-out
      `}>
        {/* Circle timer visualization */}
        <div className="relative w-36 h-36 mb-4">
          {/* Background circle */}
          <svg className="w-full h-full" viewBox="0 0 120 120">
            <circle 
              className={colors.progressBg}
              cx="60" 
              cy="60" 
              r={radius} 
              strokeWidth={strokeWidth}
              fill="none"
            />
            
            {/* Progress circle */}
            <circle 
              className={`${colors.progressFill} transition-all duration-300 ease-out`}
              cx="60" 
              cy="60" 
              r={radius}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 60 60)"
            />
            
            {/* Center icon */}
            <foreignObject x="30" y="30" width="60" height="60">
              <div className="w-full h-full flex items-center justify-center">
                <Clock className={`${colors.icon} h-6 w-6 opacity-20`} />
              </div>
            </foreignObject>
          </svg>
          
          {/* Timer text centered in the circle */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`text-4xl font-bold ${colors.text} ${colors.animation}`}>
              {formatTime(displayTime)}
            </div>
          </div>
        </div>
        
        <div className="text-center w-full mb-5">
          <div className="text-base font-medium text-gray-700 mb-1">
            {mode === 'preparation' ? 'Preparation Time' : 'Speaking Time'}
          </div>
          
          <div className="text-sm text-gray-500">
            {mode === 'preparation' ? 
              'Use this time to organize your thoughts' : 
              'Your answer is being recorded'
            }
          </div>
        </div>
        
        {/* Traditional progress bar (optional - for additional visual feedback) */}
        <div className="w-full h-2 mb-5 hidden">
          <div className={`w-full h-full ${colors.progressBg} rounded-full overflow-hidden`}>
            <div 
              className={`h-full ${colors.progressFill} transition-all duration-300 ease-out rounded-full`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
        
        {showSkip && (
          <button 
            onClick={onSkip}
            className={`
              px-5 py-2.5 bg-white hover:bg-gray-50 
              border border-gray-200 text-gray-700 
              font-medium rounded-full text-sm 
              flex items-center gap-2 transition-all duration-300
              hover:scale-105 hover:shadow-sm
            `}
            aria-label="Skip timer"
          >
            <span>Continue to next question</span>
            <SkipForward className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export { formatTime };
export default CountdownDisplay; 