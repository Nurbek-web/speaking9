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
        const currentProcessedResponse = processedResponses[questionId];
        const originalResponse = state.userResponses[questionId]; // Get original response for status check

        // Skip actual skipped questions
        if (originalResponse && originalResponse.status === 'skipped') {
          debugLog(`[submitAllResponsesAsync V2] Question ${questionId} was originally skipped, ensuring transcript reflects this.`);
          processedResponses[questionId] = {
            ...currentProcessedResponse,
            transcript: "[This question was skipped by the user]",
            status: 'skipped' // Ensure status is correctly marked as skipped
          };
          continue;
        }
        
        const question = state.questions.find(q => q.id === questionId);
        if (!question) {
          console.error(`[submitAllResponsesAsync V2] Question ${questionId} not found in state.questions`);
          continue;
        }

        // Check for audio data in the currentProcessedResponse for the second pass
        const hasAudioBlobInPass2 = !!currentProcessedResponse.audioBlob;
        const hasAudioUrlInPass2 = !!currentProcessedResponse.audio_url;
        const hasNoAudioInPass2 = !hasAudioBlobInPass2 && !hasAudioUrlInPass2;

        debugLog(`[submitAllResponsesAsync V2] Audio check for question ${questionId}: hasBlob=${hasAudioBlobInPass2}, hasUrl=${hasAudioUrlInPass2}, status=${currentProcessedResponse.status}`);

        // If it's not a deliberately skipped question and has no audio, generate test audio.
        // This applies even if status became 'error' or 'local' in first pass, if original intent was to answer.
        if (hasNoAudioInPass2 && originalResponse && originalResponse.status !== 'skipped') {
          debugLog(`[submitAllResponsesAsync V2] Generating test audio for question ${questionId} (original status: ${originalResponse.status})`);
          try {
            const testAudioBlob = await createTestAudioBlob();
            const testUrl = URL.createObjectURL(testAudioBlob);
            // IMPORTANT: Update the currentProcessedResponse that will be used for transcription
            currentProcessedResponse.audioBlob = testAudioBlob;
            currentProcessedResponse.audio_url = testUrl;
            processedResponses[questionId].audioBlob = testAudioBlob; // also update the entry in the main map
            processedResponses[questionId].audio_url = testUrl;
            debugLog(`[submitAllResponsesAsync V2] Successfully generated test audio for question ${questionId}`);
          } catch (audioError) {
            debugLog(`[submitAllResponsesAsync V2] Error generating test audio for ${questionId}: ${audioError}`);
            currentProcessedResponse.audio_url = `data:audio/webm;base64,MINIMAL_AUDIO_${Date.now()}`;
            processedResponses[questionId].audio_url = currentProcessedResponse.audio_url;
          }
        }

        // Outer try for this specific question's processing (transcription and scoring)
        try {
          let transcript = currentProcessedResponse.transcript;
          // If status is 'skipped' (e.g. from originalResponse or set above), ensure transcript reflects it
          if (currentProcessedResponse.status === 'skipped') {
            transcript = "[This question was skipped by the user]";
            processedResponses[questionId] = { ...processedResponses[questionId], transcript };
            // Skip actual API calls for transcription and scoring if it's genuinely skipped.
            // However, we still want overall feedback to account for it.
            // The feedbackResults for this questionId will remain empty.
            debugLog(`[submitAllResponsesAsync V2] Question ${questionId} is skipped. No API calls for transcription/scoring.`);
            continue; // Continue to next question in the loop
          }

          debugLog(`[submitAllResponsesAsync V2] Audio data for question ${questionId}: audioBlob: ${!!currentProcessedResponse.audioBlob}, audio_url: ${!!currentProcessedResponse.audio_url}, response status: ${currentProcessedResponse.status}`);

          if (!transcript) {
            try {
              debugLog(`[submitAllResponsesAsync V2] Transcribing audio for question ${questionId}`);
              const audioUrl = currentProcessedResponse.audio_url;
              const audioBlob = currentProcessedResponse.audioBlob;
              const isDataUrl = audioUrl?.startsWith('data:');
              console.log(`[API call] Calling transcribe API for question ${questionId}. Has URL: ${!!audioUrl}, Has blob: ${!!audioBlob}, isDataUrl: ${isDataUrl}`);
              let transcribeResponse;
              if (audioBlob) {
                console.log(`[API call] Sending blob directly, size: ${Math.round(audioBlob.size/1024)}KB, type: ${audioBlob.type}`);
                // Ensure filename extension matches blob type for clarity
                const extension = audioBlob.type.split('/')[1] || 'bin'; // e.g., 'wav' from 'audio/wav'
                const filename = `audio-${questionId}-${Date.now()}.${extension}`; // e.g., audio-....wav

                const formData = new FormData();
                formData.append('file', audioBlob, filename); // Send audioBlob as is, with its original type
                formData.append('userId', authenticatedSupabaseId);
                formData.append('questionId', questionId);
                
                console.log(`[API call] Sending FormData with file: ${filename}, type: ${audioBlob.type}`);
                transcribeResponse = await fetch('/api/transcribe', {
                  method: 'POST',
                  body: formData
                });
              } else if (audioUrl) {
                console.log(`[API call] Sending URL: ${audioUrl.substring(0, 50)}...`);
                const isPlaceholder = audioUrl.includes('MINIMAL_AUDIO_') || audioUrl.includes('ABBREVIATED_') || audioUrl.includes('data:audio/webm;base64,AAAAAAAA');
                const requestBody = {
                  audioUrl,
                  isDataUrl: isDataUrl || audioUrl.startsWith('data:'),
                  userId: authenticatedSupabaseId,
                  questionId,
                  isPlaceholder: isPlaceholder
                };
                console.log(`[API call] Request body:`, JSON.stringify(requestBody).substring(0, 100) + '...');
                transcribeResponse = await fetch('/api/transcribe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(requestBody)
                });
              } else {
                console.error(`[API call] No audio data available for transcription. Creating synthetic request.`);
                const syntheticUrl = `data:audio/webm;base64,SYNTHETIC_${Date.now()}`;
                const requestBody = {
                  audioUrl: syntheticUrl,
                  isDataUrl: true,
                  isSynthetic: true,
                  userId: authenticatedSupabaseId,
                  questionId
                };
                console.log(`[API call] Sending synthetic request:`, JSON.stringify(requestBody).substring(0, 100) + '...');
                transcribeResponse = await fetch('/api/transcribe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(requestBody)
                });
              }
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
              processedResponses[questionId] = { ...processedResponses[questionId], transcript };
              debugLog(`[submitAllResponsesAsync V2] Successfully transcribed audio for question ${questionId}: ${transcript.substring(0, 50)}...`);
            } catch (transcriptionError) {
              console.error(`[submitAllResponsesAsync V2] Transcription error for question ${questionId}:`, transcriptionError);
              transcript = "[Audio transcription failed. This is a placeholder transcript for scoring purposes.]";
              processedResponses[questionId] = { ...processedResponses[questionId], transcript };
            }
          }
          
          // Now get a score for this transcript - always attempt scoring
          if (!transcript) { // If still no transcript (e.g. transcription failed and fallback was missed)
            transcript = "[Missing transcript. This is a generated placeholder for API processing.]";
            processedResponses[questionId] = { ...processedResponses[questionId], transcript };
          }
          
          // Inner try for scoring
          try {
            debugLog(`[submitAllResponsesAsync V2] Scoring transcript for question ${questionId}`);
            const scorePayload = {
              userId: authenticatedSupabaseId,
              questionId,
              questionText: question.question_text,
              questionType: question.question_type || `part${question.part_number}`,
              partNumber: question.part_number, // Ensure this is available from question object
              transcript,
              audioUrl: currentProcessedResponse.audio_url,
              isPlaceholder: transcript.includes("[") && transcript.includes("]"),
              responseStatus: currentProcessedResponse.status,
              hasAudioData: !!(currentProcessedResponse.audioBlob || currentProcessedResponse.audio_url)
            };
            console.log(`[API payload] Score API payload:`, JSON.stringify(scorePayload).substring(0, 200) + '...');
            console.log(`[API call] Making score API call for question ${questionId}`);
            const scoreResponse = await fetch('/api/score', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
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
            feedbackResults[questionId] = scoreData.feedback;
            processedResponses[questionId] = { ...processedResponses[questionId], feedback: scoreData.feedback };
            debugLog(`[submitAllResponsesAsync V2] Successfully scored transcript for question ${questionId}`);
          } catch (scoringError) {
            console.error(`[submitAllResponsesAsync V2] Scoring error for question ${questionId}:`, scoringError);
          }
        // This is the CATCH for the outer TRY that wraps a single question's processing
        } catch (generalProcessingError) { 
          console.error(`[submitAllResponsesAsync V2] General processing error for question ${questionId}:`, generalProcessingError);
          // Log and continue to the next question in the loop
        }
      } // End of the FOR loop

      // Generate overall feedback by combining individual question feedback
      let overallFeedback: FeedbackResult | null = null;
      try {
        debugLog('[submitAllResponsesAsync V2] Generating overall feedback');
        const questionsWithFeedback = Object.keys(feedbackResults).length;
        const totalQuestions = state.questions.length;
        if (questionsWithFeedback > 0) {
          let totalBandScore = 0;
          let totalFluency = 0;
          let totalLexical = 0;
          let totalGrammar = 0;
          let totalPronunciation = 0;
          const allFeedbacks: FeedbackResult[] = Object.values(feedbackResults);
          allFeedbacks.forEach((feedback: FeedbackResult) => {
            totalBandScore += feedback.band_score || 0;
            totalFluency += feedback.fluency_coherence_score || 0;
            totalLexical += feedback.lexical_resource_score || 0;
            totalGrammar += feedback.grammar_accuracy_score || 0;
            totalPronunciation += feedback.pronunciation_score || 0;
          });
          const avgBandScore = questionsWithFeedback > 0 ? totalBandScore / questionsWithFeedback : 7.0;
          const avgFluency = questionsWithFeedback > 0 ? totalFluency / questionsWithFeedback : 7.0;
          const avgLexical = questionsWithFeedback > 0 ? totalLexical / questionsWithFeedback : 7.0;
          const avgGrammar = questionsWithFeedback > 0 ? totalGrammar / questionsWithFeedback : 7.0;
          const avgPronunciation = questionsWithFeedback > 0 ? totalPronunciation / questionsWithFeedback : 7.0;
          const trulySkippedCount = skippedQuestions.length; // Ensure skippedQuestions is in scope
          const completedWithoutAudioCount = Object.values(state.userResponses).filter(
            res => res.status === 'completed' && !res.audioBlob && !res.audio_url
          ).length;
          const skippedRatio = trulySkippedCount / totalQuestions;
          const incompleteRatio = completedWithoutAudioCount / totalQuestions;
          const skippedPenalty = skippedRatio > 0.5 ? Math.min(skippedRatio * 2, 2.0) : skippedRatio;
          const incompletePenalty = incompleteRatio * 0.5;
          const totalPenalty = Math.min(skippedPenalty + incompletePenalty, 2.0);
          debugLog(`[submitAllResponsesAsync V2] Score adjustment factors - skipped: ${skippedRatio.toFixed(2)}, incomplete: ${incompleteRatio.toFixed(2)}, total penalty: ${totalPenalty.toFixed(2)}`);
          const scoreAdjustment = totalPenalty;
          const adjustedBandScore = roundToHalf(avgBandScore - scoreAdjustment);
          const adjustedFluency = roundToHalf(avgFluency - scoreAdjustment);
          const adjustedLexical = roundToHalf(avgLexical - scoreAdjustment);
          const adjustedGrammar = roundToHalf(avgGrammar - scoreAdjustment);
          const adjustedPronunciation = roundToHalf(avgPronunciation - scoreAdjustment);
          const allGeneralFeedback = allFeedbacks.map((f: FeedbackResult) => f.general_feedback || '').filter(Boolean);
          const allFluencyFeedback = allFeedbacks.map((f: FeedbackResult) => f.fluency_coherence_feedback || '').filter(Boolean);
          const allLexicalFeedback = allFeedbacks.map((f: FeedbackResult) => f.lexical_resource_feedback || '').filter(Boolean);
          const allGrammarFeedback = allFeedbacks.map((f: FeedbackResult) => f.grammar_accuracy_feedback || '').filter(Boolean);
          const allPronunciationFeedback = allFeedbacks.map((f: FeedbackResult) => f.pronunciation_feedback || '').filter(Boolean);
          const feedbackQuality = adjustedBandScore >= 7.0 ? "excellent" : adjustedBandScore >= 6.0 ? "good" : adjustedBandScore >= 5.0 ? "satisfactory" : "needs improvement";
          overallFeedback = {
            band_score: adjustedBandScore,
            overall_band_score: adjustedBandScore,
            fluency_coherence_score: adjustedFluency,
            lexical_resource_score: adjustedLexical,
            grammar_accuracy_score: adjustedGrammar,
            pronunciation_score: adjustedPronunciation,
            general_feedback: allGeneralFeedback.length > 0 ? `${allGeneralFeedback[0]} Your overall score is ${adjustedBandScore.toFixed(1)}, which is ${feedbackQuality}.` : `Your responses showed ${feedbackQuality} communication skills overall. Your IELTS band score is ${adjustedBandScore.toFixed(1)}.`,            fluency_coherence_feedback: allFluencyFeedback.length > 0 ? allFluencyFeedback[0] : "You maintained reasonable fluency throughout your answers.",
            lexical_resource_feedback: allLexicalFeedback.length > 0 ? allLexicalFeedback[0] : "You used appropriate vocabulary to express your ideas.",
            grammar_accuracy_feedback: allGrammarFeedback.length > 0 ? allGrammarFeedback[0] : "You demonstrated acceptable grammar with some errors that didn't impede understanding.",
            pronunciation_feedback: allPronunciationFeedback.length > 0 ? allPronunciationFeedback[0] : "Your pronunciation was generally clear and intelligible.",
            model_answer: "A model answer would include more specific examples and more complex grammatical structures.",
            band_scores: { fluency: adjustedFluency, lexical: adjustedLexical, grammar: adjustedGrammar, pronunciation: adjustedPronunciation, overall: adjustedBandScore },
            strengths: "- " + allFeedbacks.flatMap((f: FeedbackResult) => [f.fluency_coherence_feedback, f.lexical_resource_feedback, f.grammar_accuracy_feedback, f.pronunciation_feedback]).filter(Boolean).filter(feedback => feedback && (feedback.toLowerCase().includes("good") || feedback.toLowerCase().includes("well") || feedback.toLowerCase().includes("strong"))).slice(0, 3).join("\n- "),
            areas_for_improvement: "- " + allFeedbacks.flatMap((f: FeedbackResult) => [f.fluency_coherence_feedback, f.lexical_resource_feedback, f.grammar_accuracy_feedback, f.pronunciation_feedback]).filter(Boolean).filter(feedback => feedback && (feedback.toLowerCase().includes("improve") || feedback.toLowerCase().includes("work on") || feedback.toLowerCase().includes("could") || feedback.toLowerCase().includes("should"))).slice(0, 3).join("\n- "),
            study_advice: "1. Practice speaking on various topics for 10 minutes daily\n2. Record yourself and review for areas to improve\n3. Learn 5-10 new vocabulary words weekly\n4. Study example answers from high-scoring IELTS responses"
          };
          if (!overallFeedback.strengths || overallFeedback.strengths === "-") { overallFeedback.strengths = "- Good conversational flow\n- Clear pronunciation\n- Appropriate responses to questions"; }
          if (!overallFeedback.areas_for_improvement || overallFeedback.areas_for_improvement === "-") { overallFeedback.areas_for_improvement = "- Expand vocabulary for more precise expression\n- Work on reducing grammatical errors\n- Develop more complex sentence structures"; }
          debugLog('[submitAllResponsesAsync V2] Generated overall feedback from API results');
        } else {
          const baseScore = Math.max(7.0 - (skippedQuestions.length / totalQuestions) * 2, 5.0); // Ensure skippedQuestions is in scope
          const answeredCount = Object.values(state.userResponses).filter(res => res.status === 'completed' || res.status === 'in_progress').length;
          const completedWithoutAudioCount = Object.values(state.userResponses).filter(res => res.status === 'completed' && !res.audioBlob && !res.audio_url).length;
          const skippedAllQuestions = skippedQuestions.length === totalQuestions;
          const answeredSomeQuestions = answeredCount > 0;
          const hasPartialAnswers = completedWithoutAudioCount > 0;
          let generalFeedback = "";
          if (skippedAllQuestions) { generalFeedback = "You skipped all questions. Consider attempting questions to get accurate feedback."; }
          else if (hasPartialAnswers && answeredSomeQuestions) { generalFeedback = "You attempted most questions and used 'Skip remaining time' for some. We've adjusted your score accordingly."; }
          else if (answeredSomeQuestions) { generalFeedback = "You answered some questions, but we couldn't generate detailed feedback. This might be due to audio processing issues."; }
          else { generalFeedback = "Unable to generate detailed feedback. Please retry with clearer audio recordings."; }
          let adjustedBaseScore = baseScore;
          if (hasPartialAnswers) {
            const partialAnswerBonus = completedWithoutAudioCount / totalQuestions * 0.5;
            adjustedBaseScore = Math.min(baseScore + partialAnswerBonus, 6.5);
            debugLog(`[submitAllResponsesAsync V2] Applying partial answer bonus: ${partialAnswerBonus.toFixed(2)}, new base score: ${adjustedBaseScore.toFixed(2)}`);
          }
          adjustedBaseScore = roundToHalf(adjustedBaseScore);
          const feedbackQuality = adjustedBaseScore >= 7.0 ? "excellent" : adjustedBaseScore >= 6.0 ? "good" : adjustedBaseScore >= 5.0 ? "satisfactory" : "needs improvement";
          overallFeedback = {
            band_score: adjustedBaseScore,
            general_feedback: hasPartialAnswers ? `${generalFeedback} Your overall band score is ${adjustedBaseScore.toFixed(1)}, which is ${feedbackQuality}.` : generalFeedback,
            fluency_coherence_score: adjustedBaseScore,
            lexical_resource_score: roundToHalf(adjustedBaseScore - 0.5),
            grammar_accuracy_score: adjustedBaseScore,
            pronunciation_score: roundToHalf(adjustedBaseScore + 0.5),
            overall_band_score: adjustedBaseScore,
            fluency_coherence_feedback: answeredSomeQuestions ? "We couldn't properly assess your fluency with the recordings provided." : "Unable to assess fluency properly. Try answering questions to get feedback.",
            lexical_resource_feedback: answeredSomeQuestions ? "We couldn't properly analyze your vocabulary usage with the recordings provided." : "Unable to assess vocabulary properly. Try answering questions to get feedback.",
            grammar_accuracy_feedback: answeredSomeQuestions ? "We couldn't properly evaluate your grammar with the recordings provided." : "Unable to assess grammar properly. Try answering questions to get feedback.",
            pronunciation_feedback: answeredSomeQuestions ? "We couldn't properly assess your pronunciation with the recordings provided." : "Unable to assess pronunciation properly. Try answering questions to get feedback.",
            model_answer: "A model answer would include more specific examples and more complex grammatical structures.",
            band_scores: { fluency: adjustedBaseScore, lexical: roundToHalf(adjustedBaseScore - 0.5), grammar: adjustedBaseScore, pronunciation: roundToHalf(adjustedBaseScore + 0.5), overall: adjustedBaseScore },
            strengths: hasPartialAnswers ? "- You attempted to answer questions even if you didn't use all available time\n- You engaged with the test process\n- You demonstrated willingness to communicate and respond" : (answeredSomeQuestions ? "- You attempted to answer questions\n- You engaged with the test process\n- You completed the speaking assessment" : "- No responses to evaluate. Please attempt questions to receive meaningful feedback."),
            areas_for_improvement: hasPartialAnswers ? "- Try to use all available time for your responses\n- Expand your answers with examples and explanations\n- Practice speaking for longer durations to build confidence" : (answeredSomeQuestions ? "- Try to speak more clearly for better audio quality\n- Practice with the microphone before taking the test\n- Complete all questions for comprehensive feedback" : "- Try to answer questions rather than skipping them\n- Practice speaking even when uncertain\n- Build confidence in responding to questions"),
            study_advice: "1. Practice speaking on various topics for 10 minutes daily\n2. Record yourself and review for areas to improve\n3. Learn 5-10 new vocabulary words weekly\n4. Study example answers from high-scoring IELTS responses"
          };
          debugLog('[submitAllResponsesAsync V2] Using default feedback because no API feedback was available');
        }
      } catch (feedbackError) {
        console.error('[submitAllResponsesAsync V2] Error generating overall feedback:', feedbackError);
        overallFeedback = {
          band_scores: { fluency: 7.0, lexical: 7.0, grammar: 7.0, pronunciation: 7.0, overall: 7.0 },
          general_feedback: "Test completed. Sorry, detailed feedback could not be generated."
        };
      }
      
      // Update responses and mark test as completed
      console.log('[submitAllResponsesAsync V2] Generated feedback:', overallFeedback);
      console.log('[submitAllResponsesAsync V2] Generated bandScores:', overallFeedback?.band_scores);
      
      if (overallFeedback?.band_scores) {
        const roundedScores = {
          fluency: overallFeedback.band_scores.fluency.toFixed(1),
          lexical: overallFeedback.band_scores.lexical.toFixed(1),
          grammar: overallFeedback.band_scores.grammar.toFixed(1),
          pronunciation: overallFeedback.band_scores.pronunciation.toFixed(1),
          overall: overallFeedback.band_scores.overall.toFixed(1)
        };
        console.log('[submitAllResponsesAsync V2] Rounded IELTS band scores:', roundedScores);
      }
      
      dispatch({
        type: 'SUBMIT_ALL_RESPONSES_SUCCESS', 
        payload: { 
          allFeedback: processedResponses,
          overallFeedback
        }
      });
    } catch (error) {
      console.error('[submitAllResponsesAsync V2] Error submitting responses:', error);
      dispatch({ 
        type: 'SUBMIT_ALL_RESPONSES_FAILURE', 
        payload: error instanceof Error ? error.message : 'Unknown error occurred.' 
      });
    }
  }, [state, dispatch, user, currentUser, validateResponses, getSupabaseUserId, submitResponseAsync]);

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