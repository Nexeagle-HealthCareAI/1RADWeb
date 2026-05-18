import { Mark, Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Fragment } from '@tiptap/pm/model';

// ── Helpers ──────────────────────────────────────────────────────────────────

let _enabled = false;
let _author  = 'Author';

function newChangeId() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Recursively adds a mark to all text/inline nodes in a Fragment.
 * Block nodes are copied with their content marked.
 */
function addMarkToFrag(frag, mark) {
  const nodes = [];
  frag.forEach(node => {
    if (node.isText) {
      const newMarks = node.marks.filter(m => m.type !== mark.type).concat(mark);
      nodes.push(node.mark(newMarks));
    } else if (node.isInline) {
      try {
        const newMarks = node.marks.filter(m => m.type !== mark.type).concat(mark);
        nodes.push(node.mark(newMarks));
      } catch (_) {
        nodes.push(node);
      }
    } else {
      nodes.push(node.copy(addMarkToFrag(node.content, mark)));
    }
  });
  return Fragment.from(nodes);
}

function isReplaceStep(step) {
  // Duck-type check — ReplaceStep always has from, to, slice
  return step != null &&
    typeof step.from === 'number' &&
    typeof step.to   === 'number' &&
    step.slice !== undefined;
}

// ── Marks ────────────────────────────────────────────────────────────────────

/**
 * TrackInsert — marks text that has been inserted while track-changes is on.
 * Rendered as blue underlined text.
 */
export const TrackInsert = Mark.create({
  name: 'trackInsert',
  spanning: false,
  inclusive: false,

  addAttributes() {
    return {
      author:   { default: '' },
      date:     { default: '' },
      changeId: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'ins[data-ci]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'ins',
      {
        'data-ci':     HTMLAttributes.changeId || '',
        'data-author': HTMLAttributes.author   || '',
        'data-date':   HTMLAttributes.date     || '',
        title: `Inserted by ${HTMLAttributes.author || 'unknown'} on ${HTMLAttributes.date || ''}`,
        style: [
          'color:#1a56db',
          'text-decoration:underline dotted 2px',
          'background:rgba(26,86,219,0.08)',
          'border-radius:2px',
        ].join(';'),
      },
      0,
    ];
  },
});

/**
 * TrackDelete — marks text that has been deleted while track-changes is on.
 * The deleted text is kept in the document as strikethrough red text.
 */
export const TrackDelete = Mark.create({
  name: 'trackDelete',
  spanning: false,
  inclusive: false,

  addAttributes() {
    return {
      author:   { default: '' },
      date:     { default: '' },
      changeId: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'del[data-ci]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'del',
      {
        'data-ci':     HTMLAttributes.changeId || '',
        'data-author': HTMLAttributes.author   || '',
        'data-date':   HTMLAttributes.date     || '',
        title: `Deleted by ${HTMLAttributes.author || 'unknown'} on ${HTMLAttributes.date || ''}`,
        style: [
          'color:#e02424',
          'text-decoration:line-through',
          'background:rgba(224,36,36,0.06)',
          'border-radius:2px',
          'cursor:default',
        ].join(';'),
      },
      0,
    ];
  },
});

// ── Main Extension ───────────────────────────────────────────────────────────

const TRACK_PLUGIN_KEY = new PluginKey('trackChanges');

export const TrackChanges = Extension.create({
  name: 'trackChanges',

  addCommands() {
    return {
      /**
       * Enable or disable track-changes mode.
       * @param {boolean} enabled
       * @param {string}  author   - name shown on change annotations
       */
      setTrackChanges:
        (enabled, author = 'Author') =>
        () => {
          _enabled = enabled;
          _author  = author;
          return true;
        },

      /**
       * Accept a specific change (by changeId) or ALL changes if changeId is null.
       * Accepting:
       *   - trackDelete nodes  → delete them (the deletion is confirmed)
       *   - trackInsert nodes  → remove the mark (the insertion is confirmed)
       */
      acceptTrackChange:
        (changeId = null) =>
        ({ state, dispatch }) => {
          const { doc, schema } = state;
          const deleteMark = schema.marks.trackDelete;
          const insertMark = schema.marks.trackInsert;
          if (!deleteMark || !insertMark) return false;

          const insertRanges = [];
          const deleteRanges = [];

          doc.descendants((node, pos) => {
            if (!node.isInline) return;
            const di = node.marks.find(m => m.type === deleteMark);
            const ii = node.marks.find(m => m.type === insertMark);
            if (di && (changeId == null || di.attrs.changeId === changeId)) {
              deleteRanges.push({ from: pos, to: pos + node.nodeSize });
            }
            if (ii && (changeId == null || ii.attrs.changeId === changeId)) {
              insertRanges.push({ from: pos, to: pos + node.nodeSize });
            }
          });

          if (!insertRanges.length && !deleteRanges.length) return false;

          const tr = state.tr;
          // Remove trackInsert marks first (keep the text, remove annotation)
          insertRanges.forEach(({ from, to }) => tr.removeMark(from, to, insertMark));
          // Delete trackDelete content in reverse order to avoid position drift
          deleteRanges
            .map(({ from, to }) => ({ from: tr.mapping.map(from), to: tr.mapping.map(to) }))
            .sort((a, b) => b.from - a.from)
            .forEach(({ from, to }) => { if (from < to) tr.delete(from, to); });

          tr.setMeta('track-accept', true);
          if (dispatch) dispatch(tr);
          return true;
        },

      /**
       * Reject a specific change (by changeId) or ALL changes if changeId is null.
       * Rejecting:
       *   - trackInsert nodes  → delete them (the insertion is undone)
       *   - trackDelete nodes  → remove the mark (the deletion is cancelled)
       */
      rejectTrackChange:
        (changeId = null) =>
        ({ state, dispatch }) => {
          const { doc, schema } = state;
          const deleteMark = schema.marks.trackDelete;
          const insertMark = schema.marks.trackInsert;
          if (!deleteMark || !insertMark) return false;

          const insertRanges = [];
          const deleteRanges = [];

          doc.descendants((node, pos) => {
            if (!node.isInline) return;
            const di = node.marks.find(m => m.type === deleteMark);
            const ii = node.marks.find(m => m.type === insertMark);
            if (di && (changeId == null || di.attrs.changeId === changeId)) {
              deleteRanges.push({ from: pos, to: pos + node.nodeSize });
            }
            if (ii && (changeId == null || ii.attrs.changeId === changeId)) {
              insertRanges.push({ from: pos, to: pos + node.nodeSize });
            }
          });

          if (!insertRanges.length && !deleteRanges.length) return false;

          const tr = state.tr;
          // Remove trackDelete marks first (keep the text, restore it)
          deleteRanges.forEach(({ from, to }) => tr.removeMark(from, to, deleteMark));
          // Delete trackInsert content in reverse order
          insertRanges
            .map(({ from, to }) => ({ from: tr.mapping.map(from), to: tr.mapping.map(to) }))
            .sort((a, b) => b.from - a.from)
            .forEach(({ from, to }) => { if (from < to) tr.delete(from, to); });

          tr.setMeta('track-reject', true);
          if (dispatch) dispatch(tr);
          return true;
        },

      /** Count pending changes (trackInsert + trackDelete nodes). */
      getTrackChangeCount:
        () =>
        ({ state }) => {
          const { doc, schema } = state;
          const deleteMark = schema.marks.trackDelete;
          const insertMark = schema.marks.trackInsert;
          if (!deleteMark || !insertMark) return 0;
          const seen = new Set();
          doc.descendants(node => {
            node.marks.forEach(m => {
              if ((m.type === deleteMark || m.type === insertMark) && m.attrs.changeId) {
                seen.add(m.attrs.changeId);
              }
            });
          });
          return seen.size;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: TRACK_PLUGIN_KEY,

        appendTransaction(transactions, _oldState, newState) {
          if (!_enabled) return null;

          // Skip if every transaction is a track-op or history op
          if (
            transactions.every(t =>
              t.getMeta('track-processed') ||
              t.getMeta('track-accept')    ||
              t.getMeta('track-reject')    ||
              t.getMeta('history$')        ||
              !t.docChanged
            )
          ) return null;

          const schema     = newState.schema;
          const insertMark = schema.marks.trackInsert;
          const deleteMark = schema.marks.trackDelete;
          if (!insertMark || !deleteMark) return null;

          const changeId  = newChangeId();
          const changeAttrs = {
            author:   _author,
            date:     new Date().toISOString().slice(0, 16).replace('T', ' '),
            changeId,
          };

          const newTr      = newState.tr;
          let   hasChanges = false;

          for (let tIdx = 0; tIdx < transactions.length; tIdx++) {
            const origTr = transactions[tIdx];
            if (
              !origTr.docChanged            ||
              origTr.getMeta('track-processed') ||
              origTr.getMeta('track-accept')    ||
              origTr.getMeta('track-reject')    ||
              origTr.getMeta('history$')
            ) continue;

            for (let sIdx = 0; sIdx < origTr.steps.length; sIdx++) {
              const step = origTr.steps[sIdx];
              if (!isReplaceStep(step)) continue;

              const { from, to } = step;
              const docBefore    = origTr.docs[sIdx]; // doc before this specific step

              // Map from/to from docBefore coordinates → newState.doc coordinates.
              // origTr.mapping.slice(sIdx) maps through steps sIdx..n-1,
              // i.e. from docBefore to origTr's final doc.
              const stepMap = origTr.mapping.slice(sIdx);
              let fFrom = stepMap.map(from, -1);
              let fTo   = stepMap.map(to,    1);

              // Map through any later transactions in the same appendTransaction batch
              for (let j = tIdx + 1; j < transactions.length; j++) {
                fFrom = transactions[j].mapping.map(fFrom, -1);
                fTo   = transactions[j].mapping.map(fTo,   1);
              }

              // ── Re-insert deleted content with trackDelete mark ──────────
              if (from < to) {
                try {
                  const deletedSlice = docBefore.slice(from, to);
                  const markedFrag   = addMarkToFrag(
                    deletedSlice.content,
                    deleteMark.create(changeAttrs),
                  );
                  const insertPos = newTr.mapping.map(fFrom, -1);
                  newTr.insert(insertPos, markedFrag);
                  hasChanges = true;
                } catch (_) { /* safe to skip position errors */ }
              }

              // ── Apply trackInsert mark to the newly inserted content ─────
              if (fFrom < fTo) {
                try {
                  // After re-inserting deleted content, use bias +1 to land
                  // just after the re-inserted text (= start of new content)
                  const iFrom = newTr.mapping.map(fFrom, 1);
                  const iTo   = newTr.mapping.map(fTo,   1);
                  if (iFrom < iTo) {
                    newTr.addMark(iFrom, iTo, insertMark.create(changeAttrs));
                    hasChanges = true;
                  }
                } catch (_) {}
              }
            }
          }

          if (!hasChanges) return null;
          newTr.setMeta('track-processed', true);
          return newTr;
        },
      }),
    ];
  },
});
