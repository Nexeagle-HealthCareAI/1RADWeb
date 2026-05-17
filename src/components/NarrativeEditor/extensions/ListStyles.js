import { Extension } from '@tiptap/core';

/**
 * ListStyles — adds an optional `listStyleType` attribute to bulletList and
 * orderedList nodes so users can pick the marker style (disc, circle, square,
 * arrow / decimal, lower-alpha, upper-alpha, lower-roman, upper-roman).
 *
 * Commands:
 *   editor.chain().focus().setBulletStyle('circle').run()   // applies to current bulletList
 *   editor.chain().focus().setOrderedStyle('lower-alpha').run()
 *   editor.chain().focus().setMultilevelList().run()        // toggles a "multilevel" class for outline numbering
 */
export const ListStyles = Extension.create({
  name: 'listStyles',

  addGlobalAttributes() {
    return [
      {
        types: ['bulletList'],
        attributes: {
          listStyleType: {
            default: null,
            parseHTML: el => el.style.listStyleType || el.getAttribute('data-list-style') || null,
            renderHTML: attrs => attrs.listStyleType ? {
              'data-list-style': attrs.listStyleType,
              style: `list-style-type: ${attrs.listStyleType}`,
            } : {},
          },
        },
      },
      {
        types: ['orderedList'],
        attributes: {
          listStyleType: {
            default: null,
            parseHTML: el => el.style.listStyleType || el.getAttribute('data-list-style') || null,
            renderHTML: attrs => attrs.listStyleType ? {
              'data-list-style': attrs.listStyleType,
              style: `list-style-type: ${attrs.listStyleType}`,
            } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setBulletStyle: (style) => ({ editor, chain }) => {
        // If we aren't in a bullet list yet, toggle one first.
        if (!editor.isActive('bulletList')) chain().toggleBulletList().run();
        return chain().updateAttributes('bulletList', { listStyleType: style }).run();
      },
      setOrderedStyle: (style) => ({ editor, chain }) => {
        if (!editor.isActive('orderedList')) chain().toggleOrderedList().run();
        return chain().updateAttributes('orderedList', { listStyleType: style }).run();
      },
    };
  },
});
