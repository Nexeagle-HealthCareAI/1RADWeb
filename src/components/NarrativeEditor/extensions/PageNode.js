import { Node } from '@tiptap/core';

/**
 * Custom Document node — schema: doc -> page+
 * Overrides the default StarterKit document so the editor MUST contain
 * one or more <page> nodes at the top level.
 */
export const PageDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: 'page+',
});

/**
 * Page node — schema: page -> block+
 * Each page renders as <div class="word-page" data-page="N"> and represents
 * one A4 sheet. The Pagination plugin splits/merges these as content grows.
 *
 * NOTE: Page is intentionally NOT in the `block` group. This prevents pasted
 * HTML that contains <div class="word-page"> markup (e.g. content copied
 * from the editor itself) from creating nested page-in-page visuals — the
 * schema rejects pages inside pages, so the parser keeps only the inner
 * content and discards the outer wrapper.
 */
export const Page = Node.create({
  name: 'page',
  content: 'block+',
  defining: true,
  isolating: true,
  selectable: false,

  addKeyboardShortcuts() {
    return {
      /**
       * Backspace at the very start of a non-first page.
       *
       * Because the Page node has `isolating: true`, ProseMirror's built-in
       * joinBackward command cannot cross the page boundary, so the key does
       * nothing. We intercept that specific case and join the last block of
       * the previous page with the first block of this page — then let the
       * Pagination plugin re-split if the merged page overflows.
       */
      Backspace: () => {
        const { state } = this.editor.view;
        const { $from, empty } = state.selection;

        // Only act on a collapsed (non-range) cursor.
        if (!empty) return false;

        // Cursor must be inside a block that is a direct child of a page node.
        // Typical depth: doc(0) → page(1) → paragraph(2).
        if ($from.depth < 2) return false;
        if ($from.node(1).type.name !== 'page') return false;

        // Cursor must be at the very start of its block.
        if ($from.parentOffset !== 0) return false;

        // That block must be the first child of the page.
        if ($from.index(1) !== 0) return false;

        // The position just before this page's opening token.
        const pagePos = $from.before(1);

        // If this is the first page in the document, let default behaviour run.
        if (pagePos === 0) return false;

        // Attempt to join at depth 2: merges the last block of the previous
        // page with the first block of this page (paragraph text is combined).
        // Fall back to depth-1 join (pages merge, blocks stay separate) if the
        // block types are incompatible (e.g. heading + paragraph).
        try {
          const tr = state.tr.join(pagePos, 2);
          tr.scrollIntoView();
          this.editor.view.dispatch(tr);
          return true;
        } catch (_) {
          try {
            const tr = state.tr.join(pagePos, 1);
            tr.scrollIntoView();
            this.editor.view.dispatch(tr);
            return true;
          } catch (_2) {
            return false;
          }
        }
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'div.word-page' },
      { tag: 'div[data-page]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      {
        ...HTMLAttributes,
        class: 'word-page',
      },
      [
        'div',
        { class: 'word-page-inner' },
        0,
      ],
    ];
  },
});
