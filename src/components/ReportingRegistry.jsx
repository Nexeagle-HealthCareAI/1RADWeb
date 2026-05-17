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
    if (!editTemplate.name) return alert('Please enter a template name.');

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
      return alert(`A template with the name "${editTemplate.name}" already exists for modality "${editTemplate.modality}".`);
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
        alert('Template saved.');
        setIsTemplateDrawerOpen(false);
        fetchRegistry();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error('[TEMPLATE] Save failed', err);
      const errMsg = err.response?.data?.error || 'An unexpected error occurred while saving the template.';
      alert(errMsg);
    } finally {
      setIsTemplateSaving(false);
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Delete this template? This cannot be undone.')) return;
    try {
      await apiClient.delete(`/reporting/templates/${id}`);
      fetchRegistry();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('[TEMPLATE] Delete failed', err);
    }
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
    if (!newMacro.trigger) return alert('Please enter a trigger word.');

    // Prevent duplicate trigger word (case-insensitive check)
    const isDuplicate = keywordLibrary.some(k => {
      const kTrigger = k.trigger || k.keyword || '';
      const kId = k.id || k.Id;
      return kId !== selectedKeywordId &&
             kTrigger.trim().toLowerCase() === newMacro.trigger.trim().toLowerCase();
    });

    if (isDuplicate) {
      return alert(`A keyword with the trigger "/${newMacro.trigger}" already exists.`);
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
        alert('Keyword saved.');
        setSelectedKeywordId(null);
        fetchRegistry();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error('[KEYWORD] Save failed', err);
      const errMsg = err.response?.data?.error || 'An unexpected error occurred while saving the keyword.';
      alert(errMsg);
    } finally {
      setIsKeywordSaving(false);
    }
  };

  const handleDeleteKeyword = async (id) => {
    if (!window.confirm('DELETE MACRO?')) return;
    try {
      await apiClient.delete(`/reporting/keywords/${id}`);
      fetchRegistry();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('[KEYWORD] Delete failed', err);
    }
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
    </div>
  );
};

export default ReportingRegistry;
