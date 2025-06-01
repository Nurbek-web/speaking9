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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-gray-900">
            Submit Test
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Progress Summary */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Completed Questions</span>
              <span className="text-sm font-semibold text-gray-900">
                {progress.completedQuestions}/{progress.totalQuestions}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.overallPercentage}%` }}
              />
            </div>
          </div>

          {/* Confirmation Text */}
          <p className="text-gray-600">
            Are you ready to submit your speaking test? You won't be able to make changes after submission.
          </p>

          {/* Error Display */}
          {submissionState.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-red-900">Submission Error</h4>
                  <p className="text-sm text-red-700 mt-1">{submissionState.error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={submissionState.isSubmitting}
              className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={submissionState.isSubmitting}
              className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {submissionState.isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              <span>
                {submissionState.isSubmitting ? 'Submitting...' : 'Submit Test'}
              </span>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 