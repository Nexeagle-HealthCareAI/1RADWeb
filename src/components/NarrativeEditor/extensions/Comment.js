import { Mark, Extension } from '@tiptap/core';

/**
 * CommentMark — inline mark that highlights commented text.
 * Renders as a yellow-highlighted span with a dotted amber underline.
 *
 * The `commentId` attr links the mark to a comment object managed in React state.
 */
export const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,
  spanning: true,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: el => el.getAttribute('data-comment-id'),
        renderHTML: attrs => ({ 'data-comment-id': attrs.commentId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'mark[data-comment-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'mark',
      {
        ...HTMLAttributes,
        class: 'ne-comment-mark',
      },
      0,
    ];
  },
});

/**
 * Comment extension — exposes addComment / removeComment commands.
 */
export const Comment = Extension.create({
  name: 'commentExtension',

  addCommands() {
    return {
      /**
       * Apply a comment mark to the current selection.
       * @param {string} commentId — UUID for the comment
       */
      addComment:
        (commentId) =>
        ({ chain, state }) => {
          if (state.selection.empty) return false;
          return chain()
            .setMark('comment', { commentId })
            .run();
        },

      /**
       * Remove a comment mark (all ranges with this commentId).
       */
      removeComment:
        (commentId) =>
        ({ state, dispatch }) => {
          const { doc, schema } = state;
          const markType = schema.marks.comment;
          if (!markType) return false;

          const ranges = [];
          doc.descendants((node, pos) => {
            if (!node.isInline) return;
            const m = node.marks.find(
              mk => mk.type === markType && mk.attrs.commentId === commentId,
            );
            if (m) ranges.push({ from: pos, to: pos + node.nodeSize });
          });

          if (!ranges.length) return false;

          const tr = state.tr;
          // Merge contiguous ranges before removing
          ranges.forEach(({ from, to }) => {
            const mFrom = tr.mapping.map(from);
            const mTo   = tr.mapping.map(to);
            if (mFrom < mTo) tr.removeMark(mFrom, mTo, markType);
          });

          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },
});
