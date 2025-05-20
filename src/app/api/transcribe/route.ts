import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { AzureOpenAI } from 'openai'
import { auth } from '@clerk/nextjs/server'
import { clerkToSupabaseId } from '@/lib/clerkSupabaseAdapter'
import fetch from 'node-fetch'

// Configure Azure OpenAI client
const endpoint = process.env.AZURE_OPENAI_ENDPOINT || 'https://arnur-maw58kmn-swedencentral.cognitiveservices.azure.com'
const apiVersion = process.env.AZURE_OPENAI_API_VERSION_WHISPER || '2024-06-01'
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_WHISPER || 'whisper'
const apiKey = process.env.AZURE_OPENAI_API_KEY

// Check if required environment variables are available
if (!endpoint || !apiKey) {
  console.error('[API:transcribe] Missing required environment variables:', {
    hasEndpoint: !!endpoint,
    hasApiKey: !!apiKey,
    hasApiVersion: !!apiVersion,
    hasDeployment: !!deployment
  });
}

// Log the configuration (but mask API key)
console.log('[API:transcribe] Azure OpenAI configuration:', {
  endpoint: endpoint ? `${endpoint.substring(0, 15)}...` : 'Missing',
  apiVersion,
  deployment,
  hasApiKey: !!apiKey
});

// Initialize the Azure OpenAI client
const openai = new AzureOpenAI({
  apiVersion,
  endpoint,
  apiKey,
  deployment
})

// Function to transcribe audio using Azure OpenAI Whisper
async function transcribeAudio(audioData: ArrayBuffer | Buffer, filename: string, fileType: string): Promise<string> {
  try {
    console.log(`[transcribeAudio] Preparing request to ${endpoint}/openai/deployments/${deployment}/audio/transcriptions`);
    console.log(`[transcribeAudio] File size: ${Math.round((audioData.byteLength || 0) / 1024)} KB`);
    console.log(`[transcribeAudio] File type: ${fileType}, name: ${filename}`);
    
    // Convert buffer to proper format
    const fileBuffer = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData);
    
    // Create multipart form data with proper boundary
    const boundary = `----WebKitFormBoundary${Math.random().toString(16).substr(2)}`;
    const body = createMultipartFormData(boundary, 'file', fileBuffer, filename, fileType);
    
    // Note: We use the transcriptions endpoint, not translations
    const apiUrl = `${endpoint}/openai/deployments/${deployment}/audio/transcriptions?api-version=${apiVersion}`;
    console.log(`[transcribeAudio] Sending direct API request to: ${apiUrl}`);
    
    const headers: HeadersInit = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    };
    if (apiKey) {
      headers['api-key'] = apiKey;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[transcribeAudio] Azure OpenAI API error: ${response.status}`, errorText);
      throw new Error(`Azure OpenAI API error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log(`[transcribeAudio] Successfully received transcript, length: ${result.text?.length || 0} chars`);
    return result.text || '';
  } catch (error) {
    console.error('[transcribeAudio] Error:', error);
    throw error;
  }
}

// Helper function to create multipart form data from a buffer
function createMultipartFormData(boundary: string, fieldName: string, fileBuffer: Buffer, filename: string, contentType: string): Buffer {
  const modelField = `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`;
  const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`;
  const fileFooter = `\r\n--${boundary}--\r\n`;
  
  const headerBuffer = Buffer.from(modelField + fileHeader);
  const footerBuffer = Buffer.from(fileFooter);
  
  return Buffer.concat([headerBuffer, fileBuffer, footerBuffer]);
}

// Helper to fetch remote audio
async function fetchRemoteAudio(url: string): Promise<Buffer> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch remote audio: ${response.status} - ${response.statusText}`)
    }
    
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error) {
    console.error('[fetchRemoteAudio] Error:', error)
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authentication - try both Clerk and Supabase
    let userId = null
    
    // First try Clerk auth
    try {
      const session = await auth()
      if (session?.userId) {
        userId = clerkToSupabaseId(session.userId)
        console.log(`[API:transcribe] Authenticated via Clerk: ${userId.substring(0, 8)}...`)
      }
    } catch (clerkError) {
      console.error('[API:transcribe] Clerk auth error:', clerkError)
    }
    
    // Try Supabase auth if Clerk failed
    if (!userId) {
      try {
        // Create Supabase client with proper cookie handling
        const supabase = createRouteHandlerClient({ cookies });
        
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          userId = user.id
          console.log(`[API:transcribe] Authenticated via Supabase: ${userId.substring(0, 8)}...`)
        }
      } catch (supabaseError) {
        console.error('[API:transcribe] Supabase auth error:', supabaseError)
      }
    }

    // Parse request - support multiple formats
    const contentType = request.headers.get('content-type') || ''
    
    // Handle JSON payload (including data URLs)
    if (contentType.includes('application/json')) {
      const { audioUrl, isDataUrl, userId: clientUserId, questionId } = await request.json()
      
      // If no user ID from auth, use the one provided by client
      if (!userId && clientUserId) {
        userId = clientUserId
        console.log(`[API:transcribe] Using client-provided user ID: ${userId.substring(0, 8)}...`)
      }
      
      if (!audioUrl) {
        return NextResponse.json({ error: 'No audio URL provided' }, { status: 400 })
      }
      
      // Process data URL
      if ((isDataUrl === true || audioUrl.startsWith('data:'))) {
        console.log('[API:transcribe] Processing data URL')
        try {
          // Convert data URL to buffer
          const base64Data = audioUrl.split(',')[1]
          if (!base64Data) {
            return NextResponse.json(
              { error: 'Invalid data URL format' },
              { status: 400 }
            )
          }
          
          const buffer = Buffer.from(base64Data, 'base64')
          
          // Transcribe the audio
          const text = await transcribeAudio(buffer, `audio-${Date.now()}.webm`, 'audio/webm')
          
          return NextResponse.json({ text })
        } catch (error) {
          console.error('[API:transcribe] Data URL processing error:', error)
          return NextResponse.json(
            { error: 'Failed to transcribe data URL' },
            { status: 500 }
          )
        }
      }
      
      // Process remote URL
      if (audioUrl.startsWith('http')) {
        console.log('[API:transcribe] Processing remote URL')
        try {
          // Fetch the remote audio file
          const audioBuffer = await fetchRemoteAudio(audioUrl)
          
          // Transcribe the audio
          const text = await transcribeAudio(audioBuffer, `audio-${Date.now()}.webm`, 'audio/webm')
          
          return NextResponse.json({ text })
        } catch (error) {
          console.error('[API:transcribe] Remote URL processing error:', error)
          return NextResponse.json(
            { error: 'Failed to transcribe remote audio' },
            { status: 500 }
          )
        }
      }
      
      return NextResponse.json(
        { error: 'Unsupported audio URL format' },
        { status: 400 }
      )
    }
    
    // Handle multipart form (file upload)
    if (contentType.includes('multipart/form-data')) {
      try {
        console.log('[API:transcribe] Processing multipart form data');
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        
        if (!file) {
          console.error('[API:transcribe] No file found in form data');
          const formKeys = Array.from(formData.keys());
          console.log('[API:transcribe] Available form fields:', formKeys);
          return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }
        
        console.log(`[API:transcribe] Received file: ${file.name}, size: ${Math.round(file.size/1024)}KB, type: ${file.type}`);
        
        if (file.size === 0) {
          console.error('[API:transcribe] File has zero size');
          return NextResponse.json({ error: 'Empty file provided' }, { status: 400 });
        }
        
        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer();
        console.log(`[API:transcribe] Converted file to ArrayBuffer: ${Math.round(arrayBuffer.byteLength/1024)}KB`);
        
        // Transcribe the audio
        const text = await transcribeAudio(arrayBuffer, file.name || `audio-${Date.now()}`, file.type || 'audio/wav');
        console.log(`[API:transcribe] Successfully transcribed audio, text length: ${text.length} chars`);
        
        return NextResponse.json({ text });
      } catch (formError) {
        console.error('[API:transcribe] Form processing error:', formError);
        return NextResponse.json(
          { error: 'Failed to process form data', details: formError instanceof Error ? formError.message : String(formError) },
          { status: 500 }
        );
      }
    }
    
    // Unsupported content type
    return NextResponse.json(
      { error: `Unsupported content type: ${contentType}` },
      { status: 400 }
    )
  } catch (error) {
    console.error('[API:transcribe] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to process transcription request' },
      { status: 500 }
    )
  }
} 