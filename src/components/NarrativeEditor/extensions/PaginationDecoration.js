// PaginationDecoration - Path B implementation of NarrativeEditor pagination.
//
// Why this exists: the original Pagination plugin mutates the document
// (splits/merges <page> nodes on every transaction). That coupling produces
// three visible quality problems:
//   1. Typing jank - pagination runs every ~180ms while the user types,
//      and large reflows pause the cursor.
//   2. Undo flicker - pagination transactions, even with addToHistory:false,
//      perturb StepMap chains in ways that make Ctrl+Z surprising.
//   3. Edge-case fragility - backspace at a page boundary, paste from
//      another app, single-paragraph-taller-than-a-page all require special-
//      case code that grew organically and is hard to reason about.
//
// Path B keeps the visual identity ("stacked A4 sheets with gaps") but
// gets there with ZERO document mutation:
//   * Schema: doc -> block+  (no Page node - the editor sees one long doc)
//   * Plugin: measures block heights, computes virtual boundary positions,
//             emits a DecorationSet of widget decorations rendering the
//             inter-page gap and the page chrome.
//   * Explicit page breaks remain - a PageBreak block-level node the user
//     inserts via Ctrl+Enter. The plugin treats those as forced boundaries
//     in the boundary computation; everything else is auto-flow.
//
// Header / footer (Phase 2):
//   * The plugin renders combined "boundary widgets" at each virtual page
//     break: top half shows the PRIOR page's footer, bottom half shows the
//     NEXT page's header, with the inter-page gap between them. A solo
//     header widget at doc start renders page 1's header; a solo footer
//     widget at doc end renders the last page's footer.
//   * Chrome content (header text, footer text, font, alignment, page-
//     number token substitution) is fed in via a setPageChrome command
//     from the React layer. The plugin stores the latest chrome in plugin
//     state and re-renders widgets when it changes.
//
// What this file does NOT yet do:
//   * Print/PDF pipeline integration - ReportPreviewModal serialises the
//     editor doc; on Path A the multi-page rendering falls out of Page
//     nodes; on Path B we'll need to inject page-break-after CSS at the
//     computed boundaries during serialisation. PageBreakNode markers
//     already work in print (via CSS); auto-flow boundaries don't yet.
//   * First-page banner shrinks page 1's usable height. CSS hooks
//     --patient-banner-height; the plugin subtracts it from page 1's max.
//
// The plugin is gated behind a feature flag in NarrativeEditor/index.jsx
// (USE_DECORATION_PAGINATION). Until the flag is flipped, this plugin is
// never registered and Path A runs unchanged.

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const A4_HEIGHT_PX = 1123;            // A4 at 96 dpi
const FALLBACK_CONTENT_HEIGHT = 931;  // = 1123 - 96px*2 default margins
const TOLERANCE_PX = 4;               // avoid thrashing on subpixel jitter

export const PAGINATION_DECORATION_PLUGIN_KEY = new PluginKey('pagination-decoration');

// Default chrome - empty header/footer + no first-page banner. The React
// side overrides via setPageChrome when the user configures one.
const DEFAULT_CHROME = Object.freeze({
  header: { text: '', fontFamily: 'inherit', fontSize: 10, align: 'center' },
  footer: { text: '', fontFamily: 'inherit', fontSize: 10, align: 'center' },
  firstPageBannerHeight: 0,
});

// Per-page writable height. Subtracts the editor's top/bottom padding (which
// already accounts for the user's protocol margins) and, for page 1, the
// first-page banner height which overlays the top margin area.
function getPageWritableHeight(editorDom, chrome, isFirstPage) {
  if (!editorDom) return FALLBACK_CONTENT_HEIGHT;
  const cs = window.getComputedStyle(editorDom);
  const padTop    = parseFloat(cs.paddingTop)    || 0;
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  let max = A4_HEIGHT_PX - padTop - padBottom;
  if (isFirstPage && Number.isFinite(chrome.firstPageBannerHeight)) {
    max -= chrome.firstPageBannerHeight;
  }
  return max > 100 ? max : FALLBACK_CONTENT_HEIGHT;
}

// Walk the doc's top-level blocks and measure their visual heights using
// their DOM nodes. Returns [{ pos, height, isPageBreak }] in document order.
// pos is the ProseMirror position JUST BEFORE the block - the natural place
// to attach a widget decoration that visually splits before it.
function measureBlocks(view) {
  const { state } = view;
  const { doc } = state;
  const out = [];
  let offset = 0;
  doc.forEach((blockNode) => {
    const dom = view.nodeDOM(offset);
    let height = 0;
    if (dom && dom.getBoundingClientRect) {
      height = dom.offsetHeight || 0;
      try {
        const cs = window.getComputedStyle(dom);
        height += parseFloat(cs.marginBottom) || 0;
      } catch { /* ignore */ }
    }
    out.push({
      pos: offset,
      height,
      isPageBreak: blockNode.type.name === 'pageBreak',
    });
    offset += blockNode.nodeSize;
  });
  return out;
}

// Greedy first-fit. Returns {positions, blockIndices} where each boundary
// at position positions[i] falls just BEFORE the top-level block at
// blockIndices[i] (doc-order zero-based index). Page-break blocks force a
// boundary; the running accumulator uses page 1's smaller writable area
// for the first page only.
//
// blockIndices is what the print pipeline uses to inject page-break
// markers between rendered top-level HTML children at the same boundary
// positions the on-screen plugin used.
function computeBoundaries(blocks, chrome, getMaxFor) {
  const positions = [];
  const blockIndices = [];
  let acc = 0;
  let pageIndex = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const maxHeight = getMaxFor(pageIndex);
    if (b.isPageBreak) {
      if (i > 0) {
        positions.push(b.pos);
        blockIndices.push(i);
        pageIndex++;
      }
      acc = 0;
      continue;
    }
    if (acc + b.height > maxHeight + TOLERANCE_PX && i > 0) {
      positions.push(b.pos);
      blockIndices.push(i);
      pageIndex++;
      acc = b.height;
    } else {
      acc += b.height;
    }
  }
  return { positions, blockIndices };
}

// Helper: build a band element with the chrome text + style applied. Used
// for headers AND footers; pageNumber is substituted into the {pageNumber}
// token if present.
function buildBand(kind, chromeSlice, pageNumber, totalPages) {
  const el = document.createElement('div');
  el.className = `word-page-${kind}`; // word-page-header or word-page-footer
  el.setAttribute('contenteditable', 'false');
  el.setAttribute('aria-hidden', 'true');
  const raw = chromeSlice.text || '';
  const text = raw
    .replace(/\{pageNumber\}/g, String(pageNumber))
    .replace(/\{totalPages\}/g, String(totalPages));
  el.textContent = text;
  el.style.fontFamily = chromeSlice.fontFamily || 'inherit';
  el.style.fontSize = `${chromeSlice.fontSize || 10}pt`;
  el.style.textAlign = chromeSlice.align || 'center';
  return el;
}

// Build the decoration set: header widget at doc start (page 1 header),
// combined footer-gap-header widget at each boundary, footer widget at
// doc end (last page footer).
function buildDecorations(view, chrome) {
  const { doc } = view.state;
  if (doc.content.size === 0) return DecorationSet.empty;
  const editorDom = view.dom;

  const blocks = measureBlocks(view);
  if (blocks.length === 0) return DecorationSet.empty;

  const getMaxFor = (pageIndex) =>
    getPageWritableHeight(editorDom, chrome, pageIndex === 0);

  const { positions: boundaries, blockIndices } = computeBoundaries(blocks, chrome, getMaxFor);
  const totalPages = boundaries.length + 1;
  const decos = [];

  // Page 1 header (at doc start). Only emit if header text is set.
  if (chrome.header.text) {
    decos.push(Decoration.widget(0, (_v, _g) => {
      const wrap = document.createElement('div');
      wrap.className = 'word-page-chrome word-page-chrome-top';
      wrap.appendChild(buildBand('header', chrome.header, 1, totalPages));
      return wrap;
    }, { side: -1, key: 'chrome-doc-start' }));
  }

  // Boundary widgets - footer of prior page + gap + header of next page.
  // pageNumber index here is the page the boundary opens (i + 2 because
  // the first boundary opens page 2, the second opens page 3, etc.).
  for (let i = 0; i < boundaries.length; i++) {
    const pos = boundaries[i];
    const priorPage = i + 1;
    const nextPage  = i + 2;
    const hdr = chrome.header;
    const ftr = chrome.footer;
    decos.push(Decoration.widget(pos, () => {
      const wrap = document.createElement('div');
      wrap.className = 'word-page-chrome word-page-chrome-boundary';
      wrap.setAttribute('contenteditable', 'false');
      wrap.setAttribute('aria-hidden', 'true');
      if (ftr.text) {
        wrap.appendChild(buildBand('footer', ftr, priorPage, totalPages));
      }
      const gap = document.createElement('div');
      gap.className = 'word-page-boundary';
      wrap.appendChild(gap);
      if (hdr.text) {
        wrap.appendChild(buildBand('header', hdr, nextPage, totalPages));
      }
      return wrap;
    }, { side: -1, key: `chrome-${pos}` }));
  }

  // Last page footer (at doc end). Only emit if footer text is set.
  if (chrome.footer.text) {
    const endPos = doc.content.size;
    decos.push(Decoration.widget(endPos, () => {
      const wrap = document.createElement('div');
      wrap.className = 'word-page-chrome word-page-chrome-bottom';
      wrap.appendChild(buildBand('footer', chrome.footer, totalPages, totalPages));
      return wrap;
    }, { side: 1, key: 'chrome-doc-end' }));
  }

  if (decos.length === 0) {
    return { decorationSet: DecorationSet.empty, blockIndices };
  }
  return { decorationSet: DecorationSet.create(doc, decos), blockIndices };
}

// Print-ready HTML serialization. Path A produces multi-page HTML naturally
// (via Page nodes that round-trip through renderHTML). Path B produces flat
// HTML; this helper enriches that flat HTML with auto-page-break markers
// at every boundary the on-screen plugin computed, so ReportPreviewModal's
// existing print/PDF pipeline (which already understands data-page-break)
// can split the output into pages without measuring anything itself.
//
// Safe to call on either path:
//   - On Path A, the extension isn't registered, plugin state is undefined,
//     blockIndices is empty, and we return editor.getHTML() unchanged.
//   - On Path B with no auto-breaks (single-page doc), same fallback.
//   - On Path B with N auto-breaks, inserts N page-break-marker divs into
//     the serialized HTML at the right positions.
//
// Note: manual PageBreakNode markers already serialize as
// <div class="page-break-marker" data-page-break="true"> via renderHTML
// — those are untouched here. Only auto-flow boundaries get injected.
export function getPrintHTML(editor) {
  if (!editor) return '';
  const html = editor.getHTML();
  let blockIndices = [];
  try {
    const s = PAGINATION_DECORATION_PLUGIN_KEY.getState(editor.state);
    blockIndices = Array.isArray(s?.blockIndices) ? s.blockIndices : [];
  } catch {
    // Extension not registered or state shape changed — fall through.
  }
  if (blockIndices.length === 0) return html;

  // DOMParser would be more robust but the editor's getHTML output is
  // well-formed (it's what ProseMirror serializes via DOMSerializer), so a
  // template-element parse is fine and avoids the document/window contract.
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const children = Array.from(tmp.children);
  injectBreakMarkers(children, blockIndices);
  return tmp.innerHTML;
}

// Insert auto data-page-break markers before each boundary child. Sorts the
// indices DESCENDING so earlier insertions don't shift later positions.
function injectBreakMarkers(children, blockIndices) {
  const sorted = [...blockIndices].sort((a, b) => b - a);
  for (const idx of sorted) {
    if (idx > 0 && idx < children.length) {
      const marker = document.createElement('div');
      marker.className = 'page-break-marker';
      marker.setAttribute('data-page-break', 'auto');
      children[idx].parentNode.insertBefore(marker, children[idx]);
    }
  }
}

// Print HTML for CONTINUOUS mode (Option 2). The PaginationDecoration plugin
// is NOT registered while editing in continuous mode (zero pagination work
// during typing), so there are no cached blockIndices. This computes the page
// boundaries LIVE from the editor's current block heights — reusing the SAME
// measureBlocks + computeBoundaries the on-screen overlay uses in pageview —
// and injects the data-page-break markers the print/PDF pipeline understands,
// so continuous prints paginate identically. Manual PageBreakNode markers in
// the HTML are preserved (they already serialize with data-page-break).
export function getContinuousPrintHTML(editor, chrome = DEFAULT_CHROME) {
  if (!editor) return '';
  const html = editor.getHTML();
  let blockIndices = [];
  try {
    const view = editor.view;
    if (view) {
      const blocks = measureBlocks(view);
      const getMaxFor = (pageIndex) => getPageWritableHeight(view.dom, chrome, pageIndex === 0);
      blockIndices = computeBoundaries(blocks, chrome, getMaxFor).blockIndices;
    }
  } catch { /* measurement failed → fall back to unpaginated flat HTML */ }
  if (blockIndices.length === 0) return html;

  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  injectBreakMarkers(Array.from(tmp.children), blockIndices);
  return tmp.innerHTML;
}

export const PaginationDecoration = Extension.create({
  name: 'paginationDecoration',

  addOptions() {
    return {
      debounceMs: 150,
    };
  },

  addCommands() {
    return {
      // React layer calls this with the latest header/footer state +
      // first-page banner height. The plugin reads the new chrome on the
      // next recompute. We dispatch the chrome via plugin meta so the
      // plugin's apply() can store it without a separate state container.
      setPageChrome: (chrome) => ({ tr, dispatch }) => {
        if (dispatch) {
          tr.setMeta(PAGINATION_DECORATION_PLUGIN_KEY, { chrome });
          tr.setMeta('addToHistory', false);
        }
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const debounceMs = this.options.debounceMs;

    return [
      new Plugin({
        key: PAGINATION_DECORATION_PLUGIN_KEY,

        state: {
          init: () => ({
            decorations: DecorationSet.empty,
            chrome: DEFAULT_CHROME,
            // Block indices of computed boundaries (top-level doc-order
            // indices, 1-based against block order). Used by getPrintHTML
            // to inject page-break markers between rendered HTML children.
            blockIndices: [],
          }),
          apply(tr, value) {
            const meta = tr.getMeta(PAGINATION_DECORATION_PLUGIN_KEY);
            let next = value;
            if (meta?.decorations) {
              next = { ...next, decorations: meta.decorations };
            }
            if (Array.isArray(meta?.blockIndices)) {
              next = { ...next, blockIndices: meta.blockIndices };
            }
            if (meta?.chrome) {
              const c = meta.chrome;
              next = {
                ...next,
                chrome: {
                  header: { ...DEFAULT_CHROME.header, ...(c.header || {}) },
                  footer: { ...DEFAULT_CHROME.footer, ...(c.footer || {}) },
                  firstPageBannerHeight:
                    Number.isFinite(c.firstPageBannerHeight) ? c.firstPageBannerHeight : 0,
                },
              };
            }
            if (!meta?.decorations && tr.docChanged) {
              next = { ...next, decorations: next.decorations.map(tr.mapping, tr.doc) };
            }
            return next;
          },
        },

        props: {
          decorations(state) {
            return this.getState(state).decorations;
          },
        },

        view(editorView) {
          let debounceId = null;
          let rafId = null;
          let lastChrome = DEFAULT_CHROME;

          const recompute = () => {
            rafId = null;
            const pluginState = PAGINATION_DECORATION_PLUGIN_KEY.getState(editorView.state);
            const chrome = pluginState?.chrome || DEFAULT_CHROME;
            lastChrome = chrome;
            const { decorationSet, blockIndices } = buildDecorations(editorView, chrome);
            const tr = editorView.state.tr.setMeta(PAGINATION_DECORATION_PLUGIN_KEY, {
              decorations: decorationSet,
              blockIndices,
            });
            tr.setMeta('addToHistory', false);
            editorView.dispatch(tr);
          };

          const scheduleFast = () => {
            if (debounceId) { clearTimeout(debounceId); debounceId = null; }
            if (rafId) return;
            rafId = requestAnimationFrame(recompute);
          };
          const scheduleDebounced = () => {
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            if (debounceId) clearTimeout(debounceId);
            debounceId = setTimeout(() => {
              debounceId = null;
              rafId = requestAnimationFrame(recompute);
            }, debounceMs);
          };

          const ro = new ResizeObserver(() => scheduleFast());
          ro.observe(editorView.dom);

          scheduleFast();

          return {
            update(view, prevState) {
              const prevPluginState = PAGINATION_DECORATION_PLUGIN_KEY.getState(prevState);
              const nextPluginState = PAGINATION_DECORATION_PLUGIN_KEY.getState(view.state);
              const chromeChanged = prevPluginState?.chrome !== nextPluginState?.chrome
                && nextPluginState?.chrome !== lastChrome;
              if (view.state.doc === prevState.doc && !chromeChanged) return;
              if (chromeChanged) scheduleFast();
              else scheduleDebounced();
            },
            destroy() {
              if (debounceId) clearTimeout(debounceId);
              if (rafId) cancelAnimationFrame(rafId);
              ro.disconnect();
            },
          };
        },
      }),
    ];
  },
});
