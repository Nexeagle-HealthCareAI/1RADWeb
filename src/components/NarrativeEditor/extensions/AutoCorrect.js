import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * AutoCorrect — smart typography replacements fired on Space or Enter.
 *
 * Checks the text immediately before the cursor against a table of patterns.
 * When a match is found the matched text is replaced with the Unicode equivalent,
 * then the trigger key (space / enter) is inserted by the normal Tiptap flow.
 *
 * Rules:
 *   --      → —   (em dash)
 *   ...     → …   (ellipsis)
 *   (c)     → ©
 *   (r)     → ®
 *   (tm)    → ™
 *   1/2     → ½
 *   1/4     → ¼
 *   3/4     → ¾
 *   ->      → →
 *   <-      → ←
 *   <->     → ↔
 *   !=      → ≠
 *   <=      → ≤
 *   >=      → ≥
 */

const RULES = [
  { pattern: /--$/,        replacement: '\u2014' },  // em dash
  { pattern: /\.\.\.$/,    replacement: '\u2026' },  // ellipsis
  { pattern: /\(c\)$/i,    replacement: '\u00a9' },  // ©
  { pattern: /\(r\)$/i,    replacement: '\u00ae' },  // ®
  { pattern: /\(tm\)$/i,   replacement: '\u2122' },  // ™
  { pattern: /1\/2$/,      replacement: '\u00bd' },  // ½
  { pattern: /1\/4$/,      replacement: '\u00bc' },  // ¼
  { pattern: /3\/4$/,      replacement: '\u00be' },  // ¾
  { pattern: /<->$/,       replacement: '\u2194' },  // ↔ (must come before <- and ->)
  { pattern: /->$/,        replacement: '\u2192' },  // →
  { pattern: /<-$/,        replacement: '\u2190' },  // ←
  { pattern: /!=$/,        replacement: '\u2260' },  // ≠
  { pattern: /<=$/,        replacement: '\u2264' },  // ≤
  { pattern: />=$/,        replacement: '\u2265' },  // ≥
];

const TRIGGER_KEYS = new Set([' ', 'Enter']);

export const AutoCorrect = Extension.create({
  name: 'autoCorrect',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('autoCorrect'),

        props: {
          handleKeyDown(view, event) {
            if (!TRIGGER_KEYS.has(event.key)) return false;

            const { state } = view;
            const { $from, empty } = state.selection;
            if (!empty) return false;

            // Text in the current block before the cursor
            const textBefore = $from.parent.textBetween(0, $from.parentOffset);
            if (!textBefore) return false;

            for (const { pattern, replacement } of RULES) {
              const m = textBefore.match(pattern);
              if (m) {
                const from = $from.pos - m[0].length;
                const to   = $from.pos;
                // Replace the matched text; return false so Tiptap inserts
                // the trigger character (space/newline) normally afterwards.
                view.dispatch(
                  state.tr.replaceWith(from, to, state.schema.text(replacement))
                );
                return false;
              }
            }

            return false;
          },
        },
      }),
    ];
  },
});
