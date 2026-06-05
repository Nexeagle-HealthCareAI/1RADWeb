// ════════════════════════════════════════════════════════════════════════════
//  RadAI — floating, draggable in-app help desk.
//
//  Type or speak (Hindi/English) a question about how to use 1Rad; the answer
//  comes from the backend (Gemini), which holds an app knowledge base. Voice is
//  recorded and sent to our API (works in the desktop app + web). No patient
//  data is sent; the AI key stays server-side.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import apiClient from '../api/apiClient';
import { notifyToast } from '../utils/toast';

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const LW = 134; // launcher pill width (logo + "RadAI")
const LH = 54;  // launcher pill height
const LOGO = `${import.meta.env.BASE_URL}Logo.png`;

const loadPos = () => {
  try {
    const raw = localStorage.getItem('radai_pos');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  if (typeof window === 'undefined') return { x: 20, y: 20 };
  return { x: window.innerWidth - LW - 20, y: window.innerHeight - LH - 90 };
};

const blobToDataUrl = (blob) => new Promise((res) => {
  const r = new FileReader();
  r.onloadend = () => res(r.result);
  r.readAsDataURL(blob);
});

export default function RadAI() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(loadPos);
  const posRef = useRef(pos);
  const setPosBoth = (p) => { posRef.current = p; setPos(p); };

  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi! I'm RadAI 🤖 — your 1Rad helper. Ask me anything about using the app, in Hindi or English. You can type or tap the mic." },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef(null);
  const bodyRef = useRef(null);

  // Keep the launcher on-screen if the window resizes.
  useEffect(() => {
    const onResize = () => setPosBoth({
      x: clamp(posRef.current.x, 8, window.innerWidth - LW - 8),
      y: clamp(posRef.current.y, 8, window.innerHeight - LH - 8),
    });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, open, busy]);

  // Drag the launcher; a click (no drag) toggles the panel.
  const onPointerDown = (e) => {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const origin = { ...posRef.current };
    let moved = false;
    const onMove = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (moved) setPosBoth({
        x: clamp(origin.x + dx, 8, window.innerWidth - LW - 8),
        y: clamp(origin.y + dy, 8, window.innerHeight - LH - 8),
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved) { try { localStorage.setItem('radai_pos', JSON.stringify(posRef.current)); } catch { /* ignore */ } }
      else setOpen((o) => !o);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const ask = async (payload) => {
    setBusy(true);
    try {
      const history = messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
      const res = await apiClient.post('/assist/radai', { ...payload, page: location.pathname, history });
      const data = res?.data || {};
      setMessages((m) => [...m, { role: 'assistant', text: (data.success && data.answer) ? data.answer : (data.error || "I'm having trouble right now. Please try again.") }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', text: "I couldn't reach the help service. Please try again." }]);
    } finally { setBusy(false); }
  };

  const sendText = () => {
    const q = input.trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    ask({ question: q });
  };

  const startRecording = async () => {
    if (busy) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = mr.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: mime });
        const dataUrl = await blobToDataUrl(blob);
        setMessages((m) => [...m, { role: 'user', text: '🎤 Voice message' }]);
        ask({ audioBase64: dataUrl, audioMimeType: mime });
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      notifyToast('Microphone is not available. You can type your question instead.', 'error');
    }
  };
  const stopRecording = () => { try { mediaRef.current?.stop(); } catch { /* ignore */ } setRecording(false); };

  // Panel anchored to the launcher, clamped on-screen.
  const PW = Math.min(380, (typeof window !== 'undefined' ? window.innerWidth : 380) - 24);
  const PH = Math.min(540, (typeof window !== 'undefined' ? window.innerHeight : 540) - 24);
  const panelLeft = clamp(pos.x + LW - PW, 12, (typeof window !== 'undefined' ? window.innerWidth : PW) - PW - 12);
  const panelTop = clamp(pos.y - PH - 12, 12, (typeof window !== 'undefined' ? window.innerHeight : PH) - PH - 12);

  return (
    <>
      {/* Launcher — NexEagle logo + animated "RadAI" wordmark */}
      <button
        onPointerDown={onPointerDown}
        title="RadAI — help (drag to move)"
        style={{
          position: 'fixed', left: pos.x, top: pos.y, height: LH, padding: '0 18px 0 7px', borderRadius: LH / 2,
          border: 'none', cursor: 'grab', zIndex: 2147483600, touchAction: 'none',
          background: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
          boxShadow: open ? '0 10px 28px -6px rgba(79,70,229,0.7)' : '0 8px 22px -6px rgba(79,70,229,0.55)',
          display: 'flex', alignItems: 'center', gap: '9px',
        }}
      >
        <span style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
          <img src={LOGO} alt="NexEagle" draggable={false} style={{ width: '32px', height: '32px', objectFit: 'contain', pointerEvents: 'none' }} />
        </span>
        <span className="radai-shimmer" style={{ fontSize: '15px', fontWeight: 950, letterSpacing: '0.6px', pointerEvents: 'none' }}>RadAI</span>
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: panelLeft, top: panelTop, width: PW, height: PH, zIndex: 2147483601,
          background: 'white', borderRadius: '18px', border: '1px solid #e7ecf3',
          boxShadow: '0 24px 60px -12px rgba(15,23,42,0.4)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                <img src={LOGO} alt="NexEagle" style={{ width: '25px', height: '25px', objectFit: 'contain' }} />
              </span>
              <div>
                <div className="radai-shimmer-dark" style={{ fontSize: '14px', fontWeight: 950, letterSpacing: '0.3px' }}>RadAI</div>
                <div style={{ fontSize: '9.5px', fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>by NexEagle · हिंदी / English</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'rgba(255,255,255,0.18)', color: 'white', width: '26px', height: '26px', borderRadius: '50%', cursor: 'pointer', fontWeight: 900 }}>✕</button>
          </div>

          {/* Messages */}
          <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: '14px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <div style={{
                  padding: '9px 12px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.role === 'user' ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : 'white',
                  color: m.role === 'user' ? 'white' : '#1e293b', border: m.role === 'user' ? 'none' : '1px solid #e7ecf3',
                  fontSize: '12.5px', fontWeight: 500, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}>{m.text}</div>
              </div>
            ))}
            {busy && (
              <div style={{ alignSelf: 'flex-start', padding: '9px 12px', borderRadius: '14px', background: 'white', border: '1px solid #e7ecf3', fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>RadAI is thinking…</div>
            )}
          </div>

          {/* Composer */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid #eef2f7', display: 'flex', alignItems: 'center', gap: '8px', background: 'white' }}>
            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={busy}
              title={recording ? 'Stop & send' : 'Speak (Hindi/English)'}
              style={{ flexShrink: 0, width: '38px', height: '38px', borderRadius: '50%', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', background: recording ? '#dc2626' : '#f1f5f9', color: recording ? 'white' : '#475569', fontSize: '16px', animation: recording ? 'radaiPulse 1s infinite' : 'none' }}
            >{recording ? '⏹' : '🎤'}</button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendText(); }}
              placeholder={recording ? 'Listening… tap ⏹ to send' : 'Ask how to do something…'}
              disabled={busy || recording}
              style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: '11px', border: '1.5px solid #e2e8f0', fontSize: '12.5px', fontWeight: 600, outline: 'none', background: '#f8fafc', color: '#1e293b' }}
            />
            <button
              onClick={sendText}
              disabled={busy || recording || !input.trim()}
              style={{ flexShrink: 0, padding: '10px 14px', borderRadius: '11px', border: 'none', cursor: (busy || !input.trim()) ? 'not-allowed' : 'pointer', background: (busy || !input.trim()) ? '#cbd5e1' : 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: 'white', fontSize: '13px', fontWeight: 900 }}
            >➤</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes radaiPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.5); } 50% { box-shadow: 0 0 0 7px rgba(220,38,38,0); } }
        .radai-shimmer, .radai-shimmer-dark { background-size: 200% auto; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; animation: radaiShine 2.6s linear infinite; }
        .radai-shimmer { background-image: linear-gradient(90deg,#ffffff 0%,#ffffff 38%,#c4b5fd 50%,#ffffff 62%,#ffffff 100%); }
        .radai-shimmer-dark { background-image: linear-gradient(90deg,#ffffff 0%,#ffffff 40%,#a5b4fc 50%,#ffffff 60%,#ffffff 100%); }
        @keyframes radaiShine { to { background-position: -200% center; } }
      `}</style>
    </>
  );
}
