import React from 'react';
import { formatOverallTime } from '@/app/(secure)/tests/[testId]/speaking/testUtils';

interface TestSectionHeaderProps {
  currentPartNum: number;
  totalParts: number;
  currentQuestion: number;
  totalQuestions: number;
  overallTimer: number;
  isMuted: boolean;
  toggleMute: () => void;
  sectionLabel: string;
}

const TestSectionHeader: React.FC<TestSectionHeaderProps> = ({
  currentPartNum,
  totalParts,
  currentQuestion,
  totalQuestions,
  overallTimer,
  isMuted, 
  toggleMute,
  sectionLabel
}) => {
  // Calculate progress percentage
  const overallProgress = ((currentPartNum - 1) * 100 / totalParts) + 
                         (currentQuestion / totalQuestions) * (100 / totalParts);
  
  return (
    <header className="bg-white border-b border-gray-100 py-3 px-4 sm:px-6 sticky top-0 z-10 backdrop-blur-md bg-white/90">
      <div className="max-w-7xl mx-auto">
        {/* Progress bar */}
        <div className="h-1 bg-gray-100 rounded-full w-full mb-3 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${overallProgress}%` }}
          ></div>
        </div>
        
        <div className="flex justify-between items-center">
          {/* Left side - Progress */}
          <div className="flex items-center gap-3">
            <div className="flex items-center">
              <span className="font-medium text-gray-900 text-sm">
                Part {currentPartNum}<span className="text-gray-400">/{totalParts}</span>
              </span>
              <span className="mx-2 text-gray-300">•</span>
              <span className="font-medium text-gray-900 text-sm">
                Q{currentQuestion}<span className="text-gray-400">/{totalQuestions}</span>
              </span>
            </div>
            
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-medium hidden sm:block">
              {sectionLabel}
            </div>
          </div>
          
          {/* Right side - Timer and mute */}
          <div className="flex items-center gap-3">
            {/* Timer */}
            <div className="flex items-center text-sm font-medium bg-white border border-gray-200 rounded-full px-3 py-1 shadow-sm">
              <svg className="h-3.5 w-3.5 text-blue-500 mr-1.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span className="text-gray-700">{formatOverallTime(overallTimer)}</span>
            </div>
            
            {/* Mute button */}
            <button
              onClick={toggleMute}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:ring-offset-2"
            >
              {isMuted ? (
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                </svg>
              ) : (
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TestSectionHeader; 