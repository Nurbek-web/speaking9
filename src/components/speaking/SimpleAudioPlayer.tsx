import React, { useState, useRef, useEffect, useCallback } from 'react';

interface SimpleAudioPlayerProps {
  src: string;
  blob?: Blob;
  className?: string;
}

const SimpleAudioPlayer: React.FC<SimpleAudioPlayerProps> = ({ src, blob, className }) => {
  const [duration, setDuration] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // Estimate duration from blob size if metadata loading fails
  const estimateDuration = useCallback((blob: Blob | undefined): number => {
    if (!blob) return 0;
    // Estimate based on typical audio bitrate (128kbps)
    return Math.max(3, Math.min(60, Math.round(blob.size / (128000 / 8))));
  }, []);
  
  // Handle metadata loaded
  const handleMetadataLoaded = useCallback(() => {
    if (audioRef.current) {
      const audioDuration = audioRef.current.duration;
      
      if (audioDuration && isFinite(audioDuration)) {
        setDuration(audioDuration);
        console.log(`[SimpleAudioPlayer] Metadata loaded, duration: ${audioDuration}s`);
      } else if (blob) {
        const estimated = estimateDuration(blob);
        setDuration(estimated);
        console.log(`[SimpleAudioPlayer] Invalid duration, using estimated: ${estimated}s`);
      }
    }
  }, [blob, estimateDuration]);
  
  // Handle time updates
  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      
      // If we're playing beyond our known duration, update it
      if (duration && audioRef.current.currentTime > duration) {
        setDuration(audioRef.current.currentTime);
      }
    }
  }, [duration]);
  
  // Handle play state changes
  const handlePlayStateChange = useCallback(() => {
    if (audioRef.current) {
      setIsPlaying(!audioRef.current.paused);
    }
  }, []);
  
  // Handle errors
  const handleError = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    console.error('[SimpleAudioPlayer] Error playing audio:', e);
    setError('Could not play recording');
    
    // Try to set an estimated duration on error
    if (blob && !duration) {
      const estimated = estimateDuration(blob);
      setDuration(estimated);
    }
  }, [blob, duration, estimateDuration]);
  
  // Effect to instantiate audio when src changes
  useEffect(() => {
    if (src && audioRef.current) {
      // Reset state on new source
      setCurrentTime(0);
      setIsPlaying(false);
      setError(null);
      
      // Try to load metadata
      audioRef.current.load();
    }
  }, [src]);
  
  // Format time display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className={`audio-player ${className || ''}`}>
      <audio
        ref={audioRef}
        src={src}
        controls
        className="w-full h-10"
        onLoadedMetadata={handleMetadataLoaded}
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlayStateChange}
        onPause={handlePlayStateChange}
        onError={handleError}
      >
        Your browser does not support audio playback.
      </audio>
      
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>
          {duration
            ? `Duration: ${Math.round(duration)}s`
            : blob
              ? `Est. duration: ${estimateDuration(blob)}s`
              : 'Loading...'}
        </span>
        
        {currentTime > 0 && (
          <span>Played: {formatTime(currentTime)}</span>
        )}
      </div>
      
      {error && (
        <div className="text-xs text-red-500 mt-1">{error}</div>
      )}
    </div>
  );
};

export default SimpleAudioPlayer; 