const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const AudioCtx = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
const canRecord = Boolean(AudioCtx && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia);

export const recognitionSupported = Boolean(Recognition) || canRecord;

// ---------- Gemini speech-to-text (primary) ----------
// The browser recognizer is weak on Thai (stray spaces, wrong words, Thai/English mixes).
// Instead we record the utterance ourselves, detect when the speaker stops with a simple
// energy VAD, and have the backend transcribe it with Gemini. The browser recognizer
// remains the fallback (no login, no mic API, or Gemini failing).

let sttConfig = { apiUrl: '', getToken: () => null };
export function configureStt(config) {
  sttConfig = config;
}

const TARGET_RATE = 16000;
const SILENCE_END_MS = 1200; // Thai speakers pause mid-sentence; shorter cuts people off
const NO_SPEECH_MS = 10000;
const MAX_UTTERANCE_MS = 30000;
const MIN_SPEECH_MS = 350; // shorter blips are clicks/coughs, not speech
const PRE_ROLL_CHUNKS = 10; // keep a little audio from before the VAD fired so first syllables aren't clipped
const STT_RETRY_AFTER_MS = 15000; // the backend already fails over across models, so a failure here is brief
let sttDisabledUntil = 0;

function encodeWav(float32, inRate) {
  const ratio = inRate / TARGET_RATE;
  const outLen = Math.floor(float32.length / ratio);
  const buf = new ArrayBuffer(44 + outLen * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + outLen * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, TARGET_RATE, true);
  v.setUint32(28, TARGET_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, outLen * 2, true);
  // Quiet mics produce audio the model struggles with; normalize the peak to ~0.9 (capped gain).
  let peak = 0;
  for (let i = 0; i < float32.length; i++) peak = Math.max(peak, Math.abs(float32[i]));
  const gain = peak > 0.001 ? Math.min(0.9 / peak, 20) : 1;
  // Average each input window so downsampling doesn't alias.
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(float32.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += float32[j];
    const s = Math.max(-1, Math.min(1, (sum / (end - start)) * gain));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function createGeminiRecognizer({ lang, onAudioStart, onSpeechStart, onFinal, onEnd, onError, onTranscribeFailed }) {
  let cancelled = false;
  let ended = false;
  let stream = null;
  let ctx = null;
  let processor = null;
  let source = null;
  let abortCtl = null;

  const finish = () => {
    if (ended) return;
    ended = true;
    onEnd?.();
  };
  const release = () => {
    processor && (processor.onaudioprocess = null);
    try { processor?.disconnect(); } catch { /* already disconnected */ }
    try { source?.disconnect(); } catch { /* already disconnected */ }
    stream?.getTracks().forEach((t) => t.stop());
    ctx?.close().catch(() => {});
    processor = source = stream = ctx = null;
  };

  const transcribe = async (samples, rate) => {
    abortCtl = new AbortController();
    try {
      const res = await fetch(`${sttConfig.apiUrl}/stt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sttConfig.getToken()}` },
        body: JSON.stringify({ audio: toBase64(encodeWav(samples, rate)), mime_type: 'audio/wav', lang }),
        signal: abortCtl.signal,
      });
      if (!res.ok) throw new Error(`stt ${res.status}`);
      const { text } = await res.json();
      console.info('[stt] Gemini heard:', text);
      if (cancelled) return;
      if (text?.trim()) onFinal?.(text.trim());
      // Recorded >= MIN_SPEECH_MS of "speech" but Gemini transcribed nothing intelligible
      // (noise, a cough, a stray click) - without this the mic just goes quiet with no
      // feedback, indistinguishable from the app not having heard anything at all.
      else onTranscribeFailed?.('empty');
    } catch (err) {
      if (!cancelled) {
        console.warn('[stt] Gemini failed, using browser recognizer for a while:', err);
        sttDisabledUntil = Date.now() + STT_RETRY_AFTER_MS;
        onTranscribeFailed?.('request-failed');
      }
    } finally {
      finish();
    }
  };

  const start = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (err) {
      onError?.(err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError' ? 'audio-capture' : 'not-allowed');
      finish();
      return;
    }
    if (cancelled) {
      release();
      finish();
      return;
    }
    ctx = new AudioCtx();
    ctx.resume?.();
    source = ctx.createMediaStreamSource(stream);
    processor = ctx.createScriptProcessor(2048, 1, 1);
    source.connect(processor);
    processor.connect(ctx.destination); // required for onaudioprocess to fire; output stays silent
    onAudioStart?.();

    const rate = ctx.sampleRate;
    const chunkMs = (2048 / rate) * 1000;
    const startedAt = performance.now();
    let preRoll = [];
    let recorded = [];
    let speaking = false;
    let loudRun = 0;
    let speechMs = 0;
    let lastVoiceAt = 0;
    let noiseFloor = 0.003;
    let peakRms = 0;
    let speechLevel = 0;
    let done = false;

    const stop = (send) => {
      if (done) return;
      done = true;
      const samples = new Float32Array(recorded.reduce((n, c) => n + c.length, 0));
      let off = 0;
      for (const c of recorded) {
        samples.set(c, off);
        off += c.length;
      }
      release();
      console.info(
        `[stt] ${send ? 'sending' : 'dropped'}: speech ${Math.round(speechMs)}ms, peak level ${peakRms.toFixed(3)}, noise floor ${noiseFloor.toFixed(4)}`
      );
      if (send && !cancelled && speechMs >= MIN_SPEECH_MS) transcribe(samples, rate);
      else finish();
    };
    cancelRecording = () => stop(false);

    processor.onaudioprocess = (e) => {
      if (done) return;
      const data = new Float32Array(e.inputBuffer.getChannelData(0)); // copy: the buffer is reused
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      const now = performance.now();

      // Adaptive thresholds: speech must stand well above the ambient noise.
      const startThr = Math.max(0.008, noiseFloor * 3);
      const keepThr = Math.max(0.005, noiseFloor * 1.6);
      peakRms = Math.max(peakRms, rms);

      if (!speaking) {
        noiseFloor = noiseFloor * 0.95 + Math.min(rms, 0.05) * 0.05;
        preRoll.push(data);
        if (preRoll.length > PRE_ROLL_CHUNKS) preRoll.shift();
        loudRun = rms > startThr ? loudRun + 1 : 0;
        if (loudRun >= 2) {
          speaking = true;
          recorded = preRoll;
          preRoll = [];
          lastVoiceAt = now;
          speechLevel = rms;
          speechMs = chunkMs * loudRun;
          onSpeechStart?.();
        } else if (now - startedAt > NO_SPEECH_MS) {
          stop(false);
        }
        return;
      }

      recorded.push(data);
      // Judge "still talking" against the speaker's own level, not just the noise floor: with
      // auto-gain on, room noise can sit above a fixed threshold and the recording never ends.
      if (rms > startThr) speechLevel = speechLevel ? speechLevel * 0.9 + rms * 0.1 : rms;
      if (rms > Math.max(keepThr, speechLevel * 0.35)) {
        lastVoiceAt = now;
        speechMs += chunkMs;
      }
      if (now - lastVoiceAt > SILENCE_END_MS || now - startedAt > MAX_UTTERANCE_MS) stop(true);
    };
    finishRecording = () => stop(true);
  };

  let cancelRecording = null;
  let finishRecording = null;
  return {
    start() {
      start();
    },
    abort() {
      cancelled = true;
      abortCtl?.abort();
      if (cancelRecording) cancelRecording();
      else if (!stream) finish(); // aborted before the mic opened; start() will see `cancelled`
    },
    // Tapping the mic again mid-utterance should mean "I'm done talking, send it" the
    // way push-to-talk works - not silently discard everything already recorded. Safe
    // to call before speech is even detected too: stop(true) only transcribes once
    // MIN_SPEECH_MS has been recorded, so an early tap is effectively a no-op cancel.
    finishNow() {
      if (finishRecording) finishRecording();
      else this.abort();
    },
  };
}

// One-shot recognizer: listens for a single utterance, reports interim text while the
// user talks and the final transcript when they stop. Hands-free mode restarts it in a loop;
// continuous=true is avoided because mobile Chrome handles it poorly.
export function createRecognizer(opts) {
  if (canRecord && sttConfig.getToken() && Date.now() >= sttDisabledUntil) {
    return createGeminiRecognizer({ ...opts, lang: opts.lang || 'th-TH' });
  }
  return createBrowserRecognizer(opts);
}

function createBrowserRecognizer({ lang = 'th-TH', onAudioStart, onSpeechStart, onInterim, onFinal, onEnd, onError }) {
  if (!Recognition) return null;
  const rec = new Recognition();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (interim) onInterim?.(finalText + interim);
  };
  rec.onaudiostart = () => onAudioStart?.();
  rec.onspeechstart = () => onSpeechStart?.();
  rec.onerror = (e) => onError?.(e.error);
  rec.onend = () => {
    const text = finalText.trim();
    if (text) onFinal?.(text);
    onEnd?.();
  };
  // Unlike abort(), the native stop() ends gracefully and still fires onresult/onend
  // with whatever was heard so far - the browser-recognizer equivalent of "send what
  // I've got" rather than discarding it.
  rec.finishNow = () => rec.stop();
  return rec;
}

// Spoken commands. Thai recognizers often insert stray spaces, so matching is done on
// the transcript with whitespace removed.
const COMMANDS = [
  // (?<!เ)ปิด matters: "เปิด" (open) ends in the same three characters as "ปิด"
  // (close) - เ+ปิด - so a bare /ปิด.../ regex also matches inside "เปิดกล้อง"
  // (open camera) and, since this entry is checked first, silently routed every
  // "open camera" command to camera-close instead.
  { type: 'camera-close', re: /(?<!เ)ปิดกล้อง|closecamera/ },
  { type: 'camera-back', re: /(เปิด|สลับ|ใช้|เปลี่ยน|open|switch).*(กล้องหลัง|backcamera|rearcamera)|^กล้องหลัง/ },
  { type: 'camera-front', re: /(เปิด|สลับ|ใช้|เปลี่ยน|open|switch).*(กล้องหน้า|กล้องเซลฟี่|frontcamera|selfie)|^กล้องหน้า/ },
  // Not anchored at the end ($) on purpose: natural Thai speech almost always adds a
  // trailing particle ("เปิดกล้องนะ", "เปิดกล้องหน่อย"), and the old exact-match regex
  // rejected every one of those, silently falling through to a plain chat message.
  { type: 'camera-open', re: /^(เปิดกล้อง|opencamera)/ },
  { type: 'read', re: /อ่าน(ข้อความ|ป้าย|ตัวหนังสือ|เอกสาร|ฉลาก)|readthis|readthetext/ },
  { type: 'describe', re: /^(ถ่ายรูป|ถ่ายภาพ|อธิบาย(ภาพ|รูป)?)(หน่อย|ให้ฟัง|ที|ได้ไหม|ครับ|ค่ะ|คะ)*$|เห็นอะไร|ข้างหน้า(มี)?อะไร|ตรงหน้า(คือ|มี)อะไร|describe|whatdoyousee|takea(photo|picture)/ },
  { type: 'repeat', re: /พูดอีก(ครั้ง|ที)|อีกครั้ง|ว่าอีกที|repeat/ },
  { type: 'stop-speaking', re: /^(หยุดพูด|หยุด|เงียบ|พอ|stop)$/ },
  { type: 'new-chat', re: /แชทใหม่|เริ่มใหม่|newchat/ },
  { type: 'a11y-off', re: /(?<!เ)ปิดโหมด(ช่วยเหลือ|ผู้พิการ)|exitaccessibility/ },
  { type: 'help', re: /^(ช่วยเหลือ|คำสั่ง|ทำอะไรได้บ้าง|help)$|มีคำสั่งอะไร/ },
];

export function parseCommand(transcript) {
  const t = transcript.toLowerCase().replace(/[\s.,!?]/g, '');
  if (!t || t.length > 40) return null; // long utterances are questions, not commands
  return COMMANDS.find((c) => c.re.test(t))?.type ?? null;
}

export const HELP_TEXT =
  'คำสั่งเสียงที่ใช้ได้ ได้แก่ เปิดกล้องหลัง, เปิดกล้องหน้า, ปิดกล้อง, ถ่ายรูป หรือ อธิบาย เพื่อให้ฉันบอกว่าเห็นอะไร, ' +
  'อ่านข้อความ เพื่อให้ฉันอ่านป้ายหรือเอกสาร, พูดอีกครั้ง, หยุดพูด, แชทใหม่ และ ปิดโหมดช่วยเหลือ. ' +
  'หรือพูดถามอะไรก็ได้ตามปกติ';
