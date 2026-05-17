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
    };
  },
});
