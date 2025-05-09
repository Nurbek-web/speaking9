'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useAuth } from '@/context/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import { 
  Loader2, 
  Mic, 
  Square, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  SkipForward, 
  MicOff,
  ChevronRight,
  ChevronLeft,
  Send,
  X,
  Lightbulb,
  Pause,
  FastForward,
  ChevronsRight,
  Clock
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import storageService from '@/lib/storage'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import Image from 'next/image'

// Types
type TestQuestion = {
  id: string
  part_number: number
  question_number: number
  sequence_number: number
  question_text: string
  question_type: 'standard' | 'cue_card'
  topic?: string
  preparation_time_seconds?: number
  speaking_time_seconds: number
}

type TestInfo = {
  id: string
  title: string
  description: string | null
  part1_duration_seconds?: number;
  part2_duration_seconds?: number;
  part2_preparation_seconds?: number;
  part3_duration_seconds?: number;
}

type UserResponse = {
  id?: string;
  test_question_id?: string;
  status: 'not_started' | 'in_progress' | 'completed';
  audio_url?: string;
  transcript?: string;
  audioBlob?: Blob;
}

type FeedbackResult = {
  fluency_coherence_score: number
  lexical_resource_score: number
  grammar_accuracy_score: number
  pronunciation_score: number
  overall_band_score: number
  general_feedback: string
  fluency_coherence_feedback: string
  lexical_resource_feedback: string
  grammar_accuracy_feedback: string
  pronunciation_feedback: string
  model_answer: string
}

export default function SpeakingTestPage() {
  const router = useRouter()
  const params = useParams()
  // console.log('[SpeakingTestPage] Initial params:', params); // Keep for debugging if needed
  const { user } = useAuth()
  
  const supabase = useMemo(() => createClientComponentClient(), [])
  
  const testId = useMemo(() => {
    // console.log('[SpeakingTestPage] Computing testId. params.testId:', params.testId, 'Type:', typeof params.testId);
    let potentialId = params.testId as string | string[] | undefined;
    if (Array.isArray(potentialId)) {
      // console.warn('[SpeakingTestPage] testId from params is an array, using first element:', potentialId);
      potentialId = potentialId[0];
    }
    // console.log('[SpeakingTestPage] potentialId (stringified):', String(potentialId), 'Type:', typeof potentialId);
    // If the potentialId is the literal string "undefined", treat it as actually undefined.
    if (typeof potentialId === 'string' && potentialId.toLowerCase() === 'undefined') {
      // console.warn('[SpeakingTestPage] Corrected testId from string "undefined" to actual undefined');
      return undefined;
    }
    return potentialId as string | undefined; // Cast, as we've handled array and "undefined" string
  }, [params.testId]);
  // console.log('[SpeakingTestPage] Memoized testId:', testId, 'Type:', typeof testId);
  
  // General state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testInfo, setTestInfo] = useState<TestInfo | null>(null)
  const [questions, setQuestions] = useState<TestQuestion[]>([])
  const [currentPartIndex, setCurrentPartIndex] = useState(0) // 0, 1, 2 for Parts 1, 2, 3
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [partQuestions, setPartQuestions] = useState<TestQuestion[]>([])
  
  // Timer states
  const [timer, setTimer] = useState<number | null>(null)
  const [isPreparationTime, setIsPreparationTime] = useState(false)
  const [prepTimer, setPrepTimer] = useState<number | null>(null)
  
  // Audio recording states
  const [isRecording, setIsRecording] = useState(false)
  const [audioURL, setAudioURL] = useState<string | null>(null)
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'stopped' | 'processing' | 'completed' | 'error' | 'stopping'>('idle')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  
  // Response storage
  const [userResponses, setUserResponses] = useState<Record<string, UserResponse>>({})
  const [allFeedback, setAllFeedback] = useState<Record<string, FeedbackResult>>({})
  
  // New state for holistic approach
  const [isMuted, setIsMuted] = useState(false)
  const [userAction, setUserAction] = useState<'idle' | 'wantsToRecord' | 'wantsToStop' | 'wantsToSkip'>('idle');
  const [isTestCompleted, setIsTestCompleted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState("part-1")
  const [allPartsFeedback, setAllPartsFeedback] = useState<FeedbackResult | null>(null)
  
  // Part names for display
  const partNames = ['Part 1: Introduction and Interview', 'Part 2: Individual Long Turn', 'Part 3: Two-Way Discussion'];
  
  // Add this state around line 100 (with other state variables)
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false)
  
  // Add state for overall test timer
  const [overallTimer, setOverallTimer] = useState<number>(0);
  const [questionStartTime, setQuestionStartTime] = useState<number>(0);
  const [questionDuration, setQuestionDuration] = useState<number>(40); // Default 40 seconds per question
  
  // New callback to get speaking duration for the current question
  const getSpeakingDurationForCurrentQuestion = useCallback(() => {
    const currentQ = partQuestions[currentQuestionIndex];
    if (!currentQ || !currentQ.part_number) {
      console.warn("[getSpeakingDuration] Current question or part_number not available. Defaulting to 40s.");
      return 40; // Default if no question or part_number
    }

    const partNum = currentQ.part_number;
    let duration = 40; // Default duration

    if (partNum === 1) {
      duration = 20; // Part 1: 20 seconds
    } else if (partNum === 2) {
      duration = 120; // Part 2: 120 seconds (2 minutes)
    } else if (partNum === 3) {
      duration = 40; // Part 3: 40 seconds
    } else {
      console.warn(`[getSpeakingDuration] Unknown part number: ${partNum}. Defaulting to 40s.`);
    }

    console.log(`[getSpeakingDuration] Question ID: ${currentQ.id}, Part: ${partNum}, Standardized Duration: ${duration}s`);
    return duration;
  }, [partQuestions, currentQuestionIndex]);

  // Renamed for clarity and to accept a question argument
  const getSpeakingDurationForQuestion = useCallback((question: TestQuestion | null): number => {
    if (!question || !question.part_number) {
      console.warn("[getSpeakingDurationForQuestion] Current question or part_number not available. Defaulting to 40s.");
      return 40; 
    }
    const partNum = question.part_number;
    let duration = 40;
    if (partNum === 1) duration = 20;
    else if (partNum === 2) duration = 120;
    else if (partNum === 3) duration = 40;
    else console.warn(`[getSpeakingDurationForQuestion] Unknown part number: ${partNum}. Defaulting to 40s.`);
    console.log(`[getSpeakingDurationForQuestion] Question ID: ${question.id}, Part: ${partNum}, Standardized Duration: ${duration}s`);
    return duration;
  }, []);

  const stopRecording = useCallback(() => {
    console.log("[stopRecording] Called. mediaRecorderRef.current:", mediaRecorderRef.current, "State:", mediaRecorderRef.current?.state, "Recording status:", recordingStatus, "isRecording:", isRecording);
    setUserAction('wantsToStop'); // Signal intent

    if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
      try {
        console.log("[stopRecording] Attempting to stop mediaRecorder. Current state:", mediaRecorderRef.current.state);
        mediaRecorderRef.current.stop(); // This will trigger the onstop event
        console.log("[stopRecording] mediaRecorder.stop() called.");
        // State updates (setIsRecording, setRecordingStatus) will be handled by onstop
      } catch (err) {
        console.error("[stopRecording] Error stopping recorder:", err);
        // Fallback state update if stop() call fails for some reason
        setIsRecording(false);
        setRecordingStatus('stopped');
        setTimer(null);
      }
    } else {
      console.warn("[stopRecording] No active mediaRecorder to stop or recorder not in a stoppable state. Current state:", mediaRecorderRef.current?.state);
      // If no recorder or not recording, ensure states are correctly set, unless an error occurred previously
      if (recordingStatus !== 'error') {
        setIsRecording(false);
        setRecordingStatus('stopped');
        setTimer(null); 
      }
    }
  }, [recordingStatus, isRecording]); // Removed setUserAction from deps to avoid loop if called from effect

  // Renamed to avoid confusion, and added isRecording, userAction to deps carefully
  // Now accepts questionToRecord as an argument
  const startRecordingInternal = useCallback(async (questionToRecord: TestQuestion | null) => { 
    console.log(`[startRecordingInternal] Attempting to start. Current status: ${recordingStatus}, isRecording: ${isRecording}`);
    
    if (!questionToRecord) {
        console.error("[startRecordingInternal] No questionToRecord provided. Aborting.");
        setUserAction('idle');
        return;
    }
    console.log(`[startRecordingInternal] questionToRecord ID: ${questionToRecord.id}`);

    if (isRecording || recordingStatus === 'recording') {
      console.warn("[startRecordingInternal] Already recording or in process, exiting.");
      return;
    }

    setError(null);
    setAudioURL(null);
    audioChunksRef.current = [];
    console.log("[startRecordingInternal] State reset for new recording.");

    try {
      console.log("[startRecordingInternal] Checking existing MediaRecorder instance...");
      if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
        console.log("[startRecordingInternal] Releasing tracks from previous stream.");
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        mediaRecorderRef.current = null; // Clear the ref
      }
      
      console.log("[startRecordingInternal] Requesting user media (microphone).");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      console.log("[startRecordingInternal] Microphone access granted.");
      
      if (isMuted && stream.getAudioTracks().length > 0) {
        stream.getAudioTracks()[0].enabled = false;
        console.log("[startRecordingInternal] Microphone is muted by user setting.");
      }
      
      let mimeType = 'audio/webm;codecs=opus';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }
      console.log(`[startRecordingInternal] Using MIME type: ${mimeType}`);
      
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 });
      console.log("[startRecordingInternal] MediaRecorder instance created.");
      mediaRecorderRef.current = recorder;
      
      recorder.onstart = () => {
        console.log("[onstart] MediaRecorder started. State:", mediaRecorderRef.current?.state);
        setIsRecording(true); // Set true immediately on start
        setRecordingStatus('recording');
        
        // Use questionToRecord to get duration
        const duration = getSpeakingDurationForQuestion(questionToRecord);
        console.log(`[onstart] Setting speaking timer for ${duration} seconds (for question ${questionToRecord.id}).`);
        setTimer(duration); 
      };

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log(`[ondataavailable] Chunk received: ${event.data.size} bytes. Total chunks: ${audioChunksRef.current.length}`);
        } else {
          console.log(`[ondataavailable] Chunk received but size is 0 or no data.`);
        }
      };
      
      recorder.onstop = () => {
        console.log("[onstop] Recording stopped. Processing audio. Chunks recorded:", audioChunksRef.current.length);
        
        try {
          if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
            console.log(`[onstop] Created audio blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
            
            const url = URL.createObjectURL(audioBlob);
            setAudioURL(url);
            console.log(`[onstop] Audio URL created: ${url}`);
            
            // Store the recording for the current question
            const currentQ = partQuestions[currentQuestionIndex];
            if (currentQ) {
              console.log(`[onstop] Storing recording for question: ${currentQ.id}`);
              setUserResponses(prev => ({
                ...prev,
                [currentQ.id]: {
                  ...prev[currentQ.id],
                  test_question_id: currentQ.id,
                  audioBlob: audioBlob,
                  status: 'in_progress'
                }
              }));
            } else {
              console.warn("[onstop] Current question not found, cannot store audio blob in userResponses.");
            }
          } else {
            console.warn("[onstop] No audio chunks recorded. audioChunksRef is empty.");
            setError("No audio was recorded. Please ensure your microphone is working and try again.");
          }
        } catch (err) {
          console.error("[onstop] Error processing recording:", err);
          setError("Failed to process recording. Please try again.");
        }
        
        console.log("[onstop] Updating recording status to 'stopped'.");
        setIsRecording(false); // Set false on stop
        setRecordingStatus('stopped');
        setTimer(null); // Explicitly stop timer here
        
        stream.getTracks().forEach(track => {
          console.log(`[onstop] Stopping media track: ${track.kind}`);
          track.stop();
        });
        console.log("[onstop] All media tracks stopped.");
        setUserAction('idle'); // Reset user action after stop processing
      };

      recorder.onerror = (event) => {
        console.error("[onerror] MediaRecorder error:", event);
        // Type assertion for event.error is often needed for specific error details
        const specificError = (event as any).error;
        setError(`Recording error: ${specificError?.name || 'Unknown error'}. Message: ${specificError?.message || 'No specific message'}`);
        setRecordingStatus('error');
        setIsRecording(false);
        setTimer(null);
        stream.getTracks().forEach(track => track.stop());
        setUserAction('idle'); 
      };
      
      console.log("[startRecordingInternal] Calling recorder.start(500). Current state:", recorder.state);
      recorder.start(500); 
      
    } catch (error: any) {
      console.error('[startRecordingInternal] Outer catch block error:', error);
      
      let errorMessage = 'Failed to start recording.';
      
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Microphone access was denied. Please allow access in your browser settings.';
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'No microphone detected. Please connect a microphone and try again.';
        } else if (error.name === 'NotReadableError') {
          errorMessage = 'Your microphone is busy or unavailable. Please check other applications using it.';
        }
      }
      
      setError(errorMessage);
      setRecordingStatus('error');
      setIsRecording(false); // Ensure isRecording is false on error
      setUserAction('idle');
    }
  }, [getSpeakingDurationForQuestion, isMuted, recordingStatus, isRecording, userAction, setUserAction]);

  // Effect to handle user's intent to record
  useEffect(() => {
    // Use the memoized currentQuestion from the outer scope for the condition
    const questionForAction = partQuestions[currentQuestionIndex]; 

    if (userAction === 'wantsToRecord' && questionForAction && !isRecording && recordingStatus !== 'recording') {
      console.log("[Effect_HandleUserAction] User wants to record for question:", questionForAction.id);
      
      if (questionForAction.part_number === 2 && testInfo?.part2_preparation_seconds &&
          questionForAction.sequence_number === questions.filter(q => q.part_number === 2)[0]?.sequence_number && 
          !userResponses[questionForAction.id]?.audioBlob) {
          
          console.log(`[Effect_HandleUserAction] Starting Part 2 preparation time for ${testInfo.part2_preparation_seconds} seconds.`);
          setIsPreparationTime(true);
          setPrepTimer(testInfo.part2_preparation_seconds);
      } else {
        setIsPreparationTime(false); 
        startRecordingInternal(questionForAction); // Pass the fresh currentQuestion
      }
    } else if (userAction === 'wantsToRecord' && (isRecording || recordingStatus === 'recording')) {
        console.log("[Effect_HandleUserAction] User wants to record, but already recording. No action.");
    }
    // currentQuestion is now a dependency
  }, [userAction, partQuestions, currentQuestionIndex, isRecording, recordingStatus, startRecordingInternal, testInfo, questions, userResponses, setIsPreparationTime, setPrepTimer]);

  // Add this function to check browser compatibility
  const checkMicrophonePermission = useCallback(async () => {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      console.log(`Microphone permission status: ${result.state}`);
      
      if (result.state === 'denied') {
        setError('Microphone access is denied. Please allow microphone access in your browser settings.');
        return false;
      }
      return true;
    } catch (error) {
      // Safe way to handle unknown error type
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('Permissions API not supported, will try direct access:', errorMessage);
      return true; // Continue anyway for browsers that don't support the Permissions API
    }
  }, []);
  
  // Enhanced browser detection function
  const getBrowserInfo = useCallback(() => {
    const userAgent = navigator.userAgent;
    let browserName = "Unknown";
    let version = "Unknown";
    
    if (userAgent.match(/chrome|chromium|crios/i)) {
      browserName = "Chrome";
      const match = userAgent.match(/(?:chrome|chromium|crios)\/([\d.]+)/i);
      if (match && match[1]) version = match[1];
    } else if (userAgent.match(/firefox|fxios/i)) {
      browserName = "Firefox";
      const match = userAgent.match(/(?:firefox|fxios)\/([\d.]+)/i);
      if (match && match[1]) version = match[1];
    } else if (userAgent.match(/safari/i)) {
      browserName = "Safari";
      const match = userAgent.match(/version\/([\d.]+)/i);
      if (match && match[1]) version = match[1];
    } else if (userAgent.match(/opr\//i)) {
      browserName = "Opera";
      const match = userAgent.match(/opr\/([\d.]+)/i);
      if (match && match[1]) version = match[1];
    } else if (userAgent.match(/edg/i)) {
      browserName = "Edge";
      const match = userAgent.match(/edg(?:e|ios|a)\/([\d.]+)/i);
      if (match && match[1]) version = match[1];
    }
    
    // Log more detailed information
    console.log(`Browser: ${browserName} ${version}`);
    console.log(`User Agent: ${userAgent}`);
    
    // Check for known MediaRecorder support
    if (typeof MediaRecorder !== 'undefined') {
      console.log("MediaRecorder is supported");
      
      // Check supported MIME types
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/ogg'
      ];
      
      mimeTypes.forEach(type => {
        console.log(`${type}: ${MediaRecorder.isTypeSupported(type) ? 'Supported' : 'Not supported'}`);
      });
    } else {
      console.error("MediaRecorder is NOT supported in this browser");
    }
    
    return `${browserName} ${version}`;
  }, []);
  
  // Use a current question for rendering
  const currentQuestion = useMemo(() => partQuestions[currentQuestionIndex], [partQuestions, currentQuestionIndex]);
  
  // Load test details and questions
  useEffect(() => {
    if (!testId || typeof testId !== 'string' || !user?.id) {
      setLoading(false);
      return;
    }

    async function loadTestData() {
      try {
        setLoading(true);
        setError(null);
        
        if (!user?.id) { 
          throw new Error("User ID is not available to fetch responses.");
        }
        
        // Fetch test information
        const { data: testData, error: testError } = await supabase
          .from('cambridge_tests')
          .select('id, title, description, part1_duration_seconds, part2_duration_seconds, part2_preparation_seconds, part3_duration_seconds')
          .eq('id', testId) 
          .single();
        
        if (testError) {
          throw new Error(`Failed to load test information: ${testError.message}`);
        }
        setTestInfo(testData);

        // Fetch questions for this test
        const { data: questionsDataFetched, error: questionsError } = await supabase
          .from('test_questions')
          .select('id, part_number, sequence_number, question_text, question_type, topic')
          .eq('cambridge_test_id', testId)
          .order('part_number')
          .order('sequence_number');
        
        if (questionsError) {
          throw new Error(`Failed to load test questions: ${questionsError.message}`);
        }

        if (!questionsDataFetched || questionsDataFetched.length === 0) {
          throw new Error('No questions found for this test.');
        }

        // Manually map to the TestQuestion type, creating question_number from sequence_number
        const questionsData: TestQuestion[] = questionsDataFetched.map(q_fetched => ({
          ...q_fetched,
          question_number: q_fetched.sequence_number, // Explicitly map here
        })) as TestQuestion[]; // Ensure the final type is TestQuestion[]

        setQuestions(questionsData);

        // Load user's existing responses
        const { data: responsesData, error: responsesError } = await supabase
          .from('user_responses')
          .select('id, test_question_id, audio_url, transcript, status')
          .eq('user_id', user.id)
          .in('test_question_id', questionsData.map((q: TestQuestion) => q.id));
        
        if (responsesError) {
          setError(`Could not load previous responses: ${responsesError.message}`);
          // Not throwing, as test can proceed without prior responses
        } else if (responsesData && responsesData.length > 0) {
            const responsesMap: Record<string, UserResponse> = {};
            responsesData.forEach((response: any) => {
              if (response.test_question_id) {
                responsesMap[response.test_question_id] = {
                  id: response.id,
                  test_question_id: response.test_question_id,
                  status: response.status,
                  audio_url: response.audio_url,
                  transcript: response.transcript,
                };
              }
            });
            setUserResponses(responsesMap);
            
            // If there are completed responses, check if all parts are done
            const allQuestionIds = new Set(questionsData.map(q => q.id));
            const answeredQuestionIds = new Set(Object.keys(responsesMap));
            
            // If all questions have responses, we can consider the test completed
            if (answeredQuestionIds.size === allQuestionIds.size) {
              // Could optionally load their feedback here and set test as completed
            }
        }
        
        // Set initial part to Part 1
        const part1Questions = questionsData.filter((q: TestQuestion) => q.part_number === 1)
        if (part1Questions.length > 0) {
          setPartQuestions(part1Questions)
          setCurrentPartIndex(0)
          setCurrentQuestionIndex(0)
          setActiveTab("part-1")
        } else {
          setPartQuestions([]) 
          setError('Test data is incomplete: No Part 1 questions found.');
        }

      } catch (err: any) {
        setError(err.message || 'An unexpected error occurred while loading test data.');
      } finally {
        setLoading(false);
      }
    }
    
    loadTestData();
  }, [testId, user?.id, supabase]);
  
  // Handle part change
  useEffect(() => {
    if (!questions.length) return
    
    const partNumber = currentPartIndex + 1
    const filteredQuestions = questions.filter(q => q.part_number === partNumber)
    setPartQuestions(filteredQuestions)
    setCurrentQuestionIndex(0)
    stopRecording()
    setTimer(null)
    setPrepTimer(null)
    setIsPreparationTime(false)
    setRecordingStatus('idle')
    setAudioURL(null)
    
    // Update active tab when part changes
    setActiveTab(`part-${partNumber}`)
    
    // Check if first question of this part has a recording
    if (filteredQuestions.length > 0) {
      const firstQuestionId = filteredQuestions[0].id
      if (userResponses[firstQuestionId]?.audioBlob) {
        const url = URL.createObjectURL(userResponses[firstQuestionId].audioBlob!)
        setAudioURL(url)
        setRecordingStatus('stopped')
      }
    }
  }, [currentPartIndex, questions, stopRecording, userResponses])
  
  // Timer effect for speaking
  useEffect(() => {
    // Only run if timer has a value, we are flagged as recording, and status is 'recording'
    if (timer === null || !isRecording || recordingStatus !== 'recording') {
      console.log(`[TimerEffect] Conditions not met for timer countdown. Timer: ${timer}, isRecording: ${isRecording}, recordingStatus: ${recordingStatus}`);
      // If timer is 0 but we are still 'recording', it means stopRecording wasn't called by timer expiry, so call it.
      if (timer === 0 && isRecording && recordingStatus === 'recording') {
          console.warn("[TimerEffect] Timer is 0 but still recording. Forcing stop.");
          stopRecording();
      }
      return;
    }
    
    console.log(`[TimerEffect] Setting up interval for ${timer} seconds. isRecording: ${isRecording}, recordingStatus: ${recordingStatus}`);
    
    const interval = setInterval(() => {
      setTimer(prevTimer => {
        if (prevTimer === null) {
          console.log("[TimerEffect] prevTimer is null, clearing interval.");
          clearInterval(interval);
          return null;
        }
        
        if (prevTimer <= 1) {
          console.log("[TimerEffect] Timer reached zero or less, stopping recording and clearing interval.");
          clearInterval(interval);
          // stopRecording() will be called which handles setIsRecording(false) and setRecordingStatus('stopped') via onstop
          // We must ensure that stopRecording is robust and handles all state changes
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') { // Double check if still recording
               console.log("[TimerEffect] Calling mediaRecorderRef.current.stop() as timer expired.");
               mediaRecorderRef.current.stop(); // Directly stop the recorder
          } else {
              console.warn("[TimerEffect] Timer expired, but MediaRecorder not in 'recording' state or not available. State:", mediaRecorderRef.current?.state);
              // Ensure states are reset if recorder was already stopped by other means
              setIsRecording(false);
              setRecordingStatus('stopped');
          }
          return 0; 
        }
        return prevTimer - 1;
      });
    }, 1000);
    
    return () => {
      console.log("[TimerEffect] Cleanup: Clearing interval for timer with initial value:", timer);
      clearInterval(interval);
    };
  }, [timer, isRecording, recordingStatus, stopRecording]); // stopRecording might not be needed if mediaRecorder.stop() is called directly

  // useEffect for preparation timer (Part 2)
  useEffect(() => {
    if (prepTimer === null || !isPreparationTime) return;

    const activeQuestionForPrep = partQuestions[currentQuestionIndex]; 

    const interval = setInterval(() => {
      setPrepTimer(prevTimer => {
        if (prevTimer === null || prevTimer <= 0) {
          clearInterval(interval);
          setIsPreparationTime(false);
          console.log("[PrepTimerEffect] Prep time finished. Attempting to start actual recording.");
          
          if (activeQuestionForPrep && recordingStatus !== 'recording' && !isRecording) {
               console.log("[PrepTimerEffect] Conditions met, calling startRecordingInternal for question:", activeQuestionForPrep.id);
               startRecordingInternal(activeQuestionForPrep); // Pass the question
          } else {
              console.warn("[PrepTimerEffect] Conditions not met to start recording after prep time. Question:", activeQuestionForPrep?.id, "Status:", recordingStatus, "isRecording:", isRecording);
              setUserAction('idle'); // Reset if we can't start
          }
          return 0;
        }
        return prevTimer - 1;
      });
    }, 1000);

    return () => {
      console.log("[PrepTimerEffect] Cleanup: Clearing interval for prepTimer.");
      clearInterval(interval);
    };
  }, [prepTimer, isPreparationTime, startRecordingInternal, recordingStatus, isRecording, partQuestions, currentQuestionIndex, setUserAction, setIsPreparationTime]);

  // UnmountEffect: Simplified
  useEffect(() => {
    return () => {
      console.log("[UnmountEffect] Component unmounting. mediaRecorder state:", mediaRecorderRef.current?.state);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        console.log("[UnmountEffect] Cleaning up: stopping MediaRecorder.");
        mediaRecorderRef.current.onstop = null; // Prevent onstop from running during unmount cleanup if it causes issues
        mediaRecorderRef.current.stop();
        // Release stream tracks
        if (mediaRecorderRef.current.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
        mediaRecorderRef.current = null;
      }
    };
  }, []); // Empty dependency array means this runs only on mount and unmount

  // Load user's existing responses when changing questions
  useEffect(() => {
    if (!currentQuestion) return;
    
    const currentQuestionId = currentQuestion.id;
    
    // If we already have a blob for this question, create a URL for it
    if (userResponses[currentQuestionId]?.audioBlob) {
      const url = URL.createObjectURL(userResponses[currentQuestionId].audioBlob!);
      setAudioURL(url);
      setRecordingStatus('stopped');
    } else {
      // Reset for a new recording
      setAudioURL(null);
      setRecordingStatus('idle');
    }
  }, [currentQuestion, userResponses]);
  
  // Submit all responses together
  const submitAllResponses = async () => {
    if (!user?.id) return;
    
    try {
      setIsSubmitting(true);
      
      // Process each response
      const responsePromises = Object.entries(userResponses).map(async ([questionId, response]) => {
        // Skip questions without recordings
        if (!response.audioBlob) return null;
        
        const questionData = questions.find(q => q.id === questionId);
        if (!questionData) return null;
        
        const file = new File([response.audioBlob], `recording-${questionId}.wav`, { type: 'audio/wav' });
        
        // Upload audio
        const publicUrl = await storageService.uploadAudio(file, user.id, questionId);
        
        // Transcribe audio
        const formData = new FormData();
        formData.append('file', file);
        formData.append('model', 'whisper-1');
        const whisperResponse = await fetch('/api/transcribe', { method: 'POST', body: formData });
        if (!whisperResponse.ok) throw new Error('Transcription failed');
        const transcriptionResult = await whisperResponse.json();
        const transcript = transcriptionResult.text;
        
        // Check for existing response or create new one
        const { data: existingResponse } = await supabase
          .from('user_responses')
          .select('id')
          .eq('user_id', user.id)
          .eq('test_question_id', questionId)
          .maybeSingle();
        
        let responseId;
        let dbError = null;

        if (existingResponse?.id) {
          const { error } = await supabase
            .from('user_responses')
            .update({
              audio_url: publicUrl,
              transcript: transcript,
              status: 'completed'
            })
            .eq('id', existingResponse.id);
          dbError = error;
          responseId = existingResponse.id;
        } else {
          const { data, error } = await supabase
            .from('user_responses')
            .insert({
              user_id: user.id,
              test_question_id: questionId,
              audio_url: publicUrl,
              transcript: transcript,
              status: 'completed'
            })
            .select('id')
            .single();
          dbError = error;
          if(data) responseId = data.id;
        }
        
        if (dbError) throw dbError;
        if (!responseId) throw new Error("Failed to get response ID from database operation.");
        
        // Score the response
        const scoringResponse = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            responseId, 
            questionText: questionData.question_text, 
            transcript, 
            partNumber: questionData.part_number 
          })
        });
        if (!scoringResponse.ok) throw new Error('Scoring failed');
        const scoringResult = await scoringResponse.json();
        
        // Update our local state with the result
        setAllFeedback(prev => ({
          ...prev,
          [questionId]: scoringResult
        }));
        
        // Update response info
        return {
          questionId,
          responseId,
          publicUrl,
          transcript,
          feedback: scoringResult
        };
      });
      
      // Wait for all processing to complete
      const results = await Promise.all(responsePromises);
      
      // Calculate overall feedback by averaging scores from all questions
      const validResults = results.filter(result => result !== null);
      if (validResults.length > 0) {
        const totalScores = {
          fluency_coherence_score: 0,
          lexical_resource_score: 0,
          grammar_accuracy_score: 0,
          pronunciation_score: 0,
          overall_band_score: 0
        };
        
        validResults.forEach(result => {
          if (!result) return;
          const feedback = result.feedback;
          totalScores.fluency_coherence_score += feedback.fluency_coherence_score;
          totalScores.lexical_resource_score += feedback.lexical_resource_score;
          totalScores.grammar_accuracy_score += feedback.grammar_accuracy_score;
          totalScores.pronunciation_score += feedback.pronunciation_score;
          totalScores.overall_band_score += feedback.overall_band_score;
        });
        
        const count = validResults.length;
        const overallFeedback = {
          fluency_coherence_score: totalScores.fluency_coherence_score / count,
          lexical_resource_score: totalScores.lexical_resource_score / count,
          grammar_accuracy_score: totalScores.grammar_accuracy_score / count,
          pronunciation_score: totalScores.pronunciation_score / count,
          overall_band_score: totalScores.overall_band_score / count,
          general_feedback: "Overall performance analysis across all parts of the test.",
          fluency_coherence_feedback: "Combined fluency and coherence evaluation.",
          lexical_resource_feedback: "Combined vocabulary usage evaluation.",
          grammar_accuracy_feedback: "Combined grammar evaluation.",
          pronunciation_feedback: "Combined pronunciation evaluation.",
          model_answer: "See individual questions for model answers."
        };
        
        setAllPartsFeedback(overallFeedback);
      }
      
      setIsTestCompleted(true);
      setIsSubmitting(false);
      
    } catch (err: any) {
      console.error('Error submitting responses:', err);
      setError(err.message || 'Failed to submit responses');
      setIsSubmitting(false);
    }
  };
  
  // Skip to next question or part without submitting for evaluation
  const handleNextQuestion = useCallback(() => {
    console.log(`[handleNextQuestion] Attempting to navigate. From QIndex: ${currentQuestionIndex}, PartIndex: ${currentPartIndex}. Current status: ${recordingStatus}, isRecording: ${isRecording}`);

    // Stop recording if in progress
    if (isRecording || recordingStatus === 'recording') {
      console.log("[handleNextQuestion] Recording is active, calling stopRecording().");
      stopRecording(); 
    }

    if (currentQuestionIndex < partQuestions.length - 1) {
      const newQuestionIndex = currentQuestionIndex + 1;
      console.log(`[handleNextQuestion] Moving from question ${currentQuestionIndex} to ${newQuestionIndex} in part ${currentPartIndex + 1}. Total questions in part: ${partQuestions.length}`);
      setCurrentQuestionIndex(newQuestionIndex);
    }
    else if (currentPartIndex < 2) { // Max part index is 2 (for Part 3)
      const newPartIndex = currentPartIndex + 1;
      console.log(`[handleNextQuestion] Moving from part ${currentPartIndex + 1} to part ${newPartIndex + 1}.`);
      setCurrentPartIndex(newPartIndex); // This will trigger partQuestions update via useEffect
    } else {
      console.log("[handleNextQuestion] End of test reached (already on last question of last part), showing submit dialog.");
      setIsSubmitDialogOpen(true);
    }
  }, [currentPartIndex, currentQuestionIndex, isRecording, partQuestions.length, recordingStatus, stopRecording, setIsSubmitDialogOpen]);
  
  // Start or restart test (this function is called by the UI button)
  const startTest = useCallback(async () => {
    console.log("[startTest] User clicked start/record button.");
    // Check browser compatibility first
    const browserName = getBrowserInfo();
    console.log(`[startTest] Using browser: ${browserName}`);
    
    // Check if microphone permission is granted
    const permissionGranted = await checkMicrophonePermission();
    if (!permissionGranted) {
      console.error("[startTest] Microphone permission not granted. Cannot start.");
      return; 
    }
    
    console.log("[startTest] Setting userAction to 'wantsToRecord'.");
    setUserAction('wantsToRecord'); 
    // The actual recording will be triggered by the useEffect watching userAction

  }, [checkMicrophonePermission, getBrowserInfo]);
  
  // Toggle microphone mute status
  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (mediaRecorderRef.current?.stream) {
      const audioTracks = mediaRecorderRef.current.stream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks[0].enabled = isMuted; // Toggle enabled state (if currently muted, unmute)
      }
    }
  };

  // Format time for display
  const formatTime = (seconds: number | null) => {
    if (seconds === null) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Enhanced timer component with visual indicator
  const TimerDisplay = ({ seconds, totalSeconds, isRecording = false }: { seconds: number; totalSeconds: number; isRecording?: boolean }) => {
    const percentage = totalSeconds > 0 ? (seconds / totalSeconds) * 100 : 0;
    const formatTime = (secs: number) => {
      const mins = Math.floor(secs / 60);
      const remainingSecs = secs % 60;
      return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
    };
    
    return (
      <div className="flex items-center gap-2">
        <div className="relative w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className={`absolute top-0 left-0 h-full ${isRecording ? 'bg-red-500' : 'bg-indigo-600'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className={`text-sm font-medium ${isRecording ? 'text-red-600' : 'text-gray-700'}`}>
          {formatTime(seconds)}
        </div>
      </div>
    );
  };

  // Start the overall timer when the test begins
  useEffect(() => {
    if (userAction === 'wantsToRecord') {
      const interval = setInterval(() => {
        setOverallTimer(prev => prev + 1);
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [userAction]);

  // Set question-specific timer when starting a new question
  useEffect(() => {
    if (currentQuestion) {
      // Determine duration based on part number, similar to getSpeakingDurationForCurrentQuestion
      let newDuration = 40; // Default
      const partNum = currentQuestion.part_number;

      if (partNum === 1) {
        newDuration = 20;
      } else if (partNum === 2) {
        newDuration = 120;
      } else if (partNum === 3) {
        newDuration = 40;
      }
      console.log(`[MainTestUIEffect_QuestionDuration] Setting questionDuration for UI. Question: ${currentQuestion.id}, Part: ${partNum}, Standardized UI duration: ${newDuration}`);
      setQuestionDuration(newDuration);
      setQuestionStartTime(0); // Reset time spent on this question for UI
    }
  }, [currentQuestion]);

  // Track time spent on current question
  useEffect(() => {
    if (recordingStatus === 'recording') {
      const interval = setInterval(() => {
        setQuestionStartTime(prev => prev + 1);
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [recordingStatus]);

  // Clean, streamlined UI with minimal distractions
  const MainTestUI = () => {
    // Calculate total timer value for current question
    const totalDuration = questionDuration;
    const totalPrepDuration = currentQuestion?.part_number === 2 ? (testInfo?.part2_preparation_seconds || 0) : 0;
    
    // Format overall time
    const formatOverallTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const hours = Math.floor(mins / 60);
      const remainingSecs = seconds % 60;
      const remainingMins = mins % 60;
      
      if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${remainingMins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
      }
      return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
    };
    
    // Calculate progress percentage
    const currentPartNum = currentQuestion?.part_number || 1;
    const partProgress = {
      totalQuestions: questions.filter(q => q.part_number === currentPartNum).length,
      currentQuestion: currentQuestionIndex + 1,
      totalParts: 3,
      currentPart: currentPartNum
    };
    
    // Get timing info based on part number
    const getPartTimingInfo = () => {
      if (currentPartNum === 1) {
        return {
          label: "Short Answers",
          duration: testInfo?.part1_duration_seconds || 60,
          description: "Brief responses to general questions"
        };
      } else if (currentPartNum === 2) {
        return {
          label: "Long Turn",
          duration: testInfo?.part2_duration_seconds || 120,
          description: "Extended response to a topic card",
          prepTime: testInfo?.part2_preparation_seconds || 60
        };
      } else {
        return {
          label: "Discussion",
          duration: testInfo?.part3_duration_seconds || 240,
          description: "In-depth responses to follow-up questions"
        };
      }
    };
    
    const timingInfo = getPartTimingInfo();
    
    // Calculate time progress
    const getTimeProgress = () => {
      if (isPreparationTime) {
        return ((totalPrepDuration - (prepTimer || 0)) / totalPrepDuration) * 100;
      } else if (recordingStatus === 'recording') {
        // Use question-specific timer for recording progress
        return (questionStartTime / totalDuration) * 100;
      }
      return 0;
    };
    
    // Calculate percentage of time spent on question
    const getQuestionTimePercentage = () => {
      if (totalDuration === 0) return 0;
      const percentage = (questionStartTime / totalDuration) * 100;
      return Math.min(percentage, 100);
    };
    
    // Format remaining time for display
    const getRemainingTime = () => {
      if (isPreparationTime) {
        return formatTime(prepTimer || 0);
      } else if (recordingStatus === 'recording') {
        const remaining = Math.max(0, totalDuration - questionStartTime);
        return formatTime(remaining);
      }
      return formatTime(totalDuration);
    };
    
    // Enhanced countdown display
    const CountdownDisplay = () => {
      const timeRemaining = isPreparationTime ? prepTimer || 0 : timer || 0;
      const timeTotal = isPreparationTime ? totalPrepDuration : totalDuration;
      const percentage = timeTotal > 0 ? (timeRemaining / timeTotal) * 100 : 0;
      
      return (
        <div className="fixed top-20 right-4 flex flex-col items-center bg-white shadow-lg rounded-lg p-3 z-50">
          <div className="text-center mb-1">
            <span className={`text-3xl font-bold ${
              timeRemaining < 10 ? 'text-red-600 animate-pulse' : 
              timeRemaining < 20 ? 'text-orange-500' : 'text-gray-700'
            }`}>
              {formatTime(timeRemaining)}
            </span>
          </div>
          <div className="w-16 h-16 relative">
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <circle 
                className="text-gray-200" 
                strokeWidth="8" 
                stroke="currentColor" 
                fill="transparent" 
                r="40" 
                cx="50" 
                cy="50" 
              />
              <circle 
                className={`${
                  timeRemaining < 10 ? 'text-red-500' : 
                  timeRemaining < 20 ? 'text-orange-400' : 'text-indigo-600'
                }`}
                strokeWidth="8" 
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - percentage / 100)}`}
                strokeLinecap="round" 
                stroke="currentColor" 
                fill="transparent" 
                r="40" 
                cx="50" 
                cy="50" 
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs">
              {isPreparationTime ? 'PREP' : 'TALK'}
            </span>
          </div>
        </div>
      );
    };
    
    return (
      <div className="flex flex-col min-h-screen bg-gray-50">
        {/* Status bar with part/question progress */}
        <div className="bg-white border-b border-gray-200 py-2 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto flex justify-between items-center">
            <div className="flex items-center space-x-6">
              <div className="flex items-center">
                <div className="flex items-center space-x-1">
                  <span className="font-medium text-gray-700">Part {currentPartNum}</span>
                  <span className="text-gray-400">/</span>
                  <span className="text-gray-500">{partProgress.totalParts}</span>
                </div>
                
                <div className="mx-2 w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600" 
                    style={{ width: `${((currentPartNum - 1) / partProgress.totalParts) * 100 + (1 / partProgress.totalParts) * (partProgress.currentQuestion / partProgress.totalQuestions) * 100}%` }}
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-1">
                <span className="font-medium text-gray-700">Question {partProgress.currentQuestion}</span>
                <span className="text-gray-400">/</span>
                <span className="text-gray-500">{partProgress.totalQuestions}</span>
              </div>
            </div>
            
            {/* Overall timer display */}
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-gray-500">
                {timingInfo.label}
              </div>
              <div className="py-1 px-2 bg-gray-100 rounded-md text-xs font-mono">
                Total: {formatOverallTime(overallTimer)}
              </div>
            </div>
          </div>
        </div>
        
        {/* Timer bar for all states */}
        <div className={`py-2 px-4 sm:px-6 ${
          isPreparationTime ? 'bg-yellow-50 border-b border-yellow-100' : 
          recordingStatus === 'recording' ? 'bg-red-50 border-b border-red-100' : 
          'bg-gray-50 border-b border-gray-200'
        }`}>
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                {isPreparationTime ? (
                  <span className="text-yellow-600 font-medium">Preparation Time</span>
                ) : recordingStatus === 'recording' ? (
                  <>
                    <span className="h-3 w-3 bg-red-600 rounded-full animate-pulse"></span>
                    <span className="text-red-600 font-medium">Recording</span>
                  </>
                ) : (
                  <span className="text-gray-600 font-medium">Question Time Limit</span>
                )}
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-48 bg-white bg-opacity-50 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${
                      isPreparationTime ? 'bg-yellow-500' : 
                      recordingStatus === 'recording' ? 'bg-red-500' : 
                      'bg-gray-400'
                    }`}
                    style={{ 
                      width: `${
                        recordingStatus === 'recording' ? getQuestionTimePercentage() : 
                        isPreparationTime ? getTimeProgress() : 0
                      }%` 
                    }}
                  />
                </div>
                
                <div className="flex items-center gap-1">
                  <span className={`text-sm font-mono font-bold ${
                    isPreparationTime ? 'text-yellow-700' : 
                    recordingStatus === 'recording' ? 'text-red-700' : 
                    'text-gray-700'
                  }`}>
                    {getRemainingTime()}
                  </span>
                  
                  {recordingStatus === 'recording' && (
                    <span className="text-xs text-gray-500">/ {formatTime(totalDuration)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-6">
          {/* Show prominent countdown timer when recording or in prep time */}
          {(recordingStatus === 'recording' || isPreparationTime) && <CountdownDisplay />}
          
          {error && (
            <Alert variant="destructive" className="mb-6 max-w-2xl w-full">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <div className="max-w-2xl w-full">
            {/* Part information */}
            <div className="mb-2 flex justify-between items-center">
              <span className="text-sm font-medium text-indigo-600">{partNames[currentPartIndex]}</span>
            </div>
            
            {/* Question */}
            <Card className="mb-6 overflow-hidden border-0 shadow-md">
              {currentPartNum === 2 && (
                <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-100">
                  <span className="text-xs uppercase font-semibold tracking-wider text-indigo-600">Cue Card</span>
                </div>
              )}
              <CardContent className="pt-6 pb-6">
                <h1 className="text-xl md:text-2xl font-medium text-gray-800 leading-tight text-center">
                  {currentQuestion?.question_text}
                </h1>
              </CardContent>
            </Card>
            
            {isPreparationTime && (
              <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-md mx-auto text-center">
                <h3 className="text-base font-medium text-yellow-800">Preparation Time</h3>
                <div className="text-3xl font-bold text-yellow-900 mt-1">{formatTime(prepTimer)}</div>
                <p className="text-yellow-700 mt-2 text-sm">
                  Make notes and plan your answer. Recording will start automatically.
                </p>
              </div>
            )}
          </div>
        </main>

        {/* Recording controls footer */}
        <footer className="bg-white border-t border-gray-200 py-4 px-4 sm:px-6">
          <div className="max-w-xl mx-auto">
            {recordingStatus === 'idle' && !isPreparationTime && (
              <div className="flex justify-center">
                <Button 
                  onClick={startTest}
                  size="lg" 
                  className="relative flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all"
                >
                  <Mic size={20} />
                  <span>Start Recording</span>
                </Button>
              </div>
            )}
            
            {recordingStatus === 'recording' && (
              <div className="flex items-center justify-center gap-6">
                <Button 
                  variant="outline"
                  onClick={stopRecording}
                  className="relative flex items-center justify-center gap-2 px-5 py-2.5 border-2 border-red-500 text-red-600 hover:bg-red-50 rounded-full"
                >
                  <Square size={16} />
                  <span>Stop</span>
                </Button>
                
                <Button 
                  onClick={handleNextQuestion}
                  className="relative flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-full"
                >
                  <SkipForward size={16} />
                  <span>Skip</span>
                </Button>
              </div>
            )}
            
            {recordingStatus === 'stopped' && (
              <div className="space-y-4">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <audio src={audioURL || ''} controls className="w-full" />
                </div>
                
                <div className="flex justify-center">
                  <Button 
                    onClick={handleNextQuestion}
                    className="relative flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-md"
                  >
                    <ChevronRight size={20} />
                    <span>Continue to Next Question</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </footer>
        
        {/* Final submission dialog */}
        <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit Test for Evaluation</DialogTitle>
              <DialogDescription>
                You've completed all questions. Would you like to submit your test for evaluation?
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-4">
              <div className="space-y-2">
                {[1, 2, 3].map(partNum => {
                  const partQuestions = questions.filter(q => q.part_number === partNum);
                  const answeredQuestions = partQuestions.filter(q => userResponses[q.id]?.audioBlob);
                  const percentage = partQuestions.length > 0 
                    ? Math.round((answeredQuestions.length / partQuestions.length) * 100) 
                    : 0;
                  
                  return (
                    <div key={partNum} className="flex items-center justify-between">
                      <span className="text-sm font-medium">Part {partNum}</span>
                      <div className="flex items-center gap-3 w-48">
                        <Progress value={percentage} className="h-2" />
                        <span className="text-xs text-gray-500 w-12">{answeredQuestions.length}/{partQuestions.length}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setIsSubmitDialogOpen(false)}
              >
                Continue Test
              </Button>
              <Button 
                onClick={submitAllResponses}
                disabled={isSubmitting}
                className="bg-green-600 hover:bg-green-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Submit for Evaluation'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // Main test UI
  return (
    <ProtectedRoute>
      {loading && (
        <div className="flex justify-center items-center min-h-screen">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
          <span className="ml-3 text-lg">Loading test...</span>
        </div>
      )}
      
      {error && (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <p className="mt-4 text-lg">{error}</p>
          <Button className="mt-4" onClick={() => router.push('/tests')}>
            Back to Tests
          </Button>
        </div>
      )}
      
      {!loading && !error && !testInfo && (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <p className="mt-4 text-lg">Error: Test information not found</p>
          <Button className="mt-4" onClick={() => router.push('/tests')}>
            Back to Tests
          </Button>
        </div>
      )}
      
      {!loading && !error && testInfo && !currentQuestion && (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <p className="mt-4 text-lg">Error: Could not display question. Test data missing.</p>
          <Button className="mt-4" onClick={() => router.push('/tests')}>
            Back to Tests
          </Button>
        </div>
      )}
      
      {/* Test completion screen */}
      {isTestCompleted && allPartsFeedback && (
        <div className="flex flex-col min-h-screen bg-white">
          <header className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center">
              <span className="font-bold text-xl">SmallTalk2Me</span>
            </div>
            <button 
              className="text-gray-500 hover:text-gray-600"
              onClick={() => router.push('/tests')}
            >
              <X size={20} />
            </button>
          </header>

          <main className="flex-1 p-6">
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-8">
                <div className="inline-block bg-green-100 rounded-full p-6 mb-4">
                  <CheckCircle2 size={48} className="text-green-600" />
                </div>
                <h1 className="text-3xl font-bold mb-2">Test Completed</h1>
                <p className="text-gray-600">Your IELTS Speaking test has been evaluated</p>
              </div>

              <div className="bg-indigo-50 rounded-xl p-8 mb-8">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-indigo-900">Your Results</h2>
                  <div className="bg-white text-indigo-600 rounded-full p-4 flex flex-col items-center justify-center shadow-sm">
                    <span className="text-3xl font-bold">{allPartsFeedback.overall_band_score.toFixed(1)}</span>
                    <span className="text-xs mt-1">BAND SCORE</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Fluency</p>
                    <p className="text-lg font-bold">{allPartsFeedback.fluency_coherence_score.toFixed(1)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Vocabulary</p>
                    <p className="text-lg font-bold">{allPartsFeedback.lexical_resource_score.toFixed(1)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Grammar</p>
                    <p className="text-lg font-bold">{allPartsFeedback.grammar_accuracy_score.toFixed(1)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Pronunciation</p>
                    <p className="text-lg font-bold">{allPartsFeedback.pronunciation_score.toFixed(1)}</p>
                  </div>
                </div>
              </div>
              
              <Button 
                onClick={() => router.push(`/tests/${testId}/results`)}
                className="w-full bg-gray-900 hover:bg-gray-800 py-3 rounded-lg"
              >
                View Detailed Results
              </Button>
            </div>
          </main>
        </div>
      )}
      
      {!loading && !error && testInfo && currentQuestion && !isTestCompleted && <MainTestUI />}
    </ProtectedRoute>
  );
} 