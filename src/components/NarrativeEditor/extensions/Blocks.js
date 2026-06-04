import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Callout — a bordered "text box" you can type into (Word's Text Box / a
 * shaded note). A block node that contains block content, rendered as
 * <div data-callout class="ne-callout">. Round-trips in the editor's own HTML;
 * exported to .docx as a single-cell shaded table (see exportDocx blockToWml).
 */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': 'true', class: 'ne-callout' }), 0];
  },

  addCommands() {
    return {
      insertCallout: () => ({ chain }) =>
        chain()
          .insertContent({ type: this.name, content: [{ type: 'paragraph' }] })
          .run(),
      toggleCallout: () => ({ commands }) => commands.toggleWrap(this.name),
    };
  },
});

/**
 * Columns — wrap a region of blocks into a CSS multi-column section (Word's
 * Columns). Rendered as <div data-columns="N" class="ne-columns">. Honest
 * caveat: CSS columns flow within a page but don't paginate exactly like Word
 * across page breaks; on export the content is flattened to single-column.
 */
export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      count: {
        default: 2,
        parseHTML: (el) => parseInt(el.getAttribute('data-columns'), 10) || 2,
        renderHTML: (attrs) => ({ 'data-columns': attrs.count }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-columns]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const n = node.attrs.count || 2;
    return ['div', mergeAttributes(HTMLAttributes, { class: 'ne-columns', style: `column-count:${n};column-gap:28px` }), 0];
  },

  addCommands() {
    return {
      setColumns: (count) => ({ commands }) => {
        if (!count || count <= 1) return commands.lift(this.name);
        // Already inside a columns block → just change the count; else wrap.
        return commands.updateAttributes(this.name, { count }) || commands.wrapIn(this.name, { count });
      },
    };
  },
});
