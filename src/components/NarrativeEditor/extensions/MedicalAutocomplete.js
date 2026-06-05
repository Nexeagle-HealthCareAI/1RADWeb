import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { search as searchTerms, warmRadiologyData } from '../../../data/radiologyData';

export const AUTOCOMPLETE_PLUGIN_KEY = new PluginKey('medicalAutocomplete');

const EMPTY = { deco: DecorationSet.empty, suffix: '', at: null, word: '' };

/**
 * The "current word" — text from the last whitespace/punctuation up to the
 * cursor within the current paragraph.
 */
function getCurrentWord(state) {
  const { selection } = state;
  if (!selection.empty) return { word: '' };
  const { $from } = selection;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\x00');
  const match = textBefore.match(/[\w\-'.]+$/);
  return { word: match ? match[0] : '' };
}

/**
 * Find an inline completion: the top ranked term whose label STARTS WITH the
 * typed word (case-insensitive) and is longer — returns the remaining suffix to
 * show as ghost text and insert on Tab.
 */
function getGhostSuffix(word) {
  if (!word || word.length < 2) return '';
  const lower = word.toLowerCase();
  const ranked = searchTerms(word, 8) || [];
  for (const t of ranked) {
    const label = (t?.label || '');
    if (label.length > word.length && label.toLowerCase().startsWith(lower)) {
      return label.slice(word.length);
    }
  }
  return '';
}

function ghostWidget(suffix) {
  return () => {
    const span = document.createElement('span');
    span.className = 'ne-ghost-completion';
    span.setAttribute('contenteditable', 'false');
    span.textContent = suffix;
    return span;
  };
}

/**
 * MedicalAutocomplete — inline "ghost text" completion (Gmail/Copilot style).
 *
 * As the radiologist types, the most likely radiology term is shown greyed-out
 * inline after the cursor. Pressing Tab accepts it (handled in the editor's Tab
 * handler via `acceptAutocomplete`). No dropdown, so it never steals Arrow /
 * Enter / Escape and your shortcuts keep working.
 */
export const MedicalAutocomplete = Extension.create({
  name: 'medicalAutocomplete',

  addProseMirrorPlugins() {
    warmRadiologyData();
    return [
      new Plugin({
        key: AUTOCOMPLETE_PLUGIN_KEY,
        state: {
          init: () => EMPTY,
          apply(tr, value, _old, newState) {
            if (!tr.docChanged && !tr.selectionSet) return value;
            const sel = newState.selection;
            if (!sel.empty) return (value.suffix || value.word) ? EMPTY : value;

            const { word } = getCurrentWord(newState);
            // Word unchanged + only positions moved → remap the existing ghost.
            if (word === value.word && !tr.docChanged) {
              if (value.deco === DecorationSet.empty) return value;
              return { ...value, deco: value.deco.map(tr.mapping, tr.doc), at: sel.from };
            }
            const suffix = getGhostSuffix(word);
            if (!suffix) return { ...EMPTY, word };
            const pos = sel.from;
            const deco = DecorationSet.create(newState.doc, [
              Decoration.widget(pos, ghostWidget(suffix), { side: 1, ignoreSelection: true }),
            ]);
            return { deco, suffix, at: pos, word };
          },
        },
        props: {
          decorations(state) { return AUTOCOMPLETE_PLUGIN_KEY.getState(state)?.deco; },
        },
      }),
    ];
  },

  addCommands() {
    return {
      // Insert the ghost completion at the cursor. Returns false (no-op) when
      // there's no active suggestion, so Tab falls through to indent.
      acceptAutocomplete: () => ({ state, dispatch }) => {
        const s = AUTOCOMPLETE_PLUGIN_KEY.getState(state);
        if (!s || !s.suffix || s.at == null) return false;
        if (dispatch) dispatch(state.tr.insertText(s.suffix, s.at));
        return true;
      },
    };
  },
});
