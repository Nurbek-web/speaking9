'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  SkipForward,
  X,
  Volume2,
  VolumeX,
  AlertCircle,
  Clock 
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { MainTestUIProps, PART_NAMES } from './types'
import { formatTime } from '../testUtils'

// Import speaking-specific components
import TestSectionHeader from '@/components/speaking/TestSectionHeader'
import SimpleAudioRecorder from '@/components/speaking/SimpleAudioRecorder'
import CountdownDisplay from '@/components/speaking/CountdownDisplay'
import PreparationTimer from '@/components/speaking/PreparationTimer'

// Import helper functions from testUtils
// import { getBrowserInfo } from '../testUtils'

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
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'processing' | 'complete'>('idle');
  
  // Use a ref to track the last dispatch to prevent duplicates
  const lastDispatchRef = useRef<{questionId: string, size: number, timestamp: number} | null>(null);
  
  // Calculate part number (1-indexed) and get the part name
  const partNumber = currentPartIndex + 1;
  const partName = PART_NAMES[currentPartIndex] || `Part ${partNumber}`;
  
  // Get current part's question count and question number
  const currentPartQuestions = questions.filter(q => q.part_number === partNumber);
  const currentQuestionNumber = currentQuestionIndex + 1;
  const totalQuestionsInPart = currentPartQuestions.length;
  
  // Handle preparation time (for Part 2 cue cards)
  const isPart2 = partNumber === 2;
  const currentQuestionResponse = currentQuestion?.id ? userResponses[currentQuestion.id] : undefined;
  const hasCompletePreparation = currentQuestionResponse?.metadata?.preparation_completed === true;
  const hasAudioBlob = !!currentQuestionResponse?.audioBlob;
  
  // Consider preparation time completed if either we have audio or preparation was explicitly marked as completed
  const isPreparationTime = currentQuestion?.part_number === 2 && 
                           currentQuestionIndex === 0 && 
                           !hasAudioBlob && 
                           !hasCompletePreparation;
  
  // Get response for current question (if exists)
  const currentResponse = userResponses[currentQuestion.id];
  const hasRecordedAudio = !!currentResponse?.audioBlob;
  
  // Add a ref to track if we're currently processing a skip
  const [isSkipping, setIsSkipping] = useState(false);
  
  // Handle recording actions (some of these will be passed to AudioRecorder)
  const handleStartRecording = useCallback(() => { // This might be removed if AudioRecorder auto-starts
    setRecordingStatus('recording');
    dispatch({ type: 'START_SPEAKING' });
  }, [dispatch]);
  
  const handleRecordingComplete = useCallback((questionId: string, blob: Blob, url: string) => {
    // Set recording status for UI updates
    setRecordingStatus('complete');
    
    console.log(`[MainTestUI] handleRecordingComplete called. Question: ${questionId}, blob size: ${blob.size}`);
    
    // Simple action dispatch with no extra checks
    console.log(`[MainTestUI] Dispatching AUDIO_RECORDED for ${questionId}, blob size: ${blob.size} bytes`);
    
    dispatch({ 
      type: 'AUDIO_RECORDED', 
      payload: { questionId, audioBlob: blob, url }
    });
  }, [dispatch]);
  
  const handleSkipQuestion = useCallback(() => {
    // Prevent multiple rapid clicks
    if (isSkipping) return;
    
    setIsSkipping(true);
    console.log('[MainTestUI] handleSkipQuestion called for questionId:', currentQuestion.id);

    // Only dispatch QUESTION_SKIPPED from this handler, not from the AudioRecorder too
    dispatch({ 
      type: 'QUESTION_SKIPPED', 
      payload: { questionId: currentQuestion.id }
    });
    
    // Navigate to next question
    dispatch({ type: 'NAVIGATE_TO_NEXT_QUESTION_OR_PART' });
    
    // Reset after a short delay
    setTimeout(() => setIsSkipping(false), 500);
  }, [currentQuestion.id, dispatch, isSkipping]);
  
  const handleSkipRemainingTime = useCallback(() => {
    console.log('[MainTestUI] handleSkipRemainingTime called for questionId:', currentQuestion.id);
    
    // First attempt: Try to stop recording using the window method
    if (typeof window !== 'undefined' && (window as any).__stopRecordingEarly) {
      console.log('[MainTestUI] Calling __stopRecordingEarly');
      (window as any).__stopRecordingEarly();
    }
    
    // Second attempt: Try to use the globalAudioStore directly
    if (typeof window !== 'undefined' && (window as any).globalAudioStore) {
      const store = (window as any).globalAudioStore;
      
      // Remove from active recordings
      if (store.activeRecordings && store.activeRecordings.has(currentQuestion.id)) {
        console.log('[MainTestUI] Removing from active recordings using globalAudioStore');
        store.activeRecordings.delete(currentQuestion.id);
      }
    }
    
    // Set local recording status
    setRecordingStatus('complete');
    
    // Dispatch the action to the reducer - this marks as 'completed'
    dispatch({ 
      type: 'SKIP_REMAINING_TIME', 
      payload: { questionId: currentQuestion.id }
    });
    
    // Force a short delay to allow recording to finalize
    setTimeout(() => {
      console.log('[MainTestUI] Auto-navigating to next question after skipping remaining time');
      
      // Navigate to next question regardless
      dispatch({ type: 'NAVIGATE_TO_NEXT_QUESTION_OR_PART' });
    }, 1000);
  }, [currentQuestion.id, dispatch]);
  
  const handleNextQuestion = useCallback(() => {
    // This is for AudioRecorder's onNavigateNext
    dispatch({ type: 'NAVIGATE_TO_NEXT_QUESTION_OR_PART' });
    setRecordingStatus('idle');
  }, [dispatch]);

  const handleAudioRecorderError = useCallback((message: string) => {
    dispatch({ type: 'SET_ERROR', payload: `Audio Recording Error: ${message}` });
  }, [dispatch]);
  
  const handleFinishTest = useCallback(() => {
    console.log('[MainTestUI] Finishing test and showing submission dialog');
    dispatch({ type: 'OPEN_SUBMIT_DIALOG' });
  }, [dispatch]);
  
  const handleToggleMute = useCallback(() => {
    dispatch({ type: 'TOGGLE_MUTE' });
  }, [dispatch]);
  
  const handleSubmitDialogConfirm = useCallback(async () => {
    try {
      console.log('[MainTestUI] Submitting responses...');
      // Wait for the submission to complete before closing the dialog
      await submitAllResponsesAsync();
      console.log('[MainTestUI] Submission completed successfully');
      
      // Ensure the test is marked as completed even if the reducer didn't set it
      dispatch({ type: 'SUBMIT_ALL_RESPONSES_SUCCESS', payload: { 
        allFeedback: userResponses,
        overallFeedback: null // This will use the default values if API calls failed
      }});
      
      dispatch({ type: 'CLOSE_SUBMIT_DIALOG' });
    } catch (error) {
      console.error('[MainTestUI] Error during submission:', error);
      // Set error message if submission fails
      dispatch({ type: 'SET_ERROR', payload: 'Failed to submit responses. Please try again.' });
      // Keep dialog open on error
    }
  }, [dispatch, submitAllResponsesAsync, userResponses]);
  
  const handleSubmitDialogCancel = useCallback(() => {
    dispatch({ type: 'CLOSE_SUBMIT_DIALOG' });
  }, [dispatch]);
  
  // Handle preparation time start/end
  const handleStartPreparation = useCallback(() => {
    dispatch({ type: 'START_PREPARATION' });
  }, [dispatch]);
  
  const handleEndPreparation = useCallback(() => {
    console.log('[MainTestUI] handleEndPreparation called for questionId:', currentQuestion?.id);
    
    // Make sure we have a question ID
    if (!currentQuestion?.id) {
      console.error('[MainTestUI] Cannot end preparation: no currentQuestion.id available');
      return;
    }
    
    // Dispatch the END_PREPARATION action
    dispatch({ 
      type: 'END_PREPARATION',
      payload: { questionId: currentQuestion.id }
    });
    
    // Also force isPreparationTime to false if needed
    console.log('[MainTestUI] Preparation ended, dispatched END_PREPARATION action');
  }, [currentQuestion?.id, dispatch]);
  
  // Effect to update question timer
  useEffect(() => {
    // This could also handle setting up a timer interval if needed
    if (onQuestionTimerUpdate && typeof timer === 'number') {
      onQuestionTimerUpdate(timer);
    }
  }, [timer, onQuestionTimerUpdate]);
  
  // Handle visibility changes (tab switching)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // User switched away, pause timers, etc.
      } else {
        // User returned, resume timers, etc.
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
  
  // Determine if at end of part
  const isLastQuestionInPart = currentQuestionIndex === totalQuestionsInPart - 1;
  const isLastQuestionInTest = currentPartIndex === 2 && isLastQuestionInPart;
  
  // Preparation time UI (for Part 2 cue cards)
  if (isPreparationTime) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
        <TestSectionHeader 
          sectionLabel={partName}
          currentQuestion={currentQuestionNumber}
          totalQuestions={totalQuestionsInPart}
          overallTimer={overallTimer}
          currentPartNum={partNumber}
          totalParts={3}
          isMuted={isMuted}
          toggleMute={handleToggleMute}
        />
        
        <div className="max-w-3xl mx-auto px-4 pt-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-5 border-b border-gray-100">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-xs font-medium text-indigo-600 uppercase tracking-wider">
                    {partName} - Preparation Time
                  </span>
                  <h2 className="text-xl font-semibold text-gray-800 mt-1">
                    Prepare Your Answer
                  </h2>
                </div>
                
                <div className="flex items-center bg-white bg-opacity-80 px-3 py-1.5 rounded-full shadow-sm">
                  <svg className="h-4 w-4 text-indigo-500 mr-1.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  <span className="text-sm font-medium text-gray-700">
                    {formatTime(overallTimer)}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="px-6 py-8">
              <div className="flex flex-col items-center mb-8">
                <div className="text-center mb-6">
                  <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium mb-2">
                    You have 1 minute to prepare
                  </span>
                  <h3 className="text-lg font-medium text-gray-800">
                    Make notes to help with your response
                  </h3>
                </div>
                
                <div className="w-full max-w-md bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-[2px] shadow-lg">
                  <div className="bg-white rounded-2xl p-6">
                    <p className="font-medium mb-2 text-gray-700">Discuss the following topic:</p>
                    <div className="whitespace-pre-line text-gray-800 text-lg">{currentQuestion.question_text}</div>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col items-center mt-10">
                <PreparationTimer 
                  initialSeconds={currentQuestion.preparation_time_seconds || 60} 
                  onComplete={handleEndPreparation}
                />
                
                <div className="mt-8 flex gap-4">
                  <button
                    onClick={handleToggleMute}
                    className="flex items-center px-4 py-2 bg-white border border-gray-200 rounded-full text-gray-700 hover:bg-gray-50 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:ring-offset-2"
                  >
                    {isMuted ? (
                      <>
                        <svg className="h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                          <line x1="12" y1="19" x2="12" y2="23"></line>
                          <line x1="8" y1="23" x2="16" y2="23"></line>
                        </svg>
                        Unmute Sounds
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                          <line x1="12" y1="19" x2="12" y2="23"></line>
                          <line x1="8" y1="23" x2="16" y2="23"></line>
                        </svg>
                        Mute Sounds
                      </>
                    )}
                  </button>
                  
                  <button 
                    onClick={() => {
                      console.log("[MainTestUI] Skip Preparation button clicked");
                      handleEndPreparation();
                    }}
                    className="group flex items-center px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-full shadow-sm transition-all duration-200 hover:shadow focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    <span>Skip Preparation</span>
                    <svg className="h-4 w-4 ml-2 transition-transform duration-200 group-hover:translate-x-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                      <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Main speaking test UI
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 pb-24">
      <TestSectionHeader 
        sectionLabel={partName}
        currentQuestion={currentQuestionNumber}
        totalQuestions={totalQuestionsInPart}
        overallTimer={overallTimer}
        currentPartNum={partNumber}
        totalParts={3}
        isMuted={isMuted}
        toggleMute={handleToggleMute}
      />
      
      <main className="max-w-3xl mx-auto px-4 pt-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}
        
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8">
          {/* Question header with subtle gradient background */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-5 border-b border-gray-100">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-xs font-medium text-blue-600 uppercase tracking-wider">
                  {partName}
                </span>
                <h2 className="text-xl font-semibold text-gray-800 mt-1">
                  {isPart2 ? 'Cue Card' : 'Question'} {currentQuestionNumber} of {totalQuestionsInPart}
                </h2>
              </div>
              
              <div className="flex items-center bg-white bg-opacity-80 px-3 py-1.5 rounded-full shadow-sm">
                <svg className="h-4 w-4 text-blue-500 mr-1.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span className="text-sm font-medium text-gray-700">
                  {formatTime(overallTimer)}
                </span>
              </div>
            </div>
          </div>
          
          {/* Question content */}
          <div className="px-6 py-6">
            <div className={`${isPart2 
              ? 'border-l-4 border-blue-500 bg-gradient-to-r from-blue-50 to-blue-50 rounded-r-lg' 
              : 'bg-white'} p-5 mb-6`}
            >
              <div className="prose max-w-none">
                <div className="whitespace-pre-line text-gray-800 text-lg">{currentQuestion.question_text}</div>
              </div>
            </div>
            
            {/* Audio recorder with enhanced styling */}
            <div className="mt-8 bg-gray-50 rounded-xl p-5">
              <SimpleAudioRecorder
                key={`recorder-${currentQuestion.id}`}
                questionId={currentQuestion.id}
                duration={currentQuestion.speaking_time_seconds || 60}
                onComplete={handleRecordingComplete}
                onNavigateNext={handleNextQuestion}
              />
              
              {/* Skip remaining time button with improved styling */}
              {!hasRecordedAudio && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={handleSkipRemainingTime}
                    className="group flex items-center px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-full shadow-sm transition-all duration-200 hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    <svg className="h-4 w-4 mr-2 transition-transform duration-200 group-hover:translate-x-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 4 15 12 5 20 5 4"></polygon>
                      <line x1="19" y1="5" x2="19" y2="19"></line>
                    </svg>
                    Skip Remaining Time & Continue
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-wrap justify-between gap-3">
            <button
              onClick={handleToggleMute}
              className="flex items-center px-4 py-2 bg-white border border-gray-200 rounded-full text-gray-700 hover:bg-gray-50 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:ring-offset-2"
            >
              {isMuted ? (
                <>
                  <svg className="h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                  Unmute Sounds
                </>
              ) : (
                <>
                  <svg className="h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                  Mute Sounds
                </>
              )}
            </button>
            
            <div className="flex gap-3">
              {!hasRecordedAudio && (
                <button
                  onClick={handleSkipQuestion}
                  className="flex items-center px-4 py-2 bg-amber-50 border border-amber-200 rounded-full text-amber-700 hover:bg-amber-100 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2"
                >
                  <svg className="h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 4 15 12 5 20 5 4"></polygon>
                    <line x1="19" y1="5" x2="19" y2="19"></line>
                  </svg>
                  Skip Question
                </button>
              )}
              
              {hasRecordedAudio && (
                <button 
                  onClick={handleNextQuestion}
                  className="group flex items-center px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-full shadow-sm transition-all duration-200 hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <span>{isLastQuestionInTest ? 'Finish Test' : 'Next Question'}</span>
                  <svg className="h-4 w-4 ml-2 transition-transform duration-200 group-hover:translate-x-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
        
        {hasRecordedAudio && isLastQuestionInTest && (
          <div className="mt-8 text-center">
            <button 
              onClick={handleFinishTest}
              className="group px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-lg font-medium rounded-full shadow-sm transition-all duration-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              <span className="flex items-center justify-center">
                Finish Test & Submit Responses
                <svg className="h-5 w-5 ml-2 transition-transform duration-200 group-hover:translate-x-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </span>
            </button>
          </div>
        )}
      </main>
      
      {/* Test Submission Dialog with enhanced styling */}
      <Dialog open={isSubmitDialogOpen} onOpenChange={handleSubmitDialogCancel}>
        <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 text-white">
            <h2 className="text-2xl font-semibold mb-2">Submit Test Responses</h2>
            <p className="text-blue-100">
              You've completed all questions! Submit your responses to receive your IELTS band score and feedback.
            </p>
          </div>
          
          <div className="p-6">
            {isSubmitting ? (
              <div className="flex flex-col items-center justify-center py-6">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-blue-100"></div>
                  <div className="absolute top-0 left-0 w-16 h-16 rounded-full border-t-4 border-blue-500 animate-spin"></div>
                </div>
                <p className="mt-4 text-gray-600 font-medium">Processing your responses...</p>
                <p className="text-sm text-gray-500 mt-2">This may take a few moments</p>
              </div>
            ) : (
              <div className="py-2">
                <div className="bg-blue-50 rounded-xl p-4 mb-6">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-blue-700">
                        Once submitted, you'll get detailed feedback on your performance across all IELTS speaking criteria.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row-reverse gap-3 mt-6">
                  <button 
                    onClick={handleSubmitDialogConfirm}
                    className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium rounded-lg shadow-sm transition-all duration-200 hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Submit Responses
                  </button>
                  <button
                    onClick={handleSubmitDialogCancel}
                    className="w-full sm:w-auto px-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MainTestUI; 