import { Loader2 } from 'lucide-react'

interface TestLoadingScreenProps {
  message?: string
}

export default function TestLoadingScreen({ message = "Loading test..." }: TestLoadingScreenProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">
            {message}
          </h2>
          <p className="text-gray-600">
            Please wait while we prepare your test
          </p>
        </div>
      </div>
    </div>
  )
} 