import React from "react";

interface SoundWaveAnimationProps {
  className?: string;
}

const SoundWaveAnimation: React.FC<SoundWaveAnimationProps> = ({
  className = "",
}) => {
  return (
    <div className={`flex items-center justify-center gap-1 ${className}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="w-1 h-5 bg-green-500 rounded-full sound-wave" />
      ))}
    </div>
  );
};

export default SoundWaveAnimation;
