import { Loader2 } from 'lucide-react'

interface TestLoadingScreenProps {
  message?: string
}

export default function TestLoadingScreen({ message = "Loading test..." }: TestLoadingScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md mx-auto px-6">
        {/* Animated loading indicator */}
        <div className="relative">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto shadow-lg">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
          {/* Pulse animation rings */}
          <div className="absolute inset-0 w-20 h-20 bg-blue-400 rounded-full animate-ping opacity-20 mx-auto"></div>
          <div className="absolute inset-0 w-20 h-20 bg-indigo-400 rounded-full animate-ping opacity-10 mx-auto" style={{ animationDelay: '0.5s' }}></div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">
            {message}
          </h2>
          <p className="text-muted-foreground">
            Please wait while we prepare your test environment
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center space-x-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
} 