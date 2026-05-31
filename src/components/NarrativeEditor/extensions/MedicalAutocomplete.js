import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { search as searchTerms, warmRadiologyData } from '../../../data/radiologyData';

const AUTOCOMPLETE_PLUGIN_KEY = new PluginKey('medicalAutocomplete');

/**
 * Returns the "current word" — the text from the last whitespace/punctuation
 * up to the cursor position within the current paragraph.
 */
function getCurrentWord(state) {
  const { selection } = state;
  if (!selection.empty) return { word: '', from: selection.from };

  const { $from } = selection;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\x00');
  // Match the last run of word characters (letters, digits, hyphens, apostrophes)
  const match = textBefore.match(/[\w\-'.]+$/);
  if (!match) return { word: '', from: $from.pos };

  return {
    word: match[0],
    from: $from.pos - match[0].length,
  };
}

/**
 * MedicalAutocomplete — dispatches window events for the React layer to render
 * a dropdown of matching radiology terms as the user types.
 *
 * Events dispatched:
 *   narrative-editor:autocomplete  → { active, query, suggestions, from, rect }
 *
 * Events listened:
 *   narrative-editor:autocomplete-select → { term, from }  — inserts chosen term
 */
export const MedicalAutocomplete = Extension.create({
  name: 'medicalAutocomplete',

  addProseMirrorPlugins() {
    let lastQuery = '';

    // Fire-and-forget warmup so the 1,621-term corpus is fetched + Fuse
    // index built BEFORE the user's first 2-char query. By the time they
    // type "ao" the result is ready; if they're faster than the network
    // the data module falls back to a startsWith filter until Fuse arrives.
    warmRadiologyData();

    return [
      new Plugin({
        key: AUTOCOMPLETE_PLUGIN_KEY,

        view() {
          return {
            update(view, prevState) {
              const { state } = view;
              if (state.selection.eq(prevState.selection) && state.doc.eq(prevState.doc)) return;

              const { word, from } = getCurrentWord(state);

              if (word.length < 2) {
                if (lastQuery) {
                  lastQuery = '';
                  window.dispatchEvent(new CustomEvent('narrative-editor:autocomplete', {
                    detail: { active: false, query: '', suggestions: [], from, rect: null },
                  }));
                }
                return;
              }

              const lower = word.toLowerCase();
              if (lower === lastQuery) return;
              lastQuery = lower;

              // Suggestions are now {id, label, cat, short, key, alt} objects
              // ranked by Fuse.js fuzzy match. The consumer dropdown renders
              // `label  ·  cat  ·  short` so the user sees what each row is
              // before selecting. Filter out the exact match — typing "aortic"
              // shouldn't suggest "aortic" back.
              const ranked = searchTerms(word, 8);
              const suggestions = ranked.filter(
                t => (t?.label || '').toLowerCase() !== lower
              );

              let rect = null;
              try {
                const coords = view.coordsAtPos(state.selection.from);
                rect = { top: coords.top, bottom: coords.bottom, left: coords.left };
              } catch (_) {}

              window.dispatchEvent(new CustomEvent('narrative-editor:autocomplete', {
                detail: { active: suggestions.length > 0, query: word, suggestions, from, rect },
              }));
            },

            destroy() {
              window.dispatchEvent(new CustomEvent('narrative-editor:autocomplete', {
                detail: { active: false, query: '', suggestions: [], from: 0, rect: null },
              }));
            },
          };
        },
      }),
    ];
  },

  addCommands() {
    return {
      /**
       * Replace the current word (from..cursor) with the chosen term.
       */
      insertAutocomplete:
        ({ term, from }) =>
        ({ state, chain }) => {
          const to = state.selection.from;
          if (from >= to) return false;
          // Accept either a raw string (legacy fallback path) or the new
          // {label, ...} object shape from radiologyData.search().
          const label = typeof term === 'string' ? term : (term?.label || '');
          if (!label) return false;
          return chain()
            .focus()
            .deleteRange({ from, to })
            .insertContent(label)
            .run();
        },
    };
  },
});
