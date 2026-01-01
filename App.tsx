import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CameraFeed } from './components/CameraFeed';
import { Controls } from './components/Controls';
import { LandingPage } from './components/LandingPage';
import { ImageCropper } from './components/ImageCropper';
import { HistoryGallery } from './components/HistoryGallery';
import { generateSketch } from './services/geminiService';
import { saveToHistory } from './services/storageService';
import { AppState, SketchConfig, TransformState, HistoryItem } from './types';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.LANDING);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [tempCroppedImage, setTempCroppedImage] = useState<string | null>(null);
  const [sketchImage, setSketchImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showModeDialog, setShowModeDialog] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const [sketchConfig, setSketchConfig] = useState<SketchConfig>({
    opacity: 0.4,
    contrast: 100,
    brightness: 100,
    sharpness: 100,
    invert: false,
    blendMode: 'multiply',
  });
  
  const [transform, setTransform] = useState<TransformState>({ x: 0, y: 0, scale: 1, rotation: 0 });
  
  const overlayRef = useRef<HTMLImageElement>(null);
  const activePointers = useRef<Map<number, React.PointerEvent<HTMLDivElement>>>(new Map());
  const dragRef = useRef({ 
    isDragging: false, 
    startX: 0, startY: 0, 
    initialX: 0, initialY: 0, 
    initialDist: 0, initialScale: 1, 
    initialAngle: 0, initialRotation: 0 
  });
  const rafId = useRef<number | null>(null);

  /**
   * FOOLPROOF BACK BUTTON NAVIGATION
   * Prevents Android/Browser back from closing the app.
   */
  const exitToLanding = useCallback(() => {
    // AUTO-SAVE BEFORE EXITING
    if (sketchImage && tempCroppedImage) {
      saveToHistory('guest', tempCroppedImage, sketchImage);
    }
    
    setAppState(AppState.LANDING);
    setSketchImage(null);
    setTempCroppedImage(null);
    setShowExitConfirm(false);
    setIsLocked(false);
    
    // Reset browser history stack to prevent back-looping
    window.history.replaceState({ appState: AppState.LANDING }, '', '/');
  }, [sketchImage, tempCroppedImage]);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // Intercept 'back' and force return to Landing
      if (appState !== AppState.LANDING) {
        e.preventDefault();
        exitToLanding();
        // Re-push a state so the next 'back' can also be intercepted
        window.history.pushState({ appState: AppState.LANDING }, '', '/');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [appState, exitToLanding]);

  // When moving away from landing, push a state to "trap" the back button
  useEffect(() => {
    if (appState !== AppState.LANDING) {
      window.history.pushState({ state: appState }, '');
    }
  }, [appState]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleOrientation = () => {
      if (appState === AppState.TRACING) {
        setTransform(prev => ({ ...prev, x: 0, y: 0 }));
      }
    };
    window.addEventListener('orientationchange', handleOrientation);
    window.addEventListener('resize', handleOrientation);
    return () => {
      window.removeEventListener('orientationchange', handleOrientation);
      window.removeEventListener('resize', handleOrientation);
    };
  }, [appState]);

  useEffect(() => {
    if (appState === AppState.TRACING) {
        setShowGuide(true);
        const timer = setTimeout(() => setShowGuide(false), 5000);
        return () => clearTimeout(timer);
    }
  }, [appState]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setRawImage(reader.result as string);
      setAppState(AppState.CROPPING);
      setIsLocked(false);
    };
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = (base64Image: string) => {
    setRawImage(base64Image);
    setAppState(AppState.CROPPING);
    setIsLocked(false);
  };

  const handleCropConfirm = (croppedBase64: string) => {
    setTempCroppedImage(croppedBase64);
    setShowModeDialog(true);
  };

  const handleModeSelection = async (convertToSketch: boolean) => {
    setShowModeDialog(false);
    if (!tempCroppedImage) return;

    if (convertToSketch) {
        if (!isOnline) {
          setAppState(AppState.ERROR);
          setErrorMsg("AI Outline requires an internet connection. Please check your WiFi or Data.");
          return;
        }
        setAppState(AppState.PROCESSING);
        try {
          const generatedSketch = await generateSketch(tempCroppedImage, sketchConfig.sharpness);
          setSketchImage(generatedSketch);
          setAppState(AppState.TRACING);
        } catch (error: any) {
          setAppState(AppState.ERROR);
          setErrorMsg(error.message || "Failed to generate sketch. Please check your connection.");
        }
    } else {
        setSketchImage(tempCroppedImage);
        setAppState(AppState.TRACING);
    }
    setTransform({ x: 0, y: 0, scale: 1, rotation: 0 });
    setShowControls(true);
  };

  const handleSaveSketch = () => {
    if (!sketchImage || !tempCroppedImage) return;
    saveToHistory('guest', tempCroppedImage, sketchImage);
    
    const link = document.createElement('a');
    link.href = sketchImage;
    link.download = `vectorlens_${Date.now()}.png`;
    link.click();
  };

  const updateTransformVisuals = useCallback(() => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
        if (overlayRef.current) {
            overlayRef.current.style.transform = `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(${transform.rotation}deg) scale(${transform.scale})`;
        }
    });
  }, [transform]);

  useEffect(() => {
    updateTransformVisuals();
  }, [updateTransformVisuals]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (appState !== AppState.TRACING || isLocked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, e);
    
    if (activePointers.current.size === 1) {
      dragRef.current = { ...dragRef.current, isDragging: true, startX: e.clientX, startY: e.clientY, initialX: transform.x, initialY: transform.y };
    } else if (activePointers.current.size === 2) {
      const ps = Array.from(activePointers.current.values()) as React.PointerEvent<HTMLDivElement>[];
      const p1 = ps[0];
      const p2 = ps[1];
      const dx = p1.clientX - p2.clientX;
      const dy = p1.clientY - p2.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      
      dragRef.current = { 
        ...dragRef.current, 
        initialDist: dist, 
        initialScale: transform.scale, 
        initialAngle: angle, 
        initialRotation: transform.rotation 
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (appState !== AppState.TRACING || isLocked) return;
    if (activePointers.current.has(e.pointerId)) activePointers.current.set(e.pointerId, e);
    
    if (activePointers.current.size === 1 && dragRef.current.isDragging) {
      setTransform(p => ({ 
        ...p, 
        x: dragRef.current.initialX + (e.clientX - dragRef.current.startX), 
        y: dragRef.current.initialY + (e.clientY - dragRef.current.startY) 
      }));
    } else if (activePointers.current.size === 2) {
      const ps = Array.from(activePointers.current.values()) as React.PointerEvent<HTMLDivElement>[];
      const p1 = ps[0];
      const p2 = ps[1];
      const dx = p1.clientX - p2.clientX;
      const dy = p1.clientY - p2.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      
      setTransform(p => ({ 
        ...p, 
        scale: Math.max(0.1, Math.min(10, dragRef.current.initialScale * (dist / dragRef.current.initialDist))), 
        rotation: dragRef.current.initialRotation + (angle - dragRef.current.initialAngle) 
      }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size === 0) dragRef.current.isDragging = false;
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-950 select-none touch-none flex flex-col">
      
      {!isOnline && (
        <div className="absolute top-0 left-0 right-0 bg-red-600 text-white text-[10px] font-bold text-center py-1 z-[100] animate-pulse uppercase tracking-widest">
          Offline Mode • AI Sketch Unavailable
        </div>
      )}

      {appState === AppState.LANDING && (
        <LandingPage 
            onGalleryUpload={handleFileSelect} 
            onCameraClick={() => setAppState(AppState.CAPTURING)} 
            onOpenHistory={() => setAppState(AppState.GALLERY)} 
        />
      )}

      {appState === AppState.CAPTURING && (
        <CameraFeed onCapture={handleCameraCapture} onCancel={() => setAppState(AppState.LANDING)} />
      )}

      {appState === AppState.GALLERY && (
        <HistoryGallery 
            onSelect={(item) => { 
                setSketchImage(item.sketchImage); 
                setTempCroppedImage(item.originalImage); 
                setAppState(AppState.TRACING); 
                setShowControls(true);
            }} 
            onClose={() => setAppState(AppState.LANDING)} 
        />
      )}

      {appState === AppState.CROPPING && rawImage && (
        <ImageCropper imageSrc={rawImage} onConfirm={handleCropConfirm} onCancel={() => setAppState(AppState.LANDING)} />
      )}

      {showModeDialog && (
          <div className="absolute inset-0 z-[60] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-6">
              <div className="bg-slate-800 rounded-[3rem] p-8 w-full max-sm border border-white/10 shadow-2xl text-center">
                  <h3 className="text-2xl font-black text-white mb-2">Tracing Mode</h3>
                  <p className="text-slate-400 text-sm mb-8">Choose how to overlay your image</p>
                  <div className="space-y-4">
                      <button 
                        disabled={!isOnline}
                        onClick={() => handleModeSelection(true)} 
                        className={`w-full py-4 rounded-2xl font-bold text-white shadow-lg transition-all ${isOnline ? 'bg-indigo-600 shadow-indigo-500/30 active:scale-95' : 'bg-slate-700 opacity-50 cursor-not-allowed'}`}
                      >
                        {isOnline ? 'Convert to AI Outline' : 'AI Mode (Offline)'}
                      </button>
                      <button onClick={() => handleModeSelection(false)} className="w-full bg-white/10 py-4 rounded-2xl font-bold text-white border border-white/10 active:scale-95 transition-all">Use Original Photo</button>
                  </div>
              </div>
          </div>
      )}

      {showExitConfirm && (
        <div className="absolute inset-0 z-[110] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6">
            <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 w-full max-w-xs text-center shadow-2xl">
                <h4 className="text-xl font-black text-white mb-2">Save & Exit?</h4>
                <p className="text-slate-400 text-sm mb-8 leading-relaxed">Your progress will be auto-saved to "My Sketches".</p>
                <div className="flex gap-4">
                   <button onClick={() => setShowExitConfirm(false)} className="flex-1 py-4 bg-slate-800 text-white font-bold rounded-2xl border border-white/5 active:bg-slate-700">Stay</button>
                   <button onClick={exitToLanding} className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-2xl active:bg-indigo-500">Exit</button>
                </div>
            </div>
        </div>
      )}

      {(appState === AppState.TRACING || appState === AppState.PROCESSING) && (
        <div className="flex-1 relative overflow-hidden">
          <CameraFeed isFocusLocked={isLocked} />
          {appState === AppState.TRACING && sketchImage && (
            <div 
                className="absolute inset-0 z-20 overflow-hidden touch-none flex items-center justify-center pointer-events-auto" 
                onPointerDown={handlePointerDown} 
                onPointerMove={handlePointerMove} 
                onPointerUp={handlePointerUp} 
                onPointerCancel={handlePointerUp}
            >
              <img 
                ref={overlayRef}
                src={sketchImage} 
                alt="Overlay" 
                style={{ 
                    opacity: sketchConfig.opacity, 
                    mixBlendMode: sketchConfig.blendMode as any, 
                    filter: `contrast(${sketchConfig.contrast}%) brightness(${sketchConfig.brightness}%) invert(${sketchConfig.invert ? 1 : 0})`,
                    willChange: 'transform, opacity'
                }} 
                className="pointer-events-none origin-center max-w-none transform-gpu" 
              />
            </div>
          )}
          
          {showGuide && (
            <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 bg-indigo-600/90 text-white px-8 py-3 rounded-full font-black text-xs animate-bounce border border-white/20 shadow-2xl tracking-widest uppercase">
              Pinch to Resize • Drag to Move
            </div>
          )}
          
          {showControls && (
            <Controls 
                onUpload={() => {}} 
                onRetake={() => setShowExitConfirm(true)} 
                onHide={() => setShowControls(false)} 
                onToggleLock={() => setIsLocked(!isLocked)} 
                onSave={handleSaveSketch} 
                isLocked={isLocked} 
                config={sketchConfig} 
                setConfig={setSketchConfig} 
                transform={transform} 
                setTransform={setTransform} 
                isProcessing={appState === AppState.PROCESSING} 
                hasSketch={appState === AppState.TRACING} 
            />
          )}
          
          {!showControls && (
            <button onClick={() => setShowControls(true)} className="absolute bottom-10 right-10 p-6 bg-indigo-600 rounded-full text-white shadow-2xl z-50 border border-white/20 active:scale-90 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
            </button>
          )}
        </div>
      )}

      {appState === AppState.ERROR && (
        <div className="absolute inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center p-10 text-center text-white">
          <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black mb-2">Error</h2>
          <p className="mb-10 text-slate-400 text-sm leading-relaxed max-w-xs">{errorMsg}</p>
          <button onClick={exitToLanding} className="w-full max-w-xs py-4 bg-indigo-600 rounded-2xl font-bold shadow-xl shadow-indigo-900/50 active:scale-95">Go Home</button>
        </div>
      )}

    </div>
  );
};

export default App;