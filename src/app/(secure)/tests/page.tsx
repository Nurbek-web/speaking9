'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import ProtectedRoute from '@/components/ProtectedRoute'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Loader2, AlertTriangle } from 'lucide-react'
import { clerkToSupabaseId } from '@/lib/clerkSupabaseAdapter'

type Test = {
  test_id: string
  id?: string
  book_number: number
  test_number: number
  title: string
  description: string | null
  total_questions: number
  status?: 'not_started' | 'in_progress' | 'completed'
  average_band_score?: number | null
  difficulty_level?: string | null
}

export default function TestsPage() {
  const { user } = useUser()
  const router = useRouter()
  const [tests, setTests] = useState<Test[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClientComponentClient()
  
  useEffect(() => {
    async function loadTests() {
      if (!user?.id) return
      setError(null)
      setLoading(true)
      try {
        // Convert Clerk ID to Supabase compatible UUID
        const supabaseUserId = clerkToSupabaseId(user.id)
        
        const { data: allTestsData, error: testsError } = await supabase
          .from('complete_tests')
          .select('id, book_number, test_number, title, description, difficulty_level, part1_question_count, part2_question_count, part3_question_count')
        
        if (testsError) throw testsError
        const allTests = allTestsData as any[] | null
        if (!allTests) throw new Error("Failed to fetch tests or no tests found.")
        
        const { data: userProgress, error: progressError } = await supabase
          .from('user_progress_detailed')
          .select('*')
          .eq('user_id', supabaseUserId)
        
        if (progressError) {
            console.warn('Could not load user progress, tests will appear as not started:', progressError)
        }
        
        const testsWithProgress: Test[] = allTests.map(fetchedTest => {
          const currentTestId = fetchedTest.id as string

          if (typeof currentTestId !== 'string' || currentTestId.trim() === '' || currentTestId.toLowerCase() === 'undefined') {
            console.warn('Invalid or missing id found in fetched test data:', fetchedTest)
            return null
          }

          const progress = userProgress?.find(p => p.test_id === currentTestId)
          const total_questions =
            (fetchedTest.part1_question_count || 0) +
            (fetchedTest.part2_question_count || 0) +
            (fetchedTest.part3_question_count || 0)

          return {
            test_id: currentTestId,
            book_number: fetchedTest.book_number,
            test_number: fetchedTest.test_number,
            title: fetchedTest.title,
            description: fetchedTest.description,
            difficulty_level: fetchedTest.difficulty_level,
            total_questions: total_questions,
            status: progress?.status || 'not_started',
            average_band_score: progress?.average_band_score || null,
          }
        }).filter(Boolean) as Test[]
        
        setTests(testsWithProgress)
      } catch (err: any) {
        console.error('Error loading tests:', err)
        setError(err.message || "An unexpected error occurred while fetching tests.")
      } finally {
        setLoading(false)
      }
    }
    
    loadTests()
  }, [user, supabase])
  
  const handleStartTest = (testId: string | undefined | null) => {
    if (typeof testId !== 'string' || !testId || testId.toLowerCase() === 'undefined') {
      console.error('handleStartTest called with invalid testId:', testId)
      setError("Cannot start test: Invalid Test ID provided by the test item.")
      return
    }
    router.push(`/tests/${testId}/speaking`)
  }
  
  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">IELTS Speaking Tests</h1>
          
          <p className="mb-6">
            Welcome{user?.emailAddresses?.[0]?.emailAddress ? `, ${user.emailAddresses[0].emailAddress}` : ''}! Select a test to start practicing.
          </p>
          
          {error && (
            <div className="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
              <p><strong>Error:</strong> {error}</p>
            </div>
          )}
          
          {loading ? (
            <div className="flex justify-center my-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tests.length === 0 && !error ? (
                <p>No speaking tests available at the moment.</p>
              ) : (
                tests.map((test) => {
                  if (!test || typeof test.test_id !== 'string' || test.test_id.trim() === '' || test.test_id.toLowerCase() === 'undefined') {
                    return (
                      <div key={test?.test_id || Math.random()} className="border border-red-300 rounded-lg p-6 bg-red-50">
                        <div className="flex items-center mb-2">
                          <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
                          <h2 className="text-lg font-semibold text-red-700">Invalid Test Data</h2>
                        </div>
                        <p className="text-sm text-red-600">This test item could not be loaded due to missing or invalid ID.</p>
                        <p className="text-xs text-gray-500 mt-1">Problematic ID: {String(test?.test_id)}</p>
                      </div>
                    )
                  }
                  return (
                    <div 
                      key={test.test_id} 
                      className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
                    >
                      <h2 className="text-xl font-semibold mb-2">{test.title}</h2>
                      {test.description && (
                        <p className="text-sm text-gray-500 mb-4">{test.description}</p>
                      )}
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-sm text-gray-500">
                            {test.status === 'completed' ? 'Completed' : 
                             test.status === 'in_progress' ? 'In Progress' : 
                             'Not Started'}
                          </span>
                          {test.average_band_score && (
                            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Band {test.average_band_score.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <button 
                          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                          onClick={() => handleStartTest(test.test_id)}
                        >
                          {test.status === 'completed' ? 'Retake Test' : 
                           test.status === 'in_progress' ? 'Continue' : 
                           'Start Test'}
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
} 