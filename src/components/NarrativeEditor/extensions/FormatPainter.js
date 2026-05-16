import { Extension } from '@tiptap/core';

/**
 * FormatPainter — Word's brush.
 *
 * Workflow:
 *   1. User selects formatted text and clicks the Painter button.
 *   2. `pickupFormat()` captures the active marks on that selection into storage.
 *   3. User selects target text.
 *   4. `applyFormat()` (or clicking the Painter button again) applies the captured marks.
 *
 * Storage:
 *   - editor.storage.formatPainter.active : boolean
 *   - editor.storage.formatPainter.marks  : Array<{name: string, attrs: object}>
 */
export const FormatPainter = Extension.create({
  name: 'formatPainter',

  addStorage() {
    return { active: false, marks: [] };
  },

  addCommands() {
    return {
      pickupFormat: () => ({ editor }) => {
        const { from, to } = editor.state.selection;
        if (from === to) return false;

        // Collect marks active anywhere in the selection range.
        const seen = new Map();
        editor.state.doc.nodesBetween(from, to, (node) => {
          if (node.isText) {
            node.marks.forEach(mark => {
              if (!seen.has(mark.type.name)) {
                seen.set(mark.type.name, { name: mark.type.name, attrs: { ...mark.attrs } });
              }
            });
          }
        });

        editor.storage.formatPainter.marks = Array.from(seen.values());
        editor.storage.formatPainter.active = true;
        // Force a re-render so the button shows active state
        editor.view.dispatch(editor.state.tr.setMeta('forceUpdate', true));
        return true;
      },

      applyFormat: () => ({ editor, chain }) => {
        const marks = editor.storage.formatPainter.marks;
        if (!marks || marks.length === 0) return false;

        const { from, to } = editor.state.selection;
        if (from === to) {
          // No selection — just toggle off
          editor.storage.formatPainter.active = false;
          editor.view.dispatch(editor.state.tr.setMeta('forceUpdate', true));
          return true;
        }

        let c = chain().focus();
        // Strip existing marks on the target, then re-apply the captured ones
        marks.forEach(m => {
          c = c.setMark(m.name, m.attrs);
        });
        const ok = c.run();

        // Single-shot mode (Word style) — turn off after one application.
        editor.storage.formatPainter.active = false;
        editor.view.dispatch(editor.state.tr.setMeta('forceUpdate', true));
        return ok;
      },

      cancelFormatPainter: () => ({ editor }) => {
        editor.storage.formatPainter.active = false;
        editor.storage.formatPainter.marks = [];
        editor.view.dispatch(editor.state.tr.setMeta('forceUpdate', true));
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [];
  },
});
