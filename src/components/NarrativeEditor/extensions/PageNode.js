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
        const view = this.editor.view;
        const { state } = view;
        const { $from, empty } = state.selection;

        // Only act on a collapsed (non-range) cursor.
        if (!empty) return false;

        // Cursor must be inside a block that is a direct child of a page node.
        // Typical depth: doc(0) → page(1) → paragraph(2).
        if ($from.depth < 2) return false;
        if ($from.node(1).type.name !== 'page') return false;

        // ── Branch A: empty paragraph anywhere on the page ────────────────
        // Sweep away wholly-empty paragraphs in one keypress. Without this,
        // default joinBackward sometimes leaves an "uneditable gap" because
        // ProseMirror tries to preserve the empty block as a defining child
        // of the page and merges character-by-character instead of removing
        // the node. Result: user sees the gap shrink by 1 unit per press
        // instead of disappearing.
        //
        // Conditions:
        //   - cursor is at the start of its block (parentOffset 0)
        //   - the block has no text content
        //   - it's a paragraph (not heading/list — those need their own UX)
        //   - it's NOT the first block (otherwise Branch B handles page boundary)
        //   - there IS a previous sibling to land the caret in
        const block = $from.parent;
        const isEmptyPara =
          block.type.name === 'paragraph' &&
          block.content.size === 0 &&
          $from.parentOffset === 0;

        if (isEmptyPara && $from.index(1) > 0) {
          try {
            const blockStart = $from.before($from.depth);  // position just before this paragraph
            const blockEnd   = $from.after($from.depth);   // position just after this paragraph
            const tr = state.tr.delete(blockStart, blockEnd);
            // Drop the caret at the end of whatever block now sits before us.
            const $newPos = tr.doc.resolve(Math.max(0, blockStart - 1));
            tr.setSelection(state.selection.constructor.near($newPos, -1));
            tr.scrollIntoView();
            view.dispatch(tr);
            return true;
          } catch (_) {
            return false;
          }
        }

        // ── Branch B: previous sibling is an empty paragraph ─────────────
        // Mirror UX: user has cursor at the start of a content paragraph,
        // immediately above is an empty paragraph. Backspace should swallow
        // the empty paragraph without nuking any text. Same intent as A,
        // from the other side.
        if ($from.parentOffset === 0 && $from.index(1) > 0) {
          const prevIndex = $from.index(1) - 1;
          const pageNode = $from.node(1);
          const prevBlock = pageNode.child(prevIndex);
          if (prevBlock.type.name === 'paragraph' && prevBlock.content.size === 0) {
            try {
              const blockStart = $from.before($from.depth) - prevBlock.nodeSize;
              const blockEnd   = $from.before($from.depth);
              const tr = state.tr.delete(blockStart, blockEnd);
              tr.scrollIntoView();
              view.dispatch(tr);
              return true;
            } catch (_) { /* fall through */ }
          }
        }

        // ── Branch C: page boundary join (original behaviour) ────────────
        if ($from.parentOffset !== 0) return false;
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
          view.dispatch(tr);
          return true;
        } catch (_) {
          try {
            const tr = state.tr.join(pagePos, 1);
            tr.scrollIntoView();
            view.dispatch(tr);
            return true;
          } catch (_2) {
            return false;
          }
        }
      },

      /**
       * Forward Delete at the very END of a non-last page.
       *
       * Mirror image of the Backspace handler: because Page is `isolating`,
       * the default forward-delete (joinForward) can't pull the next page's
       * first block up into this one, so the key silently no-ops at a page
       * boundary. We detect "cursor at end of the last block of this page"
       * and join the next page's first block onto it; Pagination re-splits
       * if the merged page overflows.
       */
      Delete: () => {
        const view = this.editor.view;
        const { state } = view;
        const { $from, empty } = state.selection;

        if (!empty) return false;
        if ($from.depth < 2) return false;
        if ($from.node(1).type.name !== 'page') return false;

        const pageNode = $from.node(1);
        const idx = $from.index(1);
        const atBlockEnd = $from.parentOffset === $from.parent.content.size;

        // Must be at the end of the LAST block of this page. Anything else is
        // an in-page delete that ProseMirror already handles correctly (the
        // page is only isolating at its outer boundary).
        if (!atBlockEnd) return false;
        if (idx !== pageNode.childCount - 1) return false;

        // Position just after this page's closing token = start of next page.
        const afterPage = $from.after(1);
        // No next page → nothing to join (let default behaviour run).
        if (afterPage >= state.doc.content.size) return false;

        // Join the last block of this page with the first block of the next
        // page (depth 2); fall back to a page-level join (depth 1) if the
        // block types can't merge (e.g. heading + paragraph).
        try {
          const tr = state.tr.join(afterPage, 2);
          tr.scrollIntoView();
          view.dispatch(tr);
          return true;
        } catch (_) {
          try {
            const tr = state.tr.join(afterPage, 1);
            tr.scrollIntoView();
            view.dispatch(tr);
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
