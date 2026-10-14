import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const MAX_EDGE = 1280; // keeps uploads small on mobile data; plenty for Gemini vision

const CameraPanel = forwardRef(function CameraPanel({ facing, onFlip, onClose, onShutter, onStatus }, ref) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        const msg = 'เบราว์เซอร์นี้เปิดกล้องไม่ได้ (ต้องใช้ผ่าน HTTPS หรือ localhost)';
        setError(msg);
        onStatus?.(msg, false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        setReady(true);
        onStatus?.(facing === 'user' ? 'เปิดกล้องหน้าแล้ว' : 'เปิดกล้องหลังแล้ว', true);
      } catch (err) {
        const msg =
          err.name === 'NotAllowedError'
            ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตในการตั้งค่าเบราว์เซอร์'
            : 'เปิดกล้องไม่สำเร็จ';
        setError(msg);
        onStatus?.(msg, false);
      }
    };
    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !ready || !video.videoWidth) return null;
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  useImperativeHandle(ref, () => ({ capture }));

  return (
    <section
      aria-label="กล้อง"
      className="relative mb-3 shrink-0 overflow-hidden rounded-xl border border-white/70 bg-black shadow-[0_12px_30px_-10px_rgba(15,17,26,0.35)]"
    >
      <video
        ref={videoRef}
        playsInline
        muted
        aria-hidden="true"
        className={`aspect-[4/3] max-h-[40dvh] w-full object-cover ${facing === 'user' ? '-scale-x-100' : ''}`}
      />
      {error && (
        <p role="alert" className="absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center text-body-sm text-white">
          {error}
        </p>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-8">
        <button
          onClick={onFlip}
          aria-label={facing === 'user' ? 'สลับเป็นกล้องหลัง' : 'สลับเป็นกล้องหน้า'}
          className="flex h-11 items-center gap-1.5 rounded-full bg-white/20 px-4 text-label-md text-white backdrop-blur transition hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {facing === 'user' ? 'กล้องหน้า' : 'กล้องหลัง'} ⟲
        </button>
        <button
          onClick={onShutter}
          disabled={!ready}
          aria-label="ถ่ายรูปแล้วให้ AI อธิบาย"
          className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-white/30 transition hover:bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
        >
          <span className="h-8 w-8 rounded-full bg-white" />
        </button>
        <button
          onClick={onClose}
          aria-label="ปิดกล้อง"
          className="flex h-11 items-center rounded-full bg-white/20 px-4 text-label-md text-white backdrop-blur transition hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          ปิด
        </button>
      </div>
    </section>
  );
});

export default CameraPanel;
