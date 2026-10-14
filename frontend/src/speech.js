const THAI_RANGE = /[฀-๿]/;
// Digits and units read Thai when they land in a Thai sentence ("ปี 2568", "10 บาท") -
// keeping them neutral means they inherit whichever script surrounds them instead of
// forcing a switch to the en-US voice mid-sentence.
const NEUTRAL_CHAR = /[\s.,!?;:()"'`\-–—…0-9%/+]/;

const browserTtsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
// Gemini TTS (server) is the primary voice; the browser's own voices are the fallback.
export const speechSupported = typeof window !== 'undefined' && (browserTtsSupported || typeof Audio !== 'undefined');

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

function splitLongSegment(text, maxLength = MAX_CHUNK_LENGTH) {
  if (text.length <= maxLength) return [text];

  const sentences = text.split(/(?<=[.!?ฯ\n])\s+/);
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && (current + ' ' + sentence).length > maxLength) {
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

function speakWithBrowser(text, { onStart, onEnd } = {}) {
  if (!browserTtsSupported) {
    onEnd?.();
    return;
  }
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

function stopBrowserSpeech() {
  if (!browserTtsSupported) return;
  stopKeepAlive();
  window.speechSynthesis.cancel();
}

// ---------- Gemini TTS (primary) ----------

let ttsConfig = { apiUrl: '', getToken: () => null };
export function configureTts(config) {
  ttsConfig = config;
}

// Gemini speaks Thai/English mixes natively, so no script-splitting is needed - only chunking,
// so the first audio starts after one short request instead of the whole reply.
const GEMINI_CHUNK_LENGTH = 300;
const GEMINI_RETRY_AFTER_MS = 45000; // after a TTS failure (e.g. quota), use browser voices for a while

const audioEl = typeof Audio !== 'undefined' ? new Audio() : null;
let playId = 0;
let geminiDisabledUntil = 0;
let abortController = null;

// Browsers only allow audio.play() after a user gesture; replies arrive asynchronously, so
// the shared element is "unlocked" by the first tap/keypress anywhere on the page.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
function unlockAudio() {
  if (!audioEl) return;
  audioEl.src = SILENT_WAV;
  audioEl.play().catch(() => {});
}
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  document.addEventListener('keydown', unlockAudio, { once: true });
}

async function fetchGeminiAudio(text, signal) {
  const token = ttsConfig.getToken();
  if (!token) throw new Error('not signed in');
  const res = await fetch(`${ttsConfig.apiUrl}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) throw new Error(`tts ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

function playUrl(url) {
  return new Promise((resolve, reject) => {
    audioEl.onended = resolve;
    audioEl.onerror = () => reject(new Error('audio playback failed'));
    audioEl.src = url;
    audioEl.play().catch(reject);
  });
}

async function speakWithGemini(chunks, id, signal, { onStart, onEnd }) {
  let i = 0;
  let started = false;
  try {
    let next = fetchGeminiAudio(chunks[0], signal);
    for (; i < chunks.length; i++) {
      const url = await next;
      if (id !== playId) {
        URL.revokeObjectURL(url);
        return;
      }
      // Fetch the next chunk while this one plays so there's no gap between them.
      next = i + 1 < chunks.length ? fetchGeminiAudio(chunks[i + 1], signal) : null;
      next?.catch(() => {});
      if (!started) {
        started = true;
        onStart?.();
      }
      await playUrl(url);
      URL.revokeObjectURL(url);
      if (id !== playId) return;
    }
    onEnd?.();
  } catch {
    if (id !== playId) return;
    geminiDisabledUntil = Date.now() + GEMINI_RETRY_AFTER_MS;
    // Pick up where Gemini failed using the browser's own voice.
    speakWithBrowser(chunks.slice(i).join(' '), { onStart: started ? undefined : onStart, onEnd });
  }
}

export function speak(text, callbacks = {}) {
  stopSpeaking();
  const clean = stripMarkdownForSpeech(text);
  if (!clean) {
    callbacks.onEnd?.();
    return;
  }
  if (!audioEl || Date.now() < geminiDisabledUntil || !ttsConfig.getToken()) {
    speakWithBrowser(clean, callbacks);
    return;
  }
  const id = ++playId;
  abortController = new AbortController();
  speakWithGemini(splitLongSegment(clean, GEMINI_CHUNK_LENGTH), id, abortController.signal, callbacks);
}

export function stopSpeaking() {
  playId++;
  abortController?.abort();
  abortController = null;
  if (audioEl) {
    audioEl.onended = null;
    audioEl.onerror = null;
    audioEl.pause();
  }
  stopBrowserSpeech();
}
