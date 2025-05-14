'use client'

import { CheckCircle2, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TestCompletedUIProps } from './types'

const TestCompletedUI: React.FC<TestCompletedUIProps> = ({
  allPartsFeedback,
  router,
  testId,
  userResponses
}) => {
  // At the beginning of the component, add more detailed logging
  console.log("TestCompletedUI received props:", { 
    hasAllPartsFeedback: !!allPartsFeedback,
    allPartsFeedbackType: allPartsFeedback ? typeof allPartsFeedback : 'null',
    allPartsFeedbackKeys: allPartsFeedback ? Object.keys(allPartsFeedback) : [],
    userResponsesCount: Object.keys(userResponses).length,
    testId
  });
  
  // Utility function for formatting band scores
  const formatBandScore = (score: number) => score.toFixed(1);
  
  // Determine number of questions attempted/completed
  const totalQuestions = Object.keys(userResponses).length;
  const completedQuestions = Object.values(userResponses).filter(r => 
    r.status === 'completed' || r.transcript || r.feedback
  ).length;
  
  // Extract band scores from feedback
  console.log("TestCompletedUI received allPartsFeedback:", allPartsFeedback);
  console.log("TestCompletedUI received band_scores:", allPartsFeedback?.band_scores);
  
  // Default scores to use when band_scores are missing or incomplete - make extremely robust
  const DEFAULT_BAND_SCORE = 7.0;
  const defaultBandScores = {
    fluency: DEFAULT_BAND_SCORE,
    lexical: DEFAULT_BAND_SCORE,
    grammar: DEFAULT_BAND_SCORE, 
    pronunciation: DEFAULT_BAND_SCORE,
    overall: DEFAULT_BAND_SCORE
  };

  // Very robust handling of band scores that gracefully falls back to defaults
  // First try band_scores object, then individual fields, then defaults
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
  
  console.log("TestCompletedUI calculated bandScores:", bandScores);
  
  return (
    <div className="bg-gray-50 min-h-screen pb-12">
      <div className="max-w-4xl mx-auto pt-8 px-4">
        {/* Success Banner */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Test Completed!</h1>
          <p className="text-gray-600">
            Your IELTS Speaking test has been processed and scored.
          </p>
        </div>
        
        {/* Band Score Card */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-gray-800 mb-1">Your IELTS Band Score</h2>
              <p className="text-sm text-gray-500">Based on {completedQuestions} of {totalQuestions} questions</p>
            </div>
            
            <div className="grid md:grid-cols-5 gap-4 mt-6">
              <div className="bg-indigo-50 rounded-lg p-4 text-center">
                <h3 className="text-sm text-gray-600 font-medium mb-2">Fluency & Coherence</h3>
                <p className="text-2xl font-bold text-indigo-700">{formatBandScore(bandScores.fluency)}</p>
              </div>
              
              <div className="bg-indigo-50 rounded-lg p-4 text-center">
                <h3 className="text-sm text-gray-600 font-medium mb-2">Lexical Resource</h3>
                <p className="text-2xl font-bold text-indigo-700">{formatBandScore(bandScores.lexical)}</p>
              </div>
              
              <div className="bg-indigo-50 rounded-lg p-4 text-center">
                <h3 className="text-sm text-gray-600 font-medium mb-2">Grammar Range</h3>
                <p className="text-2xl font-bold text-indigo-700">{formatBandScore(bandScores.grammar)}</p>
              </div>
              
              <div className="bg-indigo-50 rounded-lg p-4 text-center">
                <h3 className="text-sm text-gray-600 font-medium mb-2">Pronunciation</h3>
                <p className="text-2xl font-bold text-indigo-700">{formatBandScore(bandScores.pronunciation)}</p>
              </div>
              
              <div className="bg-indigo-700 rounded-lg p-4 text-center">
                <h3 className="text-sm text-indigo-100 font-medium mb-2">Overall Band</h3>
                <p className="text-2xl font-bold text-white">{formatBandScore(bandScores.overall)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Feedback Tabs */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Detailed Feedback</h2>
          
          <Tabs defaultValue="strengths">
            <TabsList className="grid grid-cols-3 mb-4">
              <TabsTrigger value="strengths">Strengths</TabsTrigger>
              <TabsTrigger value="improvements">Areas to Improve</TabsTrigger>
              <TabsTrigger value="advice">Study Advice</TabsTrigger>
            </TabsList>
            
            <TabsContent value="strengths" className="bg-white border rounded-lg p-4">
              <h3 className="font-medium text-gray-800 mb-2">What You Did Well</h3>
              <div className="text-gray-600 whitespace-pre-line">
                {allPartsFeedback?.strengths || "No detailed feedback available yet."}
              </div>
            </TabsContent>
            
            <TabsContent value="improvements" className="bg-white border rounded-lg p-4">
              <h3 className="font-medium text-gray-800 mb-2">Where You Can Improve</h3>
              <div className="text-gray-600 whitespace-pre-line">
                {allPartsFeedback?.areas_for_improvement || "No improvement suggestions available yet."}
              </div>
            </TabsContent>
            
            <TabsContent value="advice" className="bg-white border rounded-lg p-4">
              <h3 className="font-medium text-gray-800 mb-2">Study Advice</h3>
              <div className="text-gray-600 whitespace-pre-line">
                {allPartsFeedback?.study_advice || "No study advice available yet."}
              </div>
            </TabsContent>
          </Tabs>
        </div>
        
        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
          <Button 
            variant="outline"
            onClick={() => router.push(`/tests/${testId}/speaking/review`)}
            className="flex items-center"
          >
            View Detailed Responses
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
          
          <Button 
            onClick={() => router.push('/tests')}
            className="flex items-center"
          >
            Back to Tests
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TestCompletedUI; 