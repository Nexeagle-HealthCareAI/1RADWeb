import React, { useState, useMemo, useEffect } from 'react';
import NarrativeEditor from './NarrativeEditor';
import TemplateManager from './TemplateManager';
import KeywordManager from './KeywordManager';

const ReportingRegistry = ({ 
  apiClient, 
  hospitalId, 
  doctorId,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState('Templates');
  
  // --- TEMPLATE STATES ---
  const [templates, setTemplates] = useState([]);
  const [isTemplateDrawerOpen, setIsTemplateDrawerOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState({ id: null, name: '', modality: 'X-RAY', content: '' });
  const [isTemplateSaving, setIsTemplateSaving] = useState(false);

  // --- KEYWORD STATES ---
  const [keywordLibrary, setKeywordLibrary] = useState([]);
  const [keywordSearch, setKeywordSearch] = useState('');
  const [keywordPage, setKeywordPage] = useState(1);
  const [keywordViewMode, setKeywordViewMode] = useState('registry'); // 'registry', 'table'
  const [selectedKeywordId, setSelectedKeywordId] = useState(null);
  const [newMacro, setNewMacro] = useState({ trigger: '', replacementText: '' });
  const [isKeywordSaving, setIsKeywordSaving] = useState(false);

  const [notifModal, setNotifModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });
  const showNotif = (type, title, message) => setNotifModal({ isOpen: true, type, title, message });

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

  const macroTextareaRef = React.useRef(null);

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    fetchRegistry();
    const handleResize = () => {
      const width = window.innerWidth;
      setWindowWidth(width);
      setIsMobile(width < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [hospitalId, doctorId]);

  const fetchRegistry = async () => {
    try {
      const [tRes, kRes] = await Promise.all([
        apiClient.get('/reporting/templates'),
        apiClient.get('/reporting/keywords')
      ]);
      if (tRes.data?.success) setTemplates(tRes.data.data);
      if (kRes.data?.success) setKeywordLibrary(kRes.data.data);
    } catch (err) {
      console.error('[REGISTRY] Fetch failed', err);
    }
  };

  const handleSaveTemplate = async () => {
    if (!editTemplate.name) {
      showNotif('error', 'NAME REQUIRED', 'Please enter a template name before saving.');
      return;
    }

    // Prevent duplicate template name for a given modality (case-insensitive check)
    const isDuplicate = templates.some(t => {
      const tName = t.name || t.Name || '';
      const tModality = t.modality || t.Modality || '';
      const tId = t.id || t.Id;
      return tId !== editTemplate.id &&
             tName.trim().toLowerCase() === editTemplate.name.trim().toLowerCase() &&
             tModality.trim().toUpperCase() === editTemplate.modality.trim().toUpperCase();
    });

    if (isDuplicate) {
      showNotif('warning', 'DUPLICATE TEMPLATE', `A template named "${editTemplate.name}" already exists for modality "${editTemplate.modality}". Please use a unique name.`);
      return;
    }

    setIsTemplateSaving(true);
    try {
      const payload = {
        Name: editTemplate.name,
        Modality: editTemplate.modality,
        Content: editTemplate.content,
        IsStructured: true,
        HospitalId: hospitalId,
        DoctorId: doctorId
      };
      if (editTemplate.id) payload.Id = editTemplate.id;
      
      const res = await apiClient.post('/reporting/templates/upsert', payload);
      if (res.data.success) {
        showNotif('success', 'TEMPLATE SAVED', 'Report template has been saved and is ready for use in the narrative editor.');
        setIsTemplateDrawerOpen(false);
        fetchRegistry();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error('[TEMPLATE] Save failed', err);
      const errMsg = err.response?.data?.error || 'An unexpected error occurred while saving the template.';
      showNotif('error', 'SAVE FAILED', errMsg);
    } finally {
      setIsTemplateSaving(false);
    }
  };

  const handleDeleteTemplate = (id) => {
    setConfirmModal({
      isOpen: true,
      title: 'DELETE TEMPLATE',
      message: 'Are you sure you want to delete this template? This cannot be undone.',
      onConfirm: async () => {
        try {
          await apiClient.delete(`/reporting/templates/${id}`);
          fetchRegistry();
          if (onRefresh) onRefresh();
          showNotif('success', 'TEMPLATE DELETED', 'The template has been permanently removed.');
        } catch (err) {
          console.error('[TEMPLATE] Delete failed', err);
          showNotif('error', 'DELETE FAILED', 'Could not delete the template.');
        }
      }
    });
  };

  // --- KEYWORD LOGIC ---
  const filteredKeywords = useMemo(() => 
    keywordLibrary.filter(k => 
      (k.trigger || k.keyword || '').toLowerCase().includes(keywordSearch.toLowerCase()) ||
      (k.replacementText || '').toLowerCase().includes(keywordSearch.toLowerCase())
    ), [keywordLibrary, keywordSearch]);

  const totalKeywordPages = Math.ceil(filteredKeywords.length / 10);
  const paginatedKeywords = filteredKeywords.slice((keywordPage - 1) * 10, keywordPage * 10);

  const handleSaveMacro = async () => {
    if (!newMacro.trigger) {
      showNotif('error', 'TRIGGER REQUIRED', 'Please enter a trigger word for the keyword macro.');
      return;
    }

    // Prevent duplicate trigger word (case-insensitive check)
    const isDuplicate = keywordLibrary.some(k => {
      const kTrigger = k.trigger || k.keyword || '';
      const kId = k.id || k.Id;
      return kId !== selectedKeywordId &&
             kTrigger.trim().toLowerCase() === newMacro.trigger.trim().toLowerCase();
    });

    if (isDuplicate) {
      showNotif('warning', 'DUPLICATE KEYWORD', `A keyword with the trigger "/${newMacro.trigger}" already exists. Please use a unique trigger word.`);
      return;
    }

    setIsKeywordSaving(true);
    try {
      const payload = {
        Trigger: newMacro.trigger,
        ReplacementText: newMacro.replacementText,
        Category: newMacro.category,
        HospitalId: hospitalId,
        DoctorId: doctorId
      };
      if (selectedKeywordId && selectedKeywordId !== 'new') payload.Id = selectedKeywordId;

      const res = await apiClient.post('/reporting/keywords/upsert', payload);
      if (res.data.success) {
        showNotif('success', 'KEYWORD SAVED', 'Shorthand macro has been saved and is active in the narrative editor.');
        setSelectedKeywordId(null);
        fetchRegistry();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error('[KEYWORD] Save failed', err);
      const errMsg = err.response?.data?.error || 'An unexpected error occurred while saving the keyword.';
      showNotif('error', 'SAVE FAILED', errMsg);
    } finally {
      setIsKeywordSaving(false);
    }
  };

  const handleDeleteKeyword = (id) => {
    setConfirmModal({
      isOpen: true,
      title: 'DELETE MACRO',
      message: 'Are you sure you want to delete this shorthand macro? This cannot be undone.',
      onConfirm: async () => {
        try {
          await apiClient.delete(`/reporting/keywords/${id}`);
          fetchRegistry();
          if (onRefresh) onRefresh();
          showNotif('success', 'MACRO DELETED', 'The shorthand macro has been permanently removed.');
        } catch (err) {
          console.error('[KEYWORD] Delete failed', err);
          showNotif('error', 'DELETE FAILED', 'Could not delete the macro.');
        }
      }
    });
  };

  const formatMacroText = (command) => {
    document.execCommand(command, false, null);
    if (macroTextareaRef.current) {
      setNewMacro(prev => ({ ...prev, replacementText: macroTextareaRef.current.innerHTML }));
    }
  };

  return (
    <div className="reporting-registry" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0' }}>
      {/* PROFESSIONAL TAB NAV */}
      <div style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'stretch' : 'center', 
        padding: isMobile ? '20px' : '0 40px', 
        background: 'white', 
        borderBottom: '1px solid #e2e8f0', 
        flexShrink: 0,
        gap: isMobile ? '15px' : '0'
      }}>
        <div style={{ 
          display: 'flex', 
          gap: isMobile ? '15px' : '30px',
          justifyContent: isMobile ? 'center' : 'flex-start'
        }}>
          {['Templates', 'Keywords'].map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)}
              style={{ 
                padding: '20px 0', border: 'none', background: 'transparent',
                borderBottom: activeTab === tab ? '3px solid #0f52ba' : '3px solid transparent',
                color: activeTab === tab ? '#0f52ba' : '#94a3b8',
                fontWeight: 950, fontSize: '11px', letterSpacing: '1px', cursor: 'pointer',
                transition: 'all 0.3s ease', opacity: activeTab === tab ? 1 : 0.7,
                flex: isMobile ? 1 : 'none'
              }}
            >
              {tab.toUpperCase()} REGISTRY
            </button>
          ))}
        </div>

        <button 
          onClick={() => {
            if (activeTab === 'Templates') {
              setEditTemplate({ name: '', modality: 'X-RAY', content: '' }); 
              setIsTemplateDrawerOpen(true);
            } else {
              setSelectedKeywordId('new'); 
              setNewMacro({ trigger: '', replacementText: '', category: '' });
            }
          }}
          style={{ 
            padding: '12px 24px', borderRadius: '12px', border: 'none', 
            background: 'linear-gradient(135deg, #0f52ba 0%, #061a40 100%)', color: 'white', 
            fontSize: '10px', fontWeight: 950, cursor: 'pointer',
            boxShadow: '0 8px 20px rgba(15, 82, 186, 0.2)',
            width: isMobile ? '100%' : 'auto'
          }}
        >
          {activeTab === 'Templates' ? '+ New Template' : '+ New Keyword'}
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
        {activeTab === 'Templates' && (
          <TemplateManager 
            templates={templates}
            isTemplateDrawerOpen={isTemplateDrawerOpen}
            setIsTemplateDrawerOpen={setIsTemplateDrawerOpen}
            editTemplate={editTemplate}
            setEditTemplate={setEditTemplate}
            handleSaveTemplate={handleSaveTemplate}
            handleDeleteTemplate={handleDeleteTemplate}
            isTemplateSaving={isTemplateSaving}
          />
        )}

        {activeTab === 'Keywords' && (
          <KeywordManager 
            keywords={keywordLibrary}
            keywordSearch={keywordSearch}
            setKeywordSearch={setKeywordSearch}
            selectedKeywordId={selectedKeywordId}
            setSelectedKeywordId={setSelectedKeywordId}
            newMacro={newMacro}
            setNewMacro={setNewMacro}
            handleSaveMacro={handleSaveMacro}
            handleDeleteKeyword={handleDeleteKeyword}
            isKeywordSaving={isKeywordSaving}
            formatMacroText={formatMacroText}
            macroTextareaRef={macroTextareaRef}
          />
        )}
      </div>

      {/* ── Universal Notification Modal ────────────────────────────────────── */}
      {notifModal.isOpen && (() => {
        const NOTIF_CFG = {
          success: { gradient: 'linear-gradient(135deg,#dcfce7,#bbf7d0)', iconColor: '#16a34a', border: '#bbf7d0', titleColor: '#15803d', shadow: 'rgba(22,163,74,0.22)',  icon: '✓', btnGrad: 'linear-gradient(135deg,#16a34a,#15803d)', btnShadow: 'rgba(22,163,74,0.4)'  },
          error:   { gradient: 'linear-gradient(135deg,#fee2e2,#fecaca)', iconColor: '#dc2626', border: '#fecaca', titleColor: '#991b1b', shadow: 'rgba(220,38,38,0.22)',  icon: '✕', btnGrad: 'linear-gradient(135deg,#e11d48,#be123c)', btnShadow: 'rgba(225,29,72,0.4)'  },
          warning: { gradient: 'linear-gradient(135deg,#fef3c7,#fde68a)', iconColor: '#d97706', border: '#fde68a', titleColor: '#92400e', shadow: 'rgba(217,119,6,0.22)', icon: '⚠', btnGrad: 'linear-gradient(135deg,#d97706,#b45309)', btnShadow: 'rgba(217,119,6,0.4)' },
          info:    { gradient: 'linear-gradient(135deg,#dbeafe,#bfdbfe)', iconColor: '#0f52ba', border: '#bfdbfe', titleColor: '#1e40af', shadow: 'rgba(15,82,186,0.22)', icon: 'ℹ', btnGrad: 'linear-gradient(135deg,#0f52ba,#1e40af)', btnShadow: 'rgba(15,82,186,0.4)' },
        };
        const cfg = NOTIF_CFG[notifModal.type] || NOTIF_CFG.info;
        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(10,22,40,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            onClick={() => setNotifModal(m => ({ ...m, isOpen: false }))}
          >
            <div
              style={{ width: '90%', maxWidth: '440px', background: 'linear-gradient(160deg,#ffffff 0%,#f8fafc 100%)', borderRadius: '28px', border: `1px solid ${cfg.border}`, boxShadow: `0 24px 60px -12px ${cfg.shadow}, 0 0 0 1px rgba(0,0,0,0.04)`, padding: '40px 32px 32px', textAlign: 'center', animation: 'regNoticePop 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: cfg.gradient, border: `2px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '28px', boxShadow: `0 12px 28px -8px ${cfg.shadow}` }}>
                <span style={{ color: cfg.iconColor, fontWeight: 900 }}>{cfg.icon}</span>
              </div>
              <div style={{ display: 'inline-block', background: cfg.gradient, border: `1px solid ${cfg.border}`, borderRadius: '8px', padding: '3px 12px', marginBottom: '12px' }}>
                <span style={{ fontSize: '9px', fontWeight: 950, letterSpacing: '2px', color: cfg.titleColor, fontFamily: 'system-ui,sans-serif' }}>{notifModal.type.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 950, letterSpacing: '1.5px', color: '#0f172a', marginBottom: '10px', fontFamily: 'system-ui,sans-serif' }}>{notifModal.title}</div>
              <div style={{ width: '36px', height: '3px', background: cfg.gradient, borderRadius: '99px', margin: '0 auto 14px' }} />
              <p style={{ fontSize: '13px', lineHeight: 1.7, color: '#475569', fontWeight: 500, margin: '0 0 26px', fontFamily: 'system-ui,sans-serif' }}>{notifModal.message}</p>
              <button
                onClick={() => setNotifModal(m => ({ ...m, isOpen: false }))}
                style={{ width: '100%', padding: '14px', background: cfg.btnGrad, color: 'white', border: 'none', borderRadius: '14px', fontSize: '11px', fontWeight: 950, letterSpacing: '1.5px', cursor: 'pointer', boxShadow: `0 8px 20px -6px ${cfg.btnShadow}`, fontFamily: 'system-ui,sans-serif' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              >UNDERSTOOD</button>
            </div>
            <style>{`@keyframes regNoticePop { from { transform: scale(0.88) translateY(20px); opacity: 0 } to { transform: scale(1) translateY(0); opacity: 1 } }`}</style>
          </div>
        );
      })()}

      {/* ── Universal Confirm Modal ────────────────────────────────────── */}
      {confirmModal.isOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(10,22,40,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          onClick={() => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null })}
        >
          <div
            style={{ width: '90%', maxWidth: '440px', background: 'linear-gradient(160deg,#ffffff 0%,#f8fafc 100%)', borderRadius: '28px', border: '1px solid #fecaca', boxShadow: '0 24px 60px -12px rgba(220,38,38,0.22), 0 0 0 1px rgba(0,0,0,0.04)', padding: '40px 32px 32px', textAlign: 'center', animation: 'regNoticePop 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'linear-gradient(135deg,#fee2e2,#fecaca)', border: '2px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '28px', boxShadow: '0 12px 28px -8px rgba(220,38,38,0.22)' }}>
              <span style={{ color: '#dc2626', fontWeight: 900 }}>?</span>
            </div>
            <div style={{ display: 'inline-block', background: 'linear-gradient(135deg,#fee2e2,#fecaca)', border: '1px solid #fecaca', borderRadius: '8px', padding: '3px 12px', marginBottom: '12px' }}>
              <span style={{ fontSize: '9px', fontWeight: 950, letterSpacing: '2px', color: '#991b1b', fontFamily: 'system-ui,sans-serif' }}>CONFIRMATION</span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 950, letterSpacing: '1.5px', color: '#0f172a', marginBottom: '10px', fontFamily: 'system-ui,sans-serif' }}>{confirmModal.title}</div>
            <div style={{ width: '36px', height: '3px', background: 'linear-gradient(135deg,#fee2e2,#fecaca)', borderRadius: '99px', margin: '0 auto 14px' }} />
            <p style={{ fontSize: '13px', lineHeight: 1.7, color: '#475569', fontWeight: 500, margin: '0 0 26px', fontFamily: 'system-ui,sans-serif' }}>{confirmModal.message}</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null })}
                style={{ flex: 1, padding: '14px', background: 'white', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '14px', fontSize: '11px', fontWeight: 950, letterSpacing: '1.5px', cursor: 'pointer', fontFamily: 'system-ui,sans-serif' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
              >CANCEL</button>
              <button
                onClick={() => {
                  if (confirmModal.onConfirm) confirmModal.onConfirm();
                  setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null });
                }}
                style={{ flex: 1, padding: '14px', background: 'linear-gradient(135deg,#e11d48,#be123c)', color: 'white', border: 'none', borderRadius: '14px', fontSize: '11px', fontWeight: 950, letterSpacing: '1.5px', cursor: 'pointer', boxShadow: '0 8px 20px -6px rgba(225,29,72,0.4)', fontFamily: 'system-ui,sans-serif' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              >CONFIRM</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportingRegistry;
