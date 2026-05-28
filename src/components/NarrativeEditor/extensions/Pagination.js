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
  const children = Array.from(inner.children);
  if (children.length === 0) return [];
  // Use offsetTop deltas so we count each child's visual footprint INCLUDING
  // collapsed margins between siblings. `offsetHeight` alone misses the
  // margin between paragraphs (default 8 px on <p>), causing pagination to
  // under-count by ~8px per block and starve the split/merge passes.
  const cs = window.getComputedStyle(inner);
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  return children.map((child, i) => {
    const top = child.offsetTop;
    const nextTop = (i + 1 < children.length)
      ? children[i + 1].offsetTop
      : (inner.scrollHeight - padBottom);
    return { el: child, height: Math.max(0, nextTop - top) };
  });
}

/**
 * True content height of a page's inner, measured from the child blocks
 * (last child bottom − first child top). Unlike `scrollHeight`, this IGNORES
 * the `.word-page-inner { min-height: 1123px }` floor — critical for the merge
 * pass, which otherwise sees every under-full page as "full" (scrollHeight
 * pinned at the min-height) and never pulls content back to an earlier page.
 */
function measureContentHeight(pageDomEl) {
  const inner = pageDomEl.querySelector('.word-page-inner') || pageDomEl;
  const children = inner.children;
  if (!children.length) return 0;
  const first = children[0];
  const last = children[children.length - 1];
  return Math.max(0, (last.offsetTop + last.offsetHeight) - first.offsetTop);
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

/**
 * For an oversized text block, find the character offset in its textContent
 * where the visual height first exceeds maxHeightPx. Walks back to the
 * nearest whitespace so the break lands on a word boundary. Returns -1 if
 * the block isn't a pure text block we can safely split.
 */
function findTextBreakOffset(blockEl, maxHeightPx) {
  const fullText = blockEl.textContent || '';
  if (!fullText.trim()) return -1;

  // Build a flat list of text nodes and the cumulative offsets they span.
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, null);
  const segs = [];
  let cum = 0;
  let n;
  while ((n = walker.nextNode())) {
    segs.push({ node: n, start: cum, length: n.nodeValue.length });
    cum += n.nodeValue.length;
  }
  if (segs.length === 0) return -1;

  const blockTop = blockEl.getBoundingClientRect().top;
  const range = document.createRange();

  const heightAt = (offset) => {
    let seg = segs[segs.length - 1];
    for (const s of segs) {
      if (offset <= s.start + s.length) { seg = s; break; }
    }
    const localOffset = Math.max(0, Math.min(seg.length, offset - seg.start));
    try {
      range.setStart(segs[0].node, 0);
      range.setEnd(seg.node, localOffset);
    } catch {
      return Infinity;
    }
    const rects = range.getClientRects();
    if (!rects.length) return 0;
    const last = rects[rects.length - 1];
    return last.bottom - blockTop;
  };

  // Binary search for the largest offset still fitting within maxHeight.
  let lo = 0, hi = cum, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (heightAt(mid) <= maxHeightPx) { best = mid; lo = mid + 1; }
    else { hi = mid - 1; }
  }

  // Walk back to the nearest whitespace so the break is on a word boundary.
  while (best > 0 && !/\s/.test(fullText[best - 1])) best--;
  return best > 0 && best < fullText.length ? best : -1;
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
    // How long to wait after the last USER edit before paginating. While the
    // typist is actively typing we do NOT paginate — that keeps pagination's
    // addToHistory:false transactions from piling up between the user's own
    // edits, which is what broke Ctrl+Z ("undo won't pull content back from
    // page 2"). Once typing pauses, pagination runs and then converges fast.
    const DEBOUNCE_MS = 180;

    return [
      new Plugin({
        key: PAGINATION_PLUGIN_KEY,

        view(editorView) {
          let rafId = null;
          let debounceId = null;
          let isPaginating = false;
          // Set true right before paginate dispatches a transaction; lets the
          // resulting view.update keep converging immediately instead of
          // waiting the debounce again.
          let expectingPaginationUpdate = false;
          const markPagi = () => { expectingPaginationUpdate = true; };

          const runPaginate = () => {
            rafId = null;
            if (isPaginating) return;
            isPaginating = true;
            try {
              paginate(editorView, pageContentHeight, markPagi);
            } catch (err) {
              console.warn('[Pagination] error:', err);
            } finally {
              isPaginating = false;
            }
          };

          // Fast path — used to converge after a pagination dispatch and for
          // initial mount / layout (banner, margin) changes.
          const scheduleFast = () => {
            if (debounceId) { clearTimeout(debounceId); debounceId = null; }
            if (rafId) return;
            rafId = requestAnimationFrame(runPaginate);
          };
          // Debounced path — used for USER edits so we don't paginate on every
          // keystroke (preserves clean undo).
          const scheduleDebounced = () => {
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            if (debounceId) clearTimeout(debounceId);
            debounceId = setTimeout(() => {
              debounceId = null;
              rafId = requestAnimationFrame(runPaginate);
            }, DEBOUNCE_MS);
          };

          // Watch every .word-page-inner for size changes (margins / banner).
          const ro = new ResizeObserver(() => scheduleFast());
          const observed = new WeakSet();
          const observeInners = () => {
            editorView.dom.querySelectorAll('.word-page-inner').forEach(el => {
              if (!observed.has(el)) {
                ro.observe(el);
                observed.add(el);
              }
            });
          };
          const mo = new MutationObserver(() => observeInners());
          mo.observe(editorView.dom, { childList: true, subtree: true });

          // Discrete actions (undo / redo) fire this to reflow content across
          // pages immediately, bypassing the typing debounce so it feels
          // instant like Word.
          const onPaginateNow = () => scheduleFast();
          window.addEventListener('narrative-editor:paginate-now', onPaginateNow);

          observeInners();
          scheduleFast(); // initial paginate on mount

          return {
            update(view, prevState) {
              if (view.state.doc === prevState.doc) return;
              if (expectingPaginationUpdate) {
                // This doc change came from pagination itself → keep converging
                // immediately (no debounce).
                expectingPaginationUpdate = false;
                scheduleFast();
              } else {
                // A user edit → wait for a typing pause before paginating so
                // undo stays clean.
                scheduleDebounced();
              }
            },
            destroy() {
              window.removeEventListener('narrative-editor:paginate-now', onPaginateNow);
              if (rafId) cancelAnimationFrame(rafId);
              if (debounceId) clearTimeout(debounceId);
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
function paginate(view, fallbackMaxHeight, markPagi) {
  const { state } = view;
  const { doc } = state;
  const pageType = state.schema.nodes.page;
  if (!pageType) return;
  // Wrap dispatch so every pagination transaction flags the next view.update
  // as pagination-driven (fast convergence, not a user edit).
  const _dispatch = view.dispatch.bind(view);
  const dispatch = (tr) => { try { markPagi && markPagi(); } catch (_) {} _dispatch(tr); };

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
    // Subtract the LAST child's margin-bottom from the overflow check —
    // Word collapses that margin at the page boundary, so counting it
    // here would force premature splits when users add "Space After
    // Paragraph" on a paragraph that already sits at the end of a page.
    let trailingMargin = 0;
    const lastChild = inner.lastElementChild;
    if (lastChild) {
      trailingMargin = parseFloat(window.getComputedStyle(lastChild).marginBottom) || 0;
    }
    const totalHeight = inner.scrollHeight - padTop - padBottom - trailingMargin;

    if (totalHeight <= maxHeight + TOLERANCE) continue;

    const childHeights = measureChildHeights(dom);
    if (childHeights.length === 0) continue;


    // Find the child that straddles the page-height boundary and how much
    // vertical room remains above it on this page.
    let acc = 0, straddleIdx = -1, heightBefore = 0;
    for (let c = 0; c < childHeights.length; c++) {
      const h = childHeights[c].height;
      if (acc + h > maxHeight + TOLERANCE) { straddleIdx = c; heightBefore = acc; break; }
      acc += h;
    }
    if (straddleIdx === -1) continue; // measured content fits — nothing to do

    // ── Special case: a SINGLE block taller than the whole page ───────────
    // Only here is a mid-paragraph split unavoidable — there's no block
    // boundary to break at. We split the paragraph (depth 1) at a line
    // boundary; the next pagination tick moves the second half to a new page
    // via the normal block-level split. A safety buffer keeps the first half
    // comfortably under the page bottom so the line-box vs scrollHeight metric
    // mismatch can't trigger a re-split cascade.
    if (straddleIdx === 0 && childHeights[0].height > maxHeight + TOLERANCE) {
      const firstChild = node.child(0);
      const blockDom = childHeights[0].el;
      const isPureText =
        firstChild.isTextblock &&
        firstChild.textContent.length > 0 &&
        firstChild.content.size === firstChild.textContent.length;
      if (isPureText) {
        const lh = parseFloat(window.getComputedStyle(blockDom).lineHeight) || 20;
        const breakOffset = findTextBreakOffset(blockDom, maxHeight - Math.max(16, lh * 0.75));
        if (breakOffset > 0) {
          const splitPos = pos + 1 + 1 + breakOffset;
          try {
            const tr = state.tr.split(splitPos);
            tr.setMeta('addToHistory', false);
            tr.setMeta('pagination', true);
            dispatch(tr);
            return;
          } catch (err) {
            console.warn('[Pagination] text-split failed:', err);
          }
        }
      }
      continue; // oversized non-text block — leave it (overflows visually)
    }

    // ── Normal case: block-level overflow ─────────────────────────────────
    if (node.childCount <= 1) continue; // can't split a single block
    const splitIdx = Math.max(1, straddleIdx); // keep ≥1 block on this page
    if (splitIdx >= node.childCount) continue;

    let blockSplitPos = pos + 1;
    for (let c = 0; c < splitIdx; c++) blockSplitPos += node.child(c).nodeSize;

    // KEY FIX — flow overflow into the EXISTING next page instead of always
    // spawning a brand-new one. Previously every overflow did tr.split(),
    // inserting a new page after the current one; with a banner-shrunk first
    // page (maxHeight 758 vs 931) every Enter overflowed and manufactured
    // another page, and the merge pass couldn't consolidate them fast enough.
    // It also produced a storm of pagination transactions that wrecked undo
    // rebasing ("Ctrl+Z won't pull content back from page 2"). When a next
    // page already exists, MOVE the overflow blocks to its start; only create
    // a new page when there is genuinely no page ahead.
    if (i < pages.length - 1) {
      // Move the overflow into the existing next page via JOIN + SPLIT — both
      // are history-clean (rebaseable) StepMaps, unlike delete()+insert()
      // which collapses positions and breaks Ctrl+Z. Join this page with the
      // next (merging their content), then re-split right after the blocks
      // that fit — net effect: the overflow blocks land at the start of the
      // (formerly next) page, no new page, and undo still rebases correctly.
      const tr = state.tr;
      try {
        tr.join(pos + node.nodeSize, 1);             // merge page i + page i+1
        tr.split(tr.mapping.map(blockSplitPos), 1);  // re-split after fitting blocks
        tr.setMeta('addToHistory', false);
        tr.setMeta('pagination', true);
        dispatch(tr);
        return;
      } catch (err) {
        console.warn('[Pagination] flow-forward (join+split) failed, falling back to split:', err?.message);
        // fall through to the plain split path below
      }
    }

    // No next page (or flow-forward failed) → split off a new page.
    // tr.split() keeps a clean StepMap so undo still rebases across the break.
    const transaction = state.tr;
    try {
      transaction.split(blockSplitPos, 1);
    } catch (err) {
      console.warn('[Pagination] page-split failed:', err);
      continue;
    }
    transaction.setMeta('addToHistory', false);
    transaction.setMeta('pagination', true);
    dispatch(transaction);
    return; // run again on next rAF after DOM updates
  }

  // Pass 2: MERGE — pull blocks back from next page if current page has slack.
  // Only merges when the next page can lose a block AND remain valid (block+).
  for (let i = 0; i < pages.length - 1; i++) {
    const { node, pos, dom } = pages[i];
    const maxHeight = getPageMaxHeight(dom, fallbackMaxHeight);
    // Use the TRUE content height (from child blocks), not scrollHeight —
    // scrollHeight is floored at the inner's min-height (1123px), which would
    // make an under-full page look full and block the merge entirely.
    const currentHeight = measureContentHeight(dom);
    const slack = maxHeight - currentHeight;
    const next = pages[i + 1];
    if (slack <= TOLERANCE) continue;

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
      dispatch(transaction);
      return;
    }

    // Case B: next page has exactly 1 child — if it fits, absorb entire page
    // via tr.join(). join() is the inverse of the tr.split() used in Pass 1
    // and produces a clean StepMap, so prosemirror-history can rebase a
    // pending undo step across the merge (delete()+insert() would collapse
    // positions and break Ctrl+Z after a merge). Safe from oscillation: the
    // whole next page is known to fit, so the joined page won't re-split.
    if (next.node.childCount === 1) {
      const onlyChildHeight = nextChildHeights[0].height;
      if (onlyChildHeight > slack + TOLERANCE) continue;

      // Boundary between this page and the next = just after this page's
      // closing token.
      const jointPos = pos + node.nodeSize;
      const transaction = state.tr;
      try {
        transaction.join(jointPos, 1);
      } catch (err) {
        console.warn('[Pagination] page-merge join failed:', err);
        continue;
      }
      transaction.setMeta('addToHistory', false);
      transaction.setMeta('pagination', true);
      dispatch(transaction);
      return;
    }
  }

  // Pass 3: REMOVE empty pages outright (trailing OR mid-document).
  //
  // An empty paragraph-only page is never desirable — it's just the schema's
  // `block+` requirement, not real content. Case B can't absorb it when the
  // previous page is full (the empty <p> "doesn't fit"), so without this the
  // user is left staring at a blank page that won't go away.
  //
  // Why removing a MID-document empty page is safe here: Pass 3 only runs
  // after Pass 1 (split) found nothing to split — i.e. no page is overflowing
  // and waiting to flow content into a freshly-created (briefly empty) page.
  // So any empty page at this point is genuinely surplus, not a split-in-
  // progress. Removing it consolidates the document rather than punching a
  // hole.
  //
  // Rules:
  //   - NEVER remove the only page (the document needs at least one).
  //   - NEVER remove the first page (keeps the patient-banner page anchor).
  //   - Remove only a page whose sole child is an empty <p> with no
  //     meaningful attributes (alignment / indent / line-height the user may
  //     have set intentionally).
  //
  // Process bottom-up so multi-page deletes don't invalidate positions.
  for (let i = pages.length - 1; i >= 1; i--) {
    const { node, pos } = pages[i];

    // Remove a page when EVERY child is an empty paragraph (one OR more). This
    // catches the leftovers after Ctrl+Z pulls content back to page 1 — even
    // when undo leaves two or more blank paragraphs behind (the old
    // childCount===1 check missed those). Alignment/indent/line-height attrs
    // on the blanks are irrelevant since there's no text for them to apply to.
    if (node.childCount === 0) continue;
    let allEmptyParagraphs = true;
    for (let c = 0; c < node.childCount; c++) {
      const child = node.child(c);
      if (child.type.name !== 'paragraph' || (child.textContent || '').length > 0) {
        allEmptyParagraphs = false;
        break;
      }
    }
    if (!allEmptyParagraphs) continue;

    const pageEnd = pos + node.nodeSize;
    const transaction = state.tr.delete(pos, pageEnd);
    transaction.setMeta('addToHistory', false);
    transaction.setMeta('pagination', true);
    dispatch(transaction);
    return; // run again on next rAF in case multiple trailing pages need it
  }
}

