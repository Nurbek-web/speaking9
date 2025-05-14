import React from 'react';
import { formatTime } from './CountdownDisplay';

interface TimerDisplayProps {
  seconds: number | null;
  totalSeconds: number;
  isRecording?: boolean;
}

const TimerDisplay: React.FC<TimerDisplayProps> = ({ 
  seconds, 
  totalSeconds, 
  isRecording = false 
}) => {
  const safeSeconds = seconds ?? 0; // Nullish coalescing instead of logical OR
  const percentage = totalSeconds > 0 ? (safeSeconds / totalSeconds) * 100 : 0;
  
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={`absolute top-0 left-0 h-full ${isRecording ? 'bg-red-500' : 'bg-indigo-600'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className={`text-sm font-medium ${isRecording ? 'text-red-600' : 'text-gray-700'}`}>
        {formatTime(safeSeconds)}
      </div>
    </div>
  );
};

export default TimerDisplay; 