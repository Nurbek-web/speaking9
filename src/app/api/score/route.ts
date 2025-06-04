import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { auth } from '@clerk/nextjs/server'
import { clerkToSupabaseId } from '@/lib/clerkSupabaseAdapter'
import fetch from 'node-fetch'
import OpenAI from 'openai'

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
console.log(`[API:score] Supabase URL: ${supabaseUrl ? supabaseUrl.substring(0,15) + '...': 'Missing'}`);
console.log(`[API:score] Supabase Service Key: ${supabaseServiceKey ? 'Set' : 'Missing'}`);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  console.log('[API:score] Received POST request');
  try {
    // Get user from Clerk auth
    const { userId: authUserId } = await auth()
    
    const body = await request.json()
    const { 
      transcript, 
      questionId, 
      userResponseId,
      userId: clientUserId // This may be passed from client as fallback
    } = body

    console.log(`[API:score] Processing request - authUserId: ${authUserId?.substring(0, 8) || 'none'}..., clientUserId: ${clientUserId?.substring(0, 8) || 'none'}...`)

    if (!transcript || !questionId || !userResponseId) {
      return NextResponse.json(
        { error: 'Missing required fields: transcript, questionId, userResponseId' },
        { status: 400 }
      )
    }

    // Use auth user ID first, fallback to client-provided user ID
    let clerkUserId = authUserId
    if (!clerkUserId && clientUserId) {
      clerkUserId = clientUserId;
      console.log(`[API:score] Using client-provided user ID: ${clerkUserId!.substring(0, 8)}...`);
    }

    if (!clerkUserId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      )
    }

    // Convert Clerk ID to Supabase UUID for database operations
    const supabaseUserId = clerkToSupabaseId(clerkUserId)
    console.log(`[API:score] Using Clerk ID: ${clerkUserId.substring(0, 8)}... -> Supabase UUID: ${supabaseUserId.substring(0, 8)}...`)

    // TypeScript knows userId is not null after this point
    const finalUserId: string = supabaseUserId
    console.log(`[API:score] Using user ID: ${finalUserId.substring(0, 8)}...`)
    
    // Parse the request body
    const { 
      questionText,
      questionType,
      audioUrl,
      responseStatus, 
      hasAudioData 
    } = body
    
    console.log('[API:score] Request body parsed:', {
      questionId,
      questionText: questionText ? `${questionText.substring(0,30)}...` : 'N/A',
      questionType,
      audioUrl: audioUrl ? `${audioUrl.substring(0,50)}...` : 'N/A',
      responseStatus,
      hasAudioData
    });
    
    // Validate required fields
    if (!transcript) {
      return NextResponse.json(
        { error: 'Transcript is required' },
        { status: 400 }
      )
    }
    
    // ADDED: Log transcript length
    console.log(`[API:score] Transcript length: ${transcript.length} characters`);
    
    // Handle placeholder transcripts for skipped questions or failed transcriptions
    const isSkippedQuestion = transcript.includes("[This question was skipped by the user]")
    const isTranscriptionFailure = transcript.includes("[Audio transcription failed") ||
                                   transcript.includes("[Transcription failed]") ||
                                   transcript.includes("[No speech detected]") ||
                                   transcript.includes("[No clear speech detected]") ||
                                   transcript.includes("[Transcription failed - unexpected response format]")
    
    if (isSkippedQuestion || isTranscriptionFailure) {
      console.log(`[API:score] Detected special transcript case: ${isSkippedQuestion ? 'skipped question' : 'transcription failure'}`);
      
      // Return default feedback for skipped or failed transcriptions
      const defaultFeedback = {
        band_score: isSkippedQuestion ? 5.0 : 6.0,
        fluency_coherence_score: isSkippedQuestion ? 5.0 : 6.0,
        lexical_resource_score: isSkippedQuestion ? 5.0 : 6.0,
        grammar_accuracy_score: isSkippedQuestion ? 5.0 : 6.0,
        pronunciation_score: isSkippedQuestion ? 5.0 : 6.0,
        general_feedback: isSkippedQuestion 
          ? "This question was skipped. No audio was recorded for assessment."
          : transcript.includes("[No speech detected]") || transcript.includes("[No clear speech detected]")
            ? "No clear speech was detected in the recording. Please ensure your microphone is working and speak clearly."
            : "The audio could not be transcribed properly. This may be due to audio quality issues.",
        fluency_coherence_feedback: "Unable to assess fluency from the available recording.",
        lexical_resource_feedback: "Unable to assess vocabulary usage from the available recording.",
        grammar_accuracy_feedback: "Unable to assess grammar from the available recording.",
        pronunciation_feedback: "Unable to assess pronunciation from the available recording.",
        model_answer: "A model answer would demonstrate relevant vocabulary, good grammar structures, and clear pronunciation."
      }
      
      // Return the default feedback
      console.log('[API:score] Returning default feedback for special transcript case.', defaultFeedback)
      return NextResponse.json({ feedback: defaultFeedback })
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
      // ADDED: More context for the LLM based on new parameters
      const contextNotes = [];
      if (responseStatus === 'error') contextNotes.push("The user's response was marked with an error during recording or processing.");
      if (responseStatus === 'local') contextNotes.push("The user's response was saved locally and might not be on the server.");
      if (!hasAudioData) contextNotes.push("The user's response appears to have no actual audio data attached, only a transcript.");
      if (transcript.length < 20) contextNotes.push("The transcript is very short.");

      scoringPrompt = `
You are an expert IELTS Speaking examiner. Please analyze this ${questionType === 'part3' ? 'Part 3' : 'Part 1'} response and provide detailed scoring.
${contextNotes.length > 0 ? "\nImportant Context Notes About This Response:\n- " + contextNotes.join("\n- ") + "\nTake these notes into account, but still provide your best assessment based on the transcript provided." : ""}

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
    // ADDED: Log the generated prompt (first 200 chars)
    console.log(`[API:score] Generated scoring prompt (first 200 chars): ${scoringPrompt.substring(0,200)}...`);
    
    try {
      // Call Azure OpenAI API directly with fetch instead of using the SDK
      // This gives us more control over the request and avoids the model name issues
      console.log(`[API:score] Using Azure OpenAI with deployment: ${deployment}`);
      
      const apiUrl = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
      // ADDED: Log API URL
      console.log(`[API:score] Calling Azure OpenAI API: ${apiUrl}`);
      
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
          response_format: { type: 'json_object' },
          // ADDED: Temperature and max_tokens for more controlled output
          temperature: 0.2, 
          max_tokens: 1500 
        })
      });
      
      // ADDED: Log API response status
      console.log(`[API:score] Azure OpenAI API response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[API:score] Azure OpenAI API error: ${response.status}`, errorText);
        throw new Error(`Azure OpenAI API error (${response.status}): ${errorText.substring(0, 100)}`);
      }
      
      const completionData = await response.json();
      const rawFeedback = completionData.choices?.[0]?.message?.content || '';
      
      console.log(`[API:score] Generated feedback: ${rawFeedback.substring(0, 50)}...`);
      // ADDED: Log length of raw feedback
      console.log(`[API:score] Raw feedback length: ${rawFeedback.length} characters`);
      
      try {
        // Try to parse the JSON response
        const feedback = JSON.parse(rawFeedback)
        // ADDED: Log successfully parsed feedback structure
        console.log('[API:score] Successfully parsed feedback JSON. Keys:', Object.keys(feedback));
        
        // Store the scoring in the database if we have a user ID and question ID
        if (finalUserId && questionId && supabase) {
          try {
            console.log(`[API:score] Saving feedback to database for user: ${finalUserId.substring(0, 8)}...`)
            
            // First check if we have an existing response
            const { data: existingResponse, error: fetchError } = await supabase
              .from('user_responses')
              .select('id')
              .eq('user_id', finalUserId)
              .eq('test_question_id', questionId)
              .maybeSingle()
            
            // ADDED: Log result of fetching existing response
            console.log('[API:score] Fetched existing response:', { hasData: !!existingResponse, fetchError: fetchError ? fetchError.message : null });
            
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
                  status: 'completed' // Mark as completed after scoring
                })
                .eq('id', responseId)
              
              // ADDED: Log result of updating response
              console.log('[API:score] Updated existing response in DB. Update error:', updateError ? updateError.message : 'None');
              if (updateError) {
                console.error('[API:score] Error updating response in DB:', updateError)
              }
            } else {
              // Insert new response
              const { error: insertError } = await supabase
                .from('user_responses')
                .insert({
                  user_id: finalUserId,
                  test_question_id: questionId,
                  transcript,
                  feedback,
                  audio_url: audioUrl,
                  status: 'completed' // Mark as completed after scoring
                })
              
              // ADDED: Log result of inserting new response
              console.log('[API:score] Inserted new response into DB. Insert error:', insertError ? insertError.message : 'None');
              if (insertError) {
                console.error('[API:score] Error inserting new response into DB:', insertError)
              }
            }
          } catch (dbError) {
            console.error('[API:score] Database operation error:', dbError)
            // Continue - we'll still return the feedback even if DB save fails
          }
        } else {
          console.log('[API:score] Skipping database save: Missing userId, questionId, or Supabase client.', { hasUserId: !!finalUserId, hasQuestionId: !!questionId, hasSupabase: !!supabase });
        }
        
        // Return the feedback to the client
        return NextResponse.json({ feedback })
        
      } catch (jsonError) {
        console.error('[API:score] Error parsing feedback JSON from LLM:', jsonError);
        console.error('[API:score] Raw feedback from LLM that caused error:', rawFeedback);
        // Return a structured error if JSON parsing fails
        return NextResponse.json(
          { error: 'Failed to parse feedback from AI. Output was not valid JSON.', rawOutput: rawFeedback.substring(0, 500) + '...' }, 
          { status: 500 }
        );
      }
    } catch (error) {
      console.error('[API:score] Error during Azure OpenAI API call:', error)
      // Return a structured error for API call failures
      return NextResponse.json(
        { error: 'Error communicating with AI scoring service.', details: error instanceof Error ? error.message : String(error) }, 
        { status: 502 } // Bad Gateway, as we failed to get a response from upstream
      );
    }
  } catch (error) {
    console.error('[API:score] Unhandled error in POST handler:', error)
    // General catch-all for unexpected errors
    return NextResponse.json(
      { error: 'An unexpected error occurred on the server.', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 