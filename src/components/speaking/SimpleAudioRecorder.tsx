import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, ChevronRight, Loader2 } from 'lucide-react';
import useAudioManager from '@/hooks/useAudioManager';
import SimpleAudioPlayer from './SimpleAudioPlayer';

interface SimpleAudioRecorderProps {
  questionId: string;
  duration?: number;
  onComplete: (questionId: string, blob: Blob, url: string) => void;
  onNavigateNext: () => void;
}

const SimpleAudioRecorder: React.FC<SimpleAudioRecorderProps> = ({
  questionId,
  duration = 60,
  onComplete,
  onNavigateNext
}) => {
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'complete'>('idle');
  const [timerDisplay, setTimerDisplay] = useState<number | null>(null);
  const [hasRecordingCompleted, setHasRecordingCompleted] = useState(false);
  
  // Add ref to prevent duplicate recording attempts
  const hasStartedRecordingRef = useRef(false);
  // Add ref to store cleanup function from recordAudio
  const cleanupFunctionRef = useRef<(() => void) | null>(null);

  // Memoize callbacks to prevent infinite rerenders
  const handleRecordingComplete = useCallback((id: string, blob: Blob, url: string) => {
    // Set local state
    setRecordingStatus('complete');
    setHasRecordingCompleted(true);
    
    // Notify parent only once
    if (id === questionId && !hasRecordingCompleted) {
      console.log(`[SimpleAudioRecorder] Recording complete for ${id}, notifying parent`);
      onComplete(id, blob, url);
    }
  }, [questionId, onComplete, hasRecordingCompleted]);

  const handleRecordingError = useCallback((errorMsg: string) => {
    console.error(`[SimpleAudioRecorder] Error: ${errorMsg}`);
    setRecordingStatus('idle');
  }, []);

  // Initialize audio manager with memoized callbacks
  const {
    isRecording,
    recordingUrl,
    recordingBlob,
    error,
    recordAudio,
    stopRecording
  } = useAudioManager({
    onRecordingComplete: handleRecordingComplete,
    onRecordingError: handleRecordingError
  });

  // Method to force stop the recording early (for Skip Remaining Time)
  const stopRecordingEarly = useCallback(() => {
    console.log(`[SimpleAudioRecorder] Stopping recording early for ${questionId}`);
    
    // First try to use the cleanup function from recordAudio
    if (cleanupFunctionRef.current) {
      console.log(`[SimpleAudioRecorder] Using cleanup function for ${questionId}`);
      cleanupFunctionRef.current();
      cleanupFunctionRef.current = null;
    }
    
    // Also use the stopRecording method as a backup
    stopRecording(questionId);
    
    // Set recording state to avoid showing recording UI
    setRecordingStatus('complete');

    // If we don't have recording data yet but MediaRecorder is active,
    // let's add a fallback mechanism to force the recording to finish
    if (!recordingBlob && !recordingUrl) {
      console.log(`[SimpleAudioRecorder] No recording data yet for ${questionId}, setting timer for fallback check`);
      
      // Set a timer to check if recording data is available after a short delay
      setTimeout(() => {
        // Get fresh recording data from the audio manager
        const recording = (window as any).globalAudioStore?.recordings?.[questionId];
        if (recording) {
          console.log(`[SimpleAudioRecorder] Fallback found recording for ${questionId} after delay`);
          if (!hasRecordingCompleted && recording.blob && recording.url) {
            console.log(`[SimpleAudioRecorder] Notifying parent of recording via fallback for ${questionId}`);
            setHasRecordingCompleted(true);
            onComplete(questionId, recording.blob, recording.url);
          }
        } else {
          console.log(`[SimpleAudioRecorder] No recording found for ${questionId} after delay`);
        }
      }, 500);
    }
  }, [questionId, stopRecording, recordingBlob, recordingUrl, hasRecordingCompleted, onComplete]);

  // Start timer when recording begins
  useEffect(() => {
    let timerInterval: NodeJS.Timeout | null = null;
    
    if (isRecording) {
      const endTime = Date.now() + (duration * 1000);
      
      // Set initial display
      setTimerDisplay(duration);
      
      // Start interval to update timer
      timerInterval = setInterval(() => {
        const secondsRemaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        setTimerDisplay(secondsRemaining);
        
        // Stop timer when it reaches 0
        if (secondsRemaining === 0 && timerInterval) {
          clearInterval(timerInterval);
        }
      }, 250);
    } else {
      // Reset timer when not recording
      setTimerDisplay(null);
    }
    
    // Cleanup
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [isRecording, duration]);

  // Start recording automatically when component mounts, but only once
  useEffect(() => {
    const startRecordingAsync = async () => {
      // Only start recording if we haven't already for this question
      if (!hasStartedRecordingRef.current) {
        hasStartedRecordingRef.current = true;
        
        // Set local state first
        setRecordingStatus('recording');
        
        // Start recording via manager
        console.log(`[SimpleAudioRecorder] Starting recording for ${questionId}`);
        const cleanup = await recordAudio(questionId, duration);
        
        // Store cleanup function for early termination
        if (typeof cleanup === 'function') {
          cleanupFunctionRef.current = cleanup;
        }
      }
    };
    
    startRecordingAsync();
    
    // Reset the ref when component unmounts and call cleanup function
    return () => {
      hasStartedRecordingRef.current = false;
      if (cleanupFunctionRef.current) {
        cleanupFunctionRef.current();
        cleanupFunctionRef.current = null;
      }
    };
  }, [questionId, duration, recordAudio]);

  // Listen for skip remaining time actions from parent via prop
  useEffect(() => {
    // This could be wired up to an external event or prop if needed
    // For now, we'll expose the stopRecordingEarly method to the window 
    // for testing/debugging
    (window as any).__stopRecordingEarly = stopRecordingEarly;
    
    return () => {
      // Clean up
      delete (window as any).__stopRecordingEarly;
    };
  }, [stopRecordingEarly]);

  // Format timer display
  const formatTime = (seconds: number | null): string => {
    if (seconds === null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get style for timer based on remaining time
  const getTimerColor = (): string => {
    if (timerDisplay === null) return 'text-gray-600';
    if (timerDisplay <= 10) return 'text-red-600';
    if (timerDisplay <= 20) return 'text-amber-600';
    return 'text-indigo-700';
  };

  return (
    <div className="flex flex-col items-center space-y-6 p-8 bg-white rounded-xl shadow-sm border border-gray-100">
      {/* Timer Display */}
      <div className={`flex items-center justify-center 
        w-28 h-28 rounded-full 
        ${isRecording ? 'bg-red-50 border-red-100' : 'bg-indigo-50 border-indigo-100'} 
        border-4 transition-colors duration-300`}
      >
        <span className={`text-3xl font-bold ${getTimerColor()} transition-colors duration-300`}>
          {formatTime(timerDisplay)}
        </span>
      </div>
      
      {/* Recording Status */}
      <div className="text-center mb-2">
        {isRecording ? (
          <div className="flex items-center text-red-600 font-medium">
            <span className="flex h-3 w-3 relative mr-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            Recording your answer
          </div>
        ) : recordingStatus === 'complete' ? (
          <div className="flex items-center text-green-600 font-medium">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            Recording saved
          </div>
        ) : (
          <div className="flex items-center text-gray-600 font-medium">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Preparing...
          </div>
        )}
      </div>
      
      {/* Audio playback */}
      {recordingUrl && recordingBlob && (
        <div className="w-full max-w-md p-4 bg-gray-50 rounded-xl border border-gray-100 mt-3">
          <div className="mb-2 text-sm font-medium text-gray-700">Review your answer:</div>
          <SimpleAudioPlayer 
            src={recordingUrl} 
            blob={recordingBlob} 
          />
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="w-full max-w-md text-red-500 text-sm p-3 bg-red-50 rounded-lg">
          <div className="flex items-start">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mt-0.5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}
      
      {/* Continue button */}
      {recordingStatus === 'complete' && (
        <div className="flex flex-col items-center w-full max-w-md">
          <Button
            onClick={onNavigateNext}
            className="bg-indigo-600 hover:bg-indigo-700 py-2.5 px-6 text-white flex items-center justify-center gap-2 transition-all duration-300 ease-in-out transform hover:scale-105"
          >
            <ChevronRight className="h-5 w-5" />
            Continue to next question
          </Button>
        </div>
      )}
    </div>
  );
};

// Export the component and also expose the stopRecordingEarly method
export default SimpleAudioRecorder; 