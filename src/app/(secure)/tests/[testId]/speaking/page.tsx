'use client'

// Debug flag to control logging - set to false to disable most logs
const DEBUG = false;

import { useEffect, useState, useMemo, useCallback, useReducer } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient, User } from '@supabase/auth-helpers-nextjs'
import { useUser } from '@clerk/nextjs'
import ProtectedRoute from '@/components/ProtectedRoute'
import { 
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  SkipForward,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import storageService from '@/lib/storage'

// Import types and components
import { 
  TestQuestion, 
  TestInfo, 
  UserResponse, 
  FeedbackResult, 
  PART_NAMES,
  RecordingStatus // Added RecordingStatus for props if needed, though not directly used by MainTestUI/TestCompletedUI
} from '@/components/speaking/types'
import TestSectionHeader from '@/components/speaking/TestSectionHeader'
import AudioRecorder from '@/components/speaking/AudioRecorder'
import CountdownDisplay from '@/components/speaking/CountdownDisplay'
import PreparationTimer from '@/components/speaking/PreparationTimer'
import { 
  getSpeakingDurationForQuestion, 
  getPartTimingInfo, 
  formatTime, 
  calculateProgress,
  checkMicrophonePermission,
  getBrowserInfo,
  formatOverallTime // Ensure this is imported if used by moved components
} from './testUtils'

// At the top of the file, add import for the adapter
import { clerkToSupabaseId, syncUserToSupabase, createTemporarySession } from '@/lib/clerkSupabaseAdapter'

// --- State Management with useReducer ---

interface SpeakingTestState {
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
  allPartsFeedback: FeedbackResult | null;
  isSubmitDialogOpen: boolean;
  overallTestTimer: number; // Tracks total time spent on the test page
  // Potentially add a general testStatus: 'idle' | 'loading' | 'preparing' | 'speaking' | 'paused' | 'submitting' | 'completed' | 'error'
}

// Helper function for logging only in debug mode
const debugLog = (...args: any[]) => {
  if (DEBUG) {
    console.log(...args);
  }
};

const initialState: SpeakingTestState = {
  loading: true,
  error: null,
  testId: undefined,
  testInfo: null,
  questions: [],
  currentPartIndex: 0,
  currentQuestionIndex: 0,
  partQuestions: [],
  currentQuestion: null,
  isPreparationTime: false,
  questionTimer: null,
  userResponses: {},
  isMuted: false,
  isTestCompleted: false,
  isSubmitting: false,
  allPartsFeedback: null,
  isSubmitDialogOpen: false,
  overallTestTimer: 0,
};

type SpeakingTestAction =
  | { type: 'INIT_TEST'; payload: { testId: string | undefined; user: User | null } } // Added user here
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
  | { type: 'UPDATE_USER_RESPONSE'; questionId: string; response: Partial<UserResponse> };

// Utility to filter and set current question based on part/question indices
const getUpdatedQuestionState = (questions: TestQuestion[], partIndex: number, questionIndex: number) => {
  const partNumber = partIndex + 1;
  const filteredPartQuestions = questions.filter(q => q.part_number === partNumber);
  let currentQ: TestQuestion | null = null;
  if (filteredPartQuestions.length > 0) {
    if (questionIndex < filteredPartQuestions.length) {
      currentQ = filteredPartQuestions[questionIndex];
    } else {
      // This case should ideally be handled by navigation logic to prevent out of bounds
      currentQ = filteredPartQuestions[filteredPartQuestions.length - 1]; 
    }
  }
  return { partQuestions: filteredPartQuestions, currentQuestion: currentQ };
};

function speakingTestReducer(state: SpeakingTestState, action: SpeakingTestAction): SpeakingTestState {
  // Only log non-timer-related actions to reduce noise
  if (DEBUG && action.type !== 'INCREMENT_OVERALL_TIMER' && action.type !== 'SET_QUESTION_TIMER') {
    debugLog('[Reducer Action]', action.type);
  }

  switch (action.type) {
    case 'INIT_TEST':
      // If it's the same testId and we are not in an error state or already loaded, don't re-init to loading
      if (state.testId === action.payload.testId && (state.testInfo !== null || state.error !== null) && !state.loading) {
        debugLog('[Reducer INIT_TEST] Same testId, already loaded or errored, not forcing reload.');
        return state; 
      }
      debugLog('[Reducer INIT_TEST] Initializing/Re-initializing test loading.');
      return { 
        ...initialState, 
        testId: action.payload.testId, 
        loading: true, 
        error: null,   
        overallTestTimer: state.testId === action.payload.testId ? state.overallTestTimer : 0 
      };
    case 'LOAD_TEST_DATA_START':
      return { ...state, loading: true, error: null };
    case 'LOAD_TEST_DATA_SUCCESS': {
      const { testInfo, questions, initialResponses, determinedPartIndex, determinedQuestionIndex } = action.payload;
      const { partQuestions, currentQuestion } = getUpdatedQuestionState(questions, determinedPartIndex, determinedQuestionIndex);
      return {
        ...state,
        loading: false,
        testInfo,
        questions,
        userResponses: initialResponses,
        currentPartIndex: determinedPartIndex,
        currentQuestionIndex: determinedQuestionIndex,
        partQuestions,
        currentQuestion,
        isPreparationTime: currentQuestion?.part_number === 2 && determinedQuestionIndex === 0 && !!testInfo.part2_preparation_seconds && testInfo.part2_preparation_seconds > 0 && !(initialResponses[currentQuestion?.id || '']?.audioBlob),
        questionTimer: null, // Reset timer for the new question/part
      };
    }
    case 'LOAD_TEST_DATA_FAILURE':
      return { ...state, loading: false, error: action.payload };
    case 'BROWSER_COMPATIBILITY_ERROR':
      return { ...state, loading: false, error: action.payload }; // Stop loading on compatibility error
    
    case 'SET_PART_QUESTIONS': { // This action might be merged with navigation logic
        const { partIndex, questionIndex } = action.payload;
        const { partQuestions, currentQuestion } = getUpdatedQuestionState(state.questions, partIndex, questionIndex);
        return {
            ...state,
            currentPartIndex: partIndex,
            currentQuestionIndex: questionIndex,
            partQuestions,
            currentQuestion,
            questionTimer: null, // Reset timer
            isPreparationTime: false, // Reset prep time, specific logic will set it true
        };
    }

    case 'RESET_QUESTION_STATE':
      return {
        ...state,
        questionTimer: null,
        isPreparationTime: false,
        // userAction in AudioRecorder will be reset by its own effect on questionId change
      };

    case 'START_PREPARATION':
      if (state.currentQuestion?.part_number === 2 && state.currentQuestionIndex === 0 && state.testInfo?.part2_preparation_seconds) {
        return { ...state, isPreparationTime: true, questionTimer: state.testInfo.part2_preparation_seconds };
      }
      return state;
    case 'END_PREPARATION':
      debugLog("[Reducer END_PREPARATION] Ending preparation time, transitioning to speaking", action.payload?.questionId || state.currentQuestion?.id);
      // Store in userResponses that preparation was skipped to prevent it from restarting
      const currentQuestionId = action.payload?.questionId || state.currentQuestion?.id;
      if (currentQuestionId) {
        debugLog("[Reducer END_PREPARATION] Marking question as having preparation skipped:", currentQuestionId);
        return { 
          ...state, 
          isPreparationTime: false, 
          questionTimer: null,
          userResponses: {
            ...state.userResponses,
            [currentQuestionId]: {
              ...(state.userResponses[currentQuestionId] || {}),
              test_question_id: currentQuestionId,
              preparationSkipped: true,
              status: 'in_progress'
            }
          }
        };
      }
      return { ...state, isPreparationTime: false, questionTimer: null };
    case 'START_SPEAKING': 
      {
        let speakingDuration = 40; // default
        if(state.currentQuestion && state.testInfo) {
          speakingDuration = getSpeakingDurationForQuestion(state.currentQuestion);
        }
        return { 
          ...state, 
          isPreparationTime: false, 
          questionTimer: speakingDuration 
        };
      }
    case 'SET_QUESTION_TIMER':
      return { ...state, questionTimer: action.payload };
    case 'AUDIO_RECORDED':
      debugLog(`[Reducer AUDIO_RECORDED] Received audio for question ${action.payload.questionId}, blob size: ${action.payload.audioBlob.size} bytes`);
      
      // Create a clone of the blob to prevent reference issues
      const blobCopy = new Blob([action.payload.audioBlob], { type: action.payload.audioBlob.type });
      
      // Create a File object from the blob for better persistence
      const audioFile = new File(
        [blobCopy], 
        `recording-${action.payload.questionId}.wav`, 
        { type: blobCopy.type }
      );
      
      return {
        ...state,
        userResponses: {
          ...state.userResponses,
          [action.payload.questionId]: {
            ...(state.userResponses[action.payload.questionId] || {}),
            test_question_id: action.payload.questionId,
            audioBlob: blobCopy, // Store the blob copy
            audioFile: audioFile, // Also store as File object for better persistence
            audio_url: action.payload.url,
            blobSize: blobCopy.size, // Add size for debugging
            blobType: blobCopy.type, // Add type for debugging
            recordedAt: new Date().toISOString(), // Track when it was recorded
            status: 'in_progress',
          },
        },
        questionTimer: null, // Stop timer after recording for this question
      };
    case 'QUESTION_SKIPPED': {
      const existingResponseForSkip = state.userResponses[action.payload.questionId] || {};
      return {
        ...state,
        userResponses: {
          ...state.userResponses,
          [action.payload.questionId]: {
            ...existingResponseForSkip,
            test_question_id: action.payload.questionId,
            status: 'skipped',
            audioBlob: undefined, 
            audio_url: undefined, 
            transcript: undefined,
            skippedAt: new Date().toISOString(),
          },
        },
        questionTimer: null, // Reset timer when skipping
      };
    }
    case 'NAVIGATE_TO_NEXT_QUESTION_OR_PART': {
      let newPartIndex = state.currentPartIndex;
      let newQuestionIndex = state.currentQuestionIndex;

      if (state.currentQuestionIndex < state.partQuestions.length - 1) {
        newQuestionIndex++;
      } else if (state.currentPartIndex < 2) { // Max part index 2 (Part 3)
        newPartIndex++;
        newQuestionIndex = 0;
      } else {
        // End of test, handled by FINISH_TEST_ATTEMPT
        return { ...state, isSubmitDialogOpen: true }; // Open dialog directly
      }
      
      const { partQuestions, currentQuestion } = getUpdatedQuestionState(state.questions, newPartIndex, newQuestionIndex);
      let prepTime = false;
      let qTimer: number | null = null;

      // Only start preparation time for Part 2 first question
      if (currentQuestion?.part_number === 2 && newQuestionIndex === 0 && state.testInfo?.part2_preparation_seconds) {
        prepTime = true;
        qTimer = state.testInfo.part2_preparation_seconds;
      }

      // Check if this question was previously skipped or has a recording
      const hasResponse = state.userResponses[currentQuestion?.id || '']?.audioBlob || 
                         state.userResponses[currentQuestion?.id || '']?.audio_url;
      
      const wasSkipped = state.userResponses[currentQuestion?.id || '']?.status === 'skipped';

      // Don't set preparation time if the question was already answered or skipped
      if (hasResponse || wasSkipped) {
        prepTime = false;
        qTimer = null;
      }

      return {
        ...state,
        currentPartIndex: newPartIndex,
        currentQuestionIndex: newQuestionIndex,
        partQuestions,
        currentQuestion,
        isPreparationTime: prepTime,
        questionTimer: qTimer, // Set timer for prep or clear for speaking
      };
    }
    case 'FINISH_TEST_ATTEMPT':
      return { ...state, isSubmitDialogOpen: true };
    case 'TOGGLE_MUTE':
      return { ...state, isMuted: !state.isMuted };
    case 'SUBMIT_ALL_RESPONSES_START':
      return { ...state, isSubmitting: true, error: null };
    case 'SUBMIT_ALL_RESPONSES_SUCCESS':
      debugLog("[Reducer SUBMIT_ALL_RESPONSES_SUCCESS]", 
        "Has feedback:", !!action.payload.overallFeedback, 
        "Responses:", Object.keys(action.payload.allFeedback).length);
      
      // Ensure we have a valid feedback object even if none was provided
      let overallFeedbackResult: FeedbackResult | null = action.payload.overallFeedback || {
        fluency_coherence_score: 5.0,
        lexical_resource_score: 5.0,
        grammar_accuracy_score: 5.0,
        pronunciation_score: 5.0,
        overall_band_score: 5.0,
        general_feedback: "Your recording has been processed with a provisional score.",
        fluency_coherence_feedback: "Thank you for completing the speaking test.",
        lexical_resource_feedback: "Your responses have been saved.",
        grammar_accuracy_feedback: "A provisional score has been applied.",
        pronunciation_feedback: "Try again later for more detailed feedback.",
        model_answer: "Model answers not available at this time."
      };
      
      return { 
        ...state, 
        isSubmitting: false, 
        isTestCompleted: true, 
        allPartsFeedback: overallFeedbackResult, 
        userResponses: action.payload.allFeedback 
      };
    case 'SUBMIT_ALL_RESPONSES_FAILURE':
      return { ...state, isSubmitting: false, error: action.payload };
    case 'OPEN_SUBMIT_DIALOG':
      return { ...state, isSubmitDialogOpen: true };
    case 'CLOSE_SUBMIT_DIALOG':
      return { ...state, isSubmitDialogOpen: false };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false }; // Ensure loading is false on error
    case 'INCREMENT_OVERALL_TIMER':
      return { ...state, overallTestTimer: state.overallTestTimer + 1 };
    case 'STORAGE_ERROR':
      debugLog(`[Reducer STORAGE_ERROR] Storage error for question ${action.payload.questionId}:`, action.payload.error);
      return {
        ...state,
        error: 'There was an issue saving your recording. Your response will be processed using temporary storage instead.',
      };
    case "SET_SUBMITTING":
      return {
        ...state,
        isSubmitting: action.value
      };
    case "UPDATE_USER_RESPONSE":
      return {
        ...state,
        userResponses: {
          ...state.userResponses,
          [action.questionId]: {
            ...state.userResponses[action.questionId],
            ...action.response
          }
        }
      };
    default:
      return state;
  }
}

// --- End of State Management ---

// MainTestUI props and definition (as previously defined, ensure it uses props correctly)
// TestCompletedUI props and definition (as previously defined)
// Ensure they are defined or imported before SpeakingTestPage if not already.
// For brevity, I'm assuming they are correctly defined above this point as in previous steps.
interface MainTestUIProps {
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
}

// Loading screen component displayed while test is loading
interface LoadingScreenProps {
  stage: number;
  message: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ stage, message }) => {
  // Array of IELTS speaking tips to show during loading
  const ieltsLoadingTips = [
    "Speak clearly at a natural pace - not too fast or too slow.",
    "Use a variety of vocabulary to demonstrate your language skills.",
    "Structure your answers with clear introductions and conclusions.",
    "Give specific examples to support your points.",
    "Don't memorize answers - the examiner wants natural, spontaneous speech.",
  ];

  // Get a random tip from the array
  const randomTip = ieltsLoadingTips[Math.floor(Math.random() * ieltsLoadingTips.length)];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-indigo-50 to-white p-4">
      <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">{message}</h2>
          <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden mt-3">
            <div 
              className="bg-indigo-600 h-full transition-all duration-500 ease-out"
              style={{ width: `${(stage + 1) * 33}%` }}
            />
          </div>
        </div>
        
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 mt-4">
          <h3 className="text-amber-800 text-sm font-medium flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            IELTS Speaking Tip
          </h3>
          <p className="text-amber-700 text-sm mt-1">{randomTip}</p>
        </div>
      </div>
    </div>
  );
};

// Error screen component displayed when errors occur
interface ErrorScreenProps {
  error: string;
  onRetry?: () => void;
  onBack?: () => void;
}

const ErrorScreen: React.FC<ErrorScreenProps> = ({ error, onRetry, onBack }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-md">
        <div className="text-center">
          <div className="bg-red-100 p-3 rounded-full inline-flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">Unable to Load Test</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {onRetry && (
              <Button 
                onClick={onRetry}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2v6h-6"></path>
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                  <path d="M3 22v-6h6"></path>
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
                </svg>
                Try Again
              </Button>
            )}
            
            {onBack && (
              <Button 
                onClick={onBack}
                variant="outline"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                Back to Tests
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Test completion UI component
interface TestCompletedUIProps {
  allPartsFeedback: FeedbackResult | null;
  router: any; // Using any for simplicity
  testId: string | undefined;
  userResponses: Record<string, UserResponse>;
}

const TestCompletedUI: React.FC<TestCompletedUIProps> = ({
  allPartsFeedback,
  router,
  testId,
  userResponses
}) => {
  
  // Calculate completion statistics
  const totalQuestions = Object.keys(userResponses).length;
  const completedCount = Object.values(userResponses).filter(r => r.status === 'completed').length;
  const skippedCount = Object.values(userResponses).filter(r => r.status === 'skipped').length;
  
  // Handle return to test list
  const handleBackToTests = useCallback(() => {
    router.push('/tests');
  }, [router]);
  
  // Ensure we have feedback, use default if none
  const feedback = allPartsFeedback || {
    fluency_coherence_score: 5.0,
    lexical_resource_score: 5.0,
    grammar_accuracy_score: 5.0,
    pronunciation_score: 5.0,
    overall_band_score: 5.0,
    general_feedback: "Your test has been submitted.",
    fluency_coherence_feedback: "Thank you for completing the test.",
    lexical_resource_feedback: "Your responses have been recorded.",
    grammar_accuracy_feedback: "Provisional scores have been applied.",
    pronunciation_feedback: "Check back later for detailed feedback.",
    model_answer: "Model answers not available."
  };
  
  // Format the band score to one decimal place
  const formatBandScore = (score: number) => score.toFixed(1);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header with completion status */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-gray-900">Speaking Test Completed</h1>
            <Button variant="outline" onClick={handleBackToTests} className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Back to Tests
            </Button>
          </div>
          
          <div className="flex items-center mb-6">
            <div className="bg-green-100 p-2 rounded-full">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <h2 className="text-lg font-medium text-gray-900">Your test has been submitted successfully</h2>
              <p className="text-gray-600">You completed {completedCount} of {totalQuestions} questions.</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-4">
            <div className="bg-indigo-50 rounded-lg px-4 py-3 flex items-center">
              <div className="text-indigo-700 font-semibold text-2xl mr-2">
                {formatBandScore(feedback.overall_band_score)}
              </div>
              <div className="text-indigo-600 text-sm">
                Overall<br />Band Score
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center">
              <div className="text-gray-700 font-semibold text-2xl mr-2">
                {formatBandScore(feedback.fluency_coherence_score)}
              </div>
              <div className="text-gray-600 text-sm">
                Fluency &<br />Coherence
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center">
              <div className="text-gray-700 font-semibold text-2xl mr-2">
                {formatBandScore(feedback.lexical_resource_score)}
              </div>
              <div className="text-gray-600 text-sm">
                Lexical<br />Resource
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center">
              <div className="text-gray-700 font-semibold text-2xl mr-2">
                {formatBandScore(feedback.grammar_accuracy_score)}
              </div>
              <div className="text-gray-600 text-sm">
                Grammar<br />Accuracy
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center">
              <div className="text-gray-700 font-semibold text-2xl mr-2">
                {formatBandScore(feedback.pronunciation_score)}
              </div>
              <div className="text-gray-600 text-sm">
                Pronunciation
              </div>
            </div>
          </div>
        </div>
        
        {/* Detailed feedback sections */}
        <div className="space-y-6">
          {/* General feedback */}
          <Card className="bg-white border-0 shadow-sm overflow-hidden">
            <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100">
              <h3 className="text-lg font-medium text-indigo-800">Overall Assessment</h3>
            </div>
            <CardContent className="px-6 py-5">
              <p className="text-gray-700 whitespace-pre-line">{feedback.general_feedback}</p>
            </CardContent>
          </Card>
          
          {/* Detailed scoring feedback */}
          <Tabs defaultValue="fluency" className="bg-white rounded-xl shadow-sm">
            <div className="px-6 pt-4 border-b">
              <TabsList className="grid grid-cols-4 gap-4">
                <TabsTrigger value="fluency">Fluency</TabsTrigger>
                <TabsTrigger value="lexical">Vocabulary</TabsTrigger>
                <TabsTrigger value="grammar">Grammar</TabsTrigger>
                <TabsTrigger value="pronunciation">Pronunciation</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="fluency" className="p-6">
              <h4 className="text-sm font-medium text-gray-500 mb-1">Fluency & Coherence</h4>
              <div className="text-3xl font-semibold text-gray-900 mb-4">{formatBandScore(feedback.fluency_coherence_score)}</div>
              <p className="text-gray-700 whitespace-pre-line">{feedback.fluency_coherence_feedback}</p>
            </TabsContent>
            
            <TabsContent value="lexical" className="p-6">
              <h4 className="text-sm font-medium text-gray-500 mb-1">Lexical Resource</h4>
              <div className="text-3xl font-semibold text-gray-900 mb-4">{formatBandScore(feedback.lexical_resource_score)}</div>
              <p className="text-gray-700 whitespace-pre-line">{feedback.lexical_resource_feedback}</p>
            </TabsContent>
            
            <TabsContent value="grammar" className="p-6">
              <h4 className="text-sm font-medium text-gray-500 mb-1">Grammar Range & Accuracy</h4>
              <div className="text-3xl font-semibold text-gray-900 mb-4">{formatBandScore(feedback.grammar_accuracy_score)}</div>
              <p className="text-gray-700 whitespace-pre-line">{feedback.grammar_accuracy_feedback}</p>
            </TabsContent>
            
            <TabsContent value="pronunciation" className="p-6">
              <h4 className="text-sm font-medium text-gray-500 mb-1">Pronunciation</h4>
              <div className="text-3xl font-semibold text-gray-900 mb-4">{formatBandScore(feedback.pronunciation_score)}</div>
              <p className="text-gray-700 whitespace-pre-line">{feedback.pronunciation_feedback}</p>
            </TabsContent>
          </Tabs>
          
          {/* Model answer */}
          <Card className="bg-white border-0 shadow-sm overflow-hidden">
            <div className="bg-green-50 px-6 py-4 border-b border-green-100">
              <h3 className="text-lg font-medium text-green-800">Model Answer Example</h3>
            </div>
            <CardContent className="px-6 py-5">
              <div className="bg-gray-50 p-4 rounded-md border border-gray-100">
                <p className="text-gray-700 whitespace-pre-line">{feedback.model_answer}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

// MainTestUI Component implementation
const MainTestUI: React.FC<MainTestUIProps> = ({
  currentQuestion,
  testInfo,
  questions,
  currentPartIndex,
  currentQuestionIndex,
  overallTimer,
  isMuted,
  timer,
  userResponses,
  isSubmitDialogOpen,
  isSubmitting,
  error,
  dispatch,
  submitAllResponsesAsync,
  onQuestionTimerUpdate
}) => {
  // Calculate showPreparation value for logging
  const isPreparationPhase = currentQuestion.part_number === 2 && 
                           currentQuestionIndex === 0 && 
                           !!testInfo.part2_preparation_seconds && 
                           testInfo.part2_preparation_seconds > 0 &&
                           !userResponses[currentQuestion.id]?.audioBlob &&
                           !userResponses[currentQuestion.id]?.preparationSkipped;
  
  // Remove excessive console log from rendering
  
  const currentPartNum = currentQuestion.part_number;
  const timingInfo = getPartTimingInfo(currentPartNum, testInfo);
  const progress = calculateProgress(currentQuestion.question_number - 1, currentPartIndex, questions);

  const showPreparation = currentQuestion.part_number === 2 && 
                          currentQuestionIndex === 0 && // Use the prop currentQuestionIndex
                          !!testInfo.part2_preparation_seconds && 
                          testInfo.part2_preparation_seconds > 0 &&
                          !userResponses[currentQuestion.id]?.audioBlob &&
                          !userResponses[currentQuestion.id]?.preparationSkipped;

  const speakingDuration = getSpeakingDurationForQuestion(currentQuestion);

  const internalToggleMute = useCallback(() => dispatch({ type: 'TOGGLE_MUTE' }), [dispatch]);
  
  const internalHandlePrepComplete = useCallback(() => {
    console.log("[MainTestUI] Preparation timer completed or skipped, ending preparation");
    dispatch({ 
      type: 'END_PREPARATION', 
      payload: { questionId: currentQuestion.id } 
    });
  }, [dispatch, currentQuestion.id]);
  
  const internalHandleAudioReady = useCallback((questionId: string, audioBlob: Blob, url: string) => {
    console.log(`[MainTestUI internalHandleAudioReady] Dispatching AUDIO_RECORDED for qID: ${questionId}, blob size: ${audioBlob.size}`);
    
    // Create a clone of the blob to prevent reference issues
    const blobCopy = new Blob([audioBlob], { type: audioBlob.type });
    
    dispatch({ 
      type: 'AUDIO_RECORDED', 
      payload: { 
        questionId, 
        audioBlob: blobCopy, 
        url 
      } 
    });
  }, [dispatch]);
  
  const internalNavigateToNextQuestion = useCallback(() => dispatch({ type: 'NAVIGATE_TO_NEXT_QUESTION_OR_PART' }), [dispatch]);
  
  const internalSetError = useCallback((errorMsg: string | null) => dispatch({ type: 'SET_ERROR', payload: errorMsg }), [dispatch]);
  
  const internalSetIsSubmitDialogOpen = useCallback((isOpen: boolean) => {
    dispatch({ type: isOpen ? 'OPEN_SUBMIT_DIALOG' : 'CLOSE_SUBMIT_DIALOG' });
  }, [dispatch]);

  // Handler for skipping a question
  const handleSkipQuestion = useCallback(() => {
    dispatch({ 
      type: 'QUESTION_SKIPPED', 
      payload: { questionId: currentQuestion.id } 
    });
    // Navigate to next question after skipping
    setTimeout(() => dispatch({ type: 'NAVIGATE_TO_NEXT_QUESTION_OR_PART' }), 300);
  }, [dispatch, currentQuestion.id]);

  // Get the status for visualization
  const getRecordingStatus = useCallback(() => {
    if (showPreparation) return 'preparation';
    if (timer !== null && timer > 0) return 'speaking';
    
    const response = userResponses[currentQuestion.id];
    if (response?.audioBlob || response?.audioFile) return 'recorded';
    
    // Check if we're waiting for user to start recording
    if (timer === null && !response?.audioBlob && !response?.audioFile) return 'pre_question';
    
    return 'idle';
  }, [showPreparation, timer, userResponses, currentQuestion]);
  
  const recordingStatus = getRecordingStatus();
  
  // Calculate progress for visualization
  const totalQuestions = questions.length;
  const answeredQuestions = Object.values(userResponses).filter(r => 
    r.audioBlob || r.audioFile || r.audio_url || r.status === 'skipped'
  ).length;
  
  const progressPercentage = Math.round((answeredQuestions / totalQuestions) * 100);

  // Determine if we're on the last question to show final submit button
  const isLastQuestion = currentPartIndex === 2 && 
                        currentQuestionIndex === questions.filter(q => q.part_number === 3).length - 1 &&
                        recordingStatus === 'recorded';

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header bar with test info and controls */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 py-3 mx-auto max-w-7xl sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">IELTS Speaking Test</h1>
              <div className="hidden px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-full sm:block">
                {PART_NAMES[currentPartIndex]}
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="hidden px-3 py-1.5 bg-gray-100 rounded-lg text-gray-700 text-sm sm:flex items-center">
                <span className="font-medium mr-1.5">Total time:</span> {formatOverallTime(overallTimer)}
              </div>
              
              <button
                onClick={internalToggleMute}
                className={`p-2 rounded-full ${isMuted ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'} hover:bg-gray-200`}
                aria-label={isMuted ? "Unmute" : "Mute"}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100">
        <div 
          className="h-full bg-indigo-600 transition-all duration-300 ease-in-out"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>
      
      {/* Timer status bar */}
      <div className={`py-2 px-4 sm:px-6 ${
        showPreparation ? 'bg-amber-50 border-b border-amber-100' : 
        recordingStatus === 'speaking' ? 'bg-red-50 border-b border-red-100' :
        recordingStatus === 'recorded' ? 'bg-green-50 border-b border-green-100' :
        recordingStatus === 'pre_question' ? 'bg-blue-50 border-b border-blue-100' :
        'bg-gray-50 border-b border-gray-200'
      }`}>
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              {showPreparation ? (
                <span className="text-amber-600 font-medium flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  Preparation Time
                </span>
              ) : recordingStatus === 'speaking' ? (
                <span className="text-red-600 font-medium flex items-center">
                  <span className="flex h-3 w-3 relative mr-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                  Recording in Progress
                </span>
              ) : recordingStatus === 'recorded' ? (
                <span className="text-green-600 font-medium flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                  Answer Recorded
                </span>
              ) : recordingStatus === 'pre_question' ? (
                <span className="text-blue-600 font-medium flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  Question Ready
                </span>
              ) : (
                <span className="text-gray-600 font-medium flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <circle cx="12" cy="12" r="6"></circle>
                    <circle cx="12" cy="12" r="2"></circle>
                  </svg>
                  Ready to Record
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {timer !== null && (
                <div className={`text-sm font-medium flex items-center ${
                  showPreparation ? 'text-amber-600' : 
                  timer <= 10 ? 'text-red-600' : 'text-gray-600'
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  {formatTime(timer)}
                </div>
              )}
              
              <div className="text-xs text-gray-500 hidden sm:block">
                Question {progress.currentQuestion} of {progress.totalQuestions}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-4 py-6 md:py-8 max-w-4xl mx-auto w-full">
        {/* Question card */}
        <div className="w-full mb-8">
          {/* Part indicator for mobile */}
          <div className="sm:hidden mb-2">
            <span className="inline-block px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-full">
              {PART_NAMES[currentPartIndex]}
            </span>
          </div>
          
          <Card className={`overflow-hidden border-0 shadow-md bg-white transition-all duration-300 ${recordingStatus === 'speaking' ? 'border-l-4 border-l-red-500' : ''}`}>
            {currentPartNum === 2 && (
              <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-100">
                <span className="text-xs uppercase font-semibold tracking-wider text-indigo-600">Cue Card</span>
              </div>
            )}
            <CardContent className="pt-6 pb-6">
              <h1 className={`text-xl md:text-2xl font-medium leading-relaxed ${recordingStatus === 'speaking' ? 'text-gray-900' : 'text-gray-800'}`}>
                {currentQuestion.question_text}
              </h1>
              
              {/* Part-specific instructions */}
              <div className="mt-4 text-sm text-gray-500 bg-gray-50 p-3 rounded-md">
                {currentPartNum === 1 ? (
                  <p>Speak naturally as if having a conversation. Try to give detailed responses rather than just yes/no answers.</p>
                ) : currentPartNum === 2 ? (
                  <p>Speak for 1-2 minutes about this topic. Try to cover all the points mentioned and give specific examples from your experience.</p>
                ) : (
                  <p>This section will involve a discussion building on the topic from Part 2. Express your opinions clearly with reasons and examples.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Timer visualizer - only show during speaking or preparation */}
        {(timer !== null) && (recordingStatus === 'speaking' || showPreparation) && (
          <div className="w-full mb-6 transition-all duration-300 ease-in-out">
            <CountdownDisplay 
              timeRemaining={timer} 
              timeTotal={showPreparation ? (testInfo.part2_preparation_seconds || 60) : speakingDuration}
              mode={showPreparation ? 'preparation' : 'speaking'}
              onSkip={showPreparation ? internalHandlePrepComplete : undefined}
            />
          </div>
        )}
        
        {/* Preparation UI */}
        {showPreparation && testInfo.part2_preparation_seconds && (
          <div className="w-full mb-6 transition-all duration-300 ease-in-out">
            <PreparationTimer 
              initialSeconds={testInfo.part2_preparation_seconds}
              onComplete={internalHandlePrepComplete}
            />
          </div>
        )}
        
        {/* Recording UI */}
        {!showPreparation && currentQuestion && (
          <div className="w-full transition-all duration-300 ease-in-out">
            {recordingStatus === 'pre_question' ? (
              <div className="flex flex-col items-center space-y-6 p-8 bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="text-center max-w-md">
                  <h3 className="text-xl font-medium text-gray-800 mb-3 sr-only">Question Options</h3>
                  <p className="text-gray-600 mb-8">
                    What would you like to do with this question?
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-md mx-auto">
                    <Button
                      className="bg-indigo-600 hover:bg-indigo-700 text-white py-8 rounded-xl flex flex-col items-center gap-3 h-auto transition-transform duration-200 hover:scale-105"
                      onClick={() => dispatch({ type: 'START_SPEAKING' })}
                    >
                      <div className="bg-indigo-500 p-4 rounded-full mb-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                          <line x1="12" y1="19" x2="12" y2="23"></line>
                          <line x1="8" y1="23" x2="16" y2="23"></line>
                        </svg>
                      </div>
                      <span className="text-lg font-medium">Record Answer</span>
                      <span className="text-sm opacity-80">
                        {formatTime(speakingDuration)} recording time
                      </span>
                    </Button>
                    
                    <Button
                      variant="outline"
                      className="border-gray-300 hover:bg-gray-50 text-gray-700 py-8 rounded-xl flex flex-col items-center gap-3 h-auto transition-transform duration-200 hover:scale-105"
                      onClick={handleSkipQuestion}
                    >
                      <div className="bg-gray-100 p-4 rounded-full mb-1">
                        <SkipForward className="h-8 w-8 text-gray-600" />
                      </div>
                      <span className="text-lg font-medium">Skip Question</span>
                      <span className="text-sm opacity-80">
                        Continue to next
                      </span>
                    </Button>
                  </div>
                </div>
              </div>
            ) : recordingStatus === 'speaking' ? (
              <div className="bg-gradient-to-b from-white to-indigo-50 rounded-xl pt-4 pb-8 px-6 shadow-sm border border-indigo-100 transition-all duration-300">
                <AudioRecorder
                  questionId={currentQuestion.id}
                  partType={currentQuestion.part_number === 2 ? 'cue_card' : 'standard'}
                  questionDuration={speakingDuration}
                  isMuted={isMuted}
                  onAudioReady={internalHandleAudioReady}
                  onNavigateNext={internalNavigateToNextQuestion}
                  onSkipQuestion={(qId) => dispatch({ type: 'QUESTION_SKIPPED', payload: { questionId: qId } })}
                  onMainTimerUpdate={onQuestionTimerUpdate}
                  onError={internalSetError}
                />
              </div>
            ) : recordingStatus === 'recorded' ? (
              <div className="flex flex-col items-center space-y-6 p-8 bg-gradient-to-b from-white to-green-50 rounded-xl shadow-sm border border-green-100">
                <div className="text-center max-w-md">
                  <div className="bg-green-100 p-5 rounded-full inline-block mb-5">
                    <CheckCircle2 className="h-12 w-12 text-green-600" />
                  </div>
                  <h3 className="text-2xl font-medium text-gray-900 mb-3">Answer Recorded</h3>
                  <p className="text-gray-600 mb-8">
                    Your answer has been successfully recorded.
                  </p>
                  
                  {isLastQuestion ? (
                    <Button
                      className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 text-lg rounded-lg transition-all duration-200 hover:scale-105"
                      onClick={() => internalSetIsSubmitDialogOpen(true)}
                    >
                      <CheckCircle2 className="h-5 w-5 mr-2" />
                      Finish and Submit Test
                    </Button>
                  ) : (
                    <Button
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 text-lg rounded-lg transition-all duration-200 hover:scale-105"
                      onClick={internalNavigateToNextQuestion}
                    >
                      <ChevronRight className="h-5 w-5 mr-2" />
                      Continue to Next Question
                    </Button>
                  )}
                  
                  {/* Only show skip option if we're not on the last question */}
                  {!isLastQuestion && (
                    <div className="mt-4">
                      <button
                        onClick={handleSkipQuestion}
                        className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1.5 mx-auto transition-colors"
                      >
                        <SkipForward className="h-3.5 w-3.5" />
                        Skip this question instead
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-12 px-8 bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="text-center">
                  <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
                  <h3 className="text-xl font-medium text-gray-800 mb-2">Processing Your Answer</h3>
                  <p className="text-gray-500">Please wait while we save your recording...</p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Submit test dialog */}
      <Dialog open={isSubmitDialogOpen} onOpenChange={(open) => internalSetIsSubmitDialogOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Your Test</DialogTitle>
            <DialogDescription>
              Are you ready to submit your speaking test for scoring? You will not be able to change your answers after submission.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <div className="text-sm text-gray-500 mb-4">
              You have answered {Object.values(userResponses).filter(r => r.audioBlob || r.audioFile || r.audio_url).length} and skipped {Object.values(userResponses).filter(r => r.status === 'skipped').length} out of {questions.length} questions.
            </div>
            
            <div className="flex space-x-4 w-full">
              <Progress className="h-2 flex-1" value={progressPercentage} />
              <span className="text-xs font-medium text-gray-600">{progressPercentage}%</span>
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => internalSetIsSubmitDialogOpen(false)}
              disabled={isSubmitting}
            >
              Continue Test
            </Button>
            <Button 
              type="button" 
              onClick={submitAllResponsesAsync}
              disabled={isSubmitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Submit Test
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error message */}
      {error && (
        <Alert variant="destructive" className="fixed bottom-4 right-4 w-auto max-w-md animate-in fade-in slide-in-from-bottom-5">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <button 
            onClick={() => dispatch({ type: 'SET_ERROR', payload: null })} 
            className="absolute top-2 right-2 p-1 rounded-full hover:bg-red-100"
          >
            <X className="h-4 w-4" />
          </button>
        </Alert>
      )}
    </div>
  );
};

export default function SpeakingTestPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useUser();
  const supabase = useMemo(() => createClientComponentClient(), []);

  // Get user from supabase for initial dispatch
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // Track if auth is loading
  const [authLoading, setAuthLoading] = useState(true);
  
  // Convert Clerk user to Supabase user ID when needed
  const getSupabaseUserId = useCallback(async () => {
    if (!user) return null;
    return await syncUserToSupabase(supabase, user);
  }, [user, supabase]);

  useEffect(() => {
    let isActive = true;
    setAuthLoading(true);
    
    // First, try to get user from existing session
    const initializeAuth = async () => {
      try {
        // Get the initial session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (isActive && session?.user) {
          console.log("[Auth] Initial session found, user:", session.user.id);
          setCurrentUser(session.user);
        } else {
          console.log("[Auth] No initial session found");
          
          // If no session but we have Clerk user, try to sync and create a session
          if (user && isActive) {
            try {
              console.log("[Auth] Attempting to sync Clerk user to Supabase");
              const supabaseUserId = await syncUserToSupabase(supabase, user);
              
              if (supabaseUserId) {
                console.log("[Auth] Synced user ID:", supabaseUserId);
                
                // Try to create a temporary session
                const sessionCreated = await createTemporarySession(supabase, supabaseUserId);
                if (sessionCreated) {
                  console.log("[Auth] Temporary session created");
                  // Refresh current user
                  const { data: { user: newUser } } = await supabase.auth.getUser();
                  if (newUser && isActive) {
                    setCurrentUser(newUser);
                  }
                }
              }
            } catch (syncError) {
              console.error("[Auth] Error syncing user:", syncError);
            }
          }
          
          // Still no user
          if (isActive && !currentUser) {
            setCurrentUser(null);
          }
        }
        
        // Set up auth state change listener
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
          console.log("[Auth] Auth state changed:", event, session ? `User: ${session.user.id}` : "No session");
          if (isActive) {
            setCurrentUser(session?.user ?? null);
          }
        });
        
        setAuthLoading(false);
        
        return () => {
          authListener?.subscription.unsubscribe();
        };
      } catch (error) {
        console.error("[Auth] Error initializing auth:", error);
        if (isActive) {
          setCurrentUser(null);
          setAuthLoading(false);
        }
      }
    };
    
    initializeAuth();
    
    return () => {
      isActive = false;
    };
  }, [supabase.auth, user, currentUser]);

  const pathTestId = useMemo(() => {
    let potentialId = params.testId as string | string[] | undefined;
    if (Array.isArray(potentialId)) potentialId = potentialId[0];
    return (typeof potentialId === 'string' && potentialId.toLowerCase() !== 'undefined') ? potentialId : undefined;
  }, [params.testId]);

  const [state, dispatch] = useReducer(speakingTestReducer, initialState);

  // Initialize test on mount and when testId or user changes
  useEffect(() => {
    if (pathTestId && currentUser !== undefined) { // Ensure currentUser is resolved (null or User)
        debugLog("[Effect INIT_TEST] Dispatching INIT_TEST with testId:", pathTestId, "User:", currentUser?.id);
        dispatch({ type: 'INIT_TEST', payload: { testId: pathTestId, user: currentUser } });
    }
  }, [pathTestId, currentUser]); // currentUser can be User | null

  // Effect for fetching test data when state.testId is set and loading is true (after INIT_TEST)
  useEffect(() => {
    if (state.loading && state.testId) {
        // Even if no currentUser is available yet, we'll start loading test metadata
        debugLog("[Effect LOAD_DATA] Loading test data for testId:", state.testId);
        
        const performLoad = async () => {
            try {
                // Run browser compatibility check in parallel with data loading
                const browserCompatibilityPromise = checkMicrophonePermission();
                
                // Start fetching test data immediately in parallel - don't require user yet
                const testInfoPromise = supabase
                    .from('cambridge_tests')
                    .select('id, title, description, part1_duration_seconds, part2_duration_seconds, part2_preparation_seconds, part3_duration_seconds')
                    .eq('id', state.testId!)
                    .single();
                    
                const questionsPromise = supabase
                    .from('test_questions')
                    .select('id, part_number, sequence_number, question_text, question_type, topic')
                    .eq('cambridge_test_id', state.testId!)
                    .order('sequence_number', { ascending: true });
                
                // Wait for browser compatibility check
                const browserCompatible = await browserCompatibilityPromise;
                if (typeof MediaRecorder === 'undefined' || !browserCompatible) {
                    dispatch({ type: 'BROWSER_COMPATIBILITY_ERROR', payload: 'Microphone access denied or browser not supported.' });
                    return;
                }
                
                // Wait for test data and questions in parallel
                const [testDataResult, questionsDataResult] = await Promise.all([
                    testInfoPromise,
                    questionsPromise
                ]);
                
                // Check for errors in test data
                if (testDataResult.error) throw new Error(`Error fetching test details: ${testDataResult.error.message}`);
                if (!testDataResult.data) throw new Error('Test not found.');
                
                // Check for errors in questions data
                if (questionsDataResult.error) throw new Error(`Error fetching questions: ${questionsDataResult.error.message}`);
                if (!questionsDataResult.data || questionsDataResult.data.length === 0) throw new Error('No questions found for this test.');
                
                const testData = testDataResult.data;
                const questionsDataRaw = questionsDataResult.data;

                // Process questions data
                const processedQuestions: TestQuestion[] = questionsDataRaw.map(q => ({
                    ...q,
                    question_number: q.sequence_number,
                    preparation_time_seconds: q.part_number === 2 ? (testData.part2_preparation_seconds || 60) : 0,
                    speaking_time_seconds: getSpeakingDurationForQuestion({ ...q, question_number: q.sequence_number, speaking_time_seconds:0 } as TestQuestion) 
                }));
                
                // Load previous responses only if we have a user
                let responsesMap: Record<string, UserResponse> = {};
                
                if (currentUser) {
                    // Start loading previous responses
                    const { data: responsesData, error: responsesError } = await supabase
                        .from('user_responses')
                        .select('id, test_question_id, audio_url, transcript, status')
                        .eq('user_id', currentUser.id) 
                        .in('test_question_id', processedQuestions.map((q) => q.id));
                    
                    if (!responsesError && responsesData) {
                        // Process responses if available
                        responsesData.forEach((response: any) => {
                            if (response.test_question_id) {
                                responsesMap[response.test_question_id] = {
                                    id: response.id,
                                    test_question_id: response.test_question_id,
                                    status: response.status || 'in_progress',
                                    audio_url: response.audio_url,
                                    transcript: response.transcript,
                                };
                            }
                        });
                    }
                }
                
                // Determine starting point based on previous responses
                let determinedPartIndex = 0;
                let determinedQuestionIndex = 0;
                
                // Only use previous responses to determine position if we have a user and responses
                if (currentUser && Object.keys(responsesMap).length > 0) {
                    // Basic progress determination (can be enhanced)
                    for (let i = processedQuestions.length - 1; i >= 0; i--) {
                        const q = processedQuestions[i];
                        if (responsesMap[q.id]?.status === 'completed') {
                            // Find next question or part
                            const currentPartQuestions = processedQuestions.filter(pq => pq.part_number === q.part_number);
                            const qInPartIndex = currentPartQuestions.findIndex(cpq => cpq.id === q.id);
                            if (qInPartIndex < currentPartQuestions.length - 1) {
                                determinedPartIndex = q.part_number - 1;
                                determinedQuestionIndex = qInPartIndex + 1;
                            } else if (q.part_number < 3) {
                                determinedPartIndex = q.part_number; // Next part (0-indexed)
                                determinedQuestionIndex = 0;
                            } else {
                                // Last question of last part completed - effectively test is done, should show results or summary
                                determinedPartIndex = q.part_number - 1;
                                determinedQuestionIndex = qInPartIndex; // Stay on last question
                            }
                            break;
                        } else if (responsesMap[q.id]) {
                            determinedPartIndex = q.part_number - 1;
                            determinedQuestionIndex = processedQuestions.filter(pq => pq.part_number === q.part_number).findIndex(cpq => cpq.id === q.id);
                            break;
                        }
                    }
                }
                
                // Always update the test data, regardless of user state
                dispatch({ 
                    type: 'LOAD_TEST_DATA_SUCCESS', 
                    payload: { 
                        testInfo: testData as TestInfo, 
                        questions: processedQuestions, 
                        initialResponses: responsesMap,
                        determinedPartIndex,
                        determinedQuestionIndex
                    }
                });
                
            } catch (err: any) {
                console.error("[Effect LOAD_DATA] Error:", err);
                dispatch({ type: 'LOAD_TEST_DATA_FAILURE', payload: err.message || 'An unexpected error occurred loading test data.' });
            }
        };
        performLoad();
    }
  }, [state.loading, state.testId, currentUser, supabase, dispatch]);

  // Overall test timer effect
  useEffect(() => {
    if (!state.loading && !state.error && !state.isTestCompleted) {
      const timerId = setInterval(() => {
        dispatch({ type: 'INCREMENT_OVERALL_TIMER' });
      }, 1000);
      return () => clearInterval(timerId);
    }
  }, [state.loading, state.error, state.isTestCompleted]);

  // Effect for Question Timer (countdown)
  useEffect(() => {
    let timerId: NodeJS.Timeout | undefined = undefined;
    if (state.questionTimer !== null && state.questionTimer > 0 && (state.isPreparationTime || state.currentQuestion)) {
      timerId = setInterval(() => {
        // Ensure we only dispatch if timer is still active and positive
        if (state.questionTimer !== null && state.questionTimer > 0) {
          dispatch({ type: 'SET_QUESTION_TIMER', payload: state.questionTimer - 1 });
        }
      }, 1000);
    } else if (state.questionTimer === 0) {
      if (state.isPreparationTime) {
        console.log("[Effect QuestionTimer] Preparation time ended for question:", state.currentQuestion?.id);
        dispatch({ type: 'END_PREPARATION' });
      } 
      // Removed: else if (state.currentQuestion) {
      //   console.log("[Effect QuestionTimer] Speaking time ended for question:", state.currentQuestion.id, "Navigating next.");
      //   dispatch({ type: 'NAVIGATE_TO_NEXT_QUESTION_OR_PART' });
      // }
      // Navigation is now handled by AudioRecorder via onNavigateNext prop when its internal timer completes.
    }
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [state.questionTimer, state.isPreparationTime, state.currentQuestion, dispatch]);

  // This effect handles setting the initial timer when a new question becomes active or prep starts
  useEffect(() => {
    if (state.currentQuestion) {
        if (state.isPreparationTime && state.testInfo?.part2_preparation_seconds) {
            // Already handled by NAVIGATE_TO_NEXT_QUESTION_OR_PART or START_PREPARATION
        } else if (!state.isPreparationTime) {
            // const duration = getSpeakingDurationForQuestion(state.currentQuestion);
            // dispatch({ type: 'SET_QUESTION_TIMER', payload: duration });
            // This is tricky: AudioRecorder receives duration and its internal useRecorder manages the countdown.
            // The `state.questionTimer` should reflect what `useRecorder` is counting down.
            // This requires `useRecorder` to call an `onTimerChange` prop that dispatches `SET_QUESTION_TIMER`.
        }
    }
  }, [state.currentQuestion, state.isPreparationTime, state.testInfo]);

  // Callbacks to pass to child components (or use directly in JSX with dispatch)
  const handleAudioReadyForDispatch = useCallback((questionId: string, audioBlob: Blob, url: string) => {
    dispatch({ type: 'AUDIO_RECORDED', payload: { questionId, audioBlob, url } });
  }, []);

  const navigateToNextQuestionOrPartForDispatch = useCallback(() => dispatch({ type: 'RESET_QUESTION_STATE' }), [dispatch]);

  const handlePrepCompleteForDispatch = useCallback(() => {
    debugLog("[SpeakingTestPage] handlePrepCompleteForDispatch called");
    dispatch({ type: 'END_PREPARATION' });
    // Force re-render to ensure the UI updates correctly
    setTimeout(() => {
      dispatch({ type: 'RESET_QUESTION_STATE' });
    }, 50);
  }, []);

  const toggleMuteForDispatch = useCallback(() => {
    dispatch({ type: 'TOGGLE_MUTE' });
  }, []);

  const setErrorForDispatch = useCallback((errorMsg: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: errorMsg });
  }, []);

  const setIsSubmitDialogOpenForDispatch = useCallback((isOpen: boolean) => {
    dispatch({ type: isOpen ? 'OPEN_SUBMIT_DIALOG' : 'CLOSE_SUBMIT_DIALOG' });
  }, []);
  
  const handleQuestionTimerUpdateForDispatch = useCallback((seconds: number) => {
    dispatch({ type: 'SET_QUESTION_TIMER', payload: seconds });
  }, [dispatch]);

  // Add a validation function before the submit function
  const validateResponses = useCallback(() => {
    // Count recordings with valid audio data
    const validRecordingsCount = Object.values(state.userResponses).filter(r => 
      (r.audioBlob && r.audioBlob.size > 0) || 
      (r.audioFile && r.audioFile.size > 0) || 
      (r.audio_url && r.audio_url.length > 0)
    ).length;
    
    console.log(`[validateResponses] Found ${validRecordingsCount} valid recordings out of ${Object.keys(state.userResponses).length} responses`);
    
    if (validRecordingsCount === 0) {
      // If no valid recordings, show an error with more helpful guidance
      dispatch({ 
        type: 'SET_ERROR', 
        payload: 'No recordings found. Please record at least one answer by clicking the microphone button and speaking. Then try submitting again.' 
      });
      dispatch({ type: 'CLOSE_SUBMIT_DIALOG' });
      return false;
    }
    
    return true;
  }, [state.userResponses, dispatch]);

  // Update the submitAllResponsesAsync function
  const submitAllResponsesAsync = useCallback(async () => {
    // First validate that we have recordings to submit
    if (!validateResponses()) {
      return;
    }

    // First log what's being submitted
    debugLog("[submitAllResponsesAsync] Starting submission process");
    debugLog("[submitAllResponsesAsync] Current state:", {
      questionsTotal: state.questions.length,
      responsesTotal: Object.keys(state.userResponses).length,
      responsesWithAudio: Object.values(state.userResponses).filter(r => r.audioBlob).length
    });

    // Get authenticated user ID from Clerk
    const authenticatedUserId = user?.id || null;
    debugLog("[submitAllResponsesAsync] User ID from Clerk:", authenticatedUserId?.substring(0, 8) + "...");
    
    // Convert Clerk ID to Supabase format if available
    const authenticatedSupabaseId = authenticatedUserId ? 
      clerkToSupabaseId(authenticatedUserId) : null;
      
    debugLog("[submitAllResponsesAsync] Using Supabase ID:", 
      authenticatedSupabaseId ? 
      `ID: ${authenticatedSupabaseId.substring(0, 8)}...` : 
      "No Supabase ID available");
    
    // If we have a Supabase ID but no active session, try to create a temporary one
    if (authenticatedSupabaseId) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        debugLog("[submitAllResponsesAsync] No active session found, trying to create temporary session");
        await createTemporarySession(supabase, authenticatedSupabaseId);
      }
    }

    // Set submission in progress
    dispatch({ type: "SET_SUBMITTING", value: true });
    
    try {
      // Process each response with audio
      const responsesToProcess = Object.entries(state.userResponses)
        .filter(([_, response]) => response.audioBlob);
      
      debugLog(`[submitAllResponsesAsync] Processing ${responsesToProcess.length} responses`);
      
      // Process them in sequence to avoid overwhelming the API
      for (const [questionId, response] of responsesToProcess) {
        if (!response.audioBlob) continue; // Skip if no audio
        
        const audioFile = new File(
          [response.audioBlob], 
          `recording-${questionId}.wav`, 
          { type: 'audio/wav' }
        );
        
        // Try to upload to storage
        let audioUrl = null;
        if (authenticatedSupabaseId) {
          debugLog(`[submitAllResponsesAsync] Uploading audio for question ${questionId}`);
          audioUrl = await storageService.uploadAudio(
            audioFile, 
            authenticatedSupabaseId,
            questionId
          );
        }

        // Check if we have a URL for cloud storage or if it's a data URL
        const isDataUrl = audioUrl && audioUrl.startsWith('data:audio');
        debugLog(`[submitAllResponsesAsync] Audio URL type: ${isDataUrl ? 'Data URL' : 'Storage URL'}`);

        // If in-memory submission (data URL), transcode the file
        if (isDataUrl) {
          debugLog("[submitAllResponsesAsync] Using data URL for transcription");
        } else if (!audioUrl) {
          debugLog("[submitAllResponsesAsync] No audio URL available, skipping this response");
          continue;
        }

        // Process transcription and scoring
        try {
          // Get transcription
          debugLog(`[submitAllResponsesAsync] Requesting transcription for question ${questionId}`);
          const transcriptionResponse = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              audioUrl, 
              isDataUrl,
              userId: authenticatedSupabaseId,
              questionId
            })
          });

          if (!transcriptionResponse.ok) {
            const errorData = await transcriptionResponse.text();
            throw new Error(`Transcription API error: ${transcriptionResponse.status} - ${errorData}`);
          }

          const transcriptionData = await transcriptionResponse.json();
          debugLog(`[submitAllResponsesAsync] Transcription successful: ${transcriptionData.text.substring(0, 20)}...`);
          
          // Update response with transcription
          dispatch({
            type: "UPDATE_USER_RESPONSE",
            questionId,
            response: {
              ...response,
              transcript: transcriptionData.text,
              status: 'completed'
            }
          });
          
          // Now get AI scoring if we have a transcript
          if (transcriptionData.text) {
            debugLog(`[submitAllResponsesAsync] Requesting AI scoring for question ${questionId}`);
            
            // Find the question details
            const question = state.questions.find(q => q.id === questionId);
            if (!question) {
              debugLog(`[submitAllResponsesAsync] Could not find question details for ${questionId}`);
              continue;
            }
            
            const questionText = question.question_text;
            const questionType = question.question_type === 'cue_card' ? 'part2' : 
                                (question.part_number === 3 ? 'part3' : 'part1');
            
            const scoringResponse = await fetch('/api/score', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: authenticatedSupabaseId,
                questionId,
                questionText,
                questionType,
                transcript: transcriptionData.text,
                audioUrl
              })
            });

            if (!scoringResponse.ok) {
              const errorData = await scoringResponse.text();
              throw new Error(`Scoring API error: ${scoringResponse.status} - ${errorData}`);
            }

            const scoringData = await scoringResponse.json();
            debugLog(`[submitAllResponsesAsync] Scoring successful`);
            
            // Update the response with AI feedback
            dispatch({
              type: "UPDATE_USER_RESPONSE",
              questionId,
              response: {
                ...response,
                transcript: transcriptionData.text,
                feedback: scoringData.feedback,
                status: 'completed'
              }
            });
          }
        } catch (err) {
          console.error(`Error processing response for question ${questionId}:`, err);
          // Continue with other responses despite error
        }
      }
      
      debugLog("[submitAllResponsesAsync] All responses processed");
    } catch (err) {
      console.error("Error in submission process:", err);
    } finally {
      // Set submission complete
      dispatch({ type: "SET_SUBMITTING", value: false });
    }
  }, [state, dispatch, user, validateResponses, storageService, supabase]);

  // Render logic using state from reducer
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-indigo-50 to-white">
        <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-md text-center">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Verifying your account</h2>
          <p className="text-gray-600">Please wait while we check your login status...</p>
        </div>
      </div>
    );
  }

  if (state.loading && state.testInfo === null) {
    // Determine loading stage
    let loadingStage = 0;
    let loadingMessage = "Setting up your test...";
    
    if (state.questions && state.questions.length > 0) {
      loadingStage = 2; // Questions loaded
      loadingMessage = "Preparing test environment...";
    } else if (authLoading) {
      loadingStage = 0;
      loadingMessage = "Verifying authentication...";
    } else if (currentUser) {
      loadingStage = 1; // Auth complete
      loadingMessage = "Loading questions...";
    }
    
    return (
      <ProtectedRoute>
        <LoadingScreen stage={loadingStage} message={loadingMessage} />
      </ProtectedRoute>
    );
  }

  if (state.error) {
    return (
      <ProtectedRoute>
        <ErrorScreen 
          error={state.error}
          onRetry={() => {
            dispatch({ type: 'SET_ERROR', payload: null });
            dispatch({ type: 'INIT_TEST', payload: { testId: pathTestId, user: currentUser } });
          }}
          onBack={() => { 
            router.push('/tests'); 
            dispatch({type: 'SET_ERROR', payload: null}); 
          }}
        />
      </ProtectedRoute>
    );
  }

  if (!state.testId || !state.testInfo) { 
    return (
      <ProtectedRoute>
        <ErrorScreen 
          error="The test could not be loaded or does not exist."
          onBack={() => router.push('/tests')}
        />
      </ProtectedRoute>
    );
  }

  if (state.isTestCompleted) {
    return (
      <ProtectedRoute>
        <TestCompletedUI 
          allPartsFeedback={state.allPartsFeedback}
          router={router}
          testId={state.testId}
          userResponses={state.userResponses}
        />
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      {state.currentQuestion && state.testInfo ? (
        <MainTestUI 
          currentQuestion={state.currentQuestion}
          testInfo={state.testInfo}
          questions={state.questions}
          currentPartIndex={state.currentPartIndex}
          currentQuestionIndex={state.currentQuestionIndex}
          overallTimer={state.overallTestTimer}
          isMuted={state.isMuted}
          timer={state.questionTimer}
          userResponses={state.userResponses}
          isSubmitDialogOpen={state.isSubmitDialogOpen}
          isSubmitting={state.isSubmitting}
          error={state.error}
          dispatch={dispatch}
          submitAllResponsesAsync={submitAllResponsesAsync}
          onQuestionTimerUpdate={handleQuestionTimerUpdateForDispatch}
        />
      ) : (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
          <div className="bg-white rounded-xl shadow-md p-8 max-w-md w-full text-center">
            <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Loading Test Questions</h2>
            <p className="text-gray-600">Just a moment while we prepare everything...</p>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
} 