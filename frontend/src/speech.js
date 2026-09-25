const THAI_RANGE = /[฀-๿]/;
// Digits and units read Thai when they land in a Thai sentence ("ปี 2568", "10 บาท") -
// keeping them neutral means they inherit whichever script surrounds them instead of
// forcing a switch to the en-US voice mid-sentence.
const NEUTRAL_CHAR = /[\s.,!?;:()"'`\-–—…0-9%/+]/;

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

// Every segment boundary becomes a new SpeechSynthesisUtterance, and browsers insert
// an audible gap between queued utterances (plus a voice/engine switch if the language
// changed). A short embedded term ("AI", "GPT", "ChatGPT") isn't worth that stutter -
// folding it into the neighboring Thai run keeps the sentence flowing, at the minor cost
// of the Thai voice sounding out Latin letters instead of a "proper" English accent.
const SHORT_FOREIGN_MAX_LENGTH = 8;

function mergeShortForeignRuns(segments) {
  const merged = segments.map((s) => ({ ...s }));

  for (let i = merged.length - 1; i >= 0; i--) {
    const seg = merged[i];
    if (seg.thai || seg.text.trim().length > SHORT_FOREIGN_MAX_LENGTH) continue;
    const prev = merged[i - 1];
    const next = merged[i + 1];
    if (prev?.thai) {
      prev.text += seg.text;
      merged.splice(i, 1);
    } else if (next?.thai) {
      next.text = seg.text + next.text;
      merged.splice(i, 1);
    }
  }
  return merged;
}

// Chrome silently stops (or garbles) any single utterance once it runs past ~15s of
// speech - a long Gemini paragraph hits that easily. Splitting at sentence boundaries
// keeps each utterance short, and pause()/resume() below is the standard workaround for
// utterances that still land near the limit.
const MAX_CHUNK_LENGTH = 200;

function splitLongSegment(text) {
  if (text.length <= MAX_CHUNK_LENGTH) return [text];

  const sentences = text.split(/(?<=[.!?ฯ\n])\s+/);
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && (current + ' ' + sentence).length > MAX_CHUNK_LENGTH) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

let keepAliveTimer = null;

function startKeepAlive() {
  stopKeepAlive();
  keepAliveTimer = setInterval(() => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }
  }, 10000);
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

export function speak(text, { onStart, onEnd } = {}) {
  if (!speechSupported) return;
  stopKeepAlive();
  window.speechSynthesis.cancel();

  const scriptSegments = mergeShortForeignRuns(splitByScript(stripMarkdownForSpeech(text)));
  const chunks = scriptSegments.flatMap((seg) =>
    splitLongSegment(seg.text).map((chunkText) => ({ text: chunkText, thai: seg.thai }))
  );

  if (!chunks.length) {
    onEnd?.();
    return;
  }

  chunks.forEach((chunk, i) => {
    const utterance = new SpeechSynthesisUtterance(chunk.text);
    utterance.lang = chunk.thai ? 'th-TH' : 'en-US';
    utterance.rate = 1;
    if (i === 0) {
      utterance.onstart = () => {
        startKeepAlive();
        onStart?.();
      };
    }
    if (i === chunks.length - 1) {
      utterance.onend = () => {
        stopKeepAlive();
        onEnd?.();
      };
      utterance.onerror = () => {
        stopKeepAlive();
        onEnd?.();
      };
    }
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking() {
  if (!speechSupported) return;
  stopKeepAlive();
  window.speechSynthesis.cancel();
}
