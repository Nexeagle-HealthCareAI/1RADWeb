// ════════════════════════════════════════════════════════════════════════════
//  RadAI — floating, draggable in-app help desk.
//
//  Type or speak (Hindi/English) a question about how to use 1Rad; the answer
//  comes from the backend (Gemini), grounded on an app knowledge base. RadAI
//  replies in the user's language, suggests follow-up questions, and reads the
//  answer aloud. Optional hands-free: turn it on and say "Hey RadAI <question>"
//  — no mic press. Hands-free uses the browser's speech recognition (Chrome/Edge
//  web only; not the desktop app / Firefox) and is OFF by default. No patient
//  data is sent; the AI key stays server-side.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import apiClient from '../api/apiClient';
import { notifyToast } from '../utils/toast';

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const LW = 162; // launcher pill width (logo + "Ask RadAI")
const LH = 54;  // launcher pill height
const LOGO = `${import.meta.env.BASE_URL}Logo.png`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const SUGGESTIONS = [
  'How do I book an appointment?',
  'Why did a discount popup appear?',
  'Where do I approve pending changes?',
  'How do I mark a test as free?',
];

// Hands-free wake word. Browser SpeechRecognition (Chrome/Edge web only).
const SR = (typeof window !== 'undefined') ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const wakeSupported = !!SR;
const WAKE = /(hey\s+rad\s*ai|ok\s+rad\s*ai|hey\s+rad\b|rad\s*ai|radai)/i;

const loadPos = () => {
  if (typeof window === 'undefined') return { x: 20, y: 20 };
  // Default: bottom-right, above the page edge.
  let p = { x: window.innerWidth - LW - 20, y: window.innerHeight - LH - 90 };
  try {
    const raw = localStorage.getItem('radai_pos');
    if (raw) {
      const j = JSON.parse(raw);
      if (j && Number.isFinite(j.x) && Number.isFinite(j.y)) p = j;
    }
  } catch { /* ignore */ }
  // ALWAYS clamp into the current viewport. A position saved on a larger screen
  // (or before a rotate / dev-tools resize) would otherwise land off-screen and
  // the launcher would be invisible — which reads as "RadAI is gone".
  return {
    x: clamp(p.x, 8, Math.max(8, window.innerWidth - LW - 8)),
    y: clamp(p.y, 8, Math.max(8, window.innerHeight - LH - 8)),
  };
};

const blobToDataUrl = (blob) => new Promise((res) => {
  const r = new FileReader();
  r.onloadend = () => res(r.result);
  r.readAsDataURL(blob);
});

const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

export default function RadAI() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(loadPos);
  const posRef = useRef(pos);
  const setPosBoth = (p) => { posRef.current = p; setPos(p); };

  const [messages, setMessages] = useState([
    { id: uid(), role: 'assistant', text: "Hi! I'm RadAI 🤖 — your 1Rad helper. Ask me anything about using the app, in Hindi or English. You can type or tap the mic." },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef(null);
  const bodyRef = useRef(null);

  // Language hint (drives voice-out + helps the model) and voice-out on/off.
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('radai_lang') || 'en'; } catch { return 'en'; } });
  const [soundOn, setSoundOn] = useState(() => { try { return localStorage.getItem('radai_sound') !== '0'; } catch { return true; } });
  const [speakingId, setSpeakingId] = useState(null);

  // Hands-free (wake word). Off by default; opt-in and persisted.
  const [handsFree, setHandsFree] = useState(() => { try { return localStorage.getItem('radai_handsfree') === '1'; } catch { return false; } });
  const [wakeListening, setWakeListening] = useState(false); // true = heard wake word, awaiting question

  useEffect(() => { try { localStorage.setItem('radai_lang', lang); } catch { /* ignore */ } }, [lang]);
  useEffect(() => { try { localStorage.setItem('radai_sound', soundOn ? '1' : '0'); } catch { /* ignore */ } }, [soundOn]);
  useEffect(() => { try { localStorage.setItem('radai_handsfree', handsFree ? '1' : '0'); } catch { /* ignore */ } }, [handsFree]);

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

  // ── Voice-out (browser speech synthesis) ──────────────────────────────────
  const speak = (msg) => {
    if (!ttsSupported || !msg?.text) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(msg.text);
      u.lang = (msg.lang === 'hi') ? 'hi-IN' : 'en-IN';
      const voices = synth.getVoices?.() || [];
      const want = (msg.lang === 'hi') ? 'hi' : 'en';
      const v = voices.find((x) => x.lang === u.lang)
        || voices.find((x) => (x.lang || '').toLowerCase().startsWith(want));
      if (v) u.voice = v;
      u.onend = () => setSpeakingId((cur) => (cur === msg.id ? null : cur));
      u.onerror = () => setSpeakingId((cur) => (cur === msg.id ? null : cur));
      setSpeakingId(msg.id);
      synth.speak(u);
    } catch { /* ignore */ }
  };
  const stopSpeak = () => { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } setSpeakingId(null); };

  // Stop any speech when the panel closes, and on unmount. External cleanup only
  // (the utterance's onend/onerror clears the speaking indicator) so we don't
  // call setState directly inside the effect.
  useEffect(() => { if (!open) { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } } }, [open]);
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }, []);

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

  const ask = async (payload, spoken = false) => {
    setBusy(true);
    try {
      const history = messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
      const res = await apiClient.post('/assist/radai', { ...payload, lang, page: location.pathname, history });
      const data = res?.data || {};
      if (data.success && data.answer) {
        const msg = {
          id: uid(), role: 'assistant', text: data.answer,
          lang: data.replyLanguage || lang,
          followups: Array.isArray(data.suggestedFollowups) ? data.suggestedFollowups.slice(0, 3) : [],
        };
        setMessages((m) => [...m, msg]);
        // Read voice questions back (voice in -> voice out). Typed answers stay
        // silent unless the user taps Listen. The 🔊 header toggle mutes both.
        if (soundOn && (spoken || !!payload?.audioBase64)) speak(msg);
      } else {
        setMessages((m) => [...m, { id: uid(), role: 'assistant', text: data.error || "I'm having trouble right now. Please try again." }]);
      }
    } catch {
      setMessages((m) => [...m, { id: uid(), role: 'assistant', text: "I couldn't reach the help service. Please try again." }]);
    } finally { setBusy(false); }
  };

  const sendText = () => {
    const q = input.trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { id: uid(), role: 'user', text: q }]);
    setInput('');
    ask({ question: q });
  };

  const askSuggestion = (q) => {
    if (busy) return;
    setMessages((m) => [...m, { id: uid(), role: 'user', text: q }]);
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
        setMessages((m) => [...m, { id: uid(), role: 'user', text: '🎤 Voice message' }]);
        ask({ audioBase64: dataUrl, audioMimeType: mime });
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      notifyToast('Microphone is not available. You can type your question instead.', 'error');
    }
  };

  // ── Hands-free wake word ("Hey RadAI …") ──────────────────────────────────
  const recogRef = useRef(null);
  const recogRunning = useRef(false);
  const handsFreeRef = useRef(handsFree);
  const busyRef = useRef(busy);
  const speakingRef = useRef(!!speakingId);
  const awakeRef = useRef(false);
  const awakeTimer = useRef(null);
  const langRef = useRef(lang);
  const apiRef = useRef({});

  const chime = () => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = new AC();
      const o = ac.createOscillator(); const g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.07, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.25);
      o.start(); o.stop(ac.currentTime + 0.26);
    } catch { /* ignore */ }
  };

  const clearAwake = () => { awakeRef.current = false; setWakeListening(false); try { clearTimeout(awakeTimer.current); } catch { /* ignore */ } };
  const enterAwake = () => {
    awakeRef.current = true;
    setWakeListening(true);
    chime();
    try { clearTimeout(awakeTimer.current); } catch { /* ignore */ }
    awakeTimer.current = setTimeout(() => { awakeRef.current = false; setWakeListening(false); }, 8000);
  };

  const askFromVoice = (q) => {
    clearAwake();
    stopRecog();                 // pause while we process + speak (never hear ourselves)
    setOpen(true);               // surface the conversation
    setMessages((m) => [...m, { id: uid(), role: 'user', text: q }]);
    ask({ question: q }, true);  // spoken = true -> read the answer aloud
  };

  // Wake-word + question parser. Called with each final recognised phrase.
  const handleHeard = (text) => {
    if (busyRef.current || speakingRef.current) return;
    const lower = text.toLowerCase();
    const m = lower.match(WAKE);
    if (m) {
      const after = text.slice((m.index || 0) + m[0].length).replace(/^[\s,.:!?-]+/, '').trim();
      if (after.length >= 2) askFromVoice(after);
      else enterAwake();
    } else if (awakeRef.current && text.trim().length >= 2) {
      askFromVoice(text.trim());
    }
  };

  const ensureRecog = () => {
    if (recogRef.current || !wakeSupported) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      const res = e.results[e.results.length - 1];
      if (!res || !res.isFinal) return;
      const text = (res[0]?.transcript || '').trim();
      if (text) apiRef.current.onHeard?.(text);
    };
    r.onend = () => apiRef.current.onIdle?.();
    r.onerror = (e) => apiRef.current.onError?.(e);
    recogRef.current = r;
  };
  const startRecog = () => {
    if (!wakeSupported || recogRunning.current) return;
    ensureRecog();
    try {
      recogRef.current.lang = langRef.current === 'hi' ? 'hi-IN' : 'en-IN';
      recogRef.current.start();
      recogRunning.current = true;
    } catch { /* already started */ }
  };
  const stopRecog = () => {
    recogRunning.current = false;
    try { recogRef.current?.stop(); } catch { /* ignore */ }
  };

  // ── Tap-mic: transcribe in the BROWSER (speech-to-text), then send the TEXT to
  // the help service (which answers with Claude Haiku). Audio never leaves the
  // device and Gemini's transcription path is bypassed. Falls back to recording
  // audio only when the browser has no speech recognition (e.g. Firefox).
  const voiceRecogRef = useRef(null);
  const voiceTextRef = useRef('');
  const capturingRef = useRef(false);

  const resumeHandsFree = () => {
    if (handsFreeRef.current && !busyRef.current && !speakingRef.current) {
      setTimeout(() => startRecog(), 400);
    }
  };

  const startVoiceCapture = () => {
    if (busy) return;
    if (!wakeSupported) { startRecording(); return; }   // no STT → fall back to audio
    capturingRef.current = true;
    voiceTextRef.current = '';
    stopRecog();                                         // pause hands-free while capturing
    try {
      const r = new SR();
      r.continuous = true;
      r.interimResults = true;
      r.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
      r.onresult = (e) => {
        let finalT = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalT += (e.results[i][0]?.transcript || '') + ' ';
        }
        if (finalT.trim()) voiceTextRef.current = `${voiceTextRef.current} ${finalT}`.trim();
      };
      r.onerror = (ev) => {
        capturingRef.current = false; setRecording(false);
        const err = ev?.error;
        if (err === 'not-allowed' || err === 'service-not-allowed') notifyToast('Microphone permission is needed.', 'error');
        else if (err === 'no-speech') notifyToast("Didn't catch that — please try again or type.", 'info');
        else if (err !== 'aborted') notifyToast('Voice input failed — please type your question.', 'error');
        resumeHandsFree();
      };
      r.onend = () => {
        const q = voiceTextRef.current.trim();
        capturingRef.current = false; setRecording(false);
        if (q) { setMessages((m) => [...m, { id: uid(), role: 'user', text: q }]); ask({ question: q }, true); }
        resumeHandsFree();
      };
      voiceRecogRef.current = r;
      r.start();
      setRecording(true);
    } catch {
      capturingRef.current = false;
      startRecording(); // fall back to audio
    }
  };

  const stopVoiceCapture = () => {
    // Stop STT (its onend sends the buffered transcript) or the audio fallback.
    try { voiceRecogRef.current?.stop(); } catch { /* ignore */ }
    try { mediaRef.current?.stop(); } catch { /* ignore */ }
    setRecording(false);
  };

  // Keep the recognition callbacks pointed at the latest closures, and drive
  // start/stop from the live flags. Recognition runs only while hands-free is on
  // AND we're idle (not processing, not speaking) so RadAI never transcribes its
  // own voice. None of this calls setState directly in an effect body.
  useEffect(() => {
    apiRef.current.onHeard = handleHeard;
    apiRef.current.onIdle = () => {
      recogRunning.current = false;
      if (handsFreeRef.current && !busyRef.current && !speakingRef.current && !capturingRef.current) {
        setTimeout(() => startRecog(), 300);
      }
    };
    apiRef.current.onError = (ev) => {
      recogRunning.current = false;
      const err = ev?.error;
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setHandsFree(false);
        notifyToast('Microphone permission is needed for hands-free. Turned it off.', 'error');
      } else if (err === 'network') {
        setHandsFree(false);
        notifyToast('Hands-free needs Chrome or Edge on the web. Use the mic button here instead.', 'error');
      }
      // 'no-speech' / 'aborted' -> ignore; onIdle restarts when appropriate.
    };
  });

  useEffect(() => {
    handsFreeRef.current = handsFree;
    busyRef.current = busy;
    speakingRef.current = !!speakingId;
    langRef.current = lang;
    if (wakeSupported && handsFree && !busy && !speakingId) startRecog();
    else stopRecog();
  }, [handsFree, busy, speakingId, lang]);

  // Tear down recognition on unmount.
  useEffect(() => () => { recogRunning.current = false; try { recogRef.current?.abort?.(); } catch { /* ignore */ } }, []);

  // Latest assistant answer's follow-up chips (shown after the first exchange).
  const lastFollowups = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].followups || [];
    }
    return [];
  })();

  // Panel anchored to the launcher, clamped on-screen.
  const PW = Math.min(380, (typeof window !== 'undefined' ? window.innerWidth : 380) - 24);
  const PH = Math.min(540, (typeof window !== 'undefined' ? window.innerHeight : 540) - 24);
  const panelLeft = clamp(pos.x + LW - PW, 12, (typeof window !== 'undefined' ? window.innerWidth : PW) - PW - 12);
  const panelTop = clamp(pos.y - PH - 12, 12, (typeof window !== 'undefined' ? window.innerHeight : PH) - PH - 12);

  const headerBtn = {
    border: 'none', background: 'rgba(255,255,255,0.18)', color: 'white',
    height: '28px', minWidth: '28px', padding: '0 8px', borderRadius: '14px',
    cursor: 'pointer', fontWeight: 900, fontSize: '11px', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  };

  return (
    <>
      {/* Launcher — NexEagle logo + animated "RadAI" wordmark */}
      <button
        onPointerDown={onPointerDown}
        title="Ask RadAI — help (drag to move)"
        style={{
          position: 'fixed', left: pos.x, top: pos.y, height: LH, padding: '0 18px 0 7px', borderRadius: LH / 2,
          border: 'none', cursor: 'grab', zIndex: 2147483600, touchAction: 'none',
          background: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
          boxShadow: open ? '0 10px 28px -6px rgba(79,70,229,0.7)' : '0 8px 22px -6px rgba(79,70,229,0.55)',
          display: 'flex', alignItems: 'center', gap: '9px',
        }}
      >
        {/* Live-mic dot — hands-free is always-on listening; show it clearly. */}
        {handsFree && (
          <span title="Hands-free listening" style={{ position: 'absolute', top: '-3px', right: '-3px', width: '13px', height: '13px', borderRadius: '50%', background: '#ef4444', border: '2px solid white', animation: 'radaiPulse 1.4s infinite' }} />
        )}
        <span style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
          <img src={LOGO} alt="NexEagle" draggable={false} style={{ width: '32px', height: '32px', objectFit: 'contain', pointerEvents: 'none' }} />
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '4px', pointerEvents: 'none' }}>
          <span style={{ fontSize: '13px', fontWeight: 800, color: 'rgba(255,255,255,0.92)', letterSpacing: '0.3px' }}>Ask</span>
          <span className="radai-shimmer" style={{ fontSize: '15px', fontWeight: 950, letterSpacing: '0.5px' }}>RadAI</span>
        </span>
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: panelLeft, top: panelTop, width: PW, height: PH, zIndex: 2147483601,
          background: 'white', borderRadius: '22px', border: '1px solid rgba(124,58,237,0.14)',
          boxShadow: '0 30px 70px -14px rgba(79,70,229,0.4), 0 8px 24px -8px rgba(15,23,42,0.2)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'radaiPanelIn 0.22s cubic-bezier(0.16,1,0.3,1)', transformOrigin: 'bottom right',
        }}>
          {/* Header */}
          <div style={{ position: 'relative', padding: '15px 16px', background: 'linear-gradient(135deg,#7c3aed 0%,#5b21b6 55%,#4f46e5 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-40px', right: '-30px', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.18), transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}>
              <span style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, boxShadow: '0 0 0 3px rgba(255,255,255,0.18)' }}>
                <img src={LOGO} alt="NexEagle" style={{ width: '27px', height: '27px', objectFit: 'contain' }} />
              </span>
              <div>
                <div className="radai-shimmer-dark" style={{ fontSize: '15px', fontWeight: 950, letterSpacing: '0.3px' }}>RadAI</div>
                <div style={{ fontSize: '9.5px', fontWeight: 700, color: 'rgba(255,255,255,0.82)', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '1px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 0 0 rgba(74,222,128,0.6)', animation: 'radaiOnline 1.6s infinite' }} />
                  Online · by NexEagle · हिंदी / English
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
              {wakeSupported && (
                <button onClick={() => { if (handsFree) stopRecog(); setHandsFree((v) => !v); }} title={handsFree ? "Hands-free ON — say 'Hey RadAI'. Tap to turn off." : "Hands-free OFF — tap to listen for 'Hey RadAI'"} style={{ ...headerBtn, background: handsFree ? '#4ade80' : 'rgba(255,255,255,0.18)', color: handsFree ? '#06310f' : 'white', fontSize: '13px' }}>🎙️</button>
              )}
              <button onClick={() => setLang((l) => (l === 'en' ? 'hi' : 'en'))} title="Answer language hint" style={headerBtn}>{lang === 'hi' ? 'हिं' : 'EN'}</button>
              {ttsSupported && (
                <button onClick={() => { if (soundOn) stopSpeak(); setSoundOn((s) => !s); }} title={soundOn ? 'Mute voice' : 'Read answers aloud'} style={{ ...headerBtn, fontSize: '13px' }}>{soundOn ? '🔊' : '🔇'}</button>
              )}
              <button onClick={() => setOpen(false)} title="Close" style={{ ...headerBtn, background: 'rgba(255,255,255,0.18)', width: '28px', minWidth: '28px', padding: 0, borderRadius: '50%', fontSize: '13px' }}>✕</button>
            </div>
          </div>

          {/* Hands-free status strip */}
          {handsFree && (
            <div style={{ padding: '5px 14px', background: wakeListening ? '#dcfce7' : '#f5f3ff', color: wakeListening ? '#166534' : '#6d28d9', fontSize: '10.5px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #eef2f7' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: wakeListening ? '#16a34a' : '#a78bfa', animation: 'radaiOnline 1.4s infinite', flexShrink: 0 }} />
              {wakeListening ? 'Listening… ask your question' : 'Hands-free on · say “Hey RadAI, …”'}
            </div>
          )}

          {/* Messages */}
          <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', background: 'linear-gradient(180deg,#faf9ff 0%,#f5f6fb 100%)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: '7px', animation: 'radaiMsgIn 0.25s ease-out' }}>
                  {!isUser && (
                    <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', boxShadow: '0 2px 6px rgba(79,70,229,0.35)' }}>
                      <img src={LOGO} alt="" style={{ width: '18px', height: '18px', objectFit: 'contain' }} />
                    </span>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', maxWidth: '80%', gap: '3px' }}>
                    <div style={{
                      maxWidth: '100%', padding: '10px 13px',
                      borderRadius: isUser ? '16px 16px 5px 16px' : '16px 16px 16px 5px',
                      background: isUser ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : 'white',
                      color: isUser ? 'white' : '#1e293b', border: isUser ? 'none' : '1px solid #eef2f7',
                      fontSize: '12.5px', fontWeight: 500, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      boxShadow: isUser ? '0 6px 16px -5px rgba(79,70,229,0.5)' : '0 2px 10px rgba(15,23,42,0.06)',
                    }}>{m.text}</div>
                    {!isUser && ttsSupported && (
                      <button
                        onClick={() => (speakingId === m.id ? stopSpeak() : speak(m))}
                        title={speakingId === m.id ? 'Stop' : 'Listen'}
                        style={{ border: 'none', background: 'transparent', color: speakingId === m.id ? '#dc2626' : '#a5b4fc', cursor: 'pointer', fontSize: '10.5px', fontWeight: 800, padding: '1px 4px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                      >{speakingId === m.id ? '⏹ Stop' : '🔊 Listen'}</button>
                    )}
                  </div>
                </div>
              );
            })}

            {busy && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '7px', animation: 'radaiMsgIn 0.25s ease-out' }}>
                <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                  <img src={LOGO} alt="" style={{ width: '18px', height: '18px', objectFit: 'contain' }} />
                </span>
                <div style={{ padding: '13px 14px', borderRadius: '16px 16px 16px 5px', background: 'white', border: '1px solid #eef2f7', display: 'flex', gap: '4px', alignItems: 'center', boxShadow: '0 2px 10px rgba(15,23,42,0.06)' }}>
                  <span className="radai-dot" /><span className="radai-dot" style={{ animationDelay: '0.15s' }} /><span className="radai-dot" style={{ animationDelay: '0.3s' }} />
                </div>
              </div>
            )}

            {/* Quick-reply chips — static greeting prompts early on, then RadAI's
                own suggested follow-ups after each answer. */}
            {!busy && (() => {
              const chips = messages.length <= 2 ? SUGGESTIONS : lastFollowups;
              if (!chips || chips.length === 0) return null;
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px', paddingLeft: '33px' }}>
                  {chips.map((s) => (
                    <button key={s} onClick={() => askSuggestion(s)} style={{ padding: '7px 11px', borderRadius: '999px', border: '1px solid #ddd6fe', background: 'white', color: '#6d28d9', fontSize: '11px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 1px 4px rgba(124,58,237,0.08)' }}>
                      {s}
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Composer */}
          <div style={{ padding: '10px 12px 9px', borderTop: '1px solid #eef2f7', background: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f4f3fb', borderRadius: '15px', padding: '5px 5px 5px 7px', border: '1.5px solid #ece9fb' }}>
              <button
                onClick={recording ? stopVoiceCapture : startVoiceCapture}
                disabled={busy}
                title={recording ? 'Stop & send' : 'Speak (Hindi/English)'}
                style={{ flexShrink: 0, width: '34px', height: '34px', borderRadius: '50%', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', background: recording ? '#dc2626' : 'transparent', color: recording ? 'white' : '#7c3aed', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: recording ? 'radaiPulse 1s infinite' : 'none' }}
              >{recording ? '⏹' : '🎤'}</button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendText(); }}
                placeholder={recording ? 'Listening… tap ⏹ to send' : 'Ask how to do something…'}
                disabled={busy || recording}
                style={{ flex: 1, minWidth: 0, padding: '8px 4px', border: 'none', background: 'transparent', fontSize: '12.5px', fontWeight: 600, outline: 'none', color: '#1e293b' }}
              />
              <button
                onClick={sendText}
                disabled={busy || recording || !input.trim()}
                title="Send"
                style={{ flexShrink: 0, width: '36px', height: '36px', borderRadius: '50%', border: 'none', cursor: (busy || !input.trim()) ? 'not-allowed' : 'pointer', background: (busy || recording || !input.trim()) ? '#cbd5e1' : 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: 'white', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: (busy || !input.trim()) ? 'none' : '0 4px 12px -3px rgba(79,70,229,0.5)' }}
              >➤</button>
            </div>
            <div style={{ textAlign: 'center', fontSize: '8.5px', fontWeight: 700, color: '#cbd5e1', marginTop: '7px', letterSpacing: '0.3px' }}>Powered by NexEagle · answers may be imperfect</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes radaiPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.5); } 50% { box-shadow: 0 0 0 7px rgba(220,38,38,0); } }
        .radai-shimmer, .radai-shimmer-dark { background-size: 200% auto; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; animation: radaiShine 2.6s linear infinite; }
        .radai-shimmer { background-image: linear-gradient(90deg,#ffffff 0%,#ffffff 38%,#c4b5fd 50%,#ffffff 62%,#ffffff 100%); }
        .radai-shimmer-dark { background-image: linear-gradient(90deg,#ffffff 0%,#ffffff 40%,#a5b4fc 50%,#ffffff 60%,#ffffff 100%); }
        @keyframes radaiShine { to { background-position: -200% center; } }
        @keyframes radaiPanelIn { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: none; } }
        @keyframes radaiMsgIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes radaiOnline { 0% { box-shadow: 0 0 0 0 rgba(74,222,128,0.6); } 70% { box-shadow: 0 0 0 5px rgba(74,222,128,0); } 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); } }
        .radai-dot { width: 7px; height: 7px; border-radius: 50%; background: #a5b4fc; display: inline-block; animation: radaiBounce 1s infinite; }
        @keyframes radaiBounce { 0%,60%,100% { transform: translateY(0); opacity: 0.45; } 30% { transform: translateY(-5px); opacity: 1; } }
      `}</style>
    </>
  );
}
