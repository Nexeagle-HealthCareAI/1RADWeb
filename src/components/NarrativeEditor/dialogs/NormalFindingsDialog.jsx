import React, { useState } from 'react';
import { NORMAL_FINDINGS, MODALITIES } from '../data/normalFindings';

const DLG = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.45)',
    zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  box: {
    background: '#fff',
    borderRadius: '8px',
    boxShadow: '0 24px 64px rgba(0,0,0,0.24)',
    width: '860px',
    maxWidth: '96vw',
    maxHeight: '88vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '"Segoe UI", system-ui, sans-serif',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 20px 12px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
};

const TAB_BTN = (active) => ({
  padding: '5px 14px', borderRadius: '4px', border: 'none',
  background: active ? '#dbeafe' : 'transparent',
  color: active ? '#1d4ed8' : '#374151',
  fontWeight: active ? 700 : 400,
  fontSize: '12px', cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.1s',
});

function PreviewPane({ html }) {
  return (
    <div
      style={{
        flex: 1, overflow: 'auto', padding: '14px 18px',
        fontSize: '12px', lineHeight: 1.7, color: '#111827',
        background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: '4px',
      }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * NormalFindingsDialog — pick a modality, then a section, preview it, and
 * insert / append / replace into the NarrativeEditor.
 *
 * Props:
 *   open        {boolean}
 *   onClose     {fn()}
 *   onInsert    {fn(html)} — insert at cursor
 *   onAppend    {fn(html)} — append at end of document
 *   onReplace   {fn(html)} — replace entire content
 */
export default function NormalFindingsDialog({ open, onClose, onInsert, onAppend, onReplace }) {
  const [activeModality, setActiveModality] = useState(MODALITIES[0]);
  const [activeEntry, setActiveEntry]       = useState(null);
  const [activeSection, setActiveSection]   = useState(null);
  const [search, setSearch]                 = useState('');

  if (!open) return null;

  const filteredEntries = NORMAL_FINDINGS.filter(e => {
    if (e.modality !== activeModality) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.label.toLowerCase().includes(q) ||
      e.sections.some(s => s.title.toLowerCase().includes(q) || s.html.toLowerCase().includes(q))
    );
  });

  const handleEntryClick = (entry) => {
    setActiveEntry(entry);
    setActiveSection(entry.sections[0] ?? null);
  };

  const handleSectionClick = (section) => {
    setActiveSection(section);
  };

  const selectedHtml = activeSection?.html ?? '';

  return (
    <div style={DLG.overlay} onClick={onClose}>
      <div style={DLG.box} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={DLG.header}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#111827' }}>
              Normal Findings Library
            </div>
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
              Select a modality, pick a template, then insert into the report
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}>✕</button>
        </div>

        {/* ── Modality tabs ── */}
        <div style={{ display: 'flex', gap: '4px', padding: '8px 16px', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap' }}>
          {MODALITIES.map(m => (
            <button key={m} style={TAB_BTN(m === activeModality)} onClick={() => { setActiveModality(m); setActiveEntry(null); setActiveSection(null); setSearch(''); }}>
              {m}
            </button>
          ))}
          <div style={{ marginLeft: 'auto' }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search templates…"
              style={{
                padding: '3px 8px', border: '1px solid #d1d5db', borderRadius: '4px',
                fontSize: '11px', width: '160px', fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        {/* ── Body: 3-column ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Column 1: Entry list */}
          <div style={{
            width: '180px', flexShrink: 0, borderRight: '1px solid #e5e7eb',
            overflowY: 'auto', padding: '8px 0',
          }}>
            {filteredEntries.length === 0 && (
              <p style={{ padding: '12px', fontSize: '11px', color: '#9ca3af', textAlign: 'center' }}>No templates match</p>
            )}
            {filteredEntries.map(entry => (
              <div
                key={entry.id}
                onClick={() => handleEntryClick(entry)}
                style={{
                  padding: '8px 14px', cursor: 'pointer', fontSize: '12px',
                  background: activeEntry?.id === entry.id ? '#dbeafe' : 'transparent',
                  color: activeEntry?.id === entry.id ? '#1d4ed8' : '#374151',
                  borderLeft: activeEntry?.id === entry.id ? '3px solid #3b82f6' : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
              >
                <span style={{ marginRight: '6px' }}>{entry.icon}</span>
                {entry.label}
              </div>
            ))}
          </div>

          {/* Column 2: Section list (if entry has multiple) */}
          {activeEntry && activeEntry.sections.length > 1 && (
            <div style={{
              width: '180px', flexShrink: 0, borderRight: '1px solid #e5e7eb',
              overflowY: 'auto', padding: '8px 0',
            }}>
              {activeEntry.sections.map((sec, i) => (
                <div
                  key={i}
                  onClick={() => handleSectionClick(sec)}
                  style={{
                    padding: '8px 14px', cursor: 'pointer', fontSize: '11px',
                    background: activeSection === sec ? '#f0fdf4' : 'transparent',
                    color: activeSection === sec ? '#166534' : '#374151',
                    borderLeft: activeSection === sec ? '3px solid #22c55e' : '3px solid transparent',
                    transition: 'background 0.1s',
                  }}
                >
                  {sec.title}
                </div>
              ))}
            </div>
          )}

          {/* Column 3: Preview */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 16px', overflow: 'hidden', gap: '10px' }}>
            {!activeSection ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '13px' }}>
                ← Select a template to preview
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#111827' }}>{activeSection.title}</div>
                <PreviewPane html={selectedHtml} />
              </>
            )}
          </div>
        </div>

        {/* ── Footer actions ── */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid #e5e7eb',
          display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center',
        }}>
          <span style={{ fontSize: '11px', color: '#6b7280', marginRight: 'auto' }}>
            {activeSection ? 'Ready to insert' : 'Select a template above'}
          </span>
          <button
            onClick={onClose}
            style={{ padding: '6px 16px', border: '1px solid #d1d5db', background: '#fff', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}
          >
            Cancel
          </button>
          <button
            disabled={!selectedHtml}
            onClick={() => { if (selectedHtml) { onAppend(selectedHtml); onClose(); } }}
            style={{
              padding: '6px 16px', border: '1px solid #6b7280', background: '#f9fafb',
              borderRadius: '4px', cursor: selectedHtml ? 'pointer' : 'not-allowed',
              opacity: selectedHtml ? 1 : 0.5, fontSize: '12px', fontFamily: 'inherit',
            }}
          >
            + Append to Report
          </button>
          <button
            disabled={!selectedHtml}
            onClick={() => { if (selectedHtml) { onReplace(selectedHtml); onClose(); } }}
            style={{
              padding: '6px 16px', border: '1px solid #b45309', background: '#fffbeb',
              color: '#92400e', borderRadius: '4px',
              cursor: selectedHtml ? 'pointer' : 'not-allowed',
              opacity: selectedHtml ? 1 : 0.5, fontSize: '12px', fontFamily: 'inherit',
            }}
          >
            ↺ Replace Report
          </button>
          <button
            disabled={!selectedHtml}
            onClick={() => { if (selectedHtml) { onInsert(selectedHtml); onClose(); } }}
            style={{
              padding: '6px 16px', border: '1px solid #1d4ed8', background: '#2563eb',
              color: '#fff', borderRadius: '4px',
              cursor: selectedHtml ? 'pointer' : 'not-allowed',
              opacity: selectedHtml ? 1 : 0.5, fontSize: '12px', fontFamily: 'inherit',
              fontWeight: 600,
            }}
          >
            ↓ Insert at Cursor
          </button>
        </div>

      </div>
    </div>
  );
}
