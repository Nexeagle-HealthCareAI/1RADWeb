import React from 'react';
import NarrativeEditor from './NarrativeEditor';

const C = {
  blue: '#0078d4',
  dark: '#201f1e',
  secondary: '#605e5c',
  light: '#f3f2f1',
  border: '#edebe9',
  white: '#ffffff',
  green: '#107c10',
  red: '#d13438',
  orange: '#ca5010',
};

const Btn = ({ onClick, disabled, variant = 'outline', children, style = {} }) => {
  const base = {
    padding: '5px 14px', fontSize: '13px', borderRadius: '2px', cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: '"Segoe UI", system-ui, sans-serif', fontWeight: variant === 'primary' ? 600 : 400,
    border: variant === 'primary' ? 'none' : variant === 'danger' ? `1px solid ${C.red}` : `1px solid ${C.border}`,
    background: variant === 'primary' ? C.blue : variant === 'danger' ? '#fde7e9' : C.white,
    color: variant === 'primary' ? 'white' : variant === 'danger' ? C.red : C.dark,
    opacity: disabled ? 0.5 : 1,
    ...style,
  };
  return <button onClick={onClick} disabled={disabled} style={base}>{children}</button>;
};

const FullscreenIcon = ({ isFs }) => isFs ? (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
    <path d="M5.5 0a.5.5 0 0 1 0 1H2.707L6.854 5.146a.5.5 0 1 1-.708.708L2 1.707V4.5a.5.5 0 0 1-1 0v-4a.5.5 0 0 1 .5-.5h4zm5 0h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V1.707l-4.146 4.147a.5.5 0 0 1-.708-.708L13.293 1H10.5a.5.5 0 0 1 0-1zM1 10.5a.5.5 0 0 1 1 0v2.793l4.146-4.147a.5.5 0 0 1 .708.708L2.707 14H5.5a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5v-4zm14.5 0v4a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1 0-1h2.793l-4.147-4.146a.5.5 0 0 1 .708-.708L14 13.293V10.5a.5.5 0 0 1 1 0z"/>
  </svg>
) : (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
    <path d="M1.5 1h4a.5.5 0 0 1 0 1H2.707L6.854 6.146a.5.5 0 1 1-.708.708L2 2.707V5.5a.5.5 0 0 1-1 0v-4a.5.5 0 0 1 .5-.5zm13 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V2.707l-4.146 4.147a.5.5 0 0 1-.708-.708L13.293 2H10.5a.5.5 0 0 1 0-1h4zM1 10.5a.5.5 0 0 1 1 0v2.793l4.146-4.147a.5.5 0 0 1 .708.708L2.707 14H5.5a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5v-4zm13.5 0v4a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1 0-1h2.793l-4.147-4.146a.5.5 0 0 1 .708-.708L14 13.293V10.5a.5.5 0 0 1 1 0z"/>
  </svg>
);

const STATUS_COLOR = {
  reported: C.green, reporting: '#8764b8', completed: C.blue,
  scanned: C.blue, in_progress: C.orange, confirmed: C.orange,
  cancelled: C.red, scheduled: C.secondary, booked: C.secondary,
};

const ReportingWorkspace = ({
  activeTab,
  editorState,
  isTablet,
  activeWorkspaceMode,
  appointmentId,
  activeAppointment,
  editorText,
  setEditorText,
  saveStatus,
  lastSaved,
  isOnline,
  handleSaveReport,
  handlePreviewPrint,
  keywordLibrary,
  patientHistory,
  loadingTimeline,
  fetchPatientTimeline,
  expandedHistoryReport,
  setExpandedHistoryReport,
  apiClient,
  newMacro,
  setNewMacro,
  handleSaveMacro,
  handleDeleteKeyword,
  macroTextareaRef,
  formatMacroText,
}) => {
  const [keywordSearch, setKeywordSearch] = React.useState('');
  const [keywordPage, setKeywordPage] = React.useState(1);
  const [keywordViewMode, setKeywordViewMode] = React.useState('registry');
  const [selectedKeywordId, setSelectedKeywordId] = React.useState(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const keywordItemsPerPage = 12;

  const filteredKeywords = React.useMemo(() =>
    (keywordLibrary || []).filter(k =>
      (k.trigger || '').toLowerCase().includes(keywordSearch.toLowerCase()) ||
      (k.replacementText || '').toLowerCase().includes(keywordSearch.toLowerCase())
    ), [keywordLibrary, keywordSearch]);

  const totalKeywordPages = Math.ceil(filteredKeywords.length / keywordItemsPerPage);
  const paginatedKeywords = React.useMemo(() => {
    const start = (keywordPage - 1) * keywordItemsPerPage;
    return filteredKeywords.slice(start, start + keywordItemsPerPage);
  }, [filteredKeywords, keywordPage]);

  const saveLabel =
    saveStatus === 'SAVING' ? 'Syncing...' :
    saveStatus === 'SUCCESS' ? `Saved at ${lastSaved}` :
    saveStatus === 'DIRTY' ? 'Unsaved changes' :
    'All changes saved';

  if (editorState === 'collapsed') return null;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column', flex: 1,
        background: C.white, overflow: 'hidden',
        fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ── Top toolbar ── */}
      <div style={{
        height: '48px', flexShrink: 0,
        background: C.white, borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', gap: '12px',
      }}>
        {/* Breadcrumb + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
          <span style={{ fontSize: '12px', color: C.secondary, whiteSpace: 'nowrap' }}>Radiology</span>
          <span style={{ color: C.border, fontSize: '14px' }}>›</span>
          <span style={{ fontSize: '12px', color: C.secondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
            {activeAppointment?.patientName || 'Patient'}
          </span>
          <span style={{ color: C.border, fontSize: '14px' }}>›</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: C.dark, whiteSpace: 'nowrap' }}>
            {activeAppointment?.service || 'Report'}
          </span>

          <div style={{ width: '1px', height: '16px', background: C.border, margin: '0 8px' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOnline ? C.green : C.orange, flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: C.secondary, whiteSpace: 'nowrap' }}>
              {isOnline ? 'Connected' : 'Offline'}
            </span>
          </div>

          <span style={{ fontSize: '11px', color: saveStatus === 'DIRTY' ? C.orange : C.secondary, marginLeft: '8px', whiteSpace: 'nowrap' }}>
            {saveLabel}
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
          <Btn onClick={() => handleSaveReport(false)}>Save draft</Btn>
          <Btn onClick={handlePreviewPrint}>Preview</Btn>
          <Btn onClick={() => handleSaveReport(true)} variant="primary">Finalize &amp; Sign</Btn>

          <div style={{ width: '1px', height: '20px', background: C.border, margin: '0 4px' }} />

          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '5px 10px', fontSize: '12px', color: C.secondary,
              border: `1px solid ${C.border}`, borderRadius: '2px',
              background: isFullscreen ? C.light : C.white, cursor: 'pointer',
              fontFamily: '"Segoe UI", sans-serif',
            }}
          >
            <FullscreenIcon isFs={isFullscreen} />
            {isFullscreen ? 'Exit full screen' : 'Full screen'}
          </button>
        </div>
      </div>

      {/* ── Content area ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* REPORT WORKSPACE — NarrativeEditor owns its own canvas/scrolling */}
        {activeTab === 'REPORT_WORKSPACE' && (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <NarrativeEditor
              content={editorText}
              onChange={(html) => setEditorText(html)}
              placeholder="Begin your radiology report..."
              onSave={() => handleSaveReport(false)}
              keywordLibrary={keywordLibrary}
              style={{ height: '100%' }}
            />
          </div>
        )}

        {/* KEYWORDS / MACROS */}
        {activeTab === 'Keywords' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px 20px', gap: '12px' }}>

            {/* Toolbar row */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              paddingBottom: '12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0,
            }}>
              <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: '2px', overflow: 'hidden' }}>
                {[
                  { key: 'registry', label: 'List view' },
                  { key: 'table', label: 'Table view' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setKeywordViewMode(key)}
                    style={{
                      padding: '5px 16px', border: 'none', fontSize: '12px', fontWeight: 500,
                      background: keywordViewMode === key ? C.blue : C.white,
                      color: keywordViewMode === key ? 'white' : C.secondary,
                      cursor: 'pointer', fontFamily: '"Segoe UI", sans-serif',
                    }}
                  >{label}</button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search macros..."
                    value={keywordSearch}
                    onChange={(e) => { setKeywordSearch(e.target.value); setKeywordPage(1); }}
                    style={{
                      width: '240px', padding: '5px 10px 5px 30px',
                      border: `1px solid ${C.border}`, borderRadius: '2px',
                      fontSize: '13px', outline: 'none', color: C.dark,
                      fontFamily: '"Segoe UI", sans-serif', background: C.white,
                    }}
                  />
                  <svg style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 16 16" fill={C.secondary}>
                    <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.117-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
                  </svg>
                </div>
                <Btn
                  variant="primary"
                  onClick={() => { setSelectedKeywordId('new'); setKeywordViewMode('registry'); setNewMacro?.({ trigger: '', replacementText: '' }); }}
                >+ New macro</Btn>
              </div>
            </div>

            {keywordViewMode === 'registry' ? (
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden', border: `1px solid ${C.border}`, borderRadius: '2px' }}>
                {/* Sidebar */}
                <div style={{ width: '260px', flexShrink: 0, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.white }}>
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {paginatedKeywords.length === 0 ? (
                      <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: '13px', color: C.secondary }}>No macros found</div>
                    ) : paginatedKeywords.map(item => {
                      const isActive = selectedKeywordId === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => { setSelectedKeywordId(item.id); setNewMacro?.({ trigger: item.trigger, replacementText: item.replacementText }); }}
                          style={{
                            padding: '11px 14px', cursor: 'pointer',
                            borderBottom: `1px solid ${C.border}`,
                            borderLeft: `3px solid ${isActive ? C.blue : 'transparent'}`,
                            background: isActive ? '#eff6fc' : 'transparent',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                            <code style={{ fontSize: '13px', fontWeight: 600, color: isActive ? C.blue : C.dark, fontFamily: '"Cascadia Code", "Consolas", monospace' }}>/{item.trigger}</code>
                            <span style={{ fontSize: '10px', background: '#eff6fc', color: C.blue, padding: '1px 5px', borderRadius: '2px', fontWeight: 600 }}>MACRO</span>
                          </div>
                          <div style={{ fontSize: '11px', color: C.secondary, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                            {item.replacementText?.replace(/<[^>]*>?/gm, '') || 'No content'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ padding: '8px 12px', borderTop: `1px solid ${C.border}`, background: C.light, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <Btn disabled={keywordPage === 1} onClick={() => setKeywordPage(keywordPage - 1)} style={{ padding: '3px 10px', fontSize: '11px' }}>‹</Btn>
                    <span style={{ fontSize: '11px', color: C.secondary }}>{keywordPage} / {totalKeywordPages || 1}</span>
                    <Btn disabled={keywordPage >= totalKeywordPages} onClick={() => setKeywordPage(keywordPage + 1)} style={{ padding: '3px 10px', fontSize: '11px' }}>›</Btn>
                  </div>
                </div>

                {/* Editor panel */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.white }}>
                  {selectedKeywordId ? (
                    <>
                      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, background: C.light, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                        <div>
                          <h2 style={{ fontSize: '15px', fontWeight: 600, color: C.dark, margin: 0 }}>
                            {selectedKeywordId === 'new' ? 'New macro' : `Edit /${newMacro?.trigger}`}
                          </h2>
                          <p style={{ fontSize: '12px', color: C.secondary, marginTop: '2px' }}>Define a shorthand that expands in the report editor</p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {selectedKeywordId !== 'new' && (
                            <Btn variant="danger" onClick={() => handleDeleteKeyword?.(selectedKeywordId)}>Delete</Btn>
                          )}
                          <Btn variant="primary" onClick={handleSaveMacro}>
                            {selectedKeywordId === 'new' ? 'Create macro' : 'Save changes'}
                          </Btn>
                        </div>
                      </div>

                      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                        <div style={{ maxWidth: '600px' }}>
                          <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: C.dark, marginBottom: '6px' }}>
                              Trigger shorthand <span style={{ color: C.secondary, fontWeight: 400 }}>(case insensitive)</span>
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${C.border}`, borderRadius: '2px', overflow: 'hidden' }}>
                              <span style={{ padding: '8px 12px', background: C.light, borderRight: `1px solid ${C.border}`, color: C.secondary, fontSize: '16px', fontFamily: '"Cascadia Code", monospace' }}>/</span>
                              <input
                                type="text"
                                placeholder="e.g. normal_liver"
                                value={newMacro?.trigger || ''}
                                onChange={e => setNewMacro?.({ ...newMacro, trigger: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                                style={{ flex: 1, padding: '8px 12px', border: 'none', fontSize: '14px', fontWeight: 500, color: C.dark, outline: 'none', fontFamily: '"Cascadia Code", "Consolas", monospace', background: C.white }}
                              />
                            </div>
                          </div>

                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <label style={{ fontSize: '12px', fontWeight: 600, color: C.dark }}>Replacement text</label>
                              <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: '2px', overflow: 'hidden' }}>
                                {[
                                  { label: 'B', s: { fontWeight: 800 }, cmd: 'bold' },
                                  { label: 'I', s: { fontStyle: 'italic' }, cmd: 'italic' },
                                  { label: 'U', s: { textDecoration: 'underline' }, cmd: 'underline' },
                                ].map(({ label, s, cmd }) => (
                                  <button key={cmd} onClick={() => formatMacroText?.(cmd)} style={{ padding: '4px 10px', border: 'none', borderRight: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px', color: C.dark, fontFamily: '"Segoe UI", sans-serif', ...s }}>
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div
                              ref={macroTextareaRef}
                              contentEditable="true"
                              onInput={(e) => setNewMacro?.({ ...newMacro, replacementText: e.currentTarget.innerHTML })}
                              style={{
                                minHeight: '180px', padding: '14px 16px',
                                border: `1px solid ${C.border}`, borderRadius: '2px',
                                background: C.white, outline: 'none',
                                fontSize: '14px', lineHeight: '1.7', color: C.dark,
                                fontFamily: '"Segoe UI", sans-serif',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.secondary, textAlign: 'center', padding: '48px' }}>
                      <svg width="40" height="40" viewBox="0 0 16 16" fill={C.border} style={{ marginBottom: '16px' }}>
                        <path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/>
                      </svg>
                      <h3 style={{ fontSize: '15px', fontWeight: 600, color: C.dark, margin: '0 0 8px' }}>Select a macro to edit</h3>
                      <p style={{ fontSize: '13px', lineHeight: '1.6', maxWidth: '340px' }}>
                        Choose a shorthand from the list, or create a new one to speed up your reporting workflow.
                      </p>
                      <Btn variant="primary" onClick={() => { setSelectedKeywordId('new'); setNewMacro?.({ trigger: '', replacementText: '' }); }} style={{ marginTop: '18px' }}>
                        + New macro
                      </Btn>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Table view */
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: `1px solid ${C.border}`, borderRadius: '2px' }}>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: C.light, position: 'sticky', top: 0, zIndex: 10 }}>
                        <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 600, color: C.dark, borderBottom: `1px solid ${C.border}`, fontSize: '12px', width: '160px' }}>Trigger</th>
                        <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 600, color: C.dark, borderBottom: `1px solid ${C.border}`, fontSize: '12px' }}>Expansion</th>
                        <th style={{ padding: '9px 16px', textAlign: 'center', fontWeight: 600, color: C.dark, borderBottom: `1px solid ${C.border}`, fontSize: '12px', width: '110px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedKeywords.map((item, idx) => (
                        <tr key={item.id} style={{ borderBottom: `1px solid ${C.border}`, background: idx % 2 === 0 ? C.white : '#faf9f8' }}>
                          <td style={{ padding: '11px 16px', verticalAlign: 'top' }}>
                            <code style={{ background: '#eff6fc', color: C.blue, padding: '2px 7px', borderRadius: '2px', fontSize: '12px', fontFamily: '"Cascadia Code", "Consolas", monospace', fontWeight: 600 }}>/{item.trigger}</code>
                          </td>
                          <td style={{ padding: '11px 16px', color: C.dark, lineHeight: '1.5', fontSize: '13px' }}>
                            {item.replacementText?.replace(/<[^>]*>?/gm, '') || '—'}
                          </td>
                          <td style={{ padding: '11px 16px', textAlign: 'center', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <Btn style={{ padding: '3px 10px', fontSize: '12px' }} onClick={() => { setSelectedKeywordId(item.id); setNewMacro?.({ trigger: item.trigger, replacementText: item.replacementText }); setKeywordViewMode('registry'); }}>Edit</Btn>
                              <Btn variant="danger" style={{ padding: '3px 10px', fontSize: '12px' }} onClick={() => handleDeleteKeyword?.(item.id)}>Delete</Btn>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.border}`, background: C.light, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '12px', color: C.secondary }}>Showing {paginatedKeywords.length} of {filteredKeywords.length}</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <Btn disabled={keywordPage === 1} onClick={() => setKeywordPage(keywordPage - 1)} style={{ padding: '4px 12px', fontSize: '12px' }}>‹ Previous</Btn>
                    <Btn disabled={keywordPage >= totalKeywordPages} onClick={() => setKeywordPage(keywordPage + 1)} style={{ padding: '4px 12px', fontSize: '12px' }}>Next ›</Btn>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PATIENT TIMELINE */}
        {activeTab === 'Patient Timeline' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px 20px', gap: '12px' }}>
            {/* Patient info bar */}
            <div style={{ background: C.light, padding: '14px 18px', border: `1px solid ${C.border}`, borderRadius: '2px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: '10px', fontWeight: 600, color: C.secondary, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '3px' }}>Patient history</p>
                  <h2 style={{ fontSize: '16px', fontWeight: 600, color: C.dark, margin: '0 0 8px' }}>
                    {activeAppointment?.patientName || 'Patient'}
                  </h2>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px' }}>
                    {[
                      { label: 'ID', value: activeAppointment?.patientIdentifier || activeAppointment?.patientId || '—' },
                      { label: 'Age', value: activeAppointment?.patientAge ? `${activeAppointment.patientAge} yrs` : '—' },
                      { label: 'Sex', value: activeAppointment?.patientGender || '—' },
                      { label: 'Prior studies', value: (patientHistory || []).length },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: 'flex', gap: '5px', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '11px', color: C.secondary }}>{label}:</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: C.dark }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Btn
                  onClick={() => fetchPatientTimeline?.(activeAppointment, appointmentId)}
                  disabled={loadingTimeline}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '5px 12px' }}
                >
                  <span style={{ display: 'inline-block', animation: loadingTimeline ? 'spin 0.8s linear infinite' : 'none' }}>↻</span>
                  Refresh
                </Btn>
              </div>
            </div>

            {/* Timeline entries */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {loadingTimeline ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '10px', color: C.secondary }}>
                  <div style={{ width: '26px', height: '26px', border: `3px solid ${C.border}`, borderTopColor: C.blue, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: '13px' }}>Loading patient history...</span>
                </div>
              ) : (patientHistory || []).length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: C.secondary, padding: '48px 0' }}>
                  <svg width="36" height="36" viewBox="0 0 16 16" fill={C.border} style={{ marginBottom: '12px' }}>
                    <path d="M5 1a2 2 0 0 0-2 2v1h10V3a2 2 0 0 0-2-2H5zm6 8H5a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1z"/><path d="M0 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v-2a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2H2a2 2 0 0 1-2-2V7z"/>
                  </svg>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: C.dark }}>No previous studies</span>
                  <span style={{ fontSize: '12px', marginTop: '4px' }}>This patient has no prior imaging records in the system.</span>
                </div>
              ) : (patientHistory || []).map((pastAppt, idx) => {
                const isExpanded = !!expandedHistoryReport?.[pastAppt.appointmentId];
                const entry = expandedHistoryReport?.[pastAppt.appointmentId];
                const statusColor = STATUS_COLOR[pastAppt.status?.toLowerCase()] || C.secondary;
                const hasReport = ['reported', 'reporting', 'completed'].includes(pastAppt.status?.toLowerCase());

                return (
                  <div key={pastAppt.appointmentId || idx} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex' }}>
                      <div style={{ width: '3px', background: statusColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, padding: '14px 18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <div>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: C.dark }}>
                              {pastAppt.dateTime ? new Date(pastAppt.dateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date N/A'}
                            </span>
                            <span style={{ fontSize: '12px', color: C.secondary, marginLeft: '8px' }}>
                              {pastAppt.dateTime ? new Date(pastAppt.dateTime).toLocaleTimeString() : ''}
                            </span>
                          </div>
                          <span style={{ background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}40`, borderRadius: '2px', padding: '2px 7px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {pastAppt.status}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '24px', marginBottom: '12px' }}>
                          {[
                            { label: 'Modality', value: pastAppt.modality || '—' },
                            { label: 'Study', value: pastAppt.service || '—' },
                            { label: 'Physician', value: pastAppt.doctor || '—' },
                          ].map(({ label, value }) => (
                            <div key={label}>
                              <div style={{ color: C.secondary, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                              <div style={{ color: C.dark, fontSize: '12px', fontWeight: 500, marginTop: '2px' }}>{value}</div>
                            </div>
                          ))}
                        </div>

                        <Btn
                          disabled={!hasReport}
                          onClick={async () => {
                            if (!hasReport || !setExpandedHistoryReport) return;
                            if (isExpanded) {
                              setExpandedHistoryReport(prev => { const n = { ...prev }; delete n[pastAppt.appointmentId]; return n; });
                              return;
                            }
                            setExpandedHistoryReport(prev => ({ ...prev, [pastAppt.appointmentId]: { loading: true } }));
                            try {
                              const res = await apiClient.get(`/Reporting/report/${pastAppt.appointmentId}`);
                              setExpandedHistoryReport(prev => ({ ...prev, [pastAppt.appointmentId]: { loading: false, data: res.data } }));
                            } catch {
                              setExpandedHistoryReport(prev => ({ ...prev, [pastAppt.appointmentId]: { loading: false, error: 'Failed to load report.' } }));
                            }
                          }}
                          style={{
                            padding: '4px 12px', fontSize: '12px',
                            background: isExpanded ? '#eff6fc' : C.white,
                            border: `1px solid ${isExpanded ? C.blue : C.border}`,
                            color: isExpanded ? C.blue : C.secondary,
                            opacity: hasReport ? 1 : 0.4,
                          }}
                        >{isExpanded ? 'Hide report' : 'View report'}</Btn>

                        {isExpanded && entry?.loading && (
                          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', color: C.secondary, fontSize: '13px' }}>
                            <div style={{ width: '14px', height: '14px', border: `2px solid ${C.border}`, borderTopColor: C.blue, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                            Loading report...
                          </div>
                        )}
                        {isExpanded && entry?.error && (
                          <div style={{ marginTop: '10px', padding: '10px 14px', background: '#fde7e9', border: '1px solid #f1abac', borderRadius: '2px', fontSize: '13px', color: C.red }}>
                            {entry.error}
                          </div>
                        )}
                        {isExpanded && entry?.data && (
                          <div style={{ marginTop: '10px', padding: '14px 16px', background: C.light, border: `1px solid ${C.border}`, borderRadius: '2px', fontSize: '13px', lineHeight: '1.7', color: C.dark }}>
                            <div dangerouslySetInnerHTML={{ __html: entry.data.findings || entry.data.findingsText }} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportingWorkspace;
