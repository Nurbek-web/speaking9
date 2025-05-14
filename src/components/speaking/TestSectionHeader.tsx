import React from 'react';
import MuteButton from './MuteButton';
import { formatOverallTime } from '@/app/(secure)/tests/[testId]/speaking/testUtils';
import { Clock } from 'lucide-react';

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
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm py-3 px-4 sm:px-6 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center">
          {/* Left side - Progress */}
          <div className="flex items-center gap-4">
            <div className="font-semibold text-indigo-700 hidden md:block">
              Part {currentPartNum} of {totalParts}
            </div>
            
            <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm font-medium">
              {sectionLabel}
            </div>
            
            <div className="text-sm text-gray-500 hidden md:block">
              Question {currentQuestion} of {totalQuestions}
            </div>
          </div>
          
          {/* Right side - Timer and mute */}
          <div className="flex items-center gap-4">
            <div className="flex items-center text-sm font-medium bg-gray-50 rounded-full px-3 py-1">
              <Clock size={14} className="mr-1 text-gray-500" />
              <span className="hidden sm:inline mr-1">Session time:</span>
              <span className="text-gray-700">{formatOverallTime(overallTimer)}</span>
            </div>
            
            {/* Mute button */}
            <MuteButton 
              isMuted={isMuted} 
              toggleMute={toggleMute} 
              className="ml-2"
            />
          </div>
        </div>
      </div>
    </header>
  );
};

export default TestSectionHeader; 