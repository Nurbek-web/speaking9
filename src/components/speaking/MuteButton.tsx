import React from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MuteButtonProps {
  isMuted: boolean;
  toggleMute: () => void;
  className?: string;
}

const MuteButton: React.FC<MuteButtonProps> = ({ 
  isMuted, 
  toggleMute,
  className 
}) => {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleMute}
      className={cn(
        'relative rounded-full p-2', 
        isMuted ? 'bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700' : 
                 'bg-gray-100 hover:bg-gray-200 text-gray-700',
        className
      )}
      title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
      aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
    >
      {isMuted ? (
        <>
          <MicOff size={18} />
          <span className="sr-only">Unmute</span>
        </>
      ) : (
        <>
          <Mic size={18} />
          <span className="sr-only">Mute</span>
        </>
      )}
      
      {/* Status indicator dot */}
      {!isMuted && (
        <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-green-500 border border-white" />
      )}
    </Button>
  );
};

export default MuteButton; 