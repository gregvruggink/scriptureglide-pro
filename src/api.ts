import { Verse } from './types';
import { fetchWithTimeout, formatReference } from './utils';
import { BOOK_IDS, CANONICAL_BOOKS, USFM_BOOKS } from './constants';
import { ApiClient, BibleClient } from '@youversion/platform-core';

export const fetchPassageData = async (
  refQuery: string,
  activeTrans: string,
  esvApiKey: string,
  yvApiKey: string,
  verses: Verse[],
  isAppend: boolean
): Promise<{ fetchedVersesRaw: any[], currentBookName: string, headerName: string, isBookStart: boolean }> => {
  let fetchedVersesRaw: any[] = [];
  
  const parseRef = (query: string) => {
    // Matches "1 John 2:3", "John 2:3", "Genesis 2", "2:3" (if no book provided)
    const match = query.match(/^((?:\d\s+)?[A-Za-z\s\.]+?)?\s*(\d+)(?::(\d+)(?:-(\d+))?)?$/);
    
    if (!match) {
      const bookId = BOOK_IDS[query.toLowerCase().replace(/\./g, '').trim()];
      return { book: (bookId && CANONICAL_BOOKS[bookId]) ? CANONICAL_BOOKS[bookId] : query, chapter: '1', verse: null, bookId };
    }
    
    const bookPart = match[1] ? match[1].trim() : "";
    const bookNameRaw = bookPart.toLowerCase().replace(/\./g, '');
    const bookId = BOOK_IDS[bookNameRaw];
    const book = (bookId && CANONICAL_BOOKS[bookId]) ? CANONICAL_BOOKS[bookId] : (bookPart || "Genesis"); // Fallback to Genesis if no book part found for "2:3"
    
    return { book, chapter: match[2], verse: match[3] || null, endVerse: match[4] || null, bookId };
  };
  
  const parsed = parseRef(refQuery);
  const currentBookName = parsed.book;
  const headerName = formatReference(refQuery);
  const isBookStart = refQuery.toLowerCase().includes(' 1:1') || refQuery.toLowerCase().includes(' 1:1-');
  
  if (activeTrans.startsWith('yv-')) {
    if (!yvApiKey) throw new Error("Please enter a YouVersion App Key in Settings.");
    const versionId = activeTrans.split('-')[1];
    if (!parsed.bookId) throw new Error(`Book "${parsed.book}" not recognized.`);
    const usfmBook = USFM_BOOKS[parsed.bookId];
    const usfmRef = `${usfmBook}.${parsed.chapter}${parsed.verse ? `.${parsed.verse}${parsed.endVerse ? `-${parsed.endVerse}` : ''}` : ''}`;

    try {
      const client = new ApiClient({ appKey: yvApiKey });
      const bibleClient = new BibleClient(client);
      const data = await bibleClient.getPassage(parseInt(versionId), usfmRef);
      
      if (data && data.content) {
        const rawContent = data.content;
        const verseMatches = Array.from(rawContent.matchAll(/<span class="yv-vlbl">(\d+)<\/span>(.*?)(?=<span class="yv-vlbl">|$)/gs));
        
        if (verseMatches.length > 0) {
          fetchedVersesRaw = verseMatches.map((match) => {
            const vNum = match[1];
            const vText = match[2].replace(/<[^>]+>/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
            return {
              id: `yv-${versionId}-${usfmBook}-${parsed.chapter}-${vNum}-${Math.random().toString(36).substr(2, 5)}`,
              reference: formatReference(`${currentBookName} ${parsed.chapter}:${vNum}`),
              text: vText
            };
          });
        } else {
          fetchedVersesRaw = [{
            id: `yv-${versionId}-${data.id || Math.random().toString(36).substr(2, 5)}`,
            reference: formatReference(`${currentBookName} ${data.reference.split(' ').pop()}`),
            text: rawContent.replace(/<span class="yv-vlbl">\d+<\/span>/g, ' ').replace(/<[^>]+>/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
          }];
        }
      } else {
        throw new Error("No content returned from YouVersion.");
      }
    } catch (e: any) {
      throw new Error(`YouVersion API Error: ${e.message || "Unknown error"}`);
    }
  }
  else if (activeTrans === 'esv') { 
    if (!esvApiKey) throw new Error("Please enter a free ESV API key."); 
    const res = await fetchWithTimeout(`https://api.esv.org/v3/passage/text/?q=${encodeURIComponent(refQuery)}&include-passage-references=false&include-footnotes=false&include-headings=false&include-short-copyright=false&include-verse-numbers=true`, { headers: { 'Authorization': `Token ${esvApiKey}` } }); 
    const data = await res.json(); 
    if (data.passages?.[0]) { 
      const cleanText = data.passages[0].replace(/\(ESV\)/g, '').replace(/\n/g, ' ').trim(); 
      // Robust regex for ESV verse markers: [1] or 1:1 or at the very start of string
      const verseRegex = /(?:\[(\d+)\]|(\d+):(\d+))/g;
      const matches = Array.from(cleanText.matchAll(verseRegex));
      
      if (matches.length === 0) {
        fetchedVersesRaw = [{ id: `esv-${parsed.chapter}-${parsed.verse || '1'}-${Math.random().toString(36).substr(2, 5)}`, reference: formatReference(`${currentBookName} ${parsed.chapter}:${parsed.verse || '1'}`), text: cleanText.trim() }];
      } else {
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          const nextMatchIndex = matches[i+1] ? matches[i+1].index : cleanText.length;
          const vNum = match[1] || match[3];
          const vCh = match[2] || parsed.chapter;
          const vText = cleanText.substring((match.index || 0) + match[0].length, nextMatchIndex).trim();
          fetchedVersesRaw.push({ id: `esv-${vCh}-${vNum}-${Math.random().toString(36).substr(2, 5)}`, reference: formatReference(`${currentBookName} ${vCh}:${vNum}`), text: vText });
        }
      }
    } else throw new Error("Passage not found."); 
  }
  else if (activeTrans === 'net') { 
    const targetUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(refQuery)}&type=json`; 
    const res = await fetchWithTimeout(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`); 
    const jsonData = await res.json(); 
    if (Array.isArray(jsonData)) fetchedVersesRaw = jsonData.map((v: any) => ({ id: `net-${v.bookname}-${v.chapter}-${v.verse}-${Math.random().toString(36).substr(2, 5)}`, reference: formatReference(`${currentBookName} ${v.chapter}:${v.verse}`), text: v.text.replace(/<[^>]+>/g, '').trim() })); 
    else throw new Error("Passage not found."); 
  }
  else if (['wlc', 'lxx', 'clementine', 'tr'].includes(activeTrans)) {
    const chapterNum = parseInt(parsed.chapter, 10);
    const bookId = parsed.bookId;
    if (!bookId) throw new Error(`Book not recognized.`);
    
    let bollsTrans = activeTrans.toUpperCase(); 
    if (activeTrans === 'clementine') bollsTrans = 'VULG'; 
    const bollsUrl = `https://bolls.life/get-text/${bollsTrans}/${bookId}/${chapterNum}/`; 
    let verseData; 
    try { 
      const res = await fetchWithTimeout(bollsUrl); 
      if (res.ok) verseData = await res.json(); 
      else throw new Error(); 
    } catch (e) { 
      try { 
        const proxyRes = await fetchWithTimeout(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(bollsUrl)}`); 
        if (!proxyRes.ok) throw new Error("Proxy failed"); 
        verseData = await proxyRes.json(); 
      } catch (proxyErr) { throw new Error("Failed to fetch translation."); } 
    }
    
    let filtered; 
    if (parsed.verse) { 
      const startV = parseInt(parsed.verse, 10);
      const endV = parsed.endVerse ? parseInt(parsed.endVerse, 10) : startV;
      filtered = verseData.filter((v: any) => v.verse >= startV && v.verse <= endV); 
    } else filtered = verseData;
    fetchedVersesRaw = filtered.map((v: any) => ({ id: `${activeTrans}-${bookId}-${chapterNum}-${v.verse}-${Math.random().toString(36).substr(2, 5)}`, reference: formatReference(`${currentBookName} ${chapterNum}:${v.verse}`), text: v.text.replace(/<[^>]+>/g, '').trim() }));
  } 
  else if (activeTrans === 'sblgnt') {
    const absBook = ({ 40: 'MAT', 41: 'MRK', 42: 'LUK', 43: 'JHN', 44: 'ACT', 45: 'ROM', 46: '1CO', 47: '2CO', 48: 'GAL', 49: 'EPH', 50: 'PHP', 51: 'COL', 52: '1TH', 53: '2TH', 54: '1TI', 55: '2TI', 56: 'TIT', 57: 'PHM', 58: 'HEB', 59: 'JAS', 60: '1PE', 61: '2PE', 62: '1JN', 63: '2JN', 64: '3JN', 65: 'JUD', 66: 'REV' } as any)[parsed.bookId || 0]; 
    if (!absBook) throw new Error(`NT only.`); 
    const helloaoUrl = `https://bible.helloao.org/api/grc_sbl/${absBook}/${parsed.chapter}.json`;
    const res = await fetchWithTimeout(helloaoUrl); 
    if (!res.ok) throw new Error(`Fetch failed.`); 
    const data = await res.json();
    if (data.chapter?.content) {
      const versesArray: any[] = []; 
      data.chapter.content.forEach((item: any) => { 
        if (item.type === 'verse') versesArray.push({ id: `helloao-${activeTrans}-${absBook}-${parsed.chapter}-${item.number}`, reference: formatReference(`${currentBookName} ${parsed.chapter}:${item.number}`), text: item.content.map((c: any) => typeof c === 'string' ? c : "").join('').trim() }); 
      });
      if (parsed.verse) { 
        const startV = parseInt(parsed.verse, 10);
        const endV = parsed.endVerse ? parseInt(parsed.endVerse, 10) : startV;
        fetchedVersesRaw = versesArray.filter(v => { const vNum = parseInt(v.reference.split(':').pop() || "0"); return vNum >= startV && vNum <= endV; }); 
      } else fetchedVersesRaw = versesArray;
    } else throw new Error(`Parse failed.`);
  } 
  else { 
    const res = await fetchWithTimeout(`https://bible-api.com/${encodeURIComponent(refQuery)}?translation=${activeTrans}`); 
    const data = await res.json(); 
    if (data.verses?.length > 0) fetchedVersesRaw = data.verses.map((v: any) => ({ id: `${v.book_id}-${v.chapter}-${v.verse}-${Math.random().toString(36).substr(2, 5)}`, reference: formatReference(`${currentBookName} ${v.chapter}:${v.verse}`), text: v.text.replace(/\n/g, ' ').trim() })); 
    else throw new Error("Not found."); 
  }

  return { fetchedVersesRaw, currentBookName, headerName, isBookStart };
};
