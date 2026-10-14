import { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
import ReactMarkdown from 'react-markdown';
<<<<<<< Updated upstream
import { speak, stopSpeaking, speechSupported } from './speech';
import { sttSupported, cameraSupported, isCameraCommand, listenOnce, captureCameraFrame } from './voice';
=======
import { speak, stopSpeaking, speechSupported, configureTts } from './speech';
>>>>>>> Stashed changes
import LoginModal from './LoginModal';
import CameraPanel from './CameraPanel';
import { createRecognizer, configureStt, parseCommand, recognitionSupported, HELP_TEXT } from './voice';

const TOKEN_KEY = 'lumina_token';
const CONVERSATION_KEY = 'lumina_conversation_id';
const A11Y_KEY = 'lumina_accessibility';
const VOICE_LANG_KEY = 'lumina_voice_lang';

const DEFAULT_DESCRIBE_PROMPT = 'ภาพนี้มีอะไรบ้าง ช่วยอธิบายสิ่งที่เห็น';
const READ_TEXT_PROMPT = 'อ่านข้อความทั้งหมดที่เห็นในภาพนี้ให้ฟัง';
const COMMAND_LABELS = {
  'camera-back': 'เปิดกล้องหลัง',
  'camera-front': 'เปิดกล้องหน้า',
  'camera-open': 'เปิดกล้อง',
  'camera-close': 'ปิดกล้อง',
  describe: 'ถ่ายรูปและอธิบาย',
  read: 'ถ่ายรูปและอ่านข้อความ',
  repeat: 'พูดซ้ำ',
  'stop-speaking': 'หยุดพูด',
  'new-chat': 'แชทใหม่',
  'a11y-off': 'ปิดโหมดช่วยเหลือ',
  help: 'อ่านคำสั่งทั้งหมด',
};
const LISTEN_TIMEOUT_MS = 45000; // covers up to 30s of speech plus transcription
const HEADER_BTN =
  'flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-black/5 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';

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

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function EyeIcon({ active = false }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" fill={active ? 'currentColor' : 'none'} />
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

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4M8 22h8" />
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

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

function PinIcon({ filled = false }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a5 5 0 0 0-5 5c0 2.5 2 4 2 6H7l-2 2v1h14v-1l-2-2h-2c0-2 2-3.5 2-6a5 5 0 0 0-5-5Z" />
      <path d="M12 17v5" />
    </svg>
  );
}

function ConversationMenu({ pinned, onTogglePin, onRename, onDelete, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handlePointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    sendRef.current = send;

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
      ref={menuRef}
      className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-xl border border-white/70 bg-white/95 py-1 shadow-[0_12px_30px_-8px_rgba(15,17,26,0.25)] backdrop-blur-2xl"
    >
      <button
        onClick={onTogglePin}
        className="block w-full px-3 py-2 text-left text-body-sm text-on-surface transition hover:bg-black/5"
      >
        {pinned ? 'เลิกปักหมุด' : 'ปักหมุดแชท'}
      </button>
      <button
        onClick={onRename}
        className="block w-full px-3 py-2 text-left text-body-sm text-on-surface transition hover:bg-black/5"
      >
        แก้ไขชื่อ
      </button>
      <button
        onClick={onDelete}
        className="block w-full px-3 py-2 text-left text-body-sm text-error transition hover:bg-error-container/40"
      >
        ลบแชท
      </button>
    </div>
  );
}

function ConversationRow({ conversation, active, onSelect, onRename, onDelete, onTogglePin }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title || conversation.preview);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitRename = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== (conversation.title || conversation.preview)) {
      onRename(trimmed);
    }
  };

  if (editing) {
    return (
      <div className="px-1 py-0.5">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
              setDraft(conversation.title || conversation.preview);
              setEditing(false);
            }
          }}
          className="w-full rounded-lg border border-primary/40 bg-white px-2.5 py-2 text-body-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
    );
  }

  return (
    <div className={`group relative flex items-center gap-1 rounded-xl pr-1 transition ${active ? 'bg-primary/10' : 'hover:bg-black/5'}`}>
      <button
        onClick={onSelect}
        className={`flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-xl px-3 py-2.5 text-left text-body-sm transition ${
          active ? 'text-primary' : 'text-on-surface'
        }`}
      >
        {conversation.pinned && <PinIcon filled />}
        <span className="truncate">{conversation.title || conversation.preview}</span>
      </button>
      <div className="relative shrink-0">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="ตัวเลือกแชท"
          className={`flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-black/10 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
            menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          }`}
        >
          <DotsIcon />
        </button>
        {menuOpen && (
          <ConversationMenu
            pinned={conversation.pinned}
            onTogglePin={() => {
              setMenuOpen(false);
              onTogglePin();
            }}
            onRename={() => {
              setMenuOpen(false);
              setDraft(conversation.title || conversation.preview);
              setEditing(true);
            }}
            onDelete={() => {
              setMenuOpen(false);
              onDelete();
            }}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

function Sidebar({ conversations, loading, activeId, onSelect, onNewChat, onRename, onDelete, onTogglePin, open, onClose }) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px] sm:hidden" onClick={onClose} />
      )}
      <aside
        role="dialog"
        aria-labelledby={titleId}
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-white/70 bg-white/90 shadow-[0_0_40px_rgba(15,17,26,0.08)] backdrop-blur-2xl transition-transform duration-300 sm:static sm:z-auto sm:translate-x-0 sm:bg-white/50 sm:shadow-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-5">
          <div className="flex items-center gap-2">
            <Orb />
            <p id={titleId} className="text-label-lg text-on-surface">Lumina AI</p>
          </div>
          <button
            onClick={onClose}
            aria-label="ปิดแถบประวัติการสนทนา"
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-black/5 hover:text-on-surface sm:hidden"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-3 pb-3 pt-2">
          <button
            onClick={onNewChat}
            className="flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#7f5af0] to-[#b580ff] px-4 py-2.5 text-label-md text-on-primary shadow-[0_4px_10px_rgba(127,90,240,0.3)] transition hover:shadow-[0_0_16px_rgba(112,214,255,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <PlusIcon />
            แชทใหม่
          </button>
        </div>

        <p className="px-5 pb-1 pt-2 text-label-sm text-on-surface-variant">ประวัติการสนทนา</p>

        <div className="flex-1 overflow-y-auto px-2 pb-4 no-scrollbar">
          {loading ? (
            <p className="px-3 py-6 text-center text-body-sm text-on-surface-variant">กำลังโหลด...</p>
          ) : conversations.length === 0 ? (
            <p className="px-3 py-6 text-center text-body-sm text-on-surface-variant">ยังไม่มีบทสนทนา</p>
          ) : (
            conversations.map((c) => (
              <ConversationRow
                key={c.conversation_id}
                conversation={c}
                active={String(c.conversation_id) === String(activeId)}
                onSelect={() => onSelect(c.conversation_id)}
                onRename={(title) => onRename(c.conversation_id, title)}
                onDelete={() => onDelete(c.conversation_id)}
                onTogglePin={() => onTogglePin(c)}
              />
            ))
          )}
        </div>
      </aside>
    </>
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

function MessageRow({ role, text, image, speaking, onToggleSpeak }) {
  if (role === 'user') {
    return (
      <div className="flex w-full justify-end message-in">
        <div className="flex max-w-[75%] flex-col gap-2 rounded-[1.5rem] rounded-br-lg bg-white px-5 py-3 text-body-md text-on-surface shadow-[0_4px_16px_rgba(15,17,26,0.06)]">
          {image && <img src={image} alt="รูปที่ถ่ายจากกล้อง" className="max-h-48 rounded-xl object-cover" />}
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [speakingIndex, setSpeakingIndex] = useState(null);
<<<<<<< Updated upstream
  const [listening, setListening] = useState(false);
  const [describingScene, setDescribingScene] = useState(false);
=======
  const [a11y, setA11y] = useState(() => localStorage.getItem(A11Y_KEY) === '1');
  const [voiceLang, setVoiceLang] = useState(() => localStorage.getItem(VOICE_LANG_KEY) || 'th-TH');
  const [listening, setListening] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const [micNote, setMicNote] = useState('');
  const [micPhase, setMicPhase] = useState('idle'); // idle | starting | hearing
  const [lastHeard, setLastHeard] = useState(null); // { text, action }
  const [cameraFacing, setCameraFacing] = useState(null); // null = camera closed
  const [liveStatus, setLiveStatus] = useState('');
>>>>>>> Stashed changes
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const lastAutoSpokenRef = useRef(-1);
  const recognizerRef = useRef(null);
  const cameraRef = useRef(null);
  const pendingCaptureRef = useRef(null); // 'describe' | 'read' queued until the camera is ready
  // Recognizer / camera callbacks outlive the render that created them; these refs keep
  // them pointed at current state and handlers.
  const a11yRef = useRef(a11y);
  const voiceLangRef = useRef(voiceLang);
  const sendRef = useRef(null);
  const transcriptRef = useRef(null);
  const messagesRef = useRef(messages);
  a11yRef.current = a11y;
  voiceLangRef.current = voiceLang;
  messagesRef.current = messages;

  const apiUrl = import.meta.env.VITE_API_URL;
  configureTts({ apiUrl, getToken: () => localStorage.getItem(TOKEN_KEY) });
  configureStt({ apiUrl, getToken: () => localStorage.getItem(TOKEN_KEY) });

  const signOut = ({ reopenModal = false } = {}) => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CONVERSATION_KEY);
    setToken(null);
    setConversationId(null);
    setMessages([]);
    if (reopenModal) setShowLoginModal(true);
  };

  const loadConversations = async (authToken) => {
    setConversationsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/conversations`, {
        headers: { Authorization: `Bearer ${authToken}` },
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
      loadConversations(newToken);
    } catch {
      setMessages([{ role: 'error', text: 'เข้าสู่ระบบสำเร็จ แต่เปิดห้องแชทใหม่ไม่ได้ ลองรีเฟรชหน้านี้' }]);
    }
  };

  const startNewConversation = async () => {
    setSidebarOpen(false);
    // Already on a chat nobody has typed into yet - reuse it instead of
    // letting "New chat" spawn an endless trail of empty conversations.
    if (conversationId && messages.length === 0) return;
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
      loadConversations(token);
    } catch {
      setMessages((prev) => [...prev, { role: 'error', text: 'เปิดห้องแชทใหม่ไม่สำเร็จ ลองอีกครั้ง' }]);
    }
  };

  const selectConversation = (id) => {
    setSidebarOpen(false);
    if (String(id) === String(conversationId)) return;
    setMessages([]);
    localStorage.setItem(CONVERSATION_KEY, String(id));
    setConversationId(String(id));
  };

  const renameConversation = async (id, title) => {
    try {
      const res = await fetch(`${apiUrl}/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title }),
      });
      if (res.status === 401) {
        signOut({ reopenModal: true });
        return;
      }
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setConversations((prev) => prev.map((c) => (c.conversation_id === id ? updated : c)));
    } catch {
      // Keep the old title showing; nothing else to reconcile client-side.
    }
  };

  const togglePin = async (conv) => {
    try {
      const res = await fetch(`${apiUrl}/conversations/${conv.conversation_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pinned: !conv.pinned }),
      });
      if (res.status === 401) {
        signOut({ reopenModal: true });
        return;
      }
      if (!res.ok) throw new Error();
    } catch {
      return;
    }
    loadConversations(token); // re-sort: pinned chats float to the top
  };

  const deleteConversation = async (id) => {
    try {
      const res = await fetch(`${apiUrl}/conversations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        signOut({ reopenModal: true });
        return;
      }
      if (!res.ok) throw new Error();
    } catch {
      return;
    }

    const remaining = conversations.filter((c) => c.conversation_id !== id);
    setConversations(remaining);

    if (String(id) !== String(conversationId)) return;
    if (remaining.length > 0) {
      selectConversation(remaining[0].conversation_id);
    } else {
      localStorage.removeItem(CONVERSATION_KEY);
      setConversationId(null);
      setMessages([]);
      startNewConversation();
    }
  };

  // Covers the page-refresh case: a token already sits in localStorage, so
  // handleAuthenticated (which also triggers a load) never runs.
  useEffect(() => {
    if (token) loadConversations(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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

  // ---------- Voice input, camera & accessibility mode ----------

  const handsFree = a11y && recognitionSupported && !micBlocked;

  // Status line for screen readers; in accessibility mode it is also spoken aloud.
  const announce = (text) => {
    setLiveStatus(text);
    if (a11yRef.current) playMessage('sys', text);
  };

  const startListening = () => {
    if (recognizerRef.current) return;
    stopSpeaking();
    setSpeakingIndex(null);
    const rec = createRecognizer({
      lang: voiceLangRef.current,
      onAudioStart: () => setMicPhase('starting'),
      onSpeechStart: () => setMicPhase('hearing'),
      onInterim: (t) => setInput(t),
      onFinal: (t) => {
        setInput('');
        transcriptRef.current?.(t);
      },
      onEnd: () => {
        recognizerRef.current = null;
        setListening(false);
        setMicPhase('idle');
      },
      onError: (code) => {
        console.warn('[speech recognition]', code);
        // 'no-speech' / 'aborted' are routine (silence, or we cancelled); everything else
        // would otherwise fail invisibly and make the app look like it ignores you.
        if (code === 'no-speech' || code === 'aborted') return;
        const reasons = {
          'not-allowed': 'ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน กดไอคอนกุญแจข้าง URL แล้วอนุญาตไมโครโฟน',
          'service-not-allowed': 'เบราว์เซอร์นี้ไม่อนุญาตให้ใช้รู้จำเสียง',
          'audio-capture': 'ไม่พบไมโครโฟน ตรวจสอบว่าเสียบอุปกรณ์และเลือกไมค์ถูกตัว',
          network: 'รู้จำเสียงต้องต่อเน็ต (Chrome ส่งเสียงไปประมวลผลที่ Google) ตอนนี้เชื่อมต่อไม่ได้',
          'language-not-supported': 'เบราว์เซอร์ไม่รองรับภาษานี้ ลองสลับ TH/EN',
        };
        setMicBlocked(true); // stop the hands-free loop from retrying forever
        setMicNote(reasons[code] || `รู้จำเสียงผิดพลาด (${code})`);
      },
    });
    if (!rec) return;
    try {
      rec.start();
      recognizerRef.current = rec;
      setListening(true);
      setMicPhase('starting');
      setLastHeard(null);
    } catch {
      recognizerRef.current = null;
    }
  };

  const stopListening = () => {
    const rec = recognizerRef.current;
    if (!rec) return;
    rec.abort();
    // Some browsers never fire onend after abort() on a hung session - force a reset.
    setTimeout(() => {
      if (recognizerRef.current === rec) {
        recognizerRef.current = null;
        setListening(false);
        setMicPhase('idle');
      }
    }, 600);
  };

  const toggleMic = () => {
    if (micBlocked) {
      setMicBlocked(false);
      setMicNote('');
    }
    if (listening) stopListening();
    else startListening();
  };

  const toggleVoiceLang = () => {
    const next = voiceLang === 'th-TH' ? 'en-US' : 'th-TH';
    localStorage.setItem(VOICE_LANG_KEY, next);
    setVoiceLang(next);
    voiceLangRef.current = next;
    stopListening();
  };

  const setAccessibility = (on) => {
    localStorage.setItem(A11Y_KEY, on ? '1' : '0');
    a11yRef.current = on;
    setA11y(on);
    setMicBlocked(false);
    setMicNote('');
    if (on) {
      setVoiceOn(true);
      announce(
        recognitionSupported
          ? 'เปิดโหมดช่วยเหลือแล้ว ฉันจะฟังคำสั่งเสียงของคุณอัตโนมัติ พูดว่า ช่วยเหลือ เพื่อฟังคำสั่งทั้งหมด'
          : 'เปิดโหมดช่วยเหลือแล้ว แต่เบราว์เซอร์นี้ไม่รองรับการสั่งงานด้วยเสียง กรุณาใช้ Chrome หรือ Safari'
      );
    } else {
      stopListening();
      stopSpeaking();
      setSpeakingIndex(null);
      setLiveStatus('ปิดโหมดช่วยเหลือแล้ว');
    }
  };

  const openCamera = (facing) => {
    if (cameraFacing === facing) {
      announce(facing === 'user' ? 'กล้องหน้าเปิดอยู่แล้ว' : 'กล้องหลังเปิดอยู่แล้ว');
      return;
    }
    setCameraFacing(facing);
  };

  const closeCamera = () => {
    pendingCaptureRef.current = null;
    setCameraFacing(null);
    announce('ปิดกล้องแล้ว');
  };

  const captureAndSend = (kind, customPrompt) => {
    const dataUrl = cameraRef.current?.capture();
    if (!dataUrl) {
      announce('ถ่ายรูปไม่สำเร็จ ลองอีกครั้ง');
      return;
    }
    navigator.vibrate?.(40);
    const prompt = customPrompt || (kind === 'read' ? READ_TEXT_PROMPT : DEFAULT_DESCRIBE_PROMPT);
    sendRef.current(prompt, dataUrl);
  };

  // Shutter button: whatever is typed becomes the question about the photo.
  const handleShutter = () => {
    const typed = input.trim();
    if (typed) setInput('');
    captureAndSend('describe', typed);
  };

  // CameraPanel reports once the stream is live (or has failed).
  const handleCameraStatus = (status, ready) => {
    if (!ready) {
      pendingCaptureRef.current = null;
      announce(status);
      return;
    }
    const pending = pendingCaptureRef.current;
    if (pending) {
      pendingCaptureRef.current = null;
      // Give auto-exposure a moment so the first frame isn't black.
      setTimeout(() => captureAndSend(pending), 1200);
      setLiveStatus(status);
      return;
    }
    announce(`${status} พูดว่า ถ่ายรูป หรือ อธิบาย เพื่อให้ฉันบอกว่าเห็นอะไร`);
  };

  const captureFromCamera = (kind) => {
    if (cameraFacing) {
      captureAndSend(kind);
    } else {
      pendingCaptureRef.current = kind;
      setCameraFacing('environment');
      announce('กำลังเปิดกล้องหลัง');
    }
  };

  const runCommand = (type) => {
    switch (type) {
      case 'camera-back':
        return openCamera('environment');
      case 'camera-front':
        return openCamera('user');
      case 'camera-open':
        return openCamera(cameraFacing || 'environment');
      case 'camera-close':
        return cameraFacing ? closeCamera() : announce('กล้องปิดอยู่แล้ว');
      case 'describe':
      case 'read':
        return captureFromCamera(type);
      case 'repeat': {
        const all = messagesRef.current;
        const lastIndex = all.map((m) => m.role).lastIndexOf('bot');
        return lastIndex >= 0 ? playMessage(lastIndex, all[lastIndex].text) : announce('ยังไม่มีคำตอบให้พูดซ้ำ');
      }
      case 'stop-speaking':
        stopSpeaking();
        return setSpeakingIndex(null);
      case 'new-chat':
        startNewConversation();
        return announce('เริ่มแชทใหม่แล้ว');
      case 'a11y-off':
        return setAccessibility(false);
      case 'help':
        return announce(HELP_TEXT);
    }
  };

  transcriptRef.current = (text) => {
    // Short, anchored phrases are voice commands in every mode; anything longer is a question.
    const command = parseCommand(text);
    console.info('[voice] heard:', text, '->', command || 'chat');
    setLastHeard({ text, action: command ? COMMAND_LABELS[command] : 'ส่งเป็นคำถามถึง AI' });
    if (command) runCommand(command);
    else sendRef.current(text);
  };

  // Hands-free loop: listen -> (command | send) -> speak the reply -> listen again.
  useEffect(() => {
    if (!handsFree || showLoginModal || loading || historyLoading || speakingIndex !== null || listening) return;
    const timer = setTimeout(startListening, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handsFree, showLoginModal, loading, historyLoading, speakingIndex, listening]);

  // A session that neither hears anything nor ends (stuck permission prompt, dead input device)
  // would leave the app "listening" forever; recycle it so the loop keeps trying.
  useEffect(() => {
    if (!listening) return;
    const timer = setTimeout(stopListening, LISTEN_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening]);

  // Never listen while talking: the mic would pick up our own voice.
  useEffect(() => {
    if (speakingIndex !== null && listening) stopListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakingIndex, listening]);

  useEffect(
    () => () => {
      recognizerRef.current?.abort();
    },
    []
  );

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const send = async (text, image = null) => {
    const message = text.trim();
    if (!message || loading) return;
    if (!token || !conversationId) {
      if (a11yRef.current) announce('กรุณาเข้าสู่ระบบก่อนคุยกับ AI');
      setShowLoginModal(true);
      return;
    }

    const isFirstMessage = messages.length === 0;
    setMessages((prev) => [...prev, { role: 'user', text: message, image }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversation_id: Number(conversationId),
          message,
          accessibility: a11y,
          ...(image && { image: image.split(',')[1], image_mime: 'image/jpeg' }),
        }),
      });
      if (res.status === 401) {
        signOut({ reopenModal: true });
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${res.status})`);
      setMessages((prev) => [...prev, { role: 'bot', text: data.reply }]);
      if (isFirstMessage) loadConversations(token);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'error', text: err.message }]);
    }
    setLoading(false);
  };

  // Captures one camera frame, asks Gemini to describe it, and speaks the
  // result regardless of the voiceOn toggle — someone who just spoke a
  // voice command to "see" clearly wants to hear the answer.
  const describeSurroundings = async () => {
    if (!token || !conversationId) {
      setShowLoginModal(true);
      return;
    }
    setDescribingScene(true);
    try {
      const frame = await captureCameraFrame();
      const form = new FormData();
      form.append('file', frame, 'frame.jpg');
      const res = await fetch(`${apiUrl}/vision/describe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.status === 401) {
        signOut({ reopenModal: true });
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${res.status})`);

      const newIndex = messages.length;
      lastAutoSpokenRef.current = newIndex; // this message is spoken explicitly below, not by the generic auto-speak effect
      setMessages((prev) => [...prev, { role: 'bot', text: data.description }]);
      playMessage(newIndex, data.description);
    } catch (err) {
      // Camera-access failures get a friendly Thai message; a server-side error
      // (thrown above as `new Error(data.detail || ...)`) already carries a
      // real, useful message, so show it as-is — same as the /chat error path.
      const text =
        err.message === 'unsupported'
          ? 'เบราว์เซอร์นี้ไม่รองรับการเข้าถึงกล้อง'
          : err.name === 'NotAllowedError'
            ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตแล้วลองใหม่'
            : err.message === 'capture-failed'
              ? 'ไม่สามารถถ่ายภาพได้ ลองใหม่อีกครั้ง'
              : err.message || 'ไม่สามารถดูภาพรอบตัวได้ ลองใหม่อีกครั้ง';
      setMessages((prev) => [...prev, { role: 'error', text }]);
    }
    setDescribingScene(false);
  };

  // One voice command does double duty: "what's around me" phrasing opens the
  // camera and describes the scene, anything else gets dictated straight into
  // the chat, same as typing it.
  const handleVoiceCommand = async () => {
    if (!sttSupported || listening) return;
    if (!token || !conversationId) {
      setShowLoginModal(true);
      return;
    }
    setListening(true);
    try {
      const transcript = await listenOnce();
      setListening(false);
      if (isCameraCommand(transcript)) {
        if (!cameraSupported) {
          setMessages((prev) => [...prev, { role: 'error', text: 'เบราว์เซอร์นี้ไม่รองรับการเข้าถึงกล้อง' }]);
          return;
        }
        await describeSurroundings();
      } else {
        send(transcript);
      }
    } catch (err) {
      setListening(false);
      if (err.message === 'not-allowed') {
        setMessages((prev) => [...prev, { role: 'error', text: 'ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน กรุณาอนุญาตแล้วลองใหม่' }]);
      } else if (err.message !== 'no-speech' && err.message !== 'aborted') {
        setMessages((prev) => [...prev, { role: 'error', text: 'ฟังไม่สำเร็จ ลองใหม่อีกครั้ง' }]);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden">
      {token && (
        <Sidebar
          conversations={conversations}
          loading={conversationsLoading}
          activeId={conversationId}
          onSelect={selectConversation}
          onNewChat={startNewConversation}
          onRename={renameConversation}
          onDelete={deleteConversation}
          onTogglePin={togglePin}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      )}
      <div className="flex h-full flex-1 justify-center overflow-hidden">
        <div
          inert={showLoginModal ? true : undefined}
          className={`flex h-full w-full max-w-[840px] flex-col px-4 pb-4 pt-5 transition-[filter] duration-300 sm:px-6 sm:pb-6 sm:pt-8 ${
            showLoginModal ? 'pointer-events-none select-none blur-sm brightness-95' : ''
          }`}
        >
        <header className="mb-4 flex shrink-0 items-center gap-3 px-2 sm:mb-6">
          {token && (
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="เปิดแถบประวัติการสนทนา"
              className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-black/5 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:hidden"
            >
              <MenuIcon />
            </button>
          )}
          <Orb pulse={speakingIndex !== null} />
          <div className="leading-tight">
            <p className="text-label-lg text-on-surface">Lumina AI</p>
            <p className="text-label-sm text-on-surface-variant">
              {historyLoading
                ? 'กำลังโหลดบทสนทนา...'
                : listening
                  ? 'กำลังฟัง...'
                  : describingScene
                    ? 'กำลังดูภาพ...'
                    : 'Powered by Gemini'}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setAccessibility(!a11y)}
              aria-label={a11y ? 'ปิดโหมดช่วยเหลือผู้พิการทางสายตา' : 'เปิดโหมดช่วยเหลือผู้พิการทางสายตา'}
              aria-pressed={a11y}
              className={`${HEADER_BTN} ${a11y ? 'bg-primary/15 !text-primary' : ''}`}
            >
              <EyeIcon active={a11y} />
            </button>
            <button
              onClick={() => (cameraFacing ? closeCamera() : setCameraFacing('environment'))}
              aria-label={cameraFacing ? 'ปิดกล้อง' : 'เปิดกล้อง'}
              aria-pressed={Boolean(cameraFacing)}
              className={`${HEADER_BTN} ${cameraFacing ? 'bg-primary/15 !text-primary' : ''}`}
            >
              <CameraIcon />
            </button>
            {speechSupported && !a11y && (
              <button
                onClick={toggleVoiceOn}
                aria-label={voiceOn ? 'ปิดเสียงอ่านคำตอบ' : 'เปิดเสียงอ่านคำตอบ'}
                aria-pressed={voiceOn}
                className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-black/5 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <SpeakerIcon muted={!voiceOn} />
              </button>
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

        {cameraFacing && (
          <CameraPanel
            ref={cameraRef}
            facing={cameraFacing}
            onFlip={() => setCameraFacing(cameraFacing === 'user' ? 'environment' : 'user')}
            onClose={closeCamera}
            onShutter={handleShutter}
            onStatus={handleCameraStatus}
          />
        )}

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
              <div className="flex flex-col gap-5" role="log" aria-live={a11y ? 'off' : 'polite'}>
                {messages.map((msg, i) => (
                  <MessageRow
                    key={i}
                    role={msg.role}
                    text={msg.text}
                    image={msg.image}
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
          <div role="status" aria-live="polite" className="sr-only">{liveStatus}</div>
          {lastHeard && !listening && (
            <p className="mb-1 text-center text-label-sm text-on-surface-variant">
              ได้ยินว่า “{lastHeard.text}” → {lastHeard.action}
            </p>
          )}
          {micNote ? (
            <p role="alert" className="mb-2 text-center text-label-md text-error">
              {micNote} (กดปุ่มไมค์เพื่อลองใหม่)
            </p>
          ) : (
            (a11y || listening) && (
              <p className="mb-2 text-center text-label-md text-primary" aria-hidden="true">
                {listening
                  ? micPhase === 'hearing'
                    ? 'ได้ยินเสียงแล้ว... พูดให้จบประโยคแล้วหยุดสักครู่'
                    : micPhase === 'starting'
                      ? `กำลังฟัง... พูดได้เลย (${voiceLang === 'th-TH' ? 'ไทย' : 'English'})`
                      : 'กำลังเปิดไมโครโฟน... (ถ้าเบราว์เซอร์ถามสิทธิ์ ให้กดอนุญาต)'
                  : loading
                    ? 'กำลังคิดคำตอบ...'
                    : speakingIndex !== null
                      ? 'กำลังพูด... (กดไมค์เพื่อขัดจังหวะ)'
                      : showLoginModal
                        ? 'เข้าสู่ระบบก่อน แล้วระบบจะเริ่มฟัง'
                        : 'รอสักครู่...'}
              </p>
            )
          )}
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
<<<<<<< Updated upstream
            {sttSupported && (
              <button
                onClick={handleVoiceCommand}
                disabled={listening || describingScene}
                aria-label={listening ? 'กำลังฟัง' : 'สั่งการด้วยเสียง (พูดว่า "เปิดกล้อง" เพื่อบอกว่าเห็นอะไรรอบตัว)'}
                title='พูดข้อความ หรือพูดว่า "เปิดกล้อง" เพื่อให้บอกว่าเห็นอะไรรอบตัว'
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/70 transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-60 ${
                  listening ? 'animate-[breathe_1.2s_ease-in-out_infinite] bg-primary/10 text-primary' : 'text-on-surface-variant'
                }`}
              >
                <MicIcon />
              </button>
=======
            {recognitionSupported && (
              <>
                <button
                  onClick={toggleVoiceLang}
                  aria-label={`ภาษาที่ฟัง: ${voiceLang === 'th-TH' ? 'ไทย' : 'อังกฤษ'} กดเพื่อสลับ`}
                  className="flex h-11 shrink-0 items-center justify-center rounded-full px-2 text-label-sm text-on-surface-variant transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  {voiceLang === 'th-TH' ? 'TH' : 'EN'}
                </button>
                <button
                  onClick={toggleMic}
                  aria-label={listening ? 'หยุดฟัง' : 'พูดกับ AI'}
                  aria-pressed={listening}
                  className={`flex shrink-0 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    a11y ? 'h-14 w-14' : 'h-11 w-11'
                  } ${listening ? 'animate-pulse bg-error text-on-primary' : 'bg-black/5 text-on-surface hover:bg-black/10'}`}
                >
                  <MicIcon />
                </button>
              </>
>>>>>>> Stashed changes
            )}
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
      </div>

      {showLoginModal && (
        <LoginModal onAuthenticated={handleAuthenticated} onClose={() => setShowLoginModal(false)} />
      )}
    </div>
  );
}

export default App;
