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
  
  // Preparation mode UI (Part 2 preparation time)
  if (isPreparationTime) {
    return (
      <div className="min-h-screen bg-gray-50 pb-8">
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
        
        <div className="max-w-3xl mx-auto px-4 pt-6">
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-1">Preparation Time</h2>
            <p className="text-sm text-gray-600 mb-4">
              You have {currentQuestion.preparation_time_seconds || 60} seconds to prepare your answer for Part 2.
            </p>
            
            <div className="border-l-4 border-indigo-500 bg-indigo-50 p-4 my-6">
              <div className="prose max-w-none">
                <p className="font-medium mb-2">Discuss the following topic:</p>
                <div className="whitespace-pre-line">{currentQuestion.question_text}</div>
              </div>
            </div>
            
            <PreparationTimer 
              initialSeconds={currentQuestion.preparation_time_seconds || 60} 
              onComplete={handleEndPreparation}
            />
            
            <div className="mt-4 flex justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleMute}
                className="flex items-center"
              >
                {isMuted ? <VolumeX className="h-4 w-4 mr-1" /> : <Volume2 className="h-4 w-4 mr-1" />}
                {isMuted ? 'Unmute' : 'Mute'} Sounds
              </Button>
              
              <Button 
                onClick={() => {
                  console.log("[MainTestUI] Skip Preparation button clicked");
                  handleEndPreparation();
                }}
                size="sm"
              >
                Skip Preparation
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Main speaking test UI
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
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
      
      <main className="max-w-3xl mx-auto px-4 pt-6">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-xl font-semibold text-gray-800">
              {isPart2 ? 'Cue Card' : 'Question'} {currentQuestionNumber} of {totalQuestionsInPart}
            </h2>
            
            <div className="flex items-center">
              <Clock className="h-4 w-4 text-gray-500 mr-1" />
              <span className="text-sm text-gray-500">
                {formatTime(overallTimer)}
              </span>
            </div>
          </div>
          
          <div className={`${isPart2 ? 'border-l-4 border-indigo-500 bg-indigo-50' : ''} p-4 mb-6`}>
            <div className="prose max-w-none">
              <div className="whitespace-pre-line">{currentQuestion.question_text}</div>
            </div>
          </div>
          
          <div className="mt-6">
            <SimpleAudioRecorder
              key={`recorder-${currentQuestion.id}`}
              questionId={currentQuestion.id}
              duration={currentQuestion.speaking_time_seconds || 60}
              onComplete={handleRecordingComplete}
              onNavigateNext={handleNextQuestion}
            />
            
            {/* Add Skip Remaining Time button when recording is in progress */}
            {!hasRecordedAudio && (
              <div className="mt-4 flex justify-center">
                <Button
                  onClick={handleSkipRemainingTime}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2"
                  size="sm"
                >
                  <SkipForward className="h-4 w-4 mr-2" />
                  Skip Remaining Time & Continue
                </Button>
              </div>
            )}
          </div>
          
          <div className="mt-6 flex flex-wrap justify-between gap-2">
            <Button
              variant="outline"
              onClick={handleToggleMute}
              className="flex items-center"
            >
              {isMuted ? <VolumeX className="h-4 w-4 mr-1" /> : <Volume2 className="h-4 w-4 mr-1" />}
              {isMuted ? 'Unmute' : 'Mute'} Sounds
            </Button>
            
            <div className="flex gap-2">
              {!hasRecordedAudio && (
                <Button
                  variant="outline"
                  onClick={handleSkipQuestion}
                  className="flex items-center text-amber-600 border-amber-300 hover:bg-amber-50"
                >
                  <SkipForward className="h-4 w-4 mr-1" />
                  Skip Question Completely
                </Button>
              )}
              
              {hasRecordedAudio && (
                <Button 
                  onClick={handleNextQuestion}
                  className="flex items-center"
                >
                  {isLastQuestionInTest ? 'Finish Test' : 'Next Question'} →
                </Button>
              )}
            </div>
          </div>
        </div>
        
        {hasRecordedAudio && isLastQuestionInTest && (
          <div className="mt-4 text-center">
            <Button 
              size="lg"
              onClick={handleFinishTest}
              className="px-8 py-6 h-auto text-lg"
            >
              Finish Test & Submit Responses
            </Button>
          </div>
        )}
      </main>
      
      {/* Test Submission Dialog */}
      <Dialog open={isSubmitDialogOpen} onOpenChange={handleSubmitDialogCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Test Responses</DialogTitle>
            <DialogDescription>
              You've completed all questions! Submit your responses to receive your IELTS band score and feedback.
            </DialogDescription>
          </DialogHeader>
          
          <div className="my-4">
            <p className="text-sm text-gray-600 mb-4">
              {isSubmitting ? (
                <span className="flex items-center">
                  <span className="animate-pulse mr-2">●</span>
                  Processing your responses...
                </span>
              ) : (
                "Once submitted, you'll get detailed feedback on your performance."
              )}
            </p>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleSubmitDialogCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitDialogConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Responses'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MainTestUI; 