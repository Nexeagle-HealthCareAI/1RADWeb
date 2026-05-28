import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { lookupAutoCorrect } from '../data/autoCorrectMap';

/**
 * AutoCorrect — smart typography + medical-typo replacements fired on
 * Space or Enter.
 *
 * Checks the text immediately before the cursor against a table of patterns.
 * When a match is found the matched text is replaced.
 *
 * Typography rules:
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
 *
 * Medical / English typo rules (see data/autoCorrectMap.js):
 *   pnuemonia  → pneumonia
 *   atelactasis → atelectasis
 *   haemorrage → hemorrhage
 *   teh         → the
 *   ...and ~100 more
 *
 * Case is preserved on typo replacement (Pnuemonia → Pneumonia).
 * Each correction is a single undoable step so Ctrl+Z reverts cleanly.
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

            // Text in the current block before the cursor. The '\x00' leaf
            // separator makes inline atoms (images, hard breaks) occupy one
            // char each so the string length stays aligned with document
            // positions — otherwise `$from.pos - matchLength` could land
            // mid-atom when a paragraph mixes text and inline nodes. \x00 is
            // not a word/typography char, so it also correctly terminates a
            // match at an atom boundary.
            const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\x00');
            if (!textBefore) return false;

            // URL auto-linkify — wrap a typed URL in a link mark before the trigger key inserts
            const urlMatch = textBefore.match(/(https?:\/\/[^\s<>'"()]+)$/);
            if (urlMatch) {
              const url = urlMatch[1];
              const linkMarkType = state.schema.marks['link'];
              if (linkMarkType) {
                const from = $from.pos - url.length;
                const to   = $from.pos;
                // Only linkify if there's no link mark already
                if (!state.doc.rangeHasMark(from, to, linkMarkType)) {
                  view.dispatch(
                    state.tr.addMark(from, to, linkMarkType.create({ href: url, target: '_blank' }))
                  );
                }
              }
              return false; // let trigger key insert normally
            }

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

            // ── Medical / English typo correction ────────────────────────
            // Pull the LAST word in textBefore (alphabetic + apostrophe /
            // hyphen). If that word is in AUTOCORRECT_MAP, swap it in-place
            // with case preservation. Skip ALL-CAPS short words (acronyms
            // like CT, MR, FLAIR, LV — we never want to "correct" those).
            const wordMatch = /([A-Za-z][A-Za-z'-]*)$/.exec(textBefore);
            if (wordMatch) {
              const word = wordMatch[1];
              const isAllCapsShort = word.length <= 6 && word === word.toUpperCase();
              if (!isAllCapsShort && word.length >= 2) {
                const corrected = lookupAutoCorrect(word);
                if (corrected && corrected !== word) {
                  const from = $from.pos - word.length;
                  const to   = $from.pos;
                  view.dispatch(
                    state.tr
                      .replaceWith(from, to, state.schema.text(corrected))
                      .setMeta('addToHistory', true)
                  );
                  // fall through to return false so the trigger key inserts
                  return false;
                }
              }
            }

            return false;
          },
        },
      }),
    ];
  },
});
