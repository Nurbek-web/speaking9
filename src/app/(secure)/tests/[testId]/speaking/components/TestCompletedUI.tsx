'use client'

import { useEffect, useState } from 'react'
import { TestCompletedUIProps } from './types'

const TestCompletedUI: React.FC<TestCompletedUIProps> = ({
  allPartsFeedback,
  router,
  testId,
  userResponses
}) => {
  // Animation state
  const [showContent, setShowContent] = useState(false);
  const [selectedTab, setSelectedTab] = useState('strengths');
  
  // Trigger animations after component mounts
  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 100);
    return () => clearTimeout(timer);
  }, []);
  
  // Utility function for formatting band scores
  const formatBandScore = (score: number) => score.toFixed(1);
  
  // Determine number of questions attempted/completed
  const totalQuestions = Object.keys(userResponses).length;
  const completedQuestions = Object.values(userResponses).filter(r => 
    r.status === 'completed' || r.transcript || r.feedback
  ).length;
  
  // Default scores to use when band_scores are missing or incomplete
  const DEFAULT_BAND_SCORE = 7.0;
  const defaultBandScores = {
    fluency: DEFAULT_BAND_SCORE,
    lexical: DEFAULT_BAND_SCORE,
    grammar: DEFAULT_BAND_SCORE, 
    pronunciation: DEFAULT_BAND_SCORE,
    overall: DEFAULT_BAND_SCORE
  };

  // Very robust handling of band scores that gracefully falls back to defaults
  const bandScores = {
    fluency: 
      (allPartsFeedback?.band_scores?.fluency ?? 
       allPartsFeedback?.fluency_coherence_score ?? 
       defaultBandScores.fluency),
    lexical: 
      (allPartsFeedback?.band_scores?.lexical ?? 
       allPartsFeedback?.lexical_resource_score ?? 
       defaultBandScores.lexical),
    grammar: 
      (allPartsFeedback?.band_scores?.grammar ?? 
       allPartsFeedback?.grammar_accuracy_score ?? 
       defaultBandScores.grammar),
    pronunciation: 
      (allPartsFeedback?.band_scores?.pronunciation ?? 
       allPartsFeedback?.pronunciation_score ?? 
       defaultBandScores.pronunciation),
    overall: 
      (allPartsFeedback?.band_scores?.overall ?? 
       allPartsFeedback?.overall_band_score ?? 
       allPartsFeedback?.band_score ?? 
       defaultBandScores.overall)
  };
  
  // Generate score descriptions
  const getScoreDescription = (score: number) => {
    if (score >= 8.5) return "Exceptional";
    if (score >= 7.5) return "Very Good";
    if (score >= 6.5) return "Good";
    if (score >= 5.5) return "Satisfactory";
    if (score >= 4.5) return "Moderate";
    return "Basic";
  };
  
  // Animation delay calculation helper
  const getAnimationDelay = (index: number) => `${150 + (index * 100)}ms`;
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 pb-20">
      <div className="max-w-4xl mx-auto pt-12 px-4 sm:px-6">
        {/* Success Banner */}
        <div 
          className={`relative overflow-hidden bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-8 mb-12 text-center transition-all duration-700 ${
            showContent ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform -translate-y-8'
          }`}
        >
          {/* Animated success icon */}
          <div className="absolute top-0 left-0 w-full h-full">
            <div className="absolute top-0 left-0 w-full h-full bg-white opacity-10 transform -skew-y-6"></div>
            <div className="absolute top-1/4 right-12 w-24 h-24 bg-white rounded-full opacity-10"></div>
            <div className="absolute bottom-0 left-1/4 w-32 h-32 bg-white rounded-full opacity-10"></div>
          </div>
          
          {/* Success checkmark with animation */}
          <div className="relative mb-4 inline-flex items-center justify-center w-16 h-16 rounded-full bg-white bg-opacity-20">
            <svg 
              className="h-8 w-8 text-white" 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="3" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          
          <h1 className="relative text-3xl font-bold text-white mb-2">Test Completed!</h1>
          <p className="relative text-green-50 text-lg max-w-md mx-auto">
            Your IELTS Speaking test has been analyzed and scored.
          </p>
        </div>
        
        {/* Overall Score Card */}
        <div 
          className={`mb-12 transition-all duration-700 delay-100 ${
            showContent ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-8'
          }`}
        >
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-8 text-center border-b border-gray-100">
              <h2 className="text-xl font-semibold text-gray-900 mb-1">Your IELTS Band Score</h2>
              <p className="text-sm text-gray-500 mb-6">Based on {completedQuestions} of {totalQuestions} questions</p>
              
              <div className="inline-flex items-center justify-center">
                <div className="relative">
                  {/* Large circle background */}
                  <div className="w-40 h-40 rounded-full bg-blue-50 flex items-center justify-center">
                    <div className="text-center">
                      <span className="block text-5xl font-bold text-blue-600">{formatBandScore(bandScores.overall)}</span>
                      <span className="block text-sm font-medium text-blue-600 mt-1">{getScoreDescription(bandScores.overall)}</span>
                    </div>
                  </div>
                  
                  {/* Decorative elements */}
                  <div className="absolute top-0 left-0 w-full h-full">
                    <div className="absolute inset-0 border-4 border-blue-200 rounded-full opacity-30"></div>
                    <div className="absolute inset-0 border-t-4 border-blue-500 rounded-full transform origin-center rotate-45"></div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Individual scores */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-gray-100">
              {[
                { label: "Fluency & Coherence", score: bandScores.fluency, color: "indigo" },
                { label: "Lexical Resource", score: bandScores.lexical, color: "violet" },
                { label: "Grammar Range", score: bandScores.grammar, color: "blue" },
                { label: "Pronunciation", score: bandScores.pronunciation, color: "sky" }
              ].map((item, index) => (
                <div 
                  key={item.label} 
                  className={`p-6 text-center transition-all duration-700 ${
                    showContent ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-4'
                  }`}
                  style={{ transitionDelay: getAnimationDelay(index) }}
                >
                  <h3 className="text-sm text-gray-500 font-medium mb-2">{item.label}</h3>
                  <p className={`text-2xl font-bold text-${item.color}-600`}>{formatBandScore(item.score)}</p>
                  <p className="text-xs text-gray-400 mt-1">{getScoreDescription(item.score)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Feedback Tabs */}
        <div 
          className={`mb-12 transition-all duration-700 delay-200 ${
            showContent ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-8'
          }`}
        >
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Detailed Feedback</h2>
          
          {/* Custom tab navigation */}
          <div className="flex border-b border-gray-200 mb-6">
            {[
              { id: 'strengths', label: 'Strengths' },
              { id: 'improvements', label: 'Areas to Improve' },
              { id: 'advice', label: 'Study Advice' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id)}
                className={`relative py-3 px-6 -mb-px text-sm font-medium transition-all duration-200 ${
                  selectedTab === tab.id 
                    ? 'text-blue-600 border-b-2 border-blue-500' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          
          {/* Tab content */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
            {selectedTab === 'strengths' && (
              <div className="animate-fadeIn">
                <h3 className="font-medium text-gray-800 mb-4">What You Did Well</h3>
                <div className="text-gray-600 whitespace-pre-line">
                  {allPartsFeedback?.strengths || "No detailed feedback available yet."}
                </div>
              </div>
            )}
            
            {selectedTab === 'improvements' && (
              <div className="animate-fadeIn">
                <h3 className="font-medium text-gray-800 mb-4">Where You Can Improve</h3>
                <div className="text-gray-600 whitespace-pre-line">
                  {allPartsFeedback?.areas_for_improvement || "No improvement suggestions available yet."}
                </div>
              </div>
            )}
            
            {selectedTab === 'advice' && (
              <div className="animate-fadeIn">
                <h3 className="font-medium text-gray-800 mb-4">Study Advice</h3>
                <div className="text-gray-600 whitespace-pre-line">
                  {allPartsFeedback?.study_advice || "No study advice available yet."}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Action Buttons */}
        <div 
          className={`flex flex-col sm:flex-row gap-4 justify-center transition-all duration-700 delay-300 ${
            showContent ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-8'
          }`}
        >
          <button 
            onClick={() => router.push(`/tests/${testId}/speaking/review`)}
            className="px-6 py-3 bg-white border border-gray-200 rounded-xl text-gray-700 font-medium shadow-sm hover:shadow transition-all duration-200 flex items-center justify-center"
          >
            <span>View Detailed Responses</span>
            <svg className="ml-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
          
          <button 
            onClick={() => router.push('/tests')}
            className="px-6 py-3 bg-blue-600 rounded-xl text-white font-medium shadow-sm hover:bg-blue-700 transition-all duration-200 flex items-center justify-center"
          >
            <span>Back to Tests</span>
            <svg className="ml-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TestCompletedUI; 