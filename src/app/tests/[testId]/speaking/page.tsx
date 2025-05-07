'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useAuth } from '@/context/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Loader2, Mic, Square, Play, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import storageService from '@/lib/storage'

// Types
type TestQuestion = {
  id: string
  part_number: number
  question_number: number
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
}

type UserResponse = {
  id?: string
  status: 'not_started' | 'in_progress' | 'completed'
  audio_url?: string
  transcript?: string
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
  const { testId } = useParams() as { testId: string }
  const { user } = useAuth()
  const supabase = createClientComponentClient()
  
  // State variables
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [testInfo, setTestInfo] = useState<TestInfo | null>(null)
  const [questions, setQuestions] = useState<TestQuestion[]>([])
  const [currentPartIndex, setCurrentPartIndex] = useState(0) // 0, 1, 2 for Parts 1, 2, 3
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [partQuestions, setPartQuestions] = useState<TestQuestion[]>([])
  const [timer, setTimer] = useState<number | null>(null)
  const [isPreparationTime, setIsPreparationTime] = useState(false)
  const [prepTimer, setPrepTimer] = useState<number | null>(null)
  
  // Audio recording states
  const [isRecording, setIsRecording] = useState(false)
  const [audioURL, setAudioURL] = useState<string | null>(null)
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'stopped' | 'processing' | 'completed' | 'error'>('idle')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  
  // Feedback state
  const [feedback, setFeedback] = useState<FeedbackResult | null>(null)
  const [userResponses, setUserResponses] = useState<Record<string, UserResponse>>({})
  
  // Load test details and questions
  useEffect(() => {
    async function loadTestData() {
      if (!user?.id || !testId) return
      
      try {
        setLoading(true)
        
        // Ensure storage bucket exists
        await storageService.ensureBucketExists()
        
        // Load test info
        const { data: testData, error: testError } = await supabase
          .from('cambridge_tests')
          .select('id, title, description')
          .eq('id', testId)
          .single()
        
        if (testError) throw testError
        setTestInfo(testData)
        
        // Load questions for this test
        const { data: questionsData, error: questionsError } = await supabase
          .from('test_questions')
          .select('*')
          .eq('test_id', testId)
          .order('part_number')
          .order('question_number')
        
        if (questionsError) throw questionsError
        setQuestions(questionsData)
        
        // Load user's existing responses
        const { data: responsesData, error: responsesError } = await supabase
          .from('user_responses')
          .select('id, question_id, audio_url, transcript, status')
          .eq('user_id', user.id)
          .in(
            'question_id', 
            questionsData.map((q: TestQuestion) => q.id)
          )
        
        if (responsesError) throw responsesError
        
        // Convert to a map for easier access
        const responsesMap: Record<string, UserResponse> = {}
        responsesData?.forEach((response: any) => {
          responsesMap[response.question_id] = {
            id: response.id,
            audio_url: response.audio_url,
            transcript: response.transcript,
            status: response.status
          }
        })
        
        setUserResponses(responsesMap)
        
        // Initialize with Part 1
        const part1Questions = questionsData.filter((q: TestQuestion) => q.part_number === 1)
        setPartQuestions(part1Questions)
        setCurrentPartIndex(0)
        setCurrentQuestionIndex(0)
        
        setLoading(false)
      } catch (err: any) {
        console.error('Error loading test data:', err)
        setError(err.message || 'Failed to load test data')
        setLoading(false)
      }
    }
    
    loadTestData()
  }, [user, testId, supabase])
  
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
    setFeedback(null)
  }, [currentPartIndex, questions])
  
  // Timer effect
  useEffect(() => {
    if (timer === null) return
    
    const interval = setInterval(() => {
      setTimer(prevTimer => {
        if (prevTimer === null || prevTimer <= 0) {
          clearInterval(interval)
          if (isRecording) {
            stopRecording()
          }
          return 0
        }
        return prevTimer - 1
      })
    }, 1000)
    
    return () => clearInterval(interval)
  }, [timer, isRecording])
  
  // Preparation timer effect for Part 2
  useEffect(() => {
    if (prepTimer === null || !isPreparationTime) return
    
    const interval = setInterval(() => {
      setPrepTimer(prevTimer => {
        if (prevTimer === null || prevTimer <= 0) {
          clearInterval(interval)
          setIsPreparationTime(false)
          // Start recording automatically after prep time
          startRecording()
          return 0
        }
        return prevTimer - 1
      })
    }, 1000)
    
    return () => clearInterval(interval)
  }, [prepTimer, isPreparationTime])
  
  // Audio recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      audioChunksRef.current = []
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        const url = URL.createObjectURL(audioBlob)
        setAudioURL(url)
        setRecordingStatus('stopped')
      }
      
      mediaRecorderRef.current.start()
      setIsRecording(true)
      setRecordingStatus('recording')
      
      // Start the timer
      const currentQuestion = partQuestions[currentQuestionIndex]
      setTimer(currentQuestion.speaking_time_seconds)
    } catch (err) {
      console.error('Error starting recording:', err)
      setError('Failed to start recording. Please make sure microphone access is allowed.')
      setRecordingStatus('error')
    }
  }
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      
      // Stop all tracks on the stream
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
    }
  }
  
  // Submit response for evaluation
  const submitResponse = async () => {
    if (!audioURL || !user?.id) return
    
    try {
      setRecordingStatus('processing')
      const currentQuestion = partQuestions[currentQuestionIndex]
      
      // Convert audio blob to file
      const response = await fetch(audioURL)
      const audioBlob = await response.blob()
      const file = new File([audioBlob], `recording-${Date.now()}.wav`, { type: 'audio/wav' })
      
      // Upload using storage service
      const publicUrl = await storageService.uploadAudio(file, user.id, currentQuestion.id)
      
      // Transcribe with Whisper API
      const formData = new FormData()
      formData.append('file', file)
      formData.append('model', 'whisper-1')
      
      const whisperResponse = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      })
      
      if (!whisperResponse.ok) {
        throw new Error('Transcription failed')
      }
      
      const transcriptionResult = await whisperResponse.json()
      const transcript = transcriptionResult.text
      
      // Save response to database
      const { data: existingResponse } = await supabase
        .from('user_responses')
        .select('id')
        .eq('user_id', user.id)
        .eq('question_id', currentQuestion.id)
        .maybeSingle()
      
      let responseId
      
      if (existingResponse?.id) {
        // Update existing response
        const { data, error } = await supabase
          .from('user_responses')
          .update({
            audio_url: publicUrl,
            transcript: transcript,
            status: 'completed'
          })
          .eq('id', existingResponse.id)
          .select('id')
          .single()
          
        if (error) throw error
        responseId = existingResponse.id
      } else {
        // Create new response
        const { data, error } = await supabase
          .from('user_responses')
          .insert({
            user_id: user.id,
            question_id: currentQuestion.id,
            audio_url: publicUrl,
            transcript: transcript,
            status: 'completed'
          })
          .select('id')
          .single()
          
        if (error) throw error
        responseId = data.id
      }
      
      // Get AI feedback and scoring
      const scoringResponse = await fetch('/api/score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          responseId,
          questionText: currentQuestion.question_text,
          transcript,
          partNumber: currentQuestion.part_number
        })
      })
      
      if (!scoringResponse.ok) {
        throw new Error('Scoring failed')
      }
      
      const scoringResult = await scoringResponse.json()
      setFeedback(scoringResult)
      
      // Update user responses state
      setUserResponses(prev => ({
        ...prev,
        [currentQuestion.id]: {
          id: responseId,
          audio_url: publicUrl,
          transcript,
          status: 'completed'
        }
      }))
      
      setRecordingStatus('completed')
    } catch (err: any) {
      console.error('Error submitting response:', err)
      setError(err.message || 'Failed to submit response')
      setRecordingStatus('error')
    }
  }
  
  const handleNextQuestion = () => {
    if (currentQuestionIndex < partQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
    } else if (currentPartIndex < 2) {
      // Move to the next part
      setCurrentPartIndex(currentPartIndex + 1)
    } else {
      // Test completed, redirect to results
      router.push(`/tests/${testId}/results`)
    }
    
    setRecordingStatus('idle')
    setAudioURL(null)
    setFeedback(null)
  }
  
  const startTest = () => {
    const currentQuestion = partQuestions[currentQuestionIndex]
    if (currentQuestion.part_number === 2 && currentQuestion.preparation_time_seconds) {
      // Start preparation time for part 2
      setIsPreparationTime(true)
      setPrepTimer(currentQuestion.preparation_time_seconds)
    } else {
      // Start recording for part 1 or 3
      startRecording()
    }
  }
  
  // Render timer display
  const formatTime = (seconds: number | null) => {
    if (seconds === null) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  
  if (loading) {
    return (
      <ProtectedRoute>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600" />
          <p className="mt-4 text-lg">Loading test...</p>
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
  
  const currentQuestion = partQuestions[currentQuestionIndex]
  const partNames = ['Part 1: Introduction & General Questions', 'Part 2: Individual Long Turn', 'Part 3: Two-Way Discussion']
  
  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">{testInfo?.title}</h1>
          <p className="mb-6 text-gray-600">{partNames[currentPartIndex]}</p>
          
          <Tabs
            defaultValue={`part-${currentPartIndex + 1}`}
            value={`part-${currentPartIndex + 1}`}
            className="mb-6"
          >
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="part-1">Part 1</TabsTrigger>
              <TabsTrigger value="part-2">Part 2</TabsTrigger>
              <TabsTrigger value="part-3">Part 3</TabsTrigger>
            </TabsList>
            
            <div className="mt-4">
              <div className="flex justify-between mb-2 text-sm text-gray-500">
                <span>Question {currentQuestionIndex + 1} of {partQuestions.length}</span>
                {recordingStatus === 'recording' && (
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 bg-red-500 rounded-full animate-pulse"></span>
                    Recording: {formatTime(timer)}
                  </span>
                )}
                {isPreparationTime && (
                  <span className="flex items-center gap-1">
                    Preparation: {formatTime(prepTimer)}
                  </span>
                )}
              </div>
              <Progress value={(currentQuestionIndex + 1) / partQuestions.length * 100} className="h-2" />
            </div>
            
            <div className="mt-6">
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>
                    Question
                  </CardTitle>
                  {currentQuestion?.part_number === 2 && (
                    <CardDescription>
                      This is a cue card question. You will have {formatTime(currentQuestion.preparation_time_seconds || 0)} to prepare and {formatTime(currentQuestion.speaking_time_seconds)} to speak.
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="whitespace-pre-wrap text-lg">
                    {currentQuestion?.question_text}
                  </div>
                </CardContent>
              </Card>
              
              <div className="mb-8">
                {recordingStatus === 'idle' && (
                  <div className="flex flex-col items-center space-y-4">
                    <p className="text-center">
                      {currentQuestion?.part_number === 1 && "Answer the examiner's question with detailed responses."}
                      {currentQuestion?.part_number === 2 && "You'll need to speak about this topic for 2 minutes."}
                      {currentQuestion?.part_number === 3 && "This is a discussion question. Provide your opinion with examples."}
                    </p>
                    <Button 
                      variant="default" 
                      size="lg" 
                      className="flex items-center gap-2"
                      onClick={startTest}
                    >
                      <Mic size={18} /> Start Speaking
                    </Button>
                  </div>
                )}
                
                {isPreparationTime && (
                  <div className="flex flex-col items-center space-y-4 bg-yellow-50 p-6 rounded-lg">
                    <h3 className="text-xl font-medium">Preparation Time</h3>
                    <div className="text-3xl font-bold">{formatTime(prepTimer)}</div>
                    <p className="text-center">Make notes and prepare your answer.</p>
                  </div>
                )}
                
                {recordingStatus === 'recording' && (
                  <div className="flex flex-col items-center space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 bg-red-500 rounded-full animate-pulse"></span>
                      <span className="text-xl font-medium">Recording: {formatTime(timer)}</span>
                    </div>
                    <Button 
                      variant="destructive" 
                      onClick={stopRecording}
                      className="flex items-center gap-2"
                    >
                      <Square size={18} /> Stop Recording
                    </Button>
                  </div>
                )}
                
                {recordingStatus === 'stopped' && (
                  <div className="flex flex-col items-center space-y-4">
                    <div className="w-full max-w-md">
                      <audio src={audioURL || ''} controls className="w-full" />
                    </div>
                    <div className="flex gap-4">
                      <Button variant="outline" onClick={startRecording} className="flex items-center gap-2">
                        <Play size={18} /> Re-record
                      </Button>
                      <Button onClick={submitResponse} className="flex items-center gap-2">
                        <CheckCircle2 size={18} /> Submit for Evaluation
                      </Button>
                    </div>
                  </div>
                )}
                
                {recordingStatus === 'processing' && (
                  <div className="flex flex-col items-center space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                    <p>Processing your response...</p>
                  </div>
                )}
                
                {recordingStatus === 'completed' && feedback && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card>
                        <CardHeader>
                          <CardTitle>Your Score</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-y-4">
                            <div>
                              <p className="text-sm text-gray-500">Fluency & Coherence</p>
                              <p className="text-xl font-bold">{feedback.fluency_coherence_score.toFixed(1)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Lexical Resource</p>
                              <p className="text-xl font-bold">{feedback.lexical_resource_score.toFixed(1)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Grammar Accuracy</p>
                              <p className="text-xl font-bold">{feedback.grammar_accuracy_score.toFixed(1)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-500">Pronunciation</p>
                              <p className="text-xl font-bold">{feedback.pronunciation_score.toFixed(1)}</p>
                            </div>
                          </div>
                          <div className="mt-6 pt-4 border-t">
                            <p className="text-sm text-gray-500">Overall Band Score</p>
                            <p className="text-3xl font-bold">{feedback.overall_band_score.toFixed(1)}</p>
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader>
                          <CardTitle>Your Transcript</CardTitle>
                        </CardHeader>
                        <CardContent className="max-h-48 overflow-y-auto">
                          <p className="whitespace-pre-wrap">
                            {userResponses[currentQuestion?.id]?.transcript || 'No transcript available'}
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle>Feedback</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <h4 className="font-medium mb-1">General Feedback</h4>
                          <p>{feedback.general_feedback}</p>
                        </div>
                        <div>
                          <h4 className="font-medium mb-1">Fluency & Coherence</h4>
                          <p>{feedback.fluency_coherence_feedback}</p>
                        </div>
                        <div>
                          <h4 className="font-medium mb-1">Lexical Resource</h4>
                          <p>{feedback.lexical_resource_feedback}</p>
                        </div>
                        <div>
                          <h4 className="font-medium mb-1">Grammar Range & Accuracy</h4>
                          <p>{feedback.grammar_accuracy_feedback}</p>
                        </div>
                        <div>
                          <h4 className="font-medium mb-1">Pronunciation</h4>
                          <p>{feedback.pronunciation_feedback}</p>
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle>Model Answer</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="whitespace-pre-wrap">{feedback.model_answer}</p>
                      </CardContent>
                    </Card>
                    
                    <div className="flex justify-end mt-6">
                      <Button onClick={handleNextQuestion}>
                        {currentQuestionIndex < partQuestions.length - 1 ? 'Next Question' : 
                         currentPartIndex < 2 ? 'Next Part' : 'Finish Test'}
                      </Button>
                    </div>
                  </div>
                )}
                
                {recordingStatus === 'error' && (
                  <div className="flex flex-col items-center space-y-4">
                    <AlertCircle className="h-12 w-12 text-red-500" />
                    <p className="text-center">{error || 'An error occurred. Please try again.'}</p>
                    <Button onClick={() => setRecordingStatus('idle')}>Try Again</Button>
                  </div>
                )}
              </div>
            </div>
          </Tabs>
        </div>
      </div>
    </ProtectedRoute>
  )
} 