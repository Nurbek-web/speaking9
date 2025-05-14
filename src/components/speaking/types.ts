// Types for speaking test components
export type TestQuestion = {
  id: string
  part_number: number
  question_number: number
  sequence_number: number
  question_text: string
  question_type: 'standard' | 'cue_card'
  topic?: string
  preparation_time_seconds?: number
  speaking_time_seconds: number
}

export type TestInfo = {
  id: string
  title: string
  description: string | null
  part1_duration_seconds?: number;
  part2_duration_seconds?: number;
  part2_preparation_seconds?: number;
  part3_duration_seconds?: number;
}

export interface UserResponse {
  id?: string;
  test_question_id: string;
  audioBlob?: Blob;
  audioFile?: File;
  blobSize?: number;
  blobType?: string;
  audio_url?: string;
  transcript?: string;
  transcriptTimestamp?: string;
  bandScore?: number;
  scoringTimestamp?: string;
  status?: 'not_started' | 'in_progress' | 'skipped' | 'completed';
  feedback?: FeedbackResult;
  preparationSkipped?: boolean;
  recordedAt?: string;
  skippedAt?: string;
}

export type FeedbackResult = {
  fluency_coherence_score: number
  lexical_resource_score: number
  grammar_accuracy_score: number
  pronunciation_score: number
  overall_band_score: number
  general_feedback: string
  fluency_coherence_feedback: string
  lexical_resource_feedback: string
  grammar_accuracy_feedback: string
  pronunciation_feedback: string
  model_answer: string
}

export type RecordingStatus = 'idle' | 'recording' | 'stopped' | 'processing' | 'completed' | 'error' | 'stopping';
export type UserAction = 'idle' | 'wantsToRecord' | 'wantsToStop' | 'wantsToSkip' | 'timerExpired';

// Part names for display
export const PART_NAMES = [
  'Part 1: Introduction and Interview', 
  'Part 2: Individual Long Turn', 
  'Part 3: Two-Way Discussion'
]; 