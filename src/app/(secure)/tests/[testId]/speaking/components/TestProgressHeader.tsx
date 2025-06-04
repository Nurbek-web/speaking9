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
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {/* Compact Top Bar */}
        <div className="flex items-center justify-between">
          {/* Left: Back button and title */}
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => router.push('/tests')}
              className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="font-medium text-sm">Tests</span>
            </button>
            
            <div className="hidden sm:block w-px h-6 bg-border"></div>
            
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold text-foreground truncate max-w-xs">
                {testInfo.title}
              </h1>
            </div>
          </div>
          
          {/* Right: Status indicators */}
          <div className="flex items-center space-x-3">
            {/* Part indicator */}
            <div className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-sm font-medium">
              Part {navigation.currentPartIndex + 1}
            </div>
            
            {/* Timer */}
            <div className="flex items-center space-x-2 bg-muted rounded-full px-3 py-1">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-mono text-xs font-medium text-foreground">
                {formatTime(overallTimer)}
              </span>
            </div>
            
            {/* Progress count */}
            <div className="flex items-center space-x-2 bg-green-100 dark:bg-green-900 rounded-full px-3 py-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
              <span className="text-xs font-medium text-green-700 dark:text-green-300">
                {progress.completedQuestions}/{progress.totalQuestions}
              </span>
            </div>
          </div>
        </div>

        {/* Compact Progress Bar */}
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {getPartName(navigation.currentPartIndex + 1)}
            </span>
            <span className="text-xs font-medium text-foreground">
              {Math.round(progress.overallPercentage)}%
            </span>
          </div>
          
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div 
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress.overallPercentage}%` }}
            />
          </div>
          
          {/* Compact Part Indicators */}
          <div className="flex justify-between items-center">
            {[1, 2, 3].map((part) => {
              const isCompleted = navigation.currentPartIndex + 1 > part
              const isCurrent = navigation.currentPartIndex + 1 === part
              
              return (
                <div key={part} className="flex flex-col items-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                    isCompleted 
                      ? 'bg-green-600 text-white' 
                      : isCurrent 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      part
                    )}
                  </div>
                  <span className={`text-xs mt-1 ${
                    isCompleted || isCurrent ? 'text-foreground' : 'text-muted-foreground'
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