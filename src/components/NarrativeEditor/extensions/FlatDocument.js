// FlatDocument + PageBreakNode — schema bits for Path B pagination.
//
// FlatDocument: doc → block+
//   Replaces PageDocument (doc → page+). The editor sees one long stream of
//   blocks; pagination is a decoration layer, not a document mutation.
//   Used ONLY when the useDecorationPagination feature flag is on.
//
// PageBreakNode: an explicit forced-break marker the user inserts via
//   Ctrl+Enter. It's a real block-level node so it round-trips through
//   serialisation (save/load/print), and the PaginationDecoration plugin
//   treats it as a forced boundary in its computation.
//
//   Renders as a thin dashed line in the editor so the user can see where
//   they put a manual break. In print, CSS turns it into a `page-break-after`
//   so the PDF output respects the user's intent.

import { Node } from '@tiptap/core';

export const FlatDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: 'block+',
});

export const PageBreakNode = Node.create({
  name: 'pageBreak',
  group: 'block',
  // No content — it's just a marker. selectable so the user can click and
  // delete it; atom so the cursor can't get stuck inside.
  atom: true,
  selectable: true,

  parseHTML() {
    return [
      { tag: 'div.page-break-marker' },
      { tag: 'hr.page-break' },
    ];
  },

  renderHTML() {
    return [
      'div',
      {
        class: 'page-break-marker',
        // The print CSS hooks page-break-after onto this attribute so the
        // PDF pipeline produces a real page boundary at this position.
        'data-page-break': 'true',
      },
    ];
  },

  addCommands() {
    return {
      insertPageBreakFlat: () => ({ commands }) => {
        // Insert a PageBreak node + a following empty paragraph so the
        // caret has a place to land on the "new page".
        return commands.insertContent([
          { type: 'pageBreak' },
          { type: 'paragraph' },
        ]);
      },
    };
  },

  addKeyboardShortcuts() {
    // Don't claim Ctrl+Enter here — the existing handler in
    // NarrativeEditor/index.jsx already maps Ctrl+Enter to a command name
    // and routes through whichever pagination model is active. Binding it
    // here would either double-fire or conflict.
    return {};
  },
});
