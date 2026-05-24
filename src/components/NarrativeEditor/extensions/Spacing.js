import { Extension } from '@tiptap/core';

/**
 * LineHeight — applies CSS line-height to paragraphs and headings.
 * Usage: editor.chain().focus().setLineHeight('1.5').run()
 *        editor.chain().focus().unsetLineHeight().run()
 *
 * Clinical-report safety: CSS line-height < 1.0 causes physically overlapping
 * text rows. We clamp the *rendered* line-height to a minimum of 1.0 so a user
 * typing "0.5" into the custom-spacing dialog doesn't produce an unreadable
 * report. The attribute is stored as the user entered it (so the dropdown
 * still shows their choice), but the visual minimum is enforced at render time.
 */
const MIN_LINE_HEIGHT = 1.0;
function clampLineHeightValue(value) {
  if (value == null || value === '') return value;
  const s = String(value).trim();
  // Unitless numbers (e.g. "0.5", "1.5", "2") — treat as CSS multiplier and clamp.
  if (/^-?\d*\.?\d+$/.test(s)) {
    const n = parseFloat(s);
    if (!Number.isFinite(n) || n < MIN_LINE_HEIGHT) return String(MIN_LINE_HEIGHT);
    return s;
  }
  // % values, e.g. "150%"
  const pctMatch = s.match(/^(-?\d*\.?\d+)\s*%$/);
  if (pctMatch) {
    const n = parseFloat(pctMatch[1]);
    if (!Number.isFinite(n) || n < MIN_LINE_HEIGHT * 100) return `${MIN_LINE_HEIGHT * 100}%`;
    return s;
  }
  // px/pt/em/rem values — allow as-is (user explicitly asked for absolute size)
  return s;
}

export const LineHeight = Extension.create({
  name: 'lineHeight',
  addOptions() {
    return { types: ['paragraph', 'heading'] };
  },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: el => el.style.lineHeight || null,
          renderHTML: attrs => {
            if (!attrs.lineHeight) return {};
            const safe = clampLineHeightValue(attrs.lineHeight);
            return { style: `line-height: ${safe}` };
          },
        },
      },
    }];
  },
  addCommands() {
    return {
      setLineHeight: (value) => ({ commands }) =>
        this.options.types.every(t => commands.updateAttributes(t, { lineHeight: value })),
      unsetLineHeight: () => ({ commands }) =>
        this.options.types.every(t => commands.resetAttributes(t, 'lineHeight')),
    };
  },
});

/**
 * ParagraphIndent — left-padding via margin-left, increments of 24px.
 * Works on paragraphs and headings (not just inside lists like sinkListItem).
 */
export const ParagraphIndent = Extension.create({
  name: 'paragraphIndent',
  addOptions() {
    return { types: ['paragraph', 'heading'], step: 24, max: 8 };
  },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        indent: {
          default: 0,
          parseHTML: el => {
            const ml = parseInt(el.style.marginLeft, 10);
            if (!ml) return 0;
            return Math.round(ml / 24);
          },
          renderHTML: attrs => {
            if (!attrs.indent) return {};
            return { style: `margin-left: ${attrs.indent * 24}px` };
          },
        },
      },
    }];
  },
  addCommands() {
    return {
      increaseParagraphIndent: () => ({ state, commands }) => {
        const { $from } = state.selection;
        const nodeType = $from.parent.type.name;
        if (!this.options.types.includes(nodeType)) return false;
        const current = $from.parent.attrs.indent || 0;
        return commands.updateAttributes(nodeType, {
          indent: Math.min(this.options.max, current + 1),
        });
      },
      decreaseParagraphIndent: () => ({ state, commands }) => {
        const { $from } = state.selection;
        const nodeType = $from.parent.type.name;
        if (!this.options.types.includes(nodeType)) return false;
        const current = $from.parent.attrs.indent || 0;
        return commands.updateAttributes(nodeType, {
          indent: Math.max(0, current - 1),
        });
      },
    };
  },
});

/**
 * PageBreak — splits the current Page node at the block containing the cursor,
 * moving all blocks at and after the cursor's block onto a new Page that
 * immediately follows. The Pagination plugin's natural rebalancing handles
 * any sizing.
 */
export const PageBreak = Extension.create({
  name: 'pageBreak',
  addCommands() {
    return {
      insertPageBreak: () => ({ state, tr, dispatch }) => {
        const { $from } = state.selection;
        let pageDepth = -1;
        for (let d = $from.depth; d >= 0; d--) {
          if ($from.node(d).type.name === 'page') { pageDepth = d; break; }
        }
        if (pageDepth === -1) return false;
        const pageType = state.schema.nodes.page;
        if (!pageType) return false;

        const pageNode = $from.node(pageDepth);
        const pageStart = $from.before(pageDepth);
        const blockIndex = $from.index(pageDepth);
        if (blockIndex >= pageNode.childCount) return false;
        if (blockIndex === 0 && pageNode.childCount === 1) return false;

        const blocksAfter = [];
        for (let i = blockIndex; i < pageNode.childCount; i++) {
          blocksAfter.push(pageNode.child(i));
        }
        if (blocksAfter.length === 0) return false;

        let sliceFrom = pageStart + 1;
        for (let i = 0; i < blockIndex; i++) sliceFrom += pageNode.child(i).nodeSize;
        const sliceTo = pageStart + pageNode.nodeSize - 1;
        const removedSize = sliceTo - sliceFrom;
        const newPage = pageType.create(null, blocksAfter);

        if (dispatch) {
          tr.delete(sliceFrom, sliceTo).insert(pageStart + pageNode.nodeSize - removedSize, newPage);
          dispatch(tr);
        }
        return true;
      },
    };
  },
});
