/**
 * ============================================================
 *  RADIOLOGY REPORT EDITOR
 *  TipTap + Web Speech API Integration
 *  Author: Radiology MCh Reference System
 *  Version: 1.0
 * ============================================================
 *
 *  INSTALL DEPENDENCIES
 *  npm install @tiptap/core @tiptap/starter-kit @tiptap/suggestion
 *              @tiptap/extension-mention tippy.js fuse.js
 * ============================================================
 */

// ─────────────────────────────────────────────────────────────
// 1. DATA LOADER  — loads JSON exports once, caches in memory
// ─────────────────────────────────────────────────────────────
const RadiologyData = (() => {
  let _terms        = null;
  let _corrections  = null;
  let _vocab        = null;
  let _templates    = null;
  let _fuse         = null;

  async function init() {
    const [termsRes, speechRes, tplRes] = await Promise.all([
      fetch('/data/autocomplete_light.json'),
      fetch('/data/speech_dictionary.json'),
      fetch('/data/report_templates.json'),
    ]);
    const termsData  = await termsRes.json();
    const speechData = await speechRes.json();
    const tplData    = await tplRes.json();

    _terms       = termsData.terms;          // lightweight array
    _corrections = speechData.corrections;   // misheard → correct pairs
    _vocab       = speechData.vocabulary;    // unique radiological words
    _templates   = tplData.templates;        // slash command templates

    // Build Fuse.js fuzzy search index
    const Fuse = (await import('fuse.js')).default;
    _fuse = new Fuse(_terms, {
      keys: [
        { name: 'label', weight: 0.6 },
        { name: 'key',   weight: 0.3 },
        { name: 'alt',   weight: 0.1 },
      ],
      threshold:          0.35,   // 0=exact, 1=match anything
      includeScore:       true,
      minMatchCharLength: 2,
      ignoreLocation:     true,
    });

    console.log(`[RadiologyData] Loaded ${_terms.length} terms, ${_vocab.length} vocab words`);
    return true;
  }

  function search(query, limit = 20) {
    if (!_fuse || !query || query.length < 2) return [];
    return _fuse
      .search(query, { limit })
      .map(r => r.item);
  }

  function getTermById(id) {
    return _terms?.find(t => t.id === id) ?? null;
  }

  function getTemplates()   { return _templates  ?? []; }
  function getCorrections() { return _corrections ?? []; }
  function getVocab()       { return _vocab       ?? []; }

  return { init, search, getTermById, getTemplates, getCorrections, getVocab };
})();


// ─────────────────────────────────────────────────────────────
// 2. TIPTAP SUGGESTION EXTENSION  — autocomplete dropdown
// ─────────────────────────────────────────────────────────────
import { Editor }     from '@tiptap/core';
import StarterKit     from '@tiptap/starter-kit';
import Mention        from '@tiptap/extension-mention';
import tippy          from 'tippy.js';

/**
 * RadiologyTermSuggestion — plugs into TipTap Mention extension.
 * Triggered when user types any 2+ characters (no special trigger char).
 * Renders a floating dropdown with term + short definition.
 */
const RadiologyTermSuggestion = {
  char:          '',          // no trigger character; always-on
  startOfLine:   false,
  allowSpaces:   true,

  // Called on every keystroke — return filtered list
  items({ query }) {
    if (query.length < 2) return [];
    return RadiologyData.search(query, 15);
  },

  // Render the floating popup
  render() {
    let component;
    let popup;

    return {
      onStart(props) {
        // Build popup element
        const el = document.createElement('div');
        el.className = 'radiology-suggestion-list';
        el.innerHTML = renderItems(props.items, props.query);
        el.addEventListener('click', e => {
          const li = e.target.closest('[data-id]');
          if (li) props.command({ id: li.dataset.id, label: li.dataset.label });
        });
        component = el;

        popup = tippy(document.body, {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: el,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
          theme: 'radiology',
        });
      },

      onUpdate(props) {
        component.innerHTML = renderItems(props.items, props.query);
        popup[0].setProps({ getReferenceClientRect: props.clientRect });
      },

      onKeyDown(props) {
        if (props.event.key === 'Escape') { popup[0].hide(); return true; }
        return false;
      },

      onExit() { popup[0].destroy(); },
    };
  },

  // What gets inserted into the editor on selection
  command({ editor, range, props }) {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent(props.label)   // plain text insert; use Mark for styled version
      .run();
    // Show definition tooltip briefly
    showTermTooltip(props.id, props.label);
  },
};

function renderItems(items, query) {
  if (!items.length) return '<div class="no-results">No radiology terms found</div>';
  return items.map(item => `
    <div class="suggestion-item" data-id="${item.id}" data-label="${escHtml(item.label)}" tabindex="0">
      <span class="term-label">${highlight(item.label, query)}</span>
      <span class="term-cat">${escHtml(item.cat)}</span>
      <span class="term-def">${escHtml(item.short)}</span>
    </div>
  `).join('');
}

function highlight(text, query) {
  if (!query) return escHtml(text);
  const rx = new RegExp(`(${escRx(query)})`, 'gi');
  return escHtml(text).replace(rx, '<mark>$1</mark>');
}

function showTermTooltip(id, label) {
  // Optionally load full definition from radiology_terms.json on demand
  RadiologyData.getTermById(id);  // extend to show full def in sidebar
}


// ─────────────────────────────────────────────────────────────
// 3. SLASH COMMAND EXTENSION  — /cxr-normal, /impression, etc.
// ─────────────────────────────────────────────────────────────
const SlashCommandSuggestion = {
  char: '/',
  startOfLine: false,
  allowSpaces: false,

  items({ query }) {
    const templates = RadiologyData.getTemplates();
    if (!query) return templates.slice(0, 10);
    const q = query.toLowerCase();
    return templates.filter(t =>
      t.command.toLowerCase().includes(q) ||
      t.label.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    );
  },

  render() {
    let popup;
    return {
      onStart(props) {
        const el = buildSlashMenu(props.items, props.command);
        popup = tippy(document.body, {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: el,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
          theme: 'radiology',
        });
      },
      onUpdate(props) {
        popup[0].setContent(buildSlashMenu(props.items, props.command));
        popup[0].setProps({ getReferenceClientRect: props.clientRect });
      },
      onExit() { popup[0].destroy(); },
    };
  },

  command({ editor, range, props }) {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent(props.template + '\n')
      .run();
  },
};

function buildSlashMenu(items, commandFn) {
  const el = document.createElement('div');
  el.className = 'slash-command-list';
  el.innerHTML = items.map(tpl => `
    <div class="slash-item" data-cmd="${tpl.command}" tabindex="0">
      <span class="slash-icon">${tpl.icon}</span>
      <span class="slash-label">${escHtml(tpl.label)}</span>
      <span class="slash-cat">${escHtml(tpl.category)}</span>
    </div>
  `).join('') || '<div class="no-results">No templates found</div>';

  el.querySelectorAll('.slash-item').forEach(item => {
    item.addEventListener('click', () => {
      const tpl = RadiologyData.getTemplates().find(t => t.command === item.dataset.cmd);
      if (tpl) commandFn({ ...tpl });
    });
  });
  return el;
}


// ─────────────────────────────────────────────────────────────
// 4. TIPTAP EDITOR  — initialise with both extensions
// ─────────────────────────────────────────────────────────────
async function createRadiologyEditor(mountEl) {
  await RadiologyData.init();

  const editor = new Editor({
    element: mountEl,
    extensions: [
      StarterKit,

      // Autocomplete for radiology terms
      Mention.configure({
        HTMLAttributes: { class: 'radiology-term' },
        suggestion: RadiologyTermSuggestion,
        renderHTML({ options, node }) {
          return ['span', { class: 'radiology-term', 'data-id': node.attrs.id }, node.attrs.label];
        },
      }),

      // Slash command templates — second Mention instance with '/' trigger
      Mention.extend({ name: 'slashCommand' }).configure({
        HTMLAttributes: { class: 'slash-cmd' },
        suggestion: SlashCommandSuggestion,
      }),
    ],
    content: '<p>Start dictating or typing your radiology report...</p>',
  });

  return editor;
}


// ─────────────────────────────────────────────────────────────
// 5. WEB SPEECH API  — dictation engine
// ─────────────────────────────────────────────────────────────
class RadiologyDictation {
  constructor(editor) {
    this.editor      = editor;
    this.recognition = null;
    this.isListening = false;
    this.corrections = [];
    this.interim     = '';
  }

  async init() {
    // Load correction pairs
    this.corrections = RadiologyData.getCorrections();

    // Check browser support
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[Dictation] Web Speech API not supported in this browser.');
      return false;
    }

    this.recognition = new SpeechRecognition();
    const r = this.recognition;

    r.lang           = 'en-GB';     // or 'en-US'
    r.continuous     = true;        // keep listening
    r.interimResults = true;        // show partial results while speaking
    r.maxAlternatives = 3;

    // Inject radiology vocabulary as grammar hints
    if ('SpeechGrammarList' in window || 'webkitSpeechGrammarList' in window) {
      const SpeechGrammarList = window.SpeechGrammarList || window.webkitSpeechGrammarList;
      try {
        const grammarRes = await fetch('/data/speech_grammar.jsgf');
        const grammarText = await grammarRes.text();
        const grammarList = new SpeechGrammarList();
        grammarList.addFromString(grammarText, 1);   // weight 1 = highest priority
        r.grammars = grammarList;
      } catch (e) {
        console.warn('[Dictation] Grammar file not loaded:', e);
      }
    }

    // ── Event handlers ──────────────────────────────────
    r.onresult = (event) => {
      let interimText = '';
      let finalText   = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += this.correctTranscript(transcript);
        } else {
          interimText += transcript;
        }
      }

      if (finalText) {
        this.insertToEditor(finalText.trim());
        this.showInterim('');
      } else if (interimText) {
        this.showInterim(interimText);
      }
    };

    r.onerror = (event) => {
      if (event.error === 'no-speech') return;     // silence — ignore
      if (event.error === 'aborted')   return;     // user stopped — ignore
      console.error('[Dictation] Error:', event.error);
      this.updateUI(false);
    };

    r.onend = () => {
      if (this.isListening) r.start();             // auto-restart for continuous mode
    };

    return true;
  }

  /**
   * Post-correction layer
   * Replaces misheard phrases with correct radiological terms.
   * Runs over the full transcript string.
   */
  correctTranscript(text) {
    let corrected = text;

    // 1. Apply explicit correction pairs (exact phrase match, case-insensitive)
    for (const pair of this.corrections) {
      if (!pair.misheard) continue;
      const rx = new RegExp(escRx(pair.misheard), 'gi');
      if (rx.test(corrected)) {
        corrected = corrected.replace(rx, pair.correct);
      }
    }

    // 2. Capitalise sentence starts
    corrected = corrected.replace(/(^\s*|\.\s+)([a-z])/g,
      (_, pre, ch) => pre + ch.toUpperCase());

    // 3. Auto-punctuation: "full stop" → "."  "comma" → ","  "new line" → "\n"
    corrected = corrected
      .replace(/\bfull stop\b/gi,   '.')
      .replace(/\bperiod\b/gi,      '.')
      .replace(/\bcomma\b/gi,       ',')
      .replace(/\bsemicolon\b/gi,   ';')
      .replace(/\bcolon\b/gi,       ':')
      .replace(/\bnew line\b/gi,    '\n')
      .replace(/\bnew paragraph\b/gi, '\n\n')
      .replace(/\bopen bracket\b/gi,  '(')
      .replace(/\bclose bracket\b/gi, ')');

    return corrected;
  }

  insertToEditor(text) {
    if (!text || !this.editor) return;
    this.editor.chain().focus().insertContent(text + ' ').run();
  }

  showInterim(text) {
    // Update a real-time interim display element
    const el = document.getElementById('interim-display');
    if (el) el.textContent = text;
  }

  updateUI(listening) {
    const btn = document.getElementById('dictate-btn');
    if (!btn) return;
    btn.textContent   = listening ? '🔴 Stop' : '🎙️ Dictate';
    btn.dataset.state = listening ? 'recording' : 'idle';
  }

  start() {
    if (!this.recognition) { console.error('Call init() first'); return; }
    this.isListening = true;
    this.recognition.start();
    this.updateUI(true);
    console.log('[Dictation] Started');
  }

  stop() {
    this.isListening = false;
    this.recognition?.stop();
    this.updateUI(false);
    console.log('[Dictation] Stopped');
  }

  toggle() {
    this.isListening ? this.stop() : this.start();
  }
}


// ─────────────────────────────────────────────────────────────
// 6. FULL EDITOR SETUP  — wire everything together
// ─────────────────────────────────────────────────────────────
async function initRadiologyReportEditor() {
  // Create editor
  const mountEl = document.getElementById('radiology-editor');
  if (!mountEl) { console.error('Mount element #radiology-editor not found'); return; }

  const editor = await createRadiologyEditor(mountEl);

  // Create dictation engine
  const dictation = new RadiologyDictation(editor);
  const speechOk  = await dictation.init();

  // Wire dictate button
  const dictBtn = document.getElementById('dictate-btn');
  if (dictBtn && speechOk) {
    dictBtn.addEventListener('click', () => dictation.toggle());
  } else if (dictBtn) {
    dictBtn.disabled       = true;
    dictBtn.title          = 'Web Speech API not supported';
  }

  // Wire export button
  document.getElementById('export-btn')?.addEventListener('click', () => {
    const html = editor.getHTML();
    const text = editor.getText();
    console.log('[Export] HTML:', html);
    console.log('[Export] Text:', text);
    // e.g. POST to your report server here
  });

  console.log('[RadiologyEditor] Ready ✓');
  return { editor, dictation };
}

// Auto-initialise on DOM ready
document.addEventListener('DOMContentLoaded', initRadiologyReportEditor);


// ─────────────────────────────────────────────────────────────
// 7. UTILITY HELPERS
// ─────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escRx(str) {
  return String(str ?? '').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

export {
  RadiologyData,
  RadiologyDictation,
  createRadiologyEditor,
  initRadiologyReportEditor,
};
