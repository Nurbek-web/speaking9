import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { AzureOpenAI } from 'openai'
import { DefaultAzureCredential } from "@azure/identity"

// Configure Azure OpenAI client
const endpoint = process.env.AZURE_OPENAI_ENDPOINT || ''
const apiVersion = process.env.AZURE_OPENAI_API_VERSION_GPT || '2025-01-01-preview'
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_GPT || 'gpt-4.1'
const apiKey = process.env.AZURE_OPENAI_API_KEY || ''

// Initialize the Azure OpenAI client
const openai = new AzureOpenAI({
  apiVersion,
  endpoint,
  apiKey,
  deployment
})

// Define types
type ScoringRequest = {
  responseId: string
  questionText: string
  transcript: string
  partNumber: number
}

type FeedbackResult = {
  fluency_coherence_score: number
  lexical_resource_score: number
  grammar_accuracy_score: number
  pronunciation_score: number
  overall_band_score: number
  general_feedback: string
  fluency_coherence_feedback: string
  lexical_resource_feedback: string
  grammar_accuracy_feedback: string
  pronunciation_feedback: string
  model_answer: string
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Parse request
    const body: ScoringRequest = await request.json()
    const { responseId, questionText, transcript, partNumber } = body
    
    if (!responseId || !questionText || !transcript) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    // Create the prompt for GPT
    const prompt = generateScoringPrompt(questionText, transcript, partNumber)
    
    // Get AI response using Azure OpenAI
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are an expert IELTS speaking examiner with decades of experience. You provide accurate band scores and helpful feedback.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      model: 'gpt-4.1',
      max_tokens: 2500,
      temperature: 0.7,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      response_format: { type: 'json_object' }
    })
    
    const result = completion.choices[0].message.content
    
    if (!result) {
      throw new Error('Failed to get a valid response from GPT')
    }
    
    // Parse the feedback
    const feedback: FeedbackResult = JSON.parse(result)
    
    // Save the feedback to database
    const { error } = await supabase
      .from('feedback')
      .insert({
        response_id: responseId,
        fluency_coherence_score: feedback.fluency_coherence_score,
        lexical_resource_score: feedback.lexical_resource_score,
        grammar_accuracy_score: feedback.grammar_accuracy_score,
        pronunciation_score: feedback.pronunciation_score,
        overall_band_score: feedback.overall_band_score,
        general_feedback: feedback.general_feedback,
        fluency_coherence_feedback: feedback.fluency_coherence_feedback,
        lexical_resource_feedback: feedback.lexical_resource_feedback,
        grammar_accuracy_feedback: feedback.grammar_accuracy_feedback,
        pronunciation_feedback: feedback.pronunciation_feedback,
        model_answer: feedback.model_answer
      })
    
    if (error) {
      throw error
    }
    
    return NextResponse.json(feedback)
  } catch (error: any) {
    console.error('Error in scoring:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to score response' },
      { status: 500 }
    )
  }
}

function generateScoringPrompt(questionText: string, transcript: string, partNumber: number): string {
  // Create a specific prompt based on the part of the test
  let partSpecificInstructions = ''
  
  if (partNumber === 1) {
    partSpecificInstructions = `
This is from Part 1 of the IELTS Speaking test, which focuses on introductions and general questions.
The candidate should provide direct answers with some development and personal examples.
`
  } else if (partNumber === 2) {
    partSpecificInstructions = `
This is from Part 2 of the IELTS Speaking test (the Individual Long Turn).
The candidate should address all parts of the cue card and speak continuously for 1-2 minutes.
Evaluate their ability to organize ideas coherently and speak at length.
`
  } else if (partNumber === 3) {
    partSpecificInstructions = `
This is from Part 3 of the IELTS Speaking test, which involves discussion of more abstract topics.
The candidate should show ability to express and justify opinions, analyze, discuss and speculate.
Higher-level vocabulary and complex sentence structures are expected here.
`
  }
  
  return `
You are an official IELTS examiner evaluating a speaking test response.
${partSpecificInstructions}

IELTS Question: "${questionText}"

Candidate's Response (transcribed):
${transcript}

Please evaluate this response according to the official IELTS Speaking Band Descriptors:
1. Fluency and Coherence
2. Lexical Resource
3. Grammatical Range and Accuracy
4. Pronunciation

For each category, provide:
- A score from 0.0 to 9.0 (can use 0.5 increments)
- Specific feedback with examples from the response

Then calculate an overall band score (average of the four scores, rounded to nearest 0.5).

Finally, provide a model answer that would score 9.0.

Your response must be a valid JSON object with these fields:
{
  "fluency_coherence_score": number,
  "lexical_resource_score": number,
  "grammar_accuracy_score": number,
  "pronunciation_score": number,
  "overall_band_score": number,
  "general_feedback": string,
  "fluency_coherence_feedback": string,
  "lexical_resource_feedback": string,
  "grammar_accuracy_feedback": string,
  "pronunciation_feedback": string,
  "model_answer": string
}
`
} 