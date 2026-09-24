import { useEffect, useId, useRef, useState } from 'react';

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
      <path d="M12 9v4" />
      <path d="M10.3 3.9 1.9 18.5A1.5 1.5 0 0 0 3.2 21h17.6a1.5 1.5 0 0 0 1.3-2.5L13.7 3.9a1.5 1.5 0 0 0-3.4 0Z" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Auth gate: mounted whenever the caller has no token. Renders the chat shell
 * behind it (via App's own layout) plus a blocking glass card on top —
 * there's no guest path, so this never offers a dismiss/close affordance.
 */
export default function LoginModal({ onAuthenticated }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const cardRef = useRef(null);
  const usernameRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    usernameRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const nodes = cardRef.current?.querySelectorAll(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const switchMode = (next) => {
    if (next === mode || loading) return;
    setMode(next);
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    const user = username.trim();
    if (!user || !password || loading) return;

    setLoading(true);
    setError('');
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      let res;
      if (mode === 'register') {
        res = await fetch(`${apiUrl}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user, password }),
        });
      } else {
        const form = new URLSearchParams();
        form.set('username', user);
        form.set('password', password);
        res = await fetch(`${apiUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form,
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `เข้าสู่ระบบไม่สำเร็จ (${res.status})`);
      onAuthenticated(data.access_token);
    } catch (err) {
      const isNetworkError = err instanceof TypeError;
      setError(isNetworkError ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบว่า backend กำลังรันอยู่' : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#191b24]/35 backdrop-blur-sm" />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="login-modal-in relative w-full max-w-sm rounded-[2rem] border border-white/70 bg-white/85 p-7 shadow-[0_28px_60px_-20px_rgba(127,90,240,0.35),0_4px_16px_rgba(15,17,26,0.06)] backdrop-blur-2xl sm:p-8"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="relative h-12 w-12 shrink-0 rounded-full bg-gradient-to-br from-[#7f5af0] via-[#a78bfa] to-[#70d6ff] shadow-[0_0_18px_rgba(112,214,255,0.45)]">
            <span className="absolute inset-[2px] rounded-full bg-gradient-to-tl from-white/40 to-transparent" />
          </span>
          <h1 id={titleId} className="mt-3 text-headline-sm text-on-surface">
            {mode === 'login' ? 'เข้าสู่ระบบ Lumina AI' : 'สร้างบัญชี Lumina AI'}
          </h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            {mode === 'login' ? 'เพื่อดึงบทสนทนาที่คุณคุยไว้กลับมา' : 'เพื่อให้ Lumina จำบทสนทนาของคุณได้'}
          </p>
        </div>

        <div className="mb-5 flex rounded-full border border-white/70 bg-white/60 p-1">
          {[
            { key: 'login', label: 'เข้าสู่ระบบ' },
            { key: 'register', label: 'สมัครใหม่' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => switchMode(tab.key)}
              aria-pressed={mode === tab.key}
              className={`flex-1 rounded-full px-3 py-2 text-label-lg transition ${
                mode === tab.key
                  ? 'bg-white text-on-surface shadow-[0_4px_12px_rgba(15,17,26,0.06)]'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="px-1 text-label-md text-on-surface-variant">ชื่อผู้ใช้</span>
            <input
              ref={usernameRef}
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="rounded-full border border-white/70 bg-white/70 px-4 py-2.5 text-body-md text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:shadow-[0_0_0_1px_rgba(102,62,213,0.35),0_0_20px_rgba(112,214,255,0.3)]"
              placeholder="เช่น chananphimon"
              required
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="px-1 text-label-md text-on-surface-variant">รหัสผ่าน</span>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-full border border-white/70 bg-white/70 px-4 py-2.5 text-body-md text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:shadow-[0_0_0_1px_rgba(102,62,213,0.35),0_0_20px_rgba(112,214,255,0.3)]"
              placeholder="••••••••"
              required
              minLength={mode === 'register' ? 8 : undefined}
            />
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-2xl border border-error-container/80 bg-error-container/40 px-4 py-3 text-body-sm text-on-error-container">
              <AlertIcon />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
            className="mt-2 flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#7f5af0] to-[#b580ff] text-label-lg text-on-primary shadow-[0_4px_14px_rgba(127,90,240,0.35)] transition hover:shadow-[0_0_20px_rgba(112,214,255,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {loading && <SpinnerIcon />}
            {loading ? 'กำลังดำเนินการ...' : mode === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}
          </button>
        </form>
      </div>
    </div>
  );
}
