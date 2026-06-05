// ════════════════════════════════════════════════════════════════════════════
//  SearchHighlight — highlights ALL Find & Replace matches (Word-style).
//
//  The existing FindReplaceDialog already owns match computation (case / whole-
//  word / regex) and step-through/replace. It only *selected* the current match.
//  This thin ProseMirror plugin adds the missing piece: it highlights every
//  match (current one emphasised) via decorations. The dialog pushes its match
//  list in through `setSearchHighlights`; this plugin just decorates them.
// ════════════════════════════════════════════════════════════════════════════

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const SEARCH_PLUGIN_KEY = new PluginKey('searchHighlight');

function buildDeco(doc, matches, current, opts) {
  if (!matches || !matches.length) return DecorationSet.empty;
  const decos = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (m == null || m.from == null || m.to == null || m.to <= m.from) continue;
    // Guard against stale positions after edits.
    if (m.to > doc.content.size) continue;
    decos.push(Decoration.inline(m.from, m.to, { class: i === current ? opts.currentClass : opts.matchClass }));
  }
  return decos.length ? DecorationSet.create(doc, decos) : DecorationSet.empty;
}

export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addOptions() {
    return { matchClass: 'ne-search-match', currentClass: 'ne-search-current' };
  },

  addProseMirrorPlugins() {
    const opts = this.options;
    return [
      new Plugin({
        key: SEARCH_PLUGIN_KEY,
        state: {
          init: () => ({ matches: [], current: 0, deco: DecorationSet.empty }),
          apply(tr, value, _old, newState) {
            const meta = tr.getMeta(SEARCH_PLUGIN_KEY);
            if (meta) {
              const matches = meta.matches || [];
              const current = meta.current || 0;
              return { matches, current, deco: buildDeco(newState.doc, matches, current, opts) };
            }
            if (tr.docChanged && value.deco !== DecorationSet.empty) {
              // Map highlights through the edit until the dialog pushes fresh
              // matches (which it does on every query/doc change).
              return { ...value, deco: value.deco.map(tr.mapping, tr.doc) };
            }
            return value;
          },
        },
        props: {
          decorations(state) { return SEARCH_PLUGIN_KEY.getState(state)?.deco; },
        },
      }),
    ];
  },

  addCommands() {
    return {
      // Highlight the given matches ([{from,to}]); `current` is the active index.
      setSearchHighlights: (matches, current = 0) => ({ state, dispatch }) => {
        if (dispatch) dispatch(state.tr.setMeta(SEARCH_PLUGIN_KEY, { matches: matches || [], current }));
        return true;
      },
      clearSearchHighlights: () => ({ state, dispatch }) => {
        if (dispatch) dispatch(state.tr.setMeta(SEARCH_PLUGIN_KEY, { matches: [], current: 0 }));
        return true;
      },
    };
  },
});
