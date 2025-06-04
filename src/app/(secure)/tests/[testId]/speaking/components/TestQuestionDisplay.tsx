import { TestQuestion, UserResponse, TestNavigation } from '../types'
import { CheckCircle2, Clock, SkipForward, MessageSquare, User, Users, Timer } from 'lucide-react'
import { useState, useEffect } from 'react'

interface TestQuestionDisplayProps {
  question: TestQuestion | null
  navigation: TestNavigation
  userResponse?: UserResponse
}

export default function TestQuestionDisplay({ question, navigation, userResponse }: TestQuestionDisplayProps) {
  const [prepTime, setPrepTime] = useState(60) // 1 minute prep time for Part 2
  const [isPrepping, setIsPrepping] = useState(false)
  
  // Start prep timer for Part 2 questions
  useEffect(() => {
    if (question?.part_number === 2 && !userResponse?.status) {
      setIsPrepping(true)
      setPrepTime(60)
      
      const timer = setInterval(() => {
        setPrepTime(prev => {
          if (prev <= 1) {
            setIsPrepping(false)
            clearInterval(timer)
            return 0
          }
          return prev - 1
        })
      }, 1000)
      
      return () => clearInterval(timer)
    }
  }, [question?.part_number, question?.id, userResponse?.status])

  if (!question) return null

  const getPartTitle = (partNumber: number) => {
    switch (partNumber) {
      case 1: return 'Introduction & Interview'
      case 2: return 'Individual Long Turn'
      case 3: return 'Two-way Discussion'
      default: return `Part ${partNumber}`
    }
  }

  const getPartDescription = (partNumber: number) => {
    switch (partNumber) {
      case 1: return 'Answer questions about familiar topics and personal experiences'
      case 2: return 'Speak for 1-2 minutes on a given topic after 1 minute preparation'
      case 3: return 'Discuss abstract ideas and express opinions on complex issues'
      default: return ''
    }
  }

  const getPartIcon = (partNumber: number) => {
    switch (partNumber) {
      case 1: return <MessageSquare className="w-5 h-5" />
      case 2: return <User className="w-5 h-5" />
      case 3: return <Users className="w-5 h-5" />
      default: return <MessageSquare className="w-5 h-5" />
    }
  }

  const getPartColor = (partNumber: number) => {
    switch (partNumber) {
      case 1: return 'bg-green-600'
      case 2: return 'bg-blue-600'
      case 3: return 'bg-purple-600'
      default: return 'bg-muted-foreground'
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-4 sm:p-5">
        {/* Compact Part Header */}
        <div className="flex items-center space-x-3 mb-4">
          <div className={`w-8 h-8 ${getPartColor(question.part_number)} rounded-lg flex items-center justify-center text-white text-sm`}>
            {getPartIcon(question.part_number)}
          </div>
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Part {question.part_number}
              </span>
              <div className="w-1 h-1 bg-muted-foreground rounded-full"></div>
              <span className="text-xs text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded-full font-medium">
                Question {navigation.currentQuestionIndex + 1}
              </span>
            </div>
            <h2 className="text-base font-semibold text-card-foreground">
              {getPartTitle(question.part_number)}
            </h2>
          </div>
        </div>
        
        {/* Compact description */}
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          {getPartDescription(question.part_number)}
        </p>
        
        {/* Question Content */}
        <div className="bg-muted/30 rounded-lg p-4 mb-4">
          <div className="border-l-3 border-blue-600 pl-4">
            <h3 className="text-sm font-medium text-card-foreground leading-relaxed">
              {question.question_text}
            </h3>
          </div>
          
          {question.part_number === 2 && (
            <div className="mt-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <div className="flex items-start space-x-3">
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-medium text-amber-900 dark:text-amber-100 text-sm mb-2">Speaking Guidelines</h4>
                  <div className="grid grid-cols-1 gap-1 text-xs text-amber-800 dark:text-amber-200">
                    <div>• 1 minute to prepare your answer</div>
                    <div>• Speak for 1-2 minutes</div>
                    <div>• Include details and examples</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preparation Timer for Part 2 */}
          {question.part_number === 2 && isPrepping && (
            <div className="mt-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-center justify-center space-x-3">
                <Timer className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div className="text-center">
                  <div className="text-2xl font-mono font-bold text-blue-700 dark:text-blue-300">
                    {Math.floor(prepTime / 60)}:{(prepTime % 60).toString().padStart(2, '0')}
                  </div>
                  <p className="text-sm text-blue-600 dark:text-blue-400">Preparation time remaining</p>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Compact Status Display */}
        {userResponse && (
          <div className="space-y-3">
            {userResponse.status === 'completed' && (
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <div className="flex items-center space-x-3">
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <div className="flex-1">
                    <h4 className="font-medium text-green-900 dark:text-green-100 text-sm">Response Recorded</h4>
                    <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">Your answer has been captured</p>
                  </div>
                </div>
              </div>
            )}
            
            {userResponse.status === 'skipped' && (
              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <div className="flex items-center space-x-3">
                  <SkipForward className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <div className="flex-1">
                    <h4 className="font-medium text-amber-900 dark:text-amber-100 text-sm">Question Skipped</h4>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">You can return to this later</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
} 