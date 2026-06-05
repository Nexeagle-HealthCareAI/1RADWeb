import React, { useEffect, useState, useRef, useMemo } from 'react';

/**
 * FindReplaceDialog — floating panel anchored to top-right of the editor.
 *
 * Walks the editor's doc for text matches, allows Find Next / Prev,
 * Replace / Replace All. No decoration plugin yet — uses simple selection
 * highlighting via editor.commands.setTextSelection.
 */
export default function FindReplaceDialog({ editor, open, onClose, focusReplace = false }) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [regexError, setRegexError] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const replaceRef = useRef(null);

  // Build the list of match positions in the doc whenever query/options change.
  const matches = useMemo(() => {
    if (!editor || !query) { setRegexError(''); return []; }
    const results = [];
    const flags = caseSensitive ? 'g' : 'gi';
    let pattern;
    if (useRegex) {
      pattern = query;
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
    }
    let regex;
    try { regex = new RegExp(pattern, flags); setRegexError(''); }
    catch (err) { setRegexError(err.message || 'Invalid pattern'); return []; }

    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      const text = node.text || '';
      let m;
      while ((m = regex.exec(text)) !== null) {
        results.push({ from: pos + m.index, to: pos + m.index + m[0].length });
        if (m.index === regex.lastIndex) regex.lastIndex++;
      }
    });
    return results;
  }, [editor, query, caseSensitive, wholeWord, useRegex, editor?.state.doc]);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        if (focusReplace) replaceRef.current?.focus();
        else inputRef.current?.focus();
      }, 30);
    }
  }, [open, focusReplace]);

  useEffect(() => {
    setActiveIdx(prev => Math.min(prev, Math.max(0, matches.length - 1)));
  }, [matches.length]);

  // Highlight ALL matches (Word-style), current one emphasised. Push the match
  // list into the SearchHighlight plugin whenever it (or the active index)
  // changes; clear the highlights when the dialog closes/unmounts.
  useEffect(() => {
    if (!editor?.commands?.setSearchHighlights) return;
    if (open) editor.commands.setSearchHighlights(matches, activeIdx);
  }, [editor, open, matches, activeIdx]);

  useEffect(() => {
    if (!editor?.commands?.clearSearchHighlights) return;
    if (!open) editor.commands.clearSearchHighlights();
    return () => { try { editor.commands.clearSearchHighlights(); } catch (_) {} };
  }, [editor, open]);

  const jumpTo = (idx) => {
    if (!editor || matches.length === 0) return;
    const i = ((idx % matches.length) + matches.length) % matches.length;
    const { from, to } = matches[i];
    editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
    setActiveIdx(i);
  };

  const onNext = () => jumpTo(activeIdx + 1);
  const onPrev = () => jumpTo(activeIdx - 1);

  const onReplaceOne = () => {
    if (!editor || matches.length === 0) return;
    const { from, to } = matches[activeIdx];
    editor.chain().focus().setTextSelection({ from, to }).insertContent(replacement).run();
    // After replace, the matches array is stale until React re-runs useMemo.
    // Jump to next match in the recomputed list will happen automatically.
  };

  const onReplaceAll = () => {
    if (!editor || matches.length === 0) return;
    // Process matches from LAST to first so earlier positions stay valid.
    const sorted = [...matches].sort((a, b) => b.from - a.from);
    const tr = editor.state.tr;
    for (const { from, to } of sorted) {
      tr.insertText(replacement, from, to);
    }
    editor.view.dispatch(tr);
  };

  if (!open) return null;

  // Refocus the editor on any close path so caret continues where last
  // active match was selected.
  const closeAndRestore = () => {
    onClose?.();
    setTimeout(() => editor?.commands?.focus?.(), 0);
  };

  return (
    <div
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); closeAndRestore(); } }}
      style={{
        position: 'absolute',
        top: '8px',
        right: '20px',
        zIndex: 12000,
        background: 'white',
        border: '1px solid #c8c8c8',
        borderRadius: '6px',
        padding: '10px 12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        minWidth: '320px',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#323130' }}>Find &amp; Replace</span>
        <button onClick={closeAndRestore} title="Close (Esc)" style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#666', padding: '0 4px' }}>×</button>
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Find"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? onPrev() : onNext(); }
            if (e.key === 'Escape') { e.preventDefault(); closeAndRestore(); }
          }}
          style={{ flex: 1, height: '28px', padding: '0 8px', border: '1px solid #c8c8c8', borderRadius: '3px', fontSize: '13px', outline: 'none' }}
        />
        <span style={{ fontSize: '11px', color: regexError ? '#c00' : '#666', minWidth: '60px', textAlign: 'right' }}
              title={regexError || (matches.length === 0 ? 'No matches' : `${activeIdx + 1} of ${matches.length}`)}>
          {regexError ? 'Bad regex' : (matches.length === 0 ? '0' : `${activeIdx + 1} of ${matches.length}`)}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input
          ref={replaceRef}
          type="text"
          placeholder="Replace"
          value={replacement}
          onChange={e => setReplacement(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (e.shiftKey) onReplaceAll();
              else onReplaceOne();
            }
            if (e.key === 'Escape') { e.preventDefault(); closeAndRestore(); }
          }}
          style={{ flex: 1, height: '28px', padding: '0 8px', border: '1px solid #c8c8c8', borderRadius: '3px', fontSize: '13px', outline: 'none' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
        <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px', color: '#666' }}>
          <input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} />
          Match case
        </label>
        <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px', color: useRegex ? '#999' : '#666' }}
               title={useRegex ? 'Whole-word is ignored when regex is on — use \\b in your pattern' : ''}>
          <input type="checkbox" checked={wholeWord} disabled={useRegex} onChange={e => setWholeWord(e.target.checked)} />
          Whole word
        </label>
        <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px', color: '#666' }}
               title="Treat the Find field as a JavaScript regular expression">
          <input type="checkbox" checked={useRegex} onChange={e => setUseRegex(e.target.checked)} />
          Regex
        </label>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
        <button onClick={onPrev} disabled={matches.length === 0} style={btnSecondary}>↑ Prev</button>
        <button onClick={onNext} disabled={matches.length === 0} style={btnSecondary}>↓ Next</button>
        <div style={{ flex: 1 }} />
        <button onClick={onReplaceOne} disabled={matches.length === 0} style={btnSecondary}>Replace</button>
        <button onClick={onReplaceAll} disabled={matches.length === 0} style={btnPrimary}>Replace All</button>
      </div>
    </div>
  );
}

const btnSecondary = {
  height: '26px', padding: '0 10px', fontSize: '12px',
  background: '#fff', color: '#323130',
  border: '1px solid #c8c8c8', borderRadius: '3px',
  cursor: 'pointer', fontFamily: 'inherit',
};
const btnPrimary = {
  ...btnSecondary,
  background: '#0078d4', color: 'white', border: 'none', fontWeight: 600,
};
