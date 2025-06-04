import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { TestProgress } from '../types'

interface SubmissionState {
  isSubmitting: boolean
  error: string | null
}

interface TestSubmissionDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  progress: TestProgress
  submissionState: SubmissionState
}

export default function TestSubmissionDialog({
  isOpen,
  onClose,
  onConfirm,
  progress,
  submissionState
}: TestSubmissionDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground">
            Submit Test
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Compact Progress Summary */}
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Progress</span>
              <span className="text-sm font-semibold text-foreground">
                {progress.completedQuestions}/{progress.totalQuestions}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.overallPercentage}%` }}
              />
            </div>
            <div className="text-center mt-1">
              <span className="text-xs text-muted-foreground">
                {Math.round(progress.overallPercentage)}% Complete
              </span>
            </div>
          </div>

          {/* Compact Confirmation Text */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Ready to submit your speaking test?
            </p>
            <p className="text-xs text-muted-foreground mt-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded p-2">
              You won't be able to make changes after submission.
            </p>
          </div>

          {/* Compact Error Display */}
          {submissionState.error && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-red-900 dark:text-red-100 text-sm">Error</h4>
                  <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">{submissionState.error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Compact Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={submissionState.isSubmitting}
              className="flex-1 px-4 py-2 bg-muted hover:bg-muted/80 border border-border rounded-lg text-muted-foreground font-medium text-sm transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={submissionState.isSubmitting}
              className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {submissionState.isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Submit</span>
                </>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 