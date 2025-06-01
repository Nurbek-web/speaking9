import { Button } from '@/components/ui/button'
import { SkipForward, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react'
import { TestNavigation } from '../types'
import { RecordingState } from '../services/AudioRecordingService'

interface TestControlsProps {
  navigation: TestNavigation
  recordingState: RecordingState
  onSkipQuestion: () => void
  onNextQuestion: () => void
  onFinishTest: () => void
  disabled?: boolean
}

export default function TestControls({ 
  navigation, 
  recordingState, 
  onSkipQuestion, 
  onNextQuestion, 
  onFinishTest, 
  disabled 
}: TestControlsProps) {
  const isRecordingBlocked = recordingState.isRecording
  const isDisabled = disabled || isRecordingBlocked

  const getPartName = (partIndex: number): string => {
    switch (partIndex) {
      case 0: return 'Interview'
      case 1: return 'Long Turn'
      case 2: return 'Discussion'
      default: return 'Unknown'
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      <div className="p-8">
        {/* Recording Status Warning */}
        {isRecordingBlocked && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-amber-900">Recording in Progress</h4>
                <p className="text-sm text-amber-700 mt-1">Stop your recording before continuing</p>
              </div>
            </div>
          </div>
        )}

        {/* Control Actions */}
        <div className="space-y-6">
          {/* Progress Info */}
          <div className="text-center space-y-2">
            <div className="text-lg font-semibold text-gray-900">
              {navigation.isLastQuestion 
                ? "Ready to submit your test" 
                : `Part ${navigation.currentPartIndex + 1}: ${getPartName(navigation.currentPartIndex)}`
              }
            </div>
            {!navigation.isLastQuestion && (
              <p className="text-gray-600">
                Question {navigation.currentQuestionIndex + 1} • Continue when ready
              </p>
            )}
          </div>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Skip Button */}
            <button
              onClick={onSkipQuestion}
              disabled={isDisabled}
              className="flex items-center justify-center space-x-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <SkipForward className="w-4 h-4" />
              <span>Skip Question</span>
            </button>

            {/* Primary Action Button */}
            {navigation.isLastQuestion ? (
              <button
                onClick={onFinishTest}
                disabled={disabled}
                className="flex-1 flex items-center justify-center space-x-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle className="w-5 h-5" />
                <span>Complete Test</span>
              </button>
            ) : (
              <button
                onClick={onNextQuestion}
                disabled={isDisabled}
                className="flex-1 flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 