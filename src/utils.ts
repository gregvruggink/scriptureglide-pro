export const formatReference = (ref: string) => {
  if (!ref.toLowerCase().startsWith('psalm')) return ref;
  const isMultiChapter = ref.includes('-') && (
    (ref.match(/\d+/g) || []).length > 2 || 
    (!ref.includes(':') && ref.includes('-'))
  );
  if (isMultiChapter) return ref.replace(/^Psalm[s]?\b/i, 'Psalms');
  return ref.replace(/^Psalm[s]?\b/i, 'Psalm');
};

export const hexToRgba = (hex: string, intensity: number) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${intensity})`;
};

export const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 6000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
};
