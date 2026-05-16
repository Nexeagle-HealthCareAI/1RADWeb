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
