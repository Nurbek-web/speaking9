import { useState, useCallback, useRef } from 'react';

// For type safety, define interfaces
interface AudioManagerConfig {
  onRecordingComplete?: (id: string, blob: Blob, url: string) => void;
  onRecordingError?: (errorMsg: string) => void;
}

interface AudioRecording {
  blob: Blob;
  url: string;
}

// Global storage for recordings
declare global {
  interface Window {
    globalAudioStore?: {
      recordings: Record<string, AudioRecording>;
    };
  }
}

const useAudioManager = (config: AudioManagerConfig = {}) => {
  const { onRecordingComplete, onRecordingError } = config;
  
  // State for recording status
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  
  // References to keep track of recording session
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIdRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Create global store for recordings if it doesn't exist
  if (typeof window !== 'undefined' && !window.globalAudioStore) {
    window.globalAudioStore = { recordings: {} };
  }
  
  // Initialize MediaRecorder with the best available options
  const setupMediaRecorder = useCallback(async (): Promise<MediaRecorder> => {
    try {
      console.log('[AudioManager] Setting up MediaRecorder');
      
      // Check if MediaRecorder is available
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('MediaRecorder is not supported in this browser');
      }
      
      // Get audio stream with best quality
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          // Try to get highest quality audio
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 1
        }
      });
      
      // Store the stream for later cleanup
      streamRef.current = stream;
      
      // Determine best audio format - prefer WAV but fallback to others
      const mimeTypes = [
        'audio/wav',
        'audio/webm;codecs=pcm',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4'
      ];
      
      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }
      
      if (!selectedMimeType) {
        // If none of our preferred types are supported, use the default
        console.warn('[AudioManager] None of the preferred MIME types are supported. Using browser default');
        selectedMimeType = '';
      }
      
      console.log(`[AudioManager] Using MIME type: ${selectedMimeType || 'browser default'}`);
      
      // Create MediaRecorder with options for best quality
      const recorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        audioBitsPerSecond: 128000
      });
      
      // Setup data handler
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log(`[AudioManager] Received audio chunk: ${event.data.size} bytes, type: ${event.data.type}`);
          audioChunksRef.current.push(event.data);
        } else {
          console.warn('[AudioManager] Empty audio chunk received');
        }
      };
      
      return recorder;
    } catch (err) {
      console.error('[AudioManager] Error setting up MediaRecorder:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error accessing microphone';
      setError(errorMessage);
      
      if (onRecordingError) {
        onRecordingError(errorMessage);
      }
      
      throw err;
    }
  }, [onRecordingError]);
  
  // Clean up recording resources
  const cleanupRecording = useCallback(() => {
    console.log('[AudioManager] Cleaning up recording resources');
    
    // Stop MediaRecorder if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn('[AudioManager] Error stopping MediaRecorder:', err);
      }
    }
    
    // Stop and release media tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (err) {
          console.warn('[AudioManager] Error stopping track:', err);
        }
      });
      streamRef.current = null;
    }
    
    // Reset state
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, []);
  
  // Start recording audio
  const recordAudio = useCallback(async (id: string, durationSeconds: number = 60): Promise<(() => void) | undefined> => {
    try {
      // Clear previous state
      setError(null);
      audioChunksRef.current = [];
      setRecordingBlob(null);
      setRecordingUrl(null);
      
      // Store the ID for this recording session
      recordingIdRef.current = id;
      
      console.log(`[AudioManager] Starting recording for ID: ${id}`);
      
      // Setup the MediaRecorder
      const recorder = await setupMediaRecorder();
      mediaRecorderRef.current = recorder;
      
      // Register completion handler
      recorder.onstop = async () => {
        try {
          console.log(`[AudioManager] Recording stopped for ID: ${recordingIdRef.current}`);
          
          // Validate that we have audio chunks
          if (audioChunksRef.current.length === 0) {
            throw new Error('No audio data recorded');
          }
          
          // Get the recorded ID
          const recordingId = recordingIdRef.current;
          if (!recordingId) {
            throw new Error('Recording ID not set');
          }
          
          // Create blob from chunks
          const blob = new Blob(audioChunksRef.current, { 
            type: audioChunksRef.current[0].type || 'audio/webm'
          });
          
          console.log(`[AudioManager] Created audio blob: ${blob.size} bytes, type: ${blob.type}`);
          
          // Create URL for playback
          const url = URL.createObjectURL(blob);
          
          // Store in component state
          setRecordingBlob(blob);
          setRecordingUrl(url);
          
          // Store in global state for access from other components
          if (window.globalAudioStore) {
            window.globalAudioStore.recordings[recordingId] = { blob, url };
          }
          
          // Notify parent component
          if (onRecordingComplete) {
            console.log(`[AudioManager] Calling onRecordingComplete for ID: ${recordingId}`);
            onRecordingComplete(recordingId, blob, url);
          }
        } catch (err) {
          console.error('[AudioManager] Error processing recording:', err);
          const errorMessage = err instanceof Error ? err.message : 'Error creating audio file';
          setError(errorMessage);
          
          if (onRecordingError) {
            onRecordingError(errorMessage);
          }
        }
      };
      
      // Start recording
      recorder.start(1000); // Capture data in 1-second chunks for better reliability
      setIsRecording(true);
      
      console.log(`[AudioManager] Started recording for duration: ${durationSeconds}s`);
      
      // Set timeout to stop recording after specified duration
      const timeoutId = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          console.log(`[AudioManager] Auto-stopping recording after ${durationSeconds}s`);
          stopRecording(id);
        }
      }, durationSeconds * 1000);
      
      // Return a cleanup function
      return () => {
        console.log(`[AudioManager] Cleanup function called for ID: ${id}`);
        clearTimeout(timeoutId);
        cleanupRecording();
      };
    } catch (err) {
      console.error('[AudioManager] Error in recordAudio:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to start recording';
      setError(errorMessage);
      
      if (onRecordingError) {
        onRecordingError(errorMessage);
      }
      
      cleanupRecording();
    }
  }, [setupMediaRecorder, cleanupRecording, onRecordingComplete, onRecordingError]);
  
  // Manually stop recording
  const stopRecording = useCallback((id: string) => {
    console.log(`[AudioManager] Manual stop recording for ID: ${id}`);
    
    // Only proceed if this is the current recording session
    if (recordingIdRef.current === id && mediaRecorderRef.current) {
      try {
        // Don't stop if already inactive
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
          console.log(`[AudioManager] Stopped recording for ID: ${id}`);
        } else {
          console.log(`[AudioManager] MediaRecorder already inactive for ID: ${id}`);
        }
      } catch (err) {
        console.error(`[AudioManager] Error stopping recording for ID: ${id}:`, err);
        // Continue with cleanup even if stop fails
      }
      
      // Clean up resources
      cleanupRecording();
    } else {
      console.warn(`[AudioManager] Ignored stop request for ID: ${id} (current ID: ${recordingIdRef.current})`);
    }
  }, [cleanupRecording]);
  
  return {
    isRecording,
    recordingUrl,
    recordingBlob,
    error,
    recordAudio,
    stopRecording,
  };
};

export default useAudioManager; 