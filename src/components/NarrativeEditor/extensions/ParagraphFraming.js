import { Extension } from '@tiptap/core';

/**
 * ParagraphFraming — adds `shading` (background color) and `borders`
 * (which sides + style) attributes to paragraphs and headings.
 *
 * Commands:
 *   editor.chain().focus().setParagraphShading('#ffeb3b').run()
 *   editor.chain().focus().unsetParagraphShading().run()
 *   editor.chain().focus().setParagraphBorders('all').run()       // 'all'|'top'|'bottom'|'left'|'right'|'box'|'none'
 *   editor.chain().focus().unsetParagraphBorders().run()
 */
export const ParagraphFraming = Extension.create({
  name: 'paragraphFraming',

  addOptions() {
    return { types: ['paragraph', 'heading'] };
  },

  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        shading: {
          default: null,
          parseHTML: el => el.getAttribute('data-shading') || null,
          renderHTML: attrs => {
            if (!attrs.shading) return {};
            return {
              'data-shading': attrs.shading,
              style: `background-color: ${attrs.shading}; padding: 4px 6px; border-radius: 2px`,
            };
          },
        },
        borders: {
          default: null,
          parseHTML: el => el.getAttribute('data-borders') || null,
          renderHTML: attrs => {
            if (!attrs.borders || attrs.borders === 'none') return {};
            return {
              'data-borders': attrs.borders,
              style: borderStyleFor(attrs.borders),
            };
          },
        },
      },
    }];
  },

  addCommands() {
    return {
      setParagraphShading: (color) => ({ commands }) =>
        this.options.types.every(t => commands.updateAttributes(t, { shading: color })),
      unsetParagraphShading: () => ({ commands }) =>
        this.options.types.every(t => commands.resetAttributes(t, 'shading')),
      setParagraphBorders: (style) => ({ commands }) =>
        this.options.types.every(t => commands.updateAttributes(t, { borders: style })),
      unsetParagraphBorders: () => ({ commands }) =>
        this.options.types.every(t => commands.resetAttributes(t, 'borders')),
    };
  },
});

function borderStyleFor(kind) {
  const b = '1px solid #6b7280';
  switch (kind) {
    case 'all':
    case 'box':    return `border: ${b}; padding: 4px 6px`;
    case 'top':    return `border-top: ${b}; padding-top: 4px`;
    case 'bottom': return `border-bottom: ${b}; padding-bottom: 4px`;
    case 'left':   return `border-left: ${b}; padding-left: 6px`;
    case 'right':  return `border-right: ${b}; padding-right: 6px`;
    default:       return '';
  }
}
