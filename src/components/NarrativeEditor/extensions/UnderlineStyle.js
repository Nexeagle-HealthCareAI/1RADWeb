// UnderlineStyle — extends Tiptap's Underline mark with a `style` attribute so
// users can pick MS-Word style underlines (single / double / thick / dotted /
// dashed / wavy / dot-dash / dot-dot-dash) instead of being stuck with the
// single solid one the base mark gives.
//
// Rendered as inline CSS on the `<u>` element via text-decoration-style and
// text-decoration-thickness, which gives us most of Word's variants. Dot-dash
// and dot-dot-dash CSS doesn't natively exist, so for those we render an
// SVG-backed background-image strip on the bottom of the run.
import { Underline } from '@tiptap/extension-underline';

const STYLE_MAP = {
  single:        { line: 'solid',  thickness: '1px' },
  double:        { line: 'double', thickness: '3px' },
  thick:         { line: 'solid',  thickness: '3px' },
  dotted:        { line: 'dotted', thickness: '1.5px' },
  'thick-dotted':{ line: 'dotted', thickness: '3px' },
  dashed:        { line: 'dashed', thickness: '1.5px' },
  'thick-dashed':{ line: 'dashed', thickness: '3px' },
  wavy:          { line: 'wavy',   thickness: '1px' },
  'thick-wavy':  { line: 'wavy',   thickness: '2.5px' },
};

// Dot-dash & dot-dot-dash aren't valid text-decoration-style values — we paint
// them as a repeating background-image on the bottom 2px of the run, with a
// transparent padding so text isn't clipped.
const SVG_PATTERNS = {
  'dot-dash':     "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='3'><rect x='0' y='1' width='2' height='1.5' fill='currentColor'/><rect x='4' y='1' width='7' height='1.5' fill='currentColor'/></svg>\")",
  'dot-dot-dash': "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='18' height='3'><rect x='0' y='1' width='2' height='1.5' fill='currentColor'/><rect x='4' y='1' width='2' height='1.5' fill='currentColor'/><rect x='8' y='1' width='7' height='1.5' fill='currentColor'/></svg>\")",
};

function styleToCss(style) {
  if (!style || style === 'single') return null; // default native render
  if (SVG_PATTERNS[style]) {
    return [
      'text-decoration:none',
      'background-repeat:repeat-x',
      'background-position:0 100%',
      `background-image:${SVG_PATTERNS[style]}`,
      'padding-bottom:1px',
    ].join(';');
  }
  const cfg = STYLE_MAP[style];
  if (!cfg) return null;
  return [
    'text-decoration-line:underline',
    `text-decoration-style:${cfg.line}`,
    `text-decoration-thickness:${cfg.thickness}`,
    // Skip-ink off so dotted/dashed lines render continuously through
    // descenders (matches Word).
    'text-decoration-skip-ink:none',
  ].join(';');
}

export const UnderlineStyle = Underline.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      underlineStyle: {
        default: null,
        parseHTML: el => el.getAttribute('data-underline-style') || null,
        renderHTML: attrs => {
          const css = styleToCss(attrs.underlineStyle);
          if (!css) return {};
          return {
            'data-underline-style': attrs.underlineStyle,
            style: css,
          };
        },
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setUnderlineStyle: (style) => ({ chain, editor }) => {
        // Null/false → remove the underline mark entirely.
        if (!style) {
          return chain().unsetMark(this.name).run();
        }
        // Apply the mark with the chosen style. If already underlined we
        // just update the attribute on the existing run.
        if (editor.isActive(this.name)) {
          return chain().updateAttributes(this.name, { underlineStyle: style }).run();
        }
        return chain().setMark(this.name, { underlineStyle: style }).run();
      },
    };
  },
});

export default UnderlineStyle;
