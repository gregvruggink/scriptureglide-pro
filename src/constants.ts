import { Verse, AppSettings } from './types';

export const DEFAULT_PASSAGE: Verse[] = [
  { id: 'Gen-1-1', reference: 'Genesis 1:1', text: "In the beginning, God created the heavens and the earth.", bookHeader: 'Genesis' },
  { id: 'Gen-1-2', reference: 'Genesis 1:2', text: "The earth was without form and void, and darkness was over the face of the deep. And the Spirit of God was hovering over the face of the waters." },
  { id: 'Gen-1-3', reference: 'Genesis 1:3', text: "And God said, \"Let there be light,\" and there was light." },
  { id: 'Gen-1-4', reference: 'Genesis 1:4', text: "And God saw that the light was good. And God separated the light from the darkness." },
  { id: 'Gen-1-5', reference: 'Genesis 1:5', text: "God called the light Day, and the darkness he called Night. And there was evening and there was morning, the first day." }
];

export const TRANSLATIONS = [
  { id: 'esv', name: 'English Standard Version (ESV)' },
  { id: 'net', name: 'NET Bible (NET)' },
  { id: 'yv-111', name: 'New International Version (NIV)' },
  { id: 'yv-2692', name: 'New American Standard Bible (NASB)' },
  { id: 'kjv', name: 'King James Version (KJV)' },
  { id: 'bbe', name: 'Bible in Basic English (BBE)' },
  { id: 'web', name: 'World English Bible (WEB)' },
  { id: 'clementine', name: 'Clementine Latin Vulgate' },
  { id: 'wlc', name: 'Hebrew Old Testament (WLC)' },
  { id: 'lxx', name: 'Greek Septuagint (LXX)' },
  { id: 'sblgnt', name: 'SBL Greek New Testament (SBLGNT)' }
];

export const USFM_BOOKS: Record<number, string> = {
  1: 'GEN', 2: 'EXO', 3: 'LEV', 4: 'NUM', 5: 'DEU', 6: 'JOS', 7: 'JDG', 8: 'RUT', 9: '1SA', 10: '2SA',
  11: '1KI', 12: '2KI', 13: '1CH', 14: '2CH', 15: 'EZR', 16: 'NEH', 17: 'EST', 18: 'JOB', 19: 'PSA',
  20: 'PRO', 21: 'ECC', 22: 'SNG', 23: 'ISA', 24: 'JER', 25: 'LAM', 26: 'EZE', 27: 'DAN', 28: 'HOS',
  29: 'JOE', 30: 'AMO', 31: 'OBA', 32: 'JON', 33: 'MIC', 34: 'NAM', 35: 'HAB', 36: 'ZEP', 37: 'HAG',
  38: 'ZEC', 39: 'MAL', 40: 'MAT', 41: 'MRK', 42: 'LUK', 43: 'JHN', 44: 'ACT', 45: 'ROM', 46: '1CO',
  47: '2CO', 48: 'GAL', 49: 'EPH', 50: 'PHP', 51: 'COL', 52: '1TH', 53: '2TH', 54: '1TI', 55: '2TI',
  56: 'TIT', 57: 'PHM', 58: 'HEB', 59: 'JAS', 60: '1PE', 61: '2PE', 62: '1JN', 63: '2JN', 64: '3JN',
  65: 'JUD', 66: 'REV'
};

export const FONT_OPTIONS = [
  { id: 'academic', name: 'Academic Serif', css: 'var(--font-serif)' },
  { id: 'modern', name: 'Modern Sans', css: 'var(--font-sans)' },
  { id: 'display', name: 'Bold Display', css: 'var(--font-display)' },
  { id: 'study', name: 'Study Monospace', css: 'var(--font-mono)' }
];

export const BOOK_IDS: Record<string, number> = {
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

export const CANONICAL_BOOKS: Record<number, string> = {
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

export const DEFAULT_SETTINGS: AppSettings = {
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
  defaultTranslation: 'esv',
  maxWidth: 1024,
  targetMonitor: 1,
  showReferenceBox: true,
  referenceBoxColor: '#1e293b',
  titleSize: 96,
  slideTransition: 'fade',
  textShadow: false,
  shadowColor: 'rgba(0,0,0,0.8)',
  shadowBlur: 4,
  shadowOffset: 2,
  textOutline: false,
  outlineColor: '#000000',
  outlineWidth: 2,
  showTitle: true
};
