# Microphone & Transcription Debug Guide

## The Issue
You spoke clearly for 10-12 seconds but are still getting "[No speech detected]" or "[No clear speech detected]" in the transcription results.

## Debugging Steps

### Step 1: Test Your Microphone
1. **Use the built-in microphone test** in the speaking test interface
   - Look for the "Test Mic" button in the recording section
   - Speak normally for 3 seconds during the test
   - Check the result message

2. **Check browser console logs**
   - Open Developer Tools (F12)
   - Go to Console tab
   - Look for `[MicTest]` logs during the test
   - Expected good results: `Max: >50`, `Avg: >10`

### Step 2: Check Audio Recording Quality
When you complete a recording, check the browser console for these logs:

```
[SpeakingTestContainer] Audio recording completed:
- size: Should be >10KB for 10-12 seconds of speech
- type: Usually "audio/webm" 
- sizePerSecond: Should be >1000 bytes/second
- estimatedBitrate: Should be >8000 bps

[SpeakingTestContainer] Audio blob analysis:
- contentPercentage: Should be >20% for real speech
- nonZeroBytes: Should be substantial (thousands)
```

### Step 3: Check Transcription Processing
Look for these logs in the Network tab or Console:

```
[transcribeAudio] File buffer analysis:
- bufferLength: Should match your audio blob size
- contentPercentage: Should be >20%
- nonZeroBytes: Should be substantial

[prepareAudioForAzure] Audio file analysis:
- Should NOT trigger "mostly empty/corrupted" message
- Should attempt conversion rather than fallback

[performAzureTranscription] Azure response:
- Should show actual transcription attempt
- Should NOT be returning empty text
```

## Potential Issues & Solutions

### Issue 1: Empty Audio Data
**Symptoms:** 
- `contentPercentage: <5%`
- `size: <1KB` for 10+ seconds
- `nonZeroBytes: <100`

**Solutions:**
- Check microphone permissions in browser
- Try different browser (Chrome, Firefox, Safari)
- Check if microphone is muted in system settings
- Try different microphone if available

### Issue 2: Microphone Not Detected
**Symptoms:**
- Microphone test fails
- "Microphone access failed" error
- No audio levels detected

**Solutions:**
1. **Check browser permissions:**
   - Click the lock icon in address bar
   - Allow microphone access
   - Refresh the page

2. **Check system settings:**
   - Windows: Settings > Privacy > Microphone
   - Mac: System Preferences > Security & Privacy > Microphone
   - Ensure browser has microphone access

3. **Try different browser:**
   - Chrome (best WebRTC support)
   - Firefox (good alternative)
   - Safari (if on Mac)

### Issue 3: Low Audio Levels
**Symptoms:**
- Microphone test shows "low levels"
- `maxLevel: <20` in mic test
- Small audio file size despite long recording

**Solutions:**
- Speak closer to microphone
- Increase microphone volume in system settings
- Check if microphone is working in other apps
- Try external microphone/headset

### Issue 4: Audio Format Issues
**Symptoms:**
- Large audio file but still "[No speech detected]"
- Good microphone test but transcription fails
- Console shows format conversion errors

**Solutions:**
- Try different browser
- Clear browser cache and cookies
- Disable browser extensions temporarily
- Check if antivirus is interfering

## Advanced Debugging

### Check Raw Audio Data
In browser console, after recording:
```javascript
// Run this after a recording to analyze the audio blob
window.debugAudio = async (blob) => {
  const buffer = await blob.arrayBuffer()
  const data = new Uint8Array(buffer)
  console.log('Audio Analysis:', {
    totalBytes: data.length,
    nonZeroBytes: data.filter(b => b !== 0).length,
    firstBytes: Array.from(data.slice(0, 20)),
    maxValue: Math.max(...data),
    avgValue: data.reduce((a,b) => a+b, 0) / data.length
  })
}
```

### Test Azure Whisper Directly
If the above shows good audio data but transcription still fails, the issue might be with Azure Whisper processing.

### Browser Compatibility
**Best:** Chrome/Chromium browsers
**Good:** Firefox  
**Limited:** Safari (some WebRTC limitations)
**Avoid:** Internet Explorer, old Edge

## Temporary Workaround
If you continue having issues:
1. Try the microphone test until it shows "✅ Microphone working well!"
2. Record longer (15+ seconds) to ensure sufficient audio data
3. Speak clearly and loudly
4. Try a different browser
5. Use an external microphone/headset if available

## Reporting Issues
If problems persist, please provide:
1. Browser and version
2. Operating system
3. Microphone test results
4. Console logs from recording attempt
5. Audio blob analysis results

The enhanced debugging will help identify whether the issue is:
- Microphone hardware/permissions
- Audio recording quality  
- Audio format/encoding
- Transcription service processing 