import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Pagination — auto page-break extension.
 *
 * On every transaction (debounced via rAF), walks all <page> nodes and
 * splits/merges them so each page's content fits within A4 height.
 *
 * A4 at 96dpi = 1123px. Margins = 96px top + 96px bottom = 192px.
 * Content area = 1123 - 192 = 931px (PAGE_CONTENT_HEIGHT).
 */

const A4_HEIGHT = 1123;            // A4 at 96 dpi
const FALLBACK_CONTENT_HEIGHT = 931; // = 1123 - 96*2 (default 1-inch margins)
const TOLERANCE = 4; // px — avoids thrashing on subpixel differences

export const PAGINATION_PLUGIN_KEY = new PluginKey('pagination');

function measureChildHeights(pageDomEl) {
  // pageDomEl is <div class="word-page"> — its inner content holder is .word-page-inner
  const inner = pageDomEl.querySelector('.word-page-inner');
  if (!inner) return [];
  return Array.from(inner.children).map(child => ({
    el: child,
    height: child.offsetHeight,
  }));
}

/**
 * Per-page writable height = A4 page height − (top padding + bottom padding).
 * Padding tracks the protocol-driven margin CSS variables and the first-page
 * banner offset, so pagination always splits where the actual content area
 * ends — matching what the preview/print pipeline will render.
 */
function getPageMaxHeight(pageDomEl, fallback) {
  const inner = pageDomEl?.querySelector?.('.word-page-inner');
  if (!inner) return fallback;
  const cs = window.getComputedStyle(inner);
  const padTop    = parseFloat(cs.paddingTop)    || 0;
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  const max = A4_HEIGHT - padTop - padBottom;
  return max > 50 ? max : fallback;
}

function findSplitIndex(childHeights, maxHeight) {
  let acc = 0;
  for (let i = 0; i < childHeights.length; i++) {
    const h = childHeights[i].height;
    if (acc + h > maxHeight + TOLERANCE) {
      // Always keep at least one child on the page (avoid infinite split loop)
      return Math.max(1, i);
    }
    acc += h;
  }
  return childHeights.length; // everything fits
}

export const Pagination = Extension.create({
  name: 'pagination',

  addOptions() {
    return {
      // Fallback writable height used only if the live DOM measurement fails
      // (e.g., during initial mount before CSS resolves). Real per-page max
      // is computed from the page's padding-top + padding-bottom each tick.
      pageContentHeight: FALLBACK_CONTENT_HEIGHT,
    };
  },

  addProseMirrorPlugins() {
    const pageContentHeight = this.options.pageContentHeight;
    let rafId = null;
    let isPaginating = false;

    return [
      new Plugin({
        key: PAGINATION_PLUGIN_KEY,

        view(editorView) {
          const schedule = () => {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
              rafId = null;
              if (isPaginating) return;
              isPaginating = true;
              try {
                paginate(editorView, pageContentHeight);
              } catch (err) {
                console.warn('[Pagination] error:', err);
              } finally {
                isPaginating = false;
              }
            });
          };

          // Watch every .word-page-inner for size changes so pagination
          // re-runs when protocol margins update or the first-page banner
          // mounts/changes height — both change the per-page writable area.
          const ro = new ResizeObserver(() => schedule());
          const observed = new WeakSet();
          const observeInners = () => {
            editorView.dom.querySelectorAll('.word-page-inner').forEach(el => {
              if (!observed.has(el)) {
                ro.observe(el);
                observed.add(el);
              }
            });
          };
          // MutationObserver picks up newly added .word-page DOM (after splits)
          const mo = new MutationObserver(() => observeInners());
          mo.observe(editorView.dom, { childList: true, subtree: true });

          // Run once on mount
          observeInners();
          schedule();

          return {
            update(view, prevState) {
              if (view.state.doc !== prevState.doc) schedule();
            },
            destroy() {
              if (rafId) cancelAnimationFrame(rafId);
              ro.disconnect();
              mo.disconnect();
            },
          };
        },
      }),
    ];
  },
});

/**
 * Walk all <page> nodes; split when overflowing, merge when under-filled.
 */
function paginate(view, fallbackMaxHeight) {
  const { state } = view;
  const { doc } = state;
  const pageType = state.schema.nodes.page;
  if (!pageType) return;

  // Collect page DOM elements + their positions in the doc
  const pages = [];
  doc.forEach((pageNode, offset) => {
    if (pageNode.type.name !== 'page') return;
    const dom = view.nodeDOM(offset);
    if (!dom) return;
    pages.push({ node: pageNode, pos: offset, dom });
  });

  if (pages.length === 0) return;

  // Pass 1: SPLIT overflowing pages (process bottom-up so positions stay valid)
  for (let i = pages.length - 1; i >= 0; i--) {
    const { node, pos, dom } = pages[i];
    const inner = dom.querySelector('.word-page-inner') || dom;
    // Per-page max — accounts for protocol margins + first-page banner offset.
    // The writable area is the part of .word-page-inner NOT covered by padding.
    const maxHeight = getPageMaxHeight(dom, fallbackMaxHeight);
    // Content height = scrollHeight − (paddingTop + paddingBottom)
    const cs = window.getComputedStyle(inner);
    const padTop    = parseFloat(cs.paddingTop)    || 0;
    const padBottom = parseFloat(cs.paddingBottom) || 0;
    const totalHeight = inner.scrollHeight - padTop - padBottom;

    if (totalHeight <= maxHeight + TOLERANCE) continue;
    if (node.childCount <= 1) continue; // can't split a single block

    const childHeights = measureChildHeights(dom);
    if (childHeights.length === 0) continue;

    const splitIdx = findSplitIndex(childHeights, maxHeight);
    if (splitIdx >= node.childCount) continue;

    // Collect children to move to a new page
    const overflowChildren = [];
    for (let c = splitIdx; c < node.childCount; c++) {
      overflowChildren.push(node.child(c));
    }
    if (overflowChildren.length === 0) continue;

    const newPage = state.schema.nodes.page.create(null, overflowChildren);

    // Compute the position to slice from: pos + 1 (open page) + sum of child sizes up to splitIdx
    let sliceFrom = pos + 1;
    for (let c = 0; c < splitIdx; c++) sliceFrom += node.child(c).nodeSize;
    const sliceTo = pos + node.nodeSize - 1; // close of current page (exclusive of closing token)

    const transaction = state.tr
      .delete(sliceFrom, sliceTo)
      .insert(pos + node.nodeSize - (sliceTo - sliceFrom), newPage);

    transaction.setMeta('addToHistory', false);
    transaction.setMeta('pagination', true);
    view.dispatch(transaction);
    return; // run again on next rAF after DOM updates
  }

  // Pass 2: MERGE — pull blocks back from next page if current page has slack.
  // Only merges when the next page can lose a block AND remain valid (block+).
  for (let i = 0; i < pages.length - 1; i++) {
    const { node, pos, dom } = pages[i];
    const inner = dom.querySelector('.word-page-inner') || dom;
    const maxHeight = getPageMaxHeight(dom, fallbackMaxHeight);
    const cs = window.getComputedStyle(inner);
    const padTop    = parseFloat(cs.paddingTop)    || 0;
    const padBottom = parseFloat(cs.paddingBottom) || 0;
    const currentHeight = inner.scrollHeight - padTop - padBottom;
    const slack = maxHeight - currentHeight;
    if (slack <= TOLERANCE) continue;

    const next = pages[i + 1];
    const nextChildHeights = measureChildHeights(next.dom);
    if (nextChildHeights.length === 0) continue;

    // Case A: next page has > 1 child — try moving its first child back
    if (next.node.childCount > 1) {
      const firstChildHeight = nextChildHeights[0].height;
      if (firstChildHeight > slack + TOLERANCE) continue;

      const firstChildNode = next.node.child(0);
      const firstChildSize = firstChildNode.nodeSize;
      const nextStart = next.pos + 1;
      const insertPos = pos + node.nodeSize - 1;

      const transaction = state.tr
        .delete(nextStart, nextStart + firstChildSize)
        .insert(insertPos, firstChildNode);
      transaction.setMeta('addToHistory', false);
      transaction.setMeta('pagination', true);
      view.dispatch(transaction);
      return;
    }

    // Case B: next page has exactly 1 child — if it fits, absorb entire page
    if (next.node.childCount === 1) {
      const onlyChildHeight = nextChildHeights[0].height;
      if (onlyChildHeight > slack + TOLERANCE) continue;

      const onlyChild = next.node.child(0);
      const insertPos = pos + node.nodeSize - 1; // before close of current page
      const nextEnd = next.pos + next.node.nodeSize;

      const transaction = state.tr
        .delete(next.pos, nextEnd) // remove entire next page
        .insert(pos + node.nodeSize - 1, onlyChild); // insert its content at end of current page

      // After delete, current page's close position shifts. Use mapping:
      transaction.setMeta('addToHistory', false);
      transaction.setMeta('pagination', true);
      view.dispatch(transaction);
      return;
    }
  }
}
