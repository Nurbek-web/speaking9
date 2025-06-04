import { Button } from '@/components/ui/button'
import { FeedbackResult, TestInfo, UserResponse } from '../types'

interface TestCompletionScreenProps {
  feedback: FeedbackResult
  testInfo: TestInfo
  userResponses: Record<string, UserResponse>
  onViewResults: () => void
  onRetakeTest: () => void
}

export default function TestCompletionScreen({ 
  feedback, 
  testInfo, 
  userResponses, 
  onViewResults, 
  onRetakeTest 
}: TestCompletionScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-background to-blue-50 dark:from-green-950 dark:via-background dark:to-blue-950 flex items-center justify-center">
      <div className="max-w-2xl mx-auto p-6 text-center">
        <div className="mb-8">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Test Completed!</h1>
          <p className="text-lg text-muted-foreground">Great job on completing {testInfo.title}</p>
        </div>

        <div className="bg-card rounded-xl shadow-lg border border-border p-8 mb-8">
          <div className="text-center">
            <div className="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2">
              {feedback.overall_band_score.toFixed(1)}
            </div>
            <p className="text-lg text-muted-foreground">Overall Band Score</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="text-center">
              <div className="text-2xl font-semibold text-card-foreground">
                {feedback.band_scores.fluency.toFixed(1)}
              </div>
              <p className="text-sm text-muted-foreground">Fluency</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-card-foreground">
                {feedback.band_scores.lexical.toFixed(1)}
              </div>
              <p className="text-sm text-muted-foreground">Lexical</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-card-foreground">
                {feedback.band_scores.grammar.toFixed(1)}
              </div>
              <p className="text-sm text-muted-foreground">Grammar</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-card-foreground">
                {feedback.band_scores.pronunciation.toFixed(1)}
              </div>
              <p className="text-sm text-muted-foreground">Pronunciation</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Button onClick={onViewResults} size="lg" className="w-full md:w-auto bg-blue-600 hover:bg-blue-700">
            View Detailed Results
          </Button>
          <Button onClick={onRetakeTest} variant="outline" size="lg" className="w-full md:w-auto">
            Take Test Again
          </Button>
        </div>
      </div>
    </div>
  )
} 