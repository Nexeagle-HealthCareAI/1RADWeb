import { Extension } from '@tiptap/core';

/**
 * MultilevelList — turns the current top-level list (bullet OR ordered) into
 * a multilevel outline. Adds a `data-multilevel="true"` attribute to the
 * outer list, which CSS picks up to apply per-level markers automatically.
 *
 * Commands:
 *   editor.chain().focus().toggleMultilevelList().run()
 *
 * The CSS that consumes `data-multilevel` lives in NarrativeEditor.css.
 */
export const MultilevelList = Extension.create({
  name: 'multilevelList',

  addGlobalAttributes() {
    return [{
      types: ['bulletList', 'orderedList'],
      attributes: {
        multilevel: {
          default: null,
          parseHTML: el => el.getAttribute('data-multilevel') === 'true' ? true : null,
          renderHTML: attrs => attrs.multilevel ? { 'data-multilevel': 'true' } : {},
        },
        // Named template that picks the per-level marker set. The CSS in
        // NarrativeEditor.css keys off data-ml-style to render each depth.
        multilevelStyle: {
          default: null,
          parseHTML: el => el.getAttribute('data-ml-style') || null,
          renderHTML: attrs => attrs.multilevelStyle ? { 'data-ml-style': attrs.multilevelStyle } : {},
        },
      },
    }];
  },

  addCommands() {
    return {
      toggleMultilevelList: () => ({ editor, chain }) => {
        // Ensure we're in an ordered list first (Word's multilevel default).
        if (!editor.isActive('orderedList') && !editor.isActive('bulletList')) {
          chain().toggleOrderedList().run();
        }
        const listType = editor.isActive('orderedList') ? 'orderedList' : 'bulletList';
        const current = editor.getAttributes(listType).multilevel || false;
        return chain().updateAttributes(listType, { multilevel: !current }).run();
      },
      // Apply a named multilevel template (e.g. 'numbers', 'legal', 'bullets',
      // 'mixed'). Turns the current list into a multilevel one and tags it
      // with the chosen style so CSS renders the right per-level markers.
      setMultilevelStyle: (style) => ({ editor, chain }) => {
        if (!editor.isActive('orderedList') && !editor.isActive('bulletList')) {
          chain().toggleOrderedList().run();
        }
        const listType = editor.isActive('orderedList') ? 'orderedList' : 'bulletList';
        return chain().updateAttributes(listType, { multilevel: true, multilevelStyle: style }).run();
      },
    };
  },
});
