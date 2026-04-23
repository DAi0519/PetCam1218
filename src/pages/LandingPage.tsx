import React, { useState, useEffect } from 'react';
import { Hero } from '../components/landing/Hero';
import RetroCamera from '../components/RetroCamera';
import { AnimatePresence, motion } from 'framer-motion';

export const LandingPage: React.FC = () => {
  const [showCamera, setShowCamera] = useState(false);

  const handleStart = () => {
    setShowCamera(true);
  };

  // Scroll detection
  useEffect(() => {
    if (showCamera) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY > 30) {
        setShowCamera(true);
      }
    };
    
    let touchStartY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };
    const handleTouchMove = (e: TouchEvent) => {
      const touchEndY = e.touches[0].clientY;
      if (touchStartY - touchEndY > 50) { // Swipe up (scroll down content)
         setShowCamera(true);
      }
    };

    window.addEventListener('wheel', handleWheel);
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove);

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [showCamera]);

  return (
    <div className="app-viewport relative w-full overflow-hidden bg-[#fdfbf7]">
      <AnimatePresence>
        {!showCamera && (
          <motion.div
            key="landing"
            initial={{ y: 0 }}
            exit={{ y: '-100%', transition: { duration: 0.8, ease: [0.43, 0.13, 0.23, 0.96] } }}
            className="absolute inset-0 z-50 will-change-transform"
          >
            <Hero onStart={handleStart} />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Camera is always rendered behind to ensure it's ready */}
      <div className="absolute inset-0 z-0">
         <RetroCamera />
      </div>
    </div>
  );
};
