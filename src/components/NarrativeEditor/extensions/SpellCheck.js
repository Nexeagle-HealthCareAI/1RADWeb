import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const spellCheckKey = new PluginKey('spellCheck');

/**
 * SpellCheck — LIVE radiology-aware spelling underline.
 *
 * Unlike GrammarCheck (button-triggered, server-backed), this runs continuously:
 * index.jsx recomputes the decoration set on a typing-debounce via
 * `buildSpellDecorations()` and pushes it with `setSpellDecorations()`. The
 * plugin stores that set and remaps it on every edit so squiggles stay anchored
 * to the right words between recomputes.
 *
 * Misspelled words get the `ne-spell-error` class (wavy red underline, styled in
 * NarrativeEditor.css). Left-click / tap or right-click on a squiggle calls the
 * `onOpenSuggestions` handler (set on `editor.storage.spellCheck`) so the React
 * layer can show a correction popup. Detection/suggestion logic lives entirely
 * in src/data/spellDictionary.js — this extension is just rendering + hit-testing.
 */
export const SpellCheck = Extension.create({
  name: 'spellCheck',

  addStorage() {
    return {
      // Handler the React layer installs: ({ word, from, to, top, left }) => void
      onOpenSuggestions: null,
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;

    // Find the ne-spell-error decoration covering a doc position, if any.
    const errorAt = (state, pos) => {
      const set = spellCheckKey.getState(state);
      if (!set) return null;
      const found = set.find(pos, pos);
      for (const d of found) {
        if (d.type?.attrs?.class?.includes('ne-spell-error')) return d;
      }
      return null;
    };

    const openSuggestions = (view, pos) => {
      const handler = editor.storage.spellCheck?.onOpenSuggestions;
      if (!handler) return false;
      const d = errorAt(view.state, pos);
      if (!d) return false;
      const word = view.state.doc.textBetween(d.from, d.to, undefined, '');
      let top = 0, left = 0;
      try { const c = view.coordsAtPos(d.from); top = c.bottom + 4; left = c.left; } catch { /* off-screen */ }
      handler({ word, from: d.from, to: d.to, top, left });
      return true;
    };

    return [
      new Plugin({
        key: spellCheckKey,

        state: {
          init() { return DecorationSet.empty; },
          apply(tr, oldSet) {
            const meta = tr.getMeta(spellCheckKey);
            if (meta !== undefined) return meta;             // explicit recompute
            if (tr.docChanged) return oldSet.map(tr.mapping, tr.doc); // keep anchored
            return oldSet;
          },
        },

        props: {
          decorations(state) { return spellCheckKey.getState(state); },

          // Left-click / tap on a squiggle opens the correction popup (tablet
          // friendly); clicks on normal text fall through to caret placement.
          handleClickOn(view, pos) {
            return openSuggestions(view, pos);
          },

          handleDOMEvents: {
            // Right-click on a squiggle → our popup instead of the browser menu.
            contextmenu(view, event) {
              const coords = { left: event.clientX, top: event.clientY };
              const at = view.posAtCoords(coords);
              if (!at) return false;
              if (errorAt(view.state, at.pos)) {
                event.preventDefault();
                return openSuggestions(view, at.pos);
              }
              return false;
            },
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      /** Replace the entire spell decoration set (built by buildSpellDecorations). */
      setSpellDecorations:
        (decorationSet) => ({ tr, dispatch }) => {
          if (dispatch) { tr.setMeta(spellCheckKey, decorationSet); dispatch(tr); }
          return true;
        },

      /** Remove all spell underlines (e.g. when the toggle is turned off). */
      clearSpellDecorations:
        () => ({ tr, dispatch }) => {
          if (dispatch) { tr.setMeta(spellCheckKey, DecorationSet.empty); dispatch(tr); }
          return true;
        },
    };
  },
});

// Word tokenizer — a letter-initial run incl. internal hyphens/apostrophes, so
// "well-defined" and "patient's" stay single tokens (the checker handles them).
const TOKEN_RE = /[A-Za-z][A-Za-z'’-]*/g;

/**
 * Scan the document and return a DecorationSet underlining every misspelled word.
 *
 * @param doc          ProseMirror doc node
 * @param isWordValid  (token:string) => boolean  (from spellDictionary)
 * @param headPos      caret position, or null — the word under the caret is left
 *                     un-flagged so it doesn't underline mid-type.
 */
export function buildSpellDecorations(doc, isWordValid, headPos) {
  const decos = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = TOKEN_RE.exec(text)) !== null) {
      const word = m[0];
      const from = pos + m.index;
      const to = from + word.length;
      if (headPos != null && headPos >= from && headPos <= to) continue; // being typed
      if (isWordValid(word)) continue;
      decos.push(Decoration.inline(from, to, { class: 'ne-spell-error', 'data-spell-word': word }));
    }
  });
  return DecorationSet.create(doc, decos);
}

/**
 * Dirty-range variant: scan only the text nodes within [rangeFrom, rangeTo] and
 * return the spell decorations for that slice (not a DecorationSet). The caller
 * removes the stale decorations covering the same range and adds these, so a
 * keystroke only re-checks the edited block instead of the whole document.
 * `rangeFrom`/`rangeTo` should be block boundaries so no word is split.
 */
export function buildSpellDecorationsForRange(doc, isWordValid, headPos, rangeFrom, rangeTo) {
  const decos = [];
  doc.nodesBetween(rangeFrom, rangeTo, (node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = TOKEN_RE.exec(text)) !== null) {
      const word = m[0];
      const from = pos + m.index;
      const to = from + word.length;
      if (from < rangeFrom || to > rangeTo) continue;          // keep within range
      if (headPos != null && headPos >= from && headPos <= to) continue; // being typed
      if (isWordValid(word)) continue;
      decos.push(Decoration.inline(from, to, { class: 'ne-spell-error', 'data-spell-word': word }));
    }
  });
  return decos;
}
