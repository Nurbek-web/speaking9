import { useState, useRef, useEffect, useCallback } from 'react';

// A global store for audio recordings to prevent duplicates
const globalAudioStore: {
  recordings: Record<string, {
    blob: Blob;
    url: string; 
    timestamp: number;
    processed: boolean;
  }>;
  activeRecordings: Set<string>; // Track which recordings are currently in progress
} = {
  recordings: {},
  activeRecordings: new Set()
};

// Type definitions
interface AudioRecording {
  blob: Blob;
  url: string;
  timestamp: number;
}

type AudioManagerState = {
  currentQuestionId: string | null;
  isRecording: boolean;
  recordingUrl: string | null;
  recordingBlob: Blob | null;
  audioDuration: number | null;
  error: string | null;
};

/**
 * Custom hook for managing audio recordings globally
 * This approach completely bypasses the React component flow
 * to prevent duplicate recordings
 */
export function useAudioManager(
  options: {
    onRecordingComplete?: (id: string, blob: Blob, url: string) => void;
    onRecordingError?: (error: string) => void;
  } = {}
) {
  const { onRecordingComplete, onRecordingError } = options;
  
  const [state, setState] = useState<AudioManagerState>({
    currentQuestionId: null,
    isRecording: false,
    recordingUrl: null,
    recordingBlob: null,
    audioDuration: null,
    error: null
  });

  // Flag to track component mount state
  const isMountedRef = useRef<boolean>(true);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Record audio for a specific question ID
  const recordAudio = useCallback(async (questionId: string, durationSeconds: number = 60) => {
    try {
      // First check if recording is already in progress for this question
      if (globalAudioStore.activeRecordings.has(questionId)) {
        console.log(`[AudioManager] Recording already in progress for ${questionId} - skipping duplicate request`);
        return;
      }

      // Check if a recording already exists for this question
      if (globalAudioStore.recordings[questionId]) {
        console.log(`[AudioManager] Recording already exists for ${questionId} - reusing`);
        
        const existing = globalAudioStore.recordings[questionId];
        setState(prev => ({
          ...prev,
          currentQuestionId: questionId,
          recordingUrl: existing.url,
          recordingBlob: existing.blob,
          isRecording: false,
          audioDuration: estimateDuration(existing.blob)
        }));
        
        // If not processed yet, notify listeners
        if (!existing.processed && onRecordingComplete && isMountedRef.current) {
          globalAudioStore.recordings[questionId].processed = true;
          onRecordingComplete(questionId, existing.blob, existing.url);
        }
        
        return;
      }
      
      console.log(`[AudioManager] Starting new recording for question ${questionId}`);
      
      // Mark this question as being recorded
      globalAudioStore.activeRecordings.add(questionId);
      
      // Set recording state
      setState(prev => ({
        ...prev,
        currentQuestionId: questionId,
        isRecording: true,
        recordingUrl: null,
        recordingBlob: null,
        error: null
      }));
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Configure recorder with better settings for audio quality
      const recorder = new MediaRecorder(stream, {
        audioBitsPerSecond: 128000,
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' 
          : 'audio/webm'
      });
      
      // Storage for audio chunks
      const audioChunks: Blob[] = [];
      
      // Collect audio chunks
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };
      
      // Handle completion
      recorder.onstop = () => {
        // Remove from active recordings set
        globalAudioStore.activeRecordings.delete(questionId);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        
        // Don't update if component unmounted
        if (!isMountedRef.current) return;
        
        try {
          // Process audio data
          const audioBlob = new Blob(audioChunks, { type: recorder.mimeType });
          const audioUrl = URL.createObjectURL(audioBlob);
          
          console.log(`[AudioManager] Recording complete for ${questionId}, size: ${audioBlob.size} bytes`);
          
          // Store in global store with timestamp to ensure we can identify it later
          globalAudioStore.recordings[questionId] = {
            blob: audioBlob,
            url: audioUrl,
            timestamp: Date.now(),
            processed: false
          };
          
          // Update state
          setState(prev => ({
            ...prev,
            isRecording: false,
            recordingUrl: audioUrl,
            recordingBlob: audioBlob
          }));
          
          // Calculate estimated duration
          const estimatedDuration = estimateDuration(audioBlob);
          setState(prev => ({ ...prev, audioDuration: estimatedDuration }));
          
          // Notify parent component
          if (onRecordingComplete && isMountedRef.current) {
            globalAudioStore.recordings[questionId].processed = true;
            onRecordingComplete(questionId, audioBlob, audioUrl);
          }
        } catch (error) {
          console.error('[AudioManager] Error processing audio:', error);
          
          if (isMountedRef.current) {
            setState(prev => ({
              ...prev,
              isRecording: false,
              error: 'Failed to process recording'
            }));
            
            if (onRecordingError) {
              onRecordingError('Failed to process recording');
            }
          }
        }
      };
      
      // Start recording with 200ms timeslices for consistent chunks
      recorder.start(200);
      
      // Set up auto-stop timer
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, durationSeconds * 1000);
      
      return () => {
        // Clean up function
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        stream.getTracks().forEach(track => track.stop());
        globalAudioStore.activeRecordings.delete(questionId);
      };
    } catch (error) {
      console.error('[AudioManager] Error starting recording:', error);
      
      // Remove from active recordings set on error
      globalAudioStore.activeRecordings.delete(questionId);
      
      if (isMountedRef.current) {
        setState(prev => ({
          ...prev,
          isRecording: false,
          error: 'Failed to access microphone'
        }));
        
        if (onRecordingError) {
          onRecordingError('Failed to access microphone');
        }
      }
    }
  }, [onRecordingComplete, onRecordingError]);
  
  // Estimate duration from blob size
  const estimateDuration = (blob: Blob | null | undefined): number => {
    if (!blob) return 0;
    // Estimate based on typical audio bitrate (128kbps)
    return Math.max(3, Math.min(60, Math.round(blob.size / (128000 / 8))));
  };
  
  // Get recording info for a question ID
  const getRecording = useCallback((questionId: string): AudioRecording | null => {
    const recording = globalAudioStore.recordings[questionId];
    if (!recording) return null;
    
    return {
      blob: recording.blob,
      url: recording.url,
      timestamp: recording.timestamp
    };
  }, []);
  
  // Clear all recordings
  const clearAllRecordings = useCallback(() => {
    // Revoke all URLs first to prevent memory leaks
    Object.values(globalAudioStore.recordings).forEach(recording => {
      try {
        URL.revokeObjectURL(recording.url);
      } catch (e) {
        console.error('[AudioManager] Error revoking URL:', e);
      }
    });
    
    // Clear the storage
    globalAudioStore.recordings = {};
    globalAudioStore.activeRecordings.clear();
    
    // Reset state
    setState(prev => ({
      ...prev,
      recordingUrl: null,
      recordingBlob: null,
      audioDuration: null
    }));
  }, []);

  // Stop recording for a specific question ID
  const stopRecording = useCallback((questionId: string) => {
    console.log(`[AudioManager] Manually stopping recording for ${questionId}`);
    
    // Check if this question ID is being recorded
    if (!globalAudioStore.activeRecordings.has(questionId)) {
      console.log(`[AudioManager] No active recording found for ${questionId}`);
      return;
    }
    
    // Find the MediaRecorder instances - we can't directly access them here
    // but we can signal that we want to stop by setting a flag
    globalAudioStore.activeRecordings.delete(questionId);
    
    // Set state to indicate recording is stopping
    setState(prev => ({
      ...prev,
      isRecording: false
    }));
    
    // Force finalization of any existing media tracks
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          // Stop any active tracks
          stream.getTracks().forEach(track => {
            console.log(`[AudioManager] Stopping track: ${track.id}`);
            track.stop();
          });
        })
        .catch(err => {
          console.error('[AudioManager] Error stopping media tracks:', err);
        });
    }
    
    // Note: The actual stopping happens via the cleanup function that was returned
    // by recordAudio and is called by SimpleAudioRecorder
    
    console.log(`[AudioManager] Requested stop for ${questionId}`);
  }, []);

  // Expose the globalAudioStore to the window object for debugging and cross-component access
  if (typeof window !== 'undefined') {
    (window as any).globalAudioStore = globalAudioStore;
  }

  return {
    ...state,
    recordAudio,
    stopRecording,
    getRecording,
    clearAllRecordings
  };
}

export default useAudioManager; 