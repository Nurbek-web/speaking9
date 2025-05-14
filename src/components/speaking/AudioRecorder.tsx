import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, SkipForward, ChevronRight, Loader2, Undo, AlertCircle, Clock } from 'lucide-react';
import { RecordingStatus } from './types';
import useRecorder from '@/hooks/useRecorder';

interface AudioRecorderProps {
  questionId: string;
  partType: 'standard' | 'cue_card';
  questionDuration: number;
  preparationDuration?: number;
  initialAudioURL?: string;
  isMuted: boolean;
  onAudioReady: (questionId: string, blob: Blob, url: string) => void;
  onNavigateNext: () => void;
  onSkipQuestion: (questionId: string) => void;
  onSkipRemainingTime: (questionId: string) => void;
  onMainTimerUpdate?: (seconds: number) => void;
  onPreparationComplete?: () => void;
  onError: (message: string) => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({
  questionId,
  partType,
  questionDuration,
  isMuted,
  initialAudioURL,
  onAudioReady,
  onNavigateNext,
  onSkipQuestion,
  onSkipRemainingTime,
  onMainTimerUpdate,
  onError
}) => {
  // State
  const [audioURL, setAudioURL] = useState<string | null>(initialAudioURL || null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [timerDisplay, setTimerDisplay] = useState<number | null>(null);
  const [showVisualizer, setShowVisualizer] = useState(false);
  const [isFinishingUp, setIsFinishingUp] = useState(false);
  
  // Refs
  const userActionRef = useRef<string>('idle');
  const showPreparation = false; // We're not handling preparation in this component anymore
  const visualizerBarsRef = useRef<number[]>([]);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Generate random heights for visualizer on first render
  useEffect(() => {
    // Generate 40 random values between 10 and 45 for the visualizer bars
    visualizerBarsRef.current = Array.from({ length: 40 }, () => 
      Math.floor(Math.random() * 35) + 10
    );
  }, []);

  // Effect to reset on questionId change
  useEffect(() => {
    setAudioURL(initialAudioURL || null);
    setAudioError(null);
    setErrorMessage(null);
    setIsNavigating(false);
    setIsFinishingUp(false);
    userActionRef.current = 'idle';
    
    // Clear any existing processing timeout
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
  }, [questionId, initialAudioURL]);

  // Ensure we're updating the parent timer
  useEffect(() => {
    if (timerDisplay !== null && onMainTimerUpdate) {
      onMainTimerUpdate(timerDisplay);
    }
  }, [timerDisplay, onMainTimerUpdate]);

  const handleAudioReadyCallback = useCallback((blob: Blob, url: string) => {
    // Clear any processing timeout since audio is now ready
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    
    const clonedBlob = new Blob([blob], { type: blob.type });
    setAudioURL(url);
    // Always inform parent that audio is ready (even if it's an empty/skipped recording)
    onAudioReady(questionId, clonedBlob, url); 
    setIsFinishingUp(false);
    
    const currentAction = userActionRef.current;
    userActionRef.current = 'idle'; // Reset action after processing its intent

    if (currentAction === 'userSkipped') {
      // Skip was already handled in handleSkip, do nothing here
      // This prevents duplicate skip actions
    } else if (currentAction === 'timerExpired') {
      // If timer expired, then navigate
      setTimeout(() => onNavigateNext(), 100); // Small delay
    }
    // Removed the ambiguous `else if (isNavigating)` block.
    // setIsNavigating(false) should be handled if still needed, based on 'userSkipped' or other explicit actions.
    if (currentAction === 'userSkipped' || currentAction === 'timerExpired') {
        setIsNavigating(false); // Reset navigation flag if an action leading to potential navigation was processed
    }
  }, [questionId, onAudioReady, onSkipQuestion, onNavigateNext, userActionRef]);

  const handleStatusChangeCallback = useCallback((status: RecordingStatus) => {
    setShowVisualizer(status === 'recording');
    if (status === 'error') {
      setTimerDisplay(null);
    }
    if (status === 'stopping') {
      setIsFinishingUp(true);
      
      // Set a timeout to recover from a stuck processing state
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
      
      processingTimeoutRef.current = setTimeout(() => {
        if (isFinishingUp) {
          // Still in finishing up state after timeout, assume processing completed
          setIsFinishingUp(false);
          onError('Audio processing took too long. The recording might be incomplete.');
        }
      }, 10000); // 10-second timeout
    }
    
    if (status === 'completed' || status === 'stopped') {
      setIsFinishingUp(false);
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
    }
  }, [questionId, onError, isFinishingUp]);

  const handleTimerUpdateCallback = useCallback((seconds: number) => {
    if (!showPreparation) {
      setTimerDisplay(seconds);
      if (onMainTimerUpdate) {
        onMainTimerUpdate(seconds);
      }
    }
  }, [onMainTimerUpdate, showPreparation]);

  const handleErrorCallback = useCallback((msg: string) => {
    setAudioError(msg);
    onError(msg);
  }, [questionId, onError]);

  const {
    isRecording,
    recordingStatus,
    userAction,
    startRecording,
    stopRecording,
  } = useRecorder({
    isMuted: isMuted,
    onAudioReady: handleAudioReadyCallback,
    onRecordingStatusChange: handleStatusChangeCallback,
    onTimerChange: handleTimerUpdateCallback,
    onError: handleErrorCallback
  });

  // Auto-start recording when the component mounts
  useEffect(() => {
    if (recordingStatus === 'idle' && !isRecording && !audioURL) {
      startRecording(questionDuration);
    }
  }, [questionId, recordingStatus, isRecording, audioURL, startRecording, questionDuration]);

  // Recording logic
  const handleStartRecording = useCallback(() => {
    setAudioError(null);
    userActionRef.current = 'wantsToRecord';
    startRecording(questionDuration);
  }, [questionId, recordingStatus, startRecording, questionDuration]);

  const handleSkip = useCallback(() => {
    setAudioError(null);
    if (isRecording) {
      userActionRef.current = 'userSkipped'; // Signal that the stop is due to a user skip
      setIsNavigating(true); // Indicate that a navigation might follow this skip
      stopRecording(true); // Stop the recording
      // Let the MainTestUI component handle navigation via its own handler
    } else {
      // Not recording, directly inform parent about the skip
      onSkipQuestion(questionId);
      // MainTestUI (parent) is responsible for navigation after a skip.
    }
  }, [isRecording, stopRecording, questionId, onSkipQuestion, userActionRef]);

  // Add new function to handle skipping remaining time
  const handleSkipRemainingTime = useCallback(() => {
    setAudioError(null);
    if (isRecording) {
      userActionRef.current = 'timerExpired'; // Similar to timer expiring
      stopRecording(false); // Stop the recording but don't discard it
      onSkipRemainingTime(questionId); // Inform parent about skipping remaining time
    } else {
      // If not recording, treat as a regular navigation
      onNavigateNext();
    }
  }, [isRecording, stopRecording, questionId, onSkipRemainingTime, userActionRef, onNavigateNext]);

  const renderTimer = () => {
    if (timerDisplay === null) return '--:--';
    const minutes = Math.floor(timerDisplay / 60);
    const seconds = timerDisplay % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Get timing color based on remaining time
  const getTimerColor = () => {
    if (timerDisplay === null) return 'text-indigo-700';
    if (timerDisplay <= 10) return 'text-red-600';
    if (timerDisplay <= 20) return 'text-amber-600';
    return 'text-indigo-700';
  };

  // Render audio visualizer with optimized animation
  const renderAudioVisualizer = () => {
    if (!showVisualizer) return null;

    return (
      <div className="w-full my-4 h-16 bg-black/5 rounded-2xl overflow-hidden relative">
        <div className="absolute inset-0 flex items-center justify-center gap-1">
          {visualizerBarsRef.current.map((height, i) => (
            <div 
              key={i}
              className="w-1.5 rounded-full bg-indigo-500 opacity-80"
              style={{
                height: `${showVisualizer ? height : 5}px`,
                animationDuration: `${0.3 + Math.random() * 0.5}s`,
                animationName: 'visualizerBar',
                animationTimingFunction: 'ease-in-out',
                animationIterationCount: 'infinite',
                animationDirection: 'alternate',
                animationDelay: `${i * 0.05}s`
              }}
            />
          ))}
        </div>
      </div>
    );
  };

  // Add the visualizer animation style to the document head
  useEffect(() => {
    // Create a style element for our animation
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      @keyframes visualizerBar {
        0% { height: 5px; }
        100% { height: 45px; }
      }
      
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.1); opacity: 0.8; }
      }
      
      .timer-pulse {
        animation-name: pulse;
        animation-duration: 1s;
        animation-timing-function: ease-in-out;
        animation-iteration-count: infinite;
      }
    `;
    
    // Add it to the document head
    document.head.appendChild(styleElement);
    
    // Clean up on unmount
    return () => {
      document.head.removeChild(styleElement);
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center space-y-6 p-8 bg-white rounded-xl shadow-sm border border-gray-100">
      {/* Main recording interface */}
      <div className="flex flex-col items-center w-full max-w-md">
        {/* Timer Display with Skip Button */}
        <div className="relative w-full flex justify-center mb-4">
          <div className={`
            flex items-center justify-center 
            w-32 h-32 rounded-full 
            ${isRecording ? 'bg-red-50 border-red-100' : 'bg-indigo-50 border-indigo-100'} 
            border-4 transition-colors duration-300
            ${timerDisplay !== null && timerDisplay <= 10 && isRecording ? 'timer-pulse' : ''}
          `}>
            <span className={`text-3xl font-bold ${getTimerColor()} transition-colors duration-300`}>
              {timerDisplay !== null ? renderTimer() : recordingStatus === 'processing' ? '...' : '--:--'}
            </span>
          </div>
          
          {/* Small skip button (only during recording) */}
          {isRecording && !isFinishingUp && !isNavigating && (
            <>
              <button 
                onClick={handleSkip}
                className="absolute -right-3 -top-3 p-2 rounded-full bg-white border border-gray-200 hover:bg-gray-50 
                         text-gray-500 hover:text-gray-700 transition-colors duration-200 shadow-sm"
                title="Skip question completely"
                aria-label="Skip question completely"
              >
                <SkipForward className="h-5 w-5" />
              </button>
              <button 
                onClick={handleSkipRemainingTime}
                className="absolute -left-3 -top-3 p-2 rounded-full bg-white border border-amber-200 hover:bg-amber-50 
                         text-amber-500 hover:text-amber-700 transition-colors duration-200 shadow-sm"
                title="Skip remaining time"
                aria-label="Skip remaining time"
              >
                <Clock className="h-5 w-5" />
              </button>
            </>
          )}
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
          ) : recordingStatus === 'processing' || isFinishingUp ? (
            <div className="flex items-center text-amber-600 font-medium">
              <Loader2 className="h-3 w-3 mr-2 animate-spin" />
              Saving your recording...
            </div>
          ) : recordingStatus === 'stopped' || recordingStatus === 'completed' ? (
            <div className="flex items-center text-green-600 font-medium">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              Recording saved
            </div>
          ) : (
            <div className="flex items-center text-gray-600 font-medium">
              Ready to record
            </div>
          )}
        </div>

        {/* Audio Visualizer */}
        {renderAudioVisualizer()}
      </div>

      {/* Error Messages */}
      {(audioError || errorMessage) && (
        <div className="w-full max-w-md text-red-500 text-sm p-3 bg-red-50 rounded-lg flex items-start">
          <AlertCircle className="h-4 w-4 mt-0.5 mr-2 flex-shrink-0" /> 
          <span>{audioError || errorMessage}</span>
        </div>
      )}
      
      {/* Continue button for completed recording */}
      {(recordingStatus === 'completed' || recordingStatus === 'stopped') && !isFinishingUp && !isNavigating && (
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

      {/* Playback */}
      {audioURL && !isRecording && recordingStatus !== 'processing' && !isFinishingUp && (
        <div className="w-full max-w-md p-4 bg-gray-50 rounded-xl border border-gray-100 mt-3">
          <div className="mb-2 text-sm font-medium text-gray-700">Review your answer:</div>
          <audio key={audioURL} controls src={audioURL} className="w-full h-10 audio-player">
            Your browser does not support audio playback.
          </audio>
        </div>
      )}
      
      {/* Development tools - only in dev mode */}
      {process.env.NODE_ENV !== 'production' && (
        <Button 
          onClick={async () => {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            
            const dest = audioContext.createMediaStreamDestination();
            gainNode.connect(dest);
            
            const chunks: Blob[] = [];
            const recorder = new MediaRecorder(dest.stream);
            
            recorder.ondataavailable = (e) => chunks.push(e.data);
            recorder.onstop = () => {
              const blob = new Blob(chunks, { type: 'audio/wav' });
              const url = URL.createObjectURL(blob);
              handleAudioReadyCallback(blob, url);
              audioContext.close();
            };
            
            oscillator.start();
            recorder.start();
            setTimeout(() => {
              recorder.stop();
              oscillator.stop();
            }, 1000);
          }}
          variant="ghost"
          className="text-xs text-gray-500"
        >
          Generate Test Audio (Dev)
        </Button>
      )}
    </div>
  );
};

export default AudioRecorder; 