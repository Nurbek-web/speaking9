import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'
import { clerkToSupabaseId } from '@/lib/clerkSupabaseAdapter'
import fetch from 'node-fetch'

// Configure Azure OpenAI client
const endpoint = process.env.AZURE_OPENAI_ENDPOINT || 'https://arnur-maw58kmn-swedencentral.cognitiveservices.azure.com'
const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview'
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT
const apiKey = process.env.AZURE_OPENAI_API_KEY

// Configure Supabase direct client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Log config for debugging
console.log('[API:score] Azure OpenAI configuration:', {
  endpoint: endpoint ? `${endpoint.substring(0, 15)}...` : 'Missing',
  apiVersion,
  deployment,
  hasApiKey: !!apiKey
});

export async function POST(request: NextRequest) {
  try {
    // Authentication - try both Clerk and direct Supabase
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
    
    // Create Supabase client using direct access key (no cookies needed)
    // This should avoid the cookies warning entirely
    if (supabaseUrl && supabaseServiceKey) {
      supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false }
      });
      console.log('[API:score] Created Supabase client with service role key');
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
      // Call Azure OpenAI API directly with fetch instead of using the SDK
      // This gives us more control over the request and avoids the model name issues
      console.log(`[API:score] Using Azure OpenAI with deployment: ${deployment}`);
      
      const apiUrl = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['api-key'] = apiKey;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
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
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[API:score] Azure OpenAI API error: ${response.status}`, errorText);
        throw new Error(`Azure OpenAI API error (${response.status}): ${errorText.substring(0, 100)}`);
      }
      
      const completionData = await response.json();
      const rawFeedback = completionData.choices?.[0]?.message?.content || '';
      
      console.log(`[API:score] Generated feedback: ${rawFeedback.substring(0, 50)}...`);
      
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
              .eq('test_question_id', questionId)
              .maybeSingle()
            
            if (fetchError) {
              console.error('[API:score] Error fetching existing response:', fetchError)
            } else if (existingResponse) {
              // Update existing response - use type assertion to prevent "id" property error
              const responseId = existingResponse.id;
              const { error: updateError } = await supabase
                .from('user_responses')
                .update({
                  transcript,
                  feedback,
                  audio_url: audioUrl,
                  updated_at: new Date().toISOString()
                })
                .eq('id', responseId)
              
              if (updateError) {
                console.error('[API:score] Error updating response:', updateError)
              }
            } else {
              // Insert new response
              const { error: insertError } = await supabase
                .from('user_responses')
                .insert({
                  user_id: userId,
                  test_question_id: questionId,
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