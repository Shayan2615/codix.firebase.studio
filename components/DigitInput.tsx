
import React, { useRef, useCallback, useState } from 'react';

interface DigitInputProps {
  value: string;
  onValueChange: (newValue: string) => void;
  disabled: boolean;
}

const DigitInput: React.FC<DigitInputProps> = ({ value, onValueChange, disabled }) => {
  const numericValue = parseInt(value, 10);
  const isWheeling = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);
  const touchStartRef = useRef(0);
  const isDragging = useRef(false);

  const handleIncrement = useCallback(() => {
    const nextValue = (numericValue + 1) % 10;
    onValueChange(nextValue.toString());
  }, [numericValue, onValueChange]);

  const handleDecrement = useCallback(() => {
    const prevValue = (numericValue - 1 + 10) % 10;
    onValueChange(prevValue.toString());
  }, [numericValue, onValueChange]);

  const handleWheel = (e: React.WheelEvent) => {
    if (disabled || isWheeling.current) return;
    isWheeling.current = true;
    if (e.deltaY < 0) handleDecrement();
    else handleIncrement();
    setTimeout(() => { isWheeling.current = false; }, 120);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled) return;
    touchStartRef.current = e.touches[0].clientY;
    isDragging.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (disabled || !isDragging.current) return;
    const offset = e.touches[0].clientY - touchStartRef.current;
    setDragOffset(offset);
  };

  const onTouchEnd = () => {
    if (disabled || !isDragging.current) return;
    isDragging.current = false;
    if (dragOffset > 25) handleDecrement();
    else if (dragOffset < -25) handleIncrement();
    setDragOffset(0);
  };

  // Increased height from 5rem (20) to 6rem (24)
  const reelOffsetRem = -numericValue * 6; 
  const totalOffset = `calc(${reelOffsetRem}rem + ${dragOffset}px)`;

  return (
    <div 
      className={`relative w-11 sm:w-16 h-24 bg-[#0a0a0a] border-2 rounded-xl sm:rounded-2xl overflow-hidden flex justify-center items-center transition-all duration-500 shadow-2xl ${
        disabled 
        ? 'border-[#39FF14] shadow-[0_0_25px_rgba(57,255,20,0.6)] bg-[#39FF14]/15 scale-105 z-10' 
        : 'border-white/[0.08] hover:border-white/20 cursor-ns-resize'
      }`}
      onWheel={handleWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div 
        className={`absolute top-0 left-0 w-full transition-transform duration-300 ease-out`}
        style={{ transform: `translateY(${totalOffset})` }}
      >
        {[...Array(10).keys()].map(n => (
          <div key={n} className={`h-24 flex items-center justify-center text-3xl sm:text-5xl font-black font-orbitron select-none ${disabled ? 'text-[#39FF14] drop-shadow-[0_0_12px_rgba(57,255,20,0.8)]' : 'text-gray-300'}`}>
            {n}
          </div>
        ))}
      </div>
      
      {/* Target area highlight */}
      <div className={`absolute w-full h-[1px] top-1/2 -translate-y-1/2 ${disabled ? 'bg-[#39FF14] shadow-[0_0_15px_#39FF14]' : 'bg-white/10'}`}></div>
      
      {/* Industrial aesthetic details */}
      <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-black to-transparent pointer-events-none opacity-80"></div>
      <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black to-transparent pointer-events-none opacity-80"></div>
    </div>
  );
};

export default DigitInput;
