import { Button } from '@/components/ui/button'
import { ArrowRight, CheckCircle, Play, RotateCcw, SkipForward, Clock } from 'lucide-react'
import { TestNavigation } from '../types'
import { RecordingState } from '../services/AudioRecordingService'

interface TestControlsProps {
  navigation: TestNavigation
  recordingState: RecordingState
  userResponse?: any
  onNextQuestion: () => void
  onFinishTest: () => void
  onPlayRecording: () => void
  onReRecord: () => void
  onSkipQuestion: () => void
  disabled?: boolean
}

export default function TestControls({ 
  navigation, 
  recordingState, 
  userResponse,
  onNextQuestion, 
  onFinishTest, 
  onPlayRecording,
  onReRecord,
  onSkipQuestion,
  disabled 
}: TestControlsProps) {
  const isRecordingBlocked = recordingState.isRecording
  const hasRecording = userResponse?.status === 'completed'
  const isSkipped = userResponse?.status === 'skipped'

  const getPartName = (partIndex: number): string => {
    switch (partIndex) {
      case 0: return 'Interview'
      case 1: return 'Long Turn'
      case 2: return 'Discussion'
      default: return 'Unknown'
    }
  }

  // Determine the primary action
  const getPrimaryAction = () => {
    if (navigation.isLastQuestion) {
      return {
        label: 'Submit Test',
        icon: CheckCircle,
        onClick: onFinishTest,
        variant: 'success' as const,
        disabled: disabled
      }
    }

    if (hasRecording) {
      return {
        label: 'Next Question',
        icon: ArrowRight,
        onClick: onNextQuestion,
        variant: 'primary' as const,
        disabled: disabled || isRecordingBlocked
      }
    }

    return {
      label: 'Skip Question',
      icon: SkipForward,
      onClick: onSkipQuestion,
      variant: 'secondary' as const,
      disabled: disabled || isRecordingBlocked
    }
  }

  const primaryAction = getPrimaryAction()

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
      <div className="p-5">
        <div className="space-y-5">
          {/* Enhanced Status Display */}
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <h3 className="text-lg font-semibold text-card-foreground">
                {navigation.isLastQuestion 
                  ? "Final Question" 
                  : `Question ${navigation.currentQuestionIndex + 1}`
                }
              </h3>
            </div>
            
            <div className="text-sm text-muted-foreground">
              {getPartName(navigation.currentPartIndex)} • Part {navigation.currentPartIndex + 1}
            </div>

            {/* Smart Status Indicator */}
            <div className="flex items-center justify-center">
              {isRecordingBlocked ? (
                <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-3 py-1 rounded-full">
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                  <span className="text-xs font-medium">Recording...</span>
                </div>
              ) : hasRecording ? (
                <div className="flex items-center space-x-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 px-3 py-1 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  <span className="text-xs font-medium">Answer Recorded</span>
                </div>
              ) : isSkipped ? (
                <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-3 py-1 rounded-full">
                  <SkipForward className="w-3 h-3" />
                  <span className="text-xs font-medium">Question Skipped</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  <Clock className="w-3 h-3" />
                  <span className="text-xs font-medium">Ready to Record</span>
                </div>
              )}
            </div>
          </div>

          {/* Recording Controls - Only show when relevant */}
          {hasRecording && !isRecordingBlocked && (
            <div className="bg-muted/30 rounded-lg p-3">
              <div className="flex gap-2">
                <button
                  onClick={onPlayRecording}
                  className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Play className="w-4 h-4" />
                  <span>Listen</span>
                </button>
                <button
                  onClick={onReRecord}
                  className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Re-record</span>
                </button>
              </div>
            </div>
          )}

          {/* Primary Action Button */}
          <button
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
            className={`w-full flex items-center justify-center space-x-3 px-6 py-4 rounded-xl font-semibold text-base transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${
              primaryAction.variant === 'success' 
                ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg shadow-green-500/25' 
                : primaryAction.variant === 'primary'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground border border-border'
            }`}
          >
            <primaryAction.icon className="w-5 h-5" />
            <span>{primaryAction.label}</span>
          </button>

          {/* Context-Aware Tips */}
          {!isRecordingBlocked && (
            <div className="text-center border-t border-border pt-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {hasRecording ? (
                  <>🎉 <span className="font-medium">Great job!</span> You can review your answer or continue</>
                ) : isSkipped ? (
                  <>📝 <span className="font-medium">Come back later</span> to practice this question</>
                ) : navigation.isLastQuestion ? (
                  <>🏁 <span className="font-medium">Final step!</span> Submit to see your results</>
                ) : (
                  <>💡 <span className="font-medium">Best practice:</span> Record your answer for better learning</>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 