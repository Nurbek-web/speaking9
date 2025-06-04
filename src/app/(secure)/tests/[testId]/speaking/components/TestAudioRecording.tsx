'use client'

import { useState, useEffect } from 'react'
import { Mic, MicOff, AlertCircle, Play, Square, Clock, Volume2 } from 'lucide-react'
import { TestQuestion } from '../types'
import { RecordingState } from '../services/AudioRecordingService'
import { Button } from '@/components/ui/button'

interface TestAudioRecordingProps {
  question: TestQuestion | null
  recordingState: RecordingState
  userResponse?: any
  onStartRecording: () => void
  onStopRecording: () => void
  disabled?: boolean
}

export default function TestAudioRecording({
  question,
  recordingState,
  userResponse,
  onStartRecording,
  onStopRecording,
  disabled
}: TestAudioRecordingProps) {
  const [preparationTimer, setPreparationTimer] = useState<number | null>(null)
  const [isPreparationActive, setIsPreparationActive] = useState(false)

  const hasRecording = userResponse?.status === 'completed'
  const isSkipped = userResponse?.status === 'skipped'
  const isPart2 = question?.part_number === 2

  // Start preparation timer for Part 2
  const startPreparation = () => {
    if (!isPart2) return
    setPreparationTimer(60) // 1 minute preparation
    setIsPreparationActive(true)
  }

  // Preparation timer countdown
  useEffect(() => {
    if (preparationTimer === null || !isPreparationActive) return

    if (preparationTimer <= 0) {
      setIsPreparationActive(false)
      setPreparationTimer(null)
      return
    }

    const interval = setInterval(() => {
      setPreparationTimer(prev => prev ? prev - 1 : 0)
    }, 1000)

    return () => clearInterval(interval)
  }, [preparationTimer, isPreparationActive])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getRecordingStateIcon = () => {
    if (recordingState.isRecording) return Square
    if (hasRecording) return Volume2
    return Mic
  }

  const getRecordingStateColor = () => {
    if (recordingState.isRecording) return 'red'
    if (hasRecording) return 'green'
    return 'blue'
  }

  const RecordingIcon = getRecordingStateIcon()
  const stateColor = getRecordingStateColor()

  if (!question) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-4">
          <div className="flex items-center justify-center space-x-2">
            <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse"></div>
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="p-5">
        <div className="space-y-5">
          {/* Header */}
          <div className="text-center">
            <h3 className="text-lg font-semibold text-card-foreground">Audio Recording</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {isPart2 ? 'Prepare for 1 minute, then record for 2 minutes' : 'Record your answer'}
            </p>
          </div>

          {/* Part 2 Preparation Timer */}
          {isPart2 && !hasRecording && !isSkipped && (
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              {!isPreparationActive ? (
                <div className="text-center space-y-3">
                  <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400 mx-auto" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">Part 2 Preparation</p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">Take 1 minute to prepare your answer</p>
                  </div>
                  <button
                    onClick={startPreparation}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Start Preparation
                  </button>
                </div>
              ) : (
                <div className="text-center space-y-2">
                  <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                    {formatTime(preparationTimer || 0)}
                  </div>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {preparationTimer && preparationTimer > 0 ? 'Preparation time remaining' : 'Ready to record!'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Recording Status Display */}
          <div className="text-center space-y-4">
            {/* Recording Button */}
            <div className="relative">
              <button
                onClick={recordingState.isRecording ? onStopRecording : onStartRecording}
                disabled={disabled || (isPart2 && isPreparationActive)}
                className={`
                  relative w-20 h-20 rounded-full font-semibold text-white shadow-lg 
                  transition-all duration-300 hover:scale-110 active:scale-95 
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                  ${stateColor === 'red' 
                    ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30 animate-pulse' 
                    : stateColor === 'green'
                    ? 'bg-green-500 hover:bg-green-600 shadow-green-500/30'
                    : 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/30'
                  }
                `}
              >
                <RecordingIcon className="w-8 h-8 mx-auto" />
                
                {/* Recording pulse animation */}
                {recordingState.isRecording && (
                  <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-20"></div>
                )}
              </button>
            </div>

            {/* Recording Status Text */}
            <div className="space-y-2">
              <div className="text-lg font-semibold text-card-foreground">
                {recordingState.isRecording ? (
                  <span className="text-red-600 dark:text-red-400">Recording...</span>
                ) : hasRecording ? (
                  <span className="text-green-600 dark:text-green-400">Answer Recorded</span>
                ) : isSkipped ? (
                  <span className="text-blue-600 dark:text-blue-400">Question Skipped</span>
                ) : (
                  <span className="text-muted-foreground">Ready to Record</span>
                )}
              </div>

              {/* Timer Display */}
              {(recordingState.isRecording || recordingState.duration > 0) && (
                <div className="text-sm text-muted-foreground">
                  {formatTime(recordingState.duration)}
                  {question && (
                    <span className="text-xs ml-2">
                      / {formatTime(question.part_number === 1 ? 60 : question.part_number === 2 ? 120 : 60)} max
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Recording Guidelines */}
          <div className="bg-muted/30 rounded-lg p-4">
            <h4 className="font-medium text-card-foreground mb-2">Recording Tips</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Speak clearly and at a natural pace</li>
              <li>• Use examples to support your points</li>
              {isPart2 && <li>• Cover all points on the cue card</li>}
              <li>• Don't worry about perfection</li>
            </ul>
          </div>

          {/* Recording Metadata */}
          {hasRecording && userResponse?.metadata && (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-green-700 dark:text-green-300">✅ Recording saved</span>
                <span className="text-green-600 dark:text-green-400 font-medium">
                  {formatTime(userResponse.metadata.recording_duration || 0)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 