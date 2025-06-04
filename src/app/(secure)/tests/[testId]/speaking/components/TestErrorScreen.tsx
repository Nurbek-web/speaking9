import { AlertCircle, RotateCcw, ArrowLeft } from 'lucide-react'

interface TestErrorScreenProps {
  error: string
  onRetry?: () => void
  onBack?: () => void
}

export default function TestErrorScreen({ error, onRetry, onBack }: TestErrorScreenProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="max-w-md text-center space-y-6 p-6">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-950 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>
        
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Something went wrong
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {error}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center justify-center space-x-2 px-4 py-2 bg-muted hover:bg-muted/80 text-muted-foreground font-medium rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Go Back</span>
            </button>
          )}
          
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Try Again</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
} 