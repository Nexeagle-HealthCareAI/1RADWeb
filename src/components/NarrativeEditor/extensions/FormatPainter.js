import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

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
        const { from, to, $from } = editor.state.selection;

        let markList;
        if (from === to) {
          // No selection — pick up marks stored at the cursor position
          markList = $from.marks().map(m => ({ name: m.type.name, attrs: { ...m.attrs } }));
        } else {
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
          markList = Array.from(seen.values());
        }

        editor.storage.formatPainter.marks  = markList;
        editor.storage.formatPainter.active = true; // activate even if no marks — lets user clear formatting
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
    // eslint-disable-next-line consistent-this
    const ext = this;
    return [
      new Plugin({
        key: new PluginKey('formatPainterAutoApply'),
        props: {
          handleDOMEvents: {
            /**
             * Auto-apply stored format whenever the user finishes a drag-selection
             * inside the editor content area (i.e. mouseup on view.dom).
             * This gives the standard Word behaviour: pick up → select target → done.
             */
            mouseup: (view, event) => {
              if (!ext.editor.storage.formatPainter.active) return false;
              // Only fire when the pointer is released inside the editable area
              if (!view.dom.contains(event.target)) return false;
              // Give the browser a tick to commit the selection
              requestAnimationFrame(() => {
                const { from, to } = ext.editor.state.selection;
                if (from < to) {
                  ext.editor.chain().applyFormat().run();
                }
              });
              return false; // don't absorb the event
            },
          },
        },
      }),
    ];
  },
});
