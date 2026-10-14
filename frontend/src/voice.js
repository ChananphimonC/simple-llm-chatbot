const SpeechRecognitionImpl =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const sttSupported = Boolean(SpeechRecognitionImpl);
export const cameraSupported =
  typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

// Words that mean "describe what's around me" rather than "send this as a chat
// message" — matched loosely since STT transcripts are noisy.
const CAMERA_TRIGGER_WORDS = [
  'เปิดกล้อง',
  'ดูรอบตัว',
  'มองเห็นอะไร',
  'สิ่งที่เห็น',
  'บอกว่าเห็นอะไร',
  'what do you see',
  'what can you see',
  'open the camera',
  'describe what you see',
];

export function isCameraCommand(transcript) {
  const t = transcript.toLowerCase();
  return CAMERA_TRIGGER_WORDS.some((w) => t.includes(w));
}

// Listens for a single utterance; resolves with the transcript, rejects with
// a short error code ('not-allowed', 'no-speech', ...) on failure.
export function listenOnce() {
  return new Promise((resolve, reject) => {
    if (!sttSupported) {
      reject(new Error('unsupported'));
      return;
    }
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = 'th-TH';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let settled = false;
    recognition.onresult = (e) => {
      settled = true;
      resolve(e.results[0][0].transcript);
    };
    recognition.onerror = (e) => {
      settled = true;
      reject(new Error(e.error || 'unknown'));
    };
    recognition.onend = () => {
      if (!settled) reject(new Error('no-speech'));
    };
    recognition.start();
  });
}

// Opens the camera just long enough to grab one frame, then releases it —
// this isn't a live video feature, so there's no reason to hold the stream open.
export async function captureCameraFrame() {
  if (!cameraSupported) throw new Error('unsupported');

  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.playsInline = true;
    await video.play();
    await new Promise((resolve) => {
      if (video.readyState >= 2) resolve();
      else video.onloadeddata = () => resolve();
    });

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('capture-failed'))), 'image/jpeg', 0.85);
    });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}
