import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]); // [{role: 'user'|'bot', text: string}]
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input;
    setMessages((prev) => [...prev, { role: 'user', text: userMessage }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${res.status})`);
      setMessages((prev) => [...prev, { role: 'bot', text: data.reply }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'bot', text: err.message }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.chatWindow}>
        <h1 style={styles.title}>Simple LLM Chatbot</h1>

        <div style={styles.messageList}>
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                ...styles.bubbleRow,
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  ...styles.bubble,
                  ...(msg.role === 'user' ? styles.bubbleUser : styles.bubbleBot),
                }}
              >
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ ...styles.bubbleRow, justifyContent: 'flex-start' }}>
              <div style={{ ...styles.bubble, ...styles.bubbleBot }}>กำลังพิมพ์...</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={styles.inputRow}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            style={styles.textarea}
            placeholder="พิมพ์ข้อความ... (Enter เพื่อส่ง)"
          />
          <button onClick={sendMessage} disabled={loading} style={styles.sendBtn}>
            ส่ง
          </button>
        </div>
      </div>
    </div>
  );
}

// Colors from DESIGN.md (Ethereal Glass Lumina)
const styles = {
  page: {
    minHeight: '100vh',
    background: '#faf8ff', // background
    display: 'flex',
    justifyContent: 'center',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  chatWindow: {
    width: '100%',
    maxWidth: 700,
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#ffffff', // surface-container-lowest
  },
  title: {
    padding: '16px 20px',
    margin: 0,
    borderBottom: '1px solid #cac3d7', // outline-variant
    color: '#191b24', // on-surface
  },
  messageList: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  bubbleRow: {
    display: 'flex',
    width: '100%',
  },
  bubble: {
    maxWidth: '75%',
    padding: '10px 14px',
    borderRadius: 14,
    lineHeight: 1.5,
    wordBreak: 'break-word',
  },
  bubbleUser: {
    background: '#663ed5', // primary
    color: '#ffffff', // on-primary
    borderBottomRightRadius: 4,
  },
  bubbleBot: {
    background: '#ededfa', // surface-container
    color: '#191b24', // on-surface
    borderBottomLeftRadius: 4,
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    padding: 16,
    borderTop: '1px solid #cac3d7', // outline-variant
  },
  textarea: {
    flex: 1,
    resize: 'none',
    padding: 10,
    borderRadius: 8,
    border: '1px solid #cac3d7', // outline-variant
    fontFamily: 'inherit',
    fontSize: 14,
    color: '#191b24', // on-surface
  },
  sendBtn: {
    padding: '0 20px',
    borderRadius: 8,
    border: 'none',
    background: '#663ed5', // primary
    color: '#ffffff', // on-primary
    cursor: 'pointer',
  },
};

export default App;