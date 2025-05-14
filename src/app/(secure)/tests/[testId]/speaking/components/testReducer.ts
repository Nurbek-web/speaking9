'use client'

import { SpeakingTestState, SpeakingTestAction, TestQuestion } from './types';

// Debug flag to control logging - set to false to disable most logs
const DEBUG = true;

// Helper function for logging only in debug mode
export const debugLog = (...args: any[]) => {
  if (DEBUG) {
    console.log(...args);
  }
};

// Initial state for the reducer
export const initialState: SpeakingTestState = {
  loading: false,
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
  initialUser: null,
  authenticatedSupabaseId: undefined,
};

// Utility to filter and set current question based on part/question indices
export const getUpdatedQuestionState = (questions: TestQuestion[], partIndex: number, questionIndex: number) => {
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

// Main reducer function
export function speakingTestReducer(state: SpeakingTestState, action: SpeakingTestAction): SpeakingTestState {
  // Log all actions for debugging
  if (action.type === 'END_PREPARATION') {
    console.log(`[Reducer] Action: ${action.type}`, 
      action.payload ? `Payload: ${JSON.stringify(action.payload)}` : '(No payload)');
  }

  // Only log non-timer-related actions to reduce noise
  if (DEBUG && action.type !== 'INCREMENT_OVERALL_TIMER' && action.type !== 'SET_QUESTION_TIMER') {
    if ('payload' in action) {
      debugLog('[Reducer Action]', action.type, 'Payload:', action.payload);
    } else {
      debugLog('[Reducer Action]', action.type, '(No payload)');
    }
  }

  switch (action.type) {
    case 'INIT_TEST':
      debugLog('[Reducer INIT_TEST] Payload:', action.payload);
      // This action should reset the state for a new test load, 
      // preserving only essential cross-test state like authenticatedSupabaseId.
      debugLog('[Reducer INIT_TEST] Initializing/Re-initializing test loading.');
      return { 
        ...initialState, // Start with a clean slate from initialState
        testId: action.payload.testId,
        initialUser: action.payload.user, // Store the user object passed at initialization
        loading: true, 
        error: null,
        // Preserve overallTestTimer if it's the same test, otherwise reset (already handled by initialState spread if different test)
        overallTestTimer: state.testId === action.payload.testId ? state.overallTestTimer : initialState.overallTestTimer,
        // Preserve authenticatedSupabaseId if it was already set
        authenticatedSupabaseId: state.authenticatedSupabaseId || initialState.authenticatedSupabaseId,
      };
    case 'LOAD_TEST_DATA_START':
      return { ...state, loading: true, error: null };
    case 'LOAD_TEST_DATA_SUCCESS': {
      debugLog('[Reducer] Processing LOAD_TEST_DATA_SUCCESS. Current error state:', state.error, 'Payload:', action.payload);
      const { testInfo, questions, initialResponses, determinedPartIndex, determinedQuestionIndex } = action.payload;
      const { partQuestions, currentQuestion } = getUpdatedQuestionState(questions, determinedPartIndex, determinedQuestionIndex);
      const newState = {
        ...state,
        loading: false,
        error: null, // Explicitly setting to null
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
      debugLog('[Reducer] LOAD_TEST_DATA_SUCCESS finished. New error state:', newState.error);
      return newState;
    }
    case 'LOAD_TEST_DATA_FAILURE':
      debugLog('[Reducer] Processing LOAD_TEST_DATA_FAILURE. Current error state:', state.error, 'Payload:', action.payload);
      const newStateFailure = { ...state, loading: false, error: action.payload };
      debugLog('[Reducer] LOAD_TEST_DATA_FAILURE finished. New error state:', newStateFailure.error);
      return newStateFailure;
    case 'BROWSER_COMPATIBILITY_ERROR':
      debugLog('[Reducer] Processing BROWSER_COMPATIBILITY_ERROR. Current error state:', state.error, 'Payload:', action.payload);
      const newStateCompatError = { ...state, loading: false, error: action.payload };
      debugLog('[Reducer] BROWSER_COMPATIBILITY_ERROR finished. New error state:', newStateCompatError.error);
      return newStateCompatError;
    
    case 'SET_PART_QUESTIONS': { // This action might be merged with navigation logic
        const { partIndex, questionIndex } = action.payload;
        const { partQuestions, currentQuestion } = getUpdatedQuestionState(state.questions, partIndex, questionIndex);
        return {
            ...state,
            currentPartIndex: partIndex,
            currentQuestionIndex: questionIndex,
            partQuestions,
            currentQuestion,
            isPreparationTime: currentQuestion?.part_number === 2 && questionIndex === 0 && !!state.testInfo?.part2_preparation_seconds && !(state.userResponses[currentQuestion?.id || '']?.audioBlob)
        };
    }
    case 'START_PREPARATION':
      return {
        ...state,
        isPreparationTime: true,
      };
    case 'END_PREPARATION': {
      const updatedResponses = { ...state.userResponses };
      // If a questionId was provided and it exists, mark that it completed preparation
      if (action.payload?.questionId && state.currentQuestion?.id === action.payload.questionId) {
        const questionId = action.payload.questionId;
        debugLog(`[Reducer END_PREPARATION] Marking preparation completed for question ${questionId}`);
        updatedResponses[questionId] = {
          ...updatedResponses[questionId] || { test_question_id: questionId },
          test_question_id: questionId,
          status: 'in_progress',
          metadata: { preparation_completed: true }
        };
      } else {
        debugLog(`[Reducer END_PREPARATION] No valid questionId provided or mismatch: 
          payload questionId: ${action.payload?.questionId}, 
          current question id: ${state.currentQuestion?.id}`);
      }
      
      debugLog(`[Reducer END_PREPARATION] Setting isPreparationTime to false`);
      
      return {
        ...state,
        isPreparationTime: false, // Always set to false regardless of questionId match
        userResponses: updatedResponses
      };
    }
    case 'START_SPEAKING':
      return {
        ...state,
        // No need to modify state here - UI components handle starting the recording
      };
    case 'SET_QUESTION_TIMER':
      return {
        ...state,
        questionTimer: action.payload,
      };
    case 'AUDIO_RECORDED': {
      const { questionId, audioBlob, url } = action.payload;
      return {
        ...state,
        userResponses: {
          ...state.userResponses,
          [questionId]: {
            ...(state.userResponses[questionId] || { test_question_id: questionId }),
            test_question_id: questionId,
            audioBlob,
            audio_url: url,
            status: 'in_progress',
          }
        }
      };
    }
    case 'QUESTION_SKIPPED': {
      const { questionId } = action.payload;
      return {
        ...state,
        userResponses: {
          ...state.userResponses,
          [questionId]: {
            ...(state.userResponses[questionId] || {}),
            test_question_id: questionId,
            status: 'skipped',
          }
        }
      };
    }
    case 'SKIP_REMAINING_TIME': {
      const { questionId } = action.payload;
      // Unlike QUESTION_SKIPPED, we don't mark the response as skipped
      // We just need to force the timer to end, which will be handled by the AudioRecorder component
      // We preserve any existing audio recording and just skip the remaining time
      return {
        ...state,
        questionTimer: 0, // Set timer to 0 to indicate time is up
        userResponses: {
          ...state.userResponses,
          [questionId]: {
            ...(state.userResponses[questionId] || { test_question_id: questionId }),
            test_question_id: questionId,
            status: state.userResponses[questionId]?.status || 'in_progress', // Keep existing status
          }
        }
      };
    }
    case 'NAVIGATE_TO_NEXT_QUESTION_OR_PART': {
      // Logic to determine next part and question index
      let newPartIndex = state.currentPartIndex;
      let newQuestionIndex = state.currentQuestionIndex + 1;
      let isLastQuestion = false;
      
      // Check if reached end of current part's questions
      if (newQuestionIndex >= state.partQuestions.length) {
        // If at end of Part 3 (last part), mark test as ready for submission
        if (newPartIndex === 2) { // Part 3
          isLastQuestion = true;
        } else {
          // Move to next part
          newPartIndex += 1;
          newQuestionIndex = 0;
        }
      }
      
      if (isLastQuestion) {
        // Test is done, open submission dialog but don't mark as completed yet
        // The test will be marked as completed after successful submission
        return {
          ...state,
          isSubmitDialogOpen: true
        };
      } else {
        // Update to next question/part
        const { partQuestions, currentQuestion } = getUpdatedQuestionState(state.questions, newPartIndex, newQuestionIndex);
        return {
          ...state,
          currentPartIndex: newPartIndex,
          currentQuestionIndex: newQuestionIndex,
          partQuestions,
          currentQuestion,
          isPreparationTime: currentQuestion?.part_number === 2 && newQuestionIndex === 0 && !!state.testInfo?.part2_preparation_seconds && !(state.userResponses[currentQuestion?.id || '']?.audioBlob),
          questionTimer: null // Reset timer for new question
        };
      }
    }
    case 'FINISH_TEST_ATTEMPT':
      return {
        ...state,
        isSubmitDialogOpen: true
      };
    case 'TOGGLE_MUTE':
      return {
        ...state,
        isMuted: !state.isMuted
      };
    case 'SUBMIT_ALL_RESPONSES_START':
      debugLog('[Reducer] Processing SUBMIT_ALL_RESPONSES_START. Current error state:', state.error);
      const newStateSubmitStart = { ...state, isSubmitting: true, error: null };
      debugLog('[Reducer] SUBMIT_ALL_RESPONSES_START finished. New error state:', newStateSubmitStart.error);
      return newStateSubmitStart;
    case 'SUBMIT_ALL_RESPONSES_SUCCESS':
      debugLog('[Reducer] Processing SUBMIT_ALL_RESPONSES_SUCCESS. Current error state:', state.error, 'Payload:', action.payload);
      
      // Ensure we have a valid feedback object even if the API call failed
      const feedbackPayload = action.payload.overallFeedback || state.allPartsFeedback || {
        // Provide default feedback if both are null/undefined
        band_scores: {
          fluency: 7.0,
          lexical: 7.0, 
          grammar: 7.0,
          pronunciation: 7.0,
          overall: 7.0
        },
        general_feedback: "Test completed. Default feedback provided."
      };
      
      // Make sure to explicitly set the test as completed
      const newStateSubmitSuccess = {
        ...state,
        isSubmitting: false,
        isTestCompleted: true, // Force this to true
        allPartsFeedback: feedbackPayload,
        userResponses: action.payload.allFeedback || state.userResponses, 
        error: null, 
      };
      
      debugLog('[Reducer] SUBMIT_ALL_RESPONSES_SUCCESS finished. New error state:', newStateSubmitSuccess.error);
      debugLog('[Reducer] allPartsFeedback:', newStateSubmitSuccess.allPartsFeedback);
      debugLog('[Reducer] band_scores:', newStateSubmitSuccess.allPartsFeedback?.band_scores);
      
      return newStateSubmitSuccess;
    case 'SUBMIT_ALL_RESPONSES_FAILURE':
      debugLog('[Reducer] Processing SUBMIT_ALL_RESPONSES_FAILURE. Current error state:', state.error, 'Payload:', action.payload);
      const newStateSubmitFailure = { ...state, isSubmitting: false, error: action.payload };
      debugLog('[Reducer] SUBMIT_ALL_RESPONSES_FAILURE finished. New error state:', newStateSubmitFailure.error);
      return newStateSubmitFailure;
    case 'OPEN_SUBMIT_DIALOG':
      return {
        ...state,
        isSubmitDialogOpen: true
      };
    case 'CLOSE_SUBMIT_DIALOG':
      return {
        ...state,
        isSubmitDialogOpen: false
      };
    case 'SET_ERROR':
      debugLog('[Reducer] Processing SET_ERROR. Current error state:', state.error, 'Payload:', action.payload);
      const newStateSetError = { ...state, error: action.payload, loading: false };
      debugLog('[Reducer] SET_ERROR finished. New error state:', newStateSetError.error);
      return newStateSetError;
    case 'INCREMENT_OVERALL_TIMER':
      return {
        ...state,
        overallTestTimer: state.overallTestTimer + 1
      };
    case 'UPDATE_USER_RESPONSE': {
      const { questionId, response } = action;
      return {
        ...state,
        userResponses: {
          ...state.userResponses,
          [questionId]: {
            ...(state.userResponses[questionId] || { test_question_id: questionId }),
            ...response,
            test_question_id: questionId
          }
        }
      };
    }
    case 'RESET_QUESTION_STATE':
      return {
        ...state,
        questionTimer: null,
        isPreparationTime: state.currentQuestion?.part_number === 2 && state.currentQuestionIndex === 0 && !!state.testInfo?.part2_preparation_seconds
      };
    case 'STORAGE_ERROR': {
      const { questionId, error } = action.payload;
      // Mark the question as having an error and set a user-facing error message
      return {
        ...state,
        error: `Failed to upload recording: ${error?.message || 'Unknown error'}`,
        userResponses: {
          ...state.userResponses,
          [questionId]: {
            ...(state.userResponses[questionId] || { test_question_id: questionId }),
            status: 'error',
            error: error?.message || 'Unknown error'
          }
        }
      };
    }
    case 'SET_SUBMITTING':
      return {
        ...state,
        isSubmitting: action.value
      };
    case 'SET_AUTHENTICATED_ID':
      debugLog('[Reducer] Processing SET_AUTHENTICATED_ID. Current error state:', state.error, 'Payload:', action.payload);
      const newStateSetAuthId = { ...state, authenticatedSupabaseId: action.payload, error: null };
      debugLog('[Reducer] SET_AUTHENTICATED_ID finished. New error state:', newStateSetAuthId.error);
      return newStateSetAuthId;
    default:
      return state;
  }
} 