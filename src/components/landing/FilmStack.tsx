import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, ChevronLeft, ChevronRight } from 'lucide-react';

export interface FilmImage {
  id: number;
  original: string;
  result: string;
}

interface FilmStackProps {
  images: FilmImage[];
}

export const FilmStack: React.FC<FilmStackProps> = ({ images }) => {
  const [stack, setStack] = useState(images);
  const [showOriginal, setShowOriginal] = useState(false);
  const [direction, setDirection] = useState(0); // -1 left, 1 right
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  React.useEffect(() => {
    const checkScreen = () => setIsLargeScreen(window.innerWidth >= 1024);
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  const swipe = (dir: number) => {
    setDirection(dir);
    setStack(prev => {
      const newStack = [...prev];
      if (dir === -1) {
        // Swipe Left (Next): shift first to end, like horizontal scroll left
        const first = newStack.shift();
        if (first) newStack.push(first);
      } else {
        // Swipe Right (Previous): pop last to front, like horizontal scroll right
        const last = newStack.pop();
        if (last) newStack.unshift(last);
      }
      return newStack;
    });
  };

  return (
    <div className="relative w-56 h-[22rem] md:w-64 md:h-[26rem] mx-auto perspective-1000">
      <AnimatePresence custom={direction} initial={false}>
        {stack.map((item, index) => {
          const centerIndex = Math.floor(stack.length / 2);
          const offsetIndex = index - centerIndex;
          const distance = Math.abs(offsetIndex);
          const isTop = index === centerIndex;
          
          let rotation = 0;
          let xOffset = 0;
          let yOffset = 0;
          let scale = 1;

          if (!isTop) {
             const sign = offsetIndex < 0 ? -1 : 1; // Left or right side
             
             // Responsive spread calculation
             const spreadBase = isLargeScreen ? 60 : 20;
             const spreadIncrement = isLargeScreen ? 40 : 15;
             const rotationBase = isLargeScreen ? 6 : 4;
             const rotationIncrement = isLargeScreen ? 4 : 3;

             rotation = sign * (rotationBase + distance * rotationIncrement); 
             xOffset = sign * (spreadBase + distance * spreadIncrement); 
             yOffset = distance * 2;
             scale = 1 - (distance * 0.05);
          }
          
          return (
            <motion.div
              key={item.id}
              custom={direction}
              className="absolute top-0 left-0 w-full h-full bg-white p-2 pb-10 shadow-xl rounded-[2px] border border-gray-200 flex flex-col cursor-grab active:cursor-grabbing origin-bottom"
              style={{ 
                zIndex: stack.length - distance,
              }}
              animate={{
                rotate: rotation,
                x: xOffset,
                y: yOffset,
                scale: scale,
                transition: { duration: 0.4, type: 'spring', stiffness: 200, damping: 20 }
              }}
              variants={{
                enter: (dir: number) => ({
                  x: dir === 1 ? -200 : 200,
                  opacity: 0,
                  scale: 0.8,
                  rotate: dir === 1 ? -10 : 10,
                }),
                exit: (dir: number) => ({
                  x: dir === 1 ? 250 : -250,
                  opacity: 0,
                  scale: 0.9,
                  rotate: dir === 1 ? 15 : -15,
                  transition: { duration: 0.3 }
                })
              }}
              initial="enter"
              exit="exit"
              drag={isTop ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.7}
              onDragEnd={(_, info) => {
                if (info.offset.x > 50) swipe(1);
                else if (info.offset.x < -50) swipe(-1);
              }}
            >
              <div className="w-full flex-1 bg-gray-100 overflow-hidden rounded-[1px] relative group">
                 <img 
                   src={showOriginal && isTop ? item.original : item.result} 
                   alt={`Film ${item.id}`} 
                   className={`w-full h-full object-cover pointer-events-none select-none transition-all duration-300`}
                 />
                 
                 {/* Original/Result Toggle for Top Card */}
                 {isTop && (
                   <div 
                     className="absolute bottom-2 right-2 bg-black/60 text-white p-1.5 rounded-full backdrop-blur-sm opacity-100 transition-opacity cursor-pointer hover:bg-black/80"
                     onMouseDown={(e) => { e.stopPropagation(); setShowOriginal(true); }}
                     onMouseUp={(e) => { e.stopPropagation(); setShowOriginal(false); }}
                     onMouseLeave={(e) => { e.stopPropagation(); setShowOriginal(false); }}
                     onTouchStart={(e) => { e.stopPropagation(); setShowOriginal(true); }}
                     onTouchEnd={(e) => { e.stopPropagation(); setShowOriginal(false); }}
                   >
                     {showOriginal ? <EyeOff size={14} /> : <Eye size={14} />}
                   </div>
                 )}

                 {showOriginal && isTop && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="bg-black/70 text-white px-3 py-1 rounded-full font-mono text-xs backdrop-blur-md">ORIGINAL</span>
                    </div>
                 )}

                 <div className="absolute inset-0 bg-gradient-to-tr from-red-50/10 to-blue-50/10 mix-blend-overlay pointer-events-none" />
              </div>
              
              <div className="h-8 flex items-center justify-between px-2">
                <span className="font-graffiti text-neutral-400 text-[10px] rotate-[-1deg] opacity-60">
                  #PetCam_{item.id}
                </span>
                {isTop && (
                  <div className="flex gap-1 text-neutral-300">
                     <ChevronLeft size={14} className="hover:text-neutral-500 cursor-pointer" onClick={(e) => { e.stopPropagation(); swipe(1); }} />
                     <ChevronRight size={14} className="hover:text-neutral-500 cursor-pointer" onClick={(e) => { e.stopPropagation(); swipe(-1); }} />
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
