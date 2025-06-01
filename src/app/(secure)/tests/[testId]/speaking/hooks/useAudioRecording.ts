import { useState, useCallback, useRef, useEffect } from 'react'
import { AudioRecordingService, RecordingState } from '../services/AudioRecordingService'

// Add to global scope for debugging
if (typeof window !== 'undefined') {
  (window as any).AudioRecordingService = AudioRecordingService;
  (window as any).runMicrophoneDiagnostics = async () => {
    console.log('🎤 Running comprehensive microphone diagnostics...')
    await AudioRecordingService.diagnoseAudioIssues()
  };
  (window as any).testAllMicrophones = async () => {
    console.log('🎤 Testing all available microphones...')
    await AudioRecordingService.testAllMicrophones()
  };
}

interface UseAudioRecordingReturn {
  recordingState: RecordingState
  startRecording: () => Promise<void>
  stopRecording: () => Promise<Blob | null>
  pauseRecording: () => void
  resumeRecording: () => void
  cleanup: () => void
  isSupported: boolean
  error: string | null
}

interface UseAudioRecordingConfig {
  maxDuration?: number
  onRecordingStart?: () => void
  onRecordingStop?: () => void
  onError?: (error: Error) => void
}

export function useAudioRecording(config: UseAudioRecordingConfig = {}): UseAudioRecordingReturn {
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    error: null
  })
  const [error, setError] = useState<string | null>(null)
  
  const serviceRef = useRef<AudioRecordingService | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Update recording state periodically
  useEffect(() => {
    if (recordingState.isRecording) {
      timerRef.current = setInterval(() => {
        if (serviceRef.current) {
          const state = serviceRef.current.getRecordingState()
          setRecordingState(state)
        }
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [recordingState.isRecording])

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      console.log('[useAudioRecording] Starting recording process...')

      // Run audio diagnostics first
      if (!serviceRef.current) {
        console.log('[useAudioRecording] Running audio diagnostics before first recording...')
        await AudioRecordingService.diagnoseAudioIssues()
      }

      // Create new service instance if needed
      if (!serviceRef.current) {
        console.log('[useAudioRecording] Creating new AudioRecordingService instance...')
        serviceRef.current = new AudioRecordingService({
          maxDuration: config.maxDuration,
          onStart: () => {
            console.log('[useAudioRecording] onStart callback triggered - setting isRecording to true')
            setRecordingState(prev => {
              const newState = { ...prev, isRecording: true, isPaused: false }
              console.log('[useAudioRecording] State updated:', newState)
              return newState
            })
            if (config.onRecordingStart) {
              config.onRecordingStart()
            }
          },
          onStop: () => {
            console.log('[useAudioRecording] onStop callback triggered - setting isRecording to false')
            setRecordingState(prev => {
              const newState = { ...prev, isRecording: false, isPaused: false }
              console.log('[useAudioRecording] State updated:', newState)
              return newState
            })
            if (config.onRecordingStop) {
              config.onRecordingStop()
            }
          },
          onError: (error) => {
            console.error('[useAudioRecording] onError callback triggered:', error.message)
            setError(error.message)
            setRecordingState(prev => ({ ...prev, isRecording: false, error: error.message }))
            if (config.onError) {
              config.onError(error)
            }
          }
        })
      }

      console.log('[useAudioRecording] Calling serviceRef.current.startRecording()...')
      await serviceRef.current.startRecording()
      console.log('[useAudioRecording] Recording started successfully')
      
      // Force state update if the callback didn't work
      setTimeout(() => {
        if (serviceRef.current) {
          const currentState = serviceRef.current.getRecordingState()
          console.log('[useAudioRecording] Double-checking recording state:', currentState)
          setRecordingState(currentState)
        }
      }, 500)
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start recording'
      setError(errorMessage)
      setRecordingState(prev => ({ ...prev, isRecording: false, error: errorMessage }))
      console.error('[useAudioRecording] Start recording error:', err)
    }
  }, [config])

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    if (!serviceRef.current) {
      console.warn('[useAudioRecording] No recording service available')
      return null
    }

    try {
      console.log('[useAudioRecording] Stopping recording...')
      const blob = await serviceRef.current.stopRecording()
      
      setRecordingState(prev => ({ 
        ...prev, 
        isRecording: false, 
        isPaused: false,
        duration: 0 
      }))
      
      console.log('[useAudioRecording] Recording stopped, blob size:', blob.size)
      return blob
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stop recording'
      setError(errorMessage)
      console.error('[useAudioRecording] Stop recording error:', err)
      return null
    }
  }, [])

  const pauseRecording = useCallback(() => {
    if (!serviceRef.current) return

    try {
      serviceRef.current.pause()
      setRecordingState(prev => ({ ...prev, isPaused: true }))
      console.log('[useAudioRecording] Recording paused')
    } catch (err) {
      console.error('[useAudioRecording] Pause error:', err)
    }
  }, [])

  const resumeRecording = useCallback(() => {
    if (!serviceRef.current) return

    try {
      serviceRef.current.resume()
      setRecordingState(prev => ({ ...prev, isPaused: false }))
      console.log('[useAudioRecording] Recording resumed')
    } catch (err) {
      console.error('[useAudioRecording] Resume error:', err)
    }
  }, [])

  const cleanup = useCallback(() => {
    console.log('[useAudioRecording] Cleaning up audio recording')
    
    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // Cleanup service
    if (serviceRef.current) {
      serviceRef.current.cleanup()
      serviceRef.current = null
    }

    // Reset state
    setRecordingState({
      isRecording: false,
      isPaused: false,
      duration: 0,
      error: null
    })
    setError(null)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  return {
    recordingState,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cleanup,
    isSupported: AudioRecordingService.isSupported(),
    error
  }
} 