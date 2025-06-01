// Re-export shared types
export type { 
  TestQuestion, 
  TestInfo
} from '@/components/speaking/types'

export { PART_NAMES } from '@/components/speaking/types'

// Import TestQuestion for local use
import type { TestQuestion } from '@/components/speaking/types'

// Simplified user response type
export interface UserResponse {
  id?: string
  test_question_id: string
  status: 'idle' | 'in_progress' | 'completed' | 'skipped' | 'error'
  audioBlob?: Blob
  audio_url?: string
  transcript?: string
  error?: string
  metadata?: {
    preparation_completed?: boolean
    recording_duration?: number
    [key: string]: any
  }
  feedback?: FeedbackResult
}

// Feedback result type
export interface FeedbackResult {
  band_score: number
  overall_band_score: number
  fluency_coherence_score: number
  lexical_resource_score: number
  grammar_accuracy_score: number
  pronunciation_score: number
  general_feedback: string
  fluency_coherence_feedback: string
  lexical_resource_feedback: string
  grammar_accuracy_feedback: string
  pronunciation_feedback: string
  model_answer: string
  band_scores: {
    fluency: number
    lexical: number
    grammar: number
    pronunciation: number
    overall: number
  }
  strengths: string
  areas_for_improvement: string
  study_advice: string
}

// Test navigation state
export interface TestNavigation {
  currentPartIndex: number
  currentQuestionIndex: number
  currentQuestion: TestQuestion | null
  canGoNext: boolean
  canGoPrevious: boolean
  isLastQuestion: boolean
}

// Test progress information
export interface TestProgress {
  completedQuestions: number
  totalQuestions: number
  partProgress: {
    part1: { completed: number; total: number }
    part2: { completed: number; total: number }
    part3: { completed: number; total: number }
  }
  overallPercentage: number
} 