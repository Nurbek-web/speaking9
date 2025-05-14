import { TestQuestion, TestInfo } from '@/components/speaking/types';

// Format time as MM:SS
export const formatTime = (seconds: number | null): string => {
  if (seconds === null) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Format time including hours if needed
export const formatOverallTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const hours = Math.floor(mins / 60);
  const remainingSecs = seconds % 60;
  const remainingMins = mins % 60;
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${remainingMins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
};

// Get standardized speaking duration for a question
export const getSpeakingDurationForQuestion = (question: TestQuestion | null): number => {
  if (!question || !question.part_number) {
    console.warn("[getSpeakingDurationForQuestion] Question or part_number not available. Defaulting to 40s.");
    return 40; 
  }
  const partNum = question.part_number;
  let duration = 40;
  if (partNum === 1) duration = 20;
  else if (partNum === 2) duration = 120;
  else if (partNum === 3) duration = 40;
  else console.warn(`[getSpeakingDurationForQuestion] Unknown part number: ${partNum}. Defaulting to 40s.`);
  return duration;
};

// Get timing info for each part of the test
export const getPartTimingInfo = (partNumber: number, testInfo: TestInfo | null) => {
  if (partNumber === 1) {
    return {
      label: "Short Answers",
      duration: testInfo?.part1_duration_seconds || 60,
      description: "Brief responses to general questions"
    };
  } else if (partNumber === 2) {
    return {
      label: "Long Turn",
      duration: testInfo?.part2_duration_seconds || 120,
      description: "Extended response to a topic card",
      prepTime: testInfo?.part2_preparation_seconds || 60
    };
  } else {
    return {
      label: "Discussion",
      duration: testInfo?.part3_duration_seconds || 240,
      description: "In-depth responses to follow-up questions"
    };
  }
};

// Calculate question progress percentages
export const calculateProgress = (
  currentQuestionIndex: number, 
  currentPartIndex: number, 
  questions: TestQuestion[]
) => {
  const currentPartNum = currentPartIndex + 1;
  const partQuestions = questions.filter(q => q.part_number === currentPartNum);
  
  return {
    totalQuestions: partQuestions.length,
    currentQuestion: currentQuestionIndex + 1,
    totalParts: 3,
    currentPart: currentPartNum,
    percentage: partQuestions.length > 0 
      ? (currentQuestionIndex / partQuestions.length) * 100 
      : 0
  };
};

// Check browser compatibility with MediaRecorder
export const getBrowserInfo = (): string => {
  const userAgent = navigator.userAgent;
  let browserName = "Unknown";
  let version = "Unknown";
  
  if (userAgent.match(/chrome|chromium|crios/i)) {
    browserName = "Chrome";
    const match = userAgent.match(/(?:chrome|chromium|crios)\/([\d.]+)/i);
    if (match && match[1]) version = match[1];
  } else if (userAgent.match(/firefox|fxios/i)) {
    browserName = "Firefox";
    const match = userAgent.match(/(?:firefox|fxios)\/([\d.]+)/i);
    if (match && match[1]) version = match[1];
  } else if (userAgent.match(/safari/i)) {
    browserName = "Safari";
    const match = userAgent.match(/version\/([\d.]+)/i);
    if (match && match[1]) version = match[1];
  } else if (userAgent.match(/opr\//i)) {
    browserName = "Opera";
    const match = userAgent.match(/opr\/([\d.]+)/i);
    if (match && match[1]) version = match[1];
  } else if (userAgent.match(/edg/i)) {
    browserName = "Edge";
    const match = userAgent.match(/edg(?:e|ios|a)\/([\d.]+)/i);
    if (match && match[1]) version = match[1];
  }
  
  // Log compatibility info
  console.log(`Browser: ${browserName} ${version}`);
  
  if (typeof MediaRecorder !== 'undefined') {
    console.log("MediaRecorder is supported");
    
    // Check supported MIME types
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];
    
    mimeTypes.forEach(type => {
      console.log(`${type}: ${MediaRecorder.isTypeSupported(type) ? 'Supported' : 'Not supported'}`);
    });
  } else {
    console.error("MediaRecorder is NOT supported in this browser");
  }
  
  return `${browserName} ${version}`;
};

// Check if microphone permission is granted
export const checkMicrophonePermission = async (): Promise<boolean> => {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    console.log(`Microphone permission status: ${result.state}`);
    
    if (result.state === 'denied') {
      return false;
    }
    return true;
  } catch (error) {
    console.log('Permissions API not supported, will try direct access:', error);
    return true; // Continue anyway for browsers that don't support the Permissions API
  }
}; 