import { useEffect, useRef, useState, useCallback } from 'react';
import { chooseEngine } from './speechEngine';
import { notifyToast } from '../../../utils/toast';
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
// "colon" and "period" are NOT commands on their own — they are anatomy and
// clinical words ("sigmoid colon", "a period of 3 months") and used to turn
// into ":" / "." mid-sentence. Say "full stop", "insert period" or
// "insert colon" for the punctuation.
const VOICE_COMMANDS = [
  [/\bfull stop\b/gi,      '.'],
  [/\binsert period\b/gi,  '.'],
  [/\bcomma\b/gi,          ','],
  [/\bsemicolon\b/gi,      ';'],
  [/\binsert colon\b/gi,   ':'],
  [/\bquestion mark\b/gi,  '?'],
  [/\bexclamation mark\b/gi, '!'],
  [/\bopen bracket\b/gi,   '('],
  [/\bclose bracket\b/gi,  ')'],
  [/\bnew line\b/gi,       '\n'],
  [/\bnew paragraph\b/gi,  '\n\n'],
];

/**
 * Whole-phrase ACTION commands. Unlike the punctuation rules above (which
 * substitute TEXT), these perform an EDITOR action — field navigation, undo,
 * real block breaks — and are emitted via the `onCommand` callback instead of
 * inserting text. Matched ONLY when the WHOLE finalised phrase is the command
 * (radiologists pause around a command, so it finalises on its own); a command
 * word buried mid-sentence is never swallowed and flows through as normal text.
 */
const ACTION_COMMANDS = [
  [/^next field$/,                     'nextField'],
  [/^(previous|prior) field$/,         'prevField'],
  [/^(scratch|delete|undo) that$/,     'undo'],
  [/^new paragraph$/,                  'newParagraph'],
  [/^new line$/,                       'newLine'],
];

/** Returns the action-command name if the whole phrase IS a command, else null. */
function matchActionCommand(text) {
  const norm = (text || '').trim().toLowerCase().replace(/[.,;:!?\s]+$/, '').trim();
  for (const [re, cmd] of ACTION_COMMANDS) if (re.test(norm)) return cmd;
  return null;
}

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
  // Spoken punctuation arrives space-padded ("clear . heart") — attach it to
  // the word before, and open brackets to the word after.
  out = out.replace(/[ \t]+([.,;:?!)])/g, '$1').replace(/\([ \t]+/g, '(');
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
 *   - mode: 'local' (on this computer) | 'cloud' (browser's cloud service,
 *     only when the centre allows it) | null
 *
 * When a phrase finalises, calls `onResult(text)` with post-processed text.
 */
export function useVoiceDictation({ onResult, onInterim, onCommand, lang = 'en-US' } = {}) {
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState(null);
  const startingRef = useRef(false);
  const recogRef = useRef(null);
  const supported = isVoiceSupported();

  // Keep a ref to the latest onResult so SpeechRecognition's bound handlers
  // always call the current callback even after re-renders.
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  const onInterimRef = useRef(onInterim);
  useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);
  const onCommandRef = useRef(onCommand);
  useEffect(() => { onCommandRef.current = onCommand; }, [onCommand]);

  const stop = useCallback(() => {
    if (recogRef.current) {
      try { recogRef.current.stop(); } catch {}
    }
    setActive(false);
  }, []);

  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  const start = useCallback(async () => {
    if (!supported || startingRef.current) return;
    startingRef.current = true;
    // Warm the corrections + grammar files. Fire-and-forget — the engine
    // starts immediately; corrections apply as soon as the JSON arrives.
    warmVoiceData();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    // On this computer when possible; the cloud only if the centre allows it.
    let engine;
    try {
      engine = await chooseEngine(SR, lang, {
        onInstalling: () => notifyToast('Getting voice typing ready on this computer (one-time download)…', 'info', { duration: 6000 }),
      });
    } finally {
      startingRef.current = false;
    }
    if (engine.mode === 'blocked') {
      notifyToast({ title: 'Voice typing not available', message: engine.message }, 'warning', { duration: 9000 });
      setMode(null);
      return;
    }

    const r = new SR();
    r.lang = lang;
    // Explicit either way: true keeps the audio on the computer; false is
    // only reached when the centre has allowed cloud dictation.
    try { r.processLocally = engine.mode === 'local'; } catch { /* older engines */ }
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
        // Whole-phrase action command (e.g. "next field", "scratch that") →
        // perform an editor action instead of inserting text. Falls through to
        // text insertion if no onCommand handler is wired (back-compat).
        const cmd = matchActionCommand(finalText);
        if (cmd && onCommandRef.current) {
          onCommandRef.current(cmd);
        } else {
          onResultRef.current?.(postProcess(finalText));
        }
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
      setMode(engine.mode);
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

  return { supported, active, toggle, stop, start, mode };
}
