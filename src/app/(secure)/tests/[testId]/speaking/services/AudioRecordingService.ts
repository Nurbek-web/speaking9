export interface AudioRecordingConfig {
  mimeType?: string
  maxDuration?: number
  onDataAvailable?: (blob: Blob) => void
  onStart?: () => void
  onStop?: () => void
  onError?: (error: Error) => void
}

export interface RecordingState {
  isRecording: boolean
  isPaused: boolean
  duration: number
  error: string | null
}

export class AudioRecordingService {
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private audioChunks: Blob[] = []
  private startTime: number = 0
  private recordingTimer: NodeJS.Timeout | null = null
  private config: AudioRecordingConfig = {}
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private dataArray: Uint8Array | null = null
  private audioLevelCheckInterval: NodeJS.Timeout | null = null

  constructor(config: AudioRecordingConfig = {}) {
    this.config = {
      mimeType: 'audio/webm;codecs=opus',
      maxDuration: 300, // 5 minutes default
      ...config
    }
  }

  async initialize(): Promise<void> {
    try {
      // Check browser support
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        throw new Error('Audio recording is not supported in this browser')
      }

      // Request microphone permission with simplified constraints for better compatibility
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, // Disable to avoid conflicts
          noiseSuppression: false, // Disable to avoid conflicts  
          autoGainControl: false,  // Disable to avoid conflicts
          sampleRate: 44100,
          channelCount: 1
        }
      })

      console.log('[AudioRecordingService] Microphone access granted with simplified constraints')
      console.log('[AudioRecordingService] Stream details:', {
        id: this.stream.id,
        active: this.stream.active,
        tracks: this.stream.getTracks().map(track => ({
          kind: track.kind,
          label: track.label,
          enabled: track.enabled,
          readyState: track.readyState,
          settings: track.getSettings()
        }))
      })
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to access microphone'
      console.error('[AudioRecordingService] Initialization error:', message)
      throw new Error(`Microphone access failed: ${message}`)
    }
  }

  async startRecording(): Promise<void> {
    if (!this.stream) {
      await this.initialize()
    }

    if (!this.stream) {
      throw new Error('No audio stream available')
    }

    try {
      // Clear previous chunks
      this.audioChunks = []

      // Validate microphone is actually working
      const tracks = this.stream.getAudioTracks()
      if (tracks.length === 0) {
        throw new Error('No audio tracks available from microphone')
      }

      const audioTrack = tracks[0]
      if (!audioTrack.enabled || audioTrack.readyState !== 'live') {
        throw new Error(`Microphone track not ready: enabled=${audioTrack.enabled}, state=${audioTrack.readyState}`)
      }

      console.log('[AudioRecordingService] Microphone validation passed:', {
        trackCount: tracks.length,
        enabled: audioTrack.enabled,
        readyState: audioTrack.readyState,
        muted: audioTrack.muted
      })

      // Determine the best supported MIME type
      const mimeType = this.getBestMimeType()
      
      // Create MediaRecorder with simple, clean settings (like Google Meet)
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: mimeType
      })

      // Set up event handlers
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
          console.log('[AudioRecordingService] Audio chunk received:', event.data.size, 'bytes, total chunks:', this.audioChunks.length)
          console.log('[AudioRecordingService] Total accumulated size:', this.audioChunks.reduce((sum, chunk) => sum + chunk.size, 0), 'bytes')
        } else {
          console.warn('[AudioRecordingService] Received empty audio chunk')
        }
      }

      this.mediaRecorder.onstop = () => {
        console.log('[AudioRecordingService] MediaRecorder stopped, total chunks collected:', this.audioChunks.length)
        this.handleRecordingStop()
      }

      this.mediaRecorder.onerror = (event) => {
        const error = new Error(`Recording error: ${event.error || 'Unknown error'}`)
        console.error('[AudioRecordingService] Recording error:', error)
        if (this.config.onError) {
          this.config.onError(error)
        }
      }

      // Start recording with standard timing (like other apps)
      this.mediaRecorder.start(1000) // Use 1 second intervals like most apps
      this.startTime = Date.now()
      
      console.log('[AudioRecordingService] MediaRecorder started with state:', this.mediaRecorder.state)
      console.log('[AudioRecordingService] Using MIME type:', mimeType)
      console.log('[AudioRecordingService] Stream is active:', this.stream.active)
      
      // Set up max duration timer
      if (this.config.maxDuration) {
        this.recordingTimer = setTimeout(() => {
          console.log('[AudioRecordingService] Max duration reached, auto-stopping')
          this.stopRecording()
        }, this.config.maxDuration * 1000)
      }

      if (this.config.onStart) {
        this.config.onStart()
      }
      console.log('[AudioRecordingService] Recording started successfully - no AudioContext interference')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start recording'
      console.error('[AudioRecordingService] Start recording error:', message)
      throw new Error(`Failed to start recording: ${message}`)
    }
  }

  stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        reject(new Error('No active recording to stop'))
        return
      }

      console.log('[AudioRecordingService] Stopping recording, current state:', this.mediaRecorder.state)
      console.log('[AudioRecordingService] Current chunks before stop:', this.audioChunks.length)

      // Check minimum recording duration (at least 500ms for meaningful speech)
      const recordingDuration = Date.now() - this.startTime
      if (recordingDuration < 500) {
        console.warn(`[AudioRecordingService] Recording too short: ${recordingDuration}ms, extending to minimum duration`)
        
        // Wait for minimum duration before stopping
        setTimeout(() => {
          this.stopRecording().then(resolve).catch(reject)
        }, 500 - recordingDuration)
        return
      }

      // Set up one-time handler for the stop event
      const handleStop = () => {
        console.log('[AudioRecordingService] Stop event fired, chunks after stop:', this.audioChunks.length)
        
        // Stop audio level monitoring
        this.stopAudioLevelMonitoring()
        
        // Add a delay to ensure all chunks are processed
        setTimeout(() => {
          const blob = this.createFinalBlob()
          if (blob) {
            console.log('[AudioRecordingService] Final blob created successfully:', blob.size, 'bytes')
            console.log('[AudioRecordingService] Blob type:', blob.type)
            console.log('[AudioRecordingService] Recording duration:', recordingDuration, 'ms')
            console.log('[AudioRecordingService] Bytes per second:', Math.round(blob.size / (recordingDuration / 1000)))
            
            // Validate that we have substantial audio content
            if (blob.size < 2000) {
              console.warn(`[AudioRecordingService] Audio blob seems small (${blob.size} bytes), but proceeding`)
            }
            
            resolve(blob)
          } else {
            console.error('[AudioRecordingService] Failed to create blob from', this.audioChunks.length, 'chunks')
            reject(new Error('Failed to create audio blob'))
          }
        }, 200) // Increased delay to ensure all chunks are collected
      }

      // Clear any existing listeners and add our handler
      this.mediaRecorder.removeEventListener('stop', this.handleRecordingStop)
      this.mediaRecorder.addEventListener('stop', handleStop, { once: true })

      // Request final data before stopping
      if (this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.requestData()
        console.log('[AudioRecordingService] Requested final data before stopping')
      }

      // Stop the recording
      this.mediaRecorder.stop()
      
      // Clear the timer
      if (this.recordingTimer) {
        clearTimeout(this.recordingTimer)
        this.recordingTimer = null
      }

      console.log('[AudioRecordingService] Stop recording requested, duration:', recordingDuration, 'ms')
    })
  }

  private handleRecordingStop = () => {
    console.log('[AudioRecordingService] Recording stopped')
    if (this.config.onStop) {
      this.config.onStop()
    }
  }

  private createFinalBlob(): Blob | null {
    if (this.audioChunks.length === 0) {
      console.warn('[AudioRecordingService] No audio chunks to create blob')
      return null
    }

    const mimeType = this.mediaRecorder?.mimeType || this.config.mimeType || 'audio/webm'
    const blob = new Blob(this.audioChunks, { type: mimeType })
    
    console.log('[AudioRecordingService] Created audio blob:', blob.size, 'bytes, type:', blob.type)
    console.log('[AudioRecordingService] Chunk details:', this.audioChunks.map((chunk, i) => ({
      index: i,
      size: chunk.size,
      type: chunk.type
    })))
    
    // Analyze audio data quality
    const totalChunkSize = this.audioChunks.reduce((sum, chunk) => sum + chunk.size, 0)
    const avgChunkSize = totalChunkSize / this.audioChunks.length
    const recordingDuration = Date.now() - this.startTime
    const bytesPerSecond = blob.size / (recordingDuration / 1000)
    
    console.log('[AudioRecordingService] Audio quality analysis:', {
      totalChunks: this.audioChunks.length,
      totalSize: blob.size,
      averageChunkSize: Math.round(avgChunkSize),
      recordingDuration: `${recordingDuration}ms`,
      bytesPerSecond: Math.round(bytesPerSecond),
      estimatedBitrate: Math.round(bytesPerSecond * 8) + ' bps'
    })
    
    // Warn about potential issues
    if (blob.size < 1000) {
      console.warn(`[AudioRecordingService] Very small audio blob (${blob.size} bytes) - may indicate recording issues`)
    }
    
    if (bytesPerSecond < 1000) {
      console.warn(`[AudioRecordingService] Low data rate (${Math.round(bytesPerSecond)} bytes/sec) - may indicate poor audio quality`)
    }
    
    // Clear chunks after creating blob
    this.audioChunks = []
    
    return blob
  }

  private getBestMimeType(): string {
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ]

    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        console.log('[AudioRecordingService] Using MIME type:', mimeType)
        return mimeType
      }
    }

    console.warn('[AudioRecordingService] No preferred MIME types supported, using default')
    return 'audio/webm'
  }

  getRecordingState(): RecordingState {
    const isRecording = this.mediaRecorder?.state === 'recording'
    const isPaused = this.mediaRecorder?.state === 'paused'
    const duration = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0

    return {
      isRecording,
      isPaused,
      duration,
      error: null
    }
  }

  pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause()
      console.log('[AudioRecordingService] Recording paused')
    }
  }

  resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume()
      console.log('[AudioRecordingService] Recording resumed')
    }
  }

  cleanup(): void {
    console.log('[AudioRecordingService] Cleaning up resources')

    // Stop audio level monitoring
    this.stopAudioLevelMonitoring()

    // Clear timer
    if (this.recordingTimer) {
      clearTimeout(this.recordingTimer)
      this.recordingTimer = null
    }

    // Stop and cleanup MediaRecorder
    if (this.mediaRecorder) {
      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop()
      }
      this.mediaRecorder = null
    }

    // Cleanup audio context
    if (this.audioContext) {
      this.audioContext.close().catch(err => 
        console.warn('[AudioRecordingService] Error closing audio context:', err)
      )
      this.audioContext = null
    }
    this.analyser = null
    this.dataArray = null

    // Stop and cleanup stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        track.stop()
        console.log('[AudioRecordingService] Stopped audio track')
      })
      this.stream = null
    }

    // Clear audio chunks
    this.audioChunks = []
    this.startTime = 0
  }

  // Static method to check browser compatibility
  static isSupported(): boolean {
    const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    const hasMediaRecorder = !!window.MediaRecorder
    const hasAudioContext = !!(window.AudioContext || (window as any).webkitAudioContext)
    
    console.log('[AudioRecordingService] Browser support check:', {
      hasMediaDevices,
      hasMediaRecorder,
      hasAudioContext
    })
    
    return hasMediaDevices && hasMediaRecorder
  }

  // Static method to diagnose audio issues
  static async diagnoseAudioIssues(): Promise<void> {
    try {
      console.log('[AudioRecordingService] Running audio diagnostics...')
      
      // Check permissions
      const permissionResult = await navigator.permissions?.query({ name: 'microphone' as PermissionName })
      console.log('[AudioRecordingService] Microphone permission:', permissionResult?.state || 'unknown')
      
      // List available audio devices
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter(device => device.kind === 'audioinput')
      console.log('[AudioRecordingService] Available audio input devices:', audioInputs.map(device => ({
        deviceId: device.deviceId,
        label: device.label || 'Unknown device',
        groupId: device.groupId
      })))
      
      // Test default microphone access and settings
      try {
        console.log('[AudioRecordingService] Testing default microphone access...')
        const testStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
        
        const audioTrack = testStream.getAudioTracks()[0]
        console.log('[AudioRecordingService] Default microphone settings:', {
          label: audioTrack.label,
          enabled: audioTrack.enabled,
          muted: audioTrack.muted,
          readyState: audioTrack.readyState,
          settings: audioTrack.getSettings(),
          capabilities: audioTrack.getCapabilities?.() || 'Not supported'
        })
        
        // Test audio levels from default device
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        const source = audioContext.createMediaStreamSource(testStream)
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        source.connect(analyser)
        
        // Check audio levels for 3 seconds
        console.log('[AudioRecordingService] Testing audio levels for 3 seconds...')
        let maxDetected = 0
        let avgSum = 0
        let sampleCount = 0
        
        const testInterval = setInterval(() => {
          analyser.getByteFrequencyData(dataArray)
          const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
          const maxLevel = Math.max(...dataArray)
          
          maxDetected = Math.max(maxDetected, maxLevel)
          avgSum += average
          sampleCount++
          
          console.log(`[AudioRecordingService] Audio test - Average: ${Math.round(average)}, Max: ${maxLevel}`)
        }, 500)
        
        setTimeout(() => {
          clearInterval(testInterval)
          console.log('[AudioRecordingService] Audio test results:', {
            maxLevelDetected: maxDetected,
            averageOverTime: Math.round(avgSum / sampleCount),
            microphoneWorking: maxDetected > 10 ? 'YES' : 'NO - CHECK MICROPHONE SETTINGS'
          })
          
          // Cleanup test resources
          testStream.getTracks().forEach(track => track.stop())
          audioContext.close()
        }, 3000)
        
      } catch (micError) {
        console.error('[AudioRecordingService] Microphone test failed:', micError)
      }
      
      // Test supported MIME types
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/ogg'
      ]
      
      console.log('[AudioRecordingService] Supported MIME types:')
      mimeTypes.forEach(mimeType => {
        const supported = MediaRecorder.isTypeSupported(mimeType)
        console.log(`  ${mimeType}: ${supported}`)
      })
      
    } catch (error) {
      console.error('[AudioRecordingService] Audio diagnostics failed:', error)
    }
  }

  // Static method to check microphone permission
  static async checkPermission(): Promise<boolean> {
    try {
      if (!navigator.permissions) {
        return true // Assume permission if API not available
      }

      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      return result.state !== 'denied'
    } catch (error) {
      console.log('[AudioRecordingService] Permission check not supported:', error)
      return true // Assume permission if check fails
    }
  }

  private checkAudioLevels(): void {
    if (!this.analyser || !this.dataArray) return
    
    this.analyser.getByteFrequencyData(this.dataArray)
    
    // Calculate average audio level
    const average = this.dataArray.reduce((sum, value) => sum + value, 0) / this.dataArray.length
    const maxLevel = Math.max(...this.dataArray)
    
    console.log('[AudioRecordingService] Audio levels - Average:', Math.round(average), 'Max:', maxLevel)
    
    // Check if we're detecting any meaningful audio input
    if (maxLevel < 10) {
      console.warn('[AudioRecordingService] Very low audio levels detected - microphone might not be working properly')
    } else if (maxLevel > 50) {
      console.log('[AudioRecordingService] Good audio levels detected')
    }
  }

  private startAudioLevelMonitoring(): void {
    if (!this.analyser || !this.dataArray) return
    
    console.log('[AudioRecordingService] Starting continuous audio level monitoring')
    this.audioLevelCheckInterval = setInterval(() => {
      this.checkAudioLevels()
    }, 1000) // Check every second
  }

  private stopAudioLevelMonitoring(): void {
    if (this.audioLevelCheckInterval) {
      clearInterval(this.audioLevelCheckInterval)
      this.audioLevelCheckInterval = null
      console.log('[AudioRecordingService] Stopped audio level monitoring')
    }
  }

  // Static method to test all available microphones
  static async testAllMicrophones(): Promise<void> {
    try {
      console.log('[AudioRecordingService] Testing all available microphones...')
      
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter(device => device.kind === 'audioinput')
      
      for (let i = 0; i < audioInputs.length; i++) {
        const device = audioInputs[i]
        console.log(`[AudioRecordingService] Testing device ${i + 1}/${audioInputs.length}: ${device.label || 'Unknown device'}`)
        
        try {
          const testStream = await navigator.mediaDevices.getUserMedia({
            audio: { 
              deviceId: device.deviceId,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          })
          
          const audioTrack = testStream.getAudioTracks()[0]
          console.log(`[AudioRecordingService] Device ${i + 1} settings:`, {
            label: audioTrack.label,
            enabled: audioTrack.enabled,
            muted: audioTrack.muted,
            settings: audioTrack.getSettings()
          })
          
          // Quick audio level test (2 seconds)
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
          const source = audioContext.createMediaStreamSource(testStream)
          const analyser = audioContext.createAnalyser()
          analyser.fftSize = 256
          const dataArray = new Uint8Array(analyser.frequencyBinCount)
          source.connect(analyser)
          
          let maxDetected = 0
          
          const quickTest = setInterval(() => {
            analyser.getByteFrequencyData(dataArray)
            const maxLevel = Math.max(...dataArray)
            maxDetected = Math.max(maxDetected, maxLevel)
          }, 200)
          
          await new Promise(resolve => setTimeout(resolve, 2000))
          clearInterval(quickTest)
          
          console.log(`[AudioRecordingService] Device ${i + 1} test result:`, {
            deviceId: device.deviceId,
            label: device.label || 'Unknown device',
            maxAudioLevel: maxDetected,
            working: maxDetected > 10 ? 'YES ✅' : 'NO ❌'
          })
          
          // Cleanup
          testStream.getTracks().forEach(track => track.stop())
          audioContext.close()
          
        } catch (deviceError) {
          console.error(`[AudioRecordingService] Device ${i + 1} test failed:`, deviceError)
        }
      }
      
    } catch (error) {
      console.error('[AudioRecordingService] Failed to test microphones:', error)
    }
  }
} 