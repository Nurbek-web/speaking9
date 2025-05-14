import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { AzureOpenAI } from 'openai'
import { auth } from '@clerk/nextjs/server'
import { clerkToSupabaseId } from '@/lib/clerkSupabaseAdapter'

// Configure Azure OpenAI client
const endpoint = process.env.AZURE_OPENAI_ENDPOINT || ''
const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-06-01'
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4'
const apiKey = process.env.AZURE_OPENAI_API_KEY || ''

// Initialize the Azure OpenAI client
const openai = new AzureOpenAI({
  apiVersion,
  endpoint,
  apiKey,
  deployment
})

export async function POST(request: NextRequest) {
  try {
    // Authentication - try both Clerk and Supabase
    let userId = null
    let supabase = null;
    
    // First try Clerk auth
    try {
      const session = await auth()
      if (session?.userId) {
        userId = clerkToSupabaseId(session.userId)
        console.log(`[API:score] Authenticated via Clerk: ${userId.substring(0, 8)}...`)
      }
    } catch (clerkError) {
      console.error('[API:score] Clerk auth error:', clerkError)
    }
    
    // Try Supabase auth
    try {
      supabase = createRouteHandlerClient({ cookies })
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        userId = user.id
        console.log(`[API:score] Authenticated via Supabase: ${userId.substring(0, 8)}...`)
      }
    } catch (supabaseError) {
      console.error('[API:score] Supabase auth error:', supabaseError)
    }
    
    // Parse the request body
    const { 
      userId: clientUserId,
      questionId, 
      questionText,
      questionType,
      transcript, 
      audioUrl 
    } = await request.json()
    
    // If no user ID from auth, use the one provided by client
    if (!userId && clientUserId) {
      userId = clientUserId
      console.log(`[API:score] Using client-provided user ID: ${userId.substring(0, 8)}...`)
    }
    
    // Validate required fields
    if (!transcript) {
      return NextResponse.json(
        { error: 'Transcript is required' },
        { status: 400 }
      )
    }
    
    // Handle placeholder transcripts for skipped questions or failed transcriptions
    const isSkippedQuestion = transcript.includes("[This question was skipped by the user]");
    const isTranscriptionFailure = transcript.includes("[Audio transcription failed");
    
    if (isSkippedQuestion || isTranscriptionFailure) {
      console.log(`[API:score] Detected special transcript case: ${isSkippedQuestion ? 'skipped question' : 'transcription failure'}`);
      
      // Return default feedback for skipped or failed transcriptions
      const defaultFeedback = {
        bandScore: isSkippedQuestion ? 5.0 : 6.0,
        fluencyCoherence: isSkippedQuestion ? 5.0 : 6.0,
        lexicalResource: isSkippedQuestion ? 5.0 : 6.0,
        grammaticalRange: isSkippedQuestion ? 5.0 : 6.0,
        pronunciation: isSkippedQuestion ? 5.0 : 6.0,
        generalFeedback: isSkippedQuestion 
          ? "This question was skipped. No audio was recorded for assessment."
          : "The audio could not be transcribed properly. This is default feedback.",
        fluencyFeedback: "Unable to assess fluency from the available recording.",
        lexicalFeedback: "Unable to assess vocabulary usage from the available recording.",
        grammarFeedback: "Unable to assess grammar from the available recording.",
        pronunciationFeedback: "Unable to assess pronunciation from the available recording.",
        modelAnswer: "A model answer would demonstrate relevant vocabulary, good grammar structures, and clear pronunciation."
      };
      
      // Return the default feedback
      return NextResponse.json({ feedback: defaultFeedback });
    }
    
    // Generate scoring prompt based on question type
    let scoringPrompt = ''
    
    if (questionType === 'cue_card' || questionType === 'part2') {
      scoringPrompt = `
You are an expert IELTS Speaking examiner. Please analyze this Part 2 (Cue Card) response and provide detailed scoring.

Question: ${questionText}

Candidate's Response: ${transcript}

Please provide:
1. An overall band score (0-9, can use 0.5 increments)
2. Individual scores for:
   - Fluency & Coherence (0-9)
   - Lexical Resource (0-9)
   - Grammatical Range & Accuracy (0-9)
   - Pronunciation (0-9)
3. Brief, specific feedback for each category
4. 2-3 sentences of general feedback on the overall performance
5. A model answer that demonstrates Band 9 level response (approx. 1-2 minutes speaking length)

Format your response as a JSON object with the following keys:
{
  "bandScore": number,
  "fluencyCoherence": number,
  "lexicalResource": number,
  "grammaticalRange": number,
  "pronunciation": number,
  "generalFeedback": "string",
  "fluencyFeedback": "string",
  "lexicalFeedback": "string",
  "grammarFeedback": "string",
  "pronunciationFeedback": "string",
  "modelAnswer": "string"
}
`
    } else {
      // Default to Part 1 or Part 3 question
      scoringPrompt = `
You are an expert IELTS Speaking examiner. Please analyze this ${questionType === 'part3' ? 'Part 3' : 'Part 1'} response and provide detailed scoring.

Question: ${questionText}

Candidate's Response: ${transcript}

Please provide:
1. An overall band score (0-9, can use 0.5 increments)
2. Individual scores for:
   - Fluency & Coherence (0-9)
   - Lexical Resource (0-9)
   - Grammatical Range & Accuracy (0-9)
   - Pronunciation (0-9)
3. Brief, specific feedback for each category
4. 2-3 sentences of general feedback on the overall performance
5. A model answer that demonstrates Band 9 level response (be concise, approx. 30 seconds speaking length)

Format your response as a JSON object with the following keys:
{
  "bandScore": number,
  "fluencyCoherence": number,
  "lexicalResource": number,
  "grammaticalRange": number,
  "pronunciation": number,
  "generalFeedback": "string",
  "fluencyFeedback": "string",
  "lexicalFeedback": "string",
  "grammarFeedback": "string",
  "pronunciationFeedback": "string",
  "modelAnswer": "string"
}
`
    }

    console.log(`[API:score] Processing transcript for question ID: ${questionId ?? 'unknown'}`)
    
    try {
      // Call OpenAI API for scoring
      const completion = await openai.chat.completions.create({
        model: 'gpt-4', // Will be replaced by deployment id in Azure
        messages: [
          {
            role: 'system',
            content: 'You are an IELTS Speaking examiner providing detailed feedback in JSON format.'
          },
          {
            role: 'user',
            content: scoringPrompt
          }
        ],
        response_format: { type: 'json_object' }
      })

      // Parse the JSON response
      const rawFeedback = completion.choices[0]?.message?.content || ''
      console.log(`[API:score] Generated feedback: ${rawFeedback.substring(0, 50)}...`)
      
      try {
        // Try to parse the JSON response
        const feedback = JSON.parse(rawFeedback)
        
        // Store the scoring in the database if we have a user ID and question ID
        if (userId && questionId && supabase) {
          try {
            console.log(`[API:score] Saving feedback to database for user: ${userId.substring(0, 8)}...`)
            
            // First check if we have an existing response
            const { data: existingResponse, error: fetchError } = await supabase
              .from('user_responses')
              .select('id')
              .eq('user_id', userId)
              .eq('question_id', questionId)
              .maybeSingle()
            
            if (fetchError) {
              console.error('[API:score] Error fetching existing response:', fetchError)
            } else if (existingResponse) {
              // Update existing response
              const { error: updateError } = await supabase
                .from('user_responses')
                .update({
                  transcript,
                  feedback,
                  audio_url: audioUrl,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingResponse.id)
              
              if (updateError) {
                console.error('[API:score] Error updating response:', updateError)
              }
            } else {
              // Insert new response
              const { error: insertError } = await supabase
                .from('user_responses')
                .insert({
                  user_id: userId,
                  question_id: questionId,
                  transcript,
                  feedback,
                  audio_url: audioUrl,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
              
              if (insertError) {
                console.error('[API:score] Error inserting response:', insertError)
              }
            }
          } catch (dbError) {
            console.error('[API:score] Error saving to database:', dbError)
            // Continue - we'll still return the feedback even if DB save fails
          }
        } else {
          console.log('[API:score] Skipping database save - missing userId, questionId, or supabase client')
        }
        
        // Return the feedback to the client
        return NextResponse.json({ feedback })
        
      } catch (parseError) {
        console.error('[API:score] Error parsing JSON response:', parseError)
        return NextResponse.json(
          { 
            error: 'Failed to parse AI response',
            rawResponse: rawFeedback 
          },
          { status: 500 }
        )
      }
    } catch (openAiError) {
      console.error('[API:score] OpenAI API error:', openAiError)
      return NextResponse.json(
        { error: 'AI scoring failed' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[API:score] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to process scoring request' },
      { status: 500 }
    )
  }
} 