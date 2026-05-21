/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Highlighter, 
  Underline as UnderlineIcon, 
  Bold as BoldIcon, 
  Eraser, 
  RotateCcw,
  MonitorPlay, 
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Search,
  Book,
  Loader2,
  ExternalLink,
  Settings,
  Italic,
  Sun,
  Moon,
  Type,
  Palette,
  Tv,
  Monitor,
  ScreenShare,
  ArrowRight,
  X,
  XCircle,
  Save,
  FolderOpen,
  Circle,
  Square,
  Layout,
  Image as ImageIcon,
  Film,
  Code,
  Trash2,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Minus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

// --- GLOBAL CONSTANTS & HELPERS ---

const getIsTauri = () => !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__ || window.location.protocol === 'tauri:';

import { Verse, SlideType, Slide, ImageMarkup, AppSettings } from './types';
import { DEFAULT_PASSAGE, TRANSLATIONS, FONT_OPTIONS, BOOK_IDS, CANONICAL_BOOKS, DEFAULT_SETTINGS } from './constants';
import { formatReference, hexToRgba, fetchWithTimeout } from './utils';
import { fetchPassageData } from './api';











// --- RENDERER HELPERS ---

const SlideTransitionWrapper = ({ children, transition, slideId }: { children: React.ReactNode, transition: string, slideId: string, key?: React.Key }) => {
  const variants = {
    fade: { initial: { opacity: 0, zIndex: 1 }, animate: { opacity: 1, zIndex: 1 }, exit: { opacity: 1, zIndex: 0, transition: { duration: 0.5 } } },
    slide: { initial: { x: '100%', opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: '-100%', opacity: 0 } },
    zoom: { initial: { scale: 0.9, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 1.1, opacity: 0 } },
    none: { initial: {}, animate: {}, exit: {} }
  };
  const selected = (variants as any)[transition] || variants.fade;
  return <motion.div key={slideId} initial="initial" animate="animate" exit="exit" variants={selected} transition={{ duration: 0.5, ease: "easeInOut" }} className="absolute inset-0 flex flex-col overflow-hidden">{children}</motion.div>;
};

const VideoSlideRenderer = ({ src, isControl }: { src: string, isControl: boolean }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Use useLayoutEffect to ensure mute is applied before audio can start
  React.useLayoutEffect(() => {
    const vid = videoRef.current;
    if (vid && isControl) {
      vid.muted = true;
      vid.volume = 0;
      // Block any attempts to unmute the control screen video
      const lockSilence = () => {
        if (!vid.muted || vid.volume !== 0) {
          vid.muted = true;
          vid.volume = 0;
        }
      };
      vid.addEventListener('volumechange', lockSilence);
      return () => vid.removeEventListener('volumechange', lockSilence);
    }
  }, [isControl, src]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const channel = new BroadcastChannel('video_sync_channel');
      const vid = videoRef.current;
      if (!vid) return;

      if (isControl) {
        const onPlay = () => {
          // Re-enforce silence on play just in case
          vid.muted = true;
          vid.volume = 0;
          channel.postMessage({ type: 'video_play', time: vid.currentTime });
        };
        const onPause = () => channel.postMessage({ type: 'video_pause', time: vid.currentTime });
        const onSeek = () => channel.postMessage({ type: 'video_seek', time: vid.currentTime });
        
        vid.addEventListener('play', onPlay); 
        vid.addEventListener('pause', onPause); 
        vid.addEventListener('seeked', onSeek);

        // Periodic sync to prevent drift
        syncTimerRef.current = setInterval(() => {
          if (!vid.paused) channel.postMessage({ type: 'video_sync', time: vid.currentTime });
        }, 1000);

        return () => { 
          if (syncTimerRef.current) clearInterval(syncTimerRef.current);
          vid.removeEventListener('play', onPlay); 
          vid.removeEventListener('pause', onPause); 
          vid.removeEventListener('seeked', onSeek); 
          channel.close(); 
        };
      } else {
        channel.onmessage = (e) => {
          const msg = e.data; if (!vid) return;
          if (msg.type === 'video_play') { vid.currentTime = msg.time; vid.play().catch(console.error); }
          else if (msg.type === 'video_pause') { vid.currentTime = msg.time; vid.pause(); }
          else if (msg.type === 'video_seek') { vid.currentTime = msg.time; }
          else if (msg.type === 'video_sync') {
            if (Math.abs(vid.currentTime - msg.time) > 0.5) vid.currentTime = msg.time;
          }
        };
        return () => channel.close();
      }
    }
  }, [src, isControl]);

  return (
    <div className="flex-1 flex items-center justify-center bg-black overflow-hidden">
      {src ? (
        <video 
          ref={videoRef} 
          key={src} 
          src={src} 
          controls={isControl} 
          autoPlay={false} 
          loop 
          muted={isControl}
          playsInline
          className="max-w-full max-h-full" 
          onError={() => console.error("Video failed to load:", src)} 
        />
      ) : (
        <div className="text-slate-500 flex flex-col items-center gap-4"><Film size={48} className="opacity-20" /><p className="text-xs font-bold uppercase tracking-widest opacity-20">No Video Selected</p></div>
      )}
    </div>
  );
};

const GraphicSlideRenderer = ({ slide, isControl, isThumbnail = false }: { slide: Slide, isControl: boolean, isThumbnail?: boolean }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [localContent, setLocalContent] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  // Virtual Stage Dimensions
  const STAGE_WIDTH = 1920;
  const STAGE_HEIGHT = 1080;

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      const scaleX = width / STAGE_WIDTH;
      const scaleY = height / STAGE_HEIGHT;
      setScale(Math.min(scaleX, scaleY));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    const observer = new ResizeObserver(updateScale);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => {
      window.removeEventListener('resize', updateScale);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const loadFile = async () => {
      if (slide.type === 'graphic' && typeof slide.content === 'string' && slide.content.endsWith('.html')) {
        try { const { readTextFile } = await import('@tauri-apps/plugin-fs'); const text = await readTextFile(slide.content); setLocalContent(text); } catch (e) { console.error(e); }
      }
    };
    loadFile();
  }, [slide.content, slide.type]);

  useEffect(() => {
    if (isThumbnail || typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel('graphic_sync_channel');
    channel.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'graphic_interaction' && !isControl && iframeRef.current?.contentWindow) {
        const { action, data } = e.data; const doc = iframeRef.current.contentDocument; if (!doc) return;
        if (action === 'scroll') iframeRef.current.contentWindow.scrollTo(data.x, data.y);
        else if (action === 'input') { const el = doc.querySelector(data.selector) as any; if (el) { el.value = data.value; el.dispatchEvent(new Event('input', { bubbles: true })); } }
        else if (['pointerdown', 'pointermove', 'pointerup', 'click'].includes(action)) {
          const event = new PointerEvent(action, { clientX: data.x, clientY: data.y, button: data.button, buttons: data.buttons, pointerId: data.pointerId, pointerType: data.pointerType, bubbles: true, cancelable: true, composed: true, view: iframeRef.current.contentWindow as any });
          const target = doc.elementFromPoint(data.x, data.y) || doc; target.dispatchEvent(event);
        }
      }
    };
    const handleIframeMessage = (e: MessageEvent) => {
      if (e.data?.type === 'graphic_interaction_event') { channel.postMessage({ type: 'graphic_interaction', action: e.data.action, data: e.data.data }); }
    };
    window.addEventListener('message', handleIframeMessage);
    return () => { channel.close(); window.removeEventListener('message', handleIframeMessage); };
  }, [isControl, isThumbnail]);

  const syncScript = useMemo(() => {
    if (isThumbnail) return "";
    return `<script>(function(){const isControl=${isControl};if(isControl){const relay=(action,e)=>{window.parent.postMessage({type:'graphic_interaction_event',action,data:{x:e.clientX,y:e.clientY,button:e.button,buttons:e.buttons,pointerId:e.pointerId,pointerType:e.pointerType}},'*');};window.addEventListener('scroll',()=>{window.parent.postMessage({type:'graphic_interaction_event',action:'scroll',data:{x:window.scrollX,y:window.scrollY}},'*');},{passive:true});window.addEventListener('pointerdown',e=>relay('pointerdown',e),true);window.addEventListener('pointerup',e=>relay('pointerup',e),true);window.addEventListener('pointermove',e=>{if(e.buttons>0)relay('pointermove',e);},{passive:true,capture:true});window.addEventListener('click',e=>relay('click',e),true);window.addEventListener('input',e=>{if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'){window.parent.postMessage({type:'graphic_interaction_event',action:'input',data:{value:e.target.value,selector:getSelector(e.target)}},'*');}},true);}function getSelector(el){if(el.id)return '#'+el.id;if(el.name)return '[name=\"'+el.name+'\"]';return el.tagName;}})();</script>`;
  }, [isControl, isThumbnail]);

  const rawContent = localContent || (typeof slide.content === 'string' && !slide.content.endsWith('.html') ? slide.content : "");
  let injectedBase = "";
  if (typeof slide.content === 'string' && (slide.content.includes('/') || slide.content.includes('\\'))) {
    const dir = slide.content.replace(/[\\\/][^\\\/]+$/, '');
    injectedBase = `<base href="${convertFileSrc(dir)}/">`;
  }
  const hasBody = /<\/body>/i.test(rawContent);
  const contentWithSync = hasBody ? rawContent.replace(/<\/body>/i, `${syncScript}</body>`) : `${rawContent}${syncScript}`;
  const hasHead = /<head>/i.test(contentWithSync);
  const finalContent = hasHead ? contentWithSync.replace(/<head>/i, `<head>${injectedBase}`) : `<head>${injectedBase}</head>${contentWithSync}`;
  const srcDoc = `<!DOCTYPE html><html><head>${!hasHead ? injectedBase : ''}<style>body { margin: 0; background: black; color: white; overflow: ${isThumbnail ? 'hidden' : 'auto'}; min-height: 100vh; font-family: sans-serif; }</style></head><body>${finalContent}</body></html>`;

  return (
    <div ref={containerRef} className={`flex-1 flex items-center justify-center bg-black overflow-hidden relative ${isThumbnail ? 'pointer-events-none' : ''}`}>
      <div 
        style={{ 
          width: STAGE_WIDTH, 
          height: STAGE_HEIGHT, 
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          flexShrink: 0
        }}
        className="relative bg-black shadow-2xl"
      >
        <iframe 
          ref={iframeRef} 
          srcDoc={srcDoc} 
          style={{ width: '100%', height: '100%' }}
          className="border-none" 
          allow="autoplay; fullscreen" 
        />
      </div>
    </div>
  );
};

const ThumbnailRenderer = ({ slide, settings, activeFont }: { slide: Slide, settings: AppSettings, activeFont: any }) => {
  if (slide.type === 'scripture') return <div className="w-full h-full p-3 flex items-center justify-center bg-slate-800 text-center"><div className="text-[8px] font-black uppercase tracking-tighter text-amber-500 line-clamp-2 px-2">{slide.title}</div></div>;
  if (slide.type === 'image') { const src = slide.content.startsWith('http') ? slide.content : convertFileSrc(slide.content); return <img src={src} className="w-full h-full object-cover" />; }
  if (slide.type === 'video') return <div className="w-full h-full flex items-center justify-center bg-slate-800"><Film size={24} className="text-slate-600" /></div>;
  if (slide.type === 'graphic') return <GraphicSlideRenderer slide={slide} isControl={false} isThumbnail={true} />;
  return <div className="w-full h-full bg-slate-900" />;
};

const ImageSlideRenderer = ({ slide, isControl, activeTool, activeColor, penSize = 5, updateSlideMarkups, onMarkupUpdate, externalMarkup }: { slide: Slide, isControl: boolean, activeTool: any, activeColor: string, penSize?: number, updateSlideMarkups: (markups: ImageMarkup[]) => void, onMarkupUpdate?: (markup: ImageMarkup | null) => void, externalMarkup?: ImageMarkup | null }) => {
  const [internalMarkup, setInternalMarkup] = useState<ImageMarkup | null>(null); const svgRef = useRef<SVGSVGElement>(null);
  const currentMarkup = isControl ? internalMarkup : externalMarkup;
  const getCoords = (e: React.PointerEvent) => { if (!svgRef.current) return { x: 0, y: 0 }; const rect = svgRef.current.getBoundingClientRect(); return { x: ((e.clientX - rect.left) / rect.width) * 1000, y: ((e.clientY - rect.top) / rect.height) * 1000 }; };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!isControl || !activeTool || activeTool.type === 'eraser') return;
    const { x, y } = getCoords(e); const id = `markup-${Date.now()}`;
    let markup: ImageMarkup;
    if (activeTool.type === 'pen') markup = { type: 'path', d: `M ${x} ${y}`, color: activeColor, id, strokeWidth: penSize };
    else if (activeTool.type === 'circle') markup = { type: 'circle', cx: x, cy: y, r: 0, color: activeColor, id, strokeWidth: penSize };
    else if (activeTool.type === 'rect') markup = { type: 'rect', x, y, w: 0, h: 0, color: activeColor, id, strokeWidth: penSize };
    else if (activeTool.type === 'line') markup = { type: 'line', x1: x, y1: y, x2: x, y2: y, color: activeColor, id, strokeWidth: penSize };
    else return;
    setInternalMarkup(markup);
    onMarkupUpdate?.(markup);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => { 
    if (!isControl || !internalMarkup) return; 
    const { x, y } = getCoords(e); 
    let updated: ImageMarkup = { ...internalMarkup };
    if (updated.type === 'path') updated.d = `${updated.d} L ${x} ${y}`; 
    else if (updated.type === 'circle') updated.r = Math.sqrt(Math.pow(x - updated.cx, 2) + Math.pow(y - updated.cy, 2)); 
    else if (updated.type === 'rect') { updated.w = x - updated.x; updated.h = y - updated.y; }
    else if (updated.type === 'line') { updated.x2 = x; updated.y2 = y; }
    setInternalMarkup(updated);
    onMarkupUpdate?.(updated);
  };
  const onPointerUp = () => { if (!isControl || !internalMarkup) return; updateSlideMarkups([...(slide.imageMarkups || []), internalMarkup]); setInternalMarkup(null); onMarkupUpdate?.(null); };
  const removeMarkup = (id: string) => { if (isControl && activeTool?.type === 'eraser') updateSlideMarkups((slide.imageMarkups || []).filter(m => m.id !== id)); };
  const imagePath = typeof slide.content === 'string' ? slide.content : ''; const src = imagePath ? (imagePath.startsWith('http') ? imagePath : convertFileSrc(imagePath)) : '';
  const fillScreen = slide.fillScreen;
  return (
    <div className={`flex-1 flex items-center justify-center bg-black overflow-hidden relative select-none ${fillScreen ? '' : 'p-8'}`}>
      {src ? (
        <div className={`relative flex items-center justify-center ${fillScreen ? 'w-full h-full' : 'max-w-full max-h-full'}`}>
          <img src={src} alt={slide.title} className={`${fillScreen ? 'w-full h-full object-cover' : 'max-w-full max-h-full object-contain shadow-2xl rounded-lg'} pointer-events-none`} />
          <svg ref={svgRef} viewBox="0 0 1000 1000" preserveAspectRatio="none" className={`absolute inset-0 w-full h-full z-10 touch-none ${isControl ? 'cursor-crosshair' : ''}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
            {(slide.imageMarkups || []).map(m => (
              <React.Fragment key={m.id}>
                {m.type === 'path' && <path d={m.d} stroke={m.color} strokeWidth={m.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" onClick={() => removeMarkup(m.id)} onPointerOver={() => removeMarkup(m.id)} className={activeTool?.type === 'eraser' ? 'cursor-pointer hover:stroke-red-500/50' : ''} />}
                {m.type === 'circle' && <circle cx={m.cx} cy={m.cy} r={m.r} stroke={m.color} strokeWidth={m.strokeWidth} fill="none" onClick={() => removeMarkup(m.id)} onPointerOver={() => removeMarkup(m.id)} className={activeTool?.type === 'eraser' ? 'cursor-pointer hover:stroke-red-500/50' : ''} />}
                {m.type === 'rect' && <rect x={m.w < 0 ? m.x + m.w : m.x} y={m.h < 0 ? m.y + m.h : m.y} width={Math.abs(m.w)} height={Math.abs(m.h)} stroke={m.color} strokeWidth={m.strokeWidth} fill="none" onClick={() => removeMarkup(m.id)} onPointerOver={() => removeMarkup(m.id)} className={activeTool?.type === 'eraser' ? 'cursor-pointer hover:stroke-red-500/50' : ''} />}
                {m.type === 'line' && <line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke={m.color} strokeWidth={m.strokeWidth} strokeLinecap="round" onClick={() => removeMarkup(m.id)} onPointerOver={() => removeMarkup(m.id)} className={activeTool?.type === 'eraser' ? 'cursor-pointer hover:stroke-red-500/50' : ''} />}
              </React.Fragment>
            ))}
            {currentMarkup && (
              <>
                {currentMarkup.type === 'path' && <path d={currentMarkup.d} stroke={currentMarkup.color} strokeWidth={currentMarkup.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
                {currentMarkup.type === 'circle' && <circle cx={currentMarkup.cx} cy={currentMarkup.cy} r={currentMarkup.r} stroke={currentMarkup.color} strokeWidth={currentMarkup.strokeWidth} fill="none" />}
                {currentMarkup.type === 'rect' && <rect x={currentMarkup.w < 0 ? currentMarkup.x + currentMarkup.w : currentMarkup.x} y={currentMarkup.h < 0 ? currentMarkup.y + currentMarkup.h : currentMarkup.y} width={Math.abs(currentMarkup.w)} height={Math.abs(currentMarkup.h)} stroke={currentMarkup.color} strokeWidth={currentMarkup.strokeWidth} fill="none" />}
                {currentMarkup.type === 'line' && <line x1={currentMarkup.x1} y1={currentMarkup.y1} x2={currentMarkup.x2} y2={currentMarkup.y2} stroke={currentMarkup.color} strokeWidth={currentMarkup.strokeWidth} strokeLinecap="round" />}
              </>
            )}
          </svg>
        </div>
      ) : <div className="text-slate-500 flex flex-col items-center gap-4"><ImageIcon size={48} className="opacity-20" /><p className="text-xs font-bold uppercase tracking-widest opacity-20">No Image Selected</p></div>}
    </div>
  );
};

const SlideRenderer = ({ slide, settings, activeFont, activeVerseIndex, verses: versesProp, isControl = false, containerRef, applyActiveTool, translation: translationProp, activeTool, activeColor, updateSlideMarkups, penSize = 5, onMarkupUpdate, externalMarkup }: { slide: Slide, settings: AppSettings, activeFont: any, activeVerseIndex: number, verses?: Verse[], isControl?: boolean, containerRef?: React.RefObject<HTMLDivElement>, applyActiveTool?: () => void, translation?: string, activeTool?: any, activeColor?: string, updateSlideMarkups?: (markups: ImageMarkup[]) => void, penSize?: number, onMarkupUpdate?: (markup: ImageMarkup | null) => void, externalMarkup?: ImageMarkup | null }) => {
  if (slide.type === 'scripture') {
    const verses = versesProp || (slide.content as Verse[]); 
    const activeTranslation = translationProp || slide.translation || 'esv';
    const isRtl = activeTranslation === 'wlc'; 
    const isChroma = settings.theme === 'chroma';
    const textColor = isChroma ? '#ffffff' : (settings.theme === 'dark' ? '#f8fafc' : '#0f172a');
    const textShadow = (!isChroma && settings.textShadow) ? `${settings.shadowOffset}px ${settings.shadowOffset}px ${settings.shadowBlur}px ${settings.shadowColor}` : 'none';
    const WebkitTextStroke = (!isChroma && settings.textOutline) ? `${settings.outlineWidth}px ${settings.outlineColor}` : 'none';
    return (
      <div ref={containerRef as any} className="flex-1 overflow-y-auto no-scrollbar relative flex flex-col transition-colors duration-500" dir={isRtl ? 'rtl' : 'ltr'} style={{ backgroundColor: settings.pageColor, fontFamily: activeFont.css, color: textColor, textShadow, WebkitTextStroke, paintOrder: 'stroke fill' }} onMouseUp={isControl ? applyActiveTool : undefined}>
        <div className="h-[20vh] flex-shrink-0" />
        <div className={`mx-auto w-full transition-all duration-300 px-6 md:px-12 lg:px-16 ${settings.oneVersePerLine ? 'flex flex-col gap-12' : 'text-start tracking-wide'}`} style={{ fontSize: `${settings.textSize}px`, lineHeight: settings.textSpacing, maxWidth: `${settings.maxWidth}px`, paddingBottom: '40vh' }}>
          {verses.length > 0 ? verses.map((verse, index) => {
            const fullRef = verse.reference.split(' ').pop() || ''; const verseNumber = (index === 0 || verse.isNewChapter || verse.isNewPassage) ? fullRef : (fullRef.split(':')[1] || fullRef);
            const isActive = index >= activeVerseIndex && index < (activeVerseIndex + (settings.verseCount || 1)); const isBlurred = !isActive;
            return (
              <React.Fragment key={verse.id}>
                {settings.showTitle && verse.bookHeader && <div className={`w-full text-center py-16 md:py-24 select-none ${isChroma ? 'opacity-100 text-[#888888]' : 'opacity-40'}`}><h2 className="font-bold uppercase tracking-widest break-words" style={{ fontFamily: activeFont.css, fontSize: `${settings.titleSize || 96}px`, lineHeight: 1.1 }}>{verse.bookHeader}</h2></div>}
                {(verse.isNewPassage || verse.isNewChapter) && <div className="h-12 w-full" />}
                <div id={`ref-${index}`} className={`${settings.oneVersePerLine || verse.isNewChapter || verse.acrostic ? 'flex flex-col items-start w-full' : 'inline'}`} style={{ unicodeBidi: 'plaintext' }} data-verse-index={index}>
                  {verse.acrostic && <div className={`w-full tracking-[0.3em] uppercase italic mb-1 flex items-center gap-4 ${isChroma ? 'opacity-100 text-[#666666]' : 'opacity-30'}`} style={{ fontFamily: activeFont.css, fontSize: '0.45em' }}>{verse.acrostic}<div className="h-px flex-1 bg-current opacity-20" /></div>}
                  <div className={`${settings.oneVersePerLine || verse.isNewChapter || verse.acrostic ? 'flex gap-6 items-start w-full' : 'inline'}`}>
                    {settings.showVerseNumbers && <span className={`text-[0.6em] select-none mr-2 transition-all ${isActive ? (isChroma ? 'opacity-100' : 'opacity-40') : (isChroma ? 'opacity-100 text-[#444444]' : 'opacity-10 blur-[1px]')} ${settings.oneVersePerLine || verse.isNewChapter || verse.isNewPassage || verse.acrostic ? 'mt-3 flex-shrink-0' : 'inline-block align-top mt-1'}`} style={{ color: (isActive || !isChroma) ? settings.verseNumberColor : '#444444', fontFamily: activeFont.css }}>{verseNumber}</span>}
                    <span id={`verse-${index}`} contentEditable={isControl} suppressContentEditableWarning className="transition-all outline-none leading-relaxed" style={{ transitionDuration: `${settings.scrollSpeed}ms`, filter: (isBlurred && !isChroma) ? 'blur(2px)' : 'none', opacity: (isBlurred && !isChroma) ? 0.4 : 1, color: (isBlurred && isChroma) ? '#888888' : 'inherit', transform: isBlurred ? 'scale(0.98)' : 'scale(1)', fontWeight: isActive ? 500 : 'inherit' }} dangerouslySetInnerHTML={{ __html: (verse.html || verse.text) + (isRtl ? '' : '\u200E') }} />
                  </div>
                  {!(settings.oneVersePerLine || verse.isNewChapter || verse.acrostic) && <span className="inline"> </span>}
                </div>
              </React.Fragment>
            );
          }) : <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-20 pt-24"><Book size={120} strokeWidth={0.5} /><p className="mt-4 font-bold uppercase tracking-[0.3em]">No Scripture Loaded</p></div>}
        </div>
      </div>
    );
  }
  if (slide.type === 'image') return <ImageSlideRenderer slide={slide} isControl={isControl} activeTool={activeTool} activeColor={activeColor || '#fbbf24'} penSize={penSize} updateSlideMarkups={updateSlideMarkups || (() => {})} onMarkupUpdate={onMarkupUpdate} externalMarkup={externalMarkup} />;
  if (slide.type === 'video') { const videoPath = typeof slide.content === 'string' ? slide.content : ''; const src = videoPath ? (videoPath.startsWith('http') ? videoPath : convertFileSrc(videoPath)) : ''; return <VideoSlideRenderer src={src} isControl={isControl} />; }
  if (slide.type === 'graphic') return <GraphicSlideRenderer slide={slide} isControl={isControl} />;
  return <div className="flex-1 flex flex-col items-center justify-center text-slate-700"><Layout size={64} className="mb-4 opacity-20" /><p className="uppercase tracking-[0.4em] font-black text-xs opacity-20">{slide.type} module coming soon</p></div>;
};

// --- MAIN APP COMPONENT ---

export default function App() {
  const [appMode, setAppMode] = useState<'select' | 'control' | 'present'>(() => { if (typeof window !== 'undefined') { const params = new URLSearchParams(window.location.search); if (params.get('view') === 'presentation') return 'present'; } return 'select'; });
  const [slides, setSlides] = useState<Slide[]>(() => { try { const saved = localStorage.getItem('osb_pro_slides'); if (saved) return JSON.parse(saved); } catch (e) {} return [{ id: 'initial-slide', type: 'scripture', title: 'Genesis 1:1-5', content: DEFAULT_PASSAGE }]; });
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0); 
  const [verses, setVerses] = useState<Verse[]>([]); 
  const [activeVerseIndex, setActiveVerseIndex] = useState(0); 
  const [showSettings, setShowSettings] = useState(false); 
  const [showSlideSettings, setShowSlideSettings] = useState(false); 
  const [showSidebar, setShowSidebar] = useState(true);
  
  const [settings, setSettings] = useState<AppSettings>(() => { try { const saved = localStorage.getItem('osb_pro_settings'); return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS; } catch { return DEFAULT_SETTINGS; } });
  useEffect(() => { localStorage.setItem('osb_pro_settings', JSON.stringify(settings)); }, [settings]);
  
  const [referenceInput, setReferenceInput] = useState("Genesis 1:1-5"); 
  const [translation, setTranslation] = useState('esv'); 
  const [isLoading, setIsLoading] = useState(false); 
  const [fetchError, setFetchError] = useState<string | null>(null);

  const currentSlide = useMemo(() => slides[currentSlideIndex] || slides[0], [slides, currentSlideIndex]);

  // Update local translation and verses when current slide changes
  useEffect(() => {
    if (currentSlide.type === 'scripture') {
      const slideVerses = currentSlide.content as Verse[];
      const slideTrans = currentSlide.translation || settings.defaultTranslation || 'esv';
      setVerses(slideVerses);
      setTranslation(slideTrans);
      setReferenceInput(currentSlide.title);
      // Ensure presentation window stays in sync with current slide's unique content
      setTimeout(() => syncStateToStorage({ verses: slideVerses, translation: slideTrans, index: 0 }), 100);
    }
  }, [currentSlideIndex]); // Only trigger on slide navigation

  const [esvApiKey, setEsvApiKey] = useState(() => { const defaultKey = (import.meta as any).env?.VITE_ESV_API_KEY || ""; try { return localStorage.getItem('esvApiKey') || defaultKey; } catch { return defaultKey; } });
  const [yvApiKey] = useState("XiJCKjmkQ1e0AlAwkbMKY5nyAIb7T4Y2eAhY8KHiYnuGrqGa");
  const [activeTool, setActiveTool] = useState<{ type: string, value: string | null } | null>(null); const [activeMarkupColor, setActiveMarkupColor] = useState('#fbbf24');
  const [imageActiveTool, setImageActiveTool] = useState<{ type: string, value: string | null } | null>(null); const [imageActiveColor, setImageActiveColor] = useState('#ef4444'); const [imagePenSize, setImagePenSize] = useState(5);
  const [isPresenting, setIsPresenting] = useState(false); const [availableMonitors, setAvailableMonitors] = useState<any[]>([]); const [isTauriApp] = useState(getIsTauri()); const [showAddSlideModal, setShowAddSlideModal] = useState(false);
  const [liveMarkup, setLiveMarkup] = useState<ImageMarkup | null>(null);
  
  useEffect(() => {
    if (isTauriApp) {
      const fetchMonitors = () => invoke('list_monitors').then((m: any) => setAvailableMonitors(m as any[])).catch(console.error);
      fetchMonitors();
      const interval = setInterval(fetchMonitors, 3000);
      return () => clearInterval(interval);
    }
  }, [isTauriApp]);

  const containerRef = useRef<HTMLDivElement>(null); const scrollAnimationRef = useRef<number | null>(null);
  const activeSettings = useMemo(() => ({ ...settings, ...(currentSlide.settingsOverride || {}) }), [settings, currentSlide.settingsOverride]);
  const activeFont = useMemo(() => FONT_OPTIONS.find(f => f.id === activeSettings.fontFamily) || FONT_OPTIONS[0], [activeSettings.fontFamily]);
  const syncChannel = useMemo(() => { try { if (typeof window !== 'undefined' && 'BroadcastChannel' in window) return new BroadcastChannel('verse_sync_channel'); } catch (e) {} return { postMessage: () => {}, onmessage: null } as unknown as BroadcastChannel; }, []);
  
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const syncStateToStorage = useCallback((overrides: { index?: number; verses?: Verse[]; settings?: AppSettings; slides?: Slide[]; forceDomRead?: boolean, translation?: string, slideIndex?: number } = {}) => {
    if (appMode !== 'control') return; 
    const targetIndex = overrides.index !== undefined ? overrides.index : activeVerseIndex; 
    const targetSettings = overrides.settings || settings; 
    const targetTranslation = overrides.translation || translation; 
    const targetSlides = overrides.slides || slides; 
    const targetSlideIndex = overrides.slideIndex !== undefined ? overrides.slideIndex : currentSlideIndex;
    
    let currentVerses = overrides.verses !== undefined ? overrides.verses : verses;
    if (overrides.forceDomRead && currentSlide.type === 'scripture' && verses.length > 0) {
      const updatedVerses = verses.map((v, i) => { const el = document.getElementById(`verse-${i}`); if (!el) return v; const html = el.innerHTML.replace(/\u200E/g, ''); return v.html === html ? v : { ...v, html }; });
      const hasChanged = updatedVerses.some((v, i) => v.html !== verses[i].html); 
      if (hasChanged) { 
        currentVerses = updatedVerses; 
        setVerses(updatedVerses); 
        if (targetSlides[targetSlideIndex]) {
          targetSlides[targetSlideIndex] = { ...targetSlides[targetSlideIndex], content: updatedVerses };
        }
      }
    }
    const stateToSave = { slides: targetSlides, currentSlideIndex: targetSlideIndex, verses: currentVerses, activeIndex: targetIndex, settings: targetSettings, translation: targetTranslation, activeTool, activeMarkupColor, imageActiveTool, imageActiveColor, imagePenSize };
    try { syncChannel.postMessage(stateToSave); } catch (e) { console.error('Sync channel failed', e); } if (isTauriApp) { invoke('set_state', { state: stateToSave }).catch(e => console.error('Tauri set_state failed', e)); }
    
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      try { localStorage.setItem('osb_pro_state', JSON.stringify(stateToSave)); localStorage.setItem('osb_pro_slides', JSON.stringify(targetSlides)); localStorage.setItem('osb_pro_settings', JSON.stringify(targetSettings)); } catch (e) { console.error('LocalStorage save failed', e); }
    }, 500);
  }, [appMode, syncChannel, isTauriApp, verses, settings, translation, slides, currentSlideIndex, activeVerseIndex, activeTool, activeMarkupColor, imageActiveTool, imageActiveColor, imagePenSize, currentSlide.type]);
  
  const liveMarkupThrottleRef = useRef<boolean>(false);
  const broadcastLiveMarkup = useCallback((markup: ImageMarkup | null) => {
    if (appMode !== 'control') return;
    if (liveMarkupThrottleRef.current && markup !== null) return;
    liveMarkupThrottleRef.current = true;
    requestAnimationFrame(() => {
      try { syncChannel.postMessage({ type: 'live_markup', markup }); } catch (e) { console.error(e); }
      if (isTauriApp) { invoke('emit_event', { event: 'live-markup', payload: markup }).catch(e => console.error(e)); }
      liveMarkupThrottleRef.current = false;
    });
  }, [appMode, syncChannel, isTauriApp]);

  const updateSlideMarkups = useCallback((markups: ImageMarkup[]) => { 
    setSlides(prev => { 
      const next = [...prev]; 
      if (next[currentSlideIndex]) next[currentSlideIndex] = { ...next[currentSlideIndex], imageMarkups: markups }; 
      setTimeout(() => syncStateToStorage({ slides: next }), 50);
      return next; 
    }); 
  }, [currentSlideIndex, syncStateToStorage]);
  
  const applyActiveTool = useCallback(() => {
    if (!activeTool || currentSlide.type !== 'scripture') return; const selection = window.getSelection(); if (!selection || selection.rangeCount === 0) return;
    if (activeTool.type === 'eraser') { const range = selection.getRangeAt(0); let container: any = range.commonAncestorContainer; if (container.nodeType === 3) container = container.parentNode; const markup = container.closest('.verse-markup') || container.querySelector('.verse-markup'); if (markup) { const text = markup.textContent; markup.replaceWith(document.createTextNode(text || "")); } else document.execCommand('removeFormat'); }
    else if (!selection.isCollapsed) { if (activeTool.type === 'bold') document.execCommand('bold'); else if (activeTool.type === 'italic') document.execCommand('italic'); else if (activeTool.type === 'foreColor') document.execCommand('foreColor', false, activeTool.value || undefined); else if (activeTool.type === 'backColor') document.execCommand('backColor', false, activeTool.value || undefined); else if (activeTool.type === 'underlineColor') { const range = selection.getRangeAt(0); const span = document.createElement('span'); span.className = 'verse-markup'; span.style.textDecoration = 'underline'; span.style.textDecorationColor = activeTool.value || 'inherit'; span.style.textDecorationThickness = '2px'; span.style.textUnderlineOffset = '4px'; range.surroundContents(span); } }
    syncStateToStorage({ forceDomRead: true }); selection.removeAllRanges();
  }, [activeTool, currentSlide.type, syncStateToStorage]);
  
  const toggleTool = useCallback((type: string, value: string | null = null) => { setActiveTool(prev => (prev?.type === type && prev?.value === value) ? null : { type, value }); }, []);
  const toggleImageTool = useCallback((type: string, value: string | null = null) => { setImageActiveTool(prev => (prev?.type === type && prev?.value === value) ? null : { type, value }); }, []);
  const clearAllFormatting = useCallback(() => {
    if (currentSlide.type === 'scripture') { const resetVerses = verses.map(v => ({ ...v, html: v.text })); setVerses(resetVerses); setSlides(prev => { const next = [...prev]; if (next[currentSlideIndex]) next[currentSlideIndex].content = resetVerses; return next; }); setTimeout(() => syncStateToStorage({ verses: resetVerses, forceDomRead: false }), 50); }
    else if (currentSlide.type === 'image') updateSlideMarkups([]);
  }, [currentSlide.type, currentSlideIndex, verses, updateSlideMarkups, syncStateToStorage]);

  const fetchBiblePassage = useCallback(async (isAppend = false, overrideRef?: string, overrideTrans?: string) => {
    let refQuery = (overrideRef || referenceInput).trim(); if (!refQuery) return;
    try { 
      const lowerQuery = refQuery.toLowerCase().replace(/\./g, ''); 
      const bId = BOOK_IDS[lowerQuery];
      if (bId) { 
        const singleChapterBooks = [31, 57, 63, 64, 65]; // Obadiah, Philemon, 2 John, 3 John, Jude
        if (singleChapterBooks.includes(bId)) {
          refQuery = CANONICAL_BOOKS[bId];
        } else {
          refQuery = `${CANONICAL_BOOKS[bId]} 1`; 
        }
        setReferenceInput(refQuery); 
      } 
    } catch (e) {}
    setIsLoading(true); setFetchError(null); const activeTrans = overrideTrans || translation;
    
    try {
      const { fetchedVersesRaw, currentBookName, headerName, isBookStart } = await fetchPassageData(refQuery, activeTrans, esvApiKey, yvApiKey, verses, isAppend);
      const lastBookName = verses.length > 0 ? (verses[verses.length - 1].reference.split(' ').slice(0, -1).join(' ')) : null; let needsHeader = !isAppend || currentBookName !== lastBookName || isBookStart;
      const fetchedVerses: Verse[] = fetchedVersesRaw.map((v, i) => {
        let text = v.text; const acrosticRegex = /([(\[][A-Za-z\s]+[)\]]\s*[\u0590-\u05FF][\.:]?|[\u0590-\u05FF][\.:]?\s*[(\[][A-Za-z\s]+[)\]])/; const acrosticMatch = text.match(acrosticRegex); let acrostic = undefined; if (acrosticMatch) { acrostic = acrosticMatch[0].trim(); text = text.replace(acrosticMatch[0], '').replace(/\s+/g, ' ').trim(); }
        const getChapter = (ref: string) => { const parts = ref.split(' '); const lastPart = parts[parts.length - 1]; return lastPart.includes(':') ? lastPart.split(':')[0] : '1'; }; const currentChapter = getChapter(v.reference); const prevChapter = (i > 0 ? getChapter(fetchedVersesRaw[i-1].reference) : (isAppend && verses.length > 0 ? getChapter(verses[verses.length-1].reference) : null));
        const slideHeader = (i === 0 && needsHeader) ? headerName : undefined;
        return { ...v, text, acrostic, bookHeader: slideHeader, isNewPassage: (i === 0 && isAppend), isNewChapter: prevChapter && currentChapter !== prevChapter };
      });
      
      const finalVerses = isAppend ? [...verses, ...fetchedVerses] : fetchedVerses; setVerses(finalVerses);
      setSlides(prev => { 
        const next = [...prev]; 
        if (next[currentSlideIndex]) {
          next[currentSlideIndex] = { ...next[currentSlideIndex], content: finalVerses, title: headerName, translation: activeTrans }; 
        }
        return next; 
      });
      
      if (!isAppend) {
        setActiveVerseIndex(0);
      }
      
      setTimeout(() => syncStateToStorage({ verses: finalVerses, index: isAppend ? activeVerseIndex : 0, translation: activeTrans }), 100);
    } catch (err: any) { setFetchError(err.message); } finally { setIsLoading(false); }
  }, [referenceInput, translation, esvApiKey, verses, currentSlideIndex, syncStateToStorage, activeVerseIndex, yvApiKey]);



  const savePresentation = useCallback(async () => { try { const { save } = await import('@tauri-apps/plugin-dialog'); const { writeTextFile } = await import('@tauri-apps/plugin-fs'); const filePath = await save({ title: 'Save Presentation', filters: [{ name: 'Presentation', extensions: ['glidepres'] }] }); if (filePath) { await writeTextFile(filePath, JSON.stringify({ slides, currentSlideIndex, settings, translation, version: '2.0' }, null, 2)); } } catch (err) { console.error(err); } }, [slides, currentSlideIndex, settings, translation]);
  const loadPresentation = useCallback(async () => { try { const { open } = await import('@tauri-apps/plugin-dialog'); const { readTextFile } = await import('@tauri-apps/plugin-fs'); const selected = await open({ multiple: false, filters: [{ name: 'Presentation', extensions: ['glidepres'] }] }); if (selected && typeof selected === 'string') { const data = JSON.parse(await readTextFile(selected)); if (data.slides) { setSlides(data.slides); setCurrentSlideIndex(data.currentSlideIndex || 0); if (data.settings) setSettings(data.settings); if (data.translation) setTranslation(data.translation); setAppMode('control'); setTimeout(() => syncStateToStorage(), 200); } } } catch (err) { console.error(err); } }, [syncStateToStorage]);
  const saveStudy = useCallback(async () => { try { const { save } = await import('@tauri-apps/plugin-dialog'); const { writeTextFile } = await import('@tauri-apps/plugin-fs'); const filePath = await save({ filters: [{ name: 'Markup', extensions: ['glide'] }] }); if (filePath) await writeTextFile(filePath, JSON.stringify({ verses, settings, translation, version: '1.0' }, null, 2)); } catch (err) { console.error(err); } }, [verses, settings, translation]);
  const loadStudy = useCallback(async () => { try { const { open } = await import('@tauri-apps/plugin-dialog'); const { readTextFile } = await import('@tauri-apps/plugin-fs'); const selected = await open({ multiple: false, filters: [{ name: 'Markup', extensions: ['glide'] }] }); if (selected && typeof selected === 'string') { const data = JSON.parse(await readTextFile(selected)); if (data.verses) { const newSlide: Slide = { id: `slide-${Date.now()}`, type: 'scripture', title: data.reference || data.title || selected.split(/[\\/]/).pop()?.replace('.glide', '') || "Imported", content: data.verses }; setSlides(prev => { const next = [...prev, newSlide]; setTimeout(() => { setCurrentSlideIndex(next.length - 1); setVerses(data.verses); if (data.settings) setSettings(prevS => ({ ...prevS, ...data.settings })); if (data.translation) setTranslation(data.translation); syncStateToStorage({ verses: data.verses, settings: data.settings }); }, 100); return next; }); } } } catch (err) { console.error(err); } }, [syncStateToStorage]);
  
  const addSlide = useCallback(async (type: SlideType) => {
    let content: any = []; let title = `New ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    if (type === 'image' || type === 'video' || type === 'graphic') {
      try { const { open } = await import('@tauri-apps/plugin-dialog'); const filters = type === 'image' ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] : type === 'video' ? [{ name: 'Videos', extensions: ['mp4', 'webm', 'mov'] }] : [{ name: 'HTML Graphics', extensions: ['html', 'htm'] }]; const selected = await open({ multiple: false, filters }); if (selected && typeof selected === 'string') { content = selected; title = selected.split(/[\\/]/).pop() || `${type} Slide`; } else return; } catch (e) { console.error(e); return; }
    } else if (type === 'scripture') { title = "New Scripture"; content = DEFAULT_PASSAGE; }
    setSlides(prev => { 
      const next = [...prev, { id: `slide-${Date.now()}`, type, title, content, translation: 'esv' }]; 
      const nextIndex = next.length - 1;
      setCurrentSlideIndex(nextIndex); 
      setTimeout(() => syncStateToStorage({ slides: next, index: 0, translation: 'esv' }), 50); 
      return next; 
    }); 
    setShowAddSlideModal(false);
  }, [syncStateToStorage]);

  const removeSlide = useCallback((index: number) => { 
    if (slides.length <= 1) return; 
    setSlides(prev => { 
      const next = prev.filter((_, i) => i !== index); 
      let nextIndex = currentSlideIndex;
      if (nextIndex >= next.length) nextIndex = Math.max(0, next.length - 1);
      setCurrentSlideIndex(nextIndex); 
      setTimeout(() => syncStateToStorage({ slides: next }), 50);
      return next; 
    }); 
  }, [currentSlideIndex, slides.length, syncStateToStorage]);

  const togglePresentation = async () => { try { if (isTauriApp) { if (isPresenting) { await invoke('close_presentation_window'); setIsPresenting(false); } else { await invoke('open_presentation_window', { monitorIndex: settings.targetMonitor }); setIsPresenting(true); } } } catch (err) { console.error(err); } setTimeout(() => syncStateToStorage(), 500); };
  
  useEffect(() => {
    if (appMode === 'select' || verses.length === 0) return;
    if (scrollAnimationRef.current) cancelAnimationFrame(scrollAnimationRef.current);
    const timer = setTimeout(() => {
      const container = containerRef.current; if (!container) return;
      const firstEl = document.getElementById(`ref-${activeVerseIndex}`) as HTMLElement; if (!firstEl) return;
      const lastIdx = Math.min(activeVerseIndex + activeSettings.verseCount - 1, verses.length - 1); const lastEl = document.getElementById(`ref-${lastIdx}`) as HTMLElement || firstEl;
      
      const containerRect = container.getBoundingClientRect();
      const firstRect = firstEl.getBoundingClientRect();
      const lastRect = lastEl.getBoundingClientRect();
      
      const groupTop = firstRect.top - containerRect.top + container.scrollTop;
      const groupBottom = lastRect.bottom - containerRect.top + container.scrollTop;
      const groupHeight = groupBottom - groupTop;
      
      const chromeHeight = appMode === 'control' ? 140 : (activeSettings.showReferenceBox ? 120 : 60); 
      const visualHeight = container.clientHeight - chromeHeight;
      const visualCenter = visualHeight / 2;
      
      let targetScroll = 0;
      if (groupHeight > visualHeight * 0.8) {
        // If the group is very tall, align it near the top instead of centering
        targetScroll = Math.max(0, groupTop - visualHeight * 0.1);
      } else {
        const groupCenter = groupTop + groupHeight / 2;
        targetScroll = Math.max(0, groupCenter - visualCenter);
      }
      
      const startScroll = container.scrollTop; const distance = targetScroll - startScroll; if (Math.abs(distance) < 2) { container.scrollTop = targetScroll; return; }
      const duration = activeSettings.scrollSpeed || 400; const startTime = performance.now();
      const animateScroll = (currentTime: number) => { const elapsed = currentTime - startTime; const progress = Math.min(elapsed / duration, 1); const easedProgress = 1 - Math.pow(1 - progress, 3); container.scrollTop = startScroll + distance * easedProgress; if (progress < 1) scrollAnimationRef.current = requestAnimationFrame(animateScroll); else scrollAnimationRef.current = null; };
      scrollAnimationRef.current = requestAnimationFrame(animateScroll);
    }, 100);
    return () => { clearTimeout(timer); if (scrollAnimationRef.current) cancelAnimationFrame(scrollAnimationRef.current); };
  }, [activeVerseIndex, activeSettings.scrollSpeed, activeSettings.verseCount, verses, appMode, activeSettings.maxWidth, activeSettings.oneVersePerLine, activeSettings.showVerseNumbers, activeSettings.textSpacing, activeSettings.textSize]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (appMode !== 'control') return; if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { 
        if (currentSlide.type === 'scripture') {
          setActiveVerseIndex(prev => { 
            const next = Math.min(prev + settings.verseCount, verses.length - 1); 
            syncStateToStorage({ index: next }); 
            return next; 
          }); 
        } else { 
          setCurrentSlideIndex(prev => {
            const next = Math.min(prev + 1, slides.length - 1);
            syncStateToStorage({ slideIndex: next });
            return next;
          });
        } 
      }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { 
        if (currentSlide.type === 'scripture') {
          setActiveVerseIndex(prev => { 
            const next = Math.max(0, prev - settings.verseCount); 
            syncStateToStorage({ index: next }); 
            return next; 
          }); 
        } else { 
          setCurrentSlideIndex(prev => {
            const next = Math.max(0, prev - 1);
            syncStateToStorage({ slideIndex: next });
            return next;
          });
        } 
      }
      else if (e.key === 'PageDown') { 
        setCurrentSlideIndex(prev => {
          const next = Math.min(prev + 1, slides.length - 1);
          setTimeout(() => syncStateToStorage(), 50);
          return next;
        });
      }
      else if (e.key === 'PageUp') { 
        setCurrentSlideIndex(prev => {
          const next = Math.max(0, prev - 1);
          setTimeout(() => syncStateToStorage(), 50);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appMode, currentSlide.type, verses.length, slides.length, syncStateToStorage, settings.verseCount]);

  
  useEffect(() => {
    if (appMode !== 'present') return;
    let unlisten: UnlistenFn | null = null;
    let unlistenMarkup: UnlistenFn | null = null;
    const setupListeners = async () => {
      if (isTauriApp) { 
        unlisten = await listen('state-changed', (event: any) => { const state = event.payload; if (state.slides) setSlides(state.slides); if (state.currentSlideIndex !== undefined) setCurrentSlideIndex(state.currentSlideIndex); if (state.verses) setVerses(state.verses); if (state.settings) setSettings(state.settings); if (state.activeIndex !== undefined) setActiveVerseIndex(state.activeIndex); if (state.activeTool) setActiveTool(state.activeTool); if (state.activeMarkupColor) setActiveMarkupColor(state.activeMarkupColor); if (state.imageActiveTool) setImageActiveTool(state.imageActiveTool); if (state.imageActiveColor) setImageActiveColor(state.imageActiveColor); if (state.imagePenSize) setImagePenSize(state.imagePenSize); });
        unlistenMarkup = await listen('live-markup', (event: any) => { setLiveMarkup(event.payload); });
        try { const initialState = await invoke('get_state'); if (initialState && (initialState as any).slides) { const state = initialState as any; setSlides(state.slides); setCurrentSlideIndex(state.currentSlideIndex); setVerses(state.verses); setSettings(state.settings); setActiveVerseIndex(state.activeIndex); if (state.activeTool) setActiveTool(state.activeTool); if (state.activeMarkupColor) setActiveMarkupColor(state.activeMarkupColor); if (state.imageActiveTool) setImageActiveTool(state.imageActiveTool); if (state.imageActiveColor) setImageActiveColor(state.imageActiveColor); if (state.imagePenSize) setImagePenSize(state.imagePenSize); } } catch (e) {} }
      syncChannel.onmessage = (event) => { const data = event.data; if (data.type === 'live_markup') { setLiveMarkup(data.markup); } else { const state = data; if (state.slides) setSlides(state.slides); if (state.currentSlideIndex !== undefined) setCurrentSlideIndex(state.currentSlideIndex); if (state.verses) setVerses(state.verses); if (state.settings) setSettings(state.settings); if (state.activeIndex !== undefined) setActiveVerseIndex(state.activeIndex); if (state.activeTool) setActiveTool(state.activeTool); if (state.activeMarkupColor) setActiveMarkupColor(state.activeMarkupColor); if (state.imageActiveTool) setImageActiveTool(state.imageActiveTool); if (state.imageActiveColor) setImageActiveColor(state.imageActiveColor); if (state.imagePenSize) setImagePenSize(state.imagePenSize); } };
    };
    setupListeners(); return () => { if (unlisten) unlisten(); if (unlistenMarkup) unlistenMarkup(); };
  }, [appMode, isTauriApp, syncChannel]);
  
  const checkForUpdates = async (manual: boolean) => { try { const { check } = await import('@tauri-apps/plugin-updater'); const { ask, message } = await import('@tauri-apps/plugin-dialog'); const { relaunch } = await import('@tauri-apps/plugin-process'); const { getVersion } = await import('@tauri-apps/api/app'); const currentVersion = await getVersion(); const update = await check(); if (update) { const yes = await ask(`New version available (${update.version}).`, { title: 'Update' }); if (yes) { await update.downloadAndInstall(); await relaunch(); } } else if (manual) await message(`Up to date.`, { title: 'No Update' }); } catch (e) {} };
  
  const { uiTheme } = settings; const uiBg = uiTheme === 'dark' ? 'bg-slate-900' : 'bg-white'; const uiBorder = uiTheme === 'dark' ? 'border-slate-700' : 'border-slate-200'; const uiText = uiTheme === 'dark' ? 'text-white' : 'text-slate-900'; const uiTextMuted = uiTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'; const uiBtnHover = uiTheme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-200';

  if (appMode === 'present') {
    const activeVerses = (verses || []).filter((_, i) => i >= activeVerseIndex && i < (activeVerseIndex + (activeSettings.verseCount || 1))); let displayRef = currentSlide.title;
    if (activeVerses.length > 0) { const firstRef = activeVerses[0].reference, lastRef = activeVerses[activeVerses.length - 1].reference; const firstParts = firstRef.split(' '), lastParts = lastRef.split(' '); const book = firstParts.slice(0, -1).join(' '), firstV = firstParts[firstParts.length - 1], lastV = lastParts[lastParts.length - 1]; if (firstRef === lastRef) displayRef = firstRef; else if (book === lastParts.slice(0, -1).join(' ')) { const [fCh, fVs] = firstV.split(':'), [lCh, lVs] = lastV.split(':'); displayRef = (fCh === lCh) ? `${book} ${fCh}:${fVs}-${lVs}` : `${book} ${firstV}-${lastV}`; } else displayRef = `${firstRef} - ${lastRef}`; }

    // Logic for Exit Button visibility
    const [showExit, setShowExit] = React.useState(false);
    const exitTimerRef = React.useRef<NodeJS.Timeout | null>(null);
    const onMouseMove = () => {
      setShowExit(true);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      exitTimerRef.current = setTimeout(() => setShowExit(false), 3000);
    };

    return ( 
      <div className="h-screen w-screen overflow-hidden bg-black flex flex-col relative" onMouseMove={onMouseMove}>
        <AnimatePresence mode="wait"><SlideTransitionWrapper key={currentSlide.id} transition={activeSettings.slideTransition} slideId={currentSlide.id}><SlideRenderer slide={currentSlide} settings={activeSettings} activeFont={activeFont} activeVerseIndex={activeVerseIndex} verses={verses} translation={translation} containerRef={containerRef} activeTool={currentSlide.type === 'scripture' ? activeTool : imageActiveTool} activeColor={currentSlide.type === 'scripture' ? activeMarkupColor : imageActiveColor} updateSlideMarkups={updateSlideMarkups} penSize={imagePenSize} externalMarkup={liveMarkup} /></SlideTransitionWrapper></AnimatePresence>
        {activeSettings.showReferenceBox && currentSlide.type === 'scripture' && ( <div className="fixed bottom-12 left-1/2 -translate-x-1/2 px-8 py-4 rounded-2xl shadow-2xl border border-white/10 backdrop-blur-3xl z-[1000]" style={{ backgroundColor: activeSettings.referenceBoxColor }}><p className="text-white font-black uppercase tracking-tighter text-2xl">{displayRef}</p></div> )}
        
        <AnimatePresence>
          {showExit && (
            <motion.button 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              onClick={() => { if (isTauriApp) invoke('close_presentation_window'); else window.close(); }}
              className="fixed top-4 right-4 z-[2000] p-3 bg-slate-900/40 hover:bg-red-500/60 backdrop-blur-md text-white rounded-xl border border-white/10 transition-all flex items-center gap-2 group"
            >
              <X size={18} className="group-hover:rotate-90 transition-transform duration-300" />
              <span className="text-[10px] font-bold uppercase tracking-widest">EXIT PRESENTATION</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div> 
    );
  }

  if (appMode === 'select') { return ( <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 font-sans"><div className="max-w-4xl w-full flex flex-col items-center"><div className="text-center mb-16"><h1 className="text-7xl font-black italic uppercase tracking-tighter mb-4">ScriptureGlide <span className="text-amber-500">Pro</span></h1><p className="text-slate-400 tracking-[0.5em] text-xs uppercase">Advanced Multimedia Presentation System</p></div><div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full"><button onClick={() => { setSlides([{ id: 'initial-slide', type: 'scripture', title: 'New Presentation', content: DEFAULT_PASSAGE }]); setCurrentSlideIndex(0); setAppMode('control'); }} className="group relative overflow-hidden bg-slate-900 border border-slate-800 p-12 rounded-[40px] hover:border-amber-500 transition-all text-left"><div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity"><Plus size={120} strokeWidth={1} /></div><Plus size={48} className="mb-6 text-amber-500 group-hover:scale-110 transition-transform" /><h2 className="text-3xl font-black uppercase italic tracking-tighter mb-2">CREATE NEW</h2><p className="text-sm text-slate-400 leading-relaxed max-w-[240px]">Start a fresh deck with scripture, images, videos, and graphics.</p></button><button onClick={loadPresentation} className="group relative overflow-hidden bg-slate-900 border border-slate-800 p-12 rounded-[40px] hover:border-blue-500 transition-all text-left"><div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity"><FolderOpen size={120} strokeWidth={1} /></div><FolderOpen size={48} className="mb-6 text-blue-500 group-hover:scale-110 transition-transform" /><h2 className="text-3xl font-black uppercase italic tracking-tighter mb-2">LOAD PRESENTATION</h2><p className="text-sm text-slate-400 leading-relaxed max-w-[240px]">Open a saved <span className="font-mono text-[10px] bg-blue-500/20 px-1 rounded text-blue-400">.glidepres</span> file and resume your session.</p></button></div></div></div> ); }

  return (
    <div className={`h-screen flex flex-col transition-colors duration-500 overflow-hidden ${uiBg} ${uiText}`}>
      <header className={`h-16 border-b ${uiBorder} flex items-center px-4 justify-between flex-shrink-0 z-50 shadow-md ${uiBg}`}>
        <div className="flex items-center gap-4"><button onClick={() => setShowSidebar(!showSidebar)} className={`p-2 ${uiBtnHover} rounded-lg ${uiTheme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>{showSidebar ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}</button><h1 className={`font-black italic uppercase tracking-tighter text-xl ${uiTheme === 'light' ? 'text-slate-900' : 'text-white'}`}>ScriptureGlide <span className="text-amber-500">Pro</span></h1></div>
        <div className="flex items-center gap-2">
          <div className={`flex ${uiTheme === 'light' ? 'bg-slate-200' : 'bg-blue-900/20'} p-1 rounded-lg border ${uiTheme === 'light' ? 'border-slate-300' : 'border-blue-500/30'}`} title="Presentation Deck (.glidepres)"><button onClick={savePresentation} className={`p-2 ${uiBtnHover} rounded-md text-blue-400 hover:text-white`} title="SAVE PRESENTATION"><Save size={18} /></button><button onClick={loadPresentation} className={`p-2 ${uiBtnHover} rounded-md text-blue-400 hover:text-white`} title="LOAD PRESENTATION"><FolderOpen size={18} /></button></div>
          <div className={`w-px h-4 ${uiTheme === 'light' ? 'bg-slate-300' : 'bg-slate-700'} mx-1 self-center`} />
          <div className={`flex ${uiTheme === 'light' ? 'bg-slate-200' : 'bg-slate-800/50'} p-1 rounded-lg border ${uiBorder}`}><button onClick={() => addSlide('scripture')} className={`p-2 ${uiBtnHover} rounded-md ${uiTextMuted} hover:text-amber-500`} title="ADD SCRIPTURE SLIDE"><Book size={18} /></button><button onClick={() => addSlide('image')} className={`p-2 ${uiBtnHover} rounded-md ${uiTextMuted} hover:text-blue-500`} title="ADD IMAGE SLIDE"><ImageIcon size={18} /></button><button onClick={() => addSlide('video')} className={`p-2 ${uiBtnHover} rounded-md ${uiTextMuted} hover:text-purple-500`} title="ADD VIDEO SLIDE"><Film size={18} /></button><button onClick={() => addSlide('graphic')} className={`p-2 ${uiBtnHover} rounded-md ${uiTextMuted} hover:text-emerald-500`} title="ADD GRAPHIC SLIDE"><Code size={18} /></button><div className={`w-px h-4 ${uiTheme === 'light' ? 'bg-slate-300' : 'bg-slate-700'} mx-1 self-center`} /><button onClick={saveStudy} className={`p-2 ${uiBtnHover} rounded-md ${uiTextMuted} hover:text-amber-600`} title="SAVE SCRIPTURE MARKUP"><Save size={18} /></button><button onClick={loadStudy} className={`p-2 ${uiBtnHover} rounded-md ${uiTextMuted} hover:text-blue-600`} title="LOAD SCRIPTURE MARKUP"><FolderOpen size={18} /></button></div>
          <div className={`w-px h-6 ${uiTheme === 'light' ? 'bg-slate-300' : 'bg-slate-700'} mx-2`} /><button onClick={togglePresentation} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition-all ${isPresenting ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'}`}><Tv size={16} /> {isPresenting ? 'STOP' : 'PRESENT'}</button>
          <button onClick={() => setShowSettings(!showSettings)} className={`p-2 ${uiBtnHover} rounded-lg ${uiTextMuted}`}><Settings size={20} /></button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <AnimatePresence>{showSidebar && ( <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 260, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className={`h-full border-r ${uiBorder} flex flex-col flex-shrink-0 ${uiTheme === 'light' ? 'bg-slate-50' : 'bg-slate-900'}`}><div className="p-4 flex justify-between items-center border-b border-white/5"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">SLIDE DECK</span><span className="text-[10px] font-mono text-slate-600">{slides.length} slides</span></div><div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar">{slides.map((slide, index) => ( <div key={slide.id} onClick={() => { setCurrentSlideIndex(index); syncStateToStorage({ slideIndex: index }); }} className={`group relative aspect-video rounded-xl border-2 transition-all cursor-pointer overflow-hidden ${currentSlideIndex === index ? 'border-amber-500 ring-4 ring-amber-500/20' : uiTheme === 'light' ? 'border-slate-200 hover:border-slate-400' : 'border-slate-800 hover:border-slate-600'}`}><ThumbnailRenderer slide={slide} settings={settings} activeFont={activeFont} /><div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent"><p className="text-[10px] font-bold truncate text-white uppercase">{slide.title}</p></div><button onClick={(e) => { e.stopPropagation(); removeSlide(index); }} className="absolute top-1 right-1 p-1 bg-red-500/80 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button><div className="absolute top-1 left-1 w-5 h-5 rounded bg-black/50 text-[10px] flex items-center justify-center font-bold text-white/50">{index + 1}</div></div> ))}<button onClick={() => setShowAddSlideModal(true)} className={`w-full py-4 border-2 border-dashed ${uiTheme === 'light' ? 'border-slate-300 text-slate-400 hover:border-amber-500 hover:text-amber-600' : 'border-slate-800 text-slate-600 hover:border-amber-500 hover:text-amber-500'} rounded-xl flex flex-col items-center justify-center transition-all gap-2`}><Plus size={20} /><span className="text-[10px] font-bold uppercase tracking-widest">NEW SLIDE</span></button></div></motion.aside> )}</AnimatePresence>
        
        <main className={`flex-1 flex flex-col relative ${uiTheme === 'light' ? 'bg-slate-200' : 'bg-black/20'}`}>
          <AnimatePresence>{showAddSlideModal && ( <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddSlideModal(false)} className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" /><motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl relative max-w-lg w-full"><h2 className="text-2xl font-black uppercase italic tracking-tighter mb-6 text-white text-center">ADD NEW SLIDE</h2><div className="grid grid-cols-2 gap-4"><button onClick={() => addSlide('scripture')} className="flex flex-col items-center gap-3 p-6 bg-slate-800 hover:bg-amber-600/20 border border-slate-700 hover:border-amber-500 rounded-2xl transition-all group"><Book size={32} className="text-amber-500 group-hover:scale-110 transition-transform" /><span className="text-xs font-bold uppercase tracking-widest text-slate-300 group-hover:text-white">SCRIPTURE</span></button><button onClick={() => addSlide('image')} className="flex flex-col items-center gap-3 p-6 bg-slate-800 hover:bg-blue-600/20 border border-slate-700 hover:border-blue-500 rounded-2xl transition-all group"><ImageIcon size={32} className="text-blue-500 group-hover:scale-110 transition-transform" /><span className="text-xs font-bold uppercase tracking-widest text-slate-300 group-hover:text-white">IMAGE FILE</span></button><button onClick={() => addSlide('video')} className="flex flex-col items-center gap-3 p-6 bg-slate-800 hover:bg-purple-600/20 border border-slate-700 hover:border-purple-500 rounded-2xl transition-all group"><Film size={32} className="text-purple-500 group-hover:scale-110 transition-transform" /><span className="text-xs font-bold uppercase tracking-widest text-slate-300 group-hover:text-white">VIDEO FILE</span></button><button onClick={() => addSlide('graphic')} className="flex flex-col items-center gap-3 p-6 bg-slate-800 hover:bg-emerald-600/20 border border-slate-700 hover:border-emerald-500 rounded-2xl transition-all group"><Code size={32} className="text-emerald-500 group-hover:scale-110 transition-transform" /><span className="text-xs font-bold uppercase tracking-widest text-slate-300 group-hover:text-white">HTML GRAPHIC</span></button></div><button onClick={() => setShowAddSlideModal(false)} className="mt-6 w-full py-3 text-slate-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">CANCEL</button></motion.div></div> )}</AnimatePresence>
          
          <div className="flex flex-col z-10">
            <div className={`p-4 border-b ${uiBorder} flex items-center gap-4 ${uiTheme === 'light' ? 'bg-white' : 'bg-slate-900'}`}>
              <div className="flex flex-col w-64 shrink-0"><label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1 px-1">SLIDE TITLE</label><input type="text" value={currentSlide.title} onChange={(e) => { const val = e.target.value; setSlides(prev => { const next = [...prev]; next[currentSlideIndex].title = val; return next; }); }} className={`h-9 ${uiTheme === 'light' ? 'bg-slate-100 border-slate-200 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'} border rounded-lg px-3 text-xs font-bold outline-none focus:border-amber-500`} /></div>
              
              {currentSlide.type === 'scripture' && ( <>
                  <div className={`w-px h-8 ${uiTheme === 'light' ? 'bg-slate-200' : 'bg-slate-700'} mx-1`} />
                  <div className="flex-1 flex flex-col"><label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-1 px-1 flex justify-between items-center"><span>BIBLE REFERENCE & VERSION</span>{fetchError && <span className="text-red-500 normal-case bg-red-500/10 px-2 py-0.5 rounded flex items-center gap-1"><XCircle size={10} /> {fetchError}</span>}</label>
                    <div className="flex gap-2">
                      <select 
                        value={translation} 
                        onChange={(e) => { const val = e.target.value; setTranslation(val); fetchBiblePassage(false, referenceInput, val); }} 
                        className={`flex-1 h-10 ${uiTheme === 'light' ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-800 border-slate-700 text-white'} border rounded-lg px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500 shadow-sm transition-all`}
                      >
                        {TRANSLATIONS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <input type="text" value={referenceInput} onChange={(e) => setReferenceInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchBiblePassage()} placeholder="Enter Bible Reference..." className={`flex-1 h-10 ${uiTheme === 'light' ? 'bg-slate-100 border-slate-200 text-slate-900' : 'bg-slate-800 border-slate-700 text-white'} border rounded-lg px-4 text-sm outline-none focus:ring-2 focus:ring-amber-500 shadow-sm transition-all`} />
                      <button onClick={() => fetchBiblePassage()} className="h-10 px-6 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-amber-600/20 transition-all active:scale-95 flex-shrink-0">
                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} 
                        <span>FETCH</span>
                      </button>
                    </div>
                  </div>
                  <div className={`w-px h-8 ${uiTheme === 'light' ? 'bg-slate-200' : 'bg-slate-700'} mx-1 self-end mb-1`} /><button onClick={() => setShowSlideSettings(!showSlideSettings)} className={`p-2 rounded-lg transition-all self-end mb-0.5 ${showSlideSettings ? 'bg-slate-700 text-white shadow-lg' : uiTheme === 'light' ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`} title="SLIDE SETTINGS"><SlidersHorizontal size={20} /></button>
                </> )}
              
              {currentSlide.type === 'image' && ( <>
                  <div className={`w-px h-8 ${uiTheme === 'light' ? 'bg-slate-200' : 'bg-slate-700'} mx-1`} />
                  <div className="flex items-center gap-2 self-end mb-0.5">
                    <div className={`flex gap-1 ${uiTheme === 'light' ? 'bg-slate-100' : 'bg-slate-800'} p-1 rounded-xl`}>
                      <button onClick={() => toggleImageTool('pen')} className={`p-2 rounded-lg ${imageActiveTool?.type === 'pen' ? 'bg-blue-500 text-white' : `${uiTextMuted} hover:bg-slate-200`}`} title="PEN"><Pencil size={18} /></button>
                      <button onClick={() => toggleImageTool('line')} className={`p-2 rounded-lg ${imageActiveTool?.type === 'line' ? 'bg-blue-500 text-white' : `${uiTextMuted} hover:bg-slate-200`}`} title="LINE TOOL"><Minus size={18} /></button>
                      <button onClick={() => toggleImageTool('circle')} className={`p-2 rounded-lg ${imageActiveTool?.type === 'circle' ? 'bg-blue-500 text-white' : `${uiTextMuted} hover:bg-slate-200`}`} title="CIRCLE"><Circle size={18} /></button>
                      <button onClick={() => toggleImageTool('rect')} className={`p-2 rounded-lg ${imageActiveTool?.type === 'rect' ? 'bg-blue-500 text-white' : `${uiTextMuted} hover:bg-slate-200`}`} title="RECTANGLE"><Square size={18} /></button>
                      <button onClick={() => toggleImageTool('eraser')} className={`p-2 rounded-lg ${imageActiveTool?.type === 'eraser' ? 'bg-blue-500 text-white' : `${uiTextMuted} hover:bg-slate-200`}`} title="ERASER"><Eraser size={18} /></button>
                    </div>
                    <div className={`w-px h-6 ${uiTheme === 'light' ? 'bg-slate-200' : 'bg-slate-700'} mx-1`} />
                    <div className="flex flex-col items-center px-2">
                      <label className="text-[7px] font-bold text-slate-500 uppercase mb-0.5">SIZE</label>
                      <input type="range" min="1" max="20" value={imagePenSize} onChange={(e) => setImagePenSize(parseInt(e.target.value))} className={`w-20 h-1 ${uiTheme === 'light' ? 'bg-slate-200' : 'bg-slate-700'} rounded-lg appearance-none cursor-pointer accent-blue-500`} />
                    </div>
                    <div className={`w-px h-6 ${uiTheme === 'light' ? 'bg-slate-200' : 'bg-slate-700'} mx-1`} />
                    <div className="flex gap-1.5 px-1 items-center">
                      {['#ef4444', '#10b981', '#3b82f6', '#ffffff'].map(c => (<button key={c} onClick={() => setImageActiveColor(c)} className={`w-5 h-5 rounded-full border-2 ${imageActiveColor === c ? 'border-blue-500' : 'border-transparent'}`} style={{ backgroundColor: c }} />))}
                      <div className={`w-px h-4 ${uiTheme === 'light' ? 'bg-slate-200' : 'bg-slate-700'} mx-1`} />
                      <div className="relative w-7 h-7 flex items-center justify-center">
                        <Palette size={18} className={imageActiveColor ? 'text-blue-500' : uiTextMuted} />
                        <input type="color" value={imageActiveColor} onChange={(e) => setImageActiveColor(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      </div>
                    </div>
                    <div className={`w-px h-6 ${uiTheme === 'light' ? 'bg-slate-200' : 'bg-slate-700'} mx-1`} />
                    <button onClick={() => {
                      const val = !currentSlide.fillScreen;
                      setSlides(prev => {
                        const nextSlides = [...prev];
                        if (nextSlides[currentSlideIndex]) nextSlides[currentSlideIndex] = { ...nextSlides[currentSlideIndex], fillScreen: val };
                        syncStateToStorage({ slides: nextSlides });
                        return nextSlides;
                      });
                    }} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all ${currentSlide.fillScreen ? 'bg-amber-500/10 border-amber-500 text-amber-500' : (uiTheme === 'light' ? 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white')}`} title="FILL SCREEN">
                      <ScreenShare size={14} />
                      <span>FILL SCREEN</span>
                    </button>
                    <div className={`w-px h-6 ${uiTheme === 'light' ? 'bg-slate-200' : 'bg-slate-700'} mx-1`} />
                    <button onClick={clearAllFormatting} className={`p-2 ${uiTextMuted} hover:text-red-500 transition-colors`} title="CLEAR ALL MARKUPS"><RotateCcw size={18} /></button>
                  </div>
                </> )}
            </div>

            {currentSlide.type === 'scripture' && ( <AnimatePresence>{showSlideSettings && ( <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className={`${uiTheme === 'light' ? 'bg-white shadow-xl border-b border-slate-200' : 'bg-slate-800 border-b border-white/5'} overflow-y-auto max-h-[60vh] no-scrollbar`}><div className="p-6 flex flex-col gap-6"><div className="flex justify-between items-center"><h4 className="text-xs font-bold uppercase tracking-widest text-amber-500">SCRIPTURE SLIDE SETTINGS</h4><button onClick={() => { setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = {}; return next; }); syncStateToStorage(); }} className={`text-[9px] font-bold uppercase tracking-widest ${uiTheme === 'light' ? 'text-slate-400 hover:text-slate-900' : 'text-slate-400 hover:text-white'} transition-colors`}>RESET TO DEFAULTS</button></div><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div className="space-y-4"><h5 className={`text-[10px] font-bold uppercase tracking-widest ${uiTheme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>TEXT APPEARANCE</h5><div><div className={`flex justify-between text-[9px] font-bold uppercase tracking-widest mb-2 ${uiTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}><span>TEXT SIZE</span><span>{activeSettings.textSize}px</span></div><input type="range" min="20" max="100" value={activeSettings.textSize} onChange={(e) => { const val = parseInt(e.target.value); setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = { ...next[currentSlideIndex].settingsOverride, textSize: val }; return next; }); syncStateToStorage(); }} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-600" /></div><div><div className={`flex justify-between text-[9px] font-bold uppercase tracking-widest mb-2 ${uiTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}><span>TITLE SIZE</span><span>{activeSettings.titleSize || 96}px</span></div><input type="range" min="20" max="200" value={activeSettings.titleSize || 96} onChange={(e) => { const val = parseInt(e.target.value); setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = { ...next[currentSlideIndex].settingsOverride, titleSize: val }; return next; }); syncStateToStorage(); }} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-600" /></div><div><div className={`flex justify-between text-[9px] font-bold uppercase tracking-widest mb-2 ${uiTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}><span>LINE SPACING</span><span>{activeSettings.textSpacing}</span></div><input type="range" min="1" max="3" step="0.1" value={activeSettings.textSpacing} onChange={(e) => { const val = parseFloat(e.target.value); setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = { ...next[currentSlideIndex].settingsOverride, textSpacing: val }; return next; }); syncStateToStorage(); }} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-600" /></div><div><div className={`flex justify-between text-[9px] font-bold uppercase tracking-widest mb-2 ${uiTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}><span>VERSE GROUPING</span><span>{activeSettings.verseCount} verses</span></div><input type="range" min="1" max="10" step="1" value={activeSettings.verseCount} onChange={(e) => { const val = parseInt(e.target.value); setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = { ...next[currentSlideIndex].settingsOverride, verseCount: val }; return next; }); syncStateToStorage(); }} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-600" /></div><div><label className={`text-[9px] font-bold uppercase tracking-widest ${uiTheme === 'light' ? 'text-slate-500' : 'text-slate-400'} mb-2 block`}>FONT FAMILY</label><select value={activeSettings.fontFamily} onChange={(e) => { const val = e.target.value; setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = { ...next[currentSlideIndex].settingsOverride, fontFamily: val }; return next; }); syncStateToStorage(); }} className={`w-full ${uiTheme === 'light' ? 'bg-slate-100 border-slate-200 text-slate-900' : 'bg-slate-700 border-slate-600 text-white'} border p-2 rounded-lg text-xs outline-none focus:ring-1 focus:ring-amber-500`}>{FONT_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div></div><div className="space-y-4"><h5 className={`text-[10px] font-bold uppercase tracking-widest ${uiTheme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>PASSAGE LAYOUT</h5><button onClick={() => { const val = !activeSettings.showVerseNumbers; setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = { ...next[currentSlideIndex].settingsOverride, showVerseNumbers: val }; return next; }); syncStateToStorage(); }} className={`flex w-full items-center justify-between p-3 rounded-lg border text-xs transition-all ${activeSettings.showVerseNumbers ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-bold' : uiTheme === 'light' ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-slate-700 border-slate-600 text-slate-300'}`}><span>SHOW VERSE NUMBERS</span><div className={`w-8 h-4 rounded-full relative transition-colors ${activeSettings.showVerseNumbers ? 'bg-amber-500' : 'bg-slate-400'}`}><div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${activeSettings.showVerseNumbers ? 'right-1' : 'left-1'}`} /></div></button><button onClick={() => { const val = !activeSettings.oneVersePerLine; setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = { ...next[currentSlideIndex].settingsOverride, oneVersePerLine: val }; return next; }); syncStateToStorage(); }} className={`flex w-full items-center justify-between p-3 rounded-lg border text-xs transition-all ${activeSettings.oneVersePerLine ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-bold' : uiTheme === 'light' ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-slate-700 border-slate-600 text-slate-300'}`}><span>ONE VERSE PER LINE</span><div className={`w-8 h-4 rounded-full relative transition-colors ${activeSettings.oneVersePerLine ? 'bg-amber-500' : 'bg-slate-400'}`}><div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${activeSettings.oneVersePerLine ? 'right-1' : 'left-1'}`} /></div></button><button onClick={() => { const val = !activeSettings.showReferenceBox; setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = { ...next[currentSlideIndex].settingsOverride, showReferenceBox: val }; return next; }); syncStateToStorage(); }} className={`flex w-full items-center justify-between p-3 rounded-lg border text-xs transition-all ${activeSettings.showReferenceBox ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-bold' : uiTheme === 'light' ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-slate-700 border-slate-600 text-slate-300'}`}><span>SHOW REFERENCE BOX</span><div className={`w-8 h-4 rounded-full relative transition-colors ${activeSettings.showReferenceBox ? 'bg-amber-500' : 'bg-slate-400'}`}><div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${activeSettings.showReferenceBox ? 'right-1' : 'left-1'}`} /></div></button><button onClick={() => { const val = !activeSettings.showTitle; setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = { ...next[currentSlideIndex].settingsOverride, showTitle: val }; return next; }); syncStateToStorage(); }} className={`flex w-full items-center justify-between p-3 rounded-lg border text-xs transition-all ${activeSettings.showTitle ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-bold' : uiTheme === 'light' ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-slate-700 border-slate-600 text-slate-300'}`}><span>SHOW SLIDE TITLE</span><div className={`w-8 h-4 rounded-full relative transition-colors ${activeSettings.showTitle ? 'bg-amber-500' : 'bg-slate-400'}`}><div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${activeSettings.showTitle ? 'right-1' : 'left-1'}`} /></div></button><div className="flex flex-col gap-2 mt-2"><label className={`text-[9px] font-bold uppercase tracking-widest ${uiTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>VERSE NUMBER COLOR</label><input type="color" value={activeSettings.verseNumberColor} onChange={(e) => { const val = e.target.value; setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = { ...next[currentSlideIndex].settingsOverride, verseNumberColor: val }; return next; }); syncStateToStorage(); }} className={`w-full h-8 rounded cursor-pointer border ${uiTheme === 'light' ? 'border-slate-300' : 'border-slate-600'}`} /></div><div className="flex flex-col gap-2 mt-2"><label className={`text-[9px] font-bold uppercase tracking-widest ${uiTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>REF BOX COLOR</label><input type="color" value={activeSettings.referenceBoxColor} onChange={(e) => { const val = e.target.value; setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = { ...next[currentSlideIndex].settingsOverride, referenceBoxColor: val }; return next; }); syncStateToStorage(); }} className={`w-full h-8 rounded cursor-pointer border ${uiTheme === 'light' ? 'border-slate-300' : 'border-slate-600'}`} /></div><div className="flex flex-col gap-2 mt-2"><label className={`text-[9px] font-bold uppercase tracking-widest ${uiTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>BACKGROUND COLOR</label><input type="color" value={activeSettings.pageColor} onChange={(e) => { const val = e.target.value; setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = { ...next[currentSlideIndex].settingsOverride, pageColor: val }; return next; }); syncStateToStorage(); }} className={`w-full h-8 rounded cursor-pointer border ${uiTheme === 'light' ? 'border-slate-300' : 'border-slate-600'}`} /></div><div className="pt-2"><div className={`flex justify-between text-[9px] font-bold uppercase tracking-widest mb-2 ${uiTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}><span>MAX PAGE WIDTH</span><span>{activeSettings.maxWidth}px</span></div><input type="range" min="600" max="2400" step="40" value={activeSettings.maxWidth || 1024} onChange={(e) => { const val = parseInt(e.target.value); setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = { ...next[currentSlideIndex].settingsOverride, maxWidth: val }; return next; }); syncStateToStorage(); }} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-600" /></div><div className="pt-2"><h5 className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${uiTheme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>SLIDE THEME</h5><div className="flex gap-2 p-1 bg-slate-800 rounded-lg border border-slate-700"><button onClick={() => { setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = { ...next[currentSlideIndex].settingsOverride, theme: 'light', pageColor: '#ffffff', verseNumberColor: '#64748b' }; return next; }); syncStateToStorage(); }} className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${activeSettings.theme === 'light' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-white'}`}>LIGHT</button><button onClick={() => { setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = { ...next[currentSlideIndex].settingsOverride, theme: 'dark', pageColor: '#000000', verseNumberColor: '#475569' }; return next; }); syncStateToStorage(); }} className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${activeSettings.theme === 'dark' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>DARK</button><button onClick={() => { setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = { ...next[currentSlideIndex].settingsOverride, theme: 'chroma', pageColor: '#00ff00', verseNumberColor: '#ffffff' }; return next; }); syncStateToStorage(); }} className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${activeSettings.theme === 'chroma' ? 'bg-green-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>CHROMA</button></div></div><div className="pt-2"><div className={`flex justify-between text-[9px] font-bold uppercase tracking-widest mb-2 ${uiTheme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}><span>MARKUP INTENSITY</span><span>{activeSettings.highlightIntensity}</span></div><input type="range" min="0.1" max="1" step="0.1" value={activeSettings.highlightIntensity} onChange={(e) => { const val = parseFloat(e.target.value); setSlides(prev => { const next = [...prev]; next[currentSlideIndex].settingsOverride = { ...next[currentSlideIndex].settingsOverride, highlightIntensity: val }; return next; }); syncStateToStorage(); }} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-600" /></div></div></div></div></motion.div> )}</AnimatePresence> )}
          </div>
          
          <AnimatePresence mode="wait"><SlideTransitionWrapper key={currentSlide.id} transition={activeSettings.slideTransition} slideId={currentSlide.id}><SlideRenderer slide={currentSlide} settings={activeSettings} activeFont={activeFont} activeVerseIndex={activeVerseIndex} verses={verses} isControl={true} containerRef={containerRef} applyActiveTool={applyActiveTool} translation={translation} activeTool={currentSlide.type === 'scripture' ? activeTool : imageActiveTool} activeColor={currentSlide.type === 'scripture' ? activeMarkupColor : imageActiveColor} updateSlideMarkups={updateSlideMarkups} penSize={imagePenSize} onMarkupUpdate={broadcastLiveMarkup} /></SlideTransitionWrapper></AnimatePresence>

          {currentSlide.type === 'scripture' && (
            <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 ${uiTheme === 'light' ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'} border p-2 rounded-2xl shadow-2xl z-50`}>
              <div className={`flex gap-1 ${uiTheme === 'light' ? 'bg-slate-100' : 'bg-slate-800'} p-1 rounded-xl`}>
                <button onClick={() => { setActiveVerseIndex(prev => { const next = Math.max(0, prev - activeSettings.verseCount); syncStateToStorage({ index: next }); return next; }); }} className={`p-3 rounded-lg ${uiTextMuted} hover:bg-amber-500/10 hover:text-amber-600 transition-all`} title="PREVIOUS VERSE"><ChevronUp size={20} /></button>
                <button onClick={() => { setActiveVerseIndex(prev => { const next = Math.min(prev + activeSettings.verseCount, verses.length - 1); syncStateToStorage({ index: next }); return next; }); }} className={`p-3 rounded-lg ${uiTextMuted} hover:bg-amber-500/10 hover:text-amber-600 transition-all`} title="NEXT VERSE"><ChevronDown size={20} /></button>
              </div>
              <div className={`w-px h-8 ${uiTheme === 'light' ? 'bg-slate-200' : 'bg-slate-700'} mx-1`} />
              <div className={`flex gap-1 ${uiTheme === 'light' ? 'bg-slate-100' : 'bg-slate-800'} p-1 rounded-xl`}>
                <button onClick={() => toggleTool('backColor', hexToRgba(activeMarkupColor, 0.4))} className={`p-3 rounded-lg ${activeTool?.type === 'backColor' ? 'bg-amber-500 text-slate-900' : `${uiTextMuted} hover:bg-slate-200`}`} title="HIGHLIGHT"><Highlighter size={18} /></button>
                <button onClick={() => toggleTool('foreColor', activeMarkupColor)} className={`p-3 rounded-lg ${activeTool?.type === 'foreColor' ? 'bg-amber-500 text-slate-900' : `${uiTextMuted} hover:bg-slate-200`}`} title="TEXT COLOR"><Type size={18} /></button>
                <button onClick={() => toggleTool('underlineColor', activeMarkupColor)} className={`p-3 rounded-lg ${activeTool?.type === 'underlineColor' ? 'bg-amber-500 text-slate-900' : `${uiTextMuted} hover:bg-slate-200`}`} title="UNDERLINE"><UnderlineIcon size={18} /></button>
                <button onClick={() => toggleTool('circle', activeMarkupColor)} className={`p-3 rounded-lg ${activeTool?.type === 'circle' ? 'bg-amber-500 text-slate-900' : `${uiTextMuted} hover:bg-slate-200`}`} title="CIRCLE"><Circle size={18} /></button>
                <button onClick={() => toggleTool('rect', activeMarkupColor)} className={`p-3 rounded-lg ${activeTool?.type === 'rect' ? 'bg-amber-500 text-slate-900' : `${uiTextMuted} hover:bg-slate-200`}`} title="BOX"><Square size={18} /></button>
                <button onClick={() => toggleTool('bold')} className={`p-3 rounded-lg ${activeTool?.type === 'bold' ? 'bg-amber-500 text-slate-900' : `${uiTextMuted} hover:bg-slate-200`}`} title="BOLD"><BoldIcon size={18} /></button>
                <button onClick={() => toggleTool('italic')} className={`p-3 rounded-lg ${activeTool?.type === 'italic' ? 'bg-amber-500 text-slate-900' : `${uiTextMuted} hover:bg-slate-200`}`} title="ITALIC"><Italic size={18} /></button>
                <button onClick={() => toggleTool('eraser')} className={`p-3 rounded-lg ${activeTool?.type === 'eraser' ? 'bg-amber-500 text-slate-900' : `${uiTextMuted} hover:bg-slate-200`}`} title="SURGICAL ERASER"><Eraser size={18} /></button>
              </div>
              <div className={`w-px h-8 ${uiTheme === 'light' ? 'bg-slate-200' : 'bg-slate-700'}`} />
              <div className="flex gap-2 px-2 items-center">
                {['#facc15', '#10b981', '#3b82f6', '#ef4444'].map(c => (<button key={c} onClick={() => { setActiveMarkupColor(c); if(activeTool?.type === 'backColor') toggleTool('backColor', hexToRgba(c, 0.4)); else if(activeTool?.type === 'underlineColor' || activeTool?.type === 'foreColor') toggleTool(activeTool.type, c); }} className={`w-6 h-6 rounded-full border-2 ${activeMarkupColor === c ? 'border-amber-500' : 'border-transparent'}`} style={{ backgroundColor: c }} />))}
                <div className={`w-px h-6 ${uiTheme === 'light' ? 'bg-slate-200' : 'bg-slate-700'} mx-1`} />
                <div className="relative w-8 h-8 flex items-center justify-center">
                  <Palette size={20} className={activeMarkupColor ? 'text-amber-500' : uiTextMuted} />
                  <input type="color" value={activeMarkupColor} onChange={(e) => { const c = e.target.value; setActiveMarkupColor(c); if(activeTool?.type === 'backColor') toggleTool('backColor', hexToRgba(c, 0.4)); else if(activeTool?.type === 'underlineColor' || activeTool?.type === 'foreColor') toggleTool(activeTool.type, c); }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
              </div>
              <div className={`w-px h-8 ${uiTheme === 'light' ? 'bg-slate-200' : 'bg-slate-700'} mx-1`} />
              <button onClick={clearAllFormatting} className={`p-3 ${uiTextMuted} hover:text-red-500 transition-colors`} title="CLEAR ALL FORMATTING"><RotateCcw size={18} /></button>
            </div>
          )}
        </main>
      </div>

      <AnimatePresence>{showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSettings(false)} className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" />
          <motion.div initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 300, opacity: 0 }} className={`w-80 h-full ${uiBg} border-l ${uiBorder} shadow-2xl p-6 z-[110] relative flex flex-col gap-8`}>
            <div className="flex justify-between items-center"><h3 className="font-black uppercase italic tracking-tighter text-xl">SETTINGS</h3><button onClick={() => setShowSettings(false)} className={`p-2 ${uiBtnHover} rounded-lg ${uiTextMuted}`}><X size={20} /></button></div>
            <div className="space-y-6 overflow-y-auto no-scrollbar pb-12">
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">INTERFACE THEME</h4>
                <div className={`flex gap-2 p-1 ${uiTheme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-800 border-slate-700'} rounded-lg border`}>
                  <button onClick={() => setSettings({...settings, uiTheme: 'light'})} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${settings.uiTheme === 'light' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-white'}`}>LIGHT</button>
                  <button onClick={() => setSettings({...settings, uiTheme: 'dark'})} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${settings.uiTheme === 'dark' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>DARK</button>
                </div>
              </div>
              {isTauriApp && availableMonitors.length > 1 && (
                <div className={`space-y-3 pt-4 border-t ${uiTheme === 'light' ? 'border-slate-100' : 'border-white/5'}`}>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">TARGET DISPLAY</h4>
                  <select value={settings.targetMonitor} onChange={(e) => setSettings({...settings, targetMonitor: parseInt(e.target.value)})} className={`w-full ${uiTheme === 'light' ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-800 border-slate-700 text-white'} border p-2 rounded-lg text-xs outline-none shadow-sm`}>{availableMonitors.map((m, i) => <option key={i} value={i}>{m.name || `DISPLAY ${i + 1}`}</option>)}</select>
                </div>
              )}
              <div className={`space-y-3 pt-4 border-t ${uiTheme === 'light' ? 'border-slate-100' : 'border-white/5'}`}>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">SLIDE TRANSITION</h4>
                <div className="grid grid-cols-2 gap-2">{['none', 'fade', 'slide', 'zoom'].map(t => (<button key={t} onClick={() => setSettings({...settings, slideTransition: t as any})} className={`py-2 text-[10px] font-bold rounded-md border transition-all uppercase tracking-widest ${settings.slideTransition === t ? 'bg-amber-500 border-amber-400 text-slate-900 shadow-lg' : (uiTheme === 'light' ? 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white')}`}>{t}</button>))}</div>
              </div>
              <div className={`space-y-3 pt-6 border-t ${uiTheme === 'light' ? 'border-slate-100' : 'border-white/5'}`}><button onClick={() => checkForUpdates(true)} className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${uiTheme === 'light' ? 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 border border-slate-200 shadow-sm' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}>CHECK FOR UPDATES</button></div>
            </div>
          </motion.div>
        </div>
      )}</AnimatePresence>
    </div>
  );
}
