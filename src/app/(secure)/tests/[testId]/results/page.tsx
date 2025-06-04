'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Loader2, AlertCircle, ArrowLeft, BarChart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { clerkToSupabaseId } from '@/lib/clerkSupabaseAdapter'
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth'

interface Feedback {
  fluency_score: number
  lexical_resource_score: number
  grammar_score: number
  pronunciation_score: number
  band_score: number
}

interface TestQuestion {
  part_number: number
  cambridge_test_id: string
}

interface UserResponse {
  id: string
  transcript: string | null
  test_questions: TestQuestion
  feedback: Feedback[] | null
}

type TestResult = {
  test_id: string
  test_title: string
  completed_questions: number
  total_questions: number
  average_band_score: number
  part1_average?: number
  part2_average?: number
  part3_average?: number
  category_scores: {
    fluency_coherence_score: number
    lexical_resource_score: number
    grammar_accuracy_score: number
    pronunciation_score: number
  }
}

export default function TestResultsPage() {
  const router = useRouter()
  const { testId } = useParams() as { testId: string }
  const { user } = useUser()
  const { supabase, loading: supabaseLoading, error: supabaseError } = useSupabaseAuth()
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TestResult | null>(null)
  
  useEffect(() => {
    async function loadResults() {
      if (!user?.id || !testId || !supabase || supabaseLoading) return
      
      try {
        setLoading(true)
        setError(null)
        
        // Convert Clerk ID to Supabase compatible UUID (for database compatibility)
        const supabaseUserId = clerkToSupabaseId(user.id)
        
        console.log('[TestResults] Loading test results for:', { testId, userId: user.id, supabaseUserId })
        
        // Get test information
        const { data: test, error: testError } = await supabase
          .from('cambridge_tests')
          .select('id, title')
          .eq('id', testId)
          .single()
        
        if (testError) {
          console.error('[TestResults] Error loading test:', testError)
          throw new Error(`Failed to load test: ${testError.message}`)
        }
        
        if (!test) {
          throw new Error('Test not found')
        }
        
        // Get total question count for this test
        const { data: questionCount, error: questionCountError } = await supabase
          .from('test_questions')
          .select('id', { count: 'exact' })
          .eq('cambridge_test_id', testId)
        
        if (questionCountError) {
          console.error('[TestResults] Error loading question count:', questionCountError)
          throw new Error(`Failed to load question count: ${questionCountError.message}`)
        }
        
        const totalQuestions = questionCount?.length || 0
        
        // Get all user responses for this test using converted UUID
        const { data: responses, error: responsesError } = await supabase
          .from('user_responses')
          .select(`
            id,
            transcript,
            status,
            test_questions!inner(
              part_number,
              cambridge_test_id
            ),
            feedback(
              fluency_score,
              lexical_resource_score,
              grammar_score,
              pronunciation_score,
              band_score
            )
          `)
          .eq('user_id', supabaseUserId)
          .eq('test_questions.cambridge_test_id', testId)
        
        if (responsesError) {
          console.error('[TestResults] Error loading responses:', responsesError)
          throw new Error(`Failed to load responses: ${responsesError.message}`)
        }
        
        // If no responses found, user hasn't completed any questions
        if (!responses || responses.length === 0) {
          throw new Error('No responses found for this test. Please complete the test first.')
        }
        
        // Calculate completed questions (those with responses)
        const completedQuestions = responses.length
        
        // Calculate part scores
        const partScores: Record<number, number[]> = { 1: [], 2: [], 3: [] }
        
        // Calculate category scores
        let totalFluency = 0
        let totalLexical = 0
        let totalGrammar = 0
        let totalPronunciation = 0
        let totalBandScore = 0
        let scoreCount = 0
        
        // Cast responses to the correct type
        const typedResponses = responses as unknown as UserResponse[]
        
        typedResponses.forEach(response => {
          const partNumber = response.test_questions.part_number
          if (response.feedback && response.feedback.length > 0) {
            const fb = response.feedback[0]
            
            // Add to part scores using band_score
            if (fb.band_score && fb.band_score > 0) {
              if (partNumber === 1) {
                partScores[1].push(fb.band_score)
              } else if (partNumber === 2) {
                partScores[2].push(fb.band_score)
              } else if (partNumber === 3) {
                partScores[3].push(fb.band_score)
              }
              
              // Add to category totals
              totalFluency += fb.fluency_score || 0
              totalLexical += fb.lexical_resource_score || 0
              totalGrammar += fb.grammar_score || 0
              totalPronunciation += fb.pronunciation_score || 0
              totalBandScore += fb.band_score
              scoreCount++
            }
          }
        })
        
        // If no scores found, show that the test has no feedback yet
        if (scoreCount === 0) {
          throw new Error('No feedback available for this test yet. Responses may still be processing.')
        }
        
        // Calculate averages
        const getAverage = (scores: number[]): number | undefined => {
          if (scores.length === 0) return undefined
          return scores.reduce((sum, score) => sum + score, 0) / scores.length
        }
        
        const testResult: TestResult = {
          test_id: test.id,
          test_title: test.title,
          completed_questions: completedQuestions,
          total_questions: totalQuestions,
          average_band_score: scoreCount > 0 ? totalBandScore / scoreCount : 0,
          part1_average: getAverage(partScores[1]),
          part2_average: getAverage(partScores[2]),
          part3_average: getAverage(partScores[3]),
          category_scores: {
            fluency_coherence_score: scoreCount > 0 ? totalFluency / scoreCount : 0,
            lexical_resource_score: scoreCount > 0 ? totalLexical / scoreCount : 0,
            grammar_accuracy_score: scoreCount > 0 ? totalGrammar / scoreCount : 0,
            pronunciation_score: scoreCount > 0 ? totalPronunciation / scoreCount : 0
          }
        }
        
        setResult(testResult)
        setLoading(false)
      } catch (err: any) {
        console.error('Error loading test results:', err)
        setError(err.message || 'Failed to load test results')
        setLoading(false)
      }
    }
    
    loadResults()
  }, [user, testId, supabase, supabaseLoading])

  // Handle Supabase authentication errors
  useEffect(() => {
    if (supabaseError) {
      setError(`Authentication error: ${supabaseError}`)
      setLoading(false)
    }
  }, [supabaseError])
  
  if (loading || supabaseLoading) {
    return (
      <ProtectedRoute>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600" />
          <p className="mt-4 text-lg text-muted-foreground">Loading test results...</p>
        </div>
      </ProtectedRoute>
    )
  }
  
  if (error) {
    return (
      <ProtectedRoute>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <p className="mt-4 text-lg text-foreground">Error: {error}</p>
          <div className="mt-4 space-x-4">
            <Button onClick={() => router.push('/tests')}>
              Back to Tests
            </Button>
            <Button variant="outline" onClick={() => router.push(`/tests/${testId}/speaking`)}>
              Take Test
            </Button>
          </div>
        </div>
      </ProtectedRoute>
    )
  }
  
  if (!result) {
    return (
      <ProtectedRoute>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <AlertCircle className="h-12 w-12 text-yellow-500" />
          <p className="mt-4 text-lg text-foreground">No results found for this test.</p>
          <Button className="mt-4" onClick={() => router.push('/tests')}>
            Back to Tests
          </Button>
        </div>
      </ProtectedRoute>
    )
  }
  
  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-foreground">Test Results</h1>
            <Button 
              variant="outline" 
              className="flex items-center gap-2" 
              onClick={() => router.push('/tests')}
            >
              <ArrowLeft size={18} />
              Back to Tests
            </Button>
          </div>
          
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>{result.test_title}</CardTitle>
              <CardDescription>
                {result.completed_questions} of {result.total_questions} questions completed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-medium mb-2 text-card-foreground">Overall Band Score</h2>
                  <div className="text-5xl font-bold text-indigo-600 dark:text-indigo-400">{result.average_band_score.toFixed(1)}</div>
                </div>
                <div className="w-40 h-40 rounded-full bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center">
                  <BarChart className="h-16 w-16 text-indigo-600 dark:text-indigo-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <h2 className="text-2xl font-bold mb-4 text-foreground">Detailed Analysis</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>Performance by Part</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-card-foreground">Part 1: Introduction & Interview</span>
                    <span className="font-semibold text-card-foreground">
                      {result.part1_average ? result.part1_average.toFixed(1) : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-card-foreground">Part 2: Long Turn</span>
                    <span className="font-semibold text-card-foreground">
                      {result.part2_average ? result.part2_average.toFixed(1) : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-card-foreground">Part 3: Discussion</span>
                    <span className="font-semibold text-card-foreground">
                      {result.part3_average ? result.part3_average.toFixed(1) : 'N/A'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Performance by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-card-foreground">Fluency & Coherence</span>
                    <span className="font-semibold text-card-foreground">
                      {result.category_scores.fluency_coherence_score.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-card-foreground">Lexical Resource</span>
                    <span className="font-semibold text-card-foreground">
                      {result.category_scores.lexical_resource_score.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-card-foreground">Grammar Range & Accuracy</span>
                    <span className="font-semibold text-card-foreground">
                      {result.category_scores.grammar_accuracy_score.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-card-foreground">Pronunciation</span>
                    <span className="font-semibold text-card-foreground">
                      {result.category_scores.pronunciation_score.toFixed(1)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="flex justify-center">
            <Button onClick={() => router.push('/tests')}>
              Take Another Test
            </Button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
} 