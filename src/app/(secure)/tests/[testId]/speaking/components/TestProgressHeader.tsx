import { TestInfo, TestNavigation, TestProgress } from '../types'
import { Clock, CheckCircle2, ChevronLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface TestProgressHeaderProps {
  testInfo: TestInfo
  progress: TestProgress
  navigation: TestNavigation
  overallTimer: number
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export default function TestProgressHeader({ testInfo, progress, navigation, overallTimer }: TestProgressHeaderProps) {
  const router = useRouter()
  
  const getPartName = (partNumber: number) => {
    switch (partNumber) {
      case 1: return 'Interview'
      case 2: return 'Long Turn' 
      case 3: return 'Discussion'
      default: return `Part ${partNumber}`
    }
  }

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-black/5">
      <div className="max-w-7xl mx-auto px-6 py-4">
        {/* Top Navigation */}
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={() => router.push('/tests')}
            className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="font-medium">Tests</span>
          </button>
          
          <div className="flex items-center space-x-6">
            {/* Timer */}
            <div className="flex items-center space-x-2 bg-gray-100 rounded-full px-4 py-2">
              <Clock className="w-4 h-4 text-gray-600" />
              <span className="font-mono text-sm font-medium text-gray-700">
                {formatTime(overallTimer)}
              </span>
            </div>
            
            {/* Progress */}
            <div className="flex items-center space-x-2 bg-green-100 rounded-full px-4 py-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-700">
                {progress.completedQuestions}/{progress.totalQuestions}
              </span>
            </div>
          </div>
        </div>

        {/* Main Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">
            {testInfo.title}
          </h1>
          <div className="flex items-center space-x-2 text-gray-600">
            <span className="text-lg font-medium">
              Part {navigation.currentPartIndex + 1}
            </span>
            <span className="text-gray-400">•</span>
            <span>{getPartName(navigation.currentPartIndex + 1)}</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Overall Progress</span>
            <span className="text-sm font-medium text-gray-900">
              {Math.round(progress.overallPercentage)}%
            </span>
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress.overallPercentage}%` }}
            />
          </div>
          
          {/* Part Indicators */}
          <div className="flex justify-between items-center pt-2">
            {[1, 2, 3].map((part) => {
              const isCompleted = navigation.currentPartIndex + 1 > part
              const isCurrent = navigation.currentPartIndex + 1 === part
              
              return (
                <div key={part} className="flex flex-col items-center space-y-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                    isCompleted 
                      ? 'bg-green-600 text-white' 
                      : isCurrent 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      part
                    )}
                  </div>
                  <span className={`text-xs font-medium transition-colors ${
                    isCompleted || isCurrent ? 'text-gray-700' : 'text-gray-500'
                  }`}>
                    {getPartName(part)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </header>
  )
} 