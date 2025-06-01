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

  // START HELPER FUNCTIONS (defined inside SpeakingTestPage)
  const roundToHalf = (num: number): number => {
    return Math.round(num * 2) / 2;
  };

  const writeString = (view: DataView, offset: number, str: string): void => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  
  const convertToWav = (buffer: AudioBuffer): ArrayBuffer => {
    const numOfChannels = buffer.numberOfChannels;
    const length = buffer.length * numOfChannels * 2;
    const sampleRate = buffer.sampleRate;
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numOfChannels * 2, true);
    view.setUint16(32, numOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data'); // Corrected: Use writeString for 'data'
    view.setUint32(40, length, true);
    const output = new ArrayBuffer(header.byteLength + length);
    const outputView = new DataView(output);
    new Uint8Array(output, 0, header.byteLength).set(new Uint8Array(header));
    let offset = header.byteLength;
    const channelData = new Array(numOfChannels);
    for (let i = 0; i < numOfChannels; i++) {
      channelData[i] = buffer.getChannelData(i);
    }
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
        outputView.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    return output;
  };

  const createTestAudioBlob = async (): Promise<Blob> => {
     try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 440;
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      const sampleRate = 44100;
      const duration = 1;
      const frameCount = sampleRate * duration;
      const audioBuffer = audioContext.createBuffer(1, frameCount, sampleRate);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.5;
      }
      const blob = await new Promise<Blob>((resolve) => {
        const offlineContext = new OfflineAudioContext(1, frameCount, sampleRate);
        const bufferSource = offlineContext.createBufferSource();
        bufferSource.buffer = audioBuffer;
        bufferSource.connect(offlineContext.destination);
        bufferSource.start();
        offlineContext.startRendering().then((renderedBuffer) => {
          const wavData = convertToWav(renderedBuffer); 
          const wavBlob = new Blob([wavData], { type: 'audio/wav' });
          resolve(wavBlob);
        });
      });
      return blob;
    } catch (error) {
      console.error("Error creating test audio:", error);
      return new Blob([new Uint8Array(1024)], { type: 'audio/webm' });
    }
  };
  // END HELPER FUNCTIONS

  // Helper function to submit a single response
  const submitResponseAsync = useCallback(async (questionId: string, response: UserResponse): Promise<string | null> => {
    try {
      debugLog(`[submitResponseAsync] Submitting response for ${questionId}`);
      
      // Debug log to check response properties
      debugLog(`[submitResponseAsync] Response for ${questionId}: status=${response.status}, hasAudioBlob=${!!response.audioBlob}, hasAudioUrl=${!!response.audio_url}, hasTranscript=${!!response.transcript}`);
      
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
    debugLog('[submitAllResponsesAsync] Starting test submission process');

    // Only process if user is authenticated
    if (!user) {
      dispatch({ type: 'SET_ERROR', payload: 'You must be signed in to submit responses.' });
      router.push('/sign-in');
      return;
    }

    // Start submission process in UI
    dispatch({ type: 'SUBMIT_ALL_RESPONSES_START' });
    
    try {
      // Get authenticated Supabase ID
      const authenticatedSupabaseId = currentUser?.id || await getSupabaseUserId();
      
      if (!authenticatedSupabaseId) {
        throw new Error('Failed to get valid user ID');
      }
      
      // Update the authenticatedSupabaseId in the state
      dispatch({
        type: 'SET_AUTHENTICATED_ID',
        payload: authenticatedSupabaseId
      });
      
      // STEP 1: Filter for only answered questions with actual audio
      const answeredResponses = Object.entries(state.userResponses)
        .filter(([_, response]: [string, UserResponse]) => {
          // Include only completed responses with audio data
          return response.status === 'completed' && (!!response.audioBlob || !!response.audio_url);
        })
        .reduce((acc, [id, response]: [string, UserResponse]) => ({...acc, [id]: response}), {} as Record<string, UserResponse>);
      
      // Track skipped questions separately
      const skippedQuestions = Object.entries(state.userResponses)
        .filter(([_, response]: [string, UserResponse]) => response.status === 'skipped')
        .map(([id, _]: [string, UserResponse]) => id);
      
      debugLog(`[submitAllResponsesAsync] Processing ${Object.keys(answeredResponses).length} answered questions and ${skippedQuestions.length} skipped questions`);
      
      // STEP 2: First, upload all audio files to storage and save responses to database
      const processedResponses: Record<string, UserResponse> = {};
      
      for (const [questionId, response] of Object.entries(state.userResponses)) {
        try {
          // Create a copy of the response we'll modify
          const processedResponse = { ...response };
          
          // For questions with audio, upload to storage
          if (processedResponse.status === 'completed' && (processedResponse.audioBlob || processedResponse.audio_url)) {
            if (processedResponse.audioBlob && !processedResponse.audio_url) {
              debugLog(`[submitAllResponsesAsync] Uploading audio for question ${questionId}`);
              try {
                const audioUrl = await storageService.uploadRecording(
                  processedResponse.audioBlob,
                  `${authenticatedSupabaseId}/${questionId}.webm`
                );
                if (audioUrl) {
                  processedResponse.audio_url = audioUrl;
                }
              } catch (uploadError) {
                console.error(`[submitAllResponsesAsync] Error uploading audio:`, uploadError);
                // Continue with blob if upload fails
              }
            }
          }
          
          // Save all responses (answered and skipped) to database 
          const submissionResult = await submitResponseAsync(questionId, processedResponse);
          
          if (submissionResult) {
            processedResponses[questionId] = {
              ...processedResponse,
              id: submissionResult
            };
          }
        } catch (error) {
          console.error(`[submitAllResponsesAsync] Error processing question ${questionId}:`, error);
        }
      }
      
      // STEP 3: Transcribe all answered questions in parallel
      const transcriptionPromises = Object.entries(answeredResponses).map(async ([questionId, response]: [string, UserResponse]) => {
        try {
          debugLog(`[submitAllResponsesAsync] Transcribing audio for question ${questionId}`);
          
          // Skip transcription if we already have a transcript
          if (response.transcript) {
            return {
              questionId,
              transcript: response.transcript
            };
          }
          
          // Prepare audio data for transcription
          const audioData = response.audioBlob || response.audio_url;
          if (!audioData) {
            throw new Error('No audio data available for transcription');
          }
          
          // Call the transcription API
          let transcribeResponse;
          if (response.audioBlob) {
            const extension = response.audioBlob.type.split('/')[1] || 'bin';
            const filename = `audio-${questionId}-${Date.now()}.${extension}`;
            
            const formData = new FormData();
            formData.append('file', response.audioBlob, filename);
            formData.append('userId', authenticatedSupabaseId);
            formData.append('questionId', questionId);
            
            transcribeResponse = await fetch('/api/transcribe', {
              method: 'POST',
              body: formData
            });
          } else if (response.audio_url) {
            const isDataUrl = response.audio_url.startsWith('data:');
            
            transcribeResponse = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioUrl: response.audio_url,
                isDataUrl,
                userId: authenticatedSupabaseId,
                questionId
              })
            });
          }
          
          if (!transcribeResponse?.ok) {
            throw new Error(`Transcription failed with status: ${transcribeResponse?.status}`);
          }
          
          const transcribeData = await transcribeResponse.json();
          return {
            questionId,
            transcript: transcribeData.text
          };
        } catch (error) {
          console.error(`[submitAllResponsesAsync] Transcription error for ${questionId}:`, error);
          return {
            questionId,
            transcript: "[Transcription failed]"
          };
        }
      });
      
      // Wait for all transcriptions to complete
      const transcriptionResults = await Promise.all(transcriptionPromises);
      
      // Update processedResponses with transcripts
      transcriptionResults.forEach(result => {
        if (processedResponses[result.questionId]) {
          processedResponses[result.questionId].transcript = result.transcript;
        }
      });
      
      // STEP 4: Build combined transcript for scoring
      const combinedTranscriptData = transcriptionResults.map(result => {
        const question = state.questions.find(q => q.id === result.questionId);
        if (!question) return null;
        
        return {
          questionId: result.questionId,
          partNumber: question.part_number,
          questionText: question.question_text,
          questionType: question.question_type || `part${question.part_number}`,
          transcript: result.transcript
        };
      }).filter(Boolean);
      
      // STEP 5: Get a single evaluation from GPT
      console.log(`[API call] Sending combined transcript data for scoring`);
      
      const scorePayload = {
        userId: authenticatedSupabaseId,
        testId: state.testId,
        transcriptData: combinedTranscriptData,
        skippedQuestions: skippedQuestions.map(qId => {
          const question = state.questions.find(q => q.id === qId);
          return {
            questionId: qId,
            partNumber: question?.part_number,
            questionText: question?.question_text
          };
        }),
        totalQuestions: state.questions.length
      };
      
      const scoreResponse = await fetch('/api/score-complete-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scorePayload)
      });
      
      if (!scoreResponse.ok) {
        throw new Error(`Scoring failed with status: ${scoreResponse.status}`);
      }
      
      const scoreData = await scoreResponse.json();
      
      // Create a properly formed feedback object with fallbacks for missing fields
      const overallFeedback: FeedbackResult = {
        band_score: scoreData.feedback?.band_score ?? 7.0,
        overall_band_score: scoreData.feedback?.overall_band_score ?? 7.0,
        fluency_coherence_score: scoreData.feedback?.fluency_coherence_score ?? 7.0,
        lexical_resource_score: scoreData.feedback?.lexical_resource_score ?? 7.0,
        grammar_accuracy_score: scoreData.feedback?.grammar_accuracy_score ?? 7.0,
        pronunciation_score: scoreData.feedback?.pronunciation_score ?? 7.0,
        general_feedback: scoreData.feedback?.general_feedback ?? "Test completed successfully.",
        fluency_coherence_feedback: scoreData.feedback?.fluency_coherence_feedback ?? "",
        lexical_resource_feedback: scoreData.feedback?.lexical_resource_feedback ?? "",
        grammar_accuracy_feedback: scoreData.feedback?.grammar_accuracy_feedback ?? "",
        pronunciation_feedback: scoreData.feedback?.pronunciation_feedback ?? "",
        model_answer: scoreData.feedback?.model_answer ?? "",
        band_scores: scoreData.feedback?.band_scores ?? { 
          fluency: 7.0, lexical: 7.0, grammar: 7.0, pronunciation: 7.0, overall: 7.0 
        },
        strengths: scoreData.feedback?.strengths ?? "",
        areas_for_improvement: scoreData.feedback?.areas_for_improvement ?? "",
        study_advice: scoreData.feedback?.study_advice ?? ""
      };
      
      // Apply individual question feedback
      if (scoreData.questionFeedback) {
        Object.entries(scoreData.questionFeedback).forEach(([questionId, feedbackData]) => {
          if (processedResponses[questionId]) {
            // Create a new feedback object without using spread operator on unknown type
            const data = feedbackData as Record<string, any>;
            const questionFeedback: FeedbackResult = {
              band_score: typeof data.band_score === 'number' ? data.band_score : 7.0,
              overall_band_score: typeof data.overall_band_score === 'number' ? data.overall_band_score : 7.0,
              fluency_coherence_score: typeof data.fluency_coherence_score === 'number' ? data.fluency_coherence_score : 7.0,
              lexical_resource_score: typeof data.lexical_resource_score === 'number' ? data.lexical_resource_score : 7.0, 
              grammar_accuracy_score: typeof data.grammar_accuracy_score === 'number' ? data.grammar_accuracy_score : 7.0,
              pronunciation_score: typeof data.pronunciation_score === 'number' ? data.pronunciation_score : 7.0,
              general_feedback: typeof data.general_feedback === 'string' ? data.general_feedback : '',
              fluency_coherence_feedback: typeof data.fluency_coherence_feedback === 'string' ? data.fluency_coherence_feedback : '',
              lexical_resource_feedback: typeof data.lexical_resource_feedback === 'string' ? data.lexical_resource_feedback : '',
              grammar_accuracy_feedback: typeof data.grammar_accuracy_feedback === 'string' ? data.grammar_accuracy_feedback : '',
              pronunciation_feedback: typeof data.pronunciation_feedback === 'string' ? data.pronunciation_feedback : '',
              model_answer: typeof data.model_answer === 'string' ? data.model_answer : '',
              band_scores: data.band_scores || { fluency: 7.0, lexical: 7.0, grammar: 7.0, pronunciation: 7.0, overall: 7.0 },
              strengths: typeof data.strengths === 'string' ? data.strengths : '',
              areas_for_improvement: typeof data.areas_for_improvement === 'string' ? data.areas_for_improvement : '',
              study_advice: typeof data.study_advice === 'string' ? data.study_advice : ''
            };
            processedResponses[questionId].feedback = questionFeedback;
          }
        });
      }
      
      // STEP 6: Update state with results
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
  }, [state, dispatch, user, currentUser, router, getSupabaseUserId, submitResponseAsync]);

  // Function to ensure recording is complete before showing submission dialog
  const handleSubmitTest = useCallback(async () => {
    // Check if recording is active by looking at question timer
    const isRecordingActive = state.questionTimer && state.questionTimer > 0;

    if (isRecordingActive) {
      // Notify user that recording will be finished
      console.log('[handleSubmitTest] Recording in progress, finishing current recording first');
      
      // Dispatch a safe action to stop recording
      dispatch({ type: 'SET_QUESTION_TIMER', payload: 0 });
      
      // Wait a small delay for recording to finish
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Start submission process
    dispatch({ type: 'SUBMIT_ALL_RESPONSES_START' });
    await submitAllResponsesAsync();
  }, [state.questionTimer, dispatch, submitAllResponsesAsync]);

  // Render logic using state from reducer
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-white to-gray-50">
        <div className="w-full max-w-md px-6">
          {/* App logo */}
          <div className="flex justify-center mb-12">
            <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" x2="12" y1="19" y2="22"></line>
              </svg>
            </div>
          </div>
          
          {/* Loading animation */}
          <div className="text-center mb-10">
            <h1 className="text-2xl font-medium text-gray-900 mb-2">Verifying your account</h1>
            <p className="text-gray-500">Please wait while we check your login status</p>
          </div>
          
          {/* Pulse animation */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full bg-blue-500"></div>
              </div>
              <div className="absolute inset-0 rounded-full bg-blue-500 opacity-25 animate-ping"></div>
            </div>
          </div>
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
          handleSubmitTest={handleSubmitTest}
        />
      ) : (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-white to-gray-50">
          <div className="w-full max-w-md px-6">
            {/* App logo */}
            <div className="flex justify-center mb-12">
              <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" x2="12" y1="19" y2="22"></line>
                </svg>
              </div>
            </div>
            
            {/* Loading animation */}
            <div className="text-center mb-10">
              <h1 className="text-2xl font-medium text-gray-900 mb-2">Loading Test Questions</h1>
              <p className="text-gray-500">Just a moment while we prepare everything</p>
            </div>
            
            {/* Shimmer loading effect */}
            <div className="space-y-4">
              <div className="h-12 bg-gray-200 rounded-lg animate-pulse"></div>
              <div className="h-24 bg-gray-200 rounded-lg animate-pulse"></div>
              <div className="h-12 bg-gray-200 rounded-lg animate-pulse"></div>
              <div className="flex justify-end mt-4">
                <div className="h-10 w-32 bg-gray-200 rounded-lg animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 