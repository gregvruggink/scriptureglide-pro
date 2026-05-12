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
  Square
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

const formatReference = (ref: string) => {
  if (!ref.toLowerCase().startsWith('psalm')) return ref;
  
  // Case 1: Single chapter range or single verse: "Psalms 1:1", "Psalms 1:1-5"
  // Case 2: Multi-chapter range: "Psalms 1-2", "Psalms 1:1 - 2:5"
  
  const isMultiChapter = ref.includes('-') && (
    // Check if there are two chapter numbers (e.g. "1-2" or "1:1-2:1")
    (ref.match(/\d+/g) || []).length > 2 || 
    // Or if it's just "Psalms 1-2" (no colons)
    (!ref.includes(':') && ref.includes('-'))
  );

  if (isMultiChapter) {
    return ref.replace(/^Psalm[s]?\b/i, 'Psalms');
  } else {
    return ref.replace(/^Psalm[s]?\b/i, 'Psalm');
  }
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

export default function App() {
  const [appMode, setAppMode] = useState<'select' | 'control' | 'present'>('select');
  const [displayMode, setDisplayMode] = useState<'single' | 'dual'>(() => {
    try { return (localStorage.getItem('osb_display_mode') as 'single' | 'dual') || 'single'; } catch { return 'single'; }
  });
  const [verses, setVerses] = useState<Verse[]>(DEFAULT_PASSAGE);
  const [readingMode, setReadingMode] = useState(false);
  const [activeVerseIndex, setActiveVerseIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showCustomTextModal, setShowCustomTextModal] = useState(false);
  const [customTextValue, setCustomTextValue] = useState("");

  const uiTheme = settings.uiTheme || 'dark';
  const uiBg = uiTheme === 'dark' ? 'bg-slate-900' : 'bg-white';
  const uiBorder = uiTheme === 'dark' ? 'border-slate-700' : 'border-slate-200';
  const uiText = uiTheme === 'dark' ? 'text-white' : 'text-slate-900';
  const uiTextMuted = uiTheme === 'dark' ? 'text-slate-400' : 'text-slate-500';
  const uiBtnBg = uiTheme === 'dark' ? 'bg-slate-800' : 'bg-slate-100';
  const uiBtnHover = uiTheme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-slate-200';
  const uiShadow = uiTheme === 'dark' ? 'shadow-black/50' : 'shadow-slate-200';

  const [referenceInput, setReferenceInput] = useState("Genesis 1:1-5");
  const [translation, setTranslation] = useState(() => {
    try {
      const saved = localStorage.getItem('osb_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.translation) return parsed.translation;
        if (parsed.settings?.defaultTranslation) return parsed.settings.defaultTranslation;
      }
    } catch (e) {}
    return "web";
  });
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
          // If the error is "invoke is not a function", the bridge isn't injected yet
          // If it's a permission error, the bridge IS there but we're blocked
          if (typeof invoke === 'function') {
            console.log('Bridge detected but call failed (waiting for injection):', e);
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
      // Direct imports from @tauri-apps/api/plugin-updater etc might be better
      const { check } = await import('@tauri-apps/plugin-updater');
      const { ask, message } = await import('@tauri-apps/plugin-dialog');
      const { relaunch } = await import('@tauri-apps/plugin-process');
      const { getVersion } = await import('@tauri-apps/api/app');

      const currentVersion = await getVersion();
      const update = await check();
      if (update) {
        const yes = await ask(
          `There is a newer version. Would you like to update to version ${update.version}?`,
          { title: 'Update Available', kind: 'info', okLabel: 'Update Now', cancelLabel: 'Later' }
        );
        if (yes) {
          await update.downloadAndInstall();
          await relaunch();
        }
      } else if (manual) {
        await message(`Up to date. Version ${currentVersion} is the current version.`, { title: 'No Update Found', kind: 'info' });
      }
    } catch (e) {
      console.error('Update check failed:', e);
      if (manual) {
        const { message } = await import('@tauri-apps/plugin-dialog');
        const { getVersion } = await import('@tauri-apps/api/app');
        try {
          const currentVersion = await getVersion();
          await message(`Up to date. Version ${currentVersion} is the current version.`, { title: 'Update Check', kind: 'info' });
        } catch {
          await message('No updates found or repository is private.', { title: 'Update Check', kind: 'info' });
        }
      }
    }
  };

  const togglePresentation = async () => {
    console.log('togglePresentation triggered. isPresenting:', isPresenting, 'isTauriApp:', isTauriApp);
    try {
      if (isTauriApp) {
        if (isPresenting) {
          console.log('Closing Tauri presentation window...');
          await invoke('close_presentation_window');
          setIsPresenting(false);
        } else {
          console.log('Opening Tauri presentation window on monitor:', settings.targetMonitor);
          await invoke('open_presentation_window', { monitorIndex: settings.targetMonitor });
          setIsPresenting(true);
        }
      } else {
        if (presentationWinRef.current && !presentationWinRef.current.closed) {
          console.log('Closing browser presentation window...');
          presentationWinRef.current.close();
          setIsPresenting(false);
        } else {
          console.log('Opening browser presentation window...');
          const url = new URL(window.location.origin);
          url.searchParams.set('view', 'presentation');
          presentationWinRef.current = window.open(url.toString(), 'ScripturePresentation', 'width=1024,height=768');
          setIsPresenting(true);
        }
      }
    } catch (err) {
      console.error('Failed to toggle presentation:', err);
      // Fallback: try to close anyway if we think we're presenting
      if (isPresenting) setIsPresenting(false);
    }
    setTimeout(() => syncStateToStorage(), 500);
  };

  useEffect(() => {
    let unlisten: UnlistenFn;
    if (isTauriApp) {
      listen('presentation-closed', () => {
        setIsPresenting(false);
      }).then(fn => { unlisten = fn; });
    }
    return () => {
      if (unlisten) unlisten();
    };
  }, [isTauriApp]);

  useEffect(() => {
    try { localStorage.setItem('esvApiKey', esvApiKey); } catch {}
  }, [esvApiKey]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'presentation') {
      setAppMode('present');
    }
  }, []);

  useEffect(() => {
    if (appMode !== 'control') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).contentEditable === 'true') {
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const i = Math.max(activeVerseIndex - settings.verseCount, 0);
        setActiveVerseIndex(i);
        syncStateToStorage({ index: i });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const i = Math.min(activeVerseIndex + settings.verseCount, verses.length - 1);
        setActiveVerseIndex(i);
        syncStateToStorage({ index: i });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appMode, activeVerseIndex, settings, verses, verses.length]);

  useEffect(() => {
    if (appMode !== 'select') {
      try {
        const savedState = localStorage.getItem('osb_state');
        if (savedState) {
          const parsed = JSON.parse(savedState);
          setVerses(parsed.verses || DEFAULT_PASSAGE);
          setActiveVerseIndex(parsed.activeIndex || 0);
          if (parsed.settings) setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
        }
      } catch (e) {}
    }
  }, [appMode]);

  const [syncChannel] = useState(() => {
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        return new BroadcastChannel('verse_sync_channel');
      }
    } catch (e) {}
    // Fallback mock object
    return { postMessage: () => {}, onmessage: null } as unknown as BroadcastChannel;
  });

  const saveStudy = async () => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      
      const filePath = await save({
        filters: [{
          name: 'ScriptureGlide Markup',
          extensions: ['glide']
        }]
      });

      if (filePath) {
        const data = {
          verses,
          settings,
          translation,
          version: '1.0'
        };
        await writeTextFile(filePath, JSON.stringify(data, null, 2));
      }
    } catch (err: any) {
      console.error('Failed to save markup:', err);
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(`Failed to save: ${err.message || err}`, { title: 'Save Error', kind: 'error' });
    }
  };

  const loadStudy = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readTextFile } = await import('@tauri-apps/plugin-fs');

      const selected = await open({
        multiple: false,
        filters: [{
          name: 'ScriptureGlide Markup',
          extensions: ['glide']
        }]
      });

      if (selected && !Array.isArray(selected)) {
        const content = await readTextFile(selected);
        const data = JSON.parse(content);
        
        if (data.verses) setVerses(data.verses);
        if (data.settings) setSettings(prev => ({ ...prev, ...data.settings }));
        if (data.translation) setTranslation(data.translation);
        
        // Force a sync to storage/presentation
        setTimeout(() => syncStateToStorage({ 
          verses: data.verses, 
          settings: data.settings,
          forceDomRead: false 
        }), 100);
      }
    } catch (err: any) {
      console.error('Failed to load markup:', err);
      const { message } = await import('@tauri-apps/plugin-dialog');
      await message(`Failed to load: ${err.message || err}`, { title: 'Load Error', kind: 'error' });
    }
  };
  const stateRef = useRef({ activeVerseIndex, verses, settings, translation });

  useEffect(() => {
    stateRef.current = { activeVerseIndex, verses, settings, translation };
  }, [activeVerseIndex, verses, settings, translation]);

  useEffect(() => {
    if (appMode !== 'present') return;
    
    const updateFromState = (state: any) => {
      console.log('Applying state update:', state);
      if (!state) return;
      
      if (state.verses) {
        setVerses(prev => {
          // Deep equality check to prevent infinite loops if we were syncing back
          if (JSON.stringify(prev) === JSON.stringify(state.verses)) return prev;
          return state.verses;
        });
      }
      if (state.translation) setTranslation(state.translation);
      if (state.settings) {
        setSettings(prev => ({ ...prev, ...state.settings }));
      }
      if (state.activeIndex !== undefined) {
        setActiveVerseIndex(state.activeIndex);
      }
    };

    if (isTauriApp) {
      invoke('get_state').then(updateFromState).catch(() => {});
      
      let unlisten: UnlistenFn | null = null;
      listen('state-changed', (event: any) => {
        console.log('Tauri state-changed event:', event.payload);
        updateFromState(event.payload);
      }).then(u => unlisten = u);

      return () => {
        if (unlisten) unlisten();
      };
    } else {
      fetch('/api/state')
        .then(res => res.json())
        .then(state => {
          if (state && Object.keys(state).length > 0) {
            updateFromState(state);
          }
        })
        .catch(() => {});

      syncChannel.onmessage = (e) => {
        updateFromState(e.data);
      };

      const eventSource = new EventSource('/api/stream');
      eventSource.onmessage = (event) => {
        try {
          const state = JSON.parse(event.data);
          updateFromState(state);
        } catch (err) {}
      };

      return () => {
        eventSource.close();
      };
    }
  }, [appMode, syncChannel]);

  const syncStateToStorage = useCallback((overrides: { index?: number; verses?: Verse[]; settings?: AppSettings; forceDomRead?: boolean } = {}) => {
    if (appMode !== 'control') return;
    
    const targetIndex = overrides.index !== undefined ? overrides.index : stateRef.current.activeVerseIndex;
    let currentVerses = overrides.verses !== undefined ? overrides.verses : stateRef.current.verses;

    if (overrides.forceDomRead && overrides.verses === undefined) {
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
      }
    }

    const stateToSave = { 
      verses: currentVerses, 
      activeIndex: targetIndex, 
      settings: overrides.settings || stateRef.current.settings,
      translation: stateRef.current.translation
    };

    try {
      syncChannel.postMessage(stateToSave);
    } catch (e) {}

    if (isTauriApp) {
      console.log('Tauri syncing state:', stateToSave);
      invoke('set_state', { state: stateToSave }) 
        .then(() => console.log('Tauri state synced successfully'))
        .catch((err: any) => console.error('Tauri set_state error:', err));
    }
    
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(stateToSave)], { type: 'application/json' });
      navigator.sendBeacon('/api/state', blob);
    } else {
      fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stateToSave)
      }).catch(() => {});
    }

    try {
      if (presentationWinRef.current && !presentationWinRef.current.closed) {
        presentationWinRef.current.postMessage(stateToSave, '*');
      }
    } catch (e) {}
    
    try {
      localStorage.setItem('osb_state', JSON.stringify(stateToSave));
    } catch (e) {}
  }, [appMode, syncChannel]);

  useEffect(() => {
    if (appMode === 'control') {
      // Small timeout to ensure DOM state is ready if forceDomRead is used in future
      const timer = setTimeout(() => {
        syncStateToStorage({ index: activeVerseIndex });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeVerseIndex, settings, translation, appMode, syncStateToStorage]);

  useEffect(() => {
    if (appMode === 'select' || verses.length === 0) return;
    
    const container = containerRef.current;
    if (!container) return;

    // Use data-verse-index for reliable selection across both modes
    const targetSelector = `[data-verse-index="${activeVerseIndex}"]`;
    let firstEl = container.querySelector(targetSelector) as HTMLElement;
    
    if (!firstEl) {
      firstEl = document.getElementById(`verse-${activeVerseIndex}`) as HTMLElement;
    }

    if (!firstEl) return;

    // Calculate center of entire active group
    const lastIdx = Math.min(activeVerseIndex + settings.verseCount - 1, verses.length - 1);
    const lastEl = container.querySelector(`[data-verse-index="${lastIdx}"]`) as HTMLElement || firstEl;

    const groupTop = firstEl.offsetTop;
    const groupBottom = lastEl.offsetTop + lastEl.clientHeight;
    const groupHeight = groupBottom - groupTop;
    const groupCenter = groupTop + (groupHeight / 2);
    
    // In control mode, we have a thick bottom toolbar
    // In present mode, we have a reference box
    // We want the text centered in the REMAINING visual space to the eye
    const chromeHeight = appMode === 'control' ? 140 : 80;
    const visualCenter = (container.clientHeight - chromeHeight) / 2;
    
    // Fine-tune target: slight offset upward for better visual balance
    const targetScroll = Math.max(0, groupCenter - visualCenter - 15);
    
    const startScroll = container.scrollTop;
    const distance = targetScroll - startScroll;
    const duration = settings.scrollSpeed || 400; // ms
    const startTime = performance.now();

    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // easeOutCubic
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      container.scrollTop = startScroll + distance * easedProgress;

      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      }
    };

    requestAnimationFrame(animateScroll);
  }, [activeVerseIndex, settings.scrollSpeed, settings.textSize, settings.textSpacing, settings.verseCount, settings.maxWidth, settings.oneVersePerLine, settings.showVerseNumbers, verses, appMode]);

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
      
      // If already has selection, don't expand
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
      
      while (startNode && startNode.nodeType !== Node.TEXT_NODE && startNode.firstChild) {
        startNode = startNode.firstChild;
      }

      if (startNode && startNode.nodeType === Node.TEXT_NODE) {
        const text = startNode.textContent || "";
        let s = startOffset;
        let e = startOffset;
        
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
      if (!skipSync) {
        setTimeout(() => syncStateToStorage({ index: stateRef.current.activeVerseIndex, forceDomRead: true }), 100);
      }
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
    span.style.margin = '0 -2px';
    span.style.borderRadius = type === 'circle' ? '999px' : '4px';
    (span.style as any).boxDecorationBreak = 'clone';
    (span.style as any).WebkitBoxDecorationBreak = 'clone';
    
    try {
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
      selection.removeAllRanges();
      if (!skipSync) {
        setTimeout(() => syncStateToStorage({ index: stateRef.current.activeVerseIndex, forceDomRead: true }), 100);
      }
    } catch (e) {}
  }, [syncStateToStorage]);

  const applyEraser = useCallback((skipSync = false) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0).cloneRange();
    const container = containerRef.current;
    if (!container) return;

    const isMarkupNode = (node: Node): boolean => {
      if (node.nodeType !== Node.ELEMENT_NODE) return false;
      const el = node as HTMLElement;
      if (el.getAttribute('contenteditable') === 'false' || el.contentEditable === 'false') return false;
      if (el.classList.contains('select-none')) return false;
      if (el.id && el.id.startsWith('verse-')) return false;
      if (el.getAttribute('data-verse-index') !== null) return false;
      const tag = el.tagName.toUpperCase();
      const style = el.getAttribute('style') || '';
      if (['B', 'I', 'U', 'STRONG', 'EM', 'MARK', 'FONT', 'STRIKE', 'SPAN'].includes(tag)) {
        if (style.length > 0 || el.classList.contains('verse-markup') || tag !== 'SPAN') return true;
      }
      return el.classList.contains('verse-markup');
    };

    const stripNode = (node: Node): Node | DocumentFragment => {
      if (node.nodeType === Node.TEXT_NODE) return node.cloneNode(true);
      const frag = document.createDocumentFragment();
      Array.from(node.childNodes).forEach(child => frag.appendChild(stripNode(child)));
      if (isMarkupNode(node)) return frag;
      const clone = node.cloneNode(false) as HTMLElement;
      clone.appendChild(frag);
      return clone;
    };

    try {
      const selectedFragment = range.cloneContents();
      const cleanFrag = document.createDocumentFragment();
      Array.from(selectedFragment.childNodes).forEach(child => cleanFrag.appendChild(stripNode(child)));
      const firstInserted = cleanFrag.firstChild;
      const lastInserted = cleanFrag.lastChild;
      range.deleteContents();
      range.insertNode(cleanFrag);
      if (firstInserted && lastInserted) {
        const newRange = document.createRange();
        newRange.setStartBefore(firstInserted);
        newRange.setEndAfter(lastInserted);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    } catch (e) {}
    if (!skipSync) {
      setTimeout(() => syncStateToStorage({ forceDomRead: true }), 100);
    }
  }, [syncStateToStorage]);

  const clearFormatting = useCallback(() => {
    applyEraser();
  }, [applyEraser]);

  const applyMarkup = useCallback((toolOverride?: { type: string; value: string | null }) => {
    const tool = toolOverride || activeTool;
    if (!tool) return;
    const selection = window.getSelection();
    if (!selection) return;

    if (selection.isCollapsed) {
      expandSelectionToWords(selection);
    }

    const freshSelection = window.getSelection();
    if (!freshSelection || freshSelection.rangeCount === 0) return;
    
    const isEraser = tool.type === 'eraser';
    const hasSelection = freshSelection.toString().length > 0;
    if (!isEraser && !hasSelection) return;

    const range = freshSelection.getRangeAt(0);
    const container = containerRef.current;
    if (!container) return;

    // Collect involved verses and their sub-ranges FIRST
    const allVerses = Array.from(container.querySelectorAll('[id^="verse-"]'));
    const verseTasks: { el: HTMLElement, startContainer: Node, startOffset: number, endContainer: Node, endOffset: number }[] = [];
    
    const startContainer = range.startContainer;
    const startOffset = range.startOffset;
    const endContainer = range.endContainer;
    const endOffset = range.endOffset;

    allVerses.forEach(v => {
      if (range.intersectsNode(v)) {
        const el = v as HTMLElement;
        let vStartNode: Node = el, vStartOff = 0, vEndNode: Node = el, vEndOff = el.childNodes.length;

        if (el.contains(startContainer)) {
          vStartNode = startContainer;
          vStartOff = startOffset;
        } else {
          vStartNode = el;
          vStartOff = 0;
        }

        if (el.contains(endContainer)) {
          vEndNode = endContainer;
          vEndOff = endOffset;
        } else {
          vEndNode = el;
          vEndOff = el.childNodes.length;
        }

        verseTasks.push({ el, startContainer: vStartNode, startOffset: vStartOff, endContainer: vEndNode, endOffset: vEndOff });
      }
    });

    if (verseTasks.length > 1) {
      verseTasks.forEach(task => {
        try {
          const vRange = document.createRange();
          vRange.setStart(task.startContainer, task.startOffset);
          vRange.setEnd(task.endContainer, task.endOffset);

          if (!vRange.collapsed) {
            const sel = window.getSelection();
            if (sel) {
              sel.removeAllRanges();
              sel.addRange(vRange);
              
              if (isEraser) applyEraser(true);
              else if (tool.type === 'underlineColor') applyUnderline(activeMarkupColor, true);
              else if (tool.type === 'circle') applyShape('circle', activeMarkupColor, true);
              else if (tool.type === 'box') applyShape('box', activeMarkupColor, true);
              else {
                const { type, value } = tool;
                const finalValue = (type === 'foreColor' || type === 'backColor') ? (value || activeMarkupColor) : value;
                applyFormat(type, finalValue, true);
              }
            }
          }
        } catch (e) { console.warn("Verse task failed", e); }
      });
      
      window.getSelection()?.removeAllRanges();
      const finalRange = document.createRange();
      finalRange.setStartBefore(verseTasks[0].el);
      finalRange.setEndAfter(verseTasks[verseTasks.length - 1].el);
      window.getSelection()?.addRange(finalRange);
      
      setTimeout(() => syncStateToStorage({ forceDomRead: true }), 200);
      return;
    }

    const node = freshSelection.anchorNode;
    if (!node) return;
    
    let isInsideEditable = false;
    let curr: Node | null = node;
    while (curr && curr !== document.body) {
      if (curr === containerRef.current) { isInsideEditable = true; break; }
      curr = curr.parentNode;
    }
    
    if (isInsideEditable) {
      if (isEraser) clearFormatting();
      else if (tool.type === 'underlineColor') applyUnderline(activeMarkupColor);
      else if (tool.type === 'circle') applyShape('circle', activeMarkupColor);
      else if (tool.type === 'box') applyShape('box', activeMarkupColor);
      else {
        const { type, value } = tool;
        const finalValue = (type === 'foreColor' || type === 'backColor') ? (value || activeMarkupColor) : value;
        applyFormat(type, finalValue);
      }
    }
  }, [activeMarkupColor, activeTool, applyFormat, applyUnderline, applyEraser, applyShape, clearFormatting, expandSelectionToWords, syncStateToStorage]);

  const applyActiveTool = useCallback(() => {
    applyMarkup();
  }, [applyMarkup]);

  const hexToRgba = useCallback((hex: string, intensity: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${intensity})`;
  }, []);

  const toggleTool = useCallback((type: string, value: string | null = null) => {
    if (activeTool && activeTool.type === type && activeTool.value === value) {
      setActiveTool(null);
    } else {
      const newTool = { type, value };
      setActiveTool(newTool);
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        applyMarkup(newTool);
      }
    }
  }, [activeTool, applyMarkup]);

  const clearAllFormatting = useCallback(() => {
    if (!window.confirm("Clear all markup and formatting from the current passage?")) return;
    
    const container = containerRef.current;
    if (!container) return;
    const isRtl = stateRef.current.translation === 'wlc';

    // Step 1: Compute clean verses from live DOM
    const cleanVerses = stateRef.current.verses.map((v, i) => {
      const liveNode = container.querySelector(`#verse-${i}`) as HTMLElement;
      const currentHtml = (liveNode ? liveNode.innerHTML : (v.html || v.text || ""))
        .replace(/\u200E/g, '');
      const tmp = document.createElement('div');
      tmp.innerHTML = currentHtml;
      return { ...v, html: tmp.textContent ?? tmp.innerText ?? v.text ?? "" };
    });

    // Step 2: Write directly to DOM — don't wait for React's render cycle
    cleanVerses.forEach((v, i) => {
      const el = container.querySelector(`#verse-${i}`) as HTMLElement;
      if (el) el.innerHTML = (v.html || v.text || "") + (isRtl ? '' : '\u200E');
    });

    // Step 3: Sync React state and force remount
    setVerses(cleanVerses);
    setResetKey(prev => prev + 1);

    // Step 4: Persist — this was the missing call
    syncStateToStorage({ verses: cleanVerses, index: stateRef.current.activeVerseIndex });
  }, [setVerses, stateRef, syncStateToStorage]);

  const getActiveReference = useCallback(() => {
    if (!verses.length) return "";
    
    const getFullRef = (ref: string) => {
      if (!ref) return "";
      const normalizedRef = ref.replace(/\./g, '');
      const parts = normalizedRef.split(' ');
      if (parts.length < 2) return ref;
      
      const possibleBook = parts[0].toLowerCase();
      let bookKey = possibleBook;
      let chapterVerse = parts[1];
      
      if (/^[1-3]$/.test(possibleBook) && parts.length > 2) {
        bookKey = `${parts[0]} ${parts[1]}`.toLowerCase();
        chapterVerse = parts[2];
      }
      
      const bookId = BOOK_IDS[bookKey];
      if (bookId && CANONICAL_BOOKS[bookId]) {
        return `${CANONICAL_BOOKS[bookId]} ${chapterVerse}`;
      }
      return ref;
    };

    const first = verses[activeVerseIndex];
    const lastIdx = Math.min(activeVerseIndex + settings.verseCount - 1, verses.length - 1);
    const last = verses[lastIdx];
    
    const rawFirst = getFullRef(first.reference);
    const rawLast = getFullRef(last.reference);

    if (first.id === last.id) return formatReference(rawFirst);
    
    const firstParts = rawFirst.split(':');
    const lastParts = rawLast.split(':');
    
    let combined;
    if (firstParts[0] === lastParts[0] && firstParts.length > 1 && lastParts.length > 1) {
       combined = `${rawFirst}-${lastParts[1]}`;
    } else {
       combined = `${rawFirst} - ${rawLast}`;
    }
    return formatReference(combined);
  }, [activeVerseIndex, settings.verseCount, verses]);

  const fetchWithTimeout = useCallback(async (url: string, options: RequestInit = {}, timeout = 6000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }, []);

  const resetPassage = useCallback(() => {
    const emptyVerses: Verse[] = [];
    setVerses(emptyVerses);
    setActiveVerseIndex(0);
    setResetKey(prev => prev + 1);
    syncStateToStorage({ index: 0, verses: emptyVerses, forceDomRead: true });
  }, [syncStateToStorage]);

  const handleCustomTextSubmit = useCallback((e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customTextValue.trim()) return;

    // Split text into paragraphs/lines and treat them as verses
    const lines = customTextValue.split(/\n+/).filter(l => l.trim().length > 0);
    const newVerses: Verse[] = lines.map((line, idx) => ({
      id: `custom-${Date.now()}-${idx}`,
      reference: `Segment ${idx + 1}`,
      text: line.trim(),
      isNewPassage: idx === 0
    }));

    setVerses(newVerses);
    setActiveVerseIndex(0);
    setAppMode('control');
    setShowCustomTextModal(false);
    setCustomTextValue("");
    
    // Use setTimeout to ensure state is committed before DOM read sync
    setTimeout(() => syncStateToStorage({ 
      index: 0, 
      verses: newVerses, 
      forceDomRead: false 
    }), 200);
  }, [customTextValue, syncStateToStorage]);

  const fetchBiblePassage = useCallback(async (isAppend = false, overrideRef?: string, overrideTrans?: string) => {
    let refQuery = (overrideRef || referenceInput).trim();
    if (!refQuery) return;
    
    // Auto-complete book name to chapter 1 if only book is provided
    try {
      const lowerQuery = refQuery.toLowerCase().replace(/\./g, '');
      if (BOOK_IDS[lowerQuery]) {
        refQuery = `${CANONICAL_BOOKS[BOOK_IDS[lowerQuery]]} 1`;
        setReferenceInput(refQuery);
      }
    } catch (e) {
      console.warn("Reference normalization failed", e);
    }
    
    setIsLoading(true);
    setFetchError(null);
    const activeTrans = overrideTrans || translation;
    
    try {
      let fetchedVersesRaw: {id: string, reference: string, text: string, html?: string}[] = [];
      const getCanonicalBookName = (refStr: string) => {
        const lastColonIdx = refStr.lastIndexOf(':');
        const bookChap = lastColonIdx === -1 ? refStr : refStr.substring(0, lastColonIdx).trim();
        const lastSpaceIdx = bookChap.lastIndexOf(' ');
        const bookPart = lastSpaceIdx === -1 ? bookChap : bookChap.substring(0, lastSpaceIdx).trim();
        const bookId = BOOK_IDS[bookPart.toLowerCase().replace(/\./g, '').trim()];
        if (bookId && CANONICAL_BOOKS[bookId]) return CANONICAL_BOOKS[bookId];
        return bookPart.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      };

      const getBookNameFromRef = (refStr: string) => {
        const lastColonIdx = refStr.lastIndexOf(':');
        if (lastColonIdx === -1) return refStr;
        const bookChap = refStr.substring(0, lastColonIdx).trim();
        const lastSpaceIdx = bookChap.lastIndexOf(' ');
        if (lastSpaceIdx === -1) return bookChap;
        return bookChap.substring(0, lastSpaceIdx).trim();
      };
      
      const getChapterRange = (ref: string) => {
        const parts = ref.split(' ');
        const range = parts[parts.length - 1];
        const book = parts.slice(0, parts.length - 1).join(' ');
        return { book, range };
      };

      const { book: rawBook, range: rawRange } = getChapterRange(refQuery);
      const canonicalBook = getCanonicalBookName(rawBook);
      // headerName includes the chapter range, currentBookName is just the book
      const headerName = formatReference(`${canonicalBook} ${rawRange}`);
      const currentBookName = canonicalBook; 
      const isBookStart = refQuery.toLowerCase().includes(' 1:1') || refQuery.toLowerCase().includes(' 1:1-');

      if (activeTrans === 'esv') {
        if (!esvApiKey) throw new Error("Please enter a free API key from api.esv.org.");
        const res = await fetchWithTimeout(`https://api.esv.org/v3/passage/text/?q=${encodeURIComponent(refQuery)}&include-passage-references=false&include-footnotes=false&include-headings=false&include-short-copyright=false`, {
          headers: { 'Authorization': `Token ${esvApiKey}` }
        });
        if (!res.ok) throw new Error("Invalid ESV API Key or request.");
        const data = await res.json();
        if (data.passages && data.passages.length > 0) {
          const cleanText = data.passages[0].replace(/\(ESV\)/g, '').replace(/\n/g, ' ').trim();
          const verseMatches = Array.from(cleanText.matchAll(/\[(\d+)\]\s*(.*?)(?=\s*\[\d+\]|$)/g));
          const chapterMatch = data.canonical.match(/(\d+):/);
          const currentChapter = chapterMatch ? chapterMatch[1] : (data.canonical.match(/(\d+)$/) ? data.canonical.match(/(\d+)$/)[1] : "1");
          if (verseMatches.length > 0) {
            fetchedVersesRaw = verseMatches.map((m: any) => ({
              id: `esv-${m[1]}-${Math.random().toString(36).substr(2, 5)}`, reference: formatReference(`${currentBookName} ${currentChapter}:${m[1]}`), text: m[2].trim()
            }));
          } else {
            fetchedVersesRaw = [{ id: `esv-1-${Math.random().toString(36).substr(2, 5)}`, reference: formatReference(data.canonical), text: cleanText }];
          }
        } else throw new Error("Passage not found.");

      } else if (activeTrans === 'net') {
        const targetUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(refQuery)}&type=json`;
        let textData = null;
        try {
          const res = await fetchWithTimeout(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`);
          if (res.ok) textData = await res.text(); else throw new Error();
        } catch (err1) {
          const res = await fetchWithTimeout(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`);
          if (res.ok) { const proxyData = await res.json(); textData = proxyData.contents; }
          else throw new Error("Network/Proxy connection failed.");
        }
        const jsonData = JSON.parse(textData!);
        if (Array.isArray(jsonData) && jsonData.length > 0) {
          fetchedVersesRaw = jsonData.map((v: any) => ({
            id: `net-${v.bookname}-${v.chapter}-${v.verse}-${Math.random().toString(36).substr(2, 5)}`,
            reference: formatReference(`${currentBookName} ${v.chapter}:${v.verse}`),
            text: v.text.replace(/<[^>]+>/g, '').trim()
          }));
        } else throw new Error("Passage not found.");

      } else if (['wlc', 'lxx', 'clementine', 'tr'].includes(activeTrans)) {
        let bookChap: string;
        let versePart: string | null = null;
        
        const colonIdx = refQuery.lastIndexOf(':');
        if (colonIdx === -1) {
          // No colon, assume whole chapter. E.g., "Judges 1"
          bookChap = refQuery.trim();
          versePart = null;
        } else {
          bookChap = refQuery.substring(0, colonIdx).trim();
          versePart = refQuery.substring(colonIdx + 1).trim();
        }

        const lastSpaceIdx = bookChap.lastIndexOf(' ');
        if (lastSpaceIdx === -1) throw new Error("Parse error.");
        let bookNameRaw = bookChap.substring(0, lastSpaceIdx).trim().toLowerCase().replace(/\./g, '');
        const chapterNum = parseInt(bookChap.substring(lastSpaceIdx + 1), 10);
        const bookId = BOOK_IDS[bookNameRaw];
        if (!bookId) throw new Error(`Book '${bookNameRaw}' not recognized.`);

        let bollsTrans = activeTrans.toUpperCase();
        if (activeTrans === 'clementine') bollsTrans = 'VULG';
        const bollsUrl = `https://bolls.life/get-text/${bollsTrans}/${bookId}/${chapterNum}/`;
        let verseData;
        try {
          const res = await fetchWithTimeout(bollsUrl);
          if (res.ok) verseData = await res.json(); else throw new Error();
        } catch (e) {
          const proxyRes = await fetchWithTimeout(`https://api.allorigins.win/get?url=${encodeURIComponent(bollsUrl)}`);
          const proxyData = await proxyRes.json();
          verseData = JSON.parse(proxyData.contents);
        }
        
        let filtered;
        if (versePart) {
          let startV: number, endV: number;
          if (versePart.includes('-')) {
            const parts = versePart.split('-');
            startV = parseInt(parts[0], 10); endV = parseInt(parts[1], 10);
          } else { startV = parseInt(versePart, 10); endV = startV; }
          filtered = verseData.filter((v: any) => v.verse >= startV && v.verse <= endV);
        } else {
          filtered = verseData;
        }

        fetchedVersesRaw = filtered.map((v: any) => ({
          id: `${activeTrans}-${bookId}-${chapterNum}-${v.verse}-${Math.random().toString(36).substr(2, 5)}`,
          reference: formatReference(`${currentBookName} ${chapterNum}:${v.verse}`),
          text: v.text.replace(/<[^>]+>/g, '').trim()
        }));

      } else if (activeTrans === 'sblgnt') {
        const bookChapPart = refQuery.includes(':') ? refQuery.substring(0, refQuery.lastIndexOf(':')) : refQuery;
        const lastSpaceIdx = bookChapPart.lastIndexOf(' ');
        const bookNameRaw = bookChapPart.substring(0, lastSpaceIdx).toLowerCase().replace(/\./g, '').trim();
        const bookId = BOOK_IDS[bookNameRaw];
        
        const bookMap: Record<number, string> = {
          40: 'MAT', 41: 'MRK', 42: 'LUK', 43: 'JHN', 44: 'ACT', 45: 'ROM', 46: '1CO', 47: '2CO', 48: 'GAL', 49: 'EPH',
          50: 'PHP', 51: 'COL', 52: '1TH', 53: '2TH', 54: '1TI', 55: '2TI', 56: 'TIT', 57: 'PHM', 58: 'HEB', 59: 'JAS',
          60: '1PE', 61: '2PE', 62: '1JN', 63: '2JN', 64: '3JN', 65: 'JUD', 66: 'REV'
        };
        const absBook = bookMap[bookId || 0];
        if (!absBook) throw new Error(`SBLGNT only supports New Testament books.`);
        
        const chapterNum = bookChapPart.substring(lastSpaceIdx + 1);
        const helloaoUrl = `https://bible.helloao.org/api/grc_sbl/${absBook}/${chapterNum}.json`;
        
        const res = await fetchWithTimeout(helloaoUrl);
        if (!res.ok) throw new Error(`Fetch failed from helloao.org for SBLGNT.`);
        const data = await res.json();
        
        if (data.chapter && data.chapter.content) {
          const content = data.chapter.content;
          const versesArray: {id: string, reference: string, text: string}[] = [];

          content.forEach((item: any) => {
            if (item.type === 'verse') {
              const verseText = item.content.map((c: any) => {
                if (typeof c === 'string') return c;
                return "";
              }).join('').trim();

              versesArray.push({
                id: `helloao-${activeTrans}-${absBook}-${chapterNum}-${item.number}`,
                reference: formatReference(`${currentBookName} ${chapterNum}:${item.number}`),
                text: verseText
              });
            }
          });

          const versePart = refQuery.includes(':') ? refQuery.split(':')[1] : null;
          if (versePart) {
            let startV: number, endV: number;
            if (versePart.includes('-')) {
              const parts = versePart.split('-');
              startV = parseInt(parts[0], 10); endV = parseInt(parts[1], 10);
            } else { startV = parseInt(versePart, 10); endV = startV; }
            fetchedVersesRaw = versesArray.filter(v => {
              const vNum = parseInt(v.reference.split(':').pop() || "0");
              return vNum >= startV && vNum <= endV;
            });
          } else {
            fetchedVersesRaw = versesArray;
          }
        } else throw new Error(`Could not parse ${activeTrans.toUpperCase()} content from helloao.org.`);

      } else {
        // Standard translations (WEB, KJV, BBE, etc.) via bible-api.com
        // Check for chapter range like "Genesis 1-2"
        const rangeMatch = refQuery.match(/^(.+?)\s+(\d+)-(\d+)$/);
        if (rangeMatch && !refQuery.includes(':')) {
          const bookName = rangeMatch[1];
          const startChap = parseInt(rangeMatch[2], 10);
          const endChap = parseInt(rangeMatch[3], 10);
          
          let allVerses: any[] = [];
          for (let c = startChap; c <= endChap; c++) {
            const res = await fetchWithTimeout(`https://bible-api.com/${encodeURIComponent(bookName + ' ' + c)}?translation=${activeTrans}`);
            const data = await res.json();
            if (data.verses) {
              allVerses = [...allVerses, ...data.verses];
            }
          }
          if (allVerses.length > 0) {
            fetchedVersesRaw = allVerses.map((v: any) => ({
              id: `${v.book_id}-${v.chapter}-${v.verse}-${Math.random().toString(36).substr(2, 5)}`,
              reference: formatReference(`${currentBookName} ${v.chapter}:${v.verse}`),
              text: v.text.replace(/\n/g, ' ').trim()
            }));
          } else throw new Error("Passage range not found.");
        } else {
          const res = await fetchWithTimeout(`https://bible-api.com/${encodeURIComponent(refQuery)}?translation=${activeTrans}`);
          const data = await res.json();
          if (data.verses && data.verses.length > 0) {
            fetchedVersesRaw = data.verses.map((v: any) => ({
              id: `${v.book_id}-${v.chapter}-${v.verse}-${Math.random().toString(36).substr(2, 5)}`,
              reference: formatReference(`${currentBookName} ${v.chapter}:${v.verse}`),
              text: v.text.replace(/\n/g, ' ').trim()
            }));
          } else throw new Error("Passage not found.");
        }
      }

      if (fetchedVersesRaw.length === 0) throw new Error("Could not find passage.");

      const lastBookName = verses.length > 0 ? getBookNameFromRef(verses[verses.length - 1].reference) : null;
      let needsHeader = !isAppend || currentBookName !== lastBookName || isBookStart;

      const fetchedVerses: Verse[] = fetchedVersesRaw.map((v, i) => {
        const currentRef = v.reference;
        const prevRef = i > 0 ? fetchedVersesRaw[i-1].reference : (isAppend && verses.length > 0 ? verses[verses.length-1].reference : null);
        
        let text = v.text;
        let html = v.html;
        let acrostic = undefined;
        
        // Robust regex to match markers like (Aleph) א, [Aleph] א, or א (Aleph)
        const acrosticRegex = /([(\[][A-Za-z\s]+[)\]]\s*[\u0590-\u05FF][\.:]?|[\u0590-\u05FF][\.:]?\s*[(\[][A-Za-z\s]+[)\]])/;
        const acrosticMatch = text.match(acrosticRegex);
        
        if (acrosticMatch) {
          acrostic = acrosticMatch[0].trim();
          text = text.replace(acrosticMatch[0], '').replace(/\s+/g, ' ').trim();
          if (html) {
            html = html.replace(acrosticMatch[0], '').replace(/\s+/g, ' ').trim();
          }
        }

        const getChapter = (ref: string) => {
          const parts = ref.split(' ');
          const lastPart = parts[parts.length - 1];
          return lastPart.split(':')[0];
        };

        const currentChapter = getChapter(currentRef);
        const prevChapter = prevRef ? getChapter(prevRef) : null;
        const isChapterChange = prevChapter && currentChapter !== prevChapter;

        return {
          ...v,
          text,
          html,
          acrostic,
          bookHeader: (i === 0 && needsHeader) ? headerName : undefined,
          isNewPassage: (i === 0 && isAppend) ? true : false,
          isNewChapter: !!isChapterChange
        };
      });

      const finalVerses = isAppend ? [...verses, ...fetchedVerses] : fetchedVerses;
      
      setVerses(finalVerses);
      if (!isAppend || verses.length === 0) {
        setActiveVerseIndex(0);
        syncStateToStorage({ index: 0, verses: finalVerses, forceDomRead: false });
      } else {
        syncStateToStorage({ index: activeVerseIndex, verses: finalVerses, forceDomRead: false });
      }
    } catch (err: any) {
      setFetchError(err.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [activeVerseIndex, esvApiKey, fetchWithTimeout, referenceInput, settings.defaultTranslation, syncStateToStorage, translation, verses]);

  const activeFont = React.useMemo(() => FONT_OPTIONS.find(f => f.id === settings.fontFamily) || FONT_OPTIONS[0], [settings.fontFamily]);

  if (appMode === 'select') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} 
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8"
        >
          {/* Header */}
          <div className="md:col-span-2 text-center mb-8">
            <h1 className="text-5xl font-display font-black tracking-tighter uppercase italic mb-2">
              ScriptureGlide
            </h1>
            <p className="text-slate-400 text-sm tracking-[0.2em] font-medium uppercase">Select Operation Mode</p>
          </div>

          {/* Mode 1: Single Monitor */}
          <button 
            onClick={() => {
              setDisplayMode('single');
              setAppMode('control');
              localStorage.setItem('osb_display_mode', 'single');
            }}
            className="group relative bg-slate-900 border border-slate-800 p-12 rounded-3xl text-left transition-all hover:bg-slate-800/50 hover:border-amber-500/50 hover:-translate-y-2 overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Monitor size={120} />
            </div>
            <div className="w-12 h-12 bg-amber-500/20 text-amber-500 rounded-xl flex items-center justify-center mb-6">
              <Monitor size={24} />
            </div>
            <h2 className="text-2xl font-bold mb-4">Single Monitor</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-8">
              Classic mode. Controls and presentation live in one window. Perfect for personal study or screen recording.
            </p>
            <div className="flex items-center text-amber-500 text-xs font-bold uppercase tracking-widest gap-2">
              Start Session <ArrowRight size={14} />
            </div>
          </button>

          {/* Mode 2: Multiple Monitor */}
          <button 
            onClick={() => {
              setDisplayMode('dual');
              setAppMode('control');
              localStorage.setItem('osb_display_mode', 'dual');
            }}
            className="group relative bg-slate-900 border border-slate-800 p-12 rounded-3xl text-left transition-all hover:bg-slate-800/50 hover:border-amber-500/50 hover:-translate-y-2 overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Tv size={120} />
            </div>
            <div className="w-12 h-12 bg-amber-500/20 text-amber-500 rounded-xl flex items-center justify-center mb-6">
              <ScreenShare size={24} />
            </div>
            <h2 className="text-2xl font-bold mb-4">Multiple Monitors</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-8">
              Professional mode. Tools stay on your monitor while the scripture displays full-screen on the secondary display.
            </p>
            <div className="flex items-center text-amber-500 text-xs font-bold uppercase tracking-widest gap-2">
              Setup Presentation <ArrowRight size={14} />
            </div>
          </button>
        </motion.div>
      </div>
    );
  }

  if (appMode === 'present') {
    return (
      <div 
        ref={containerRef}
        key={`present-${verses.length}`}
        className="h-screen overflow-y-auto no-scrollbar relative flex flex-col transition-colors duration-500 group/present"
        dir={translation === 'wlc' ? 'rtl' : 'ltr'}
        style={{ backgroundColor: settings.pageColor, fontFamily: activeFont.css, color: settings.theme === 'dark' ? '#f8fafc' : '#0f172a' }}
      >
        {/* Windowed Mode Button */}
        {isTauriApp && (
          <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 opacity-0 group-hover/present:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                getCurrentWindow().setFullscreen(false);
                getCurrentWindow().setDecorations(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-black/20 hover:bg-black/40 text-white rounded-full backdrop-blur-sm border border-white/10 transition-all"
            >
              <Monitor size={18} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Windowed Mode</span>
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (isTauriApp) {
                  // Use the invoke to close the specific presentation window label
                  await invoke('close_presentation_window');
                  // If we are the main window (single monitor mode), we also need to switch state
                  if (new URLSearchParams(window.location.search).get('view') !== 'presentation') {
                    setAppMode('control');
                    const win = getCurrentWindow();
                    await win.setFullscreen(false);
                    await win.setDecorations(true);
                  }
                } else {
                  setAppMode('control');
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-white rounded-full backdrop-blur-sm border border-red-500/30 transition-all active:scale-95"
            >
              <XCircle size={18} className="text-red-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Exit Presentation</span>
            </button>
          </div>
        )}

        <div className="h-[20vh] flex-shrink-0" />
        <div 
          className={`mx-auto w-full transition-all duration-300 px-6 md:px-12 lg:px-16 ${settings.oneVersePerLine ? 'flex flex-col gap-12' : 'text-start tracking-wide'}`}
          style={{ 
            fontSize: `${settings.textSize}px`, 
            lineHeight: settings.textSpacing, 
            maxWidth: `${settings.maxWidth}px`,
            paddingBottom: '20vh'
          }}
        >
          {verses.map((verse, index) => {
            const fullRef = verse.reference.split(' ').pop() || '';
            const verseNumber = (index === 0 || verse.isNewChapter || verse.isNewPassage) ? fullRef : (fullRef.split(':')[1] || fullRef);
            const isActive = index >= activeVerseIndex && index < activeVerseIndex + settings.verseCount;
            const isRtl = translation === 'wlc';

            return (
              <React.Fragment key={verse.id}>
                {verse.bookHeader && (
                  <div className="w-full text-center py-16 md:py-24 opacity-40 select-none">
                    <h2 className="text-8xl md:text-9xl font-bold uppercase tracking-widest break-words" style={{ fontFamily: activeFont.css }}>
                      {verse.bookHeader}
                    </h2>
                  </div>
                )}
                {(verse.isNewPassage || verse.isNewChapter) && <div className="h-12 w-full" />}
                <div 
                  id={`ref-${index}`}
                  className={`${settings.oneVersePerLine || verse.isNewChapter || verse.acrostic ? 'flex flex-col items-start w-full' : 'inline'}`}
                  style={{ unicodeBidi: 'plaintext' }}
                  data-verse-index={index}
                >
                  {verse.acrostic && (
                    <div className="w-full opacity-30 text-[0.45em] tracking-[0.3em] uppercase italic mb-1 flex items-center gap-4" style={{ fontFamily: activeFont.css }}>
                      {verse.acrostic}
                      <div className="h-px flex-1 bg-current opacity-20" />
                    </div>
                  )}
                  <div className={`${settings.oneVersePerLine || verse.isNewChapter || verse.acrostic ? 'flex gap-6 items-start w-full' : 'inline'}`}>
                    {settings.showVerseNumbers && (
                      <span
                        className={`text-[0.6em] select-none mr-2 transition-all ${isActive ? 'opacity-40' : 'opacity-10 blur-[2px]'} ${settings.oneVersePerLine || verse.isNewChapter || verse.isNewPassage || verse.acrostic ? 'mt-3 flex-shrink-0' : 'inline-block align-top mt-1'}`}
                        style={{ color: settings.verseNumberColor, fontFamily: activeFont.css }}
                      >
                        {verseNumber}
                      </span>
                    )}                    <span
                      id={isActive ? `verse-${index}` : `present-verse-${index}`}
                      className={`transition-all outline-none leading-relaxed ${isActive ? '' : 'opacity-20 blur-[2px]'}`}
                      style={{ transitionDuration: `${settings.scrollSpeed}ms` }}
                      dangerouslySetInnerHTML={{ __html: (verse.html || verse.text) + (isRtl ? '' : '\u200E') }}
                    />
                  </div>
                  {!(settings.oneVersePerLine || verse.isNewChapter || verse.acrostic) && <span className="inline"> </span>}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        <AnimatePresence>
          {verses.length > 0 && settings.showReferenceBox && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
            >
              <div 
                className="px-8 py-3 rounded-lg shadow-2xl tracking-widest whitespace-nowrap uppercase font-display font-bold ring-1 ring-amber-500/30" 
                style={{ 
                  fontSize: `${Math.max(settings.textSize * 0.45, 14)}px`,
                  backgroundColor: settings.referenceBoxColor || (settings.theme === 'dark' ? 'rgba(248, 250, 252, 0.95)' : 'rgba(15, 23, 42, 0.95)'),
                  color: (settings.referenceBoxColor && !settings.referenceBoxColor.startsWith('rgba(15')) ? (parseInt(settings.referenceBoxColor.replace('#',''), 16) > 0xffffff/2 ? '#0f172a' : '#f8fafc') : (settings.theme === 'dark' ? '#0f172a' : '#f8fafc'),
                  backdropFilter: 'blur(12px)'
                }}
              >
                {getActiveReference()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div 
      className={`h-screen flex flex-col transition-colors duration-500 overflow-hidden relative selection:bg-blue-300/40 dark:selection:bg-blue-900/50`}
      style={{ 
        backgroundColor: settings.pageColor,
        fontFamily: activeFont.css
      }}
    >
      <AnimatePresence>
      </AnimatePresence>

      <AnimatePresence>
        {showCustomTextModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`w-full max-w-2xl ${uiBg} border ${uiBorder} rounded-[2.5rem] shadow-2xl p-8 overflow-hidden`}
            >
              <form onSubmit={handleCustomTextSubmit} className="flex flex-col gap-6">
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-500 mb-1">External Data</span>
                    <h3 className={`text-2xl ${uiText} font-display font-black italic uppercase tracking-tighter`}>Paste Content</h3>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setShowCustomTextModal(false)} 
                    className={`w-10 h-10 flex items-center justify-center rounded-full ${uiBtnBg} ${uiTextMuted} hover:text-amber-500 transition-colors`}
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <p className={`text-xs ${uiTextMuted} leading-relaxed`}>
                    Paste your quotes, sermons, or arbitrary text below. Each paragraph will be treated as an interactive segment for markup.
                  </p>
                  <textarea 
                    autoFocus
                    value={customTextValue}
                    onChange={(e) => setCustomTextValue(e.target.value)}
                    placeholder="Type or paste your text here..."
                    className={`w-full h-64 ${uiTheme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-50'} border-2 ${uiBorder} rounded-2xl p-6 ${uiText} text-lg focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all resize-none placeholder:text-slate-600`}
                  />
                </div>

                <div className="flex gap-4 pt-2">
                  <button 
                    type="button"
                    onClick={() => setShowCustomTextModal(false)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl text-sm transition-all active:scale-95 uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] bg-amber-600 hover:bg-amber-500 text-white font-bold py-4 rounded-2xl text-sm uppercase tracking-[0.2em] transition-all shadow-lg shadow-amber-900/30 active:scale-95"
                  >
                    Import Content
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {appMode === 'control' && !readingMode && (
          <motion.div 
            key="control-header"
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="w-full z-[70] font-sans flex-shrink-0 relative"
          >
            <div className={`${uiBg} ${uiText} min-h-[3.5rem] h-auto border-b ${uiBorder} p-2 md:px-4 flex flex-col md:flex-row justify-between items-center gap-3 shadow-lg relative z-[70]`}>
            <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
                <button 
                  onClick={() => {
                    setAppMode('select');
                    localStorage.setItem('osb_mode', 'select');
                  }}
                  className={`p-2 ${uiBtnHover} rounded-lg ${uiTextMuted} hover:text-amber-500 transition-colors`}
                  title="Back to Welcome Screen"
                >
                  <RotateCcw size={18} />
                </button>
                <div className={`w-px h-6 ${uiTheme === 'dark' ? 'bg-slate-700' : 'bg-slate-200'} mx-1`} />
                <h1 className="text-lg font-display font-bold tracking-tight hidden lg:block whitespace-nowrap uppercase">
                  ScriptureGlide
                </h1>
                {displayMode === 'dual' && (
                  <button 
                    onClick={togglePresentation}
                    className={`flex items-center gap-2 px-3 py-1 border rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all hover:scale-105 ${
                      isPresenting 
                        ? 'bg-red-600/20 text-red-500 border-red-500/30 hover:bg-red-600/30' 
                        : 'bg-amber-600/20 text-amber-500 border-amber-500/30 hover:bg-amber-600/30'
                    }`}
                  >
                    <Tv size={12} /> {isPresenting ? 'Exit Presentation' : 'Present'}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap justify-center items-center gap-2 w-full lg:w-auto">
                <button 
                  onClick={saveStudy}
                  className={`p-2 ${uiBtnBg} border ${uiBorder} rounded-lg ${uiTextMuted} hover:text-amber-500 ${uiBtnHover} transition-all flex items-center justify-center`}
                  title="Save Passage Markup (.glide)"
                >
                  <Save size={18} />
                </button>
                <button 
                  onClick={loadStudy}
                  className={`p-2 ${uiBtnBg} border ${uiBorder} rounded-lg ${uiTextMuted} hover:text-amber-500 ${uiBtnHover} transition-all flex items-center justify-center`}
                  title="Load Passage Markup (.glide)"
                >
                  <FolderOpen size={18} />
                </button>
                <div className={`w-px h-6 ${uiTheme === 'dark' ? 'bg-slate-700' : 'bg-slate-200'} mx-1`} />
                <button 
                  onClick={() => setShowCustomTextModal(true)}
                  className={`px-3 h-9 ${uiBtnBg} border ${uiBorder} rounded ${uiTextMuted} hover:text-amber-500 ${uiBtnHover} transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest`}
                  title="Paste Custom Text"
                >
                  <Type size={14} /> Custom Text
                </button>
                <div className="flex items-center gap-1">
                  <input 
                    type="text" 
                    value={referenceInput} 
                    onChange={(e) => setReferenceInput(e.target.value)} 
                    placeholder="Reference..." 
                    className={`px-4 h-9 ${uiBtnBg} border ${uiBorder} rounded ${uiText} text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 w-32 md:w-36`} 
                    onKeyDown={(e) => e.key === 'Enter' && fetchBiblePassage(false)}
                  />
                </div>
                <select 
                  value={translation} 
                  onChange={(e) => {
                    const newTrans = e.target.value;
                    setTranslation(newTrans);
                    setVerses([]);
                    fetchBiblePassage(false, referenceInput, newTrans);
                  }}
                  className={`px-3 h-9 ${uiBtnBg} ${uiText} border ${uiBorder} rounded text-xs focus:outline-none focus:ring-1 focus:ring-amber-500`}
                >
                  {TRANSLATIONS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button 
                  onClick={() => fetchBiblePassage(false)} 
                  disabled={isLoading} 
                  title="Fetch Passage"
                  className="flex items-center h-9 justify-center w-10 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white rounded text-xs font-bold transition-colors uppercase tracking-wider relative"
                >
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={18} />}
                </button>
                <AnimatePresence>
                  {fetchError && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="absolute top-16 left-0 right-0 mx-auto w-max max-w-sm bg-red-500 text-white p-3 rounded-lg shadow-xl text-[10px] font-medium z-50 leading-tight border border-red-400"
                    >
                      <p className="flex flex-col gap-1">
                        <span className="font-bold uppercase tracking-widest text-[8px] opacity-80">Fetch Tip:</span>
                        {fetchError}
                      </p>
                      <button onClick={() => setFetchError(null)} className="absolute -top-2 -right-2 bg-slate-900 rounded-full w-5 h-5 flex items-center justify-center text-[10px] border border-slate-700 hover:bg-slate-800">×</button>
                    </motion.div>
                  )}
                </AnimatePresence>
                <button 
                  onClick={() => setReadingMode(!readingMode)}
                  className={`p-2 transition-colors rounded-lg flex items-center gap-2 ${readingMode ? 'bg-amber-500 text-slate-900' : `${uiBtnBg} ${uiTextMuted} hover:text-amber-500`}`}
                  title={readingMode ? "Exit Reading Mode" : "Enter Reading Mode"}
                >
                  {readingMode ? <Monitor size={18} /> : <Book size={18} />}
                  <span className="text-[10px] font-bold uppercase hidden xl:inline">{readingMode ? 'Edit Mode' : 'Reading Mode'}</span>
                </button>
                <div className={`w-px h-6 ${uiTheme === 'dark' ? 'bg-slate-700' : 'bg-slate-200'} mx-1`} />
                <button 
                  onClick={() => setShowSettings(!showSettings)} 
                  className={`p-2 h-9 w-9 flex items-center justify-center rounded transition-colors ${showSettings ? 'bg-amber-500 text-slate-900' : `${uiBtnBg} ${uiTextMuted} ${uiBtnHover}`}`}
                >
                  <Settings size={18} />
                </button>
              </div>
            </div>
            
            <AnimatePresence>
              {!readingMode && showSettings && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`absolute top-16 right-4 w-72 ${uiBg} border ${uiBorder} rounded-xl shadow-2xl p-5 z-[100] flex flex-col gap-6 max-h-[80vh] overflow-y-auto no-scrollbar pb-32`}
                >
                  <div className="space-y-4">
                    <h3 className={`text-[10px] font-bold uppercase tracking-widest ${uiTextMuted}`}>Theme Engine</h3>
                    <div className={`flex gap-2 ${uiTheme === 'dark' ? 'bg-slate-950/30' : 'bg-white'} p-1 rounded-lg border ${uiBorder} shadow-sm`}>
                      <button onClick={() => setSettings({...settings, theme: 'light', pageColor: '#f8fafc'})} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs transition-all ${settings.theme === 'light' ? 'bg-amber-500 text-slate-900 font-bold' : `${uiTextMuted} hover:bg-amber-500/10`}`}><Sun size={14} /> Light</button>
                      <button onClick={() => setSettings({...settings, theme: 'dark', pageColor: '#0f172a'})} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs transition-all ${settings.theme === 'dark' ? 'bg-slate-900 text-white font-bold' : `${uiTextMuted} hover:bg-slate-900/10`}`}><Moon size={14} /> Dark</button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className={`text-[10px] font-bold uppercase tracking-widest ${uiTextMuted}`}>Control Interface Theme</h3>
                    <div className={`flex gap-2 ${uiTheme === 'dark' ? 'bg-slate-950/30' : 'bg-white'} p-1 rounded-lg border ${uiBorder} shadow-sm`}>
                      <button onClick={() => setSettings({...settings, uiTheme: 'light'})} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs transition-all ${settings.uiTheme === 'light' ? 'bg-amber-500 text-slate-900 font-bold' : `${uiTextMuted} hover:bg-amber-500/10`}`}><Sun size={14} /> Light</button>
                      <button onClick={() => setSettings({...settings, uiTheme: 'dark'})} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs transition-all ${settings.uiTheme === 'dark' ? 'bg-slate-900 text-white font-bold' : `${uiTextMuted} hover:bg-slate-900/10`}`}><Moon size={14} /> Dark</button>
                    </div>
                  </div>

                  <div className={`space-y-4 border-t ${uiBorder} pt-4`}>
                    <h3 className={`text-[10px] font-bold uppercase tracking-widest ${uiTheme === 'dark' ? 'text-slate-300' : 'text-slate-900'}`}>Page Settings</h3>
                    <div className={`${uiTheme === 'dark' ? 'bg-slate-800' : 'bg-white'} p-3 rounded-lg border ${uiBorder} shadow-sm ${uiText}`}>
                      <label className={`flex justify-between text-[10px] font-bold ${uiTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'} uppercase tracking-widest mb-2`}>
                        <span>Max Page Width</span>
                        <span className={`${uiText} font-mono`}>{settings.maxWidth}px</span>
                      </label>
                      <input 
                        type="range" 
                        min="600" 
                        max="2400" 
                        step="40" 
                        value={settings.maxWidth || DEFAULT_SETTINGS.maxWidth} 
                        onChange={(e) => setSettings({...settings, maxWidth: parseInt(e.target.value)})} 
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-amber-600"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className={`text-[9px] font-bold uppercase tracking-widest ${uiTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Background Color</label>
                      <div className={`${uiTheme === 'dark' ? 'bg-slate-950/30' : 'bg-white'} p-3 rounded-lg border ${uiBorder} shadow-sm`}>
                        <input 
                          type="color" 
                          value={settings.pageColor || DEFAULT_SETTINGS.pageColor} 
                          onChange={(e) => setSettings({...settings, pageColor: e.target.value})}
                          className="w-full h-8 rounded cursor-pointer border-none bg-transparent"
                        />
                      </div>
                    </div>
                  </div>

                  <div className={`space-y-4 border-t ${uiBorder} pt-4`}>
                    {(['textSize', 'textSpacing', 'scrollSpeed', 'verseCount', 'highlightIntensity'] as const).map(key => {
                      const getRange = () => {
                        switch(key) {
                          case 'textSize': return { min: 20, max: 100, step: 1 };
                          case 'textSpacing': return { min: 1, max: 3, step: 0.1 };
                          case 'scrollSpeed': return { min: 200, max: 2500, step: 100 };
                          case 'verseCount': return { min: 1, max: 10, step: 1 };
                          case 'highlightIntensity': return { min: 0.1, max: 1, step: 0.1 };
                          default: return { min: 1, max: 100, step: 1 };
                        }
                      };
                      const { min, max, step } = getRange();
                      
                      return (
                        <div key={key} className={`${uiTheme === 'dark' ? 'bg-slate-800' : 'bg-white'} p-3 rounded-lg border ${uiBorder} shadow-sm ${uiText}`}>
                          <label className={`flex justify-between text-[10px] font-bold ${uiTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'} uppercase tracking-widest mb-2`}>
                            <span>{key.replace(/([A-Z])/g, ' $1')}</span>
                            <span className={`${uiText} font-mono`}>
                              {key === 'scrollSpeed' ? settings[key]/1000 + 's' : 
                               key === 'highlightIntensity' ? Math.round(settings[key]*100)+'%' : 
                               settings[key]}
                            </span>
                          </label>
                          <input 
                            type="range" 
                            min={min} 
                            max={max} 
                            step={step} 
                            value={settings[key] ?? DEFAULT_SETTINGS[key]} 
                            onChange={(e) => setSettings({...settings, [key]: parseFloat(e.target.value)})} 
                            className={`w-full h-1.5 ${uiTheme === 'dark' ? 'bg-slate-700' : 'bg-slate-100'} rounded-lg appearance-none cursor-pointer accent-amber-600`}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className={`space-y-4 border-t ${uiBorder} pt-4`}>
                    <h3 className={`text-[10px] font-bold uppercase tracking-widest ${uiTheme === 'dark' ? 'text-slate-300' : 'text-slate-900'}`}>Passage Layout</h3>
                    <div className="flex flex-col gap-3 grow">
                      <button 
                        onClick={() => setSettings({...settings, showVerseNumbers: !settings.showVerseNumbers})}
                        className={`flex items-center justify-between p-3 rounded-lg border text-xs transition-all ${settings.showVerseNumbers ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-bold' : `${uiTheme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'} ${uiTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'} hover:bg-amber-500/5`}`}
                      >
                        <span>Show Verse Numbers</span>
                        <div className={`w-8 h-4 rounded-full relative transition-colors ${settings.showVerseNumbers ? 'bg-amber-500' : (uiTheme === 'dark' ? 'bg-slate-800' : 'bg-slate-200')}`}>
                          <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${settings.showVerseNumbers ? 'right-1' : 'left-1'}`} />
                        </div>
                      </button>

                      <button 
                        onClick={() => setSettings({...settings, oneVersePerLine: !settings.oneVersePerLine})}
                        className={`flex items-center justify-between p-3 rounded-lg border text-xs transition-all ${settings.oneVersePerLine ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-bold' : `${uiTheme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'} ${uiTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'} hover:bg-amber-500/5`}`}
                      >
                        <span>One Verse Per Line</span>
                        <div className={`w-8 h-4 rounded-full relative transition-colors ${settings.oneVersePerLine ? 'bg-amber-500' : (uiTheme === 'dark' ? 'bg-slate-800' : 'bg-slate-200')}`}>
                          <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${settings.oneVersePerLine ? 'right-1' : 'left-1'}`} />
                        </div>
                      </button>

                      <button 
                        onClick={() => setSettings({...settings, showReferenceBox: !settings.showReferenceBox})}
                        className={`flex items-center justify-between p-3 rounded-lg border text-xs transition-all ${settings.showReferenceBox ? 'bg-amber-500/10 border-amber-500 text-amber-500 font-bold' : `${uiTheme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'} ${uiTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'} hover:bg-amber-500/5`}`}
                      >
                        <span>Show Reference Box</span>
                        <div className={`w-8 h-4 rounded-full relative transition-colors ${settings.showReferenceBox ? 'bg-amber-500' : (uiTheme === 'dark' ? 'bg-slate-800' : 'bg-slate-200')}`}>
                          <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${settings.showReferenceBox ? 'right-1' : 'left-1'}`} />
                        </div>
                      </button>

                      <div className="flex flex-col gap-2 mt-2">
                        <label className={`text-[9px] font-bold uppercase tracking-widest ${uiTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Reference Box Color</label>
                        <div className="flex gap-2">
                          <input 
                            type="color" 
                            value={settings.referenceBoxColor || DEFAULT_SETTINGS.referenceBoxColor} 
                            onChange={(e) => setSettings({...settings, referenceBoxColor: e.target.value})}
                            className={`w-full h-8 rounded cursor-pointer border ${uiBorder} p-0 overflow-hidden bg-transparent`}
                          />
                          <button 
                            onClick={() => setSettings({...settings, referenceBoxColor: '#1e293b'})}
                            className={`px-2 py-1 ${uiBtnBg} ${uiBtnHover} rounded text-[9px] font-bold ${uiTextMuted} uppercase`}
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 mt-2">
                        <label className={`text-[9px] font-bold uppercase tracking-widest ${uiTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Verse Number Color</label>
                        <div className="flex gap-2">
                          <input 
                            type="color" 
                            value={settings.verseNumberColor || DEFAULT_SETTINGS.verseNumberColor} 
                            onChange={(e) => setSettings({...settings, verseNumberColor: e.target.value})}
                            className={`w-full h-8 rounded cursor-pointer border ${uiBorder} p-0 overflow-hidden bg-transparent`}
                          />
                          <button 
                            onClick={() => setSettings({...settings, verseNumberColor: '#000000'})}
                            className={`px-2 py-1 ${uiBtnBg} ${uiBtnHover} rounded text-[9px] font-bold ${uiTextMuted} uppercase`}
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={`space-y-4 border-t ${uiBorder} pt-4`}>
                    <div className="flex items-center justify-between">
                      <h3 className={`text-[10px] font-bold uppercase tracking-widest ${uiTheme === 'dark' ? 'text-slate-300' : 'text-slate-900'}`}>Presentation Monitor</h3>
                      <button 
                        onClick={() => invoke('list_monitors').then((m: any) => setAvailableMonitors(m)).catch(err => console.error('Monitor refresh error:', err))}
                        className={`text-[8px] uppercase font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1`}
                      >
                        <RotateCcw size={10} /> Refresh
                      </button>
                    </div>
                    <div className="space-y-2">
                      <label className={`text-[9px] font-bold uppercase tracking-widest ${uiTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Target Monitor</label>
                      <select 
                        value={settings.targetMonitor} 
                        onChange={(e) => setSettings({...settings, targetMonitor: parseInt(e.target.value)})}
                        className={`w-full p-2 ${uiTheme === 'dark' ? 'bg-slate-800' : 'bg-white'} border ${uiBorder} rounded text-xs ${uiText} focus:ring-1 focus:ring-amber-500 outline-none shadow-sm`}
                      >
                        {availableMonitors.length > 0 ? (
                          availableMonitors.map(m => (
                            <option key={m.index} value={m.index}>
                              {m.name.replace(/^.*DISPLAY/i, 'Display ')} ({m.width}x{m.height})
                            </option>
                          ))
                        ) : (
                          <>
                            <option value={0}>Primary Monitor</option>
                            <option value={1}>Secondary Monitor</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  <div className={`space-y-4 border-t ${uiBorder} pt-4 pb-4`}>
                    <h3 className={`text-[10px] font-bold uppercase tracking-widest ${uiTheme === 'dark' ? 'text-slate-300' : 'text-slate-900'}`}>Application</h3>
                    <button 
                      onClick={() => checkForUpdates(true)}
                      className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all ${uiTheme === 'dark' ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-500'} hover:text-amber-500`}
                    >
                      Check for Updates
                    </button>
                    {bridgeError && (
                      <div className="text-[7px] text-red-500 text-center font-mono mt-1 opacity-60">
                        {bridgeError}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <div 
        ref={containerRef} 
        className="flex-1 overflow-y-auto px-6 md:px-12 lg:px-16 flex flex-col no-scrollbar relative h-full transition-colors duration-500" 
        style={{ backgroundColor: settings.pageColor, fontFamily: activeFont.css, color: settings.theme === 'dark' ? '#f8fafc' : '#0f172a' }}
        onInput={() => appMode === 'control' && syncStateToStorage({ index: activeVerseIndex, forceDomRead: true })}
        onMouseUp={() => appMode === 'control' && applyActiveTool()}
        onDrop={(e) => {
          if (appMode === 'control') {
            e.preventDefault();
            return false;
          }
        } }
      >
        <div className="h-[20vh] flex-shrink-0" />
        <div key={resetKey} className={`mx-auto w-full transition-all duration-300 select-text ${settings.oneVersePerLine ? 'flex flex-col gap-8' : 'text-start tracking-wide'}`} style={{ fontSize: `${settings.textSize}px`, lineHeight: settings.textSpacing, paddingBottom: '20vh', maxWidth: `${settings.maxWidth}px` }} dir={translation === 'wlc' ? 'rtl' : 'ltr'}>
          {verses.map((verse, index) => {
            const fullRef = verse.reference.split(' ').pop() || '';
            const verseNumber = (index === 0 || verse.isNewChapter || verse.isNewPassage) ? fullRef : (fullRef.split(':')[1] || fullRef);
            const isRtl = translation === 'wlc';
            const isActive = index >= activeVerseIndex && index < activeVerseIndex + settings.verseCount;
            
            return (
              <React.Fragment key={verse.id}>
                {verse.bookHeader && (
                  <div className="w-full text-center py-12 md:py-16 opacity-40 select-none">
                    <h2 className="text-6xl md:text-7xl font-bold uppercase tracking-widest break-words" style={{ fontFamily: activeFont.css }}>
                      {verse.bookHeader}
                    </h2>
                  </div>
                )}
                {(verse.isNewPassage || verse.isNewChapter) && <div className="h-8 w-full" />}
                <div 
                  className={`${settings.oneVersePerLine || verse.isNewChapter || verse.acrostic ? 'flex flex-col items-start w-full' : 'inline'}`}
                  style={{ unicodeBidi: 'plaintext' }}
                  data-verse-index={index}
                  onMouseDown={(e) => {
                    // Only change focus if clicking a backgrounded verse
                    if (appMode === 'control' && !isActive) {
                      setActiveVerseIndex(index);
                      syncStateToStorage({ index });
                    }
                  }}
                >
                  {verse.acrostic && (
                    <div className="w-full opacity-30 text-[0.45em] tracking-[0.3em] uppercase italic mb-1 flex items-center gap-4 select-none" contentEditable={false} style={{ fontFamily: activeFont.css }}>
                      {verse.acrostic}
                      <div className="h-px flex-1 bg-current opacity-10" />
                    </div>
                  )}
                  <div className={`${settings.oneVersePerLine || verse.isNewChapter || verse.acrostic ? 'flex gap-4 items-start w-full' : 'inline'}`}>
                    {settings.showVerseNumbers && (
                      <span
                        contentEditable={false} 
                        style={{ color: settings.verseNumberColor }}
                        className={`select-none font-bold text-[0.6em] align-top mt-[0.2em] inline-block shrink-0 transition-all ${isRtl ? 'ml-2' : 'mr-2'} ${isActive ? 'opacity-50' : 'opacity-10 blur-[2px]'}`}
                      >
                        {verseNumber}
                      </span>
                    )}
                    <span 
                      id={`verse-${index}`} 
                      dir="auto" 
                      className={`outline-none transition-all ${appMode === 'control' ? 'cursor-text' : ''} ${settings.oneVersePerLine || verse.isNewChapter || verse.acrostic ? 'flex-1' : 'inline'} ${isRtl ? 'text-right' : ''} ${isActive ? 'font-medium opacity-100' : 'font-normal opacity-15'}`}
                      style={{ transitionDuration: `${settings.scrollSpeed}ms` }}
                      contentEditable={appMode === 'control'} 
                      suppressContentEditableWarning={true} 
                      dangerouslySetInnerHTML={{ __html: (verse.html || verse.text) + (isRtl ? '' : '\u200E') }}
                      onDrop={(e) => {
                        e.preventDefault();
                        return false;
                      }}
                      onClick={(e) => {
                        if (appMode === 'control') {
                          // Prevent focus shift if verse is already foregrounded
                          if (isActive) return;
                          
                          const selection = window.getSelection();
                          if ((!selection || selection.toString().length === 0)) {
                            setActiveVerseIndex(index);
                          }
                        }
                      }} 
                      onFocus={(e) => {
                        if (appMode === 'control') {
                          // If it's already active, we don't want to trigger a shift that might move the cursor
                          if (isActive) return;
                          setActiveVerseIndex(index);
                        }
                      }} 
                    />
                  </div>
                  {!(settings.oneVersePerLine || verse.isNewChapter || verse.acrostic) && <span className="inline"> </span>}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div className="h-[20vh] flex-shrink-0" />
      </div>

        <AnimatePresence>
          {verses.length > 0 && settings.showReferenceBox && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
            >
              <div 
                className="px-8 py-3 rounded-lg shadow-2xl tracking-widest whitespace-nowrap uppercase font-display font-bold ring-1 ring-amber-500/30" 
                style={{ 
                  fontSize: `${Math.max(settings.textSize * 0.45, 14)}px`,
                  backgroundColor: settings.referenceBoxColor || (settings.theme === 'dark' ? 'rgba(248, 250, 252, 0.95)' : 'rgba(15, 23, 42, 0.95)'),
                  color: (settings.referenceBoxColor && !settings.referenceBoxColor.startsWith('rgba(15')) ? (parseInt(settings.referenceBoxColor.replace('#',''), 16) > 0xffffff/2 ? '#0f172a' : '#f8fafc') : (settings.theme === 'dark' ? '#0f172a' : '#f8fafc'),
                  backdropFilter: 'blur(12px)'
                }}
              >
                {getActiveReference()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      <AnimatePresence>
        {appMode === 'control' && readingMode && (
          <motion.button
            key="exit-reading-node"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            onClick={() => setReadingMode(false)}
            className="fixed bottom-12 right-12 z-[60] bg-slate-900 text-white p-4 rounded-full shadow-2xl hover:bg-amber-500 hover:text-slate-900 transition-all flex items-center gap-3 border border-slate-700 font-sans"
          >
            <RotateCcw size={20} />
            <span className="font-bold uppercase text-xs tracking-widest">Exit Reading Mode</span>
          </motion.button>
        )}

        {appMode === 'control' && !readingMode && (
          <div key="control-footer" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col md:flex-row items-center gap-4 font-sans w-max max-w-[95vw]">
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className={`flex items-center gap-2 ${uiBg} ${uiText} p-2 rounded-2xl border ${uiBorder} shadow-2xl`}
            >
              <button 
                onClick={() => { 
                  const i = Math.max(activeVerseIndex - settings.verseCount, 0); 
                  setActiveVerseIndex(i); 
                  syncStateToStorage({ index: i });
                }} 
                className={`p-1 rounded-lg ${uiBtnHover} transition-colors`}
                title={`Previous ${settings.verseCount} Verse(s)`}
              >
                <ChevronUp size={20} />
              </button>
              <div className={`w-px h-8 ${uiTheme === 'dark' ? 'bg-slate-700' : 'bg-slate-200'}`} />
              <button 
                onClick={() => { 
                  const i = Math.min(activeVerseIndex + settings.verseCount, verses.length - 1); 
                  setActiveVerseIndex(i); 
                  syncStateToStorage({ index: i });
                }} 
                className={`p-1 rounded-lg ${uiBtnHover} transition-colors`}
                title={`Next ${settings.verseCount} Verse(s)`}
              >
                <ChevronDown size={20} />
              </button>
            </motion.div>
            
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className={`flex items-center gap-1 ${uiBg} ${uiText} p-2 rounded-2xl border ${uiBorder} shadow-2xl select-none`}
              onDragStart={(e) => e.preventDefault()}
            >
                  <div className={`flex items-center gap-1 p-1 ${uiTheme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-100'} rounded-xl`}>
                    <button 
                      onMouseDown={(e) => { e.preventDefault(); toggleTool('backColor', hexToRgba(activeMarkupColor, settings.highlightIntensity)); }}
                      className={`p-3 rounded-xl transition-all ${activeTool?.type === 'backColor' ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20' : `${uiTextMuted} ${uiBtnHover} hover:text-amber-500`}`}
                      title="Highlighter"
                    >
                      <Highlighter size={18} />
                    </button>
                    <button 
                      onMouseDown={(e) => { e.preventDefault(); toggleTool('foreColor', activeMarkupColor); }}
                      className={`p-3 rounded-xl transition-all ${activeTool?.type === 'foreColor' ? 'bg-amber-500 text-slate-900 border-amber-500 shadow-lg shadow-amber-500/20' : `${uiTextMuted} ${uiBtnHover} hover:text-amber-500`}`}
                      title="Text Color"
                    >
                      <Type size={18} />
                    </button>
                    <button 
                      onMouseDown={(e) => { e.preventDefault(); toggleTool('underlineColor'); }}
                      className={`p-3 rounded-xl transition-all ${activeTool?.type === 'underlineColor' ? 'bg-amber-500 text-slate-900 border-amber-500 shadow-lg shadow-amber-500/20' : `${uiTextMuted} ${uiBtnHover} hover:text-amber-500`}`}
                      title="Color Underline"
                    >
                      <UnderlineIcon size={18} />
                    </button>
                    <button 
                      onMouseDown={(e) => { e.preventDefault(); toggleTool('circle'); }}
                      className={`p-3 rounded-xl transition-all ${activeTool?.type === 'circle' ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20' : `${uiTextMuted} ${uiBtnHover} hover:text-amber-500`}`}
                      title="Circle Tool"
                    >
                      <Circle size={18} />
                    </button>
                    <button 
                      onMouseDown={(e) => { e.preventDefault(); toggleTool('box'); }}
                      className={`p-3 rounded-xl transition-all ${activeTool?.type === 'box' ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20' : `${uiTextMuted} ${uiBtnHover} hover:text-amber-500`}`}
                      title="Box Tool"
                    >
                      <Square size={18} />
                    </button>
                  </div>

              <div className={`w-px h-8 ${uiTheme === 'dark' ? 'bg-slate-700' : 'bg-slate-200'} mx-1`} />

              {['#facc15', '#10b981', '#3b82f6', '#ef4444', '#000000'].map((c,i)=> (
                <button 
                  key={i} 
                  draggable="false"
                  onClick={() => {
                    setActiveMarkupColor(c);
                    const selection = window.getSelection();
                    const hasSelection = selection && selection.toString().length > 0;
                    
                    if (activeTool?.type === 'backColor') {
                      const value = hexToRgba(c, settings.highlightIntensity);
                      setActiveTool({ type: 'backColor', value });
                      if (hasSelection) applyFormat('backColor', value);
                    } else if (activeTool?.type === 'foreColor') {
                      setActiveTool({ type: 'foreColor', value: c });
                      if (hasSelection) applyFormat('foreColor', c);
                    } else if (activeTool?.type === 'underlineColor') {
                      if (hasSelection) applyUnderline(c);
                    } else if (activeTool?.type === 'circle') {
                      if (hasSelection) applyShape('circle', c);
                    } else if (activeTool?.type === 'box') {
                      if (hasSelection) applyShape('box', c);
                    }
                  }} 
                  className={`p-2 rounded-xl transition-all group ${activeMarkupColor === c ? `${uiTheme === 'dark' ? 'bg-slate-700' : 'bg-slate-100'} ring-1 ring-amber-500/50` : uiBtnHover}`}
                >
                  <div 
                    className="w-6 h-6 rounded ring-1 ring-white/10 group-hover:ring-amber-500/50" 
                    style={{ backgroundColor: c }} 
                  />
                </button>
              ))}

              <div className={`relative flex items-center p-2 rounded-xl border border-transparent ${uiBtnHover} transition-colors`}>
                <input 
                  type="color" 
                  value={activeMarkupColor}
                  onChange={(e) => {
                    const c = e.target.value;
                    setActiveMarkupColor(c);
                    const selection = window.getSelection();
                    const hasSelection = selection && selection.toString().length > 0;
                    
                    if (activeTool?.type === 'backColor') {
                      const value = hexToRgba(c, settings.highlightIntensity);
                      setActiveTool({ type: 'backColor', value });
                      if (hasSelection) applyFormat('backColor', value);
                    } else if (activeTool?.type === 'foreColor') {
                      setActiveTool({ type: 'foreColor', value: c });
                      if (hasSelection) applyFormat('foreColor', c);
                    } else if (activeTool?.type === 'underlineColor') {
                      if (hasSelection) applyUnderline(c);
                    } else if (activeTool?.type === 'circle') {
                      if (hasSelection) applyShape('circle', c);
                    } else if (activeTool?.type === 'box') {
                      if (hasSelection) applyShape('box', c);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div 
                  className="w-6 h-6 rounded ring-1 ring-white/20 flex items-center justify-center"
                  style={{ backgroundColor: activeMarkupColor }}
                >
                  <Palette size={12} className={activeMarkupColor === '#ffffff' ? 'text-slate-900' : 'text-white/70'} />
                </div>
              </div>

              <div className={`w-px h-8 ${uiTheme === 'dark' ? 'bg-slate-700' : 'bg-slate-200'} mx-1`} />

              {/* Group 3: Bold, Italic, Eraser */}
              <div className={`flex items-center gap-1 p-1 ${uiTheme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-100'} rounded-xl`}>
                <button 
                  onMouseDown={(e) => { e.preventDefault(); toggleTool('bold'); }}
                  className={`p-3 rounded-xl transition-all ${activeTool?.type === 'bold' ? 'bg-amber-500 text-slate-900 border-amber-500 shadow-lg shadow-amber-500/20' : `${uiTextMuted} ${uiBtnHover} hover:text-amber-500`}`}
                  title="Bold"
                >
                  <BoldIcon size={18} />
                </button>
                <button 
                  onMouseDown={(e) => { e.preventDefault(); toggleTool('italic'); }}
                  className={`p-3 rounded-xl transition-all ${activeTool?.type === 'italic' ? 'bg-amber-500 text-slate-900 border-amber-500 shadow-lg shadow-amber-500/20' : `${uiTextMuted} ${uiBtnHover} hover:text-amber-500`}`}
                  title="Italic"
                >
                  <Italic size={18} />
                </button>
                <div className={`w-px h-6 ${uiTheme === 'dark' ? 'bg-slate-700' : 'bg-slate-200'} mx-1`} />
                <button 
                  onMouseDown={(e) => { e.preventDefault(); toggleTool('eraser'); }}
                  className={`p-3 rounded-xl transition-all ${activeTool?.type === 'eraser' ? 'bg-amber-500 text-slate-900 border-amber-500 shadow-lg shadow-amber-500/20' : `${uiTextMuted} ${uiBtnHover} hover:text-amber-500`}`}
                  title="Eraser Tool"
                >
                  <Eraser size={18} />
                </button>
                <div className={`w-px h-6 ${uiTheme === 'dark' ? 'bg-slate-700' : 'bg-slate-200'} mx-1`} />
                <button 
                  onClick={clearAllFormatting}
                  className={`p-3 rounded-xl transition-all ${uiTextMuted} ${uiBtnHover} hover:text-red-500`}
                  title="Clear All Markups"
                >
                  <RotateCcw size={18} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
