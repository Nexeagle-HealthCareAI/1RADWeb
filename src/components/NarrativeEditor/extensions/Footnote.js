import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Footnote — inline atom node that renders as a superscript number.
 *
 * Each footnote stores its text as an attribute (`text`).  A post-render
 * pass in the editor host component renumbers all footnotes in document order
 * and collects them for display at the bottom of the page.
 *
 * Commands:
 *   editor.chain().insertFootnote(text).run()
 */
const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      text: {
        default: '',
        parseHTML: el => el.getAttribute('data-footnote-text') || '',
        renderHTML: attrs => ({ 'data-footnote-text': attrs.text }),
      },
      number: {
        default: 1,
        parseHTML: el => parseInt(el.getAttribute('data-footnote-n') || '1', 10),
        renderHTML: attrs => ({ 'data-footnote-n': attrs.number }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'sup[data-footnote-n]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, {
        class: 'ne-footnote-ref',
        title: node.attrs.text,
        contenteditable: 'false',
      }),
      `[${node.attrs.number}]`,
    ];
  },

  addCommands() {
    return {
      insertFootnote:
        (text) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { text, number: 1 } }),
    };
  },
});

export default Footnote;
