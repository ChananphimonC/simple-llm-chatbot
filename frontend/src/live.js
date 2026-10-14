// Gemini Live: real-time, two-way voice over a single WebSocket straight from the browser to
// Gemini. Replaces the record -> VAD -> /stt -> /chat -> /tts round trip (four sequential network
// hops and a hand-tuned silence timer) with a streaming session where Gemini does the turn
// detection, answers in audio as it generates it, and can be interrupted mid-sentence.
//
// The browser never sees GOOGLE_API_KEY: /live/token mints a single-use ephemeral token whose
// session config (prompt, tools, voice, VAD) is locked server-side.

export const liveSupported =
  typeof window !== 'undefined' &&
  Boolean(window.AudioContext || window.webkitAudioContext) &&
  'AudioWorkletNode' in window &&
  typeof WebSocket !== 'undefined' &&
  Boolean(navigator.mediaDevices?.getUserMedia);

const INPUT_RATE = 16000; // Live API expects 16 kHz 16-bit PCM in...
const DEFAULT_OUTPUT_RATE = 24000; // ...and sends 24 kHz 16-bit PCM back.
const CHUNK_SAMPLES = 320; // 20 ms per message: smaller chunks = lower latency, 50 msgs/s is nothing for a WebSocket.

// Runs on the audio thread. The mic arrives at the device's native rate (44.1/48 kHz), so box-average
// down to 16 kHz here and ship fixed 20 ms Int16 chunks to the main thread.
const WORKLET_SRC = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${INPUT_RATE};
    this.pos = 0;
    this.acc = 0;
    this.cnt = 0;
    this.out = new Int16Array(${CHUNK_SAMPLES});
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i];
      this.cnt++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        const s = Math.max(-1, Math.min(1, this.acc / this.cnt));
        this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        this.acc = 0;
        this.cnt = 0;
        if (this.n === ${CHUNK_SAMPLES}) {
          const buf = this.out.buffer.slice(0);
          this.port.postMessage(buf, [buf]);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`;

// Two short rising tones: the audible "I'm listening" cue. Local synthesis, so it costs no quota and no latency.
function chime(ctx) {
  const t0 = ctx.currentTime;
  [
    [880, 0],
    [1175, 0.11],
  ].forEach(([freq, offset]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + offset);
    gain.gain.exponentialRampToValueAtTime(0.15, t0 + offset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + offset);
    osc.stop(t0 + offset + 0.12);
  });
}

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Gapless playback of streamed PCM chunks, with an instant flush for barge-in.
function createPlayer(ctx, onSpeaking) {
  let nextTime = 0;
  let speaking = false;
  const active = new Set();
  const setSpeaking = (v) => {
    if (speaking !== v) {
      speaking = v;
      onSpeaking?.(v);
    }
  };
  return {
    enqueue(b64, rate = DEFAULT_OUTPUT_RATE) {
      const bytes = base64ToBytes(b64);
      const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
      if (!pcm.length) return;
      const f32 = new Float32Array(pcm.length);
      for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768;
      // An AudioBuffer may have any sample rate; the browser resamples to the device on playback.
      const buf = ctx.createBuffer(1, f32.length, rate);
      buf.copyToChannel(f32, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      const now = ctx.currentTime;
      // First chunk (or after an underrun) gets a small lead so it doesn't glitch; the rest chain gaplessly.
      const startAt = nextTime > now ? nextTime : now + 0.03;
      src.start(startAt);
      nextTime = startAt + buf.duration;
      active.add(src);
      src.onended = () => {
        active.delete(src);
        if (!active.size) setSpeaking(false);
      };
      setSpeaking(true);
    },
    flush() {
      for (const src of active) {
        src.onended = null;
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      }
      active.clear();
      nextTime = 0;
      setSpeaking(false);
    },
  };
}

/**
 * Starts a Live session and returns a handle immediately; progress is reported via callbacks.
 *
 * onState('connecting' | 'live')
 * onSpeaking(bool)               - model audio is playing
 * onTranscript({ user, model })  - one completed (or interrupted) exchange
 * onToolCall(name, args)         - async; resolves with the object sent back to the model
 * onClose({ error?, userInitiated })
 */
export function startLiveSession({ apiUrl, getToken, onState, onSpeaking, onTranscript, onToolCall, onClose }) {
  let stopped = false;
  let closed = false;
  let ready = false; // setupComplete received: only then may audio be sent
  let session = null;
  let mic = null;
  let ctx = null;
  let captureNode = null;
  let player = null;
  let turn = { user: '', model: '' };

  const finishTurn = () => {
    const done = { user: turn.user.trim(), model: turn.model.trim() };
    turn = { user: '', model: '' };
    if (done.user || done.model) onTranscript?.(done);
  };

  const teardown = () => {
    ready = false;
    player?.flush();
    try {
      captureNode?.port && (captureNode.port.onmessage = null);
      captureNode?.disconnect();
    } catch {
      /* already disconnected */
    }
    mic?.getTracks().forEach((t) => t.stop());
    ctx?.close().catch(() => {});
    captureNode = mic = ctx = null;
  };

  const finish = (error) => {
    if (closed) return;
    closed = true;
    finishTurn();
    teardown();
    onClose?.({ error, userInitiated: stopped });
  };

  const handleToolCalls = async (calls = []) => {
    const functionResponses = [];
    for (const call of calls) {
      let response;
      try {
        response = await onToolCall(call.name, call.args || {});
      } catch (err) {
        response = { ok: false, error: String(err?.message || err) };
      }
      functionResponses.push({ id: call.id, name: call.name, response: response || { ok: true } });
    }
    if (!closed) session?.sendToolResponse({ functionResponses });
  };

  const handleMessage = (m) => {
    if (m.setupComplete) {
      ready = true;
      if (ctx) chime(ctx);
      onState?.('live');
    }
    const sc = m.serverContent;
    if (sc) {
      if (sc.interrupted) {
        // Barge-in: drop whatever is still queued so the user isn't talked over.
        player?.flush();
        finishTurn();
      }
      for (const part of sc.modelTurn?.parts || []) {
        const data = part.inlineData?.data;
        if (!data) continue;
        const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1]) || DEFAULT_OUTPUT_RATE;
        player?.enqueue(data, rate);
      }
      if (sc.inputTranscription?.text) turn.user += sc.inputTranscription.text;
      if (sc.outputTranscription?.text) turn.model += sc.outputTranscription.text;
      if (sc.turnComplete) finishTurn();
    }
    if (m.toolCall) handleToolCalls(m.toolCall.functionCalls);
  };

  (async () => {
    try {
      onState?.('connecting');
      // Token, mic permission and the SDK chunk are independent: do them together to shave start-up time.
      const sdkPromise = import('@google/genai');
      const [{ token, model }, stream, { GoogleGenAI }] = await Promise.all([
        fetch(`${apiUrl}/live/token`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` } }).then(
          async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              const err = new Error(data.detail || `ขอสิทธิ์เชื่อมต่อไม่สำเร็จ (${res.status})`);
              err.status = res.status;
              throw err;
            }
            return data;
          }
        ),
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        }),
        sdkPromise,
      ]);
      mic = stream;
      // stop() can land during any await below; finish() has already run by then, so release what was acquired since.
      if (stopped) return teardown();

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx({ latencyHint: 'interactive' });
      await ctx.resume();
      const workletUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
      try {
        await ctx.audioWorklet.addModule(workletUrl);
      } finally {
        URL.revokeObjectURL(workletUrl);
      }
      if (stopped) return teardown();
      player = createPlayer(ctx, onSpeaking);

      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });
      session = await ai.live.connect({
        model,
        // The real config is locked into the token server-side; these only matter if that is ever dropped.
        config: { responseModalities: ['AUDIO'], inputAudioTranscription: {}, outputAudioTranscription: {} },
        callbacks: {
          onmessage: handleMessage,
          onerror: (e) => console.warn('[live] socket error', e?.message || e),
          onclose: (e) => {
            console.info('[live] closed', e?.code, e?.reason);
            finish(stopped ? undefined : e?.reason || 'การเชื่อมต่อถูกตัด');
          },
        },
      });
      if (stopped) {
        session.close();
        return teardown();
      }

      const source = ctx.createMediaStreamSource(mic);
      captureNode = new AudioWorkletNode(ctx, 'pcm-capture');
      captureNode.port.onmessage = (e) => {
        if (!ready || closed) return;
        session.sendRealtimeInput({
          audio: { data: bytesToBase64(new Uint8Array(e.data)), mimeType: `audio/pcm;rate=${INPUT_RATE}` },
        });
      };
      // Muted tail into the destination keeps the worklet being pulled in every browser.
      const mute = ctx.createGain();
      mute.gain.value = 0;
      source.connect(captureNode).connect(mute).connect(ctx.destination);
    } catch (err) {
      console.warn('[live] failed to start', err);
      finish(stopped ? undefined : err?.message || 'เริ่มเสียงสดไม่สำเร็จ');
    }
  })();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (session) {
        try {
          session.close();
        } catch {
          /* socket already gone */
        }
      }
      finish();
    },
    sendVideoFrame(base64Jpeg) {
      if (!ready || closed || !session) return;
      session.sendRealtimeInput({ video: { data: base64Jpeg, mimeType: 'image/jpeg' } });
    },
  };
}
