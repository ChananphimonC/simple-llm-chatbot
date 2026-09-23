const THAI_RANGE = /[฀-๿]/;
const NEUTRAL_CHAR = /[\s.,!?;:()"'`\-–—…]/;

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

// Strips markdown syntax so it isn't read aloud literally ("asterisk asterisk bold asterisk asterisk").
export function stripMarkdownForSpeech(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim();
}

// Gemini answers freely mix Thai and English in one reply; a single utterance.lang
// mispronounces whichever language it wasn't set for. Splitting into same-script runs
// lets each run get its own voice.
export function splitByScript(text) {
  const segments = [];
  let current = '';
  let currentIsThai = null;

  for (const ch of text) {
    if (NEUTRAL_CHAR.test(ch)) {
      current += ch;
      continue;
    }
    const isThai = THAI_RANGE.test(ch);
    if (currentIsThai === null) currentIsThai = isThai;
    if (isThai !== currentIsThai) {
      segments.push({ text: current, thai: currentIsThai });
      current = ch;
      currentIsThai = isThai;
    } else {
      current += ch;
    }
  }
  if (current.trim()) segments.push({ text: current, thai: currentIsThai ?? false });
  return segments.filter((s) => s.text.trim());
}

export function speak(text, { onStart, onEnd } = {}) {
  if (!speechSupported) return;
  window.speechSynthesis.cancel();

  const segments = splitByScript(stripMarkdownForSpeech(text));
  if (!segments.length) {
    onEnd?.();
    return;
  }

  segments.forEach((seg, i) => {
    const utterance = new SpeechSynthesisUtterance(seg.text);
    utterance.lang = seg.thai ? 'th-TH' : 'en-US';
    utterance.rate = 1;
    if (i === 0) utterance.onstart = () => onStart?.();
    if (i === segments.length - 1) {
      utterance.onend = () => onEnd?.();
      utterance.onerror = () => onEnd?.();
    }
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking() {
  if (!speechSupported) return;
  window.speechSynthesis.cancel();
}
