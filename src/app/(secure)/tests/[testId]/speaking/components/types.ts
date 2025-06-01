// Import from shared types
import { 
  TestQuestion, 
  TestInfo, 
  UserResponse as BaseUserResponse, 
  FeedbackResult as BaseFeedbackResult, // Rename to avoid conflict 
  PART_NAMES,
  RecordingStatus as BaseRecordingStatus
} from '@/components/speaking/types';

// Re-export the base types we don't modify
export type { 
  TestQuestion, 
  TestInfo, 
  // BaseFeedbackResult // We will define our own extended one
};
export { PART_NAMES };

// Define an extended FeedbackResult for this component
// Making all properties optional for flexibility during overall feedback generation
export interface FeedbackResult {
  band_score: number;
  overall_band_score: number;
  fluency_coherence_score: number;
  lexical_resource_score: number;
  grammar_accuracy_score: number;
  pronunciation_score: number;
  general_feedback: string;
  fluency_coherence_feedback: string;
  lexical_resource_feedback: string;
  grammar_accuracy_feedback: string;
  pronunciation_feedback: string;
  model_answer: string;
  band_scores: { 
    fluency: number; 
    lexical: number; 
    grammar: number; 
    pronunciation: number; 
    overall: number; 
  };
  strengths: string;
  areas_for_improvement: string;
  study_advice: string;
}

// Re-export the RecordingStatus type for use in components
export type { BaseRecordingStatus as RecordingStatus };

// Extended status for user responses
export type ExtendedRecordingStatus = BaseUserResponse['status'] | 'error' | 'local';

// Extended UserResponse type with required status and optional error field
export interface UserResponse extends Omit<BaseUserResponse, 'status'> {
  error?: string;
  status: ExtendedRecordingStatus;
  metadata?: Record<string, any>; // Additional metadata for the response (preparation status, etc.)
}

// SpeakingTestState interface
export interface SpeakingTestState {
  loading: boolean;
  error: string | null;
  testId: string | undefined;
  testInfo: TestInfo | null;
  questions: TestQuestion[];
  currentPartIndex: number; // 0, 1, 2
  currentQuestionIndex: number; // Index within the current part's questions
  partQuestions: TestQuestion[]; // Questions for the current part
  currentQuestion: TestQuestion | null;
  isPreparationTime: boolean;
  questionTimer: number | null; // Timer for current question (speaking or prep)
  userResponses: Record<string, UserResponse>; // questionId -> UserResponse
  isMuted: boolean;
  isTestCompleted: boolean;
  isSubmitting: boolean; // For overall test submission
  allPartsFeedback: FeedbackResult | null; // Use our extended FeedbackResult
  isSubmitDialogOpen: boolean;
  overallTestTimer: number; // Tracks total time spent on the test page
  initialUser: any | null;
  authenticatedSupabaseId?: string; // ID used for authentication with Supabase
}

// Action types
export type SpeakingTestAction =
  | { type: 'INIT_TEST'; payload: { testId: string | undefined; user: any | null } }
  | { type: 'LOAD_TEST_DATA_START' }
  | { type: 'LOAD_TEST_DATA_SUCCESS'; payload: { testInfo: TestInfo; questions: TestQuestion[]; initialResponses: Record<string, UserResponse>; determinedPartIndex: number; determinedQuestionIndex: number } }
  | { type: 'LOAD_TEST_DATA_FAILURE'; payload: string }
  | { type: 'SET_PART_QUESTIONS'; payload: { partIndex: number; questionIndex: number } }
  | { type: 'BROWSER_COMPATIBILITY_ERROR'; payload: string }
  | { type: 'START_PREPARATION' }
  | { type: 'END_PREPARATION'; payload?: { questionId?: string } }
  | { type: 'START_SPEAKING' }
  | { type: 'SET_QUESTION_TIMER'; payload: number | null }
  | { type: 'AUDIO_RECORDED'; payload: { questionId: string; audioBlob: Blob; url: string } }
  | { type: 'QUESTION_SKIPPED'; payload: { questionId: string } }
  | { type: 'SKIP_REMAINING_TIME'; payload: { questionId: string } }
  | { type: 'NAVIGATE_TO_NEXT_QUESTION_OR_PART' }
  | { type: 'FINISH_TEST_ATTEMPT' } // Triggers submit dialog
  | { type: 'TOGGLE_MUTE' }
  | { type: 'SUBMIT_ALL_RESPONSES_START' }
  | { type: 'SUBMIT_ALL_RESPONSES_SUCCESS'; payload: { allFeedback: Record<string, UserResponse>; overallFeedback: FeedbackResult | null } }
  | { type: 'SUBMIT_ALL_RESPONSES_FAILURE'; payload: string }
  | { type: 'OPEN_SUBMIT_DIALOG' }
  | { type: 'CLOSE_SUBMIT_DIALOG' }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'INCREMENT_OVERALL_TIMER' }
  | { type: 'RESET_QUESTION_STATE' }
  | { type: 'STORAGE_ERROR'; payload: { questionId: string; error: any } }
  | { type: 'SET_SUBMITTING'; value: boolean }
  | { type: 'SET_AUTHENTICATED_ID'; payload: string | undefined } // Ensure payload can be undefined
  | { type: 'UPDATE_USER_RESPONSE'; questionId: string; response: Partial<UserResponse> };

// Component props interfaces
export interface LoadingScreenProps {
  stage: number;
  message: string;
}

export interface ErrorScreenProps {
  error: string;
  onRetry?: () => void;
  onBack?: () => void;
}

export interface TestCompletedUIProps {
  allPartsFeedback: FeedbackResult | null;
  router: any;
  testId: string | undefined;
  userResponses: Record<string, UserResponse>;
}

export interface MainTestUIProps {
  currentQuestion: TestQuestion;
  testInfo: TestInfo;
  questions: TestQuestion[];
  currentPartIndex: number;
  currentQuestionIndex: number;
  overallTimer: number;
  isMuted: boolean;
  timer: number | null;
  userResponses: Record<string, UserResponse>;
  isSubmitDialogOpen: boolean;
  isSubmitting: boolean;
  error: string | null;
  dispatch: React.Dispatch<SpeakingTestAction>;
  submitAllResponsesAsync: () => Promise<void>;
  onQuestionTimerUpdate: (seconds: number) => void;
  handleSubmitTest?: () => Promise<void>;
} 