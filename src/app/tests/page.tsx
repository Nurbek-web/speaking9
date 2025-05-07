'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Loader2 } from 'lucide-react'

type Test = {
  test_id: string
  book_number: number
  test_number: number
  title: string
  description: string | null
  total_questions: number
  status?: 'not_started' | 'in_progress' | 'completed'
  average_band_score?: number | null
}

export default function TestsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [tests, setTests] = useState<Test[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClientComponentClient()
  
  useEffect(() => {
    async function loadTests() {
      if (!user?.id) return
      
      try {
        // Fetch all available tests
        const { data: allTests, error: testsError } = await supabase
          .from('complete_tests')
          .select('*')
        
        if (testsError) throw testsError
        
        // Fetch user progress for these tests
        const { data: userProgress, error: progressError } = await supabase
          .from('user_progress_detailed')
          .select('*')
          .eq('user_id', user.id)
        
        if (progressError) throw progressError
        
        // Merge the data
        const testsWithProgress = allTests.map(test => {
          const progress = userProgress?.find(p => p.test_id === test.test_id)
          return {
            ...test,
            status: progress?.status || 'not_started',
            average_band_score: progress?.average_band_score || null
          }
        })
        
        setTests(testsWithProgress)
      } catch (error) {
        console.error('Error loading tests:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadTests()
  }, [user, supabase])
  
  const handleStartTest = (testId: string) => {
    router.push(`/tests/${testId}/speaking`)
  }
  
  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">IELTS Speaking Tests</h1>
          
          <p className="mb-6">
            Welcome{user?.email ? `, ${user.email}` : ''}! Select a test to start practicing.
          </p>
          
          {loading ? (
            <div className="flex justify-center my-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tests.length === 0 ? (
                <p>No speaking tests available at the moment.</p>
              ) : (
                tests.map((test) => (
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
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
} 