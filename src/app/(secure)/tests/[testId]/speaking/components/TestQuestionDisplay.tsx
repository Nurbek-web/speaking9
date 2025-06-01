import { TestQuestion, UserResponse, TestNavigation } from '../types'
import { CheckCircle2, Clock, SkipForward, MessageSquare, User, Users } from 'lucide-react'

interface TestQuestionDisplayProps {
  question: TestQuestion | null
  navigation: TestNavigation
  userResponse?: UserResponse
}

export default function TestQuestionDisplay({ question, navigation, userResponse }: TestQuestionDisplayProps) {
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
      default: return 'bg-gray-600'
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      <div className="p-8">
        {/* Part Header */}
        <div className="flex items-center space-x-4 mb-6">
          <div className={`w-12 h-12 ${getPartColor(question.part_number)} rounded-xl flex items-center justify-center text-white`}>
            {getPartIcon(question.part_number)}
          </div>
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                Part {question.part_number}
              </span>
              <span className="text-gray-400">•</span>
              <span className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                Question {navigation.currentQuestionIndex + 1}
              </span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              {getPartTitle(question.part_number)}
            </h2>
          </div>
        </div>
        
        <p className="text-gray-600 mb-8 leading-relaxed">
          {getPartDescription(question.part_number)}
        </p>
        
        {/* Question Content */}
        <div className="bg-gray-50 rounded-xl p-6 mb-6">
          <div className="border-l-4 border-blue-600 pl-6">
            <h3 className="text-lg font-medium text-gray-900 leading-relaxed">
              {question.question_text}
            </h3>
          </div>
          
          {question.part_number === 2 && (
            <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Clock className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-amber-900 mb-2">Speaking Guidelines</h4>
                  <div className="space-y-1 text-sm text-amber-800">
                    <div>• 1 minute to prepare your answer</div>
                    <div>• Speak for 1-2 minutes</div>
                    <div>• Include details and examples</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Status Display */}
        {userResponse && (
          <div className="space-y-4">
            {userResponse.status === 'completed' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <div>
                    <h4 className="font-medium text-green-900">Response Recorded</h4>
                    <p className="text-sm text-green-700">Your answer has been successfully captured</p>
                  </div>
                </div>
              </div>
            )}
            
            {userResponse.status === 'skipped' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <SkipForward className="w-5 h-5 text-amber-600" />
                  <div>
                    <h4 className="font-medium text-amber-900">Question Skipped</h4>
                    <p className="text-sm text-amber-700">You can return to this question later if needed</p>
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