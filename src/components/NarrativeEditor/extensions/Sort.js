import { Extension } from '@tiptap/core';

/**
 * Sort — alphabetically sort selected list items (or paragraphs).
 *
 * Behaviour:
 *   - If the cursor is inside a bulletList / orderedList, sort that list's
 *     items (not nested children — only top-level items of the immediate list).
 *   - Else, sort the paragraphs that the current selection spans (their
 *     plain text content).
 *
 * Commands:
 *   editor.chain().focus().sortSelected('asc').run()  // A → Z
 *   editor.chain().focus().sortSelected('desc').run() // Z → A
 */
export const Sort = Extension.create({
  name: 'sort',

  addCommands() {
    return {
      sortSelected: (direction = 'asc') => ({ state, dispatch, tr }) => {
        const cmp = (a, b) => {
          const ta = a.textContent.trim().toLowerCase();
          const tb = b.textContent.trim().toLowerCase();
          if (ta < tb) return direction === 'asc' ? -1 : 1;
          if (ta > tb) return direction === 'asc' ? 1 : -1;
          return 0;
        };

        const { $from, $to } = state.selection;
        const doc = state.doc;

        // 1. If we're inside a list, sort that list's direct children
        let listDepth = -1;
        for (let d = $from.depth; d >= 0; d--) {
          const n = $from.node(d);
          if (n && (n.type.name === 'bulletList' || n.type.name === 'orderedList')) {
            listDepth = d;
            break;
          }
        }

        if (listDepth >= 0) {
          const listNode = $from.node(listDepth);
          const listPos = $from.before(listDepth);
          const items = [];
          listNode.forEach(child => items.push(child));
          if (items.length < 2) return false;

          const sorted = [...items].sort((a, b) => cmp({ textContent: a.textBetween(0, a.content.size, '\n') }, { textContent: b.textBetween(0, b.content.size, '\n') }));
          const newList = listNode.type.create(listNode.attrs, sorted);
          if (dispatch) {
            tr.replaceWith(listPos, listPos + listNode.nodeSize, newList);
            dispatch(tr);
          }
          return true;
        }

        // 2. Otherwise sort top-level paragraphs intersecting the selection
        // Find the page node that contains the selection
        let pageDepth = -1;
        for (let d = $from.depth; d >= 0; d--) {
          if ($from.node(d).type.name === 'page') { pageDepth = d; break; }
        }
        if (pageDepth === -1) return false;

        const pageNode = $from.node(pageDepth);
        const pageStart = $from.before(pageDepth);
        const startIdx = $from.index(pageDepth);
        const endIdx   = $to.index(pageDepth);
        if (endIdx - startIdx < 1) return false;

        const blocksToSort = [];
        for (let i = startIdx; i <= endIdx; i++) {
          const b = pageNode.child(i);
          if (b.type.name === 'paragraph' || b.type.name === 'heading') blocksToSort.push(b);
        }
        if (blocksToSort.length < 2) return false;

        const sortedBlocks = [...blocksToSort].sort((a, b) =>
          cmp({ textContent: a.textBetween(0, a.content.size, '\n') }, { textContent: b.textBetween(0, b.content.size, '\n') })
        );

        // Compute start/end of the selected blocks within the page
        let regionStart = pageStart + 1;
        for (let i = 0; i < startIdx; i++) regionStart += pageNode.child(i).nodeSize;
        let regionEnd = regionStart;
        for (let i = startIdx; i <= endIdx; i++) regionEnd += pageNode.child(i).nodeSize;

        if (dispatch) {
          tr.replaceWith(regionStart, regionEnd, sortedBlocks);
          dispatch(tr);
        }
        return true;
      },
    };
  },
});
