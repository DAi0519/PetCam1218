import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FilmStack, FilmImage } from './FilmStack';
import { ArrowDown, Sparkles, HardHat } from 'lucide-react';

// Portrait Mode Assets
import portrait1Original from '../../assets/landing/portrait/1-original.jpg';
import portrait1Result from '../../assets/landing/portrait/1-result.png';
import portrait2Original from '../../assets/landing/portrait/2-original.jpg';
import portrait2Result from '../../assets/landing/portrait/2-result.png';
import portrait3Original from '../../assets/landing/portrait/3-original.jpg';
import portrait3Result from '../../assets/landing/portrait/3-result.png';
import portrait4Original from '../../assets/landing/portrait/4-original.jpg';
import portrait4Result from '../../assets/landing/portrait/4-result.png';
import portrait5Original from '../../assets/landing/portrait/5-original.jpg';
import portrait5Result from '../../assets/landing/portrait/5-result.png';

// Hat Mode Assets
import hat1Original from '../../assets/landing/hat/1-original.jpg';
import hat1Result from '../../assets/landing/hat/1-result.jpg';
import hat2Original from '../../assets/landing/hat/2-original.jpg';
import hat2Result from '../../assets/landing/hat/2-result.jpg';
import hat3Original from '../../assets/landing/hat/3-original.jpg';
import hat3Result from '../../assets/landing/hat/3-result.jpg';
import hat4Original from '../../assets/landing/hat/4-original.jpg';
import hat4Result from '../../assets/landing/hat/4-result.png';
import hat5Original from '../../assets/landing/hat/5-original.jpg';
import hat5Result from '../../assets/landing/hat/5-result.png';

interface HeroProps {
  onStart: () => void;
}

type Mode = 'portrait' | 'hat';

export const Hero: React.FC<HeroProps> = ({ onStart }) => {
  const [mode, setMode] = useState<Mode>('portrait'); // Default to Portrait mode

  // Generate image data structure
  // Order is reversed so that ID 1 is at the top of the stack (last element = top z-index)
  const images: FilmImage[] = mode === 'portrait' 
    ? [
        { id: 5, original: portrait5Original, result: portrait5Result },
        { id: 4, original: portrait4Original, result: portrait4Result },
        { id: 3, original: portrait3Original, result: portrait3Result },
        { id: 2, original: portrait2Original, result: portrait2Result },
        { id: 1, original: portrait1Original, result: portrait1Result },
      ]
    : [
        { id: 5, original: hat5Original, result: hat5Result },
        { id: 4, original: hat4Original, result: hat4Result },
        { id: 3, original: hat3Original, result: hat3Result },
        { id: 2, original: hat2Original, result: hat2Result },
        { id: 1, original: hat1Original, result: hat1Result },
      ];

  return (
    <div className="relative w-full h-screen h-svh flex flex-col items-center justify-center overflow-hidden text-neutral-800">
      {/* Background Texture - Matching Camera Page */}
      <div className="absolute inset-0 bg-[#fdfbf7]"></div>
      <div className="absolute inset-0 opacity-60 bg-[url('https://www.transparenttextures.com/patterns/watercolor.png')] mix-blend-multiply"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.1)_100%)] pointer-events-none"></div>

      {/* Main Content Container - Responsive scaling for short screens */}
      <div className="z-10 flex flex-col items-center justify-center h-full w-full max-w-4xl lg:max-w-6xl mx-auto px-6 text-center pb-16 landscape:pb-4 landscape:scale-90 lg:scale-100 lg:landscape:scale-100">
        
        {/* Header Group */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex flex-col items-center relative"
        >
          <h1 className="relative font-display text-7xl md:text-9xl lg:text-[10rem] font-black tracking- normal mb-3 md:mb-6 text-neutral-900 leading-none">
            PET <span className="text-red-600">CAM</span>
            
            {/* Xmas Edition Badge */}
            <span className="absolute -top-8 -right-12 md:-right-16 font-graffiti text-2xl md:text-4xl text-red-600 rotate-[15deg] tracking-normal whitespace-nowrap">
              Xmas Edition
            </span>
          </h1>
          
          <p className="font-mono text-sm md:text-base text-neutral-500 max-w-md mx-auto leading-relaxed mb-6 md:mb-8">
            {mode === 'portrait' ? "Turn your pet into a Christmas star." : "Or add a hat to anything."}
          </p>

          {/* Mode Toggles - Closer to title */}
          <div className="flex items-center justify-center gap-3 mb-8 lg:mb-12">
            <button 
              onClick={() => setMode('portrait')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full font-mono text-xs transition-all border ${mode === 'portrait' ? 'bg-red-50 border-red-200 text-red-700 shadow-sm' : 'bg-white/40 border-transparent text-neutral-400 hover:bg-white/60'}`}
            >
              <Sparkles size={14} />
              Pet Portrait
            </button>
            <button 
              onClick={() => setMode('hat')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full font-mono text-xs transition-all border ${mode === 'hat' ? 'bg-red-50 border-red-200 text-red-700 shadow-sm' : 'bg-white/40 border-transparent text-neutral-400 hover:bg-white/60'}`}
            >
              <HardHat size={14} />
              Hat Only
            </button>
          </div>
        </motion.div>

        {/* Film Stack - Moved Up */}
        <div className="relative w-full flex justify-center items-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
            >
              <FilmStack images={images} />
            </motion.div>
          </AnimatePresence>
        </div>

      </div>

      {/* Scroll Indicator - Optimized for visibility */}
      <div className="absolute bottom-6 md:bottom-10 left-0 w-full flex justify-center z-20 pointer-events-none">
        <motion.div 
          className="flex flex-col items-center gap-1 text-black-400 cursor-pointer hover:text-black-600 transition-colors pointer-events-auto"
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
          onClick={onStart}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Scroll to Start</span>
          <ArrowDown size={16} strokeWidth={1.5} />
        </motion.div>
      </div>
    </div>
  );
};
