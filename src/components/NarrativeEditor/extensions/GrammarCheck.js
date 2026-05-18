import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const grammarCheckKey = new PluginKey('grammarCheck');

/**
 * GrammarCheck — ProseMirror plugin that stores inline underline decorations
 * for grammar/spelling issues returned by the LanguageTool API.
 *
 * Decorations are set externally via `editor.commands.setGrammarDecorations(set)`
 * and cleared with `editor.commands.clearGrammarDecorations()`.
 *
 * When the document changes the decoration set is automatically remapped so
 * underlines stay on the correct text even after small edits.
 */
export const GrammarCheck = Extension.create({
  name: 'grammarCheck',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: grammarCheckKey,

        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldSet) {
            const meta = tr.getMeta(grammarCheckKey);
            if (meta !== undefined) return meta; // explicit update from commands
            if (tr.docChanged) return oldSet.map(tr.mapping, tr.doc); // keep positions valid
            return oldSet;
          },
        },

        props: {
          decorations(state) {
            return grammarCheckKey.getState(state);
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      /**
       * Replace the entire grammar decoration set with a new one.
       * Pass a DecorationSet built from LanguageTool match data.
       */
      setGrammarDecorations:
        (decorationSet) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(grammarCheckKey, decorationSet);
            dispatch(tr);
          }
          return true;
        },

      /** Remove all grammar decorations. */
      clearGrammarDecorations:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(grammarCheckKey, DecorationSet.empty);
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

// ── Helpers exported for use in index.jsx ─────────────────────────────────

/**
 * Build a plain-text-character-offset → ProseMirror-doc-position map by
 * walking all text nodes in the document.
 *
 * offsetMap[i] = doc position where the i-th character of plain text lives.
 */
export function buildOffsetMap(doc) {
  const map = [];
  doc.descendants((node, pos) => {
    if (node.isText) {
      for (let i = 0; i < node.text.length; i++) {
        map.push(pos + i);
      }
    }
  });
  return map;
}

/**
 * Convert an array of LanguageTool match objects + an offset map into a
 * ProseMirror DecorationSet.
 *
 * Returns `{ decoSet, validMatches }` — validMatches enrich each LT match with
 * `{ from, to }` doc positions so the caller can build a UI fix action.
 */
export function buildGrammarDecorations(doc, ltMatches, offsetMap) {
  const decos = [];
  const validMatches = [];

  for (const match of ltMatches) {
    const from = offsetMap[match.offset];
    const toRaw = offsetMap[match.offset + match.length - 1];
    if (from == null || toRaw == null) continue;
    const to = toRaw + 1;

    const issueType = match.rule?.issueType ?? 'grammar';
    const cssClass = `ne-grammar-error ne-grammar-error--${issueType === 'typographical' || issueType === 'misspelling' ? 'spelling' : 'grammar'}`;

    decos.push(
      Decoration.inline(from, to, {
        class: cssClass,
        title: match.message,
        'data-lt-id': match.rule?.id ?? '',
      }),
    );

    validMatches.push({
      ...match,
      from,
      to,
      issueType: cssClass.includes('spelling') ? 'spelling' : 'grammar',
    });
  }

  return {
    decoSet: DecorationSet.create(doc, decos),
    validMatches,
  };
}
