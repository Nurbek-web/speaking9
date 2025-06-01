import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { AzureOpenAI } from 'openai'
import { auth } from '@clerk/nextjs/server'
import { clerkToSupabaseId } from '@/lib/clerkSupabaseAdapter'
import fetch from 'node-fetch'
import { createClient } from '@supabase/supabase-js'

// Configure supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

// Configure Azure OpenAI client
const endpoint = process.env.AZURE_OPENAI_ENDPOINT || 'https://arnur-maw58kmn-swedencentral.cognitiveservices.azure.com'
const apiVersion = process.env.AZURE_OPENAI_API_VERSION_WHISPER || '2024-06-01'
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_WHISPER || 'whisper'
const apiKey = process.env.AZURE_OPENAI_API_KEY || 'AMvnGtAnULquGoRp2z7c82dwxbynfqQQ4kirI17ayYB0gsS6EeKmJQQJ99BEACfhMk5XJ3w3AAAAACOG5yz4'

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

// Create multipart form data with binary audio
function createAzureMultipartFormData(boundary: string, fieldName: string, fileBuffer: Buffer, filename: string, contentType: string): Buffer {
  const parts = [];
  
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`));
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  
  return Buffer.concat(parts);
}

async function extractAudioData(req: Request): Promise<{fileBuffer: Buffer, filename: string, fileType: string}> {
  const contentTypeHeader = req.headers.get('content-type') || '';
  
  if (contentTypeHeader.includes('multipart/form-data')) {
    console.log('[transcribeAudio] Processing multipart/form-data for audio extraction');
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) {
      throw new Error('No audio file found in form data for extraction');
    }
    console.log(`[transcribeAudio] Extracting file: ${file.name}, type: ${file.type}, size: ${file.size} bytes`);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    
    // Enhanced debugging for uploaded files
    console.log('[transcribeAudio] File buffer analysis:', {
      bufferLength: fileBuffer.length,
      firstBytes: Array.from(fileBuffer.slice(0, 20)),
      lastBytes: Array.from(fileBuffer.slice(-20)),
      nonZeroBytes: fileBuffer.filter(byte => byte !== 0).length,
      contentPercentage: `${(fileBuffer.filter(byte => byte !== 0).length / fileBuffer.length * 100).toFixed(1)}%`
    });
    
    return { fileBuffer, filename: file.name || 'audio.webm', fileType: file.type || 'audio/webm' };
  }
  
  const requestData = await req.json();
  const { audioUrl, isDataUrl, isSynthetic, isPlaceholder } = requestData;
  console.log(`[transcribeAudio] Processing JSON request for audio extraction: isDataUrl=${isDataUrl}, isSynthetic=${isSynthetic}, isPlaceholder=${isPlaceholder}`);

  if (isSynthetic || isPlaceholder) {
    console.log('[transcribeAudio] Using placeholder for synthetic/placeholder audio extraction');
    return { 
      fileBuffer: Buffer.from('PLACEHOLDER_AUDIO_CONTENT'), 
      filename: 'placeholder.wav', 
      fileType: 'audio/wav' 
    };
  }
  
  try {
    if (isDataUrl) {
      const matches = audioUrl.match(/^data:(.+);base64,(.+)$/);
      if (!matches) throw new Error('Invalid data URL format for extraction');
      const fileType = matches[1];
      const base64Data = matches[2];
      const fileBuffer = Buffer.from(base64Data, 'base64');
      const extension = fileType.split('/')[1] || 'webm';
      console.log(`[transcribeAudio] Extracted data URL for audio: type=${fileType}, size=${fileBuffer.length} bytes`);
      
      // Enhanced debugging for data URLs
      console.log('[transcribeAudio] Data URL buffer analysis:', {
        bufferLength: fileBuffer.length,
        firstBytes: Array.from(fileBuffer.slice(0, 20)),
        nonZeroBytes: fileBuffer.filter(byte => byte !== 0).length,
        contentPercentage: `${(fileBuffer.filter(byte => byte !== 0).length / fileBuffer.length * 100).toFixed(1)}%`
      });
      
      return { fileBuffer, filename: `audio.${extension}`, fileType };
    } else {
      console.log(`[transcribeAudio] Fetching audio from URL for extraction: ${audioUrl.substring(0, 60)}...`);
      const response = await fetch(audioUrl);
      if (!response.ok) throw new Error(`Failed to fetch audio for extraction: ${response.status} ${response.statusText}`);
      const fileBuffer = Buffer.from(await response.arrayBuffer());
      const responseContentType = response.headers.get('content-type') || 'audio/webm';
      const extension = responseContentType.split('/')[1] || 'webm';
      console.log(`[transcribeAudio] Fetched audio from URL for extraction: type=${responseContentType}, size=${fileBuffer.length} bytes`);
      
      // Enhanced debugging for fetched URLs
      console.log('[transcribeAudio] Fetched URL buffer analysis:', {
        bufferLength: fileBuffer.length,
        firstBytes: Array.from(fileBuffer.slice(0, 20)),
        nonZeroBytes: fileBuffer.filter(byte => byte !== 0).length,
        contentPercentage: `${(fileBuffer.filter(byte => byte !== 0).length / fileBuffer.length * 100).toFixed(1)}%`
      });
      
      return { fileBuffer, filename: `audio.${extension}`, fileType: responseContentType };
    }
  } catch (error) {
    console.error('[transcribeAudio] Error extracting audio data:', error);
    throw new Error('Failed to process audio URL or data for extraction');
  }
}

// Generate a simple WAV file for fallback 
function createFallbackWavAudio(): Buffer {
  // Create a very basic 1-second silent WAV file (16-bit, 44.1kHz, mono)
  const sampleRate = 44100;
  const numSamples = sampleRate * 1; // 1 second
  
  // WAV header (44 bytes)
  const headerBuffer = Buffer.alloc(44);
  
  // RIFF chunk descriptor
  headerBuffer.write('RIFF', 0);
  headerBuffer.writeUInt32LE(36 + numSamples * 2, 4); // Chunk size
  headerBuffer.write('WAVE', 8);
  
  // "fmt " sub-chunk
  headerBuffer.write('fmt ', 12);
  headerBuffer.writeUInt32LE(16, 16); // Subchunk1 size
  headerBuffer.writeUInt16LE(1, 20); // Audio format (PCM)
  headerBuffer.writeUInt16LE(1, 22); // Num channels (mono)
  headerBuffer.writeUInt32LE(sampleRate, 24); // Sample rate
  headerBuffer.writeUInt32LE(sampleRate * 2, 28); // Byte rate
  headerBuffer.writeUInt16LE(2, 32); // Block align
  headerBuffer.writeUInt16LE(16, 34); // Bits per sample
  
  // "data" sub-chunk
  headerBuffer.write('data', 36);
  headerBuffer.writeUInt32LE(numSamples * 2, 40); // Subchunk2 size
  
  // Create a data buffer with silence (zeros) instead of sine wave
  // This will be recognized as silence by Whisper and return empty transcript
  const dataBuffer = Buffer.alloc(numSamples * 2, 0); // Fill with zeros for silence
  
  // Combine header and data
  return Buffer.concat([headerBuffer, dataBuffer]);
}

// Function to prepare audio in a format Azure will accept
async function prepareAudioForAzure(fileBuffer: Buffer, fileType: string): Promise<{buffer: Buffer, fileType: string}> {
  // If it's our placeholder content, return a generated WAV file
  if (fileBuffer.toString() === 'PLACEHOLDER_AUDIO_CONTENT') {
    console.log('[prepareAudioForAzure] Creating a fallback WAV file for placeholder content');
    return { 
      buffer: createFallbackWavAudio(),
      fileType: 'audio/wav'
    };
  }
  
  // CRITICAL FIX: Don't convert webm;codecs=opus - it's already a valid format for Azure
  if (fileType === 'audio/webm;codecs=opus' || fileType === 'audio/webm') {
    console.log(`[prepareAudioForAzure] Keeping original webm format - Azure Whisper supports this natively`);
    return { buffer: fileBuffer, fileType: 'audio/webm' };
  }
  
  // If it's already a format that we know Azure accepts
  if (
    fileType === 'audio/wav' || 
    fileType === 'audio/mp3' || 
    fileType === 'audio/mp4' || 
    fileType === 'audio/mpeg' ||
    fileType === 'audio/ogg'
  ) {
    console.log(`[prepareAudioForAzure] Audio is already in a compatible format: ${fileType}`);
    return { buffer: fileBuffer, fileType };
  }
  
  console.log(`[prepareAudioForAzure] Unsupported format ${fileType}, but trying anyway`);
  return { buffer: fileBuffer, fileType };
}

// Simple function to try converting raw PCM to WAV by adding a header
function convertRawAudioToWav(pcmBuffer: Buffer): Buffer {
  // PCM data in webm;codecs=pcm is usually 16-bit signed integer at 48kHz
  const sampleRate = 48000;
  const numChannels = 1; // Mono
  const bitsPerSample = 16;
  
  // Create WAV header
  const headerBuffer = Buffer.alloc(44);
  
  // RIFF chunk descriptor
  headerBuffer.write('RIFF', 0);
  headerBuffer.writeUInt32LE(36 + pcmBuffer.length, 4); // Chunk size
  headerBuffer.write('WAVE', 8);
  
  // "fmt " sub-chunk
  headerBuffer.write('fmt ', 12);
  headerBuffer.writeUInt32LE(16, 16); // Subchunk1 size
  headerBuffer.writeUInt16LE(1, 20); // Audio format (PCM)
  headerBuffer.writeUInt16LE(numChannels, 22); // Num channels
  headerBuffer.writeUInt32LE(sampleRate, 24); // Sample rate
  headerBuffer.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28); // Byte rate
  headerBuffer.writeUInt16LE(numChannels * bitsPerSample / 8, 32); // Block align
  headerBuffer.writeUInt16LE(bitsPerSample, 34); // Bits per sample
  
  // "data" sub-chunk
  headerBuffer.write('data', 36);
  headerBuffer.writeUInt32LE(pcmBuffer.length, 40); // Subchunk2 size
  
  // Combine header and PCM data
  return Buffer.concat([headerBuffer, pcmBuffer]);
}

// Fix function to normalize audio file type for Azure API
function normalizeFileTypeForAzure(fileType: string): string {
  // Handle the codec parameter that's causing failures
  if (fileType.includes('webm;codecs=pcm')) {
    console.log('[normalizeFileTypeForAzure] Converting audio/webm;codecs=pcm to audio/webm');
    return 'audio/webm';
  }
  
  // Handle other potentially problematic formats
  if (fileType.includes(';')) {
    // Strip any codec information or parameters
    const baseType = fileType.split(';')[0].trim();
    console.log(`[normalizeFileTypeForAzure] Simplifying ${fileType} to ${baseType}`);
    return baseType;
  }
  
  return fileType;
}

// Fix function to update filename extension based on normalized content type
function getExtensionFromContentType(contentType: string): string {
  const baseType = contentType.split('/')[1]?.split(';')[0] || 'webm';
  return baseType;
}

async function performAzureTranscription(fileBuffer: Buffer, filename: string, fileType: string): Promise<string> {
  try {
    console.log(`[performAzureTranscription] Starting for file: ${filename}, type: ${fileType}, size: ${fileBuffer.length} bytes`);
    
    // Only reject extremely small files (under 50 bytes), give others a chance
    if (fileBuffer.length < 50 && fileBuffer.toString() !== 'PLACEHOLDER_AUDIO_CONTENT') {
      console.log('[performAzureTranscription] Audio file extremely small (< 50 bytes), likely corrupted.');
      return "Audio file appears to be corrupted. Please try recording again.";
    }
    
    // First, prepare the audio in a compatible format
    const { buffer: preparedBuffer, fileType: preparedFileType } = await prepareAudioForAzure(fileBuffer, fileType);
    console.log(`[performAzureTranscription] Audio prepared for Azure, new format: ${preparedFileType}, size: ${preparedBuffer.length} bytes`);
    
    // Update filename to match the new format - keep webm extension for webm files
    let preparedFilename = filename;
    if (preparedFileType === 'audio/webm') {
      preparedFilename = filename.replace(/\.[^.]+$/, '.webm');
    } else {
      const extension = preparedFileType.split('/')[1];
      preparedFilename = filename.replace(/\.[^.]+$/, `.${extension}`);
    }
    
    const boundary = `----WebKitFormBoundary${Math.random().toString(16).substr(2)}`;
    const body = createAzureMultipartFormData(boundary, 'file', preparedBuffer, preparedFilename, preparedFileType);
    const apiVersion = '2024-06-01';
    const apiUrl = `${endpoint}/openai/deployments/${deployment}/audio/translations?api-version=${apiVersion}`;
    console.log(`[performAzureTranscription] Sending request to: ${apiUrl}`);
    const queryParams = new URLSearchParams({
      'language': 'en',
      'response_format': 'json',
      'temperature': '0'
    });
    const fullUrl = `${apiUrl}&${queryParams.toString()}`;
    console.log(`[performAzureTranscription] Full request URL: ${fullUrl}`);
    
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: body,
    });
    
    const responseText = await response.text();
    console.log(`[performAzureTranscription] Raw API response: ${responseText.substring(0,500)}`);
    if (!response.ok) {
      console.error(`[performAzureTranscription] API error: ${response.status} - ${responseText}`);
      
      // Handle specific Azure errors gracefully
      try {
        const errorData = JSON.parse(responseText);
        if (errorData.error?.code === 'audio_too_short') {
          console.log('[performAzureTranscription] Audio too short error from Azure');
          return "The recording was too short. Please speak for at least 1-2 seconds and try again.";
        }
        if (errorData.error?.code === 'invalid_audio') {
          console.log('[performAzureTranscription] Invalid audio error from Azure');
          return "The audio recording is invalid or corrupted. Please try recording again.";
        }
      } catch (parseError) {
        console.log('[performAzureTranscription] Could not parse error response');
      }
      
      throw new Error(`Transcription API error (${response.status})`);
    }
    
    // Parse the JSON response from Azure
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[performAzureTranscription] Error parsing Azure response JSON:', parseError, 'Raw response:', responseText);
      throw new Error('Failed to parse Azure transcription response');
    }

    // Check the text for the transcribed content
    if (responseData && typeof responseData.text === 'string') {
      const transcribedText = responseData.text.trim();
      
      if (transcribedText === "") {
        console.log('[performAzureTranscription] Azure returned empty text (silence detected)');
        return "[No speech detected]";
      }
      
      // Check for common Whisper artifacts that indicate non-speech audio
      const commonArtifacts = [
        "thanks for watching",
        "thank you for watching", 
        "thanks for listening",
        "thank you for listening",
        "music playing",
        "music",
        "♪",
        "♫"
      ];
      
      const lowerText = transcribedText.toLowerCase();
      const isLikelyArtifact = commonArtifacts.some(artifact => 
        lowerText.includes(artifact.toLowerCase())
      );
      
      // Only filter artifacts if they are very short AND exactly match our known patterns
      // Be more conservative - only filter if it's a very close match to known artifacts
      if (isLikelyArtifact && transcribedText.length < 30) {
        const exactMatches = commonArtifacts.filter(artifact => 
          lowerText === artifact.toLowerCase() || 
          lowerText === artifact.toLowerCase() + '.' ||
          lowerText === artifact.toLowerCase() + '!'
        );
        
        if (exactMatches.length > 0) {
          console.log(`[performAzureTranscription] Detected exact artifact match: "${transcribedText}"`);
          return "[No clear speech detected]";
        } else {
          // It contains an artifact but isn't an exact match - could be real speech
          console.log(`[performAzureTranscription] Contains artifact-like text but not exact match, keeping: "${transcribedText}"`);
        }
      }
      
      console.log(`[performAzureTranscription] Successful: "${transcribedText.substring(0, 50)}..."`);
      return transcribedText;
    } else {
      console.error('[performAzureTranscription] Unexpected API response format from Azure:', responseText);
      return "[Transcription failed - unexpected response format]";
    }
  } catch (error) {
    console.error('[performAzureTranscription] Error during transcription:', error);
    throw error; // Re-throw to be caught by the main POST handler
  }
}

// API route handler
export async function POST(req: Request) {
  try {
    const { fileBuffer, filename, fileType } = await extractAudioData(req);
    
    if (fileBuffer.toString() === 'PLACEHOLDER_AUDIO_CONTENT') {
      console.log('[POST transcribe] Using placeholder transcription for synthetic/placeholder audio.');
      return NextResponse.json({ text: "I didn't hear any speech. Please try recording again or check microphone settings." });
    }
    
    const transcription = await performAzureTranscription(fileBuffer, filename, fileType);
    return NextResponse.json({ text: transcription });

  } catch (error) {
    console.error('[POST transcribe] Error in transcription endpoint:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during transcription processing.';
    // Add more specific error messages based on type of error if possible
    if (errorMessage.includes('Failed to process audio URL or data for extraction')) {
         return NextResponse.json({ error: 'Could not read or access the provided audio data.' }, { status: 400 });
    }
    if (errorMessage.includes('No audio file found in form data for extraction')){
        return NextResponse.json({ error: 'Audio file was not correctly uploaded or sent.' }, { status: 400 });
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 