import { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
import ReactMarkdown from 'react-markdown';
import { speak, stopSpeaking, speechSupported } from './speech';
import LoginModal from './LoginModal';

const TOKEN_KEY = 'lumina_token';
const CONVERSATION_KEY = 'lumina_conversation_id';

const SUGGESTIONS = [
  'สรุปบทความยาวๆ ให้อ่านง่าย',
  'เขียนอีเมลขอเลื่อนนัด สุภาพๆ',
  'ช่วยดีบักโค้ด Python ให้หน่อย',
  'ไอเดียของขวัญวันเกิดเพื่อน',
];

function Orb({ size = 'sm', pulse = false }) {
  const dims = size === 'lg' ? 'h-14 w-14' : 'h-7 w-7';
  return (
    <span
      className={`relative ${dims} shrink-0 rounded-full bg-gradient-to-br from-[#7f5af0] via-[#a78bfa] to-[#70d6ff] shadow-[0_0_18px_rgba(112,214,255,0.45)] ${
        pulse ? 'animate-[breathe_2.4s_ease-in-out_infinite]' : ''
      }`}
    >
      <span className="absolute inset-[2px] rounded-full bg-gradient-to-tl from-white/40 to-transparent" />
    </span>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

function SpeakerIcon({ muted = false }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 6a9 9 0 0 1 0 12" />}
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
      <path d="M12 9v4" />
      <path d="M10.3 3.9 1.9 18.5A1.5 1.5 0 0 0 3.2 21h17.6a1.5 1.5 0 0 0 1.3-2.5L13.7 3.9a1.5 1.5 0 0 0-3.4 0Z" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

function HistoryPanel({ conversations, loading, activeId, onSelect, onNewChat, onClose }) {
  const panelRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const handlePointerDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={titleId}
      className="login-modal-in absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/90 shadow-[0_20px_50px_-15px_rgba(127,90,240,0.3),0_4px_16px_rgba(15,17,26,0.06)] backdrop-blur-2xl"
    >
      <div className="flex items-center justify-between border-b border-white/70 px-4 py-3">
        <p id={titleId} className="text-label-lg text-on-surface">ประวัติการสนทนา</p>
        <button
          onClick={onNewChat}
          className="flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#7f5af0] to-[#b580ff] px-3 py-1.5 text-label-md text-on-primary shadow-[0_4px_10px_rgba(127,90,240,0.3)] transition hover:shadow-[0_0_16px_rgba(112,214,255,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <PlusIcon />
          แชทใหม่
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto no-scrollbar">
        {loading ? (
          <p className="px-4 py-6 text-center text-body-sm text-on-surface-variant">กำลังโหลด...</p>
        ) : conversations.length === 0 ? (
          <p className="px-4 py-6 text-center text-body-sm text-on-surface-variant">ยังไม่มีบทสนทนา</p>
        ) : (
          conversations.map((c) => (
            <button
              key={c.conversation_id}
              onClick={() => onSelect(c.conversation_id)}
              className={`block w-full truncate px-4 py-3 text-left text-body-sm transition hover:bg-black/5 ${
                String(c.conversation_id) === String(activeId) ? 'bg-primary/10 text-primary' : 'text-on-surface'
              }`}
            >
              {c.preview}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 py-1">
      <Orb pulse />
      <div className="flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2.5 shadow-[0_4px_12px_rgba(15,17,26,0.03)]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-primary/70"
            style={{ animation: 'pulse-dot 1.2s cubic-bezier(0.16, 1, 0.3, 1) infinite', animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function ReplayButton({ speaking, onClick }) {
  if (!speechSupported) return null;
  return (
    <button
      onClick={onClick}
      aria-label={speaking ? 'หยุดอ่านออกเสียง' : 'ฟังคำตอบนี้'}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-on-surface-variant/70 transition hover:bg-black/5 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
        speaking ? 'text-primary' : ''
      }`}
    >
      {speaking ? <StopIcon /> : <SpeakerIcon />}
    </button>
  );
}

function MessageRow({ role, text, speaking, onToggleSpeak }) {
  if (role === 'user') {
    return (
      <div className="flex w-full justify-end message-in">
        <div className="max-w-[75%] rounded-[1.5rem] rounded-br-lg bg-white px-5 py-3 text-body-md text-on-surface shadow-[0_4px_16px_rgba(15,17,26,0.06)]">
          {text}
        </div>
      </div>
    );
  }

  if (role === 'error') {
    return (
      <div className="flex w-full items-start gap-3 message-in">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-error">
          <AlertIcon />
        </div>
        <div className="flex max-w-[85%] flex-col gap-2 rounded-[1.5rem] rounded-bl-lg border border-error-container/80 bg-error-container/40 px-5 py-3.5 text-body-md text-on-error-container">
          <span>{text}</span>
          <div className="flex justify-end">
            <ReplayButton speaking={speaking} onClick={onToggleSpeak} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full items-start gap-3 message-in">
      <div className="mt-0.5">
        <Orb pulse={speaking} />
      </div>
      <div className="flex max-w-[85%] flex-col gap-1 rounded-[1.5rem] rounded-bl-lg bg-white/70 px-5 py-3.5 shadow-[0_4px_16px_rgba(15,17,26,0.04)] backdrop-blur-sm">
        <div className="md-content text-body-md leading-7 text-on-surface [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
        <div className="flex justify-end">
          <ReplayButton speaking={speaking} onClick={onToggleSpeak} />
        </div>
      </div>
    </div>
  );
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [conversationId, setConversationId] = useState(() => localStorage.getItem(CONVERSATION_KEY));
  const [showLoginModal, setShowLoginModal] = useState(() => !localStorage.getItem(TOKEN_KEY));
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const lastAutoSpokenRef = useRef(-1);

  const apiUrl = import.meta.env.VITE_API_URL;

  const signOut = ({ reopenModal = false } = {}) => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CONVERSATION_KEY);
    setToken(null);
    setConversationId(null);
    setMessages([]);
    if (reopenModal) setShowLoginModal(true);
  };

  const handleAuthenticated = async (newToken) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setShowLoginModal(false);

    try {
      const res = await fetch(`${apiUrl}/conversations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${newToken}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      localStorage.setItem(CONVERSATION_KEY, String(data.conversation_id));
      setConversationId(String(data.conversation_id));
    } catch {
      setMessages([{ role: 'error', text: 'เข้าสู่ระบบสำเร็จ แต่เปิดห้องแชทใหม่ไม่ได้ ลองรีเฟรชหน้านี้' }]);
    }
  };

  const openHistoryPanel = async () => {
    setShowHistoryPanel(true);
    setConversationsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        signOut({ reopenModal: true });
        return;
      }
      if (!res.ok) throw new Error();
      setConversations(await res.json());
    } catch {
      setConversations([]);
    } finally {
      setConversationsLoading(false);
    }
  };

  const startNewConversation = async () => {
    setShowHistoryPanel(false);
    try {
      const res = await fetch(`${apiUrl}/conversations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        signOut({ reopenModal: true });
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      localStorage.setItem(CONVERSATION_KEY, String(data.conversation_id));
      setConversationId(String(data.conversation_id));
      setMessages([]);
    } catch {
      setMessages((prev) => [...prev, { role: 'error', text: 'เปิดห้องแชทใหม่ไม่สำเร็จ ลองอีกครั้ง' }]);
    }
  };

  const selectConversation = (id) => {
    setShowHistoryPanel(false);
    if (String(id) === String(conversationId)) return;
    setMessages([]);
    localStorage.setItem(CONVERSATION_KEY, String(id));
    setConversationId(String(id));
  };

  // Resume a known conversation's history on load (survives refresh) instead
  // of starting blank every time the token is still valid.
  useEffect(() => {
    if (!token || !conversationId) return;
    let cancelled = false;

    setHistoryLoading(true);
    fetch(`${apiUrl}/conversations/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) {
          signOut({ reopenModal: true });
          return null;
        }
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((history) => {
        if (cancelled || !history) return;
        setMessages(history.map((m) => ({ role: m.role === 'user' ? 'user' : 'bot', text: m.content })));
      })
      .catch(() => {
        if (!cancelled) setMessages([{ role: 'error', text: 'โหลดประวัติบทสนทนาไม่สำเร็จ' }]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  useEffect(() => stopSpeaking, []);

  const playMessage = (index, text) => {
    setSpeakingIndex(index);
    speak(text, {
      onEnd: () => setSpeakingIndex((cur) => (cur === index ? null : cur)),
    });
  };

  const toggleSpeak = (index, text) => {
    if (speakingIndex === index) {
      stopSpeaking();
      setSpeakingIndex(null);
    } else {
      playMessage(index, text);
    }
  };

  useEffect(() => {
    const lastIndex = messages.length - 1;
    if (lastIndex < 0) return;
    const msg = messages[lastIndex];
    if (msg.role === 'user' || lastAutoSpokenRef.current === lastIndex) return;
    lastAutoSpokenRef.current = lastIndex;
    if (voiceOn) playMessage(lastIndex, msg.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const toggleVoiceOn = () => {
    setVoiceOn((on) => {
      if (on) {
        stopSpeaking();
        setSpeakingIndex(null);
      }
      return !on;
    });
  };

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const send = async (text) => {
    const message = text.trim();
    if (!message || loading) return;
    if (!token || !conversationId) {
      setShowLoginModal(true);
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', text: message }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ conversation_id: Number(conversationId), message }),
      });
      if (res.status === 401) {
        signOut({ reopenModal: true });
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${res.status})`);
      setMessages((prev) => [...prev, { role: 'bot', text: data.reply }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'error', text: err.message }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-[100dvh] w-full justify-center overflow-hidden">
      <div
        inert={showLoginModal ? true : undefined}
        className={`flex h-full w-full max-w-[840px] flex-col px-4 pb-4 pt-5 transition-[filter] duration-300 sm:px-6 sm:pb-6 sm:pt-8 ${
          showLoginModal ? 'pointer-events-none select-none blur-sm brightness-95' : ''
        }`}
      >
        <header className="mb-4 flex shrink-0 items-center gap-3 px-2 sm:mb-6">
          <Orb pulse={speakingIndex !== null} />
          <div className="leading-tight">
            <p className="text-label-lg text-on-surface">Lumina AI</p>
            <p className="text-label-sm text-on-surface-variant">
              {historyLoading ? 'กำลังโหลดบทสนทนา...' : 'Powered by Gemini'}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {speechSupported && (
              <button
                onClick={toggleVoiceOn}
                aria-label={voiceOn ? 'ปิดเสียงอ่านคำตอบ' : 'เปิดเสียงอ่านคำตอบ'}
                aria-pressed={voiceOn}
                className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-black/5 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <SpeakerIcon muted={!voiceOn} />
              </button>
            )}
            {token && (
              <>
                <button
                  onClick={startNewConversation}
                  aria-label="เริ่มแชทใหม่"
                  title="เริ่มแชทใหม่"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-black/5 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <PlusIcon />
                </button>
                <div className="relative">
                  <button
                    onClick={() => (showHistoryPanel ? setShowHistoryPanel(false) : openHistoryPanel())}
                    aria-label="ประวัติการสนทนา"
                    title="ประวัติการสนทนา"
                    aria-expanded={showHistoryPanel}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-black/5 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    <HistoryIcon />
                  </button>
                  {showHistoryPanel && (
                    <HistoryPanel
                      conversations={conversations}
                      loading={conversationsLoading}
                      activeId={conversationId}
                      onSelect={selectConversation}
                      onNewChat={startNewConversation}
                      onClose={() => setShowHistoryPanel(false)}
                    />
                  )}
                </div>
              </>
            )}
            {token ? (
              <button
                onClick={() => signOut()}
                aria-label="ออกจากระบบ"
                className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-black/5 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <LogoutIcon />
              </button>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                aria-label="เข้าสู่ระบบ หรือ สมัครสมาชิก"
                className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-black/5 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <UserIcon />
              </button>
            )}
          </div>
        </header>

        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/70 bg-white/65 shadow-[0_20px_40px_-15px_rgba(127,90,240,0.12),0_4px_12px_rgba(15,17,26,0.03)] backdrop-blur-2xl">
          <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8 no-scrollbar">
            {!hasMessages ? (
              <div className="flex h-full flex-col items-center justify-center gap-8 text-center">
                <Orb size="lg" />
                <div className="max-w-sm">
                  <h1 className="text-headline-lg-mobile text-on-surface sm:text-headline-lg">ถามอะไรก็ได้</h1>
                  <p className="mt-2 text-body-md text-on-surface-variant">
                    พิมพ์คำถาม ไอเดีย หรือสิ่งที่อยากให้ช่วย แล้วกด Enter
                  </p>
                </div>
                <div className="flex w-full max-w-md flex-wrap justify-center gap-2.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-white/70 bg-white/70 px-4 py-2 text-body-sm text-on-surface transition hover:bg-white/95 hover:shadow-[0_4px_12px_rgba(15,17,26,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {messages.map((msg, i) => (
                  <MessageRow
                    key={i}
                    role={msg.role}
                    text={msg.text}
                    speaking={speakingIndex === i}
                    onToggleSpeak={() => toggleSpeak(i, msg.text)}
                  />
                ))}
                {loading && <TypingIndicator />}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </main>

        <div className="mt-3 shrink-0 sm:mt-4">
          <div className="focus-within:shadow-[0_0_0_1px_rgba(102,62,213,0.35),0_0_28px_rgba(112,214,255,0.35)] flex items-end gap-2 rounded-[1.75rem] border border-white/70 bg-white/70 p-2 pl-5 shadow-[0_8px_24px_rgba(15,17,26,0.05)] backdrop-blur-2xl transition-shadow">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="พิมพ์ข้อความ... (Enter เพื่อส่ง)"
              className="max-h-40 flex-1 resize-none bg-transparent py-2.5 text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none"
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              aria-label="ส่งข้อความ"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7f5af0] to-[#b580ff] text-on-primary shadow-[0_4px_14px_rgba(127,90,240,0.35)] transition hover:shadow-[0_0_20px_rgba(112,214,255,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>

      {showLoginModal && (
        <LoginModal onAuthenticated={handleAuthenticated} onClose={() => setShowLoginModal(false)} />
      )}
    </div>
  );
}

export default App;
