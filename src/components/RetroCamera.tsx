import React, { useState, useRef, useEffect, useCallback } from 'react';
import { fileToBase64, getMimeType } from '../utils/fileHelpers';
import { generateChristmasPet, getGenerationStatus, startGenerationProcessing } from '../services/gemini';
import catSticker from '../assets/cat-sticker.png';
import santaHatSticker from '../assets/santa-hat-sticker.png';
import leverSound from '../assets/sounds/lever-custom.m4a';
import ejectSound from '../assets/sounds/eject-custom.m4a';

// --- Types ---
interface DevelopedPhoto {
  id: number;
  url: string;
  x: number;
  y: number;
  rotation: number;
  zIndex: number;
  isLanding: boolean;
}

interface PendingGeneration {
  generationId: number;
  mode: 'pet_fashion' | 'simple_hat';
  startedAt: number;
}

const PHOTO_STORAGE_KEY = 'petcam:photos';
const PENDING_GENERATION_STORAGE_KEY = 'petcam:pending-generation';
const PROCESSING_RETRY_WINDOW_MS = 15_000;

// --- High Precision Icon System ---

const IconWrapper = ({ children, onClick, title, colorClass = "text-neutral-400 hover:text-neutral-600" }: { children: React.ReactNode, onClick: (e: React.MouseEvent) => void, title: string, colorClass?: string }) => (
  <button 
    onClick={onClick}
    className={`group/icon relative p-2 rounded-full transition-all duration-300 hover:bg-black/5 active:scale-95 ${colorClass} flex items-center justify-center`}
    title={title}
  >
    {children}
  </button>
);

const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

// --- Sub-components for Realism & Christmas Atmosphere ---

const Screw = ({ className = "", onClick }: { className?: string, onClick?: () => void }) => (
  <div 
    onClick={onClick}
    className={`w-2.5 h-2.5 rounded-full bg-gradient-to-b from-[#e5e5e5] to-[#999] shadow-[0_1px_1px_rgba(0,0,0,0.6),inset_0_1px_2px_rgba(255,255,255,0.9)] flex items-center justify-center ${className} ${onClick ? 'cursor-pointer hover:brightness-110 active:scale-95' : ''}`}>
    <div className="w-[80%] h-[1px] bg-[#444] rotate-[random] opacity-60 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]" style={{ transform: `rotate(${Math.random() * 180}deg)` }}></div>
  </div>
);

const TapeLabel = ({ children, className = "", variant = "default" }: { children?: React.ReactNode, className?: string, variant?: "default" | "candy-cane" | "mistletoe" }) => {
  let bgStyles = "bg-[#f4e7c3] text-gray-800/90";
  let pattern = "";

  if (variant === "candy-cane") {
    bgStyles = "bg-[#dc2626] text-white/95 shadow-red-900/20";
    pattern = "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.2) 5px, rgba(255,255,255,0.2) 10px)";
  } else if (variant === "mistletoe") {
    bgStyles = "bg-[#15803d] text-[#fef3c7] shadow-green-900/20";
    pattern = "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px) 0 0 / 8px 8px";
  }

  return (
      <div className={`relative flex flex-col items-center ${className} pointer-events-none`}>
         <div 
            className={`relative px-3 py-1.5 shadow-[0_2px_4px_rgba(0,0,0,0.15)] transform skew-y-[-0.5deg] backdrop-blur-[1px] transition-transform duration-300 hover:scale-105 ${bgStyles}`}
            style={{ backgroundImage: pattern }}
         >
            <div className="absolute -left-[2px] top-0 bottom-0 w-[3px] border-r-[2px] border-dashed border-black/10 opacity-30"></div>
            <div className="absolute -right-[2px] top-0 bottom-0 w-[3px] border-l-[2px] border-dashed border-black/10 opacity-30"></div>
            <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/rice-paper-2.png')] mix-blend-multiply"></div>
            <div className="relative z-10 font-graffiti leading-none text-center text-sm drop-shadow-sm font-tracking-wider">
                {children}
            </div>
         </div>
      </div>
  );
};

// --- Audio Hook ---
const useAudio = (url: string, playbackRate: number = 1.0) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(url);
    audio.volume = 0.3; // Restrained volume
    audio.playbackRate = playbackRate;
    audioRef.current = audio;
  }, [url, playbackRate]);

  const play = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.warn(`Audio play failed for ${url}`, e));
    }
  }, [url]);

  return play;
};

// --- Main Component ---
const RetroCamera: React.FC = () => {
  // --- State ---
  
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [fileObj, setFileObj] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>("INITIALIZING...");
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<'pet_fashion' | 'simple_hat'>('pet_fashion');
  const [activeGeneration, setActiveGeneration] = useState<PendingGeneration | null>(null);
  
  // Onboarding
  const [onboardingStep, setOnboardingStep] = useState(1);
  
  // Interaction
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Animation
  const [leverPulled, setLeverPulled] = useState(false);
  const [ejectingPhotoUrl, setEjectingPhotoUrl] = useState<string | null>(null);
  const [isEjecting, setIsEjecting] = useState(false);

  // Gallery
  const [photos, setPhotos] = useState<DevelopedPhoto[]>([]);
  const [highestZ, setHighestZ] = useState(100);

  // Audio
  const playLever = useAudio(leverSound, 1.5);
  const playShutter = useAudio('https://raw.githubusercontent.com/BrianHepler/MMM-Selfieshot/master/shutter.mp3');
  const playClick = useAudio('https://raw.githubusercontent.com/extratone/iOSSystemSounds/main/m4a/Tock.m4a');
  const playSlide = useAudio(ejectSound);

  // Dragging
  const [dragState, setDragState] = useState<{
    id: number | null;
    startX: number;
    startY: number;
    initialPhotoX: number;
    initialPhotoY: number;
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ejectRef = useRef<HTMLDivElement>(null);
  const didRestoreStateRef = useRef(false);
  const processingControllerRef = useRef<AbortController | null>(null);
  const processingRequestInFlightRef = useRef<number | null>(null);
  const lastProcessingKickoffAtRef = useRef(0);

  // --- Onboarding Logic ---
  useEffect(() => {
    if (sourceImage && onboardingStep === 1) {
      setOnboardingStep(2);
    }
  }, [sourceImage, onboardingStep]);

  useEffect(() => {
    if (isProcessing && onboardingStep === 2) {
      setOnboardingStep(0);
    }
  }, [isProcessing, onboardingStep]);

  useEffect(() => {
    try {
      const storedPhotos = localStorage.getItem(PHOTO_STORAGE_KEY);
      if (storedPhotos) {
        const parsed = JSON.parse(storedPhotos) as DevelopedPhoto[];
        if (Array.isArray(parsed)) {
          const restoredPhotos = parsed.map((photo) => ({ ...photo, isLanding: false }));
          setPhotos(restoredPhotos);
          const maxZ = restoredPhotos.reduce((highest, photo) => Math.max(highest, photo.zIndex), 100);
          setHighestZ(maxZ);
        }
      }

      const storedPendingGeneration = localStorage.getItem(PENDING_GENERATION_STORAGE_KEY);
      if (storedPendingGeneration) {
        const parsed = JSON.parse(storedPendingGeneration) as PendingGeneration;
        if (parsed && typeof parsed.generationId === 'number') {
          setActiveGeneration(parsed);
          setMode(parsed.mode);
          setIsProcessing(true);
          setProcessingStatus('RECONNECTING TO LAB...');
        }
      }
    } catch (error) {
      console.warn('Failed to restore persisted camera state.', error);
      localStorage.removeItem(PHOTO_STORAGE_KEY);
      localStorage.removeItem(PENDING_GENERATION_STORAGE_KEY);
    } finally {
      didRestoreStateRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!didRestoreStateRef.current) return;

    try {
      localStorage.setItem(PHOTO_STORAGE_KEY, JSON.stringify(photos));
    } catch (error) {
      console.warn('Failed to persist developed photos.', error);
    }
  }, [photos]);

  useEffect(() => {
    if (!didRestoreStateRef.current) return;

    try {
      if (activeGeneration) {
        localStorage.setItem(PENDING_GENERATION_STORAGE_KEY, JSON.stringify(activeGeneration));
      } else {
        localStorage.removeItem(PENDING_GENERATION_STORAGE_KEY);
      }
    } catch (error) {
      console.warn('Failed to persist pending generation state.', error);
    }
  }, [activeGeneration]);

  // --- File Handling ---
  const processFile = (file: File) => {
    const validTypes = ['image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      alert('Please use JPG or PNG images only.');
      return;
    }
    setFileObj(file);
    const url = URL.createObjectURL(file);
    setSourceImage(url);
    setIsDragOver(false);
    setFeedbackMessage(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) processFile(e.target.files[0]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (isProcessing) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  };

  const resetCamera = () => {
    setSourceImage(null);
    setFileObj(null);
    setOnboardingStep(1);
    setFeedbackMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Core Camera Trigger Logic ---
  const triggerCamera = async () => {
    if (!fileObj || isProcessing || !sourceImage || isEjecting) return;

    // Lever Animation - Mechanical Feel
    playLever();
    
    // Delay animation start to let sound lead
    setTimeout(() => {
        setLeverPulled(true);
        
        setTimeout(() => {
            setLeverPulled(false);
        }, 300); 
    }, 0); // 0ms delay for sound lead

    setIsProcessing(true);
    setProcessingStatus("CONNECTING TO LAB...");
    setFeedbackMessage(null);

    try {
      const base64 = await fileToBase64(fileObj);
      const mimeType = getMimeType(fileObj);
      
      const result = await generateChristmasPet(base64, mimeType, mode, (text) => {
        const displayText = text.length > 80 ? "..." + text.slice(-80) : text;
        setProcessingStatus(displayText.toUpperCase());
      });
      
      if (result.success && result.generationId) {
        setActiveGeneration({
          generationId: result.generationId,
          mode,
          startedAt: Date.now()
        });
        setProcessingStatus(mode === 'pet_fashion' ? 'PORTRAIT QUEUED...' : 'HAT QUEUED...');
      } else {
        setIsProcessing(false);
        setFeedbackMessage(result.content);
      }

    } catch (error: any) {
      console.error("Generation failed", error);
      setIsProcessing(false);
      setFeedbackMessage(error.message || "Unknown error.");
    }
  };

  // --- Gallery & Animation Logic ---
  const addToGallery = useCallback((url: string) => {
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const photoWidth = Math.min(260, viewportW * 0.8);
      const photoHeight = (photoWidth * 1.33) + 60;
      
      let startX = (viewportW / 2) - (photoWidth / 2); 
      let startY = (viewportH / 2) - (photoHeight / 2); 
      
      if (ejectRef.current) {
          const rect = ejectRef.current.getBoundingClientRect();
          startX = rect.left;
          startY = rect.top;
      }

      const margin = 60;
      const maxX = viewportW - photoWidth - margin;
      const maxY = viewportH - photoHeight - margin;

      const side = Math.random() > 0.5 ? 1 : -1;
      let endX = (viewportW / 2) - (photoWidth / 2) + (side * (viewportW * 0.25 + Math.random() * 50)); 
      let endY = (viewportH / 2) + 50 + (Math.random() * 100);

      endX = Math.max(margin, Math.min(endX, maxX));
      endY = Math.max(margin, Math.min(endY, maxY));

      const photoId = Date.now();
      let nextZ = 101;
      setHighestZ(prev => {
          nextZ = prev + 1;
          return nextZ;
      });

      const newPhoto: DevelopedPhoto = {
          id: photoId,
          url,
          x: startX,
          y: startY,
          rotation: 0,
          zIndex: nextZ,
          isLanding: true, 
      };

      setPhotos(prev => [...prev, newPhoto]);

      requestAnimationFrame(() => {
          setPhotos(prev => prev.map(p => {
              if (p.id === newPhoto.id) {
                  return {
                      ...p,
                      x: endX,
                      y: endY,
                      rotation: (Math.random() * 16 - 8) 
                  }
              }
              return p;
          }));

          setTimeout(() => {
              setPhotos(prev => prev.map(p => p.id === newPhoto.id ? { ...p, isLanding: false } : p));
          }, 1200); 
      });
  }, []);

  const ejectDevelopedPhoto = useCallback((imageUrl: string) => {
    setEjectingPhotoUrl(imageUrl);
    requestAnimationFrame(() => {
      playSlide();

      setTimeout(() => {
        setIsEjecting(true);
        setIsProcessing(false);
        setTimeout(() => {
          addToGallery(imageUrl);
          setActiveGeneration(null);
          setEjectingPhotoUrl(null);
          setIsEjecting(false);
        }, 5000);
      }, 400);
    });
  }, [addToGallery, playSlide]);

  const requestGenerationProcessing = useCallback((generationId: number, force = false) => {
    const now = Date.now();
    if (!force) {
      if (processingRequestInFlightRef.current === generationId) return;
      if (now - lastProcessingKickoffAtRef.current < PROCESSING_RETRY_WINDOW_MS) return;
    }

    processingControllerRef.current?.abort();

    const controller = new AbortController();
    processingControllerRef.current = controller;
    processingRequestInFlightRef.current = generationId;
    lastProcessingKickoffAtRef.current = now;

    void startGenerationProcessing(generationId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;

        if ((result.status === 'failed' || result.status === 'error') && result.content) {
          setActiveGeneration(null);
          setIsProcessing(false);
          setFeedbackMessage(result.content);
        }
      })
      .finally(() => {
        if (processingControllerRef.current === controller) {
          processingControllerRef.current = null;
        }

        if (processingRequestInFlightRef.current === generationId) {
          processingRequestInFlightRef.current = null;
        }
      });
  }, []);

  useEffect(() => {
    if (!activeGeneration) {
      processingControllerRef.current?.abort();
      processingControllerRef.current = null;
      processingRequestInFlightRef.current = null;
      return;
    }

    requestGenerationProcessing(activeGeneration.generationId, true);

    return () => {
      processingControllerRef.current?.abort();
      processingControllerRef.current = null;
      processingRequestInFlightRef.current = null;
    };
  }, [activeGeneration?.generationId, requestGenerationProcessing]);

  useEffect(() => {
    if (!activeGeneration) return;

    let cancelled = false;
    let timeoutId: number | null = null;

    const scheduleNextPoll = (delayMs: number) => {
      timeoutId = window.setTimeout(() => {
        void pollGeneration();
      }, delayMs);
    };

    const pollGeneration = async () => {
      const result = await getGenerationStatus(activeGeneration.generationId);

      if (cancelled) return;

      if ((result.status === 'failed' || result.status === 'error') && result.content) {
        setActiveGeneration(null);
        setIsProcessing(false);
        setFeedbackMessage(result.content);
        return;
      }

      if (result.status === 'completed' && result.imageUrl) {
        setProcessingStatus('PHOTO READY...');
        ejectDevelopedPhoto(result.imageUrl);
        return;
      }

      if (!result.success && !result.status) {
        const isTransientError = /load failed|failed to fetch|network|unexpected/i.test(result.content);
        if (!isTransientError) {
          setActiveGeneration(null);
          setIsProcessing(false);
          setFeedbackMessage(result.content);
          return;
        }

        setProcessingStatus('RECONNECTING TO LAB...');
        scheduleNextPoll(4000);
        return;
      }

      const nextStatus = activeGeneration.mode === 'pet_fashion'
        ? 'CRAFTING HOLIDAY PORTRAIT...'
        : 'ATTACHING FESTIVE HAT...';

      setIsProcessing(true);
      setProcessingStatus(nextStatus);
      requestGenerationProcessing(activeGeneration.generationId);
      scheduleNextPoll(2500);
    };

    setIsProcessing(true);
    void pollGeneration();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeGeneration, ejectDevelopedPhoto, requestGenerationProcessing]);

  const deletePhoto = (id: number) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const downloadPhoto = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `retro-snap-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // --- Drag Handling ---
  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent, id: number) => {
    const photo = photos.find(p => p.id === id);
    if (!photo) return;

    setHighestZ(h => h + 1);
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, zIndex: highestZ + 1 } : p));

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    setDragState({
      id,
      startX: clientX,
      startY: clientY,
      initialPhotoX: photo.x,
      initialPhotoY: photo.y
    });
  };

  const dragStateRef = useRef(dragState);
  useEffect(() => { dragStateRef.current = dragState; }, [dragState]);

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragStateRef.current) return;
    const currentDrag = dragStateRef.current;

    const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;

    const dx = clientX - currentDrag.startX;
    const dy = clientY - currentDrag.startY;

    setPhotos(prev => prev.map(p => {
      if (p.id === currentDrag.id) {
        return {
          ...p,
          x: currentDrag.initialPhotoX + dx,
          y: currentDrag.initialPhotoY + dy
        };
      }
      return p;
    }));
  }, []);

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  useEffect(() => {
    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove, { passive: false });
      window.addEventListener('touchend', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [dragState, handleMouseMove, handleMouseUp]);

  return (
    <div className="app-viewport app-safe-x app-safe-y flex flex-col items-center justify-center overflow-hidden relative touch-none select-none bg-[#fdfbf7]">
      
      {/* Background Texture - Warm Watercolor Paper */}
      <div className="absolute inset-0 bg-[#fdfbf7]"></div>
      <div className="absolute inset-0 opacity-60 bg-[url('https://www.transparenttextures.com/patterns/watercolor.png')] mix-blend-multiply"></div>
      
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.1)_100%)] pointer-events-none"></div>

      {/* --- GALLERY --- */}
      {photos.map(photo => (
        <div
            key={photo.id}
            onMouseDown={(e) => handleMouseDown(e, photo.id)}
            onTouchStart={(e) => handleMouseDown(e, photo.id)}
            className="absolute w-[260px] max-w-[80vw] bg-[#f9f9fa] p-3 pb-3 shadow-2xl flex flex-col items-center cursor-grab active:cursor-grabbing will-change-transform transform-gpu group rounded-[2px]"
            style={{
                top: 0, 
                left: 0,
                transform: `translate3d(${photo.x}px, ${photo.y}px, 0) rotate(${photo.rotation}deg) scale(${dragState?.id === photo.id ? 1.02 : 1})`,
                zIndex: photo.zIndex,
                transition: photo.isLanding 
                    ? 'transform 1.2s cubic-bezier(0.19, 1, 0.22, 1)' 
                    : dragState?.id === photo.id ? 'none' : 'transform 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
                boxShadow: dragState?.id === photo.id 
                    ? '0 30px 60px -12px rgba(0, 0, 0, 0.25), 0 0 1px rgba(0,0,0,0.1)' 
                    : '0 8px 16px -4px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.05), inset 0 0 0 1px rgba(255,255,255,0.5)', 
            }}
        >
             {/* Paper Texture Overlay for the Photo Card */}
             <div className="absolute inset-0 opacity-[0.4] bg-[url('https://www.transparenttextures.com/patterns/natural-paper.png')] pointer-events-none mix-blend-multiply rounded-[2px]"></div>
             <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.02)] pointer-events-none rounded-[2px]"></div>

             <div className="w-full aspect-[3/4] bg-[#1a1a1a] relative overflow-hidden shadow-inner pointer-events-none mb-3 z-10 filter sepia-[0.05] contrast-[1.05]">
                <img src={photo.url} alt="Developed" className="w-full h-full object-cover" draggable={false} />
                {/* Vintage Photo Overlays */}
                <div className="absolute inset-0 bg-gradient-to-tr from-orange-50/10 via-transparent to-blue-50/5 pointer-events-none mix-blend-overlay"></div>
                <div className="absolute inset-0 opacity-[0.1] bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] pointer-events-none"></div>
                <div className="absolute inset-0 shadow-[inset_0_0_15px_rgba(0,0,0,0.3)] pointer-events-none"></div>
             </div>
             
             <div className="w-full flex items-center justify-between px-1 relative z-20">
                 <span className="font-handwriting text-neutral-400 text-[9px] font-mono select-none tracking-widest opacity-80">
                    #CHRISTMAS_{new Date(photo.id).getFullYear()}
                 </span>
                 
                 <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <IconWrapper 
                        onClick={(e) => { e.stopPropagation(); deletePhoto(photo.id); }} 
                        title="Discard"
                        colorClass="text-neutral-400 hover:text-red-600/80"
                    >
                        <TrashIcon />
                    </IconWrapper>
                    <IconWrapper 
                        onClick={(e) => { e.stopPropagation(); downloadPhoto(photo.url); }} 
                        title="Save"
                        colorClass="text-neutral-400 hover:text-emerald-600/80"
                    >
                        <DownloadIcon />
                    </IconWrapper>
                 </div>
             </div>
        </div>
      ))}

      {/* --- CAMERA ASSEMBLY --- */}
      <div className="relative transform-gpu scale-[0.65] sm:scale-[0.75] md:scale-[0.80] lg:scale-100 transition-transform duration-500 cubic-bezier(0.25, 0.1, 0.25, 1) z-10">
        
        {/* Instructions */}
        <div className={`absolute z-50 transition-all duration-500 origin-right
            top-[22%] left-[6%] lg:top-[40%] lg:left-[-140px]
            ${onboardingStep === 1 ? 'opacity-100 rotate-[-4deg] translate-x-0' : 'opacity-0 rotate-[-15deg] translate-x-8'}`}>
            <TapeLabel variant="candy-cane">1. LOAD FILM</TapeLabel>
        </div>

        <div className={`absolute z-50 transition-all duration-500 origin-left 
            top-[60%] right-[8%] lg:top-[35%] lg:right-[-120px]
            ${onboardingStep === 2 ? 'opacity-100 rotate-[5deg] translate-x-0' : 'opacity-0 rotate-[15deg] -translate-x-8'}`}>
            <TapeLabel variant="mistletoe">2. SNAP!</TapeLabel>
        </div>

        {/* Mode Description Label - Onboarding */}
        <div className={`absolute z-50 transition-all duration-500 origin-center
            bottom-[-10%] left-1/2 -translate-x-1/2 w-max
            ${onboardingStep > 0 ? 'opacity-100 rotate-[-1deg] scale-100' : 'opacity-0 scale-95 translate-y-4'}`}>
             <div className="font-graffiti text-sm text-neutral-500/80 tracking-wider drop-shadow-sm select-none">
                {mode === 'pet_fashion' ? 'Generate Pet Xmas Fashion (Takes longer)' : 'Simple Xmas Hat!'}
            </div>
        </div>

        <div className="relative w-[500px] h-[500px] flex flex-col items-center justify-center pointer-events-none">
            
            {/* EJECTING PHOTO SLOT */}
            <div 
                className="absolute -top-[300px] left-0 right-0 bottom-0 z-0 flex justify-center pointer-events-none"
                style={{ clipPath: 'inset(0 0 148px 0)' }}
            >
                {ejectingPhotoUrl && (
                    <div 
                        ref={ejectRef}
                        className={`relative w-[260px] max-w-[80vw] bg-[#f9f9fa] p-3 pb-8 shadow-2xl flex flex-col items-center will-change-transform transform-gpu
                        ${isEjecting ? 'transition-transform duration-[5000ms] ease-[cubic-bezier(0.25,1,0.5,1)]' : 'transition-none'}`}
                        style={{ 
                            top: '50%', 
                            marginTop: '50px',
                            transform: isEjecting 
                                ? 'translate3d(0, -380px, 0) rotate(-2deg)' 
                                : 'translate3d(0, 150px, 0) rotate(0deg)'
                        }}
                    >
                        <div className="absolute inset-0 opacity-[0.3] bg-[url('https://www.transparenttextures.com/patterns/natural-paper.png')] mix-blend-multiply rounded-[2px]"></div>
                        <div className="w-full aspect-[3/4] bg-[#1a1a1a] relative overflow-hidden shadow-inner z-10">
                            <img 
                                src={ejectingPhotoUrl} 
                                alt="Ejecting" 
                                className={`w-full h-full object-cover bg-black transition-all duration-[5000ms] ease-linear ${isEjecting ? 'brightness-100 grayscale-0 sepia-0' : 'brightness-[0.2] grayscale sepia-[0.5]'}`} 
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Cat Sticker Animation */}
            <div 
                className="absolute top-[30px] right-[70px] z-[18] pointer-events-none transition-all duration-700 cubic-bezier(0.34, 1.56, 0.64, 1)"
                style={{
                    transform: mode === 'pet_fashion' 
                        ? 'translate(0, -140px)' 
                        : 'translate(0, 0)',
                }}
            >
                <img src={catSticker} alt="Cat Sticker" className="w-32 h-32 object-contain drop-shadow-xl filter brightness-110" />
            </div>

            {/* --- CAMERA BODY CONTAINER --- */}
            <div 
                className="relative z-20 w-full pointer-events-auto flex justify-center perspective-[1000px]"
            >
                
                {/* LEVER MECHANISM */}
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 h-[220px] w-16 flex flex-col items-center justify-center z-10">
                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-4 bg-[#1a1a1a] rounded-full shadow-[inset_0_2px_8px_rgba(0,0,0,1),0_0_0_1px_rgba(255,255,255,0.1)]"></div>
                    <div 
                        onClick={triggerCamera}
                        className={`relative cursor-pointer transition-transform will-change-transform transform-gpu ${(!sourceImage || isProcessing || isEjecting) ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-110 active:brightness-90'}`}
                        style={{
                            transform: `translate3d(0, ${leverPulled ? '90px' : '-70px'}, 0)`,
                            transition: leverPulled 
                                ? 'transform 150ms cubic-bezier(0.05, 0.9, 0.1, 1)' 
                                : 'transform 600ms cubic-bezier(0.34, 1.56, 0.64, 1)'
                        }}
                    >
                        <div className="absolute top-1/2 right-4 h-3 w-8 bg-gradient-to-l from-[#d4d4d4] to-[#737373] shadow-[0_2px_4px_rgba(0,0,0,0.5)]"></div>
                        <div className="w-12 h-12 bg-gradient-to-br from-[#ef4444] via-[#b91c1c] to-[#7f1d1d] rounded-full border border-[#450a0a] shadow-[0_4px_6px_rgba(0,0,0,0.5),inset_0_4px_6px_rgba(255,255,255,0.4)] relative z-20 overflow-hidden">
                            <div className="absolute top-2 left-3 w-5 h-3 bg-white/40 blur-[2px] rounded-full rotate-[-45deg]"></div>
                            <div className="absolute bottom-1 right-2 w-4 h-2 bg-[#fca5a5]/30 blur-[2px] rounded-full"></div>
                        </div>
                    </div>
                </div>

                {/* SANTA HAT STICKER (Positioned to sit ON TOP of the camera, wearing it) */}
                {/* Adjusted top/left to sit on the top-left corner without overlapping the label */}
                <img 
                    src={santaHatSticker} 
                    alt="Santa Hat Sticker" 
                    className="absolute top-[-100px] left-[10px] z-[45] w-[150px] h-[150px] object-contain transform -rotate-[15deg] scale-90 origin-bottom-right drop-shadow-2xl pointer-events-none select-none" 
                />



                {/* MAIN CHASSIS */}
                <div 
                    className="relative w-[420px] bg-[#222] rounded-[32px] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.15)] flex flex-col overflow-hidden isolate"
                    style={{ WebkitMaskImage: '-webkit-radial-gradient(white, black)' }}
                >
                    
                    {/* Leather Body Texture */}
                    <div className="absolute inset-0 bg-[#1f1f1f]">
                        <div className="absolute inset-0 opacity-100 bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')] mix-blend-overlay"></div>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/80 pointer-events-none"></div>
                    </div>

                    <Screw className="absolute top-4 left-4 z-30" />
                    <Screw className="absolute top-4 right-4 z-30" />
                    <Screw className="absolute bottom-4 left-4 z-30" />
                    <Screw className="absolute bottom-4 right-4 z-30" />

                    {/* Top Plate */}
                    <div className="h-20 bg-gradient-to-b from-[#333] to-[#1a1a1a] border-b border-black relative shadow-lg flex items-center justify-between px-8 z-20">
                        {/* Brushed Metal Texture */}
                        <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(90deg,transparent,transparent_1px,#000_1px,#000_2px)] mix-blend-overlay"></div>
                        
                        {/* Viewfinder Window */}
                        <div className="flex flex-col items-center gap-1 group">
                            <div className="w-14 h-9 bg-[#0a0a0a] rounded-[2px] border border-gray-700/50 shadow-[inset_0_0_15px_rgba(0,0,0,1)] relative overflow-hidden group-hover:border-gray-500 transition-colors">
                                <div className="absolute inset-0 bg-blue-900/10 mix-blend-overlay"></div>
                                <div className="absolute top-1/2 left-1/2 w-8 h-8 bg-purple-500/10 rounded-full blur-md -translate-x-1/2 -translate-y-1/2"></div>
                                <div className="absolute top-1 right-1 w-2 h-2 bg-white/60 blur-[1px] rounded-full"></div>
                            </div>
                            <span className="text-[7px] text-[#666] font-display tracking-[0.2em] font-bold opacity-80 shadow-[0_1px_0_rgba(255,255,255,0.05)]">VIEW</span>
                        </div>

                        {/* Branding */}
                        <div className="flex flex-col items-center select-none relative">
                            <h1 className="font-display text-lg tracking-[0.15em] text-[#d4d4d4] font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">CHRISTMAS<span className="text-red-800 text-shadow-none mx-1">CAM</span></h1>
                            <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent mt-0.5"></div>
                        </div>
                        
                        {/* Counter */}
                        <div className="flex flex-col items-end">
                             <div className="w-12 h-12 bg-[#111] rounded-full border-2 border-[#333] shadow-[inset_0_2px_4px_rgba(0,0,0,1),0_1px_0_rgba(255,255,255,0.1)] flex items-center justify-center relative group-hover:border-gray-500 transition-colors">
                                <span className={`font-mono text-xs font-bold ${isProcessing ? 'text-red-500/80 animate-pulse' : 'text-[#fbbf24]/90'}`}>
                                    {isProcessing ? '...' : (photos.length > 0 ? String(photos.length).padStart(2, '0') : '00')}
                                </span>
                                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none"></div>
                                <div className="absolute inset-0 rounded-full shadow-[inset_0_0_4px_rgba(0,0,0,0.8)] pointer-events-none"></div>
                             </div>
                        </div>
                    </div>

                    {/* Mid Section */}
                    <div 
                        className="flex-1 p-6 relative flex flex-col items-center justify-center"
                        onDragOver={(e) => { e.preventDefault(); !isProcessing && setIsDragOver(true); }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={handleDrop}
                    >
                        {/* Grip Texture Sides */}
                        <div className="absolute left-0 top-20 bottom-20 w-8 bg-[#1a1a1a] border-r border-white/5 shadow-inner">
                             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                        </div>
                        <div className="absolute right-0 top-20 bottom-20 w-8 bg-[#1a1a1a] border-l border-white/5 shadow-inner">
                             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                        </div>

                        {isDragOver && !isProcessing && (
                            <div className="absolute inset-10 border-2 border-dashed border-cyan-500/50 rounded-lg z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-pulse">
                                <span className="text-cyan-500 font-display text-xl tracking-[0.3em] drop-shadow-[0_0_10px_rgba(34,211,238,0.3)]">LOAD MEDIA</span>
                            </div>
                        )}

                        {/* Viewfinder / Screen Area */}
                        <div className="relative z-10 p-5 bg-[#262626] rounded-sm shadow-[0_10px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] border-t border-white/5">
                            <Screw className="absolute top-1.5 left-1.5 w-1.5 h-1.5" />
                            <Screw className="absolute top-1.5 right-1.5 w-1.5 h-1.5" />
                            <Screw className="absolute bottom-1.5 left-1.5 w-1.5 h-1.5" />
                            <Screw className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5" />

                            <div className="relative aspect-[3/4] w-[200px] bg-[#050505] shadow-[inset_0_0_20px_rgba(0,0,0,1)] flex items-center justify-center group overflow-hidden border-[4px] border-[#1a1a1a] rounded-[2px] ring-1 ring-white/5">
                                
                                {/* Screen Glare */}
                                <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-transparent pointer-events-none z-20"></div>
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/pixel-weave.png')] opacity-[0.05] pointer-events-none z-20"></div>

                                <div 
                                    onClick={() => !isProcessing && fileInputRef.current?.click()}
                                    className="w-full h-full relative cursor-pointer hover:brightness-110 transition-all flex items-center justify-center"
                                >
                                    {sourceImage ? (
                                        <>
                                            <img src={sourceImage} alt="Viewfinder" className="w-full h-full object-contain bg-black" />
                                            {/* HUD */}
                                            <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between">
                                                <div className="flex justify-between items-start opacity-80">
                                                    <span className="text-[#00ff00] font-mono text-[9px] drop-shadow-[0_0_2px_rgba(0,255,0,0.5)]">REC ●</span>
                                                    <div className="flex gap-0.5">
                                                        <div className="w-2 h-0.5 bg-[#00ff00]"></div>
                                                        <div className="w-2 h-0.5 bg-[#00ff00]"></div>
                                                        <div className="w-2 h-0.5 bg-gray-700"></div>
                                                    </div>
                                                </div>
                                                {/* Crosshair */}
                                                <div className="absolute top-1/2 left-1/2 w-6 h-6 border border-white/30 -translate-x-1/2 -translate-y-1/2">
                                                    <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-white/20"></div>
                                                    <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-white/20"></div>
                                                </div>
                                                <div className="flex justify-between items-end opacity-60">
                                                     <span className="text-white font-mono text-[8px]">ISO400</span>
                                                     <span className="text-white font-mono text-[8px]">1/60</span>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center text-[#333] group-hover:text-[#555] transition-colors duration-300">
                                            <div className="w-10 h-10 border border-dashed border-current rounded-sm flex items-center justify-center mb-2">
                                                <span className="text-xl font-thin">+</span>
                                            </div>
                                            <span className="text-[8px] font-mono tracking-[0.15em] uppercase opacity-70">No Film</span>
                                        </div>
                                    )}
                                </div>

                                {/* Processing Overlay */}
                                {isProcessing && (
                                    <div className="absolute inset-0 bg-black/90 z-30 flex flex-col items-center justify-center p-4">
                                        <div className="w-8 h-8 border-2 border-green-500/20 border-t-green-500 rounded-full animate-spin mb-4 shadow-[0_0_15px_rgba(34,197,94,0.2)]"></div>
                                        <div className="w-full text-center overflow-hidden">
                                           <div className="font-mono text-[9px] text-green-500 leading-tight font-bold tracking-widest opacity-90 animate-pulse">
                                             {processingStatus}
                                           </div>
                                           <div className="mt-3 font-mono text-[7px] text-green-500/50 text-center leading-relaxed tracking-wider">
                                              DEVELOPING TAKES TIME...<br/>PLEASE BE PATIENT
                                           </div>
                                        </div>
                                    </div>
                                )}

                                {/* Message Overlay */}
                                {feedbackMessage && !isProcessing && (
                                    <div 
                                      onClick={() => setFeedbackMessage(null)}
                                      className="absolute inset-0 bg-black/95 z-40 flex flex-col items-start justify-start p-3 cursor-pointer overflow-y-auto"
                                    >
                                        <div className="font-mono text-[9px] text-red-500 mb-1 font-bold border-b border-red-900/50 w-full pb-1">ERR_LOG_01</div>
                                        <p className="font-mono text-[9px] text-green-400/90 leading-relaxed whitespace-pre-wrap mt-1">
                                           {feedbackMessage}
                                        </p>
                                        <div className="mt-auto w-full text-center animate-pulse text-[7px] text-gray-600 pt-2">
                                            [ TAP TO RESET ]
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* MODE SWITCH - Integrated */}
                        <div className="mt-4 flex flex-col items-center gap-1.5 z-30">
                            <div className="relative p-0.5 bg-[#111] rounded-full shadow-[inset_0_1px_3px_rgba(0,0,0,1),0_1px_0_rgba(255,255,255,0.1)] border border-white/5 flex">
                                <button
                                    onClick={() => { setMode('pet_fashion'); playClick(); }}
                                    className={`relative px-3 py-1 rounded-full text-[9px] font-bold tracking-wider transition-all duration-200 ${mode === 'pet_fashion' ? 'bg-[#d4d4d4] text-black shadow-[0_1px_2px_rgba(0,0,0,0.3)]' : 'text-[#666] hover:text-[#999]'}`}
                                >
                                    PORTRAIT
                                </button>
                                <button
                                    onClick={() => { setMode('simple_hat'); playClick(); }}
                                    className={`relative px-3 py-1 rounded-full text-[9px] font-bold tracking-wider transition-all duration-200 ${mode === 'simple_hat' ? 'bg-[#d4d4d4] text-black shadow-[0_1px_2px_rgba(0,0,0,0.3)]' : 'text-[#666] hover:text-[#999]'}`}
                                >
                                    HAT ONLY
                                </button>
                            </div>
                            <span className="text-[7px] text-[#555] font-mono tracking-[0.1em] uppercase">
                                {mode === 'pet_fashion' ? 'AI SCENE GEN' : 'AUTO STICKER'}
                            </span>
                        </div>

                         <div className="mt-5 w-full flex justify-center gap-6">
                            {sourceImage && !isProcessing && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); resetCamera(); }}
                                    className="px-4 py-1.5 bg-[#1a1a1a] border border-[#333] rounded-[2px] text-[9px] text-gray-500 font-mono hover:text-red-400 hover:border-red-900/50 shadow-lg active:translate-y-[1px] transition-all tracking-widest"
                                >
                                    EJECT FILM
                                </button>
                            )}
                         </div>

                    </div>
                </div>
                
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                    accept="image/jpeg, image/png" 
                    className="hidden" 
                />
            </div>
        </div>
      </div>
      
      {/* Signature Footer */}
      <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center z-0 opacity-50 pointer-events-none">
          <span className="font-display text-neutral-400 text-[8px] tracking-[0.3em] font-bold">
            — DAi —
          </span>
      </div>
    </div>
  );
};

export default RetroCamera;
