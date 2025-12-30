
import React from 'react';

interface NeonButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  color: 'green' | 'purple';
  type?: 'button' | 'submit';
  disabled?: boolean;
  fullWidth?: boolean;
}

const NeonButton: React.FC<NeonButtonProps> = ({ onClick, children, color, type = 'button', disabled, fullWidth }) => {
  const styles = {
    green: 'bg-[#39FF14] text-black shadow-[0_0_15px_rgba(57,255,20,0.4)] hover:shadow-[0_0_25px_rgba(57,255,20,0.6)]',
    purple: 'bg-[#FF00FF] text-white shadow-[0_0_15px_rgba(255,0,255,0.4)] hover:shadow-[0_0_25px_rgba(255,0,255,0.6)]'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${fullWidth ? 'w-full' : 'flex-1'} ${styles[color]} py-4 px-6 rounded-xl font-orbitron font-bold uppercase tracking-widest text-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center`}
    >
      {children}
    </button>
  );
};

export default NeonButton;
