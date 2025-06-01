'use client'

import { useState, useEffect } from 'react'
import { Mic, MicOff, AlertCircle, Play } from 'lucide-react'
import { TestQuestion } from '../types'
import { RecordingState } from '../services/AudioRecordingService'

interface TestAudioRecordingProps {
  question: TestQuestion | null
  recordingState: RecordingState
  onStartRecording: () => Promise<void>
  onStopRecording: () => Promise<void>
  disabled?: boolean
}

export default function TestAudioRecording({
  question,
  recordingState,
  onStartRecording,
  onStopRecording,
  disabled = false
}: TestAudioRecordingProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!question) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="p-8">
          <div className="flex items-center justify-center space-x-3">
            <div className="w-4 h-4 bg-blue-600 rounded-full animate-pulse"></div>
            <span className="text-gray-600 font-medium">Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      <div className="p-8">
        <div className="text-center space-y-6">
          {/* Recording Button */}
          <div className="flex items-center justify-center">
            {recordingState.isRecording ? (
              <div className="relative">
                {/* Pulse rings */}
                <div className="absolute inset-0 bg-red-400 rounded-full animate-ping opacity-25 scale-110"></div>
                <div className="absolute inset-0 bg-red-400 rounded-full animate-ping opacity-25 scale-125" style={{ animationDelay: '0.5s' }}></div>
                
                <button
                  onClick={onStopRecording}
                  disabled={disabled}
                  className="relative w-20 h-20 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50"
                >
                  <MicOff className="w-8 h-8" />
                </button>
              </div>
            ) : (
              <button
                onClick={onStartRecording}
                disabled={disabled}
                className="w-20 h-20 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              >
                <Mic className="w-8 h-8" />
              </button>
            )}
          </div>

          {/* Status */}
          {recordingState.isRecording ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
                <span className="text-red-600 font-semibold">Recording</span>
              </div>
              
              <div className="text-4xl font-mono font-bold text-gray-900 tracking-wider">
                {formatTime(recordingState.duration)}
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-900">Speak naturally</h3>
                <p className="text-gray-600">Your response is being captured</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Ready to Record</h2>
              <p className="text-gray-600">
                Tap the microphone to start recording your response
              </p>
              
              {/* Quality indicators */}
              <div className="flex items-center justify-center space-x-6 pt-2">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">High Quality</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">Auto-Save</span>
                </div>
              </div>
            </div>
          )}

          {/* Error Display */}
          {recordingState.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <div className="text-left">
                  <h4 className="font-medium text-red-900">Recording Error</h4>
                  <p className="text-sm text-red-700 mt-1">{recordingState.error}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 