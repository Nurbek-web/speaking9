import { useState, useRef, useCallback, useEffect } from 'react';
import { RecordingStatus, UserAction } from '@/components/speaking/types';

// Debug flag to control logging - set to false to disable most logs
const DEBUG = false;

// Helper function for logging only in debug mode
const debugLog = (...args: any[]) => {
  if (DEBUG) {
    console.log(...args);
  }
};

interface UseRecorderProps {
  isMuted: boolean;
  onAudioReady: (blob: Blob, url: string) => void;
  onRecordingStatusChange: (status: RecordingStatus) => void;
  onTimerChange: (seconds: number) => void;
  onError: (message: string) => void;
}

const useRecorder = ({
  isMuted,
  onAudioReady,
  onRecordingStatusChange,
  onTimerChange,
  onError
}: UseRecorderProps) => {
  // States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [userAction, setUserAction] = useState<UserAction>('idle');
  
  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const recordingEndTimeRef = useRef<number | null>(null);
  const isUnmountingRef = useRef<boolean>(false);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingAudioRef = useRef<boolean>(false); // Track if we're already processing audio
  const lastProcessedBlobRef = useRef<{size: number, timestamp: number} | null>(null); // Track last processed blob

  // Update the local status and notify parent
  const updateRecordingStatus = useCallback((status: RecordingStatus) => {
    if (isUnmountingRef.current && status !== 'idle') { // Allow setting to idle on unmount for cleanup
      debugLog(`[updateRecordingStatus] Unmounting, not setting status to ${status} (unless idle)`);
      return;
    }
    debugLog(`[updateRecordingStatus] Setting recordingStatus from ${recordingStatus} to ${status}`);
    setRecordingStatus(status);
    onRecordingStatusChange(status);
    
    // Clear any existing processing timeout when changing status, unless we are setting it to processing
    if (status !== 'processing' && processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    
    // Set a safety timeout for processing state to avoid getting stuck
    if (status === 'processing') {
      // Clear previous timeout just in case
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
      
      processingTimeoutRef.current = setTimeout(() => {
        // If we're still in processing state after timeout, force completion
        if (recordingStatus === 'processing' && !isUnmountingRef.current) {
          console.warn("[useRecorder] Processing timeout - forcing completion");
          
          // Create an empty blob as fallback if we have no audio chunks
          if (audioChunksRef.current.length === 0) {
            const emptyBlob = new Blob([], { type: 'audio/webm' }); // Default type
            audioChunksRef.current = [emptyBlob];
          }
          
          try {
            // Create a blob from whatever audio chunks we have
            const audioBlob = new Blob(audioChunksRef.current, {
              type: audioChunksRef.current[0]?.type || 'audio/webm' // Use type of first chunk or default
            });
            
            // Generate URL from the blob
            const audioUrl = URL.createObjectURL(audioBlob);
            
            // Update state and notify parent
            updateRecordingStatus('completed');
            setIsRecording(false);
            
            // Deliver the audio to the parent component
            onAudioReady(audioBlob, audioUrl);
            
          } catch (error) {
            console.error("[useRecorder] Error during forced completion:", error);
            updateRecordingStatus('error');
            setIsRecording(false);
            onError("Failed to process audio due to timeout.");
          }
        }
      }, 7000); // 7 second timeout for processing state
    }
  }, [onRecordingStatusChange, recordingStatus, onAudioReady, onError]); // Added recordingStatus to dep array of updateRecordingStatus

  // Stop recording function
  const stopRecording = useCallback((savePartial = false) => {
    debugLog("[useRecorder stopRecording] Called. savePartial:", savePartial, 
                "Current MediaRecorder state:", mediaRecorderRef.current?.state, 
                "Recording status hook state:", recordingStatus);
    
    // Prevent double stop - if already stopping/stopped, do nothing
    if (recordingStatus === 'stopping' || recordingStatus === 'stopped' || recordingStatus === 'idle') {
      debugLog("[stopRecording] Already stopping/stopped/idle. No action needed. Current status:", recordingStatus);
      // If it's idle but mediaRecorderRef is still somehow active, try to clean it up.
      if (recordingStatus === 'idle' && mediaRecorderRef.current && mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        mediaRecorderRef.current = null;
      }
      return;
    }
    
    // Signal that we want to stop and save partial recording if specified
    setUserAction(savePartial ? 'wantsToSkip' : 'wantsToStop');

    // Only attempt to stop if there's an active recorder and it's recording or paused
    if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
      try {
        debugLog("[stopRecording] Attempting to stop mediaRecorder.");
        // Set transitional state first
        updateRecordingStatus('stopping'); 
        
        // Clear any active timer intervals
        if (timerIntervalIdRef.current) {
          clearInterval(timerIntervalIdRef.current);
          timerIntervalIdRef.current = null;
        }
        
        // Request a final dataavailable event if saving partial (e.g. skip)
        if (savePartial && mediaRecorderRef.current.state === 'recording') {
          debugLog("[stopRecording] Requesting final data chunk before stopping for partial save");
          mediaRecorderRef.current.requestData();
        }
        
        // Stop the recorder (which will trigger onstop event handler)
        mediaRecorderRef.current.stop(); 
        debugLog("[stopRecording] mediaRecorder.stop() called successfully.");
      } catch (err) {
        console.error("[stopRecording] Error stopping recorder:", err);
        // Fallback state update if stop() call fails
        if (!isUnmountingRef.current) {
          setIsRecording(false);
          updateRecordingStatus('stopped');
        }
        
        // Make sure to release media tracks even if error
        if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
      }
    } else {
      console.warn("[stopRecording] No active mediaRecorder to stop or not in a stoppable state. Current state:", mediaRecorderRef.current?.state);
      // Update UI state if needed, ensure it goes to a stable non-recording state
      if (!isUnmountingRef.current) {
        setIsRecording(false);
        updateRecordingStatus('stopped'); // Or 'idle' if that makes more sense
      }
    }
  }, [recordingStatus, updateRecordingStatus]);

  // Start recording function with duration parameter
  const startRecording = useCallback(async (durationSeconds: number) => { 
    debugLog(`[useRecorder startRecording] Attempting. Duration: ${durationSeconds}s. Current hook status: ${recordingStatus}, isRecording state: ${isRecording}`);
    
    if (isUnmountingRef.current) {
      debugLog("[startRecording] Component is unmounting, aborting start.");
      return;
    }

    if (isRecording || recordingStatus === 'recording') {
      console.warn("[startRecording] Already recording or in process, exiting.");
      return;
    }

    // First set states to prevent race conditions
    debugLog('[startRecording] Setting isRecording to true');
    setIsRecording(true);
    updateRecordingStatus('recording');
    
    // IMPORTANT: Clear audio chunks for this new recording to prevent stacking
    audioChunksRef.current = [];
    
    setUserAction('wantsToRecord'); // Indicate user intent
    
    // Set up timer for this recording session
    const endTime = Date.now() + (durationSeconds * 1000);
    recordingEndTimeRef.current = endTime;
    
    // Set the initial timer display value
    onTimerChange(durationSeconds);
    
    debugLog("[startRecording] State reset for new recording. End time:", new Date(endTime).toLocaleTimeString());

    try {
      debugLog("[startRecording] Checking existing MediaRecorder instance...");
      if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
        debugLog("[startRecording] Releasing tracks from previous stream.");
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        mediaRecorderRef.current = null; // Nullify the ref
      }
      
      debugLog("[startRecording] Requesting user media (microphone).");
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } 
        });
        
        // CRITICAL: Check if unmounted after async getUserMedia call
        if (isUnmountingRef.current) {
          debugLog("[startRecording] Component unmounted after getUserMedia, stopping stream and exiting.");
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        // Debug stream to make sure we're actually getting audio tracks
        debugLog("[startRecording] Microphone access granted. Audio tracks:", 
          stream.getAudioTracks().length,
          "Enabled:", stream.getAudioTracks()[0]?.enabled);
        
        // Check if there are actually any audio tracks
        if (stream.getAudioTracks().length === 0) {
          throw new Error("No audio tracks found in the granted media stream");
        }
        
        // Check if audio track is enabled
        if (!stream.getAudioTracks()[0]?.enabled) {
          console.warn("[startRecording] Audio track is disabled, attempting to enable");
          stream.getAudioTracks()[0].enabled = true;
        }
      } catch (err: any) {
        console.error("[startRecording] Error accessing microphone:", err);
        onError(`Microphone access failed: ${err.message || 'Unknown error'}. Please check browser permissions and try again.`);
        if (!isUnmountingRef.current) {
          setIsRecording(false);
          updateRecordingStatus('error');
          setUserAction('idle');
        }
        return;
      }
      
      // This check is now redundant due to the one after getUserMedia, but harmless
      if (isUnmountingRef.current) {
        debugLog("[startRecording] Component is unmounting (second check), stopping stream and exiting");
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      
      // Handle mute state
      if (isMuted && stream.getAudioTracks().length > 0) {
        stream.getAudioTracks()[0].enabled = false;
        console.log("[startRecording] Microphone is muted by user setting."); // This log can stay as it's a specific condition
      }
      
      // Create MediaRecorder with better fallbacks
      let recorder;
      try {
        // Safari and some iOS browsers may need different MIME types
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        let options: MediaRecorderOptions = {}; // Ensure options is typed
        
        if (isSafari) {
          // Safari often works better with minimal options or audio/mp4
          debugLog("[startRecording] Safari detected, using audio/mp4 or default recorder options");
          if (MediaRecorder.isTypeSupported('audio/mp4')) {
            options = { 
              mimeType: 'audio/mp4',
              audioBitsPerSecond: 128000  // Use explicit bit rate for better metadata
            };
          } else {
            options = { 
              audioBitsPerSecond: 128000 // Simple options for Safari
            };
          }
        } else {
          // Use appropriate MIME type for other browsers
          let mimeType = '';
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            mimeType = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4'; // Fallback for browsers not supporting webm
          } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
            mimeType = 'audio/ogg;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/wav')) {
            mimeType = 'audio/wav';
          }
          
          if (mimeType) {
            options = { 
              mimeType, 
              audioBitsPerSecond: 128000  // Use constant bit rate for better metadata
            };
          } else {
            options = { 
              audioBitsPerSecond: 128000  // Simple fallback with bit rate
            };
          }
          debugLog(`[startRecording] Using MIME type: ${options.mimeType || 'browser default'}`);
        }
        
        // Create MediaRecorder with options
        recorder = new MediaRecorder(stream, options);
        debugLog("[startRecording] MediaRecorder instance created. State:", recorder.state, "MIME Type:", recorder.mimeType);
      } catch (err) {
        console.error("[startRecording] Error creating MediaRecorder:", err);
        
        // Try again with default options if custom options failed
        try {
          debugLog("[startRecording] Retrying with default MediaRecorder options");
          recorder = new MediaRecorder(stream);
          debugLog("[startRecording] MediaRecorder created with default options. State:", recorder.state, "MIME Type:", recorder.mimeType);
        } catch (fallbackErr) {
          console.error("[startRecording] Failed to create MediaRecorder even with default options:", fallbackErr);
          onError("Your browser doesn't support audio recording. Please try a different browser.");
          
          if (!isUnmountingRef.current) {
            setIsRecording(false);
            updateRecordingStatus('error');
            setUserAction('idle');
          }
          
          stream.getTracks().forEach(track => track.stop());
          return;
        }
      }
      
      // Set up event handlers
      recorder.onstart = () => {
        if (isUnmountingRef.current) {
          debugLog("[useRecorder onstart] Component is unmounting, stopping recorder");
          try {
            if(recorder.state === 'recording') recorder.stop();
          } catch (e) {
            console.error("[useRecorder onstart] Error stopping recorder during unmount:", e);
          }
          return;
        }
        
        debugLog("[useRecorder onstart] MediaRecorder actually started. State:", recorder.state, "isUnmounting:", isUnmountingRef.current);
        
        // Double-check the timer is set correctly
        if (recordingEndTimeRef.current === null) {
          debugLog("[onstart] Timer not set! Re-setting it now.");
          recordingEndTimeRef.current = Date.now() + (durationSeconds * 1000);
        }
        
        debugLog("[onstart] Timer is set to end at:", new Date(recordingEndTimeRef.current).toLocaleTimeString());
        
        // Start the timer interval
        if (timerIntervalIdRef.current) {
          clearInterval(timerIntervalIdRef.current);
          timerIntervalIdRef.current = null;
        }
        
        timerIntervalIdRef.current = setInterval(() => {
          if (isUnmountingRef.current) {
            if (timerIntervalIdRef.current) {
              clearInterval(timerIntervalIdRef.current);
              timerIntervalIdRef.current = null;
            }
            return;
          }
          
          if (recordingEndTimeRef.current === null) return;
          
          const currentTime = Date.now();
          const timeRemainingSeconds = Math.max(0, Math.ceil((recordingEndTimeRef.current - currentTime) / 1000));
          
          onTimerChange(timeRemainingSeconds);
          
          if (currentTime >= recordingEndTimeRef.current) {
            debugLog("[timerInterval] Timer complete, stopping recording");
            if (timerIntervalIdRef.current) {
              clearInterval(timerIntervalIdRef.current);
              timerIntervalIdRef.current = null;
            }
            
            if (recorder && recorder.state === 'recording') {
              setUserAction('timerExpired');
              // recorder.stop(); // stop() will be called by the main stopRecording logic if needed or by onstop
              if (!isUnmountingRef.current) {
                // setIsRecording(false); // This will be handled by onstop
                // updateRecordingStatus('stopping'); // This will be handled by onstop
                // Instead of directly calling stop, let the natural flow or explicit stopRecording handle it.
                // For timer expiry, we can directly trigger the logic that would occur during onstop.
                // However, the standard is to call recorder.stop() and let its onstop handler manage the state transitions.
                // If stopRecording is not reliably called, this path might be problematic.
                 try { recorder.stop(); } catch(e) { console.error("Error stopping recorder on timer expiry:", e); }
              }
            }
          }
        }, 250);
      };

      // Handle audio chunks
      recorder.ondataavailable = (event) => {
        if (isUnmountingRef.current) {
            debugLog("[useRecorder ondataavailable] Unmounting, ignoring data.");
            return;
        }
        if (event.data && event.data.size > 0) {
          // Store chunk with timestamp to help avoid duplicates
          const timestamp = Date.now();
          debugLog(`[useRecorder ondataavailable] Chunk received at ${timestamp}: ${event.data.size} bytes.`);
          
          // IMPORTANT: Do not filter chunks by size - we need all audio data
          audioChunksRef.current.push(event.data);
          debugLog(`[useRecorder ondataavailable] Added chunk. Total chunks: ${audioChunksRef.current.length}. Total size so far: ${audioChunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0)}`);
        } else {
          debugLog("[useRecorder ondataavailable] Received event with no data or zero size.");
        }
      };
      
      // Handle recorder stop
      recorder.onstop = () => {
        debugLog("[useRecorder onstop] Recording stopped. isUnmounting:", isUnmountingRef.current, 
                    "Number of audio chunks:", audioChunksRef.current.length, 
                    "Total size from chunks:", audioChunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0));
        
        // Clear processing timeout if it exists as onstop means processing is about to start or complete
        if (processingTimeoutRef.current) {
            clearTimeout(processingTimeoutRef.current);
            processingTimeoutRef.current = null;
        }

        if (isUnmountingRef.current) {
          debugLog("[onstop] Component is unmounting, skipping audio processing");
          // Ensure stream tracks are stopped during unmount if onstop is reached here
          if (recorder.stream) {
            recorder.stream.getTracks().forEach(track => track.stop());
          }
          return;
        }
        
        // Check if we're already processing audio (guard against duplicate onstop events)
        if (isProcessingAudioRef.current) {
          debugLog("[onstop] Audio is already being processed, skipping duplicate onstop event");
          return;
        }
        
        // Set processing flag to true to prevent duplicate processing
        isProcessingAudioRef.current = true;
        
        updateRecordingStatus('processing'); // Indicate processing has started

        try {
          // Small delay to make sure all chunks are collected
          setTimeout(() => {
            if (audioChunksRef.current.length > 0) {
              // Check if we have enough audio data (at least 1 chunk)
              const totalSize = audioChunksRef.current.reduce((total, chunk) => total + chunk.size, 0);
              debugLog(`[onstop] Processing ${audioChunksRef.current.length} audio chunks, total size: ${totalSize} bytes`);
              
              // Duplicate detection: Check if we recently processed a blob of the same size
              if (lastProcessedBlobRef.current && 
                  Math.abs(lastProcessedBlobRef.current.size - totalSize) < 100 && 
                  Date.now() - lastProcessedBlobRef.current.timestamp < 3000) {
                debugLog(`[onstop] Potential duplicate blob detected (size ${totalSize} bytes). Skipping processing.`);
                isProcessingAudioRef.current = false;
                return;
              }
              
              // Create a local copy of chunks to prevent modifying the original array
              const currentChunks = [...audioChunksRef.current];
              
              // Log chunk information for debugging
              debugLog(`[onstop] Processing chunks - total count: ${currentChunks.length}`);
              currentChunks.forEach((chunk, i) => {
                debugLog(`[onstop] Chunk ${i}: size=${chunk.size} bytes, type=${chunk.type}`);
              });
              
              // Create blob with proper type and options for better compatibility
              let blobOptions: { type?: string } = {}; // Type for blobOptions
              
              // For Safari, we need a more explicit type
              const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
              if (isSafari && MediaRecorder.isTypeSupported('audio/mp4')) {
                blobOptions = { type: 'audio/mp4' };
              } else if (recorder.mimeType) {
                blobOptions = { type: recorder.mimeType };
              } else {
                // Fallback if mimeType is not available or not a standard one we check for
                blobOptions = { type: currentChunks[0]?.type || 'audio/webm' };
              }
              
              try {
                // Create the blob with the options using the local copy of chunks
                const audioBlob = new Blob(currentChunks, blobOptions);
                
                debugLog(`[useRecorder onstop] Created audio blob. Size: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
                
                // Create URL for playback from the original blob
                const url = URL.createObjectURL(audioBlob);
                debugLog(`[onstop] Audio URL created: ${url}`);
                
                // Clear audio chunks after creating the blob to prevent duplicate processing
                audioChunksRef.current = [];
                
                // Update status to completed BEFORE onAudioReady to prevent race conditions
                updateRecordingStatus('completed');

                // Track this blob to prevent duplicates
                lastProcessedBlobRef.current = {
                  size: audioBlob.size,
                  timestamp: Date.now()
                };

                // Notify parent component with the audioBlob in a scheduled task
                // This helps prevent multiple rapid callbacks and React state batching issues
                setTimeout(() => {
                  // One final check to make sure we're not unmounting
                  if (!isUnmountingRef.current) {
                    // Call the callback with created blob and URL
                    onAudioReady(audioBlob, url);
                  } else {
                    debugLog("[onstop] Component unmounted before callback executed");
                    // Revoke URL if we're unmounting without using it
                    try {
                      URL.revokeObjectURL(url);
                    } catch (e) {
                      console.error("[onstop] Error revoking URL:", e);
                    }
                  }
                  
                  // Reset processing flag regardless
                  isProcessingAudioRef.current = false;
                }, 50);
              } catch (err) {
                console.error("[useRecorder onstop] Error creating blob/URL:", err);
                onError("Failed to process recording. Please try again.");
                updateRecordingStatus('error');
                isProcessingAudioRef.current = false;
              }
            } else {
              debugLog("[useRecorder onstop] No audio chunks recorded. Calling onError.");
              onError("No audio was recorded. Please check your microphone and try again.");
              updateRecordingStatus('error'); // Set to error if no chunks
              isProcessingAudioRef.current = false; // Reset processing flag on error
            }
          }, 300); // Add a small delay to make sure we've collected all chunks
        } catch (err) {
          console.error("[useRecorder onstop] Error processing recording:", err);
          onError("Failed to process recording. Please try again.");
          updateRecordingStatus('error');
          isProcessingAudioRef.current = false; // Reset processing flag on error
        }
        
        // This setIsRecording should be here, after all processing related to onstop
        if (!isUnmountingRef.current) {
          setIsRecording(false);
          // updateRecordingStatus('stopped'); // Status should be 'completed' or 'error' by now
        }
        
        // Clear timer interval
        if (timerIntervalIdRef.current) {
          clearInterval(timerIntervalIdRef.current);
          timerIntervalIdRef.current = null;
        }
        
        // Stop all tracks associated with this specific recorder instance
        if (recorder.stream) {
            recorder.stream.getTracks().forEach(track => {
                debugLog(`[onstop] Stopping media track: ${track.kind}`);
                track.stop();
            });
            debugLog("[onstop] All media tracks stopped for this instance.");
        }
        
        if (!isUnmountingRef.current) {
          setUserAction('idle');
        }
        mediaRecorderRef.current = null; // Clear the ref after stopping and processing
      };
      
      // Handle errors
      recorder.onerror = (event) => {
        console.error("[useRecorder onerror] MediaRecorder error event:", event);
        const specificError = (event as any).error;
        let errorMessage = 'Unknown recording error';
        if (specificError) {
            errorMessage = `RecErr: ${specificError.name} - ${specificError.message}`;
        } else if ((event as any).type) {
            errorMessage = `RecErr Event: ${(event as any).type}`;
        }
        console.error("[useRecorder onerror] Specific error:", specificError);
        onError(errorMessage);
        if (!isUnmountingRef.current) {
          updateRecordingStatus('error');
          setIsRecording(false);
        }
        
        // Clear timer interval
        if (timerIntervalIdRef.current) {
          clearInterval(timerIntervalIdRef.current);
          timerIntervalIdRef.current = null;
        }
        
        if (recorder.stream) recorder.stream.getTracks().forEach(track => track.stop());
        if (!isUnmountingRef.current) {
          setUserAction('idle');
        }
        mediaRecorderRef.current = null; // Clear the ref on error too
      };
      
      // Store the recorder
      mediaRecorderRef.current = recorder;
      
      // Start recorder immediately with better error handling
      try {
        debugLog("[useRecorder startRecording] Attempting to call recorder.start(). Current recorder state:", recorder.state);
        // Use a small timeslice for better handling of metadata
        recorder.start(200); // Balance between frequency and metadata accuracy
        debugLog("[useRecorder startRecording] recorder.start(200) called. New state:", recorder.state);
        
        // Verify recorder is actually recording
        if (recorder.state !== 'recording') {
          // This state indicates a problem, potentially the browser silently failed or an extension interfered.
          console.warn(`[useRecorder startRecording] MediaRecorder state is ${recorder.state} after start() call.`);
          throw new Error(`MediaRecorder failed to enter 'recording' state. Current state: ${recorder.state}`);
        }
      } catch (err: any) {
        console.error("[useRecorder startRecording] Error calling recorder.start():", err);
        onError(`Failed to start recording process: ${err.message || 'Unknown error'}`);
        if (!isUnmountingRef.current) {
          setIsRecording(false);
          updateRecordingStatus('idle'); // Revert to idle if start failed
          setUserAction('idle');
        }
        if (stream) stream.getTracks().forEach(track => track.stop()); // Ensure stream is stopped if start fails
      }
      
    } catch (error: any) {
      console.error('[useRecorder startRecording] Outer error catch:', error);
      
      let errorMessage = 'Failed to start recording.';
      
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Microphone access was denied. Please allow access in your browser settings.';
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'No microphone detected. Please connect a microphone and try again.';
        } else if (error.name === 'NotReadableError') {
          errorMessage = 'Your microphone is busy or unavailable. Please check other applications using it.';
        }
      }
      
      onError(errorMessage);
      if (!isUnmountingRef.current) {
        updateRecordingStatus('error');
        setIsRecording(false);
        setUserAction('idle');
      }
      
      // Clear timer interval if it somehow got set
      if (timerIntervalIdRef.current) {
        clearInterval(timerIntervalIdRef.current);
        timerIntervalIdRef.current = null;
      }
    }
  }, [isMuted, recordingStatus, isRecording, onAudioReady, onError, onTimerChange, updateRecordingStatus]); // Added dependencies

  // Update mute state when it changes
  useEffect(() => {
    if (mediaRecorderRef.current?.stream) {
      const audioTracks = mediaRecorderRef.current.stream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks[0].enabled = !isMuted;
        debugLog(`[useEffect] Updated mute state: ${isMuted ? 'muted' : 'unmuted'}`);
      }
    }
  }, [isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    // Set isUnmountingRef to true when the component is about to unmount.
    // This is primarily for the main component using this hook.
    isUnmountingRef.current = false; // Initialize as false
    isProcessingAudioRef.current = false; // Initialize processing flag
    
    return () => {
      debugLog("[useRecorder] Cleanup effect triggered - component unmounting");
      isUnmountingRef.current = true;
      
      // Clear all timeouts and intervals
      if (timerIntervalIdRef.current) {
        clearInterval(timerIntervalIdRef.current);
        timerIntervalIdRef.current = null;
        debugLog("[useRecorder cleanup] Cleared timer interval.");
      }
      
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
        debugLog("[useRecorder cleanup] Cleared processing timeout.");
      }
      
      // Stop media recorder if active and release resources
      if (mediaRecorderRef.current) {
        const recorder = mediaRecorderRef.current;
        if (recorder.state === 'recording' || recorder.state === 'paused') {
          try {
            recorder.onstart = null; // Remove handlers to prevent them firing during cleanup
            recorder.ondataavailable = null;
            recorder.onstop = null;
            recorder.onerror = null;
            recorder.stop();
            debugLog("[useRecorder cleanup] Called mediaRecorder.stop().");
          } catch (err) {
            console.error("[useRecorder cleanup] Error stopping recorder:", err);
          }
        }
        // Ensure all tracks from this stream are stopped
        if (recorder.stream) {
            recorder.stream.getTracks().forEach(track => {
                track.stop();
                debugLog(`[useRecorder cleanup] Stopped stream track: ${track.kind} id: ${track.id}`);
            });
        }
        mediaRecorderRef.current = null; // Nullify the ref
        debugLog("[useRecorder cleanup] MediaRecorder resources released and ref nulled.");
      }
      // Reset status to idle to ensure clean state if hook is reused (though typically it's per-component instance)
      // setRecordingStatus('idle'); // This might be problematic if the component expects no more status changes
    };
  }, []); // Empty dependency array means this runs once on mount and cleanup on unmount

  return {
    isRecording,
    recordingStatus,
    userAction,
    startRecording,
    stopRecording,
    setUserAction // Exposing setUserAction if parent needs to influence it
  };
};

export default useRecorder; 