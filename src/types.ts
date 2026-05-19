export interface Verse {
  id: string;
  reference: string;
  text: string;
  html?: string;
  bookHeader?: string;
  acrostic?: string;
  isNewPassage?: boolean;
  isNewChapter?: boolean;
}

export type SlideType = 'scripture' | 'image' | 'video' | 'graphic' | 'markdown';

export interface Slide {
  id: string;
  type: SlideType;
  title: string;
  content: any; 
  settingsOverride?: Partial<AppSettings>;
  imageMarkups?: ImageMarkup[];
}

export type ImageMarkup = 
  | { type: 'path', d: string, color: string, id: string, strokeWidth: number }
  | { type: 'circle', cx: number, cy: number, r: number, color: string, id: string, strokeWidth: number }
  | { type: 'rect', x: number, y: number, w: number, h: number, color: string, id: string, strokeWidth: number }
  | { type: 'line', x1: number, y1: number, x2: number, y2: number, color: string, id: string, strokeWidth: number };

export interface AppSettings {
  textSize: number;
  textSpacing: number;
  scrollSpeed: number;
  verseCount: number;
  highlightIntensity: number;
  pageColor: string;
  theme: 'light' | 'dark' | 'chroma';
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
  titleSize: number;
  slideTransition: 'none' | 'fade' | 'slide' | 'zoom';
  textShadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffset: number;
  textOutline: boolean;
  outlineColor: string;
  outlineWidth: number;
  showTitle: boolean;
}
