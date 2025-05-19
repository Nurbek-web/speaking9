'use client'

import { useEffect, useState, useMemo, useCallback, useReducer, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { Loader2 } from 'lucide-react'

// Import types and reducer
import { 
  SpeakingTestState, 
  SpeakingTestAction,
  UserResponse,
  FeedbackResult
} from './types'
import { 
  initialState, 
  speakingTestReducer, 
  debugLog 
} from './testReducer'

// Import UI components
import LoadingScreen from './LoadingScreen'
import ErrorScreen from './ErrorScreen'
import TestCompletedUI from './TestCompletedUI'
import MainTestUI from './MainTestUI'

// Import utility functions and services
import storageService from '@/lib/storage'
import { checkMicrophonePermission } from '../testUtils'
import { 
  clerkToSupabaseId, 
  syncUserToSupabase, 
  createTemporarySession, 
  tryCreateAnonymousUser,
  createTemporaryUserId
} from '@/lib/clerkSupabaseAdapter'

// Import Supabase hooks
import useSupabaseAuth from '@/hooks/useSupabaseAuth'
import useSupabaseAnonymous from '@/hooks/useSupabaseAnonymous'

export default function SpeakingTestPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useUser();
  
  // Use authenticated Supabase client when user is available
  const { supabase: supabaseAuth, loading: authClientLoading } = useSupabaseAuth();
  
  // Redirect to login if no user is authenticated
  useEffect(() => {
    if (!user && !authClientLoading) {
      console.log('[Auth] No authenticated user, redirecting to login');
      router.push('/sign-in');
    }
  }, [user, authClientLoading, router]);
  
  // Use authenticated Supabase client only
  const supabase = supabaseAuth;

  // Get user from supabase for initial dispatch
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  
  // Track if auth is loading
  const [authLoading, setAuthLoading] = useState(true);
  
  // Convert Clerk user to Supabase user ID when needed
  const getSupabaseUserId = useCallback(async () => {
    // If we have a Clerk user, directly map to Supabase ID format
    if (user) {
      const mappedId = clerkToSupabaseId(user.id);
      console.log('[getSupabaseUserId] Using Clerk ID mapped to Supabase format:', mappedId);
      return mappedId;
    }
    
    // If we reach here without a user ID, redirect to sign in
    console.error('[getSupabaseUserId] No user ID available, redirecting to sign-in');
    router.push('/sign-in');
    return null;
  }, [user, router]);

  // Effect to handle authentication and user state
  useEffect(() => {
    let isActive = true;
    setAuthLoading(true);
    
    // Initialize user state based on authentication
    const initializeUser = async () => {
      try {
        // For authenticated users, setup Supabase user ID from Clerk
        if (user && supabaseAuth) {
          console.log("[Auth] Clerk user available, setting up Supabase user");
          
          // Skip the Supabase auth.getUser() call that causes the AuthSessionMissingError
          // Instead, directly map the Clerk ID to a Supabase ID format
          const mappedId = clerkToSupabaseId(user.id);
          console.log("[Auth] Using Clerk ID mapped to Supabase format:", mappedId);
          
          // Only update the state if it's different to prevent loops
          if (isActive && (!currentUser || currentUser.id !== mappedId)) {
            setCurrentUser({ id: mappedId } as any);
          }
        } else {
          // No authenticated user, redirect to sign-in
          if (isActive) {
            console.log("[Auth] No authenticated user, redirecting to sign-in");
            setAuthLoading(false);
            router.push('/sign-in');
          }
        }
        
        setAuthLoading(false);
      } catch (error) {
        console.error("[Auth] Error initializing user:", error);
        
        // Redirect to sign-in on error
        if (isActive) {
          setAuthLoading(false);
          router.push('/sign-in');
        }
      }
    };
    
    // Only initialize if we have a Supabase client
    if (supabase) {
      initializeUser();
    } else if (isActive) {
      // No Supabase client yet, wait for it
      console.log("[Auth] Waiting for Supabase client...");
    }
    
    return () => {
      isActive = false;
    };
  }, [user, supabase, supabaseAuth, router]);

  const pathTestId = useMemo(() => {
    let potentialId = params.testId as string | string[] | undefined;
    if (Array.isArray(potentialId)) potentialId = potentialId[0];
    return (typeof potentialId === 'string' && potentialId.toLowerCase() !== 'undefined') ? potentialId : undefined;
  }, [params.testId]);

  const [state, dispatch] = useReducer(speakingTestReducer, initialState);

  const isLoadingDataRef = useRef(false); // Ref to track if data loading is in progress
  const hasInitializedForTestAndUserRef = useRef<string | null>(null); // MODIFIED: Ref for INIT_TEST logic

  // Initialize test on mount and when testId or user changes
  useEffect(() => {
    const userId = currentUser?.id; // Get user ID once
    const currentTestIdInState = state.testId; // Get current testId from state once

    // Condition 1: Essential data is present (pathTestId, userId) and not currently loading other data
    if (pathTestId && userId && !isLoadingDataRef.current) {
      const initKey = `${pathTestId}-${userId}`;

      // Condition 2: This specific test-user combination hasn't been initialized yet,
      // OR the testId has changed and we are not in a loading state from a previous INIT_TEST for the new ID.
      if (hasInitializedForTestAndUserRef.current !== initKey && 
          (!state.loading || currentTestIdInState !== pathTestId)) {
        debugLog(
          `[Effect INIT_TEST] Dispatching INIT_TEST. pathTestId: ${pathTestId}, userId: ${userId}, current state.testId: ${currentTestIdInState}, state.loading: ${state.loading}, hasInitializedRef: ${hasInitializedForTestAndUserRef.current}, initKey: ${initKey}`
        );
        dispatch({ type: 'INIT_TEST', payload: { testId: pathTestId, user: currentUser } });
        hasInitializedForTestAndUserRef.current = initKey;
      } else {
        debugLog(
          `[Effect INIT_TEST] Skipping INIT_TEST dispatch. pathTestId: ${pathTestId}, userId: ${userId}, current state.testId: ${currentTestIdInState}, state.loading: ${state.loading}, hasInitializedRef: ${hasInitializedForTestAndUserRef.current}, initKey: ${initKey}, condition (ref !== key): ${hasInitializedForTestAndUserRef.current !== initKey}, condition (loading or id mismatch): ${(!state.loading || currentTestIdInState !== pathTestId)}`
        );
      }
    } 
    // Condition 3: pathTestId became undefined after being defined (e.g., navigating away), reset the ref.
    else if (!pathTestId && hasInitializedForTestAndUserRef.current) {
      debugLog(`[Effect INIT_TEST] pathTestId is undefined. Resetting hasInitializedForTestAndUserRef. Current value: ${hasInitializedForTestAndUserRef.current}`);
      hasInitializedForTestAndUserRef.current = null;
    } 
    // Condition 4: Log why it might be skipped if not covered above.
    else if (isLoadingDataRef.current) {
      debugLog(`[Effect INIT_TEST] Skipping INIT_TEST because isLoadingDataRef is true. pathTestId: ${pathTestId}, userId: ${userId}`);
    } else if (!userId) {
      // This case also covers currentUser being null/undefined initially.
      debugLog(`[Effect INIT_TEST] Skipping INIT_TEST because userId is not yet available. pathTestId: ${pathTestId}, currentUser available: ${!!currentUser}`);
    }
    // Ensure currentUser itself is part of dependency array if its properties are used directly.
    // state.loading and state.testId are important to re-evaluate conditions.
  }, [pathTestId, currentUser, dispatch, state.loading, state.testId]);

  // Effect for fetching test data when state.testId is set and loading is true (after INIT_TEST)
  useEffect(() => {
    // state.initialUser is assumed to be set by the reducer during INIT_TEST
    if (state.loading && state.testId && state.initialUser && !isLoadingDataRef.current) {
        isLoadingDataRef.current = true; 
        debugLog("[Effect LOAD_DATA] Attempting to load test data for testId:", state.testId, "Using state.initialUser for context:", state.initialUser?.id);
        
        const performLoad = async () => {
            console.log('[PerformLoad_TRACE] Entered performLoad function.');
            try {
                console.log('[PerformLoad_TRACE] TRY_BLOCK_ENTERED');
                const browserCompatibilityPromise = checkMicrophonePermission();
                
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
                
                const browserCompatible = await browserCompatibilityPromise;
                console.log('[PerformLoad] Browser compatible status:', browserCompatible);
                console.log('[PerformLoad] typeof MediaRecorder:', typeof MediaRecorder);

                const isMediaRecorderUndefined = typeof MediaRecorder === 'undefined';
                const isBrowserNotCompatible = !browserCompatible;
                console.log(`[PerformLoad] Pre-compatibility check: isMediaRecorderUndefined=${isMediaRecorderUndefined}, isBrowserNotCompatible=${isBrowserNotCompatible}`);

                if (isMediaRecorderUndefined || isBrowserNotCompatible) {
                    const compatibilityErrorPayload = 'Microphone access denied or browser not supported.';
                    console.error(`[PerformLoad] CONDITION MET: Dispatching BROWSER_COMPATIBILITY_ERROR. Payload being dispatched: "${compatibilityErrorPayload}"`);
                    dispatch({ type: 'BROWSER_COMPATIBILITY_ERROR', payload: compatibilityErrorPayload });
                    isLoadingDataRef.current = false; // Make sure to set loading to false
                    return;
                }
                
                console.log('[PerformLoad_TRACE] ABOUT_TO_EXECUTE_PROMISE_ALL');
                const [testDataResult, questionsDataResult] = await Promise.all([
                    testInfoPromise,
                    questionsPromise
                ]);
                console.log('[PerformLoad_TRACE] PROMISE_ALL_COMPLETED_SUCCESSFULLY');
                
                // Guard: check if still loading or if another load has started
                if (!isLoadingDataRef.current) {
                    console.warn('[PerformLoad] Loading was canceled or a new load has started.');
                    return; // Exit without dispatching
                }
                
                if (testDataResult.error) throw new Error(`Error fetching test details: ${testDataResult.error.message}`);
                if (!testDataResult.data) throw new Error('Test not found.');
                
                if (questionsDataResult.error) throw new Error(`Error fetching questions: ${questionsDataResult.error.message}`);
                if (!questionsDataResult.data || questionsDataResult.data.length === 0) throw new Error('No questions found for this test.');
                
                const testData = testDataResult.data;
                const questionsDataRaw = questionsDataResult.data;

                const processedQuestions = questionsDataRaw.map((q: any) => {
                    const speaking_time_seconds = 
                        q.part_number === 1 ? testData.part1_duration_seconds || 60 :
                        q.part_number === 2 ? testData.part2_duration_seconds || 120 :
                        q.part_number === 3 ? testData.part3_duration_seconds || 60 : 60;
                    return { ...q, question_number: q.sequence_number, preparation_time_seconds: q.part_number === 2 ? (testData.part2_preparation_seconds || 60) : 0, speaking_time_seconds };
                });
                
                let responsesMap: Record<string, UserResponse> = {};
                // REVISED: Use state.initialUser.id for loading previous responses
                const userIdForPreviousResponses = state.initialUser?.id; 

                const isValidSupabaseId = (id: string | undefined | null): boolean => {
                  if (!id) return false;
                  if (id.startsWith('temp-') || id.startsWith('emergency-')) return false;
                  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
                };
                
                if (isValidSupabaseId(userIdForPreviousResponses)) {
                    debugLog("[Effect LOAD_DATA] Valid Supabase ID from state.initialUser, loading previous responses for user:", userIdForPreviousResponses);
                    const { data: responsesData, error: responsesError } = await supabase
                        .from('user_responses')
                        .select('id, test_question_id, audio_url, transcript, status')
                        .eq('user_id', userIdForPreviousResponses)
                        .in('test_question_id', processedQuestions.map((q: any) => q.id));
                    if (responsesError) console.warn('[Effect LOAD_DATA] Error loading previous responses:', responsesError.message);
                    else if (responsesData) {
                        responsesData.forEach((response: any) => {
                            if (response.test_question_id) responsesMap[response.test_question_id] = { id: response.id, test_question_id: response.test_question_id, status: response.status || 'in_progress', audio_url: response.audio_url, transcript: response.transcript, metadata: response.metadata || undefined };
                        });
                        debugLog("[Effect LOAD_DATA] Loaded previous responses:", Object.keys(responsesMap).length);
                    }
                } else {
                    debugLog("[Effect LOAD_DATA] No valid Supabase ID or temp ID, skipping previous responses. User ID:", userIdForPreviousResponses);
                }
                
                let determinedPartIndex = 0;
                let determinedQuestionIndex = 0;
                // REVISED: Use state.initialUser for determining starting point as well
                if (state.initialUser && Object.keys(responsesMap).length > 0) { 
                    const questionsForPart1 = processedQuestions.filter((q: any) => q.part_number === 1);
                    const questionsForPart2 = processedQuestions.filter((q: any) => q.part_number === 2);
                    const questionsForPart3 = processedQuestions.filter((q: any) => q.part_number === 3);
                    const part1Complete = questionsForPart1.every((q: any) => responsesMap[q.id]);
                    const part2Complete = questionsForPart2.every((q: any) => responsesMap[q.id]);
                    if (part1Complete && part2Complete) {
                        determinedPartIndex = 2;
                        const firstIncompletePart3 = questionsForPart3.findIndex((q: any) => !responsesMap[q.id]);
                        determinedQuestionIndex = firstIncompletePart3 >= 0 ? firstIncompletePart3 : 0;
                    } else if (part1Complete) {
                        determinedPartIndex = 1;
                        const firstIncompletePart2 = questionsForPart2.findIndex((q: any) => !responsesMap[q.id]);
                        determinedQuestionIndex = firstIncompletePart2 >= 0 ? firstIncompletePart2 : 0;
                    } else {
                        const firstIncompletePart1 = questionsForPart1.findIndex((q: any) => !responsesMap[q.id]);
                        determinedQuestionIndex = firstIncompletePart1 >= 0 ? firstIncompletePart1 : 0;
                    }
                }
                
                console.log('[PerformLoad_TRACE] TRY_BLOCK_COMPLETED_SUCCESSFULLY, dispatching LOAD_TEST_DATA_SUCCESS.');
                
                // Add one final guard to prevent duplicate dispatches
                if (!isLoadingDataRef.current) {
                    console.warn('[PerformLoad] Loading was canceled during final preparation.');
                    return;
                }
                
                // Set isLoadingDataRef to false BEFORE dispatching to prevent re-entry/double-dispatch
                isLoadingDataRef.current = false;
                
                // Dispatch the action to load the test data
                dispatch({ type: 'LOAD_TEST_DATA_SUCCESS', payload: { testInfo: testData, questions: processedQuestions, initialResponses: responsesMap, determinedPartIndex, determinedQuestionIndex } });
            } catch (error: any) {
                console.error('[PerformLoad_TRACE] CATCH_BLOCK_ENTERED');
                const actualErrorMessage = error?.message || 'An unknown error occurred during data loading.';
                dispatch({ type: 'LOAD_TEST_DATA_FAILURE', payload: actualErrorMessage });
                isLoadingDataRef.current = false;
            }
        };
        performLoad();
    }
    else if (!state.loading && isLoadingDataRef.current) {
        debugLog("[Effect LOAD_DATA] state.loading is false and isLoadingDataRef was true, resetting isLoadingDataRef.");
        isLoadingDataRef.current = false;
    }
  }, [state.loading, state.testId, state.initialUser, supabase, dispatch]); // REVISED: Dependency array for performLoad effect. 

  // Set up timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (!state.isTestCompleted && !state.loading) {
        dispatch({ type: 'INCREMENT_OVERALL_TIMER' });
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [state.isTestCompleted, state.loading]);

  // Handle question timer updates (from AudioRecorder component)
  const handleQuestionTimerUpdateForDispatch = useCallback((seconds: number) => {
    dispatch({ type: 'SET_QUESTION_TIMER', payload: seconds });
  }, [dispatch]);

  // Handle validating responses and submitting them
  const validateResponses = useCallback(() => {
    const allQuestionIds = state.questions.map(q => q.id);
    const responseQuestionIds = Object.keys(state.userResponses);
    
    // Check if we have a response for every question
    // A response can be either completed or skipped
    const hasAllResponses = allQuestionIds.every(id => responseQuestionIds.includes(id));
    
    // Check if any question has an error status
    const hasErrors = responseQuestionIds.some(id => 
      state.userResponses[id].status === 'error'
    );
    
    // A question is considered answered if it has a response that's not an error
    // This includes both completed and skipped questions
    return {
      isValid: hasAllResponses && !hasErrors,
      hasAllResponses,
      hasErrors,
      missingQuestionIds: allQuestionIds.filter(id => !responseQuestionIds.includes(id))
    };
  }, [state.questions, state.userResponses]);

  // Helper function to submit a single response
  const submitResponseAsync = useCallback(async (questionId: string, response: UserResponse): Promise<string | null> => {
    try {
      debugLog(`[submitResponseAsync] Submitting response for ${questionId}`);
      
      // Get user ID - FIXED: Always use clerkToSupabaseId to ensure proper format
      let userId: string = state.authenticatedSupabaseId || '';
      let originalUserId = ''; // Track original ID for logging
      
      // If we don't have an authenticated ID, try to get one or create a temporary ID
      if (!userId) {
        if (user) {
          // Convert Clerk user ID to Supabase format
          originalUserId = user.id;
          userId = clerkToSupabaseId(user.id);
          debugLog(`[submitResponseAsync] Using converted Clerk ID: ${userId} (from ${originalUserId})`);
        } else if (state.initialUser?.id) {
          // Ensure initialUser.id is in the correct format if it's a Clerk ID
          originalUserId = state.initialUser.id;
          if (state.initialUser.id.startsWith('user_')) {
            userId = clerkToSupabaseId(state.initialUser.id);
            debugLog(`[submitResponseAsync] Converting initialUser.id from Clerk format: ${userId} (from ${originalUserId})`);
          } else {
            userId = state.initialUser.id;
          }
        } else {
          // Create a temporary ID if no user ID is available
          userId = `temp-${Math.random().toString(36).substring(2, 10)}-${Date.now()}`;
          debugLog(`[submitResponseAsync] Created temporary ID: ${userId}`);
        }
      }
      
      // Prepare audio URL (might be a blob or Supabase storage URL)
      let audioUrl = response.audio_url;
      
      // For skipped responses, use a placeholder data URL
      if (response.status === 'skipped') {
        audioUrl = 'data:audio/webm;base64,AAAAAAAA'; // Placeholder for skipped audio
        debugLog(`[submitResponseAsync] Using placeholder URL for skipped question ${questionId}`);
      }
      // For completed responses without audio, respect the status but provide a better URL
      else if (response.status === 'completed' && !audioUrl && !response.audioBlob) {
        // Provide a unique but not-completely-empty audio URL for tracking
        audioUrl = `data:audio/webm;base64,ABBREVIATED_${Date.now()}`;
        debugLog(`[submitResponseAsync] Using abbreviated URL for completed question without audio ${questionId}`);
      }
      // If we have a blob but no URL, try to upload it
      else if (!audioUrl && response.audioBlob) {
        debugLog(`[submitResponseAsync] Uploading audio for ${questionId}`);
        try {
          // The blob is in memory, upload it
          const uploadResult = await storageService.uploadRecording(
            response.audioBlob, 
            `${userId}/${questionId}.webm`
          );
          
          if (uploadResult) {
            audioUrl = uploadResult;
          } else {
            console.warn(`[submitResponseAsync] Storage upload failed for ${questionId}`);
            // Create data URL as fallback
            audioUrl = await storageService.createDataUrl(response.audioBlob);
          }
        } catch (uploadError) {
          console.error(`[submitResponseAsync] Error uploading audio for ${questionId}:`, uploadError);
          if (response.audioBlob) {
            // Create data URL as fallback
            audioUrl = await storageService.createDataUrl(response.audioBlob);
          } else {
            audioUrl = 'data:audio/webm;base64,AAAAAAAA'; // Emergency placeholder
          }
        }
      }
      
      // Return early with local ID if we still don't have an audio URL
      if (!audioUrl) {
        console.error(`[submitResponseAsync] No audio URL available for ${questionId}`);
        return `local_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      }
      
      // NEW APPROACH: Always use temp_responses table if we detect any Clerk-related issues
      // Check if this appears to be a Clerk-authenticated session or if we've seen Clerk ID format
      const isClerkSession = originalUserId.startsWith('user_') || 
                            (user && user.id.startsWith('user_')) ||
                            userId.includes('clerk');
                            
      // Also consider temporary IDs 
      const isTemporaryId = userId.startsWith('temp-') || userId.startsWith('emergency-');
      
      // Force using temp_responses if this is a Clerk session to avoid UUID validation issues
      const useTemporaryTable = isClerkSession || isTemporaryId;
      
      if (useTemporaryTable) {
        debugLog(`[submitResponseAsync] Using temp_responses table due to Clerk authentication or temp ID`);
      }
      
      // Prepare the response data
      const responseData = {
        user_id: userId,
        test_question_id: questionId,
        audio_url: audioUrl,
        transcript: response.transcript || '',
        status: response.status || 'completed'
      };
      
      // Try to save to Supabase - use different tables based on ID type
      try {
        debugLog(`[submitResponseAsync] Saving to database for ${questionId}`);
        
        let result;
        
        // If this is a temporary ID or Clerk session, use the temp_responses table
        if (useTemporaryTable) {
          debugLog(`[submitResponseAsync] Using temp_responses table for ID: ${userId}`);
          
          // First, ensure the anonymous user exists
          if (isTemporaryId) {
            await tryCreateAnonymousUser(supabase, userId);
          }
          
          if (response.id && response.id.toString().startsWith('local_')) {
            // This is a client-side ID, insert as new
            const { data, error } = await supabase
              .from('temp_responses')
              .insert(responseData)
              .select('id')
              .single();
              
            if (error) throw error;
            result = data?.id;
          } else if (response.id) {
            // Update existing response
            const { data, error } = await supabase
              .from('temp_responses')
              .update(responseData)
              .eq('id', response.id)
              .select('id')
              .single();
              
            if (error) throw error;
            result = data?.id;
          } else {
            // Insert new response
            const { data, error } = await supabase
              .from('temp_responses')
              .insert(responseData)
              .select('id')
              .single();
              
            if (error) throw error;
            result = data?.id;
          }
        } else {
          // For truly authenticated users with valid UUIDs, use the regular user_responses table
          if (response.id && !response.id.toString().startsWith('local_')) {
            // Update existing response
            const { data, error } = await supabase
              .from('user_responses')
              .update(responseData)
              .eq('id', response.id)
              .select('id')
              .single();
              
            if (error) throw error;
            result = data?.id;
          } else {
            // Insert new response
            const { data, error } = await supabase
              .from('user_responses')
              .insert(responseData)
              .select('id')
              .single();
              
            if (error) throw error;
            result = data?.id;
          }
        }
        
        return result || null;
      } catch (dbError) {
        console.error(`[submitResponseAsync] Database error for ${questionId}:`, dbError);
        
        // If we get an error and we weren't using temp_responses, try again with temp_responses
        if (!useTemporaryTable) {
          debugLog(`[submitResponseAsync] Retrying with temp_responses table after error`);
          try {
            const { data, error } = await supabase
              .from('temp_responses')
              .insert(responseData)
              .select('id')
              .single();
              
            if (error) throw error;
            return data?.id || null;
          } catch (retryError) {
            console.error(`[submitResponseAsync] Retry also failed:`, retryError);
          }
        }
        
        return `local_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      }
    } catch (error) {
      console.error(`[submitResponseAsync] Error saving response for ${questionId}:`, error);
      return `local_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    }
  }, [state.authenticatedSupabaseId, state.initialUser, supabase, user]);

  // Handles the submission of all responses
  const submitAllResponsesAsync = useCallback(async () => {
    // Helper function to round scores to IELTS 0.5 increments
    const roundToHalf = (num: number): number => {
      return Math.round(num * 2) / 2;
    };
    
    // Check if responses are valid before submitting
    const { isValid, hasAllResponses } = validateResponses();
    
    // Count how many questions were skipped vs answerable
    const skippedCount = Object.values(state.userResponses).filter(res => res.status === 'skipped').length;
    const answeredCount = Object.values(state.userResponses).filter(res => 
      // Count both fully recorded responses and those marked completed via "skip remaining time"
      res.status === 'completed' || res.status === 'in_progress'
    ).length;
    
    debugLog(`[submitAllResponsesAsync] Processing responses: ${answeredCount} answered, ${skippedCount} skipped`);
    
    // Log a more detailed breakdown for debugging
    const detailedCounts = {
      completed: Object.values(state.userResponses).filter(res => res.status === 'completed').length,
      in_progress: Object.values(state.userResponses).filter(res => res.status === 'in_progress').length,
      skipped: skippedCount,
      error: Object.values(state.userResponses).filter(res => res.status === 'error').length,
      with_audio: Object.values(state.userResponses).filter(res => !!res.audioBlob || !!res.audio_url).length,
      without_audio: Object.values(state.userResponses).filter(res => !res.audioBlob && !res.audio_url).length,
      total: Object.keys(state.userResponses).length
    };
    debugLog(`[submitAllResponsesAsync] Detailed response counts:`, detailedCounts);
    
    // Always require authentication for submitting responses
    if (!user) {
      dispatch({ type: 'SET_ERROR', payload: 'You must be signed in to submit responses.' });
      router.push('/sign-in');
      return;
    }
    
    if (!isValid) {
      if (!hasAllResponses) {
        dispatch({ type: 'SET_ERROR', payload: 'Please answer all questions before submitting.' });
      } else {
        dispatch({ type: 'SET_ERROR', payload: 'Some recordings have errors. Please re-record them.' });
      }
      return;
    }
    
    dispatch({ type: 'SUBMIT_ALL_RESPONSES_START' });
    
    try {
      // Get authenticated ID or use the current one
      let authenticatedSupabaseId = currentUser?.id;
      
      // If we don't have an ID yet, get one
      if (!authenticatedSupabaseId) {
        authenticatedSupabaseId = await getSupabaseUserId();
      }
      
      console.log('[submitAllResponsesAsync] Using user ID:', authenticatedSupabaseId);
      
      // Update the authenticatedSupabaseId in the state
      dispatch({
        type: 'SET_AUTHENTICATED_ID',
        payload: authenticatedSupabaseId
      });
      
      // Process each response
      const processedResponses: Record<string, UserResponse> = {};
      let allProcessedSuccessfully = true;
      const feedbackResults: Record<string, any> = {};
      const skippedQuestions: string[] = [];
      
      console.log(`[submitAllResponsesAsync] Processing responses: ${answeredCount} answered, ${skippedCount} skipped`);
      
      // First pass: Submit responses to database and identify which ones need transcription
      for (const questionId of Object.keys(state.userResponses)) {
        debugLog(`[submitAllResponsesAsync] Processing question ${questionId}`);
        
        // Get the current response
        const response = state.userResponses[questionId];
        
        // If the question was skipped, mark it accordingly
        if (response.status === 'skipped') {
          debugLog(`[submitAllResponsesAsync] Question ${questionId} was skipped`);
          skippedQuestions.push(questionId);
          
          // Submit the skipped response to database
          const submissionResult = await submitResponseAsync(questionId, response);
          
          if (submissionResult) {
            processedResponses[questionId] = {
              ...response,
              status: 'skipped',
              id: submissionResult
            };
          } else {
            processedResponses[questionId] = {
              ...response,
              status: 'error',
              error: 'Failed to save response'
            };
            allProcessedSuccessfully = false;
          }
          continue;
        }
        
        // For non-skipped questions, submit to database
        const submissionResult = await submitResponseAsync(questionId, response);
        
        if (submissionResult) {
          // Update response with submission result
          processedResponses[questionId] = {
            ...response,
            status: submissionResult.startsWith('local_') ? 'local' : 'completed',
            id: submissionResult
          };
        } else {
          // If submission failed, mark with error
          processedResponses[questionId] = {
            ...response,
            status: 'error',
            error: 'Failed to save response'
          };
          allProcessedSuccessfully = false;
        }
      }
      
      // Second pass: Process transcription and scoring for non-skipped responses
      for (const questionId of Object.keys(processedResponses)) {
        // Skip already processed (i.e., skipped) questions
        if (skippedQuestions.includes(questionId)) {
          continue;
        }
        
        const response = processedResponses[questionId];
        const question = state.questions.find(q => q.id === questionId);
        
        if (!question) {
          console.error(`[submitAllResponsesAsync] Question ${questionId} not found in state.questions`);
          continue;
        }
        
        // Skip transcription for questions without audio, but still mark as processed
        if (!response.audioBlob && !response.audio_url) {
          debugLog(`[submitAllResponsesAsync] No audio data for question ${questionId}`);
          
          // For responses marked as completed (e.g., from "skip remaining time"), 
          // provide a placeholder transcript instead of trying to transcribe
          if (response.status === 'completed') {
            debugLog(`[submitAllResponsesAsync] Using placeholder transcript for completed question without audio: ${questionId}`);
            processedResponses[questionId] = {
              ...processedResponses[questionId],
              transcript: "[Question was partially answered, but audio processing was incomplete]"
            };
          }
          
          continue; // Skip to next question
        }
        
        try {
          let transcript = response.transcript;
          
          // For skipped questions, set a default transcript indicating it was skipped
          if (response.status === 'skipped') {
            transcript = "[This question was skipped by the user]";
            processedResponses[questionId] = {
              ...processedResponses[questionId],
              transcript
            };
            continue; // Continue to next question
          }

          // If no transcript yet, try to transcribe the audio
          if (!transcript) {
            try {
              debugLog(`[submitAllResponsesAsync] Transcribing audio for question ${questionId}`);
              
              // Use the audio URL or blob
              const audioUrl = response.audio_url;
              const audioBlob = response.audioBlob;
              const isDataUrl = audioUrl?.startsWith('data:');
              
              console.log(`[API call] Calling transcribe API for question ${questionId}. Has URL: ${!!audioUrl}, Has blob: ${!!audioBlob}, isDataUrl: ${isDataUrl}`);
              
              // Call the transcription API
              try {
                let transcribeResponse;
                
                if (audioBlob) {
                  // If we have a blob, send it directly using the correct file name and content type
                  console.log(`[API call] Sending blob directly, size: ${Math.round(audioBlob.size/1024)}KB, type: ${audioBlob.type}`);
                  const filename = `audio-${questionId}-${Date.now()}.webm`;
                  
                  // Create a new form data object
                  const formData = new FormData();
                  
                  // If the blob doesn't have the right type, create a new one with the correct type
                  let blobToSend = audioBlob;
                  if (audioBlob.type !== 'audio/webm') {
                    console.log(`[API call] Converting blob from ${audioBlob.type} to audio/webm`);
                    blobToSend = new Blob([await audioBlob.arrayBuffer()], { type: 'audio/webm' });
                  }
                  
                  // Add the blob as 'file' field which is what the API expects
                  formData.append('file', blobToSend, filename);
                  
                  // Other metadata
                  formData.append('userId', authenticatedSupabaseId);
                  formData.append('questionId', questionId);
                  
                  console.log(`[API call] Sending FormData with file: ${filename}`);
                  
                  transcribeResponse = await fetch('/api/transcribe', {
                    method: 'POST',
                    // Don't set Content-Type header, browser will set it with boundary
                    body: formData
                  });
                } else if (audioUrl) {
                  // If we have a URL, send it as JSON
                  console.log(`[API call] Sending URL: ${audioUrl.substring(0, 50)}...`);
                  
                  transcribeResponse = await fetch('/api/transcribe', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      audioUrl,
                      isDataUrl,
                      userId: authenticatedSupabaseId,
                      questionId
                    })
                  });
                } else {
                  throw new Error('No audio data available for transcription');
                }
                
                // Process the response
                if (!transcribeResponse.ok) {
                  const errorText = await transcribeResponse.text();
                  console.error(`[API ERROR] Transcription API error: ${transcribeResponse.status} - ${errorText}`);
                  throw new Error(`Transcription API error (${transcribeResponse.status}): ${errorText}`);
                }
                
                const transcribeData = await transcribeResponse.json();
                console.log(`[API SUCCESS] Transcription API response:`, transcribeData);
                
                transcript = transcribeData.text;
                
                if (!transcript) {
                  throw new Error('No transcript returned from API');
                }
                
                // Update the processed response with the transcript
                processedResponses[questionId] = {
                  ...processedResponses[questionId],
                  transcript
                };
                
                debugLog(`[submitAllResponsesAsync] Successfully transcribed audio for question ${questionId}: ${transcript.substring(0, 50)}...`);
              } catch (transcriptionError) {
                console.error(`[submitAllResponsesAsync] Transcription error for question ${questionId}:`, transcriptionError);
                
                // FALLBACK: If transcription fails, create a placeholder transcript so scoring can still happen
                transcript = "[Audio transcription failed. This is a placeholder transcript for scoring purposes.]";
                processedResponses[questionId] = {
                  ...processedResponses[questionId],
                  transcript
                };
                console.log(`[submitAllResponsesAsync] Using fallback transcript for question ${questionId}`);
                
                // Continue to the next question
                continue;
              }
            } catch (transcriptionError) {
              console.error(`[submitAllResponsesAsync] Transcription error for question ${questionId}:`, transcriptionError);
              
              // FALLBACK: If transcription fails, create a placeholder transcript so scoring can still happen
              transcript = "[Audio transcription failed. This is a placeholder transcript for scoring purposes.]";
              processedResponses[questionId] = {
                ...processedResponses[questionId],
                transcript
              };
              console.log(`[submitAllResponsesAsync] Using fallback transcript for question ${questionId}`);
              
              // Continue to the next question
              continue;
            }
          }
          
          // Now get a score for this transcript
          if (transcript) {
            debugLog(`[submitAllResponsesAsync] Scoring transcript for question ${questionId}`);
            console.log(`[API call] Calling score API for question ${questionId}. Transcript length: ${transcript.length}`);
            
            try {
              const scorePayload = {
                userId: authenticatedSupabaseId,
                questionId,
                questionText: question.question_text,
                questionType: question.question_type || `part${question.part_number}`,
                transcript,
                audioUrl: response.audio_url
              };
              
              console.log(`[API payload] Score API payload:`, JSON.stringify(scorePayload).substring(0, 200) + '...');
              
              const scoreResponse = await fetch('/api/score', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(scorePayload)
              });
              
              if (!scoreResponse.ok) {
                const errorText = await scoreResponse.text();
                console.error(`[API ERROR] Scoring API error: ${scoreResponse.status} - ${errorText}`);
                throw new Error(`Scoring API error (${scoreResponse.status}): ${errorText.substring(0, 100)}`);
              }
              
              const scoreData = await scoreResponse.json();
              console.log(`[API SUCCESS] Scoring API response:`, scoreData);
              
              if (!scoreData.feedback) {
                throw new Error('No feedback returned from API');
              }
              
              // Store the feedback for this question
              feedbackResults[questionId] = scoreData.feedback;
              
              // Update the processed response with the feedback
              processedResponses[questionId] = {
                ...processedResponses[questionId],
                feedback: scoreData.feedback
              };
              
              debugLog(`[submitAllResponsesAsync] Successfully scored transcript for question ${questionId}`);
            } catch (scoringError) {
              console.error(`[submitAllResponsesAsync] Scoring error for question ${questionId}:`, scoringError);
              // Continue with next question
              continue;
            }
          }
        } catch (processingError) {
          console.error(`[submitAllResponsesAsync] Processing error for question ${questionId}:`, processingError);
          // Continue with next question
          continue;
        }
      }
      
      // Generate overall feedback by combining individual question feedback
      let overallFeedback: FeedbackResult | null = null;
      
      try {
        debugLog('[submitAllResponsesAsync] Generating overall feedback');
        
        // Count questions with feedback vs skipped
        const questionsWithFeedback = Object.keys(feedbackResults).length;
        const totalQuestions = state.questions.length;
        
        // If we have at least one feedback result, generate overall feedback
        if (questionsWithFeedback > 0) {
          // Calculate average scores across all questions with feedback
          let totalBandScore = 0;
          let totalFluency = 0;
          let totalLexical = 0;
          let totalGrammar = 0;
          let totalPronunciation = 0;
          
          // Collect all feedback for aggregation
          const allFeedbacks = Object.values(feedbackResults);
          
          allFeedbacks.forEach(feedback => {
            totalBandScore += feedback.bandScore || 0;
            totalFluency += feedback.fluencyCoherence || 0;
            totalLexical += feedback.lexicalResource || 0;
            totalGrammar += feedback.grammaticalRange || 0;
            totalPronunciation += feedback.pronunciation || 0;
          });
          
          // Calculate averages
          const avgBandScore = questionsWithFeedback > 0 ? totalBandScore / questionsWithFeedback : 7.0;
          const avgFluency = questionsWithFeedback > 0 ? totalFluency / questionsWithFeedback : 7.0;
          const avgLexical = questionsWithFeedback > 0 ? totalLexical / questionsWithFeedback : 7.0;
          const avgGrammar = questionsWithFeedback > 0 ? totalGrammar / questionsWithFeedback : 7.0;
          const avgPronunciation = questionsWithFeedback > 0 ? totalPronunciation / questionsWithFeedback : 7.0;
          
          // Calculate a better skipping penalty that distinguishes between truly skipped questions
          // and questions where user answered but skipped remaining time
          const trulySkippedCount = skippedCount;
          const completedWithoutAudioCount = Object.values(state.userResponses).filter(
            res => res.status === 'completed' && !res.audioBlob && !res.audio_url
          ).length;
          
          // Calculate different penalties for truly skipped vs partial answers
          const skippedRatio = trulySkippedCount / totalQuestions;
          const incompleteRatio = completedWithoutAudioCount / totalQuestions;
          
          // Heavier penalty for skipped, lighter for incomplete
          const skippedPenalty = skippedRatio > 0.5 ? Math.min(skippedRatio * 2, 2.0) : skippedRatio;
          const incompletePenalty = incompleteRatio * 0.5; // Lighter penalty for partial answers
          
          const totalPenalty = Math.min(skippedPenalty + incompletePenalty, 2.0);
          
          debugLog(`[submitAllResponsesAsync] Score adjustment factors - skipped: ${skippedRatio.toFixed(2)}, incomplete: ${incompleteRatio.toFixed(2)}, total penalty: ${totalPenalty.toFixed(2)}`);
          
          // Adjust scores if some questions were skipped
          const scoreAdjustment = totalPenalty;
          
          // Calculate adjusted scores
          const adjustedBandScore = roundToHalf(avgBandScore - scoreAdjustment);
          const adjustedFluency = roundToHalf(avgFluency - scoreAdjustment);
          const adjustedLexical = roundToHalf(avgLexical - scoreAdjustment);
          const adjustedGrammar = roundToHalf(avgGrammar - scoreAdjustment);
          const adjustedPronunciation = roundToHalf(avgPronunciation - scoreAdjustment);
          
          // Generate combined feedback text
          const allGeneralFeedback = allFeedbacks.map(f => f.generalFeedback || '').filter(Boolean);
          const allFluencyFeedback = allFeedbacks.map(f => f.fluencyFeedback || '').filter(Boolean);
          const allLexicalFeedback = allFeedbacks.map(f => f.lexicalFeedback || '').filter(Boolean);
          const allGrammarFeedback = allFeedbacks.map(f => f.grammarFeedback || '').filter(Boolean);
          const allPronunciationFeedback = allFeedbacks.map(f => f.pronunciationFeedback || '').filter(Boolean);
          
          // Example of how to reference the scores in text
          const feedbackQuality = adjustedBandScore >= 7.0 ? "excellent" : 
                              adjustedBandScore >= 6.0 ? "good" :
                              adjustedBandScore >= 5.0 ? "satisfactory" : "needs improvement";
          
          // Create the overall feedback object with all scores properly rounded
          overallFeedback = {
            band_score: adjustedBandScore,
            overall_band_score: adjustedBandScore,
            fluency_coherence_score: adjustedFluency,
            lexical_resource_score: adjustedLexical,
            grammar_accuracy_score: adjustedGrammar,
            pronunciation_score: adjustedPronunciation,
            general_feedback: allGeneralFeedback.length > 0 
              ? `${allGeneralFeedback[0]} Your overall score is ${adjustedBandScore.toFixed(1)}, which is ${feedbackQuality}.` 
              : `Your responses showed ${feedbackQuality} communication skills overall. Your IELTS band score is ${adjustedBandScore.toFixed(1)}.`,
            fluency_coherence_feedback: allFluencyFeedback.length > 0 
              ? allFluencyFeedback[0] 
              : "You maintained reasonable fluency throughout your answers.",
            lexical_resource_feedback: allLexicalFeedback.length > 0 
              ? allLexicalFeedback[0] 
              : "You used appropriate vocabulary to express your ideas.",
            grammar_accuracy_feedback: allGrammarFeedback.length > 0 
              ? allGrammarFeedback[0] 
              : "You demonstrated acceptable grammar with some errors that didn't impede understanding.",
            pronunciation_feedback: allPronunciationFeedback.length > 0 
              ? allPronunciationFeedback[0] 
              : "Your pronunciation was generally clear and intelligible.",
            model_answer: "A model answer would include more specific examples and more complex grammatical structures.",
            band_scores: {
              fluency: adjustedFluency,
              lexical: adjustedLexical, 
              grammar: adjustedGrammar,
              pronunciation: adjustedPronunciation,
              overall: adjustedBandScore
            },
            // Generate strengths and improvement areas based on feedback patterns
            strengths: "- " + allFeedbacks
              .flatMap(f => [
                f.fluencyFeedback, 
                f.lexicalFeedback, 
                f.grammarFeedback, 
                f.pronunciationFeedback
              ])
              .filter(Boolean)
              .filter(feedback => 
                feedback.toLowerCase().includes("good") || 
                feedback.toLowerCase().includes("well") || 
                feedback.toLowerCase().includes("strong")
              )
              .slice(0, 3)
              .join("\n- "),
            areas_for_improvement: "- " + allFeedbacks
              .flatMap(f => [
                f.fluencyFeedback, 
                f.lexicalFeedback, 
                f.grammarFeedback, 
                f.pronunciationFeedback
              ])
              .filter(Boolean)
              .filter(feedback => 
                feedback.toLowerCase().includes("improve") || 
                feedback.toLowerCase().includes("work on") || 
                feedback.toLowerCase().includes("could") || 
                feedback.toLowerCase().includes("should")
              )
              .slice(0, 3)
              .join("\n- "),
            study_advice: "1. Practice speaking on various topics for 10 minutes daily\n2. Record yourself and review for areas to improve\n3. Learn 5-10 new vocabulary words weekly\n4. Study example answers from high-scoring IELTS responses"
          };
          
          // If we couldn't extract strengths/areas from feedback, provide defaults
          if (!overallFeedback.strengths || overallFeedback.strengths === "-") {
            overallFeedback.strengths = "- Good conversational flow\n- Clear pronunciation\n- Appropriate responses to questions";
          }
          
          if (!overallFeedback.areas_for_improvement || overallFeedback.areas_for_improvement === "-") {
            overallFeedback.areas_for_improvement = "- Expand vocabulary for more precise expression\n- Work on reducing grammatical errors\n- Develop more complex sentence structures";
          }
          
          debugLog('[submitAllResponsesAsync] Generated overall feedback from API results');
        } else {
          // No feedback from API, use adjusted default scores
          const baseScore = Math.max(7.0 - (skippedCount / totalQuestions) * 2, 5.0);
          
          // Tailor the message based on whether questions were skipped or answered
          const skippedAllQuestions = skippedCount === totalQuestions;
          const completedWithoutAudioCount = Object.values(state.userResponses).filter(
            res => res.status === 'completed' && !res.audioBlob && !res.audio_url
          ).length;
          const answeredSomeQuestions = answeredCount > 0;
          const hasPartialAnswers = completedWithoutAudioCount > 0;
          
          let generalFeedback = "";
          if (skippedAllQuestions) {
            generalFeedback = "You skipped all questions. Consider attempting questions to get accurate feedback.";
          } else if (hasPartialAnswers && answeredSomeQuestions) {
            generalFeedback = "You attempted most questions and used 'Skip remaining time' for some. We've adjusted your score accordingly.";
          } else if (answeredSomeQuestions) {
            generalFeedback = "You answered some questions, but we couldn't generate detailed feedback. This might be due to audio processing issues.";
          } else {
            generalFeedback = "Unable to generate detailed feedback. Please retry with clearer audio recordings.";
          }
          
          // Calculate a better default score
          let adjustedBaseScore = baseScore;
          
          // If there are partial answers, apply a smaller penalty
          if (hasPartialAnswers) {
            const partialAnswerBonus = completedWithoutAudioCount / totalQuestions * 0.5;
            adjustedBaseScore = Math.min(baseScore + partialAnswerBonus, 6.5);
            debugLog(`[submitAllResponsesAsync] Applying partial answer bonus: ${partialAnswerBonus.toFixed(2)}, new base score: ${adjustedBaseScore.toFixed(2)}`);
          }
          
          // Apply IELTS rounding to all scores
          adjustedBaseScore = roundToHalf(adjustedBaseScore);
          
          // Set appropriate feedback quality descriptor
          const feedbackQuality = adjustedBaseScore >= 7.0 ? "excellent" : 
                               adjustedBaseScore >= 6.0 ? "good" :
                               adjustedBaseScore >= 5.0 ? "satisfactory" : "needs improvement";
          
          overallFeedback = {
            band_score: adjustedBaseScore,
            general_feedback: hasPartialAnswers 
              ? `${generalFeedback} Your overall band score is ${adjustedBaseScore.toFixed(1)}, which is ${feedbackQuality}.`
              : generalFeedback,
            fluency_coherence_score: adjustedBaseScore,
            lexical_resource_score: roundToHalf(adjustedBaseScore - 0.5),
            grammar_accuracy_score: adjustedBaseScore,
            pronunciation_score: roundToHalf(adjustedBaseScore + 0.5),
            overall_band_score: adjustedBaseScore,
            fluency_coherence_feedback: answeredSomeQuestions 
              ? "We couldn't properly assess your fluency with the recordings provided."
              : "Unable to assess fluency properly. Try answering questions to get feedback.",
            lexical_resource_feedback: answeredSomeQuestions
              ? "We couldn't properly analyze your vocabulary usage with the recordings provided."
              : "Unable to assess vocabulary properly. Try answering questions to get feedback.",
            grammar_accuracy_feedback: answeredSomeQuestions
              ? "We couldn't properly evaluate your grammar with the recordings provided."
              : "Unable to assess grammar properly. Try answering questions to get feedback.",
            pronunciation_feedback: answeredSomeQuestions
              ? "We couldn't properly assess your pronunciation with the recordings provided."
              : "Unable to assess pronunciation properly. Try answering questions to get feedback.",
            model_answer: "A model answer would include more specific examples and more complex grammatical structures.",
            band_scores: {
              fluency: adjustedBaseScore,
              lexical: roundToHalf(adjustedBaseScore - 0.5), 
              grammar: adjustedBaseScore,
              pronunciation: roundToHalf(adjustedBaseScore + 0.5),
              overall: adjustedBaseScore
            },
            strengths: hasPartialAnswers
              ? "- You attempted to answer questions even if you didn't use all available time\n- You engaged with the test process\n- You demonstrated willingness to communicate and respond"
              : (answeredSomeQuestions 
                ? "- You attempted to answer questions\n- You engaged with the test process\n- You completed the speaking assessment"
                : "- No responses to evaluate. Please attempt questions to receive meaningful feedback."),
            areas_for_improvement: hasPartialAnswers
              ? "- Try to use all available time for your responses\n- Expand your answers with examples and explanations\n- Practice speaking for longer durations to build confidence"
              : (answeredSomeQuestions
                ? "- Try to speak more clearly for better audio quality\n- Practice with the microphone before taking the test\n- Complete all questions for comprehensive feedback"
                : "- Try to answer questions rather than skipping them\n- Practice speaking even when uncertain\n- Build confidence in responding to questions"),
            study_advice: "1. Practice speaking on various topics for 10 minutes daily\n2. Record yourself and review for areas to improve\n3. Learn 5-10 new vocabulary words weekly\n4. Study example answers from high-scoring IELTS responses"
          };
          
          debugLog('[submitAllResponsesAsync] Using default feedback because no API feedback was available');
        }
      } catch (feedbackError) {
        console.error('[submitAllResponsesAsync] Error generating overall feedback:', feedbackError);
        
        // Ensure we have a fallback feedback object even if error occurs
        overallFeedback = {
          band_scores: {
            fluency: 7.0,
            lexical: 7.0,
            grammar: 7.0,
            pronunciation: 7.0,
            overall: 7.0
          },
          general_feedback: "Test completed. Sorry, detailed feedback could not be generated."
        };
      }
      
      // Update responses and mark test as completed
      console.log('[submitAllResponsesAsync] Generated feedback:', overallFeedback);
      console.log('[submitAllResponsesAsync] Generated bandScores:', overallFeedback?.band_scores);
      
      // Log the properly rounded scores
      if (overallFeedback?.band_scores) {
        const roundedScores = {
          fluency: overallFeedback.band_scores.fluency.toFixed(1),
          lexical: overallFeedback.band_scores.lexical.toFixed(1),
          grammar: overallFeedback.band_scores.grammar.toFixed(1),
          pronunciation: overallFeedback.band_scores.pronunciation.toFixed(1),
          overall: overallFeedback.band_scores.overall.toFixed(1)
        };
        console.log('[submitAllResponsesAsync] Rounded IELTS band scores:', roundedScores);
      }
      
      dispatch({
        type: 'SUBMIT_ALL_RESPONSES_SUCCESS', 
        payload: { 
          allFeedback: processedResponses,
          overallFeedback
        }
      });
      
    } catch (error) {
      console.error('[submitAllResponsesAsync] Error submitting responses:', error);
      dispatch({ 
        type: 'SUBMIT_ALL_RESPONSES_FAILURE', 
        payload: error instanceof Error ? error.message : 'Unknown error occurred.' 
      });
    }
  }, [state, dispatch, user, validateResponses, getSupabaseUserId, submitResponseAsync]);

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
    
    return <LoadingScreen stage={loadingStage} message={loadingMessage} />;
  }

  if (state.error) {
    return (
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
          );
    }
 
   if (!state.testId || !state.testInfo) { 
     return (
       <ErrorScreen 
         error="The test could not be loaded or does not exist."
         onBack={() => router.push('/tests')}
       />
     );
   }
  
    if (state.isTestCompleted) {
    return (
      <TestCompletedUI 
        allPartsFeedback={state.allPartsFeedback}
        router={router}
        testId={state.testId}
        userResponses={state.userResponses}
      />
    );
  }

  return (
    <>
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
    </>
  );
} 