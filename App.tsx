
import React, { useState, useCallback, useEffect } from 'react';
import { generateValidCode } from './utils/codeLogic';
import DigitInput from './components/DigitInput'; 
import NeonButton from './components/NeonButton';
import PaymentSheet from './components/PaymentSheet';
import { LockClosedIcon, LightBulbIcon, EnvelopeIcon, ArrowPathIcon, UserCircleIcon, KeyIcon } from '@heroicons/react/24/solid';

type GameState = 'verification' | 'playing' | 'won';

const CODE_LENGTH = 7;
const MAX_WINNERS = 10;
const MAX_HINTS = 3;
const LOCAL_STORAGE_KEY = 'codix_v5';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>('verification');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpPhase, setIsOtpPhase] = useState(false);
  const [secretCode, setSecretCode] = useState<string[]>([]);
  const [userInput, setUserInput] = useState<string[]>(Array(CODE_LENGTH).fill('0'));
  const [revealedIndices, setRevealedIndices] = useState<number[]>([]);
  const [isPaymentSheetOpen, setIsPaymentSheetOpen] = useState(false);
  const [winnersCount, setWinnersCount] = useState(0);
  const [feedback, setFeedback] = useState({ message: '', type: '' });
  const [isChecking, setIsChecking] = useState(false);
  const [roundId, setRoundId] = useState<string | null>(null);

  // Initialize round on mount
  useEffect(() => {
    const savedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedStateJSON) {
      const savedState = JSON.parse(savedStateJSON);
      // Only reset if the previous round was completed (10 winners)
      if (savedState.winnersCount >= MAX_WINNERS) {
        initNewRound();
      } else {
        setRoundId(savedState.roundId);
        setWinnersCount(savedState.winnersCount || 0);
      }
    } else {
      initNewRound();
    }
  }, []);

  const initNewRound = () => {
    const newRoundId = `round-${Date.now()}`;
    setRoundId(newRoundId);
    setWinnersCount(0);
    const initialState = { 
      roundId: newRoundId, 
      winnersCount: 0, 
      userData: {},
      assignedCodes: []
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(initialState));
    return initialState;
  };

  // Save progress to localStorage
  useEffect(() => {
    if (!roundId || !email || gameState === 'verification') return;
    const savedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
    const existingState = savedStateJSON ? JSON.parse(savedStateJSON) : { assignedCodes: [] };
    
    const codeStr = secretCode.join('');
    const assignedCodes = new Set(existingState.assignedCodes || []);
    assignedCodes.add(codeStr);

    const stateToSave = {
      ...existingState,
      winnersCount,
      assignedCodes: Array.from(assignedCodes),
      userData: {
        ...existingState.userData,
        [email]: {
          secretCode,
          userInput,
          revealedIndices,
          hasWon: gameState === 'won'
        }
      }
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
  }, [winnersCount, email, secretCode, userInput, revealedIndices, gameState, roundId]);

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsOtpPhase(true);
    setFeedback({ message: 'OTP SENT TO EMAIL (CODE: 1234)', type: 'info' });
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp !== '1234') {
      setFeedback({ message: 'INVALID OTP. PLEASE USE 1234.', type: 'error' });
      return;
    }

    const savedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
    const savedState = savedStateJSON ? JSON.parse(savedStateJSON) : { assignedCodes: [], userData: {} };
    const userData = savedState.userData?.[email];

    if (userData) {
      setSecretCode(userData.secretCode);
      setUserInput(userData.userInput);
      setRevealedIndices(userData.revealedIndices || []);
      setGameState(userData.hasWon ? 'won' : 'playing');
    } else {
      const assignedCodesSet = new Set<string>(savedState.assignedCodes || []);
      const newCode = generateValidCode(CODE_LENGTH, assignedCodesSet);
      
      setSecretCode(newCode);
      setUserInput(Array(CODE_LENGTH).fill('0'));
      setRevealedIndices([]);
      setGameState('playing');
    }
    setFeedback({ message: '', type: '' });
  };

  const applyHint = useCallback(() => {
    if (secretCode.length === 0 || revealedIndices.length >= MAX_HINTS) return;
    const availableIndices = Array.from({ length: CODE_LENGTH }, (_, i) => i)
      .filter(i => !revealedIndices.includes(i));
    if (availableIndices.length === 0) return;
    const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    const newRevealed = [...revealedIndices, randomIndex];
    setRevealedIndices(newRevealed);
    const newUserInput = [...userInput];
    newUserInput[randomIndex] = secretCode[randomIndex];
    setUserInput(newUserInput);
  }, [secretCode, revealedIndices, userInput]);

  const handleCheckCode = () => {
    if (isChecking) return;
    setIsChecking(true);
    setFeedback({ message: 'AUTHENTICATING SEQUENCE...', type: 'info' });

    setTimeout(() => {
      if (userInput.join('') === secretCode.join('')) {
        setFeedback({ 
          message: 'SUCCESS! CHECK YOUR EMAIL TO PROVIDE WALLET ADDRESS.', 
          type: 'success' 
        });
        
        // Just increment the count. If it hits MAX_WINNERS, 
        // the next refresh will trigger initNewRound via useEffect on mount.
        setWinnersCount(prev => prev + 1);
        setGameState('won');
      } else {
        setFeedback({ message: 'DENIED. ACCESS KEY MISMATCH.', type: 'error' });
      }
      setIsChecking(false);
    }, 1200);
  };

  return (
    <main className="bg-[#050505] min-h-screen text-white flex flex-col items-center justify-center p-2 sm:p-4 overflow-x-hidden font-rajdhani">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-full bg-[radial-gradient(circle_at_50%_0%,_rgba(57,255,20,0.08)_0%,_transparent_60%)] pointer-events-none"></div>
      
      <div className="w-full max-w-4xl relative z-10">
        <div className="p-4 sm:p-10 border border-white/10 bg-black/50 backdrop-blur-3xl rounded-[1.5rem] sm:rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.8)] overflow-hidden">
          {gameState === 'verification' ? (
            <div className="w-full max-w-md mx-auto py-10">
              <div className="text-center mb-10">
                <h2 className="text-3xl font-bold text-white mb-2 font-orbitron tracking-tight">
                  {isOtpPhase ? 'VERIFICATION' : 'LOGIN'}
                </h2>
                <p className="text-gray-400">
                  {isOtpPhase ? `Enter the code sent to your email` : 'Sign in to access the vault.'}
                </p>
              </div>
              {!isOtpPhase ? (
                <form onSubmit={handleSendOtp} className="space-y-6">
                  <div className="relative group">
                    <EnvelopeIcon className="h-6 w-6 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#39FF14] transition-colors" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email"
                      required
                      className="w-full bg-black/40 border border-gray-800 rounded-xl py-4 pl-14 pr-4 text-white placeholder-gray-600 focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14] outline-none transition-all font-mono"
                    />
                  </div>
                  <NeonButton color="green" onClick={() => {}} type="submit" fullWidth>
                    LOGIN
                  </NeonButton>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-6">
                  <div className="relative group">
                    <KeyIcon className="h-6 w-6 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#39FF14] transition-colors" />
                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="OTP Code"
                      maxLength={4}
                      required
                      className="w-full bg-black/40 border border-gray-800 rounded-xl py-4 pl-14 pr-4 text-white placeholder-gray-600 focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14] outline-none transition-all font-mono tracking-[1em] text-center"
                    />
                  </div>
                  <div className="flex flex-col gap-3">
                    <NeonButton color="green" onClick={() => {}} type="submit" fullWidth>
                      VERIFY
                    </NeonButton>
                    <button type="button" onClick={() => setIsOtpPhase(false)} className="text-gray-500 text-xs uppercase tracking-widest font-bold hover:text-white transition-colors">
                      Change Email
                    </button>
                  </div>
                </form>
              )}
              {feedback.message && (
                <p className={`mt-6 text-center text-xs font-bold uppercase tracking-widest ${feedback.type === 'error' ? 'text-red-500' : 'text-blue-400'}`}>
                  {feedback.message}
                </p>
              )}
            </div>
          ) : (
            <div className="w-full max-w-4xl mx-auto flex flex-col items-center">
              <div className="w-full flex justify-between items-center mb-8 p-4 bg-white/5 rounded-2xl border border-white/5">
                <div className="flex items-center space-x-3 text-gray-400">
                  <UserCircleIcon className="h-6 w-6 text-[#FF00FF]" />
                  <span className="font-mono text-[10px] sm:text-sm tracking-tighter opacity-80 truncate max-w-[120px] sm:max-w-none">{email}</span>
                </div>
                <div className="text-right">
                  <p className="text-[8px] sm:text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">Round Winners</p>
                  <p className="text-[#39FF14] font-black text-lg sm:text-xl font-orbitron leading-none">{winnersCount} / {MAX_WINNERS}</p>
                </div>
              </div>

              <div className="text-center mb-6 px-4">
                <h1 className="text-3xl sm:text-6xl font-black text-white mb-2 font-orbitron tracking-tighter uppercase select-none">
                  Codi<span className="text-[#39FF14]">X</span>
                </h1>
                <p className="text-gray-500 uppercase tracking-widest text-[10px] font-bold">Break the 7-digit encryption</p>
              </div>
              
              <div className="relative w-full py-12 px-2 mb-4 border-y border-white/5 bg-gradient-to-b from-transparent via-white/5 to-transparent overflow-hidden">
                <div className="absolute inset-0 bg-radial-gradient from-[#39FF14]/5 to-transparent blur-3xl pointer-events-none"></div>
                <div className="flex items-center justify-center space-x-1 sm:space-x-3">
                  {userInput.map((digit, index) => (
                    <DigitInput
                      key={index}
                      value={digit}
                      onValueChange={(val) => {
                        const next = [...userInput];
                        next[index] = val;
                        setUserInput(next);
                      }}
                      disabled={isChecking || gameState === 'won' || revealedIndices.includes(index)}
                    />
                  ))}
                </div>
              </div>

              <div className="h-24 flex items-center justify-center w-full mb-6 text-center">
                {feedback.message && (
                  <div className={`p-4 px-6 sm:px-8 rounded-full border font-orbitron text-[10px] sm:text-xs font-bold text-center animate-pulse transition-all duration-300 max-w-[95%] ${
                    feedback.type === 'success' ? 'bg-[#39FF14]/10 border-[#39FF14]/50 text-[#39FF14] shadow-[0_0_30px_rgba(57,255,20,0.3)]' : 
                    feedback.type === 'error' ? 'bg-red-500/10 border-red-500/50 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)]' : 
                    'bg-blue-500/10 border-blue-500/50 text-blue-400'
                  }`}>
                    {feedback.message}
                  </div>
                )}
              </div>
              
              <div className="w-full max-w-lg flex flex-col gap-5 px-4">
                {gameState === 'won' ? (
                  <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <div className="w-full text-center bg-[#39FF14]/10 border border-[#39FF14]/40 p-8 rounded-3xl shadow-[0_0_40px_rgba(57,255,20,0.2)]">
                      <h3 className="text-2xl font-black text-[#39FF14] font-orbitron mb-2 uppercase tracking-tight">Access Granted</h3>
                      <p className="text-gray-300 text-sm leading-relaxed uppercase tracking-[0.15em] font-medium">Check your inbox. We've sent an authentication email to verify your wallet address.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-4 w-full">
                    <NeonButton color="purple" onClick={() => setIsPaymentSheetOpen(true)} disabled={isChecking || revealedIndices.length >= MAX_HINTS}>
                      <LightBulbIcon className="h-5 w-5 mr-2" />
                      HINT ({revealedIndices.length}/{MAX_HINTS})
                    </NeonButton>
                    <NeonButton color="green" onClick={handleCheckCode} disabled={isChecking}>
                      {isChecking ? <ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" /> : <LockClosedIcon className="h-5 w-5 mr-2" />}
                      {isChecking ? 'DECRYPTING...' : 'BREACH VAULT'}
                    </NeonButton>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <PaymentSheet 
        isOpen={isPaymentSheetOpen}
        onClose={() => setIsPaymentSheetOpen(false)}
        onConfirm={() => {
          applyHint();
          setIsPaymentSheetOpen(false);
        }}
      />
    </main>
  );
};

export default App;
