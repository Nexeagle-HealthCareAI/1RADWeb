import { Node } from '@tiptap/core';

/**
 * StructuredField — an inline atom node representing a clinical data field
 * (patient name, DOB, accession number, study date, etc.).
 *
 * Renders as a non-editable pill that shows either the field value or a
 * bracketed placeholder when no value is set.
 *
 * Supported fieldTypes:
 *   patient-name | dob | accession | study-date | physician |
 *   modality | radiologist | indication | clinical-history | body-part | contrast
 */
export const StructuredField = Node.create({
  name: 'structuredField',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      fieldType: { default: 'patient-name' },
      label:     { default: 'Field' },
      value:     { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-field-type]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const display = node.attrs.value
      ? `${node.attrs.label}: ${node.attrs.value}`
      : `[${node.attrs.label}]`;
    return [
      'span',
      {
        'data-field-type':  node.attrs.fieldType,
        'data-field-label': node.attrs.label,
        'data-field-value': node.attrs.value || '',
        class: 'ne-structured-field',
        contenteditable: 'false',
      },
      display,
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('span');
      dom.className = 'ne-structured-field';
      dom.contentEditable = 'false';
      dom.dataset.fieldType  = node.attrs.fieldType;
      dom.dataset.fieldLabel = node.attrs.label;
      dom.dataset.fieldValue = node.attrs.value || '';

      const update = (n) => {
        const display = n.attrs.value
          ? `${n.attrs.label}: ${n.attrs.value}`
          : `[${n.attrs.label}]`;
        dom.textContent        = display;
        dom.dataset.fieldValue = n.attrs.value || '';
        dom.dataset.fieldType  = n.attrs.fieldType;
        dom.classList.toggle('ne-structured-field--filled', !!n.attrs.value);
      };

      update(node);

      // Click to inline-edit the value
      dom.addEventListener('click', () => {
        if (!editor.isEditable) return;
        const newValue = window.prompt(`Enter value for "${node.attrs.label}":`, node.attrs.value || '');
        if (newValue === null) return; // cancelled
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos == null) return;
        editor.chain().focus().command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, value: newValue });
          return true;
        }).run();
      });

      return { dom, update };
    };
  },

  addCommands() {
    return {
      /**
       * Insert a structured field at the current cursor position.
       * @param {'patient-name'|'dob'|'accession'|'study-date'|'physician'|
       *          'modality'|'radiologist'|'indication'|'clinical-history'|
       *          'body-part'|'contrast'} fieldType
       * @param {string} label  — human-readable label
       * @param {string} value  — current value (may be empty)
       */
      insertStructuredField:
        (fieldType, label, value = '') =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: 'structuredField',
              attrs: { fieldType, label, value },
            })
            .run(),

      /**
       * Update all structured fields of a given type with a new value.
       * Useful when patientData is received from the parent.
       */
      fillStructuredFields:
        (fieldType, value) =>
        ({ state, dispatch }) => {
          const { doc } = state;
          const tr      = state.tr;
          let   changed = false;

          doc.descendants((node, pos) => {
            if (node.type.name === 'structuredField' && node.attrs.fieldType === fieldType) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, value });
              changed = true;
            }
          });

          if (!changed) return false;
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },
});
