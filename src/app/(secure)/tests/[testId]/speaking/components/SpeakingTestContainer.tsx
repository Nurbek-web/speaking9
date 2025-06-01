'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'

// Custom hooks
import { useAuth } from '../hooks/useAuth'
import { useTestData } from '../hooks/useTestData'
import { useAudioRecording } from '../hooks/useAudioRecording'
import { useTestSubmission } from '../hooks/useTestSubmission'

// Types
import { UserResponse, FeedbackResult, TestNavigation, TestProgress, TestQuestion } from '../types'

// UI Components
import TestLoadingScreen from './TestLoadingScreen'
import TestErrorScreen from './TestErrorScreen'
import TestQuestionDisplay from './TestQuestionDisplay'
import TestCompletionScreen from './TestCompletionScreen'
import TestProgressHeader from './TestProgressHeader'
import TestAudioRecording from './TestAudioRecording'
import TestControls from './TestControls'
import TestSubmissionDialog from './TestSubmissionDialog'

// Helper function moved outside component for safety
function getQuestionDuration(question: TestQuestion | null): number {
  if (!question) return 120
  switch (question.part_number) {
    case 1: return 60
    case 2: return 120
    case 3: return 60
    default: return 120
  }
}

export default function SpeakingTestContainer() {
  const router = useRouter()
  const params = useParams()
  const testId = Array.isArray(params.testId) ? params.testId[0] : params.testId

  // Authentication
  const { user, supabaseUserId, supabase, isLoading: authLoading, error: authError } = useAuth()

  // Test data
  const { 
    testInfo, 
    questions, 
    userResponses: initialResponses,
    isLoading: dataLoading,
    error: dataError,
    currentPartIndex: initialPartIndex,
    currentQuestionIndex: initialQuestionIndex,
    currentQuestion: initialCurrentQuestion,
    refetch
  } = useTestData({ testId, supabaseUserId, supabase })

  // Local state for navigation and responses
  const [userResponses, setUserResponses] = useState<Record<string, UserResponse>>({})
  const [currentPartIndex, setCurrentPartIndex] = useState(0)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false)
  const [testCompleted, setTestCompleted] = useState(false)
  const [completionFeedback, setCompletionFeedback] = useState<FeedbackResult | null>(null)
  const [overallTimer, setOverallTimer] = useState(0)

  // Calculate current question
  const currentQuestion = useMemo(() => {
    if (!questions.length) return null
    const partQuestions = questions.filter(q => q.part_number === currentPartIndex + 1)
    return partQuestions[currentQuestionIndex] || null
  }, [questions, currentPartIndex, currentQuestionIndex])

  // Audio recording with safe duration calculation
  const { 
    recordingState, 
    startRecording, 
    stopRecording, 
    cleanup: cleanupRecording,
    isSupported: audioSupported,
    error: audioError
  } = useAudioRecording({
    maxDuration: getQuestionDuration(currentQuestion),
    onRecordingStart: () => {},
    onRecordingStop: () => {},
    onError: (error) => console.error('Audio error:', error)
  })

  // Test submission
  const { submissionState, submitTest, reset: resetSubmission } = useTestSubmission()

  // Initialize responses when data is loaded
  useEffect(() => {
    if (initialResponses && Object.keys(userResponses).length === 0) {
      setUserResponses(initialResponses)
    }
  }, [initialResponses, userResponses])

  // Initialize navigation when data is loaded
  useEffect(() => {
    if (initialPartIndex !== undefined && initialQuestionIndex !== undefined) {
      setCurrentPartIndex(initialPartIndex)
      setCurrentQuestionIndex(initialQuestionIndex)
    }
  }, [initialPartIndex, initialQuestionIndex])

  // Overall timer
  useEffect(() => {
    if (!authLoading && !dataLoading && !testCompleted) {
      const interval = setInterval(() => {
        setOverallTimer(prev => prev + 1)
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [authLoading, dataLoading, testCompleted])

  // Calculate navigation state
  const navigation: TestNavigation = useMemo(() => {
    if (!questions.length || !currentQuestion) {
      return {
        currentPartIndex: 0,
        currentQuestionIndex: 0,
        currentQuestion: null,
        canGoNext: false,
        canGoPrevious: false,
        isLastQuestion: false
      }
    }

    const partQuestions = questions.filter(q => q.part_number === currentPartIndex + 1)
    const isLastQuestionInPart = currentQuestionIndex === partQuestions.length - 1
    const isLastPart = currentPartIndex === 2 // Part 3 is index 2
    const isLastQuestion = isLastQuestionInPart && isLastPart

    return {
      currentPartIndex,
      currentQuestionIndex,
      currentQuestion,
      canGoNext: !isLastQuestion,
      canGoPrevious: currentPartIndex > 0 || currentQuestionIndex > 0,
      isLastQuestion
    }
  }, [questions, currentPartIndex, currentQuestionIndex, currentQuestion])

  // Calculate progress
  const progress: TestProgress = useMemo(() => {
    if (!questions.length) {
      return {
        completedQuestions: 0,
        totalQuestions: 0,
        partProgress: {
          part1: { completed: 0, total: 0 },
          part2: { completed: 0, total: 0 },
          part3: { completed: 0, total: 0 }
        },
        overallPercentage: 0
      }
    }

    const part1Questions = questions.filter(q => q.part_number === 1)
    const part2Questions = questions.filter(q => q.part_number === 2)
    const part3Questions = questions.filter(q => q.part_number === 3)

    const part1Completed = part1Questions.filter(q => userResponses[q.id]?.status === 'completed').length
    const part2Completed = part2Questions.filter(q => userResponses[q.id]?.status === 'completed').length
    const part3Completed = part3Questions.filter(q => userResponses[q.id]?.status === 'completed').length

    const totalCompleted = part1Completed + part2Completed + part3Completed

    return {
      completedQuestions: totalCompleted,
      totalQuestions: questions.length,
      partProgress: {
        part1: { completed: part1Completed, total: part1Questions.length },
        part2: { completed: part2Completed, total: part2Questions.length },
        part3: { completed: part3Completed, total: part3Questions.length }
      },
      overallPercentage: questions.length > 0 ? (totalCompleted / questions.length) * 100 : 0
    }
  }, [questions, userResponses])

  // Handlers
  const handleRecordingComplete = useCallback(async () => {
    if (!currentQuestion) return

    try {
      const audioBlob = await stopRecording()
      if (audioBlob) {
        const audioUrl = URL.createObjectURL(audioBlob)
        
        setUserResponses(prev => ({
          ...prev,
          [currentQuestion.id]: {
            ...prev[currentQuestion.id],
            test_question_id: currentQuestion.id,
            status: 'completed',
            audioBlob,
            audio_url: audioUrl,
            metadata: {
              ...prev[currentQuestion.id]?.metadata,
              recording_duration: recordingState.duration,
              audio_size: audioBlob.size,
              audio_type: audioBlob.type
            }
          }
        }))
      }
    } catch (error) {
      console.error('Error saving recording:', error)
    }
  }, [currentQuestion, stopRecording, recordingState.duration])

  const handleSkipQuestion = useCallback(() => {
    if (!currentQuestion) return

    setUserResponses(prev => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        test_question_id: currentQuestion.id,
        status: 'skipped'
      }
    }))

    navigateToNext()
  }, [currentQuestion])

  const navigateToNext = useCallback(() => {
    if (!questions.length) return

    const partQuestions = questions.filter(q => q.part_number === currentPartIndex + 1)
    
    if (currentQuestionIndex < partQuestions.length - 1) {
      // Next question in same part
      setCurrentQuestionIndex(prev => prev + 1)
    } else if (currentPartIndex < 2) {
      // Next part
      setCurrentPartIndex(prev => prev + 1)
      setCurrentQuestionIndex(0)
    } else {
      // Test completed
      setIsSubmitDialogOpen(true)
    }
  }, [questions, currentPartIndex, currentQuestionIndex])

  const handleSubmitTest = useCallback(async () => {
    if (!testId || !supabaseUserId) return

    try {
      setIsSubmitDialogOpen(false)
      const feedback = await submitTest(userResponses, testId, supabaseUserId)
      
      if (feedback) {
        setCompletionFeedback(feedback)
        setTestCompleted(true)
        cleanupRecording()
      }
    } catch (error) {
      console.error('Test submission error:', error)
    }
  }, [testId, supabaseUserId, userResponses, submitTest, cleanupRecording])

  // Error handling
  const error = authError || dataError || audioError || submissionState.error
  const isLoading = authLoading || dataLoading

  if (isLoading) {
    return <TestLoadingScreen message="Loading test..." />
  }

  if (error) {
    return (
      <TestErrorScreen 
        error={error}
        onRetry={refetch}
        onBack={() => router.push('/tests')}
      />
    )
  }

  if (!audioSupported) {
    return (
      <TestErrorScreen 
        error="Your browser doesn't support audio recording. Please use a modern browser like Chrome, Firefox, or Safari."
        onBack={() => router.push('/tests')}
      />
    )
  }

  if (!testInfo || !questions.length) {
    return (
      <TestErrorScreen 
        error="Test data could not be loaded."
        onRetry={refetch}
        onBack={() => router.push('/tests')}
      />
    )
  }

  if (testCompleted && completionFeedback) {
    return (
      <TestCompletionScreen 
        feedback={completionFeedback}
        testInfo={testInfo}
        userResponses={userResponses}
        onViewResults={() => router.push(`/tests/${testId}/results`)}
        onRetakeTest={() => {
          setTestCompleted(false)
          setCompletionFeedback(null)
          setUserResponses({})
          setCurrentPartIndex(0)
          setCurrentQuestionIndex(0)
          resetSubmission()
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TestProgressHeader 
        testInfo={testInfo}
        progress={progress}
        navigation={navigation}
        overallTimer={overallTimer}
      />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Question Section - Takes up 2 columns on large screens */}
          <div className="lg:col-span-2 space-y-6">
            <TestQuestionDisplay 
              question={currentQuestion}
              navigation={navigation}
              userResponse={currentQuestion ? userResponses[currentQuestion.id] : undefined}
            />
            
            <TestControls 
              navigation={navigation}
              recordingState={recordingState}
              onSkipQuestion={handleSkipQuestion}
              onNextQuestion={navigateToNext}
              onFinishTest={() => setIsSubmitDialogOpen(true)}
              disabled={submissionState.isSubmitting}
            />
          </div>

          {/* Recording Section - Takes up 1 column, sticky on large screens */}
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-32">
              <TestAudioRecording 
                question={currentQuestion}
                recordingState={recordingState}
                onStartRecording={startRecording}
                onStopRecording={handleRecordingComplete}
                disabled={submissionState.isSubmitting}
              />
            </div>
          </div>
        </div>
      </main>

      <TestSubmissionDialog 
        isOpen={isSubmitDialogOpen}
        onClose={() => setIsSubmitDialogOpen(false)}
        onConfirm={handleSubmitTest}
        progress={progress}
        submissionState={submissionState}
      />
    </div>
  )
} 