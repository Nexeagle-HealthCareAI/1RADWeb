import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Web Speech API support detection.
 * Chrome/Edge/Safari all expose webkitSpeechRecognition; Firefox does not.
 */
export function isVoiceSupported() {
  if (typeof window === 'undefined') return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Post-processing table — common phonetic mistakes the Web Speech engine
 * makes on radiology vocabulary. Pattern → replacement.
 */
const PHRASE_FIXES = [
  [/\bnew monia\b/gi, 'pneumonia'],
  [/\bpnew monia\b/gi, 'pneumonia'],
  [/\bnumonia\b/gi, 'pneumonia'],
  [/\battala lectasis\b/gi, 'atelectasis'],
  [/\battle lecta sis\b/gi, 'atelectasis'],
  [/\beffusion\b/gi, 'effusion'],
  [/\bemphasys ma\b/gi, 'emphysema'],
  [/\bcontrast in hands\b/gi, 'contrast-enhanced'],
  [/\bsino site is\b/gi, 'sinusitis'],
  [/\bcyst ick\b/gi, 'cystic'],
  [/\bnecrosis\b/gi, 'necrosis'],
  [/\boste o\b/gi, 'osteo'],
  [/\bay orta\b/gi, 'aorta'],
  [/\bay ortic\b/gi, 'aortic'],
  [/\bcardio meg lee\b/gi, 'cardiomegaly'],
  [/\bcomma\b/gi, ','],
  [/\bperiod\b/gi, '.'],
  [/\bfull stop\b/gi, '.'],
  [/\bnew line\b/gi, '\n'],
  [/\bnew paragraph\b/gi, '\n\n'],
];

function postProcess(text) {
  let out = text;
  for (const [re, sub] of PHRASE_FIXES) out = out.replace(re, sub);
  return out;
}

/**
 * useVoiceDictation
 *
 * Hook that wraps `webkitSpeechRecognition`. Returns:
 *   - supported: boolean
 *   - active: boolean
 *   - toggle(): function — start if stopped, stop if started
 *   - stop(): function
 *
 * When a phrase finalises, calls `onResult(text)` with post-processed text.
 */
export function useVoiceDictation({ onResult, lang = 'en-US' } = {}) {
  const [active, setActive] = useState(false);
  const recogRef = useRef(null);
  const supported = isVoiceSupported();

  // Keep a ref to the latest onResult so SpeechRecognition's bound handlers
  // always call the current callback even after re-renders.
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  const stop = useCallback(() => {
    if (recogRef.current) {
      try { recogRef.current.stop(); } catch {}
    }
    setActive(false);
  }, []);

  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  const start = useCallback(() => {
    if (!supported) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = false;
    r.maxAlternatives = 1;

    r.onresult = (e) => {
      let finalText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) finalText += result[0].transcript;
      }
      if (finalText) {
        const processed = postProcess(finalText);
        onResultRef.current?.(processed);
      }
    };

    r.onerror = (e) => {
      console.warn('[VoiceDictation] error:', e.error);
      // Auto-recover on aborts caused by no-speech
      if (e.error === 'no-speech' || e.error === 'aborted') {
        // Will restart on next user click
      }
      setActive(false);
    };

    r.onend = () => {
      if (recogRef.current === r && activeRef.current) {
        try { r.start(); } catch { setActive(false); }
      } else {
        setActive(false);
      }
    };

    try {
      r.start();
      recogRef.current = r;
      setActive(true);
    } catch (err) {
      console.warn('[VoiceDictation] start failed:', err);
      setActive(false);
    }
  }, [supported, lang]);

  const toggle = useCallback(() => {
    if (active) stop(); else start();
  }, [active, start, stop]);

  // Cleanup on unmount
  useEffect(() => () => stop(), [stop]);

  return { supported, active, toggle, stop, start };
}
