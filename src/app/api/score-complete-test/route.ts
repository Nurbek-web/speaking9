import { NextRequest, NextResponse } from 'next/server';
import { AzureOpenAI } from 'openai';
import { createClient } from '@supabase/supabase-js';

// Configure Azure OpenAI client (matching transcribe API configuration)
const endpoint = process.env.AZURE_OPENAI_ENDPOINT || 'https://arnur-maw58kmn-swedencentral.cognitiveservices.azure.com'
const apiVersion = process.env.AZURE_OPENAI_API_VERSION_GPT || '2025-01-01-preview'
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1'
const apiKey = process.env.AZURE_OPENAI_API_KEY

// Check if required environment variables are available
if (!endpoint || !apiKey) {
  console.error('[API:score] Missing required Azure OpenAI environment variables:', {
    hasEndpoint: !!endpoint,
    hasApiKey: !!apiKey,
    hasApiVersion: !!apiVersion,
    hasDeployment: !!deployment
  });
}

// Log the configuration (but mask API key)
console.log('[API:score] Azure OpenAI configuration:', {
  endpoint: endpoint ? `${endpoint.substring(0, 15)}...` : 'Missing',
  apiVersion,
  deployment,
  hasApiKey: !!apiKey
});

// Initialize Azure OpenAI
const openai = new AzureOpenAI({
  apiVersion,
  endpoint,
  apiKey,
  deployment
});

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

console.log('[API:score] Supabase URL:', supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'Missing')
console.log('[API:score] Supabase Service Key:', supabaseServiceKey ? 'Set' : 'Missing')

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
  try {
    // Get request data
    const {
      userId,
      testId,
      transcriptData,
      skippedQuestions,
      totalQuestions
    } = await req.json();

    // Validate required data
    if (!userId || !testId || !transcriptData || !Array.isArray(transcriptData)) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, testId, or transcriptData' },
        { status: 400 }
      );
    }

    // Build the formatted transcript for evaluation
    const formattedTranscripts = transcriptData.map(item => {
      return `
Question (Part ${item.partNumber}): ${item.questionText}
Student Response: ${item.transcript}
      `.trim();
    }).join('\n\n');

    // Add information about skipped questions
    const skippedInfo = skippedQuestions && skippedQuestions.length > 0 
      ? `\n\nNOTE: The student skipped ${skippedQuestions.length} out of ${totalQuestions} questions.`
      : '';

    // Create the prompt for GPT-4
    const prompt = `
You are an IELTS speaking examiner evaluating a student's responses.

SPEAKING TEST RESPONSES:
${formattedTranscripts}
${skippedInfo}

Task: Evaluate the student's speaking ability according to the official IELTS criteria:
1. Fluency and Coherence
2. Lexical Resource (vocabulary)
3. Grammatical Range and Accuracy
4. Pronunciation

Provide detailed feedback on each criterion and assign appropriate band scores.
Create a JSON object with the following structure:
{
  "feedback": {
    "band_score": number,
    "overall_band_score": number,
    "fluency_coherence_score": number,
    "lexical_resource_score": number,
    "grammar_accuracy_score": number,
    "pronunciation_score": number,
    "general_feedback": "string",
    "fluency_coherence_feedback": "string",
    "lexical_resource_feedback": "string",
    "grammar_accuracy_feedback": "string", 
    "pronunciation_feedback": "string",
    "model_answer": "string",
    "band_scores": { 
      "fluency": number, 
      "lexical": number, 
      "grammar": number, 
      "pronunciation": number, 
      "overall": number 
    },
    "strengths": "string with bullet points",
    "areas_for_improvement": "string with bullet points",
    "study_advice": "string with bullet points"
  },
  "questionFeedback": {
    // For each question ID, provide feedback
    "${transcriptData[0]?.questionId}": {
      "band_score": number,
      "feedback": "string"
    }
    // Include all question IDs
  }
}

Ensure all scores are between 0.0 and 9.0 and rounded to the nearest 0.5.
If the student skipped many questions, adjust scores accordingly. 
Be honest but constructive in your feedback.
`.trim();

    console.log("Sending evaluation request to Azure OpenAI...");

    // Call the Azure OpenAI API with GPT-4.1 deployment
    const response = await openai.chat.completions.create({
      model: deployment, // Use Azure deployment name instead of OpenAI model name
      messages: [
        {
          role: 'system',
          content: 'You are an expert IELTS examiner.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 2500,
    });

    // Parse the response
    const responseText = response.choices[0]?.message?.content || '{}';
    const data = JSON.parse(responseText);

    // Save the feedback to Supabase
    try {
      const { error: feedbackError } = await supabase
        .from('test_feedback')
        .insert({
          user_id: userId,
          cambridge_test_id: testId,
          feedback: data.feedback,
          created_at: new Date().toISOString()
        });

      if (feedbackError) {
        console.error("Error saving feedback:", feedbackError);
      }

      // Save individual question feedback
      if (data.questionFeedback) {
        for (const [questionId, feedback] of Object.entries(data.questionFeedback)) {
          const { error: questionFeedbackError } = await supabase
            .from('question_feedback')
            .insert({
              user_id: userId,
              test_question_id: questionId,
              feedback,
              created_at: new Date().toISOString()
            });

          if (questionFeedbackError) {
            console.error(`Error saving feedback for question ${questionId}:`, questionFeedbackError);
          }
        }
      }
    } catch (dbError) {
      console.error("Database error:", dbError);
    }

    // Return the response
    return NextResponse.json(data);

  } catch (error) {
    console.error("Error processing score-complete-test request:", error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 