import { Node } from '@tiptap/core';

/**
 * PageNumber — inline atom node representing a page-number token.
 *
 * Renders as a styled badge "[Page #]" in the editor.
 * At print/export time, the host app should post-process the HTML:
 *   replace each <span data-type="page-number"> with the actual page number.
 */
export const PageNumber = Node.create({
  name: 'pageNumber',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [
      { tag: 'span[data-type="page-number"]' },
    ];
  },

  renderHTML() {
    return [
      'span',
      {
        'data-type': 'page-number',
        class: 'page-number-token',
        contenteditable: 'false',
      },
      'Page #',
    ];
  },

  addCommands() {
    return {
      insertPageNumber: () => ({ commands }) =>
        commands.insertContent({ type: this.name }),
    };
  },
});
