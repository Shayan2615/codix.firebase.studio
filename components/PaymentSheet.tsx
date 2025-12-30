
import React, { useState, useEffect } from 'react';
import { XMarkIcon, CreditCardIcon, ChevronRightIcon, ShieldCheckIcon, WalletIcon, ArrowLeftIcon } from '@heroicons/react/24/solid';

interface PaymentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

type SheetStep = 'wallets' | 'confirm';

const PaymentSheet: React.FC<PaymentSheetProps> = ({ isOpen, onClose, onConfirm }) => {
  const [step, setStep] = useState<SheetStep>('wallets');
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep('wallets');
        setSelectedWallet(null);
      }, 300);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const wallets = [
    { name: 'MetaMask', icon: 'https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Logo.svg' },
    { name: 'Phantom', icon: 'https://phantom.app/img/phantom-logo.svg' },
    { name: 'Trust Wallet', icon: 'https://trustwallet.com/assets/images/media/assets/trust_wallet_logo.svg' },
    { name: 'Coinbase', icon: 'https://upload.wikimedia.org/wikipedia/commons/c/c2/Coinbase_Logo_2013.svg' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={onClose}></div>
      
      <div className={`relative w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-t-[3rem] shadow-[0_-20px_100px_rgba(0,0,0,1)] transition-all duration-500 ease-out transform ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        {/* Drag Handle */}
        <div className="w-12 h-1 bg-white/10 rounded-full mx-auto mt-4 mb-2"></div>

        <div className="p-8 pt-2 pb-12">
          {step === 'wallets' ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-2xl font-black font-orbitron text-white tracking-tight">CONNECT WALLET</h3>
                  <p className="text-gray-500 text-xs uppercase tracking-[0.2em] mt-1 font-bold">Select access provider</p>
                </div>
                <button onClick={onClose} className="p-3 bg-white/5 rounded-full hover:bg-white/10 transition-colors border border-white/5">
                  <XMarkIcon className="h-6 w-6 text-gray-400" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 mb-10">
                {wallets.map((wallet) => (
                  <button
                    key={wallet.name}
                    onClick={() => {
                        setSelectedWallet(wallet.name);
                        setStep('confirm');
                    }}
                    className="group flex items-center justify-between p-5 bg-white/5 hover:bg-white/[0.08] border border-white/5 hover:border-white/20 rounded-[1.5rem] transition-all"
                  >
                    <div className="flex items-center space-x-5">
                      <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center p-2.5 border border-white/10 group-hover:border-[#FF00FF]/50 transition-colors shadow-xl">
                        <WalletIcon className="h-full w-full text-gray-400 group-hover:text-[#FF00FF] transition-colors" />
                      </div>
                      <span className="text-lg font-bold text-gray-200 group-hover:text-white transition-colors tracking-tight">{wallet.name}</span>
                    </div>
                    <ChevronRightIcon className="h-6 w-6 text-gray-700 group-hover:text-[#FF00FF] transition-all transform group-hover:translate-x-1" />
                  </button>
                ))}
              </div>

              <div className="text-center p-5 bg-white/5 rounded-2xl border border-dashed border-white/10">
                <p className="text-gray-500 text-sm">Need a wallet? <span className="text-[#FF00FF] font-bold cursor-pointer hover:underline">Learn more</span></p>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="flex items-center mb-8">
                <button onClick={() => setStep('wallets')} className="mr-4 p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                    <ArrowLeftIcon className="h-5 w-5 text-gray-400" />
                </button>
                <div>
                  <h3 className="text-2xl font-black font-orbitron text-white tracking-tight uppercase">Confirm Order</h3>
                  <p className="text-[#FF00FF] text-[10px] uppercase tracking-[0.3em] font-black">Transaction ID: NV-{Math.floor(Math.random()*9000+1000)}</p>
                </div>
              </div>

              <div className="bg-black/50 border border-white/5 rounded-[2rem] p-8 mb-10 shadow-2xl space-y-6">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Recipient</span>
                  <span className="text-white font-mono text-xs bg-white/5 p-1 px-3 rounded-full border border-white/10">0xVa...7721</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Service</span>
                  <span className="text-white font-bold">1x Encryption Reveal</span>
                </div>
                <div className="flex justify-between items-end py-2 border-t border-white/5">
                  <span className="text-gray-400 font-black font-orbitron text-xs">AMOUNT DUE</span>
                  <div className="text-right">
                    <p className="text-3xl font-black text-[#FF00FF] font-orbitron tracking-tighter">0.50 USDT</p>
                    <p className="text-[10px] text-gray-600 font-bold uppercase">TRC-20 Network</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3 p-4 bg-[#39FF14]/5 rounded-2xl border border-[#39FF14]/20">
                  <ShieldCheckIcon className="h-6 w-6 text-[#39FF14]" />
                  <p className="text-[10px] text-[#39FF14] font-black uppercase tracking-[0.1em] leading-tight">Secured by Neon-Multi-Sig Protocol<br/>Transaction is immediate</p>
                </div>
              </div>

              <button 
                onClick={onConfirm}
                className="w-full bg-[#FF00FF] py-6 rounded-2xl font-orbitron font-black text-white shadow-[0_20px_50px_rgba(255,0,255,0.4)] hover:shadow-[0_25px_60px_rgba(255,0,255,0.6)] hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-[0.2em] text-sm flex items-center justify-center"
              >
                Sign & Pay 0.50 USDT
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentSheet;
