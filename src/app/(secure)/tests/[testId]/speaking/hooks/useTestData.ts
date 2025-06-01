import { useState, useEffect, useCallback } from 'react'
import { TestInfo, TestQuestion, UserResponse } from '../types'

interface UseTestDataReturn {
  testInfo: TestInfo | null
  questions: TestQuestion[]
  userResponses: Record<string, UserResponse>
  isLoading: boolean
  error: string | null
  currentPartIndex: number
  currentQuestionIndex: number
  currentQuestion: TestQuestion | null
  refetch: () => void
}

interface UseTestDataProps {
  testId: string | undefined
  supabaseUserId: string | null
  supabase: any
}

export function useTestData({ testId, supabaseUserId, supabase }: UseTestDataProps): UseTestDataReturn {
  const [testInfo, setTestInfo] = useState<TestInfo | null>(null)
  const [questions, setQuestions] = useState<TestQuestion[]>([])
  const [userResponses, setUserResponses] = useState<Record<string, UserResponse>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPartIndex, setCurrentPartIndex] = useState(0)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)

  const determineCurrentPosition = useCallback((
    questions: TestQuestion[], 
    responses: Record<string, UserResponse>
  ) => {
    // Find the first unanswered question
    for (let part = 1; part <= 3; part++) {
      const partQuestions = questions.filter(q => q.part_number === part)
      const firstUnanswered = partQuestions.findIndex(q => !responses[q.id])
      
      if (firstUnanswered !== -1) {
        return {
          partIndex: part - 1,
          questionIndex: firstUnanswered
        }
      }
    }
    
    // All questions answered, stay at last question
    return {
      partIndex: 2,
      questionIndex: Math.max(0, questions.filter(q => q.part_number === 3).length - 1)
    }
  }, [])

  const loadTestData = useCallback(async () => {
    if (!testId || !supabase) return

    try {
      setIsLoading(true)
      setError(null)

      console.log('[useTestData] Loading test data for:', testId)

      // Load test info and questions in parallel
      const [testResult, questionsResult] = await Promise.all([
        supabase
          .from('cambridge_tests')
          .select('id, title, description, part1_duration_seconds, part2_duration_seconds, part2_preparation_seconds, part3_duration_seconds')
          .eq('id', testId)
          .single(),
        supabase
          .from('test_questions')
          .select('id, part_number, sequence_number, question_text, question_type, topic')
          .eq('cambridge_test_id', testId)
          .order('sequence_number', { ascending: true })
      ])

      if (testResult.error) {
        throw new Error(`Failed to load test: ${testResult.error.message}`)
      }

      if (questionsResult.error) {
        throw new Error(`Failed to load questions: ${questionsResult.error.message}`)
      }

      if (!testResult.data) {
        throw new Error('Test not found')
      }

      if (!questionsResult.data || questionsResult.data.length === 0) {
        throw new Error('No questions found for this test')
      }

      // Process questions with timing information
      const processedQuestions = questionsResult.data.map((q: any) => ({
        ...q,
        question_number: q.sequence_number,
        preparation_time_seconds: q.part_number === 2 ? (testResult.data.part2_preparation_seconds || 60) : 0,
        speaking_time_seconds: 
          q.part_number === 1 ? testResult.data.part1_duration_seconds || 60 :
          q.part_number === 2 ? testResult.data.part2_duration_seconds || 120 :
          testResult.data.part3_duration_seconds || 60
      }))

      // Load previous responses if user is authenticated
      let responsesMap: Record<string, UserResponse> = {}
      
      if (supabaseUserId && supabaseUserId !== 'anonymous') {
        console.log('[useTestData] Loading previous responses for user:', supabaseUserId)
        
        const { data: responsesData, error: responsesError } = await supabase
          .from('user_responses')
          .select('id, test_question_id, audio_url, transcript, status')
          .eq('user_id', supabaseUserId)
          .in('test_question_id', processedQuestions.map((q: any) => q.id))

        if (responsesError) {
          console.warn('[useTestData] Error loading previous responses:', responsesError.message)
        } else if (responsesData) {
          responsesData.forEach((response: any) => {
            if (response.test_question_id) {
              responsesMap[response.test_question_id] = {
                id: response.id,
                test_question_id: response.test_question_id,
                status: response.status || 'in_progress',
                audio_url: response.audio_url,
                transcript: response.transcript,
              }
            }
          })
          console.log('[useTestData] Loaded', Object.keys(responsesMap).length, 'previous responses')
        }
      }

      // Determine current position
      const { partIndex, questionIndex } = determineCurrentPosition(processedQuestions, responsesMap)

      setTestInfo(testResult.data)
      setQuestions(processedQuestions)
      setUserResponses(responsesMap)
      setCurrentPartIndex(partIndex)
      setCurrentQuestionIndex(questionIndex)

      console.log('[useTestData] Test data loaded successfully')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load test data'
      setError(errorMessage)
      console.error('[useTestData] Error loading test data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [testId, supabaseUserId, supabase, determineCurrentPosition])

  const refetch = useCallback(() => {
    loadTestData()
  }, [loadTestData])

  // Load data when dependencies change
  useEffect(() => {
    loadTestData()
  }, [loadTestData])

  // Calculate current question
  const currentQuestion = questions.length > 0 && currentPartIndex !== -1 ? 
    questions.filter(q => q.part_number === currentPartIndex + 1)[currentQuestionIndex] || null : null

  return {
    testInfo,
    questions,
    userResponses,
    isLoading,
    error,
    currentPartIndex,
    currentQuestionIndex,
    currentQuestion,
    refetch
  }
} 