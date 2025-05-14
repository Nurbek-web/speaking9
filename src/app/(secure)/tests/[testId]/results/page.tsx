'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useUser } from '@clerk/nextjs'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Loader2, AlertCircle, ArrowLeft, BarChart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { clerkToSupabaseId } from '@/lib/clerkSupabaseAdapter'

interface Feedback {
  fluency_coherence_score: number
  lexical_resource_score: number
  grammar_accuracy_score: number
  pronunciation_score: number
}

interface TestQuestion {
  part_number: number
  test_id: string
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
  const supabase = createClientComponentClient()
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TestResult | null>(null)
  
  useEffect(() => {
    async function loadResults() {
      if (!user?.id || !testId) return
      
      try {
        setLoading(true)
        
        // Convert Clerk ID to Supabase compatible UUID
        const supabaseUserId = clerkToSupabaseId(user.id)
        
        // Get test information
        const { data: test, error: testError } = await supabase
          .from('cambridge_tests')
          .select('id, title')
          .eq('id', testId)
          .single()
        
        if (testError) throw testError
        
        // Get user progress for this test
        const { data: progress, error: progressError } = await supabase
          .from('user_progress')
          .select('*')
          .eq('test_id', testId)
          .eq('user_id', supabaseUserId)
          .single()
        
        if (progressError) throw progressError
        
        // Get all responses for this test
        const { data: responses, error: responsesError } = await supabase
          .from('user_responses')
          .select(`
            id,
            transcript,
            test_questions!inner(
              part_number,
              test_id
            ),
            feedback(
              fluency_coherence_score,
              lexical_resource_score,
              grammar_accuracy_score,
              pronunciation_score
            )
          `)
          .eq('user_id', supabaseUserId)
          .eq('test_questions.test_id', testId)
        
        if (responsesError) throw responsesError
        
        // Calculate part scores
        const partScores: Record<number, number[]> = { 1: [], 2: [], 3: [] }
        
        // Calculate category scores
        let totalFluency = 0
        let totalLexical = 0
        let totalGrammar = 0
        let totalPronunciation = 0
        let scoreCount = 0
        
        // Cast responses to the correct type
        const typedResponses = responses as unknown as UserResponse[]
        
        typedResponses.forEach(response => {
          const partNumber = response.test_questions.part_number
          if (response.feedback && response.feedback.length > 0) {
            const fb = response.feedback[0]
            
            // Add to part scores
            const avgScore = (fb.fluency_coherence_score + fb.lexical_resource_score + 
                           fb.grammar_accuracy_score + fb.pronunciation_score) / 4
            
            if (partNumber === 1) {
              partScores[1].push(avgScore)
            } else if (partNumber === 2) {
              partScores[2].push(avgScore)
            } else if (partNumber === 3) {
              partScores[3].push(avgScore)
            }
            
            // Add to category totals
            totalFluency += fb.fluency_coherence_score
            totalLexical += fb.lexical_resource_score
            totalGrammar += fb.grammar_accuracy_score
            totalPronunciation += fb.pronunciation_score
            scoreCount++
          }
        })
        
        // Calculate averages
        const getAverage = (scores: number[]): number | undefined => {
          if (scores.length === 0) return undefined
          return scores.reduce((sum, score) => sum + score, 0) / scores.length
        }
        
        const testResult: TestResult = {
          test_id: test.id,
          test_title: test.title,
          completed_questions: progress.completed_questions,
          total_questions: progress.total_questions,
          average_band_score: progress.average_band_score || 0,
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
  }, [user, testId, supabase])
  
  if (loading) {
    return (
      <ProtectedRoute>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600" />
          <p className="mt-4 text-lg">Loading test results...</p>
        </div>
      </ProtectedRoute>
    )
  }
  
  if (error) {
    return (
      <ProtectedRoute>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <p className="mt-4 text-lg">Error: {error}</p>
          <Button className="mt-4" onClick={() => router.push('/tests')}>
            Back to Tests
          </Button>
        </div>
      </ProtectedRoute>
    )
  }
  
  if (!result) {
    return (
      <ProtectedRoute>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <AlertCircle className="h-12 w-12 text-yellow-500" />
          <p className="mt-4 text-lg">No results found for this test.</p>
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
            <h1 className="text-3xl font-bold">Test Results</h1>
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
                  <h2 className="text-lg font-medium mb-2">Overall Band Score</h2>
                  <div className="text-5xl font-bold text-indigo-600">{result.average_band_score.toFixed(1)}</div>
                </div>
                <div className="w-40 h-40 rounded-full bg-indigo-50 flex items-center justify-center">
                  <BarChart className="h-16 w-16 text-indigo-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <h2 className="text-2xl font-bold mb-4">Detailed Analysis</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>Performance by Part</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span>Part 1: Introduction</span>
                      {result.part1_average !== undefined ? (
                        <span className="font-bold">{result.part1_average.toFixed(1)}</span>
                      ) : (
                        <span className="text-gray-400">No data</span>
                      )}
                    </div>
                    {result.part1_average !== undefined && (
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(result.part1_average / 9) * 100}%` }}></div>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span>Part 2: Long Turn</span>
                      {result.part2_average !== undefined ? (
                        <span className="font-bold">{result.part2_average.toFixed(1)}</span>
                      ) : (
                        <span className="text-gray-400">No data</span>
                      )}
                    </div>
                    {result.part2_average !== undefined && (
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full" style={{ width: `${(result.part2_average / 9) * 100}%` }}></div>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span>Part 3: Discussion</span>
                      {result.part3_average !== undefined ? (
                        <span className="font-bold">{result.part3_average.toFixed(1)}</span>
                      ) : (
                        <span className="text-gray-400">No data</span>
                      )}
                    </div>
                    {result.part3_average !== undefined && (
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${(result.part3_average / 9) * 100}%` }}></div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Category Scores</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span>Fluency & Coherence</span>
                      <span className="font-bold">{result.category_scores.fluency_coherence_score.toFixed(1)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-yellow-500 h-2 rounded-full" style={{ width: `${(result.category_scores.fluency_coherence_score / 9) * 100}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span>Lexical Resource</span>
                      <span className="font-bold">{result.category_scores.lexical_resource_score.toFixed(1)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-red-500 h-2 rounded-full" style={{ width: `${(result.category_scores.lexical_resource_score / 9) * 100}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span>Grammar Range & Accuracy</span>
                      <span className="font-bold">{result.category_scores.grammar_accuracy_score.toFixed(1)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${(result.category_scores.grammar_accuracy_score / 9) * 100}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span>Pronunciation</span>
                      <span className="font-bold">{result.category_scores.pronunciation_score.toFixed(1)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-teal-500 h-2 rounded-full" style={{ width: `${(result.category_scores.pronunciation_score / 9) * 100}%` }}></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={() => router.push('/tests')}
            >
              Back to Tests
            </Button>
            <Button 
              onClick={() => router.push(`/tests/${testId}/speaking`)}
            >
              Retake Test
            </Button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
} 