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
  PanelLeftOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

const getIsTauri = () => !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__ || window.location.protocol === 'tauri:';

interface Verse {
  id: string;
  reference: string;
  text: string;
  html?: string;
  bookHeader?: string;
  acrostic?: string;
  isNewPassage?: boolean;
  isNewChapter?: boolean;
}

type SlideType = 'scripture' | 'image' | 'video' | 'graphic' | 'markdown';

interface Slide {
  id: string;
  type: SlideType;
  title: string;
  content: any; // scripture: Verse[], image: string (url/path), video: string, graphic: string (html/js)
  settingsOverride?: Partial<AppSettings>;
}

interface AppSettings {
  textSize: number;
  textSpacing: number;
  scrollSpeed: number;
  verseCount: number;
  highlightIntensity: number;
  pageColor: string;
  theme: 'light' | 'dark';
  uiTheme: 'light' | 'dark';
  fontFamily: string;
  showVerseNumbers: boolean;
  oneVersePerLine: boolean;
  verseNumberColor: string;
  defaultTranslation: string;
  maxWidth: number;
  targetMonitor?: number;
  showReferenceBox: boolean;
  referenceBoxColor: string;
}

const DEFAULT_PASSAGE: Verse[] = [
  { id: 'Gen-1-1', reference: 'Genesis 1:1', text: "In the beginning, God created the heavens and the earth.", bookHeader: 'Genesis' },
  { id: 'Gen-1-2', reference: 'Genesis 1:2', text: "The earth was without form and void, and darkness was over the face of the deep. And the Spirit of God was hovering over the face of the waters." },
  { id: 'Gen-1-3', reference: 'Genesis 1:3', text: "And God said, \"Let there be light,\" and there was light." },
  { id: 'Gen-1-4', reference: 'Genesis 1:4', text: "And God saw that the light was good. And God separated the light from the darkness." },
  { id: 'Gen-1-5', reference: 'Genesis 1:5', text: "God called the light Day, and the darkness he called Night. And there was evening and there was morning, the first day." }
];

const TRANSLATIONS = [
  { id: 'web', name: 'World English Bible (WEB)' },
  { id: 'esv', name: 'English Standard Version (ESV)' },
  { id: 'kjv', name: 'King James Version (KJV)' },
  { id: 'bbe', name: 'Bible in Basic English (BBE)' },
  { id: 'net', name: 'NET Bible (NET)' },
  { id: 'clementine', name: 'Clementine Latin Vulgate' },
  { id: 'wlc', name: 'Hebrew Old Testament (WLC)' },
  { id: 'lxx', name: 'Greek Septuagint (LXX)' },
  { id: 'sblgnt', name: 'SBL Greek New Testament (SBLGNT)' }
];

const FONT_OPTIONS = [
  { id: 'academic', name: 'Academic Serif', css: 'var(--font-serif)' },
  { id: 'modern', name: 'Modern Sans', css: 'var(--font-sans)' },
  { id: 'display', name: 'Bold Display', css: 'var(--font-display)' },
  { id: 'study', name: 'Study Monospace', css: 'var(--font-mono)' }
];

const DEFAULT_SETTINGS: AppSettings = {
  textSize: 36,
  textSpacing: 1.7,
  scrollSpeed: 700,
  verseCount: 1,
  highlightIntensity: 0.5,
  pageColor: '#f0f0f4',
  theme: 'light',
  uiTheme: 'dark',
  fontFamily: 'academic',
  showVerseNumbers: true,
  oneVersePerLine: false,
  verseNumberColor: '#000000',
  defaultTranslation: 'web',
  maxWidth: 1024,
  targetMonitor: 1,
  showReferenceBox: true,
  referenceBoxColor: '#1e293b'
};

const BOOK_IDS: Record<string, number> = {
  'genesis': 1, 'gen': 1, 'gn': 1, 'exodus': 2, 'ex': 2, 'exod': 2, 'leviticus': 3, 'lev': 3, 'lv': 3, 'numbers': 4, 'num': 4, 'nm': 4, 'deuteronomy': 5, 'deut': 5, 'dt': 5,
  'joshua': 6, 'judges': 7, 'ruth': 8, '1 samuel': 9, '2 samuel': 10,
  '1 kings': 11, '2 kings': 12, '1 chronicles': 13, '2 chronicles': 14,
  'ezra': 15, 'nehemiah': 16, 'esther': 17, 'job': 18, 'psalms': 19, 'psalm': 19, 'ps': 19,
  'prov': 20, 'proverbs': 20, 'eccl': 21, 'ecc': 21, 'eccles': 21, 'ecclesiastes': 21, 'song of solomon': 22, 'song of songs': 22,
  'isaiah': 23, 'isa': 23, 'is': 23, 'jeremiah': 24, 'jer': 24, 'jr': 24, 'lamentations': 25, 'lam': 25, 'ezekiel': 26, 'ezek': 26, 'ez': 26, 'daniel': 27, 'dan': 27, 'dn': 27,
  'hosea': 28, 'joel': 29, 'amos': 30, 'obadiah': 31, 'jonah': 32, 'micah': 33,
  'nahum': 34, 'habakkuk': 35, 'zephaniah': 36, 'haggai': 37, 'zechariah': 38, 'malachi': 39,
  'matthew': 40, 'matt': 40, 'mat': 40, 'mt': 40, 'mark': 41, 'mrk': 41, 'mk': 41, 'luke': 42, 'luk': 42, 'lk': 42, 'john': 43, 'jhn': 43, 'jn': 43, 'acts': 44, 'act': 44, 'ac': 44, 'romans': 45, 'rom': 45, 'rm': 45,
  '1 corinthians': 46, '1cor': 46, '2 corinthians': 47, '2cor': 47, 'galatians': 48, 'gal': 48, 'ephesians': 49, 'eph': 49,
  'philippians': 50, 'phil': 50, 'colossians': 51, 'col': 51, '1 thessalonians': 52, '2 thessalonians': 53,
  '1 timothy': 54, '2 timothy': 55, 'titus': 56, 'philemon': 57, 'hebrews': 58, 'heb': 58,
  'james': 59, '1 peter': 60, '2 peter': 61, '1 john': 62, '2 john': 63, '3 john': 64,
  'jude': 65, 'jud': 65, 'revelation': 66, 'rev': 66, 'apoc': 66, 'apocalypse': 66
};

const CANONICAL_BOOKS: Record<number, string> = {
  1: 'Genesis', 2: 'Exodus', 3: 'Leviticus', 4: 'Numbers', 5: 'Deuteronomy',
  6: 'Joshua', 7: 'Judges', 8: 'Ruth', 9: '1 Samuel', 10: '2 Samuel',
  11: '1 Kings', 12: '2 Kings', 13: '1 Chronicles', 14: '2 Chronicles',
  15: 'Ezra', 16: 'Nehemiah', 17: 'Esther', 18: 'Job', 19: 'Psalms',
  20: 'Proverbs', 21: 'Ecclesiastes', 22: 'Song of Solomon',
  23: 'Isaiah', 24: 'Jeremiah', 25: 'Lamentations', 26: 'Ezekiel', 27: 'Daniel',
  28: 'Hosea', 29: 'Joel', 30: 'Amos', 31: 'Obadiah', 32: 'Jonah', 33: 'Micah',
  34: 'Nahum', 35: 'Habakkuk', 36: 'Zephaniah', 37: 'Haggai', 38: 'Zechariah', 39: 'Malachi',
  40: 'Matthew', 41: 'Mark', 42: 'Luke', 43: 'John', 44: 'Acts', 45: 'Romans',
  46: '1 Corinthians', 47: '2 Corinthians', 48: 'Galatians', 49: 'Ephesians',
  50: 'Philippians', 51: 'Colossians', 52: '1 Thessalonians', 53: '2 Thessalonians',
  54: '1 Timothy', 55: '2 Timothy', 56: 'Titus', 57: 'Philemon', 58: 'Hebrews',
  59: 'James', 60: '1 Peter', 61: '2 Peter', 62: '1 John', 63: '2 John', 64: '3 John',
  65: 'Jude', 66: 'Revelation'
};

const formatReference = (ref: string) => {
  if (!ref.toLowerCase().startsWith('psalm')) return ref;
  const isMultiChapter = ref.includes('-') && (
    (ref.match(/\d+/g) || []).length > 2 || 
    (!ref.includes(':') && ref.includes('-'))
  );
  if (isMultiChapter) return ref.replace(/^Psalm[s]?\b/i, 'Psalms');
  return ref.replace(/^Psalm[s]?\b/i, 'Psalm');
};

export default function App() {
  // --- STATE ---
  const [appMode, setAppMode] = useState<'select' | 'control' | 'present'>('select');
  const [displayMode, setDisplayMode] = useState<'single' | 'dual'>(() => {
    try { return (localStorage.getItem('osb_pro_display_mode') as 'single' | 'dual') || 'single'; } catch { return 'single'; }
  });

  const [slides, setSlides] = useState<Slide[]>(() => {
    try {
      const saved = localStorage.getItem('osb_pro_slides');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [{
      id: 'initial-slide',
      type: 'scripture',
      title: 'Genesis 1:1-5',
      content: DEFAULT_PASSAGE
    }];
  });

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const currentSlide = useMemo(() => slides[currentSlideIndex] || slides[0], [slides, currentSlideIndex]);

  const [verses, setVerses] = useState<Verse[]>([]);
  useEffect(() => {
    if (currentSlide?.type === 'scripture') {
      setVerses(currentSlide.content);
    } else {
      setVerses([]);
    }
  }, [currentSlide, currentSlideIndex]);

  const [readingMode, setReadingMode] = useState(false);
  const [activeVerseIndex, setActiveVerseIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showCustomTextModal, setShowCustomTextModal] = useState(false);
  const [customTextValue, setCustomTextValue] = useState("");
  const [referenceInput, setReferenceInput] = useState("Genesis 1:1-5");
  const [translation, setTranslation] = useState("web");
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [esvApiKey, setEsvApiKey] = useState(() => {
    const defaultKey = import.meta.env.VITE_ESV_API_KEY || "";
    try { return localStorage.getItem('esvApiKey') || defaultKey; } catch { return defaultKey; }
  });
  const [activeTool, setActiveTool] = useState<{ type: string, value: string | null } | null>(null);
  const [activeMarkupColor, setActiveMarkupColor] = useState('#fbbf24');
  const [resetKey, setResetKey] = useState(0);
  const [isPresenting, setIsPresenting] = useState(false);
  const [availableMonitors, setAvailableMonitors] = useState<any[]>([]);
  const [isTauriApp, setIsTauriApp] = useState(getIsTauri());
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const presentationWinRef = useRef<Window | null>(null);

  useEffect(() => {
    const initTauri = async () => {
      console.log('Starting Tauri Bridge initialization...');
      for (let i = 0; i < 20; i++) {
        try {
          const m = await invoke('list_monitors');
          console.log('Bridge found via try-call! Fetching hardware info...');
          setIsTauriApp(true);
          setAvailableMonitors(m as any[]);
          checkForUpdates(false);
          setBridgeError(null);
          return;
        } catch (e: any) {
          if (typeof invoke === 'function') {
            console.log('Bridge detected but call failed:', e);
            if (e.toString().includes('permission') || e.toString().includes('not allowed')) {
              setIsTauriApp(true);
              setBridgeError('Access Denied: Check Tauri permissions.');
              return;
            }
          }
        }
        await new Promise(r => setTimeout(r, 500));
      }
      setBridgeError('Bridge Timeout: System hardware unreachable.');
    };
    initTauri();
  }, []);

  const checkForUpdates = async (manual: boolean) => {
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const { ask, message } = await import('@tauri-apps/plugin-dialog');
      const { relaunch } = await import('@tauri-apps/plugin-process');
      const { getVersion } = await import('@tauri-apps/api/app');

      const currentVersion = await getVersion();
      const update = await check();
      if (update) {
        const yes = await ask(`There is a newer version (${update.version}). Update now?`, { title: 'Update Available', kind: 'info' });
        if (yes) { await update.downloadAndInstall(); await relaunch(); }
      } else if (manual) {
        await message(`Up to date. Version ${currentVersion} is the current version.`, { title: 'No Update Found', kind: 'info' });
      }
    } catch (e) {
      console.error('Update check failed:', e);
    }
  };

  // --- REFS & SYNC ---
  const stateRef = useRef({ activeVerseIndex, verses, settings, translation, slides, currentSlideIndex });
  useEffect(() => {
    stateRef.current = { activeVerseIndex, verses, settings, translation, slides, currentSlideIndex };
  }, [activeVerseIndex, verses, settings, translation, slides, currentSlideIndex]);

  const [syncChannel] = useState(() => {
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        return new BroadcastChannel('verse_sync_channel');
      }
    } catch (e) {}
    return { postMessage: () => {}, onmessage: null } as unknown as BroadcastChannel;
  });

  const syncStateToStorage = useCallback((overrides: { index?: number; verses?: Verse[]; settings?: AppSettings; forceDomRead?: boolean } = {}) => {
    if (appMode !== 'control') return;
    
    const targetIndex = overrides.index !== undefined ? overrides.index : stateRef.current.activeVerseIndex;
    let currentVerses = overrides.verses !== undefined ? overrides.verses : stateRef.current.verses;

    if (overrides.forceDomRead && overrides.verses === undefined && stateRef.current.verses.length > 0) {
      currentVerses = stateRef.current.verses.map((v, i) => {
        const el = document.getElementById(`verse-${i}`);
        if (!el) return v;
        const html = el.innerHTML.replace(/\u200E/g, '');
        if (v.html === html) return v;
        return { ...v, html };
      });
      
      const hasChanged = currentVerses.some((v, i) => v.html !== stateRef.current.verses[i].html);
      if (hasChanged) {
        setVerses(currentVerses);
        setSlides(prev => {
          const next = [...prev];
          if (next[stateRef.current.currentSlideIndex]) {
            next[stateRef.current.currentSlideIndex] = { ...next[stateRef.current.currentSlideIndex], content: currentVerses };
          }
          return next;
        });
      }
    }

    const stateToSave = { 
      slides: stateRef.current.slides,
      currentSlideIndex: stateRef.current.currentSlideIndex,
      verses: currentVerses, 
      activeIndex: targetIndex, 
      settings: overrides.settings || stateRef.current.settings,
      translation: stateRef.current.translation
    };

    try { syncChannel.postMessage(stateToSave); } catch (e) {}
    if (isTauriApp) { invoke('set_state', { state: stateToSave }).catch(() => {}); }
    try {
      localStorage.setItem('osb_pro_state', JSON.stringify(stateToSave));
      localStorage.setItem('osb_pro_slides', JSON.stringify(stateRef.current.slides));
    } catch (e) {}
  }, [appMode, syncChannel, isTauriApp]);

  // --- SLIDE ACTIONS ---
  const addSlide = useCallback((type: SlideType = 'scripture') => {
    const newSlide: Slide = {
      id: `slide-${Date.now()}`,
      type,
      title: type === 'scripture' ? 'New Scripture' : `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      content: type === 'scripture' ? [] : (type === 'image' || type === 'video' ? '' : '<h1>New Graphic</h1>')
    };
    setSlides(prev => {
      const next = [...prev, newSlide];
      setTimeout(() => {
        setCurrentSlideIndex(next.length - 1);
        syncStateToStorage();
      }, 50);
      return next;
    });
  }, [syncStateToStorage]);

  const removeSlide = useCallback((index: number) => {
    if (slides.length <= 1) return;
    setSlides(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (currentSlideIndex >= next.length) {
        setCurrentSlideIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
    setTimeout(() => syncStateToStorage(), 50);
  }, [currentSlideIndex, slides.length, syncStateToStorage]);

  // --- THEME ---
  const uiTheme = settings.uiTheme || 'dark';
  const uiBg = uiTheme === 'dark' ? 'bg-slate-900' : 'bg-white';
  const uiBorder = uiTheme === 'dark' ? 'border-slate-700' : 'border-slate-200';
  const uiText = uiTheme === 'dark' ? 'text-white' : 'text-slate-900';
  const uiTextMuted = uiTheme === 'dark' ? 'text-slate-400' : 'text-slate-500';
  const uiBtnBg = uiTheme === 'dark' ? 'bg-slate-800' : 'bg-slate-100';
  const uiBtnHover = uiTheme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-200';

  // --- TAURI INIT ---
  useEffect(() => {
    if (!isTauriApp) return;
    invoke('list_monitors').then((m: any) => setAvailableMonitors(m)).catch(() => {});
  }, [isTauriApp]);

  // --- HELPERS ---
  const hexToRgba = useCallback((hex: string, intensity: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${intensity})`;
  }, []);

  const togglePresentation = async () => {
    try {
      if (isTauriApp) {
        if (isPresenting) { await invoke('close_presentation_window'); setIsPresenting(false); }
        else { await invoke('open_presentation_window', { monitorIndex: settings.targetMonitor }); setIsPresenting(true); }
      }
    } catch (err) { console.error(err); }
    setTimeout(() => syncStateToStorage(), 500);
  };

  // --- BIBLE FETCH ---
  const fetchWithTimeout = useCallback(async (url: string, options: RequestInit = {}, timeout = 6000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try { const res = await fetch(url, { ...options, signal: controller.signal }); clearTimeout(id); return res; }
    catch (e) { clearTimeout(id); throw e; }
  }, []);

  const fetchBiblePassage = useCallback(async (isAppend = false, overrideRef?: string, overrideTrans?: string) => {
    let refQuery = (overrideRef || referenceInput).trim();
    if (!refQuery) return;
    setIsLoading(true);
    setFetchError(null);
    const activeTrans = overrideTrans || translation;
    
    try {
      const res = await fetchWithTimeout(`https://bible-api.com/${encodeURIComponent(refQuery)}?translation=${activeTrans}`);
      const data = await res.json();
      if (!data.verses) throw new Error("Passage not found.");
      
      const fetchedVerses: Verse[] = data.verses.map((v: any, i: number) => ({
        id: `${v.book_id}-${v.chapter}-${v.verse}-${Math.random()}`,
        reference: `${v.book_name} ${v.chapter}:${v.verse}`,
        text: v.text.replace(/\n/g, ' ').trim(),
        bookHeader: i === 0 ? refQuery : undefined
      }));

      setSlides(prev => {
        const next = [...prev];
        if (next[currentSlideIndex]) {
          next[currentSlideIndex] = { ...next[currentSlideIndex], content: fetchedVerses, title: refQuery };
        }
        return next;
      });
      setVerses(fetchedVerses);
      setActiveVerseIndex(0);
      syncStateToStorage({ index: 0, verses: fetchedVerses });
    } catch (err: any) {
      setFetchError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [currentSlideIndex, referenceInput, syncStateToStorage, translation, fetchWithTimeout]);

  // --- MARKUP TOOLS ---
  const applyFormat = useCallback((command: string, value: string | null = null, skipSync = false) => {
    document.execCommand(command, false, value ?? undefined);
    if (!skipSync) {
      setTimeout(() => syncStateToStorage({ index: stateRef.current.activeVerseIndex, forceDomRead: true }), 50);
    }
  }, [syncStateToStorage]);

  const expandSelectionToWords = useCallback((selection: Selection) => {
    try {
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (!range.collapsed) return;

      let startNode = range.startContainer;
      let startOffset = range.startOffset;

      if (startNode.nodeType === Node.ELEMENT_NODE) {
        if (startNode.childNodes.length > 0) {
          const childIndex = Math.min(startOffset, startNode.childNodes.length - 1);
          startNode = startNode.childNodes[childIndex];
          startOffset = 0;
        }
      }
      while (startNode && startNode.nodeType !== Node.TEXT_NODE && startNode.firstChild) startNode = startNode.firstChild;

      if (startNode && startNode.nodeType === Node.TEXT_NODE) {
        const text = startNode.textContent || "";
        let s = startOffset, e = startOffset;
        while (s > 0 && !text[s - 1].match(/\s/)) s--;
        while (e < text.length && !text[e].match(/\s/)) e++;
        
        const newRange = document.createRange();
        newRange.setStart(startNode, s);
        newRange.setEnd(startNode, e);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    } catch (e) {}
  }, []);

  const applyUnderline = useCallback((color: string, skipSync = false) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed) return;
    const span = document.createElement('span');
    span.className = 'verse-markup';
    span.style.textDecoration = 'underline';
    span.style.textDecorationColor = color;
    span.style.textDecorationThickness = '2px';
    span.style.textUnderlineOffset = '4px';
    try {
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
      selection.removeAllRanges();
      if (!skipSync) setTimeout(() => syncStateToStorage({ index: stateRef.current.activeVerseIndex, forceDomRead: true }), 100);
    } catch (e) {}
  }, [syncStateToStorage]);

  const applyShape = useCallback((type: 'circle' | 'box', color: string, skipSync = false) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed) return;
    const span = document.createElement('span');
    span.className = 'verse-markup';
    span.style.border = `2px solid ${color}`;
    span.style.padding = '2px 4px';
    span.style.borderRadius = type === 'circle' ? '999px' : '4px';
    try {
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
      selection.removeAllRanges();
      if (!skipSync) setTimeout(() => syncStateToStorage({ index: stateRef.current.activeVerseIndex, forceDomRead: true }), 100);
    } catch (e) {}
  }, [syncStateToStorage]);

  const applyEraser = useCallback((skipSync = false) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0).cloneRange();
    try {
      const selectedFragment = range.cloneContents();
      // Logic to strip markup elements...
      range.deleteContents();
      range.insertNode(selectedFragment);
      selection.removeAllRanges();
    } catch (e) {}
    if (!skipSync) setTimeout(() => syncStateToStorage({ forceDomRead: true }), 100);
  }, [syncStateToStorage]);

  const applyMarkup = useCallback((toolOverride?: { type: string; value: string | null }) => {
    const tool = toolOverride || activeTool;
    if (!tool) return;
    const selection = window.getSelection();
    if (!selection) return;
    if (selection.isCollapsed) expandSelectionToWords(selection);
    const freshSelection = window.getSelection();
    if (!freshSelection || freshSelection.rangeCount === 0) return;
    
    if (tool.type === 'eraser') applyEraser();
    else if (tool.type === 'underlineColor') applyUnderline(activeMarkupColor);
    else if (tool.type === 'circle') applyShape('circle', activeMarkupColor);
    else if (tool.type === 'box') applyShape('box', activeMarkupColor);
    else {
      const finalValue = (tool.type === 'foreColor' || tool.type === 'backColor') ? (tool.value || activeMarkupColor) : tool.value;
      applyFormat(tool.type, finalValue);
    }
  }, [activeMarkupColor, activeTool, applyFormat, applyUnderline, applyEraser, applyShape, expandSelectionToWords, syncStateToStorage]);

  const applyActiveTool = useCallback(() => { applyMarkup(); }, [applyMarkup]);

  const toggleTool = useCallback((type: string, value: string | null = null) => {
    if (activeTool?.type === type && activeTool.value === value) setActiveTool(null);
    else {
      const newTool = { type, value };
      setActiveTool(newTool);
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) applyMarkup(newTool);
    }
  }, [activeTool, applyMarkup]);

  const clearAllFormatting = useCallback(() => {
    if (!window.confirm("Clear all formatting?")) return;
    const cleanVerses = verses.map(v => ({ ...v, html: undefined }));
    setVerses(cleanVerses);
    setSlides(prev => {
      const next = [...prev];
      if (next[currentSlideIndex]) next[currentSlideIndex].content = cleanVerses;
      return next;
    });
    syncStateToStorage({ verses: cleanVerses });
  }, [verses, currentSlideIndex, syncStateToStorage]);

  // --- RENDER HELPERS ---
  const activeFont = useMemo(() => FONT_OPTIONS.find(f => f.id === settings.fontFamily) || FONT_OPTIONS[0], [settings.fontFamily]);

  if (appMode === 'select') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 font-sans">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 text-center">
          <div className="md:col-span-2 mb-8">
            <h1 className="text-6xl font-black italic uppercase tracking-tighter mb-2">ScriptureGlide <span className="text-amber-500">Pro</span></h1>
            <p className="text-slate-400 tracking-widest text-xs uppercase">Advanced Slide & Media Presenter</p>
          </div>
          <button onClick={() => setAppMode('control')} className="bg-slate-900 border border-slate-800 p-12 rounded-3xl hover:border-amber-500 transition-all text-left group">
            <Monitor size={48} className="mb-6 text-amber-500 group-hover:scale-110 transition-transform" />
            <h2 className="text-2xl font-bold mb-2">Start Pro Session</h2>
            <p className="text-sm text-slate-400">Full control with slide deck, media, and interactive tools.</p>
          </button>
          <button onClick={() => setAppMode('present')} className="bg-slate-900 border border-slate-800 p-12 rounded-3xl hover:border-blue-500 transition-all text-left group">
            <Tv size={48} className="mb-6 text-blue-500 group-hover:scale-110 transition-transform" />
            <h2 className="text-2xl font-bold mb-2">Display Mode</h2>
            <p className="text-sm text-slate-400">Receive and display content from a control instance.</p>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex flex-col transition-colors duration-500 overflow-hidden ${uiBg} ${uiText}`}>
      <header className={`h-16 border-b ${uiBorder} flex items-center px-4 justify-between flex-shrink-0 z-50 shadow-md`}>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowSidebar(!showSidebar)} className={`p-2 ${uiBtnHover} rounded-lg ${uiTextMuted}`}>
            {showSidebar ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
          </button>
          <h1 className="font-black italic uppercase tracking-tighter text-xl">ScriptureGlide <span className="text-amber-500">Pro</span></h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-800/50 p-1 rounded-lg border border-slate-700">
            <button onClick={() => addSlide('scripture')} className="p-2 hover:bg-slate-700 rounded-md text-slate-400 hover:text-white" title="Add Scripture Slide"><Book size={18} /></button>
            <button onClick={() => addSlide('image')} className="p-2 hover:bg-slate-700 rounded-md text-slate-400 hover:text-white" title="Add Image Slide"><ImageIcon size={18} /></button>
            <button onClick={() => addSlide('video')} className="p-2 hover:bg-slate-700 rounded-md text-slate-400 hover:text-white" title="Add Video Slide"><Film size={18} /></button>
          </div>
          <div className="w-px h-6 bg-slate-700 mx-2" />
          <button onClick={togglePresentation} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition-all ${isPresenting ? 'bg-red-500 text-white' : 'bg-amber-600 text-white'}`}>
            <Tv size={16} /> {isPresenting ? 'Stop' : 'Present'}
          </button>
          <button onClick={() => setShowSettings(!showSettings)} className={`p-2 ${uiBtnHover} rounded-lg ${uiTextMuted}`}><Settings size={20} /></button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <AnimatePresence>
          {showSidebar && (
            <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 260, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className={`h-full border-r ${uiBorder} flex flex-col flex-shrink-0 bg-slate-900/50 backdrop-blur-xl`}>
              <div className="p-4 flex justify-between items-center border-b border-white/5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Slide Deck</span>
                <span className="text-[10px] font-mono text-slate-600">{slides.length} slides</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar">
                {slides.map((slide, index) => (
                  <div key={slide.id} onClick={() => setCurrentSlideIndex(index)} className={`group relative aspect-video rounded-xl border-2 transition-all cursor-pointer overflow-hidden ${currentSlideIndex === index ? 'border-amber-500 ring-4 ring-amber-500/20' : 'border-slate-800 hover:border-slate-600'}`}>
                    <div className="absolute inset-0 bg-slate-800 flex items-center justify-center opacity-40">
                      {slide.type === 'scripture' && <Book size={24} />}
                      {slide.type === 'image' && <ImageIcon size={24} />}
                      {slide.type === 'video' && <Film size={24} />}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                      <p className="text-[10px] font-bold truncate text-white">{slide.title}</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeSlide(index); }} className="absolute top-1 right-1 p-1 bg-red-500/80 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                    <div className="absolute top-1 left-1 w-5 h-5 rounded bg-black/50 text-[10px] flex items-center justify-center font-bold text-white/50">{index + 1}</div>
                  </div>
                ))}
                <button onClick={() => addSlide()} className="w-full py-4 border-2 border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-600 hover:text-amber-500 hover:border-amber-500/50 transition-all gap-2">
                  <Plus size={20} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">New Slide</span>
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <main className="flex-1 flex flex-col relative bg-black/20">
          {currentSlide.type === 'scripture' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center gap-4 bg-slate-900/30">
                <input type="text" value={referenceInput} onChange={(e) => setReferenceInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchBiblePassage()} placeholder="Enter Bible Reference..." className="flex-1 h-10 bg-slate-800 border border-slate-700 rounded-lg px-4 text-sm outline-none focus:ring-1 focus:ring-amber-500" />
                <button onClick={() => fetchBiblePassage()} className="h-10 px-6 bg-amber-600 hover:bg-amber-500 rounded-lg font-bold text-xs uppercase tracking-widest flex items-center gap-2"><Search size={16} /> Fetch</button>
              </div>
              <div ref={containerRef} className="flex-1 overflow-y-auto p-12 no-scrollbar" style={{ backgroundColor: settings.pageColor, fontFamily: activeFont.css, color: settings.theme === 'dark' ? '#f8fafc' : '#0f172a' }} onMouseUp={applyActiveTool}>
                <div className="max-w-3xl mx-auto space-y-8" style={{ fontSize: `${settings.textSize}px`, lineHeight: settings.textSpacing }}>
                  {verses.length > 0 ? verses.map((v, i) => (
                    <div key={v.id} className="group relative">
                      <span className="absolute -left-12 top-2 text-xs font-bold opacity-20 group-hover:opacity-100 transition-opacity select-none">{v.reference.split(':').pop()}</span>
                      <span id={`verse-${i}`} contentEditable suppressContentEditableWarning className="outline-none block" dangerouslySetInnerHTML={{ __html: v.html || v.text }} />
                    </div>
                  )) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-20 pt-24">
                      <Book size={120} strokeWidth={0.5} />
                      <p className="mt-4 font-bold uppercase tracking-[0.3em]">No Scripture Loaded</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-700">
               <Layout size={64} className="mb-4 opacity-20" />
               <p className="uppercase tracking-[0.4em] font-black text-xs opacity-20">{currentSlide.type} module coming soon</p>
               <input type="text" value={currentSlide.title} onChange={(e) => {
                 const val = e.target.value;
                 setSlides(prev => {
                   const next = [...prev];
                   next[currentSlideIndex].title = val;
                   return next;
                 });
               }} className="mt-8 bg-transparent border-b border-slate-800 text-center text-xl font-bold outline-none focus:border-amber-500 px-4 py-2" />
            </div>
          )}

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900 border border-slate-700 p-2 rounded-2xl shadow-2xl z-50">
            <div className="flex gap-1 bg-slate-800 p-1 rounded-xl">
              <button onClick={() => toggleTool('backColor', hexToRgba(activeMarkupColor, 0.4))} className={`p-3 rounded-lg ${activeTool?.type === 'backColor' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:bg-slate-700'}`}><Highlighter size={18} /></button>
              <button onClick={() => toggleTool('foreColor', activeMarkupColor)} className={`p-3 rounded-lg ${activeTool?.type === 'foreColor' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:bg-slate-700'}`}><Type size={18} /></button>
              <button onClick={() => toggleTool('bold')} className={`p-3 rounded-lg ${activeTool?.type === 'bold' ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:bg-slate-700'}`}><BoldIcon size={18} /></button>
            </div>
            <div className="w-px h-8 bg-slate-700" />
            <div className="flex gap-2 px-2">
              {['#facc15', '#10b981', '#3b82f6', '#ef4444', '#ffffff'].map(c => (
                <button key={c} onClick={() => { setActiveMarkupColor(c); if(activeTool) toggleTool(activeTool.type, activeTool.type === 'backColor' ? hexToRgba(c, 0.4) : c); }} className={`w-8 h-8 rounded-full border-2 ${activeMarkupColor === c ? 'border-amber-500' : 'border-transparent'}`} style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="w-px h-8 bg-slate-700" />
            <button onClick={clearAllFormatting} className="p-3 text-slate-400 hover:text-red-500 transition-colors"><RotateCcw size={18} /></button>
          </div>
        </main>
      </div>

      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-end p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSettings(false)} className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" />
            <motion.div initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 300, opacity: 0 }} className={`w-80 h-full ${uiBg} border-l ${uiBorder} shadow-2xl p-6 z-[110] relative flex flex-col gap-8`}>
              <div className="flex justify-between items-center">
                <h3 className="font-black uppercase italic tracking-tighter text-xl">Settings</h3>
                <button onClick={() => setShowSettings(false)} className={`p-2 ${uiBtnHover} rounded-lg ${uiTextMuted}`}><X size={20} /></button>
              </div>
              <div className="space-y-6 overflow-y-auto no-scrollbar pb-12">
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Display Theme</h4>
                  <div className="flex gap-2 p-1 bg-slate-800 rounded-lg border border-slate-700">
                    <button onClick={() => setSettings({...settings, theme: 'light', pageColor: '#f8fafc'})} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${settings.theme === 'light' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-white'}`}>Light</button>
                    <button onClick={() => setSettings({...settings, theme: 'dark', pageColor: '#0f172a'})} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${settings.theme === 'dark' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Dark</button>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Text Appearance</h4>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-[10px] font-mono mb-2"><span>Size</span><span>{settings.textSize}px</span></div>
                      <input type="range" min="20" max="100" value={settings.textSize} onChange={(e) => setSettings({...settings, textSize: parseInt(e.target.value)})} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
