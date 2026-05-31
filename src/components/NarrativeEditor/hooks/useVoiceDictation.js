import { useEffect, useRef, useState, useCallback } from 'react';
import { applyCorrections, getGrammarText, warmVoiceData } from '../../../data/voiceCorrections';

/**
 * Web Speech API support detection.
 * Chrome/Edge/Safari all expose webkitSpeechRecognition; Firefox does not.
 */
export function isVoiceSupported() {
  if (typeof window === 'undefined') return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Punctuation + line-break voice commands. These are commands the user
 * speaks aloud (not mishearings to correct), so they're hardcoded here
 * rather than data-driven. They run AFTER the JSON misheard→correct
 * corrections so a 58-pair fix can't accidentally clobber "full stop".
 */
const VOICE_COMMANDS = [
  [/\bfull stop\b/gi,      '.'],
  [/\bperiod\b/gi,         '.'],
  [/\bcomma\b/gi,          ','],
  [/\bsemicolon\b/gi,      ';'],
  [/\bcolon\b/gi,          ':'],
  [/\bquestion mark\b/gi,  '?'],
  [/\bexclamation\b/gi,    '!'],
  [/\bopen bracket\b/gi,   '('],
  [/\bclose bracket\b/gi,  ')'],
  [/\bnew line\b/gi,       '\n'],
  [/\bnew paragraph\b/gi,  '\n\n'],
];

/**
 * Tiny defensive fallback for when /data/speech_dictionary.json hasn't
 * loaded yet (cold offline boot, fetch failure). Once the data layer is
 * ready, applyCorrections() takes over and these become moot.
 */
const HARDCODED_FALLBACK = [
  [/\bhype arrest\b/gi,      'hyperintense'],
  [/\bhype a dense\b/gi,     'hyperdense'],
  [/\bhype oh dense\b/gi,    'hypodense'],
  [/\bnew monia\b/gi,        'pneumonia'],
  [/\bnumonia\b/gi,          'pneumonia'],
  [/\battala lectasis\b/gi,  'atelectasis'],
  [/\bcontrast in hands\b/gi,'contrast-enhanced'],
  [/\bay orta\b/gi,          'aorta'],
];

function postProcess(text) {
  // Order matters: corrections first (so "hype arrest" becomes
  // "hyperintense" BEFORE any word-boundary punctuation rule fires),
  // then voice commands (period/comma/new line).
  let out = applyCorrections(text);
  // If the data layer didn't catch anything (transcript was clean OR the
  // dictionary hasn't loaded yet), run the tiny hardcoded list too. Idempotent.
  for (const [re, sub] of HARDCODED_FALLBACK) out = out.replace(re, sub);
  for (const [re, sub] of VOICE_COMMANDS) out = out.replace(re, sub);
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
export function useVoiceDictation({ onResult, onInterim, lang = 'en-US' } = {}) {
  const [active, setActive] = useState(false);
  const recogRef = useRef(null);
  const supported = isVoiceSupported();

  // Keep a ref to the latest onResult so SpeechRecognition's bound handlers
  // always call the current callback even after re-renders.
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  const onInterimRef = useRef(onInterim);
  useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);

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
    // Warm the corrections + grammar files. Fire-and-forget — the engine
    // starts immediately; corrections apply as soon as the JSON arrives.
    warmVoiceData();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true; // live — emit partial text as the user speaks
    r.maxAlternatives = 1;

    // Prime the engine with the radiology JSGF grammar list. Chrome/Edge
    // accept this and bias their language model toward the listed
    // vocabulary, giving cleaner transcripts BEFORE corrections run.
    // Safari/Firefox don't ship SpeechGrammarList — we degrade silently.
    try {
      const SGL = window.SpeechGrammarList || window.webkitSpeechGrammarList;
      const grammarBody = getGrammarText();
      if (SGL && grammarBody) {
        const gl = new SGL();
        gl.addFromString(grammarBody, 1); // weight 1 = highest priority
        r.grammars = gl;
      }
    } catch (err) {
      console.warn('[VoiceDictation] grammar attachment failed', err?.message || err);
    }

    r.onresult = (e) => {
      let finalText = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (finalText) {
        onResultRef.current?.(postProcess(finalText));
      }
      // Always report the current interim (possibly empty when a phrase just
      // finalised) so the UI can show/clear the live "writing as you speak".
      onInterimRef.current?.(interimText ? postProcess(interimText) : '');
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
