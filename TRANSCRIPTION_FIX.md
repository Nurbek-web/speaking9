# Transcription Issue Fix - "Thanks for watching!" Problem

## Problem Description

The IELTS speaking test was returning generic placeholder transcriptions like "Thanks for watching!" and "Thank you for watching." instead of actual speech transcriptions. This was causing users to receive incorrect feedback based on text they never spoke.

## Root Cause Analysis

The issue was in the transcription API (`/api/transcribe/route.ts`) where small audio files (< 1KB) were being automatically replaced with a generated sine wave audio using `createFallbackWavAudio()`. When Azure Whisper transcribed these synthetic sine wave tones, it produced generic responses like "Thanks for watching!" - a common artifact when Whisper encounters pure audio tones or music.

### Key Issues:
1. **Overly aggressive small file filtering** - Files < 1KB were replaced with synthetic audio
2. **Sine wave generation** - Created a 440Hz tone that Whisper interpreted as content requiring a closing statement
3. **Poor error message handling** - Generic responses instead of helpful user feedback

## Solution Implemented

### 1. Improved Audio Validation (src/app/api/transcribe/route.ts)

**Before:**
- Files < 1KB → automatic replacement with sine wave
- Sine wave → "Thanks for watching!" transcription

**After:**
- Files < 500 bytes → check content quality first
- Analyze non-zero byte percentage to detect empty/corrupted files
- Only files with < 10% content → silent audio (not sine wave)
- Real audio content → attempt to process regardless of size

```typescript
// Check if the buffer contains mostly zeros (likely empty/corrupted)
const nonZeroBytes = fileBuffer.filter(byte => byte !== 0).length;
const nonZeroPercentage = nonZeroBytes / fileBuffer.length;

if (nonZeroPercentage < 0.1) { // Less than 10% non-zero bytes
  console.log('[prepareAudioForAzure] File appears to be mostly empty/corrupted, creating silent fallback');
  return {
    buffer: createFallbackWavAudio(), // Now creates silence, not sine wave
    fileType: 'audio/wav'
  };
}
```

### 2. Silent Fallback Audio Instead of Sine Wave

**Before:**
```typescript
// Generate a low amplitude sine wave (440Hz)
const value = Math.floor(Math.sin(Math.PI * 2 * 440 * i / sampleRate) * 1000);
dataBuffer.writeInt16LE(value, i * 2);
```

**After:**
```typescript
// Create a data buffer with silence (zeros) instead of sine wave
// This will be recognized as silence by Whisper and return empty transcript
const dataBuffer = Buffer.alloc(numSamples * 2, 0); // Fill with zeros for silence
```

### 3. Artifact Detection and Filtering

Added detection for common Whisper artifacts when encountering non-speech audio:

```typescript
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

if (isLikelyArtifact && transcribedText.length < 50) {
  console.log(`[performAzureTranscription] Detected likely transcription artifact: "${transcribedText}"`);
  return "[No clear speech detected]";
}
```

### 4. Better Error Messages

**Before:**
- `"I didn't hear any speech. Please try speaking more clearly."`
- `"[Transcription failed]"`

**After:**
- `"[No speech detected]"` - for empty/silent audio
- `"[No clear speech detected]"` - for artifact detection
- `"Audio file appears to be corrupted. Please try recording again."` - for malformed files
- `"The recording was too short. Please speak for at least 1-2 seconds and try again."` - for Azure errors

### 5. Enhanced Audio Recording Analysis

Added comprehensive logging in `AudioRecordingService.ts` to help diagnose audio quality issues:

```typescript
console.log('[AudioRecordingService] Audio quality analysis:', {
  totalChunks: this.audioChunks.length,
  totalSize: blob.size,
  averageChunkSize: Math.round(avgChunkSize),
  recordingDuration: `${recordingDuration}ms`,
  bytesPerSecond: Math.round(bytesPerSecond),
  estimatedBitrate: Math.round(bytesPerSecond * 8) + ' bps'
})
```

### 6. Updated Scoring API

Modified `src/app/api/score/route.ts` to handle the new transcription error messages appropriately:

```typescript
const isTranscriptionFailure = transcript.includes("[Audio transcription failed") ||
                               transcript.includes("[Transcription failed]") ||
                               transcript.includes("[No speech detected]") ||
                               transcript.includes("[No clear speech detected]") ||
                               transcript.includes("[Transcription failed - unexpected response format]")
```

## Result

The transcription system now:
1. ✅ **Preserves real speech** - Small but valid audio files are processed correctly
2. ✅ **Provides helpful feedback** - Clear error messages when no speech is detected
3. ✅ **Detects artifacts** - Filters out Whisper hallucinations like "Thanks for watching!"
4. ✅ **Better debugging** - Comprehensive logging for audio quality analysis

## Testing

To test the fix:
1. Record very short speech (1-2 seconds) - should transcribe correctly
2. Record silence - should return "[No speech detected]"
3. Skip recording - should handle appropriately
4. Check browser console for audio quality metrics

## Files Changed

- `src/app/api/transcribe/route.ts` - Main transcription logic
- `src/app/api/score/route.ts` - Error message handling
- `src/app/(secure)/tests/[testId]/speaking/services/AudioRecordingService.ts` - Enhanced logging
- `TRANSCRIPTION_FIX.md` - This documentation

The "Thanks for watching!" issue is now resolved, and users should receive accurate transcriptions of their actual speech. 