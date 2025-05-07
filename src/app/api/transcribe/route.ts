import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { AzureOpenAI } from 'openai'

// Configure Azure OpenAI client
const endpoint = process.env.AZURE_OPENAI_ENDPOINT || ''
const apiVersion = process.env.AZURE_OPENAI_API_VERSION_WHISPER || '2024-06-01'
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_WHISPER || 'whisper'
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
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Check if request is multipart form data
    if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Request must be multipart/form-data' },
        { status: 400 }
      )
    }
    
    const formData = await request.formData()
    const audioFile = formData.get('file') as File
    
    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      )
    }
    
    // Convert File to Buffer for OpenAI API
    const arrayBuffer = await audioFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    // Create a blob object for OpenAI
    const blob = new Blob([buffer], { type: audioFile.type })
    
    // Transcribe with Azure OpenAI Whisper
    const transcription = await openai.audio.translations.create({
      file: new File([blob], audioFile.name, { type: audioFile.type }),
      model: 'whisper-1', // Required parameter but replaced by deployment in Azure
    })
    
    return NextResponse.json(transcription)
  } catch (error: any) {
    console.error('Error in transcription:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to transcribe audio' },
      { status: 500 }
    )
  }
} 