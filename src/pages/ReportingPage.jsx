import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import JSZip from 'jszip';
import dicomParser from 'dicom-parser';
import AdvancedDicomViewer from '../components/AdvancedDicomViewer';
import apiClient from '../api/apiClient';
import { DicomCache } from '../utils/DicomCache';
import { dicomOptimizer } from '../utils/DicomPerformanceOptimizer';
import { jwtDecode } from 'jwt-decode';

const ReportingPage = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const appointmentId = params.id || searchParams.get('id');
  const [activeTab, setActiveTab] = useState(localStorage.getItem('reporting_paradigm') || 'Structured');
  const [showKeywordDrawer, setShowKeywordDrawer] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [editorText, setEditorText] = useState('');
  const [showInlineSuggestion, setShowInlineSuggestion] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [cursorPos, setCursorPos] = useState({ top: 0, left: 0 });
  const [history, setHistory] = useState([editorText]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ 
    name: '', 
    modality: 'USG', 
    sections: []
  });
  const [keywordLibrary, setKeywordLibrary] = useState([]);
  const [tablePresets, setTablePresets] = useState([
    { id: 1, name: 'Lesion Measurement', columns: ['Lesion #', 'Location', 'Size (cm)', 'Description'] },
    { id: 2, name: 'Organ Dimensions', columns: ['Organ', 'Size (cm)', 'Echotexture', 'Contours'] }
  ]);
  const [showTableBuilder, setShowTableBuilder] = useState(false);
  const [newTable, setNewTable] = useState({ name: '', columns: [''] });
  const [showNewKeywordForm, setShowNewKeywordForm] = useState(false);
  const [newMacro, setNewMacro] = useState({ trigger: '', replacementText: '' });
  const textareaRef = useRef(null);
  const macroTextareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [selectedImg, setSelectedImg] = useState(null);
  const [imgToolbarPos, setImgToolbarPos] = useState({ top: 0, left: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templatePage, setTemplatePage] = useState(1);
  const [templateViewMode, setTemplateViewMode] = useState('registry'); // 'registry' or 'table'
  const templateItemsPerPage = 10;
  const [keywordSearch, setKeywordSearch] = useState('');
  const [keywordPage, setKeywordPage] = useState(1);
  const [keywordViewMode, setKeywordViewMode] = useState('registry'); // 'registry' or 'table'
  const keywordItemsPerPage = 10;
  const [activeAssetIndex, setActiveAssetIndex] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [currentSlice, setCurrentSlice] = useState(1);
  const [activeTool, setActiveTool] = useState('WindowLevel');
  const [activeMetadata, setActiveMetadata] = useState(null);
  const [cineEnabled, setCineEnabled] = useState(false);
  const [layoutMode, setLayoutMode] = useState('1x1');
  const [viewportProps, setViewportProps] = useState({ invert: false, flipHorizontal: false, flipVertical: false, rotation: 0 });
  const [resetTrigger, setResetTrigger] = useState(0);
  const [screenshotData, setScreenshotData] = useState(null);
  const [keyImages, setKeyImages] = useState([]);
  const [isSyncEnabled, setIsSyncEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDicomImage, setIsDicomImage] = useState(false);
  const [editorState, setEditorState] = useState('standard'); // 'standard', 'expanded', 'collapsed'
  const [editorWidth, setEditorWidth] = useState(50); // percentage
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const isResizing = useRef(false);
  const [isTablet, setIsTablet] = useState(window.innerWidth < 1100);
  const [activeWorkspaceMode, setActiveWorkspaceMode] = useState('split'); // 'split', 'dicom', 'editor'
  
  // Performance optimization states
  const [loadingProgress, setLoadingProgress] = useState({ stage: '', current: 0, total: 0 });
  const [processingStatus, setProcessingStatus] = useState('');
  
  // --- API SYNC STATES ---
  const [protocol, setProtocol] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [activeAppointment, setActiveAppointment] = useState(null);
  const [impression, setImpression] = useState('');
  const [advice, setAdvice] = useState('');
  const [isFinalized, setIsFinalized] = useState(false);
  const [structuredData, setStructuredData] = useState({});
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [selectedKeywordId, setSelectedKeywordId] = useState(null);
  const [lastFocusedField, setLastFocusedField] = useState(null); // Track focused structured field

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isIPad = /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchstart' in document;
      const isTabletSize = (width >= 768 && width <= 1366) || (height >= 768 && height <= 1366);
      
      const tablet = isTouchDevice && (isTabletSize || isIPad);
      setIsTablet(tablet);
      
      console.log('[REPORTING] Device detection:', {
        width, height, isTouchDevice, isIPad, isTabletSize, tablet,
        userAgent: navigator.userAgent
      });
      
      if (tablet && activeWorkspaceMode === 'split') {
        setActiveWorkspaceMode('editor'); // Default to editor on tablet
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [activeWorkspaceMode]);



  // --- DATA FETCHING ---
  const fetchReportingContext = useCallback(async (appId) => {
    setLoading(true);
    setError(null);
    console.info(`[1RAD] Initializing Reporting Context for AppID: ${appId}`);

    try {
      // 1. Fetch Core Patient & Case Data first to resolve context
      const appRes = await apiClient.get(`/appointments/${appId}`).catch(() => ({ data: null }));
      
      if (!appRes?.data) {
        setError("PATIENT_CONTEXT_NOT_FOUND: The requested appointment record could not be retrieved.");
        setLoading(false);
        return;
      }
      
      const appointmentData = appRes.data;
      setActiveAppointment(appointmentData);
      
      // TACTICAL RESOLUTION: Try appointment first, then Auth Token fallback
      let doctorId = appointmentData.doctorId || appointmentData.doctorUserId || appointmentData.doctor?.userId;
      
      if (!doctorId) {
        console.warn("[1RAD] Doctor ID missing in Appointment. Attempting Auth Token fallback...");
        try {
          const token = sessionStorage.getItem('1rad_token');
          if (token) {
            const decoded = jwtDecode(token);
            // Try standard OIDC claims
            doctorId = decoded.sub || decoded.nameid || decoded.UserId || decoded.id;
            console.info(`[1RAD] Resolved DoctorID from Auth Token: ${doctorId}`);
          }
        } catch (jwtErr) {
          console.error("[1RAD] Auth Token resolution failed:", jwtErr);
        }
      }

      console.info(`[1RAD] Final Context DoctorID: ${doctorId}`);

      // 2. Parallel fetch for Library and Institutional Branding
      const [templRes, keyRes, protRes, reportRes, assetRes] = await Promise.all([
        apiClient.get('/reporting/templates'),
        apiClient.get('/reporting/keywords'),
        doctorId ? apiClient.get(`/Prescription/${doctorId}`).catch(() => null) : Promise.resolve(null),
        apiClient.get(`/reporting/report/${appId}`).catch(() => ({ data: { success: false } })),
        apiClient.get(`/Study/${appId}/assets`).catch(() => ({ data: [] }))
      ]);

      if (templRes.data?.success) setTemplates(templRes.data.data);
      if (keyRes.data?.success) {
        const mapped = keyRes.data.data.map(k => ({
          ...k,
          trigger: k.trigger || k.keyword
        }));
        setKeywordLibrary(mapped);
      }
      
      if (protRes?.data?.success) {
        console.info(`[1RAD] Branding Protocol Synchronized:`, protRes.data.data);
        setProtocol(protRes.data.data);
      } else {
        console.warn(`[1RAD] Institutional Branding failed for DoctorID: ${doctorId}. Reverting to default.`);
      }
      
      if (assetRes.data && assetRes.data.length > 0) {
        console.info(`[1RAD] Found ${assetRes.data.length} existing study assets`);
        console.info(`[1RAD] Raw asset data:`, assetRes.data);
        
        const hydAssets = assetRes.data.map((asset, index) => {
          // Validate asset data
          if (!asset.blobUrl) {
            console.error(`[1RAD] Asset ${index} missing blobUrl:`, asset);
          }
          if (!asset.fileName) {
            console.warn(`[1RAD] Asset ${index} missing fileName:`, asset);
          }
          
          return {
            id: asset.id,
            name: asset.fileName || `Asset ${index + 1}`,
            type: (asset.fileType || 'unknown').toUpperCase(),
            remoteUrl: asset.blobUrl,
            needsHydration: (asset.fileType || '').toLowerCase() === 'zip',
            rawFiles: [],
            // Add debug info
            originalAsset: asset
          };
        });
        
        console.info(`[1RAD] Processed assets:`, hydAssets);
        setUploadedFiles(hydAssets);
        
        // Auto-hydrate first asset if it's a ZIP
        if (hydAssets.length > 0 && hydAssets[0].needsHydration) {
          console.info(`[1RAD] Auto-hydrating first asset: ${hydAssets[0].name}`);
          console.info(`[1RAD] Asset remoteUrl: ${hydAssets[0].remoteUrl}`);
          
          // Validate URL before attempting hydration
          if (!hydAssets[0].remoteUrl) {
            console.error(`[1RAD] Cannot hydrate asset - missing remoteUrl`);
            alert('ASSET_ERROR: Study file URL is missing. Please contact support.');
            return;
          }
          
          // Trigger hydration after state is set
          setTimeout(() => {
            setActiveAssetIndex(0);
          }, 100);
        }
      } else {
        console.info(`[1RAD] No existing study assets found`);
      }
      if (reportRes.data?.success && reportRes.data.data) {
        const r = reportRes.data.data;
        console.info(`[1RAD] Found Existing Report. Methodology: ${r.reportingMode || 'UNDEFINED'}`);

        // 1. Restore Findings Content
        if (r.findings && (r.findings.startsWith('{') || r.findings.startsWith('['))) {
          try {
            const parsed = JSON.parse(r.findings);
            setStructuredData(parsed);
            // Proactive fallback: If findings are JSON but mode is null, force Structured
            if (!r.reportingMode) r.reportingMode = 'Structured';
          } catch (e) {
            console.error("Findings Parse Error:", e);
            setEditorText(r.findings);
          }
        } else {
          setEditorText(r.findings || '');
        }
        
        // 2. Restore Reporting Paradigm (Backend takes priority)
        const finalMode = r.reportingMode || (r.findings?.startsWith('{') ? 'Structured' : 'Narrative Editor');
        console.info(`[1RAD] Reconstituting Workspace Paradigm: ${finalMode}`);
        setActiveTab(finalMode);
        
        setImpression(r.impression || '');
        setAdvice(r.advice || '');
        setIsFinalized(r.isFinalized);
        if (r.templateId) setSelectedTemplateId(r.templateId);
      } else {
        // FALLBACK: New Case. Use Global Preference from Doctor Profile
        const globalPref = protRes?.data?.data?.doctor?.preferredReportingMode || 
                           protRes?.data?.data?.preferredReportingMode || 
                           localStorage.getItem('reporting_paradigm') || 
                           'Structured';
        
        console.info(`[1RAD] New Case Detected. Applying Global Preference: ${globalPref}`);
        setActiveTab(globalPref);
      }
    } catch (err) {
      console.error('[REPORTING] Initialization failure', err);
      setError("SYSTEM_INITIALIZATION_ERROR: A critical failure occurred while preparing the diagnostic workspace. " + (err.message || "Please check your connection."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (appointmentId) {
      fetchReportingContext(appointmentId);
    }
  }, [appointmentId, fetchReportingContext]);



  const handleStructuredChange = (fieldId, value) => {
    setStructuredData(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleStructuredKeyDown = (e, fieldId) => {
    if (e.key === 'Enter') {
      const value = e.target.value;
      const cursorSlot = e.target.selectionStart;
      const textBefore = value.substring(0, cursorSlot);
      
      // Look for the last word (separated by space or newline)
      const words = textBefore.split(/[\s\n]+/);
      const lastWord = words[words.length - 1].trim().toLowerCase();
      
      if (lastWord) {
        const macro = keywordLibrary.find(k => k.trigger.toLowerCase() === lastWord);
        
        if (macro) {
          e.preventDefault();
          const replacement = macro.replacementText.replace(/<[^>]*>?/gm, ''); // Strip HTML for textarea
          
          // Calculate where the last word started
          const lastWordStart = textBefore.lastIndexOf(lastWord);
          if (lastWordStart !== -1) {
            const newValue = value.substring(0, lastWordStart) + replacement + value.substring(cursorSlot);
            handleStructuredChange(fieldId, newValue);
            
            // Tactical: Reset cursor after state update
            setTimeout(() => {
              e.target.selectionStart = e.target.selectionEnd = lastWordStart + replacement.length;
            }, 0);
          }
        }
      }
    }
  };

  const renderDynamicFields = (template) => {
    if (!template) return null;
    try {
      // Handle both casing possibilities from the API
      const rawContent = template.content || template.Content || '[]';
      const sections = JSON.parse(rawContent);
      
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', gridColumn: '1 / -1' }}>
          {sections.map((section, idx) => (
            <div key={section.id || idx} className="struct-section">
              <div className="struct-header">
                <span>{section.title?.toUpperCase() || 'CLINICAL_FINDINGS'}</span>
                <span className={`status-indicator ${structuredData[section.title] ? '' : 'status-empty'}`}></span>
              </div>
              <textarea 
                className="struct-textarea"
                placeholder={`Enter observations for ${section.title || 'this section'}...`}
                value={structuredData[section.title] || ''}
                onFocus={() => setLastFocusedField(section.title)}
                onKeyDown={(e) => handleStructuredKeyDown(e, section.title)}
                onChange={(e) => handleStructuredChange(section.title, e.target.value)}
                style={{ minHeight: '100px' }}
              />
            </div>
          ))}
        </div>
      );
    } catch (e) {
      console.error('[STRUCTURED] Schema Parse Error:', e);
      return <div style={{ color: '#ef4444', fontSize: '12px', padding: '20px', background: '#fef2f2', borderRadius: '12px', border: '1px solid #fee2e2' }}>
        [ CONFIGURATION ERROR: Invalid Template Schema ]
        <div style={{ fontSize: '10px', marginTop: '5px', opacity: 0.7 }}>Ensure your protocol content is valid JSON.</div>
      </div>;
    }
  };
  const handleSaveReport = async (finalizing = false) => {
    if (!appointmentId) {
      alert('APPOINTMENT CONTEXT MISSING: Cannot save report.');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        appointmentId: appointmentId,
        templateId: selectedTemplateId,
        findings: activeTab === 'Structured' ? JSON.stringify(structuredData) : editorText,
        impression: impression || (activeTab === 'Structured' ? (structuredData['Impression'] || structuredData['IMPRESSION'] || '') : ''),
        advice: advice || '',
        isFinalized: finalizing,
        reportingMode: activeTab
      };

      const res = await apiClient.post('/reporting/save', payload);
      if (res.data?.success) {
        alert(finalizing ? 'STRATEGIC DISPATCH COMPLETE: Report finalized.' : 'DRAFT PERSISTED: Changes saved.');
        if (finalizing) {
          setIsFinalized(true);
          navigate('/doctor-board');
        }
      }
    } catch (err) {
      alert(`SAVE FAILURE: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTabChange = async (tab) => {
    setActiveTab(tab);
    localStorage.setItem('reporting_paradigm', tab);
    
    // Global Synchronization: Update user's backend preference
    try {
      await apiClient.patch('/personnel/preferences', {
        preferenceKey: 'ReportingMode',
        preferenceValue: tab
      });
      console.info(`[1RAD] Global Preference Saved: ${tab}`);
    } catch (err) {
      console.warn('[1RAD] Global Preference Sync Failed:', err);
    }
  };

  const handleSaveTemplate = async () => {
    try {
      const payload = {
        Name: newTemplate.name,
        Modality: newTemplate.modality,
        Description: `Custom ${newTemplate.modality} Template`,
        Content: JSON.stringify(newTemplate.sections),
        IsStructured: true,
        DoctorId: protocol?.doctorId || activeAppointment?.doctorId,
        HospitalId: protocol?.hospitalId || activeAppointment?.hospitalId
      };
      
      if (selectedTemplateId && selectedTemplateId !== 'new') {
        payload.Id = selectedTemplateId;
      }
      
      console.log('[TEMPLATE] Upserting payload:', payload);

      const res = await apiClient.post('/reporting/templates/upsert', payload);
      if (res.data.success) {
        alert('TEMPLATE PUBLISHED: Added to clinical library.');
        setSelectedTemplateId(null);
        fetchReportingContext(appointmentId);
      }
    } catch (err) {
      console.error('[TEMPLATE] Save failed', err.response?.data);
      alert(`TEMPLATE SAVE FAILURE: ${err.response?.data?.errors?.HospitalId?.[0] || err.response?.data?.title || 'Validation Error'}`);
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      await apiClient.delete(`/reporting/templates/${id}`);
      fetchReportingContext(appointmentId);
    } catch (err) {
      alert('DELETE FAILURE');
    }
  };

  // Sync Macro Architect narrative
  useEffect(() => {
    if (selectedKeywordId && macroTextareaRef.current) {
      macroTextareaRef.current.innerHTML = newMacro.replacementText || '';
    }
  }, [selectedKeywordId]);

  const handleSaveMacro = async () => {
    try {
      const payload = {
        Trigger: newMacro.trigger,
        ReplacementText: newMacro.replacementText,
        DoctorId: protocol?.doctorId || activeAppointment?.doctorId,
        HospitalId: protocol?.hospitalId || activeAppointment?.hospitalId
      };

      if (selectedKeywordId && selectedKeywordId !== 'new') {
        payload.Id = selectedKeywordId;
      }

      console.log('[MACRO] Upserting payload:', payload);

      const res = await apiClient.post('/reporting/keywords/upsert', payload);
      if (res.data.success) {
        alert('MACRO SYNCHRONIZED: Available for shorthand entry.');
        setSelectedKeywordId(null);
        fetchReportingContext(appointmentId);
      }
    } catch (err) {
      console.error('[MACRO] Save failed', err.response?.data);
      alert(`MACRO SAVE FAILURE: ${err.response?.data?.errors?.Trigger?.[0] || err.response?.data?.title || 'Validation Error'}`);
    }
  };

  const handleDeleteKeyword = async (id) => {
    if (!window.confirm('Delete this macro shortcut?')) return;
    try {
      console.log('[MACRO] Attempting to delete ID:', id);
      const res = await apiClient.delete(`/reporting/keywords/${id}`);
      
      // If status is in the 200 range, we reset the UI regardless of the body content
      if (res.status >= 200 && res.status < 300) {
        setSelectedKeywordId(null);
        setNewMacro({ trigger: '', replacementText: '' });
        
        // Use a timeout or immediate call to refresh the list
        fetchReportingContext(appointmentId);
        console.log('[MACRO] Delete successful, UI reset enforced.');
      }
    } catch (err) {
      console.error('[MACRO] Delete failed', err.response?.data || err);
      alert(`DELETE FAILURE: ${err.response?.data?.error || 'Macro could not be removed.'}`);
    }
  };

  const handleApplyTemplate = (template) => {
    setSelectedTemplateId(template.id);
    setActiveTab('Structured');
    try {
      const rawContent = template.content || template.Content || '[]';
      const sections = JSON.parse(rawContent);
      const initialData = {};
      sections.forEach(s => {
        initialData[s.title] = s.content || '';
      });
      setStructuredData(initialData);
    } catch (e) {
      setEditorText(template.content || template.Content || '');
      setActiveTab('Narrative Editor');
    }
  };

  const handleApplyKeyword = (macro) => {
    const textToInsert = macro.replacementText || '';
    
    if (activeTab === 'Narrative Editor') {
      insertContent(textToInsert);
    } else if (activeTab === 'Structured') {
      if (lastFocusedField) {
        setStructuredData(prev => ({
          ...prev,
          [lastFocusedField]: (prev[lastFocusedField] ? prev[lastFocusedField] + '\n' : '') + textToInsert.replace(/<[^>]*>?/gm, '')
        }));
      } else {
        alert('Please focus a clinical section (click in a textarea) before applying a keyword.');
      }
    } else {
      alert(`KEYWORD: "${macro.trigger || ''}" copied to clipboard.`);
      navigator.clipboard.writeText(textToInsert.replace(/<[^>]*>?/gm, ''));
    }
  };

  // --- DICOM HANDLERS ---
  const toggleKeyImage = () => {
    const key = `${activeAssetIndex}_${currentSlice}`;
    setKeyImages(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
    
    if (isZip) {
      setLoading(true);
      setProcessingStatus('Initializing optimized DICOM processor...');
      
      try {
        // Use optimized processor for ZIP files
        const classifiedAssets = await dicomOptimizer.processZipFileOptimized(
          file,
          (progress) => {
            setLoadingProgress(progress);
            setProcessingStatus(`${progress.stage}: ${progress.current}/${progress.total} files${progress.seriesCount ? ` (${progress.seriesCount} series found)` : ''}`);
          },
          (seriesInfo) => {
            console.log(`[REPORTING] New series discovered: ${seriesInfo.seriesDesc}`);
          }
        );
        
        const assets = classifiedAssets.map(series => ({
          name: `${series.patientName} - ${series.seriesDesc}`,
          rawFiles: series.files,
          size: `${series.files.length} slices`,
          seriesUID: series.seriesUID,
          modality: series.modality
        }));
        
        setUploadedFiles(assets);
        setIsDicomImage(true);
      } catch (err) {
        console.error('Optimized ZIP load failed', err);
        setProcessingStatus(`Error: ${err.message}`);
        alert('Failed to process ZIP file: ' + err.message);
      } finally {
        setLoading(false);
        setProcessingStatus('');
        setLoadingProgress({ stage: '', current: 0, total: 0 });
      }
    }
  };

  const testAssetConnection = async (asset) => {
    try {
      console.log(`[DICOM_TEST] Testing connection to: ${asset.remoteUrl}`);
      
      // First try a HEAD request to check if the resource exists
      const headResponse = await fetch(asset.remoteUrl, { 
        method: 'HEAD',
        credentials: 'same-origin'
      });
      
      console.log(`[DICOM_TEST] HEAD response:`, {
        status: headResponse.status,
        statusText: headResponse.statusText,
        ok: headResponse.ok,
        headers: Object.fromEntries(headResponse.headers.entries())
      });
      
      if (headResponse.ok) {
        const contentLength = headResponse.headers.get('content-length');
        const contentType = headResponse.headers.get('content-type');
        
        console.log(`[DICOM_TEST] Asset is accessible:`, {
          size: contentLength ? `${(parseInt(contentLength) / (1024*1024)).toFixed(2)} MB` : 'Unknown',
          type: contentType || 'Unknown'
        });
        
        return { success: true, size: contentLength, type: contentType };
      } else {
        return { success: false, error: `HTTP ${headResponse.status}: ${headResponse.statusText}` };
      }
      
    } catch (error) {
      console.error(`[DICOM_TEST] Connection test failed:`, error);
      return { success: false, error: error.message };
    }
  };

  const hydrateZipAsset = async (index) => {
    const asset = uploadedFiles[index];
    if (!asset || !asset.needsHydration || !asset.remoteUrl || asset.rawFiles?.length > 0) return;

    setLoading(true);
    setProcessingStatus('Initializing optimized DICOM processor...');
    
    try {
      // TACTICAL CACHE CHECK
      console.log(`[DICOM_LOAD] Checking persistent cache for asset: ${asset.id}`);
      let cachedData;
      try {
        cachedData = await DicomCache.get(asset.id);
      } catch (cacheError) {
        console.warn(`[DICOM_LOAD] Cache retrieval failed (non-critical):`, cacheError);
        cachedData = null;
      }
      
      if (cachedData && cachedData.series?.length > 0) {
        console.log(`[DICOM_LOAD] Cache HIT for ${asset.id}. Restoring ${cachedData.series.length} series.`);
        setProcessingStatus('Restoring from cache...');
        
        const hydratedFromCache = cachedData.series.map(s => ({
          ...asset,
          name: s.name,
          rawFiles: s.rawFiles, // Blobs are automatically handled by IndexedDB
          needsHydration: false
        }));

        setUploadedFiles(prev => {
          const newFiles = [...prev];
          newFiles.splice(index, 1, ...hydratedFromCache);
          return newFiles;
        });
        setIsDicomImage(true);
        setLoading(false);
        setProcessingStatus('');
        return;
      }

      console.log(`[DICOM_LOAD] Cache MISS. Initializing optimized hydration for asset: ${asset.name}`);
      console.log(`[DICOM_LOAD] Asset details:`, {
        id: asset.id,
        name: asset.name,
        remoteUrl: asset.remoteUrl,
        needsHydration: asset.needsHydration
      });
      
      setProcessingStatus('Downloading study data...');
      
      // Validate URL before fetching
      if (!asset.remoteUrl) {
        throw new Error('MISSING_URL: Asset remote URL is not available. Please check the asset configuration.');
      }
      
      // Test connection first
      console.log(`[DICOM_LOAD] Testing asset connectivity...`);
      const connectionTest = await testAssetConnection(asset);
      
      if (!connectionTest.success) {
        throw new Error(`CONNECTION_TEST_FAILED: ${connectionTest.error}`);
      }
      
      console.log(`[DICOM_LOAD] Connection test passed, proceeding with download...`);
      
      // Check if URL is accessible with retry mechanism
      let response;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount <= maxRetries) {
        try {
          console.log(`[DICOM_LOAD] Attempt ${retryCount + 1}/${maxRetries + 1} - Fetching: ${asset.remoteUrl}`);
          
          response = await fetch(asset.remoteUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/zip, application/octet-stream, */*',
            },
            // Add credentials if needed for authenticated endpoints
            credentials: 'same-origin'
          });
          
          console.log(`[DICOM_LOAD] Fetch response (attempt ${retryCount + 1}):`, {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries())
          });
          
          if (response.ok) {
            break; // Success, exit retry loop
          } else if (retryCount < maxRetries && (response.status >= 500 || response.status === 429)) {
            // Retry on server errors or rate limiting
            console.warn(`[DICOM_LOAD] Retryable error ${response.status}, waiting before retry...`);
            await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000)); // Exponential backoff
            retryCount++;
            continue;
          } else {
            // Non-retryable error, break and handle below
            break;
          }
          
        } catch (fetchError) {
          console.error(`[DICOM_LOAD] Fetch error (attempt ${retryCount + 1}):`, fetchError);
          
          if (retryCount < maxRetries) {
            console.warn(`[DICOM_LOAD] Network error, retrying in ${(retryCount + 1) * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
            retryCount++;
            continue;
          } else {
            throw new Error(`NETWORK_ERROR: Unable to download study data after ${maxRetries + 1} attempts. ${fetchError.message}`);
          }
        }
      }
      
      if (!response.ok) {
        const errorDetails = {
          status: response.status,
          statusText: response.statusText,
          url: asset.remoteUrl
        };
        console.error(`[DICOM_LOAD] HTTP Error:`, errorDetails);
        
        if (response.status === 404) {
          throw new Error(`FILE_NOT_FOUND: The study file is no longer available on the server (HTTP 404).`);
        } else if (response.status === 403) {
          throw new Error(`ACCESS_DENIED: You don't have permission to access this study file (HTTP 403).`);
        } else if (response.status === 500) {
          throw new Error(`SERVER_ERROR: The server encountered an error while retrieving the study (HTTP 500).`);
        } else {
          throw new Error(`HTTP_ERROR: Server returned ${response.status} ${response.statusText} when fetching study data.`);
        }
      }
      
      let blob;
      try {
        blob = await response.blob();
        console.log(`[DICOM_LOAD] Binary stream received. Size: ${(blob.size / (1024*1024)).toFixed(2)} MB. Content-Type: ${blob.type}`);
        
        if (blob.size === 0) {
          throw new Error('EMPTY_FILE: The downloaded study file is empty (0 bytes).');
        }
        
      } catch (blobError) {
        console.error(`[DICOM_LOAD] Blob conversion error:`, blobError);
        throw new Error(`DATA_CONVERSION_ERROR: Failed to process downloaded study data. ${blobError.message}`);
      }
      
      // Use optimized processor with progress tracking and corruption detection
      let result;
      try {
        console.log(`[DICOM_LOAD] Starting DICOM processing...`);
        result = await dicomOptimizer.processZipFileOptimized(
          blob,
          (progress) => {
            setLoadingProgress(progress);
            const statusParts = [`${progress.stage}: ${progress.current}/${progress.total} files`];
            if (progress.seriesCount) statusParts.push(`(${progress.seriesCount} series found)`);
            if (progress.corruptedFiles > 0) statusParts.push(`⚠️ ${progress.corruptedFiles} corrupted`);
            setProcessingStatus(statusParts.join(' '));
          },
          (seriesInfo) => {
            console.log(`[DICOM_LOAD] New series discovered: ${seriesInfo.seriesDesc}`);
          }
        );
        
        if (!result || !result.series) {
          throw new Error('PROCESSING_FAILED: DICOM processor returned invalid result.');
        }
        
      } catch (processingError) {
        console.error(`[DICOM_LOAD] Processing error:`, processingError);
        throw new Error(`DICOM_PROCESSING_ERROR: Failed to process study files. ${processingError.message}`);
      }

      const classifiedAssets = result.series;
      const stats = result.stats;

      // Log statistics
      console.log(`[DICOM_LOAD] Processing statistics:`, stats);
      
      // Show warning if corrupted files were found
      if (stats.corruptedFiles > 0) {
        console.warn(`[DICOM_LOAD] ⚠️ Eliminated ${stats.corruptedFiles} corrupted files from study`);
        setProcessingStatus(`✅ Loaded ${stats.validFiles} valid files (eliminated ${stats.corruptedFiles} corrupted)`);
        
        // Show user notification
        setTimeout(() => {
          if (stats.corruptedFiles > 0) {
            alert(`Study loaded successfully!\n\n✅ Valid files: ${stats.validFiles}\n⚠️ Corrupted files eliminated: ${stats.corruptedFiles}\n\nCorrupted files have been automatically removed to ensure optimal viewing.`);
          }
        }, 1000);
      }

      const finalAssets = classifiedAssets.map(series => ({
        ...asset,
        name: `${series.patientName} - ${series.seriesDesc}`,
        rawFiles: series.files,
        needsHydration: false,
        seriesUID: series.seriesUID,
        modality: series.modality,
        stats: {
          totalFiles: stats.totalFiles,
          validFiles: stats.validFiles,
          corruptedFiles: stats.corruptedFiles
        }
      }));

      console.log(`[DICOM_LOAD] Optimized processing complete. Discovered ${finalAssets.length} valid diagnostic series.`);

      // TACTICAL CACHE STORAGE
      if (finalAssets.length > 0) {
        try {
          setProcessingStatus('Caching for future use...');
          const cachePayload = {
            ...asset,
            series: finalAssets.map(ca => ({ name: ca.name, rawFiles: ca.rawFiles, seriesUID: ca.seriesUID }))
          };
          await DicomCache.set(asset.id, cachePayload);
          console.log(`[DICOM_LOAD] Asset ${asset.id} persisted to persistent cache.`);
        } catch (cacheError) {
          console.warn(`[DICOM_LOAD] Cache storage failed (non-critical):`, cacheError);
          // Don't throw error for cache failures, just log warning
        }
      }

      setUploadedFiles(prev => {
        const newFiles = [...prev];
        if (finalAssets.length > 0) {
          newFiles.splice(index, 1, ...finalAssets);
        } else {
          console.warn('[DICOM_LOAD] No valid DICOM series found in ZIP container.');
          newFiles[index] = { ...asset, needsHydration: false, rawFiles: [] };
        }
        return newFiles;
      });
      setIsDicomImage(true);
    } catch (err) {
      console.error('[DICOM_LOAD] Optimized hydration failure', err);
      setProcessingStatus(`Error: ${err.message}`);
      
      // Provide user-friendly error messages based on error type
      let userMessage = 'DIAGNOSTIC SIGNAL FAILURE: ';
      
      if (err.message.includes('NETWORK_ERROR') || err.message.includes('Failed to fetch')) {
        userMessage += 'Unable to download study data. Please check your internet connection and try again.';
      } else if (err.message.includes('FILE_NOT_FOUND')) {
        userMessage += 'The study file is no longer available. It may have been moved or deleted.';
      } else if (err.message.includes('ACCESS_DENIED')) {
        userMessage += 'Access denied. Please check your permissions or contact your administrator.';
      } else if (err.message.includes('EMPTY_FILE')) {
        userMessage += 'The study file appears to be empty or corrupted.';
      } else if (err.message.includes('DICOM_PROCESSING_ERROR')) {
        userMessage += 'Failed to process DICOM files. The study may contain unsupported formats.';
      } else {
        userMessage += err.message;
      }
      
      // Show detailed error in console for debugging
      console.error('[DICOM_LOAD] Full error details:', {
        message: err.message,
        stack: err.stack,
        asset: {
          id: asset?.id,
          name: asset?.name,
          remoteUrl: asset?.remoteUrl
        }
      });
      
      alert(userMessage);
    } finally {
      setLoading(false);
      setProcessingStatus('');
      setLoadingProgress({ stage: '', current: 0, total: 0 });
    }
  };

  useEffect(() => {
    if (uploadedFiles[activeAssetIndex]?.needsHydration) {
      hydrateZipAsset(activeAssetIndex);
    }
  }, [activeAssetIndex, uploadedFiles]);



  const undo = () => {
    if (history && historyIndex > 0) {
      const prev = history[historyIndex - 1];
      if (prev !== undefined) {
        setHistoryIndex(historyIndex - 1);
        setEditorText(prev);
        if (textareaRef.current) textareaRef.current.innerHTML = prev;
      }
    }
  };

  const redo = () => {
    if (history && historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      if (next !== undefined) {
        setHistoryIndex(historyIndex + 1);
        setEditorText(next);
        if (textareaRef.current) textareaRef.current.innerHTML = next;
      }
    }
  };

  const formatText = (style) => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    if (style === 'bold') document.execCommand('bold', false, null);
    else if (style === 'italic') document.execCommand('italic', false, null);
    else if (style === 'underline') document.execCommand('underline', false, null);
    else if (style === 'h1') document.execCommand('formatBlock', false, '<h1>');
    else if (style === 'list') document.execCommand('insertUnorderedList', false, null);
    else if (style === 'list-num') document.execCommand('insertOrderedList', false, null);
    else if (style.startsWith('fontName:')) {
      const font = style.split(':')[1];
      document.execCommand('fontName', false, font);
    }
    else if (style.startsWith('fontSize:')) {
      const size = style.split(':')[1];
      document.execCommand('fontSize', false, size);
    }
    else if (style.startsWith('color:')) {
      const color = style.split(':')[1];
      document.execCommand('foreColor', false, color);
    }
    else if (style.startsWith('hilite:')) {
      const color = style.split(':')[1];
      document.execCommand('hiliteColor', false, color);
    }
    setEditorText(el.innerHTML);
  };
  const insertContent = (content) => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    
    let htmlContent = content;
    // Check if content is a Markdown-style table and convert to real HTML
    if (content.trim().startsWith('|')) {
      const rows = content.trim().split('\n').filter(r => !r.includes('---') && r.trim() !== '');
      htmlContent = `<table style="width:100%; border-collapse: collapse; margin: 15px 0; border: 1px solid #e2e8f0;">` + 
        rows.map((row, i) => {
          const cells = row.split('|').filter(c => c.trim() !== '' || row.indexOf('|') !== row.lastIndexOf('|'));
          const tag = i === 0 ? 'th' : 'td';
          return `<tr>${cells.map(c => `<${tag} style="border: 1px solid #e2e8f0; padding: 10px; background: ${i === 0 ? '#f8fafc' : '#fff'}; text-align: left;">${c.trim() || '&nbsp;'}</${tag}>`).join('')}</tr>`;
        }).join('') + 
        `</table><p>&nbsp;</p>`;
    } else {
      htmlContent = content.replace(/\n/g, '<br>');
    }

    document.execCommand('insertHTML', false, htmlContent);
    setEditorText(el.innerHTML);
  };

  // Initialize content once
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.innerHTML = editorText;
    }
  }, []);

  const handleEditorChange = (e) => {
    const html = e.currentTarget.innerHTML || '';
    setEditorText(html);
    
    // Save to history (debounce-ish)
    if (history && Math.abs(html.length - (history[historyIndex]?.length || 0)) > 10) {
      const newHistory = (history || []).slice(0, historyIndex + 1);
      newHistory.push(html);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  };

  const toggleFullscreen = () => {
    const container = document.querySelector('.panel-right');
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(err => {
        console.error(`Error: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Sync state if user exits via Escape key
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // --- PAGINATION & FILTERING LOGIC ---
  const filteredTemplates = (templates || []).filter(t => 
    t.Name?.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.Modality?.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.name?.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.modality?.toLowerCase().includes(templateSearch.toLowerCase())
  );
  const totalTemplatePages = Math.ceil(filteredTemplates.length / templateItemsPerPage);
  const paginatedTemplates = filteredTemplates.slice((templatePage - 1) * templateItemsPerPage, templatePage * templateItemsPerPage);

  const filteredKeywords = (keywordLibrary || []).filter(k => 
    (k.trigger || '').toLowerCase().includes(keywordSearch.toLowerCase()) ||
    (k.replacementText || '').toLowerCase().includes(keywordSearch.toLowerCase())
  );
  const totalKeywordPages = Math.ceil(filteredKeywords.length / keywordItemsPerPage);
  const paginatedKeywords = filteredKeywords.slice((keywordPage - 1) * keywordItemsPerPage, keywordPage * keywordItemsPerPage);

  const handleSuggestionSelect = () => {
    insertContent('Gall bladder shows echogenic calculi with posterior acoustic shadowing. No pericholecystic fluid is seen.');
    setShowInlineSuggestion(false);
  };

  const handlePreviewPrint = async () => {
    console.log("[1RAD] handlePreviewPrint triggered. Active Appointment:", activeAppointment);
    
    // 1. Ensure we have the doctor context (Cascading resolution)
    let doctorId = activeAppointment?.doctorId || activeAppointment?.doctorUserId || activeAppointment?.doctor?.userId;
    
    if (!doctorId) {
      try {
        const token = sessionStorage.getItem('1rad_token');
        if (token) {
          const decoded = jwtDecode(token);
          doctorId = decoded.sub || decoded.nameid || decoded.UserId || decoded.id;
        }
      } catch (e) {}
    }

    if (doctorId) {
      try {
        console.info(`[1RAD] Attempting to fetch Branding Protocol for Doctor: ${doctorId}`);
        const res = await apiClient.get(`/Prescription/${doctorId}`);
        console.log("[1RAD] Prescription API Response:", res.data);
        
        if (res.data?.success) {
          setProtocol(res.data.data);
          console.info("[1RAD] Branding Protocol Refreshed. Letterhead URL:", res.data.data?.letterheadBlobUrl);
        } else {
          console.warn("[1RAD] API returned success:false or empty data", res.data);
        }
      } catch (err) {
        console.error("[1RAD] Real-time Branding Sync failed critically:", err);
      }
    } else {
      console.error("[1RAD] FAILED_TO_RESOLVE_DOCTOR_CONTEXT: No Doctor ID found in appointment record.");
      // alert("REPORTING_CONTEXT_ERROR: Could not resolve doctor branding. Using default layout.");
    }

    // 2. Open the preview
    setIsPreviewOpen(true);
  };

  const renderPreviewModal = () => {
    if (!isPreviewOpen) return null;

    let bodyContent = '';
    // Use institutional font settings for content
    const contentStyle = `font-size: ${protocol?.fontSize || 12}px; line-height: 1.6; color: ${protocol?.fontColor || '#1e293b'}; font-family: ${protocol?.fontFamily || 'inherit'};`;

    if (activeTab === 'Structured') {
      bodyContent = Object.entries(structuredData).map(([key, val]) => `
        <div style="margin-bottom: 25px; page-break-inside: avoid;">
          <div style="font-size: 10px; font-weight: 950; color: #64748b; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 1.5px; border-bottom: 1px solid #f1f5f9; padding-bottom: 2px;">${key.replace(/_/g, ' ')}</div>
          <div style="${contentStyle} white-space: pre-wrap;">${val}</div>
        </div>
      `).join('');
    } else {
      bodyContent = `<div style="${contentStyle}">${editorText}</div>`;
    }

    // Surgical Margin Resolution (mm to style)
    const m = {
      top: (protocol?.headerMargin || 40) + 'mm',
      left: (protocol?.leftMargin || 20) + 'mm',
      right: (protocol?.rightMargin || 20) + 'mm',
      bottom: (protocol?.bottomMargin || 20) + 'mm'
    };

    return (
      <div className="modal-overlay" style={{ background: 'rgba(10, 22, 40, 0.98)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', inset: 0, padding: '40px', backdropFilter: 'blur(10px)' }}>
        <div style={{ width: '950px', height: '100%', background: '#f8fafc', borderRadius: '32px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ padding: '25px 40px', background: '#0a1628', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
               <div style={{ width: '40px', height: '40px', background: '#0f52ba', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>📄</div>
               <div>
                <h3 style={{ fontSize: '13px', fontWeight: 950, letterSpacing: '2px', margin: 0, color: '#60a5fa' }}>DIAGNOSTIC_REPORT_PREVIEW</h3>
                <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '2px' }}>Protocol: {protocol ? 'INSTITUTIONAL_READY' : 'DEFAULT_LAYOUT'} • Mode: {activeTab.toUpperCase()}</div>
               </div>
            </div>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button className="btn btn-primary" style={{ background: '#0f52ba', border: 'none', padding: '12px 25px', borderRadius: '12px', fontWeight: 900 }} onClick={() => window.print()}>🖨️ PRINT_FINAL</button>
              <button onClick={() => setIsPreviewOpen(false)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '12px 25px', borderRadius: '12px', cursor: 'pointer', fontWeight: 900 }}>CLOSE</button>
            </div>
          </div>
          
          <div style={{ flex: 1, padding: '40px', background: '#e2e8f0', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
            <div id="printable-report" style={{ 
              width: '210mm', 
              minHeight: '297mm', 
              background: 'white', 
              boxShadow: '0 30px 60px rgba(0,0,0,0.15)', 
              color: protocol?.fontColor || '#1e293b',
              fontFamily: protocol?.fontFamily || 'Arial, sans-serif',
              position: 'relative',
              overflow: 'hidden'
            }}>
              
              {/* WATERMARK FOR NON-FINALIZED */}
              {!isFinalized && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-45deg)', fontSize: '120px', color: 'rgba(241, 245, 249, 0.4)', fontWeight: 950, pointerEvents: 'none', zIndex: 1, letterSpacing: '20px', whiteSpace: 'nowrap' }}>
                   DRAFT_PREVIEW
                </div>
              )}

                {/* Letterhead Layer (Z-Index 1: Foundation) */}
                {protocol?.letterheadBlobUrl && (
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' }}>
                    { (protocol.letterheadBlobUrl.toLowerCase().includes('.pdf') || protocol.letterheadBlobUrl.includes('type=pdf')) ? (
                      <iframe 
                        src={`${protocol.letterheadBlobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        title="Institutional Letterhead"
                      />
                    ) : (
                      <div style={{ 
                        width: '100%', 
                        height: '100%', 
                        backgroundImage: `url(${protocol.letterheadBlobUrl})`,
                        backgroundSize: '100% 100%',
                        backgroundRepeat: 'no-repeat'
                      }}></div>
                    )
                    }
                  </div>
                )}

                {/* REPORT CONTENT OVERLAY */}
                <div style={{ 
                  position: 'relative',
                  zIndex: 2,
                  paddingTop: m.top, 
                  paddingLeft: m.left, 
                  paddingRight: m.right, 
                  paddingBottom: m.bottom,
                  boxSizing: 'border-box',
                  minHeight: '297mm',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  {/* Patient Information Matrix */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0', background: '#fff', borderRadius: '4px', marginBottom: '35px', border: '1px solid #f1f5f9', fontSize: '11px' }}>
                    <div style={{ padding: '10px', borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>PATIENT NAME</span> <br/><strong style={{fontSize: '12px'}}>{activeAppointment?.patientName?.toUpperCase() || ''}</strong></div>
                    <div style={{ padding: '10px', borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>AGE / SEX</span> <br/><strong>{activeAppointment?.patientAge || ''} / {activeAppointment?.patientGender || ''}</strong></div>
                    <div style={{ padding: '10px', borderBottom: '1px solid #f1f5f9' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>PATIENT ID</span> <br/><strong>{activeAppointment?.patientIdentifier || ''}</strong></div>
                    <div style={{ padding: '10px', borderRight: '1px solid #f1f5f9' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>STUDY TYPE</span> <br/><strong>{activeAppointment?.service || ''}</strong></div>
                    <div style={{ padding: '10px', borderRight: '1px solid #f1f5f9' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>DATE</span> <br/><strong>{activeAppointment?.dateTime ? new Date(activeAppointment.dateTime).toLocaleDateString() : ''}</strong></div>
                    <div style={{ padding: '10px' }}><span style={{color: '#94a3b8', fontSize: '8px', fontWeight: 900}}>REFERRED BY</span> <br/><strong>{activeAppointment?.referredBy || ''}</strong></div>
                  </div>

                  {/* Report Findings Matrix */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '10px', fontWeight: 950, color: protocol?.fontColor || '#0f52ba', marginBottom: '12px', letterSpacing: '1px', borderBottom: '1px solid rgba(15, 82, 186, 0.1)', paddingBottom: '4px' }}>CLINICAL FINDINGS:</div>
                    <div dangerouslySetInnerHTML={{ __html: bodyContent }} />
                    
                    {/* Final Conclusion (Impression) */}
                    {impression && (
                      <div style={{ marginTop: '35px', background: 'rgba(15, 82, 186, 0.02)', padding: '15px 20px', borderRadius: '6px', borderLeft: `4px solid ${protocol?.fontColor || '#0f52ba'}` }}>
                        <div style={{ fontSize: '10px', fontWeight: 950, color: protocol?.fontColor || '#0f52ba', marginBottom: '6px', letterSpacing: '1px' }}>IMPRESSION:</div>
                        <div style={{ 
                          fontSize: (protocol?.fontSize || 13) + 'px', 
                          fontWeight: 900, 
                          color: protocol?.fontColor || '#1e293b',
                          lineHeight: '1.5'
                        }}>
                          {impression}
                        </div>
                      </div>
                    )}
                    
                    {/* Clinical Advice */}
                    {advice && (
                      <div style={{ marginTop: '20px', paddingLeft: '20px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', marginBottom: '4px', letterSpacing: '1px' }}>ADVICE:</div>
                        <div style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic' }}>{advice}</div>
                      </div>
                    )}
                  </div>

                  {/* Professional Signatory Block */}
                  <div style={{ marginTop: '60px', display: 'flex', justifyContent: 'flex-end' }}>
                     <div style={{ textAlign: 'center' }}>
                        <div style={{ width: '200px', borderBottom: `1px solid ${protocol?.fontColor || '#1e293b'}`, marginBottom: '10px', opacity: 0.3 }}></div>
                        <div style={{ fontWeight: 950, fontSize: '12px', color: protocol?.fontColor || '#1e293b' }}>
                          { (protocol?.doctor?.fullName || protocol?.doctor?.name || '').toUpperCase() }
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>
                          {protocol?.doctor?.specialization || ''}
                        </div>
                        <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '3px' }}>
                           {protocol?.doctor?.degree} {protocol?.doctor?.licenseNo ? `• Reg No: ${protocol.doctor.licenseNo}` : ''}
                        </div>
                     </div>
                  </div>

                  {/* Audit & Compliance Footer */}
                  <div style={{ marginTop: 'auto', paddingTop: '20px', fontSize: '8px', color: '#cbd5e1', textAlign: 'center', borderTop: '1px solid #f1f5f9', letterSpacing: '0.5px' }}>
                     ID: {activeAppointment?.displayId || activeAppointment?.appointmentId} • Electronic Diagnostic Record • Verified
                </div>
              </div>
            </div>
          </div>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #printable-report, #printable-report * { visibility: visible; }
              #printable-report { position: fixed; left: 0; top: 0; width: 100%; height: 100%; margin: 0; padding: 0; box-shadow: none; }
              .modal-overlay { background: white !important; padding: 0 !important; }
            }
          `}</style>
        </div>
      </div>
    );
  };


  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const el = textareaRef.current;
      if (!el) return;
      
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      
      const range = selection.getRangeAt(0);
      const text = range.startContainer.textContent || '';
      const cursor = range.startOffset;
      const beforeCursor = text.substring(0, cursor);
      const lastSegment = beforeCursor.split(/\s+/).pop();

      const match = keywordLibrary.find(k => (k.trigger || '').toLowerCase() === lastSegment.toLowerCase());
      if (match) {
        e.preventDefault();
        
        // Remove the keyword text
        range.setStart(range.startContainer, cursor - lastSegment.length);
        range.deleteContents();
        
        // Insert the paragraph
        const html = (match.replacementText || '').replace(/\n/g, '<br>');
        document.execCommand('insertHTML', false, html);
        
        setEditorText(el.innerHTML);
      }
    }
  };

  const formatMacroText = (style) => {
    const el = macroTextareaRef.current;
    if (!el) return;
    el.focus();
    if (style === 'bold') document.execCommand('bold', false, null);
    else if (style === 'italic') document.execCommand('italic', false, null);
    else if (style === 'underline') document.execCommand('underline', false, null);
    setNewMacro({ ...newMacro, replacementText: el.innerHTML });
  };

  // --- TACTICAL LAYOUT ENGINE ---
  const handleResizing = useCallback((e) => {
    if (!isResizing.current) return;
    const newWidth = ((window.innerWidth - e.clientX) / window.innerWidth) * 100;
    if (newWidth > 5 && newWidth < 85) {
      setEditorWidth(newWidth);
      if (newWidth < 8) setEditorState('collapsed');
      else if (newWidth > 70) setEditorState('expanded');
      else setEditorState('custom');
    }
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleResizing);
    document.removeEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, [handleResizing]);

  const startResizing = useCallback(() => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleResizing);
    document.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [handleResizing, stopResizing]);

  useEffect(() => {
    const handleKeys = (e) => {
      if (e.ctrlKey && e.key === '[') setEditorState('collapsed');
      if (e.ctrlKey && e.key === ']') setEditorState('expanded');
      if (e.ctrlKey && e.key === '\\') setEditorState('standard');
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, []);

  // --- DICOM VIEWER KEYBOARD SHORTCUTS ---
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  
  useEffect(() => {
    const handleDicomShortcuts = (e) => {
      // Only activate shortcuts when DICOM viewer is active
      if (!isDicomImage) return;
      
      // Ignore shortcuts when typing in input fields
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      // Prevent default for our shortcuts
      const shortcutKeys = ['w', 'z', 'p', 's', 'l', 'h', 'b', 'a', 'c', 'e', 'r', 'f', 'm', 'i', 'v', 'x', 'k', 'n', 't', 'g', 'y'];
      if (shortcutKeys.includes(e.key.toLowerCase()) || e.key === 'Escape' || e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
      }

      // Tool Selection Shortcuts
      switch(e.key.toLowerCase()) {
        // Navigation & Manipulation
        case 'w':
          setActiveTool('WindowLevelTool');
          console.log('[SHORTCUT] Window/Level (W)');
          break;
        case 'z':
          setActiveTool('ZoomTool');
          console.log('[SHORTCUT] Zoom (Z)');
          break;
        case 'p':
          setActiveTool('PanTool');
          console.log('[SHORTCUT] Pan (P)');
          break;
        case 's':
          setActiveTool('StackScrollTool');
          console.log('[SHORTCUT] Stack Scroll (S)');
          break;

        // Measurement Tools
        case 'l':
          setActiveTool('LengthTool');
          console.log('[SHORTCUT] Length (L)');
          break;
        case 'h':
          setActiveTool('HeightTool');
          console.log('[SHORTCUT] Height (H)');
          break;
        case 'b':
          setActiveTool('BidirectionalTool');
          console.log('[SHORTCUT] Bidirectional/RECIST (B)');
          break;
        case 'a':
          setActiveTool('AngleTool');
          console.log('[SHORTCUT] Angle (A)');
          break;
        case 'c':
          setActiveTool('CobbAngleTool');
          console.log('[SHORTCUT] Cobb Angle (C)');
          break;

        // ROI Tools
        case 'e':
          setActiveTool('EllipticalROITool');
          console.log('[SHORTCUT] Elliptical ROI (E)');
          break;
        case 'r':
          setActiveTool('RectangleROITool');
          console.log('[SHORTCUT] Rectangle ROI (R)');
          break;
        case 'o':
          setActiveTool('CircleROITool');
          console.log('[SHORTCUT] Circle ROI (O)');
          break;
        case 'f':
          setActiveTool('PlanarFreehandROITool');
          console.log('[SHORTCUT] Freehand ROI (F)');
          break;

        // Analysis Tools
        case 'u':
          setActiveTool('ProbeTool');
          console.log('[SHORTCUT] Probe/HU (U)');
          break;
        case 'n':
          setActiveTool('ArrowAnnotateTool');
          console.log('[SHORTCUT] Arrow Annotation (N)');
          break;
        case 'm':
          setActiveTool('AdvancedMagnifyTool');
          console.log('[SHORTCUT] Magnify (M)');
          break;

        // Image Manipulation
        case 'i':
          setViewportProps(prev => ({ ...prev, invert: !prev.invert }));
          console.log('[SHORTCUT] Invert (I)');
          break;
        case 'x':
          setViewportProps(prev => ({ ...prev, flipHorizontal: !prev.flipHorizontal }));
          console.log('[SHORTCUT] Flip Horizontal (X)');
          break;
        case 'y':
          setViewportProps(prev => ({ ...prev, flipVertical: !prev.flipVertical }));
          console.log('[SHORTCUT] Flip Vertical (Y)');
          break;
        case 't':
          setViewportProps(prev => ({ ...prev, rotation: (prev.rotation + 90) % 360 }));
          console.log('[SHORTCUT] Rotate 90° (T)');
          break;

        // Playback & Navigation
        case ' ':
          setCineEnabled(prev => !prev);
          console.log('[SHORTCUT] Toggle Cine (Space)');
          break;
        case 'k':
          toggleKeyImage();
          console.log('[SHORTCUT] Toggle Key Image (K)');
          break;
        case 'v':
          setIsSyncEnabled(prev => !prev);
          console.log('[SHORTCUT] Toggle Sync (V)');
          break;

        // Layout
        case '1':
          if (e.ctrlKey) {
            setLayoutMode('1x1');
            console.log('[SHORTCUT] 1x1 Layout (Ctrl+1)');
          }
          break;
        case '2':
          if (e.ctrlKey) {
            setLayoutMode('1x2');
            console.log('[SHORTCUT] 1x2 Layout (Ctrl+2)');
          }
          break;
        case '3':
          if (e.ctrlKey) {
            setLayoutMode('2x2');
            console.log('[SHORTCUT] 2x2 Layout (Ctrl+3)');
          }
          break;

        // Reset & Help
        case 'escape':
          setActiveTool('WindowLevelTool');
          setResetTrigger(prev => prev + 1);
          console.log('[SHORTCUT] Reset (Escape)');
          break;
        case '?':
          if (e.shiftKey) {
            setShowShortcutsHelp(prev => !prev);
            console.log('[SHORTCUT] Toggle Help (?)');
          }
          break;
      }

      // Arrow keys for series/slice navigation
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        // Navigate between series
        if (e.key === 'ArrowUp' && activeAssetIndex > 0) {
          setActiveAssetIndex(prev => prev - 1);
          console.log('[SHORTCUT] Previous Series (↑)');
        } else if (e.key === 'ArrowDown' && activeAssetIndex < uploadedFiles.length - 1) {
          setActiveAssetIndex(prev => prev + 1);
          console.log('[SHORTCUT] Next Series (↓)');
        }
      }

      // Ctrl+S to save report
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSaveReport(false);
        console.log('[SHORTCUT] Save Report (Ctrl+S)');
      }

      // Ctrl+Shift+S to finalize report
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        handleSaveReport(true);
        console.log('[SHORTCUT] Finalize Report (Ctrl+Shift+S)');
      }
    };

    window.addEventListener('keydown', handleDicomShortcuts);
    return () => window.removeEventListener('keydown', handleDicomShortcuts);
  }, [isDicomImage, activeAssetIndex, uploadedFiles.length]);

  // Keyboard shortcuts help modal
  const renderShortcutsHelp = () => {
    if (!showShortcutsHelp) return null;
    
    return (
      <div className="overlay" style={{ zIndex: 10002, background: 'rgba(15, 23, 42, 0.95)' }} onClick={() => setShowShortcutsHelp(false)}>
        <div className="modal" style={{ 
          width: '800px', 
          maxHeight: '85vh', 
          overflow: 'auto',
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          border: '2px solid rgba(59, 130, 246, 0.3)',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)'
        }} onClick={e => e.stopPropagation()}>
          <div className="modal-header" style={{ 
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', 
            color: 'white',
            padding: '20px 25px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '24px' }}>⚡</span>
              <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '1px' }}>DICOM VIEWER KEYBOARD SHORTCUTS</span>
            </div>
            <button 
              className="tool-btn" 
              onClick={() => setShowShortcutsHelp(false)}
              style={{ 
                background: 'rgba(255,255,255,0.2)', 
                color: 'white', 
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '6px',
                width: '32px',
                height: '32px'
              }}
            >✕</button>
          </div>
          <div className="modal-body" style={{ padding: '25px', background: 'white' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '25px', fontSize: '12px' }}>
              <div>
                <h4 style={{ color: '#3b82f6', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🎮</span> Navigation & Manipulation
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>W</kbd> 
                    <span>Window/Level Tool</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>Z</kbd> 
                    <span>Zoom Tool</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>P</kbd> 
                    <span>Pan Tool</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>S</kbd> 
                    <span>Stack Scroll</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 style={{ color: '#10b981', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📏</span> Measurements
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>L</kbd> 
                    <span>Length Tool</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>H</kbd> 
                    <span>Height Tool</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>B</kbd> 
                    <span>Bidirectional (RECIST)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>A</kbd> 
                    <span>Angle Tool</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>C</kbd> 
                    <span>Cobb Angle</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>U</kbd> 
                    <span>HU Probe</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 style={{ color: '#f59e0b', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🎯</span> ROI Analysis
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>E</kbd> 
                    <span>Elliptical ROI</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>R</kbd> 
                    <span>Rectangle ROI</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>O</kbd> 
                    <span>Circle ROI</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>F</kbd> 
                    <span>Freehand ROI</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>N</kbd> 
                    <span>Arrow Annotation</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>M</kbd> 
                    <span>Magnifier</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '25px', marginTop: '25px', fontSize: '12px' }}>
              <div>
                <h4 style={{ color: '#8b5cf6', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🎨</span> Image Controls
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>I</kbd> 
                    <span>Invert Colors</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>X</kbd> 
                    <span>Flip Horizontal</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>Y</kbd> 
                    <span>Flip Vertical</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>T</kbd> 
                    <span>Rotate 90°</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>ESC</kbd> 
                    <span>Reset View</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 style={{ color: '#ef4444', marginBottom: '12px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⚡</span> Quick Actions
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>Space</kbd> 
                    <span>Toggle Cine</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>K</kbd> 
                    <span>Key Image</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>V</kbd> 
                    <span>Toggle Sync</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>↑↓</kbd> 
                    <span>Series Navigation</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <kbd style={{ minWidth: '24px' }}>?</kbd> 
                    <span>Toggle Help</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ 
              marginTop: '25px', 
              padding: '20px', 
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1))', 
              borderRadius: '12px', 
              border: '2px solid rgba(59, 130, 246, 0.2)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#3b82f6', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span>🎯</span> PRO TIP
              </div>
              <div style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.6' }}>
                <strong>All advanced measurement and ROI tools are accessible via keyboard shortcuts</strong> while the DICOM viewer is active. 
                The toolbar shows only essential tools to keep the interface clean and maximize viewing space for optimal diagnosis.
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px', fontStyle: 'italic' }}>
                Press any shortcut key while viewing DICOM images to instantly activate the corresponding tool.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (editorState === 'standard') setEditorWidth(45);
    else if (editorState === 'expanded') setEditorWidth(100);
    else if (editorState === 'collapsed') setEditorWidth(5);
  }, [editorState]);

  const insertTable = (preset) => {
    const header = `| ${preset.columns.join(' | ')} |`;
    const separator = `| ${preset.columns.map(() => '---').join(' | ')} |`;
    const row = `| ${preset.columns.map(() => ' ').join(' | ')} |`;
    const tableMd = `\n${header}\n${separator}\n${row}\n`;
    insertContent(tableMd);
    setShowTableModal(false);
  };

  const handleSaveTable = () => {
    if (!newTable.name) return alert('Enter table name');
    setTablePresets([...tablePresets, { id: Date.now(), ...newTable }]);
    setShowTableBuilder(false);
    setNewTable({ name: '', columns: [''] });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const id = 'img_' + Date.now();
      const imgHtml = `<div id="${id}_container" style="margin: 15px 0; text-align: center; position: relative; display: inline-block; width: 50%;"><img src="${event.target.result}" id="${id}" style="width: 100%; border-radius: 8px; border: 1px solid #e2e8f0; cursor: pointer;" onclick="window.onImgClick('${id}')" /><div style="font-size: 11px; color: #64748b; margin-top: 5px;">Clinical Image: ${file.name}</div></div><p>&nbsp;</p>`;
      insertContent(imgHtml);
    };
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  // Expose function to global scope for the inline onclick handler
  useEffect(() => {
    window.onImgClick = (id) => {
      const img = document.getElementById(id);
      if (!img) return;
      const rect = img.getBoundingClientRect();
      const parentRect = textareaRef.current.getBoundingClientRect();
      setSelectedImg(id);
      setImgToolbarPos({ 
        top: rect.top - parentRect.top - 40, 
        left: rect.left - parentRect.left + (rect.width / 2) - 80
      });
    };
  }, []);

  const handleSlashCommand = (cmd) => {
    if (cmd === 'table') setShowTableModal(true);
    else if (cmd === 'image') fileInputRef.current.click();
    else if (cmd === 'diagram') alert('DIAGRAM_NODE: Integrated Flowchart engine coming soon.');
    setShowSlashMenu(false);
  };

  const resizeImg = (size) => {
    if (!selectedImg) return;
    const container = document.getElementById(selectedImg + '_container');
    if (container) {
      container.style.width = size;
      setEditorText(textareaRef.current.innerHTML);
    }
  };

  const deleteImg = () => {
    if (!selectedImg) return;
    const container = document.getElementById(selectedImg + '_container');
    if (container) {
      container.remove();
      setSelectedImg(null);
      setEditorText(textareaRef.current.innerHTML);
    }
  };

  const addSection = () => {
    const newSection = { id: Date.now(), title: 'New Section', content: '' };
    setNewTemplate({ ...newTemplate, sections: [...newTemplate.sections, newSection] });
  };

  const updateSection = (id, field, value) => {
    const updated = newTemplate.sections.map(s => s.id === id ? { ...s, [field]: value } : s);
    setNewTemplate({ ...newTemplate, sections: updated });
  };

  const removeSection = (id) => {
    setNewTemplate({ ...newTemplate, sections: newTemplate.sections.filter(s => s.id !== id) });
  };

  const syncFromStructured = () => {
    // Mock sync logic: takes structured data and generates a clean summary
    const syncText = "SYNALYSIS REPORT:\n" + 
      "Clinical: Pain abdomen, fever.\n" + 
      "Liver: Normal size and echotexture.\n" + 
      "Kidneys: Right measures 10.2 cm. Left measures 9.8 cm.\n" + 
      "Impression: Normal study.";
    setEditorText(syncText);
  };

  const commonPhrases = [
    { label: 'Normal Study', text: 'The study reveals no significant abnormality in the scanned region.' },
    { label: 'Clinical Correlation', text: 'Clinical correlation is suggested for further management.' },
    { label: 'Follow-up Suggested', text: 'A follow-up scan is recommended in 3-6 months to assess progression.' },
    { label: 'Normal Liver', text: 'Liver is normal in size and echotexture. No focal lesion seen.' },
    { label: 'No Calculus', text: 'No evidence of radiopaque calculus or hydronephrosis seen.' }
  ];

  if (loading && !activeAppointment) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', flexDirection: 'column', gap: '20px' }}>
        <div className="clinical-loader" style={{ width: '50px', height: '50px', border: '4px solid rgba(15, 82, 186, 0.1)', borderTopColor: '#0f52ba', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <div style={{ fontSize: '12px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px', textTransform: 'uppercase' }}>Synchronizing Diagnostic Workspace...</div>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white', flexDirection: 'column', gap: '20px', textAlign: 'center', padding: '20px' }}>
        <div style={{ fontSize: '64px', animation: 'pulse 2s infinite' }}>⚠️</div>
        <h2 style={{ fontWeight: 900, letterSpacing: '4px', color: '#3b82f6' }}>SIGNAL_INTERRUPTED</h2>
        <p style={{ color: '#94a3b8', maxWidth: '500px', lineHeight: '1.6', fontSize: '14px', fontWeight: 600 }}>{error}</p>
        <button 
          className="btn btn-primary" 
          style={{ padding: '12px 30px', borderRadius: '12px', background: '#3b82f6', border: 'none', color: 'white', fontWeight: 800, cursor: 'pointer', marginTop: '20px' }}
          onClick={() => navigate('/doctor-board')}
        >
          RETURN_TO_COMMAND_CENTER
        </button>
        <style>{`
          @keyframes pulse {
            0% { opacity: 0.5; transform: scale(0.95); }
            50% { opacity: 1; transform: scale(1); }
            100% { opacity: 0.5; transform: scale(0.95); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="reporting-app-container">
      {/* SCOPED CSS */}
      <style>{`
        .reporting-app-container {
          height: 100vh;
          width: calc(100% - 24px);
          margin-left: 24px;
          background: #f8fafc;
          color: #1e293b;
          font-family: 'Inter', system-ui, sans-serif;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* HEADER */
        .reporting-header {
          height: 60px;
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          position: sticky;
          top: 0;
          z-index: 1000;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .back-btn {
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          font-weight: 500;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .back-btn:hover { color: #0f172a; }

        .patient-badge-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding-left: 15px;
          border-left: 1px solid #e2e8f0;
        }

        @media (max-width: 1100px) {
          .reporting-header { height: auto; padding: 10px 15px; flex-direction: column; align-items: flex-start; gap: 10px; }
          .patient-badge-header { border-left: none; padding-left: 0; }
          .patient-badge-header div:first-child div:first-child { font-size: 16px !important; }
        }

        .header-title {
          font-weight: 700;
          font-size: 16px;
          color: #0f172a;
        }

        .header-meta {
          font-size: 12px;
          color: #64748b;
          background: #f1f5f9;
          padding: 3px 8px;
          border-radius: 4px;
        }

        .modality-badge {
          background: #e0e7ff;
          color: #4338ca;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 12px;
        }

        .draft-badge {
          background: #fef3c7;
          color: #d97706;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 12px;
        }

        .header-right {
          display: flex;
          gap: 10px;
        }

        .btn {
          padding: 8px 14px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-outline {
          background: #fff;
          border: 1px solid #cbd5e1;
          color: #475569;
        }
        .btn-outline:hover { background: #f8fafc; color: #0f172a; border-color: #94a3b8; }
        
        .btn-primary {
          background: #2563eb;
          border: 1px solid #2563eb;
          color: #fff;
        }
        .btn-primary:hover { background: #1d4ed8; }

        .btn-success {
          background: #10b981;
          border: 1px solid #10b981;
          color: #fff;
        }
        .btn-success:hover { background: #059669; }

        /* MAIN LAYOUT */
        .main-layout {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        /* PANELS */
        .panel {
          overflow-y: auto;
          padding: 15px;
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .panel-left { width: 300px; background: #f8fafc; border-right: 1px solid #e2e8f0; }
        .panel-center { 
          flex: 1;
          width: ${editorState === 'expanded' ? '0%' : (100 - editorWidth) + '%'};
          display: ${editorState === 'expanded' ? 'none' : 'flex'};
          background: #0f172a; padding: 0; flex-direction: row; /* Changed to row for left toolbar */
          transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .panel-right { 
          width: ${editorState === 'expanded' ? '100%' : editorWidth + '%'};
          min-width: ${editorState === 'collapsed' ? '60px' : '300px'};
          background: #ffffff; padding: ${editorState === 'collapsed' ? '20px 10px' : '20px 30px'}; 
          overflow-y: auto; display: flex; flex-direction: column; 
          transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1), padding 0.4s;
          border-left: 1px solid #e2e8f0;
          position: relative;
        }

        @media (max-width: 1366px) and (orientation: landscape), 
               (max-width: 1024px) and (orientation: portrait),
               (pointer: coarse) {
          .main-layout { flex-direction: column; }
          .panel-center { 
            width: 100% !important; 
            height: ${activeWorkspaceMode === 'editor' ? '0' : '60vh'}; 
            display: ${activeWorkspaceMode === 'editor' ? 'none' : 'flex'}; 
            flex-direction: column; 
          }
          .panel-center > div:first-child { 
            width: ${isTablet ? '240px' : '200px'} !important;
            height: 100%;
          }
          .panel-right { 
            width: 100% !important; 
            height: ${activeWorkspaceMode === 'dicom' ? '0' : 'auto'}; 
            display: ${activeWorkspaceMode === 'dicom' ? 'none' : 'flex'}; 
            border-left: none; 
            padding: 20px 15px; 
          }
          .resizer-handle { display: none; }
          
          /* Touch-friendly button sizes */
          button {
            min-height: 44px !important;
            min-width: 44px !important;
            touch-action: manipulation;
          }
          
          /* Prevent zoom on input focus */
          input, textarea, select {
            font-size: 16px !important;
          }
        }

        /* iPad specific optimizations */
        @media only screen 
          and (min-device-width: 768px) 
          and (max-device-width: 1024px) 
          and (-webkit-min-device-pixel-ratio: 1) {
          
          .panel-center > div:first-child { 
            width: 280px !important;
          }
          
          /* Larger touch targets for iPad */
          button {
            min-height: 48px !important;
            padding: 12px !important;
          }
        }

        /* iPhone and small tablet portrait */
        @media (max-width: 768px) {
          .main-layout { flex-direction: column; }
          .panel-center { width: 100% !important; height: 50vh; display: ${activeWorkspaceMode === 'editor' ? 'none' : 'flex'}; flex-direction: column; }
          .panel-center > div:first-child { display: none; } /* Hide left toolbar on mobile */
          .panel-right { width: 100% !important; height: ${activeWorkspaceMode === 'dicom' ? '0' : 'auto'}; display: ${activeWorkspaceMode === 'dicom' ? 'none' : 'flex'}; border-left: none; padding: 20px 15px; }
          .resizer-handle { display: none; }
        }

        .resizer-handle {
          position: absolute;
          left: -4px;
          top: 0;
          bottom: 0;
          width: 8px;
          cursor: col-resize;
          z-index: 100;
          transition: background 0.2s;
        }
        .resizer-handle:hover {
          background: rgba(15, 82, 186, 0.2);
        }
        .resizer-handle::after {
          content: '';
          position: absolute;
          left: 3px;
          top: 50%;
          transform: translateY(-50%);
          height: 40px;
          width: 2px;
          background: #e2e8f0;
          border-radius: 2px;
        }
        .resizer-handle:hover::after {
          background: #0f52ba;
        }

        /* CARDS */
        .card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 15px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.02);
        }

        .card-header {
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .info-row {
          display: flex;
          margin-bottom: 8px;
          font-size: 13px;
        }
        .info-label { width: 80px; color: #64748b; font-weight: 500; }
        .info-value { flex: 1; color: #0f172a; font-weight: 600; }

        .prior-report-item {
          padding: 10px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          margin-bottom: 8px;
          cursor: pointer;
        }
        .prior-report-item:hover { background: #f1f5f9; border-color: #cbd5e1; }
        
        .prior-title { font-size: 13px; font-weight: 600; color: #2563eb; }
        .prior-date { font-size: 11px; color: #64748b; margin-top: 4px; }

        .keyword-chip {
          display: inline-block;
          background: #eef2ff;
          color: #4f46e5;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          margin: 0 6px 6px 0;
          cursor: pointer;
          border: 1px solid #c7d2fe;
        }
        .keyword-chip:hover { background: #e0e7ff; }

        /* CENTER VIEWER */
        .viewer-header {
          height: 40px;
          background: #1e293b;
          display: flex;
          align-items: center;
          padding: 0 15px;
          color: #94a3b8;
          font-size: 12px;
          justify-content: space-between;
        }

        .viewer-main {
          flex: 1;
          display: flex;
          position: relative;
        }

        .viewer-viewport {
          flex: 1;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #334155;
          font-weight: 600;
          position: relative;
        }

        .viewer-thumbnail-strip {
          width: 100px;
          background: #0f172a;
          border-left: 1px solid #1e293b;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow-y: auto;
        }

        .thumbnail {
          height: 80px;
          background: #1e293b;
          border-radius: 6px;
          border: 2px solid transparent;
          cursor: pointer;
        }
        .thumbnail.active { border-color: #3b82f6; }
        
        .measurements-panel {
          position: absolute;
          bottom: 15px;
          left: 15px;
          background: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(4px);
          padding: 10px;
          border-radius: 8px;
          border: 1px solid #334155;
          color: #e2e8f0;
          font-size: 11px;
        }

        .key-images-panel {
          position: absolute;
          bottom: 15px;
          right: 115px; /* offset for strip */
          display: flex;
          gap: 10px;
        }

        .key-image-card {
          width: 60px;
          height: 60px;
          background: #1e293b;
          border: 1px solid #3b82f6;
          border-radius: 6px;
        }

        /* RIGHT PANEL: REPORTING WORKSPACE */
        .template-selector {
          width: 100%;
          padding: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          background: #fff;
          font-size: 14px;
          font-weight: 600;
          color: #0f172a;
          margin-bottom: 15px;
          outline: none;
        }

        .tabs {
          display: flex;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 15px;
        }

        .tab {
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          color: #64748b;
          cursor: pointer;
          border-bottom: 2px solid transparent;
        }
        .tab.active {
          color: #2563eb;
          border-bottom-color: #2563eb;
        }

        /* STRUCTURED FORM */
        .struct-container {
          display: flex;
          flex-direction: column;
          gap: 15px;
          padding: 10px 0;
        }

        .struct-section {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 15px 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          transition: all 0.2s;
        }
        .struct-section:focus-within {
          border-color: #3b82f6;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.08);
        }

        .struct-header {
          font-size: 11px;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .struct-header .status-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          display: inline-block;
          margin-left: 8px;
        }
        .struct-header .status-empty {
          background: #cbd5e1;
        }

        .struct-textarea {
          width: 100%;
          min-height: 40px;
          border: none;
          resize: none;
          outline: none;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.6;
          color: #0f172a;
          background: transparent;
        }
        .struct-textarea::placeholder {
          color: #94a3b8;
          font-style: italic;
        }

        /* RICH EDITOR */
        .editor-container {
          flex-direction: column;
          flex: 1;
          background: #fff;
          height: calc(100vh - 250px);
          position: relative;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.02);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          display: flex;
        }
        
        .panel-right:fullscreen {
          padding: 40px;
          background: #f1f5f9;
          width: 100vw;
          height: 100vh;
        }
        
        .panel-right:fullscreen .tabs {
          display: none;
        }

        .panel-right:fullscreen .editor-container {
          background: #fff;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
          max-width: 1200px;
          margin: 0 auto;
          height: calc(100vh - 80px);
          overflow: hidden;
        }

        .panel-right:fullscreen .editor-textarea {
          padding: 60px 100px;
          font-size: 16px;
          height: 100%;
        }
        .editor-container:focus-within {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .editor-toolbar {
          border-bottom: 1px solid #e2e8f0;
          padding: 10px 15px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          background: #f8fafc;
          border-radius: 12px 12px 0 0;
        }

        .tool-btn {
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          border-radius: 6px;
          cursor: pointer;
          color: #475569;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          transition: all 0.15s ease;
        }
        .tool-btn:hover { background: #e2e8f0; color: #0f172a; transform: translateY(-1px); }
        .tool-btn:active { transform: translateY(0); }

        .editor-textarea {
          flex: 1;
          border: none;
          padding: 25px;
          font-size: 15px;
          line-height: 1.8;
          color: #1e293b;
          overflow-y: auto;
          outline: none;
          font-family: 'Inter', sans-serif;
          background: #fff;
          max-height: 100%;
        }
        .editor-textarea table {
          border-collapse: collapse;
          width: 100%;
          margin: 15px 0;
          font-size: 13px;
        }
        .editor-textarea th { background: #f1f5f9; color: #475569; font-weight: 700; border: 1px solid #e2e8f0; padding: 10px; }
        .editor-textarea td { border: 1px solid #e2e8f0; padding: 10px; background: #fff; }
        .editor-textarea::placeholder {
          color: #94a3b8;
          font-weight: 400;
        }

        .template-placeholder {
          background: #fef08a;
          color: #854d0e;
          padding: 0 4px;
          border-radius: 3px;
          border: 1px dashed #ca8a04;
          font-size: 13px;
        }

        /* INLINE SUGGESTION */
        .inline-suggestion {
          position: absolute;
          top: 100px;
          left: 100px;
          width: 300px;
          background: #fff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
          z-index: 50;
          overflow: hidden;
        }

        .suggestion-item {
          padding: 10px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .suggestion-item.active { background: #eff6ff; }
        
        .sugg-header { display: flex; justify-content: space-between; align-items: center; }
        .sugg-keyword { font-weight: 700; font-size: 13px; color: #1d4ed8; }
        .sugg-badge { font-size: 10px; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; color: #475569; }
        .sugg-preview { font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* DIAGRAM BLOCK */
        .diagram-block {
          border: 2px dashed #cbd5e1;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          background: #f8fafc;
          margin: 15px 0;
          color: #64748b;
          cursor: pointer;
        }
        .diagram-block:hover { border-color: #94a3b8; background: #f1f5f9; }

        /* MODALS & DRAWERS */
        .overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(4px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modal {
          background: #fff;
          border-radius: 12px;
          width: 500px;
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
          overflow: hidden;
        }

        .modal-header {
          padding: 15px 20px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-weight: 700;
          color: #0f172a;
        }

        .modal-body { padding: 20px; }

        .preset-card {
          border: 1px solid #e2e8f0;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 10px;
          cursor: pointer;
          font-weight: 600;
          color: #334155;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .preset-card:hover { border-color: #3b82f6; background: #eff6ff; color: #1d4ed8; }

        .drawer {
          position: fixed;
          top: 0; right: 0; bottom: 0;
          width: 600px;
          background: #fff;
          box-shadow: -10px 0 50px rgba(0,0,0,0.15);
          z-index: 10000;
          display: flex;
          flex-direction: column;
          animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }

        .table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .table th { background: #f8fafc; padding: 10px; text-align: left; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600; }
        .table td { padding: 10px; border-bottom: 1px solid #e2e8f0; color: #334155; }
        .table tr:hover { background: #f8fafc; }

        /* Keyboard shortcuts styling */
        kbd {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 2px 6px;
          font-family: 'Courier New', monospace;
          font-size: 11px;
          font-weight: 700;
          color: #475569;
          margin-right: 8px;
          display: inline-block;
          min-width: 20px;
          text-align: center;
        }
      `}</style>

      {/* --- HEADER --- */}
      <header className="reporting-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => window.location.href = '/doctor-board'}>← Worklist</button>
          <div className="patient-badge-header">
            <div>
              <div style={{ fontSize: '20px', fontWeight: 950, color: '#1a1a2e', letterSpacing: '-0.5px' }}>{activeAppointment?.patientName?.toUpperCase() || 'LOADING...'}</div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>ID: {activeAppointment?.patientIdentifier || '...'}</span>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>ACC: {activeAppointment?.displayId || '...'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginLeft: '15px' }}>
              <span style={{ background: '#0f52ba', color: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 950, letterSpacing: '1px' }}>{activeAppointment?.modality || '...'}</span>
            </div>
          </div>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* COMPACT PARADIGM SWITCH */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <button 
              onClick={() => handleTabChange('Structured')}
              style={{ 
                padding: '6px 15px', borderRadius: '7px', border: 'none',
                background: activeTab === 'Structured' ? '#0f52ba' : 'transparent',
                color: activeTab === 'Structured' ? 'white' : '#64748b',
                fontWeight: 900, fontSize: '10px', cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >STRUCTURED_BLUEPRINT</button>
            <button 
              onClick={() => handleTabChange('Narrative Editor')}
              style={{ 
                padding: '6px 15px', borderRadius: '7px', border: 'none',
                background: activeTab === 'Narrative Editor' ? '#0f52ba' : 'transparent',
                color: activeTab === 'Narrative Editor' ? 'white' : '#64748b',
                fontWeight: 900, fontSize: '10px', cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >NARRATIVE_FREEFLOW</button>
          </div>

          <div style={{ 
            display: 'flex', gap: '2px', background: 'rgba(15, 82, 186, 0.05)', 
            padding: '4px', borderRadius: '12px', border: '1px solid rgba(15, 82, 186, 0.1)'
          }}>
            {isTablet ? (
               <div style={{ display: 'flex', gap: '5px' }}>
                  <button 
                    onClick={() => setActiveWorkspaceMode('dicom')}
                    style={{ 
                      background: activeWorkspaceMode === 'dicom' ? '#0f52ba' : 'transparent',
                      border: 'none', padding: '8px 15px', borderRadius: '8px', color: activeWorkspaceMode === 'dicom' ? 'white' : '#64748b',
                      fontSize: '11px', fontWeight: 900
                    }}
                  >VIEWER</button>
                  <button 
                    onClick={() => setActiveWorkspaceMode('editor')}
                    style={{ 
                      background: activeWorkspaceMode === 'editor' ? '#0f52ba' : 'transparent',
                      border: 'none', padding: '8px 15px', borderRadius: '8px', color: activeWorkspaceMode === 'editor' ? 'white' : '#64748b',
                      fontSize: '11px', fontWeight: 900
                    }}
                  >EDITOR</button>
               </div>
            ) : (
              [
                { state: 'collapsed', icon: '\u{21E4}', label: 'Diag' },
                { state: 'standard', icon: '\u{2139}', label: 'Split' },
                { state: 'expanded', icon: '\u{21E5}', label: 'Edit' }
              ].map(mode => (
                <button 
                  key={mode.state}
                  onClick={() => setEditorState(mode.state)}
                  style={{ 
                    background: editorState === mode.state ? '#0f52ba' : 'transparent',
                    border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer',
                    color: editorState === mode.state ? 'white' : '#64748b',
                    fontSize: '9px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '4px',
                    transition: 'all 0.3s'
                  }}
                >
                  <span style={{ fontSize: '12px' }}>{mode.icon}</span>
                  {editorState === mode.state && <span>{mode.label.toUpperCase()}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      </header>

      {/* --- MAIN LAYOUT --- */}
      <div className="main-layout">
        
        {/* LEFT PANEL removed for cleaner workspace */}

        {/* CENTER PANEL: DICOM Viewer */}
        <div className="panel panel-center" style={{ display: 'flex' }}>
          {/* LEFT TOOLBAR - Attached to DICOM Viewer */}
          <div style={{
            width: isTablet ? '240px' : '200px',
            background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
            borderRight: '2px solid #334155',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Toolbar Header */}
            <div style={{
              padding: isTablet ? '20px 15px' : '15px',
              borderBottom: '2px solid #334155',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
            }}>
              <div style={{
                color: 'white',
                fontSize: isTablet ? '14px' : '12px',
                fontWeight: 900,
                letterSpacing: '1px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: isTablet ? '20px' : '16px' }}>🛠️</span>
                DICOM TOOLS
              </div>
              {isTablet && (
                <div style={{
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: '10px',
                  marginTop: '4px'
                }}>
                  Touch optimized for tablets
                </div>
              )}
            </div>

            {/* Essential Tools */}
            <div style={{ padding: isTablet ? '20px 15px' : '15px', borderBottom: '1px solid #334155' }}>
              <div style={{ 
                color: '#3b82f6', 
                fontSize: isTablet ? '12px' : '10px', 
                fontWeight: 900, 
                marginBottom: isTablet ? '15px' : '10px',
                letterSpacing: '1px'
              }}>
                🎮 NAVIGATION
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr 1fr' : '1fr 1fr 1fr', gap: isTablet ? '8px' : '4px' }}>
                {[
                  { id: 'WindowLevelTool', icon: '☀️', label: 'W/L', shortcut: 'W' },
                  { id: 'ZoomTool', icon: '🔍', label: 'Zoom', shortcut: 'Z' },
                  { id: 'PanTool', icon: '✋', label: 'Pan', shortcut: 'P' },
                  { id: 'StackScrollTool', icon: '📜', label: 'Scroll', shortcut: 'S' },
                  { id: 'ResetTool', icon: '🔄', label: 'Reset', shortcut: 'ESC' },
                  { id: 'HelpTool', icon: '❓', label: 'Help', shortcut: '?' }
                ].map(t => (
                  <button 
                    key={t.id}
                    onClick={() => {
                      if (t.id === 'ResetTool') {
                        setActiveTool('WindowLevelTool');
                        setResetTrigger(prev => prev + 1);
                      } else if (t.id === 'HelpTool') {
                        // Show help modal or info
                        alert('Touch gestures:\n• Pinch to zoom\n• Single finger to pan\n• Double tap to reset\n• Use toolbar for measurements');
                      } else {
                        setActiveTool(t.id);
                      }
                    }}
                    style={{ 
                      background: activeTool === t.id ? '#3b82f6' : 'rgba(255,255,255,0.05)', 
                      border: activeTool === t.id ? '2px solid #60a5fa' : '2px solid transparent',
                      color: activeTool === t.id ? 'white' : '#e2e8f0',
                      padding: isTablet ? '12px 8px' : '6px 4px',
                      borderRadius: '6px',
                      fontSize: isTablet ? '10px' : '8px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: isTablet ? '6px' : '3px',
                      transition: 'all 0.2s ease',
                      width: '100%',
                      textAlign: 'center',
                      minHeight: isTablet ? '60px' : '45px',
                      touchAction: 'manipulation' // Optimize for touch
                    }}
                  >
                    <span style={{ fontSize: isTablet ? '16px' : '12px' }}>{t.icon}</span> 
                    <span style={{ fontSize: isTablet ? '9px' : '7px', lineHeight: '1' }}>{t.label}</span>
                    <span style={{ 
                      fontSize: isTablet ? '8px' : '6px', 
                      background: 'rgba(255,255,255,0.2)', 
                      padding: isTablet ? '2px 4px' : '1px 2px', 
                      borderRadius: '2px'
                    }}>{t.shortcut}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Measurement Tools */}
            <div style={{ padding: isTablet ? '20px 15px' : '15px', borderBottom: '1px solid #334155' }}>
              <div style={{ 
                color: '#10b981', 
                fontSize: isTablet ? '12px' : '10px', 
                fontWeight: 900, 
                marginBottom: isTablet ? '15px' : '10px',
                letterSpacing: '1px'
              }}>
                📏 MEASUREMENTS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr 1fr' : '1fr 1fr 1fr', gap: isTablet ? '8px' : '4px' }}>
                {[
                  { id: 'LengthTool', icon: '📏', label: 'Length', shortcut: 'L' },
                  { id: 'HeightTool', icon: '📐', label: 'Height', shortcut: 'H' },
                  { id: 'BidirectionalTool', icon: '↔️', label: 'Bidir', shortcut: 'B' },
                  { id: 'AngleTool', icon: '∠', label: 'Angle', shortcut: 'A' },
                  { id: 'CobbAngleTool', icon: '🦴', label: 'Cobb', shortcut: 'C' },
                  { id: 'CircleROITool', icon: '🔵', label: 'Circle', shortcut: 'O' }
                ].map(t => (
                  <button 
                    key={t.id}
                    onClick={() => setActiveTool(t.id)}
                    style={{ 
                      background: activeTool === t.id ? '#10b981' : 'rgba(255,255,255,0.05)', 
                      border: activeTool === t.id ? '2px solid #34d399' : '2px solid transparent',
                      color: activeTool === t.id ? 'white' : '#e2e8f0',
                      padding: isTablet ? '12px 8px' : '6px 4px',
                      borderRadius: '6px',
                      fontSize: isTablet ? '10px' : '8px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: isTablet ? '6px' : '3px',
                      transition: 'all 0.2s ease',
                      width: '100%',
                      textAlign: 'center',
                      minHeight: isTablet ? '60px' : '45px',
                      touchAction: 'manipulation'
                    }}
                  >
                    <span style={{ fontSize: isTablet ? '16px' : '12px' }}>{t.icon}</span> 
                    <span style={{ fontSize: isTablet ? '9px' : '7px', lineHeight: '1' }}>{t.label}</span>
                    <span style={{ 
                      fontSize: isTablet ? '8px' : '6px', 
                      background: 'rgba(255,255,255,0.2)', 
                      padding: isTablet ? '2px 4px' : '1px 2px', 
                      borderRadius: '2px'
                    }}>{t.shortcut}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ROI Tools */}
            <div style={{ padding: isTablet ? '20px 15px' : '15px', borderBottom: '1px solid #334155' }}>
              <div style={{ 
                color: '#f59e0b', 
                fontSize: isTablet ? '12px' : '10px', 
                fontWeight: 900, 
                marginBottom: isTablet ? '15px' : '10px',
                letterSpacing: '1px'
              }}>
                🎯 ROI ANALYSIS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isTablet ? '1fr 1fr' : '1fr 1fr 1fr', gap: isTablet ? '8px' : '4px' }}>
                {[
                  { id: 'EllipticalROITool', icon: '⭕', label: 'Ellipse', shortcut: 'E' },
                  { id: 'RectangleROITool', icon: '⬜', label: 'Rect', shortcut: 'R' },
                  { id: 'PlanarFreehandROITool', icon: '✏️', label: 'Freehand', shortcut: 'F' },
                  { id: 'ProbeTool', icon: '🎯', label: 'Probe', shortcut: 'U' },
                  { id: 'ArrowAnnotateTool', icon: '➡️', label: 'Arrow', shortcut: 'N' },
                  { id: 'AdvancedMagnifyTool', icon: '🔍', label: 'Magnify', shortcut: 'M' }
                ].map(t => (
                  <button 
                    key={t.id}
                    onClick={() => setActiveTool(t.id)}
                    style={{ 
                      background: activeTool === t.id ? '#f59e0b' : 'rgba(255,255,255,0.05)', 
                      border: activeTool === t.id ? '2px solid #fbbf24' : '2px solid transparent',
                      color: activeTool === t.id ? 'white' : '#e2e8f0',
                      padding: isTablet ? '12px 8px' : '6px 4px',
                      borderRadius: '6px',
                      fontSize: isTablet ? '10px' : '8px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: isTablet ? '6px' : '3px',
                      transition: 'all 0.2s ease',
                      width: '100%',
                      textAlign: 'center',
                      minHeight: isTablet ? '60px' : '45px',
                      touchAction: 'manipulation'
                    }}
                  >
                    <span style={{ fontSize: isTablet ? '16px' : '12px' }}>{t.icon}</span> 
                    <span style={{ fontSize: isTablet ? '9px' : '7px', lineHeight: '1' }}>{t.label}</span>
                    <span style={{ 
                      fontSize: isTablet ? '8px' : '6px', 
                      background: 'rgba(255,255,255,0.2)', 
                      padding: isTablet ? '2px 4px' : '1px 2px', 
                      borderRadius: '2px'
                    }}>{t.shortcut}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced Tools Info */}
            <div style={{ padding: '15px', background: 'rgba(59, 130, 246, 0.1)' }}>
              <div style={{ 
                color: '#3b82f6', 
                fontSize: '9px', 
                fontWeight: 900, 
                marginBottom: '8px',
                letterSpacing: '1px'
              }}>
                ⚡ QUICK ACCESS
              </div>
              <div style={{ fontSize: '8px', color: '#94a3b8', lineHeight: '1.4' }}>
                <div style={{ marginBottom: '4px' }}>
                  <strong style={{ color: '#e2e8f0' }}>All tools accessible via keyboard shortcuts</strong>
                </div>
                <div style={{ marginBottom: '2px' }}>• Press <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 3px', borderRadius: '2px', fontSize: '7px' }}>ESC</kbd> to reset</div>
                <div>• Press <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 3px', borderRadius: '2px', fontSize: '7px' }}>?</kbd> for help</div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ marginTop: 'auto', padding: '15px' }}>
              <button
                onClick={() => setShowShortcutsHelp(true)}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2))',
                  border: '1px solid rgba(139, 92, 246, 0.5)',
                  color: '#c4b5fd',
                  padding: '8px',
                  borderRadius: '6px',
                  fontSize: '10px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>❓</span> SHORTCUTS
              </button>
            </div>
          </div>

          {/* MAIN VIEWER AREA */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Top Controls */}
            <div style={{ 
              height: '50px', 
              background: '#1e293b', 
              borderBottom: '1px solid #334155', 
              display: 'flex', 
              alignItems: 'center', 
              padding: '0 15px', 
              gap: '15px', 
              justifyContent: 'space-between' 
            }}>
              {/* Active Tool Display */}
              <div style={{
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.5)',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 900,
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span>⚡</span> ACTIVE: {activeTool.replace('Tool', '').toUpperCase()}
              </div>

              {/* Controls */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button 
                  onClick={() => setCineEnabled(!cineEnabled)} 
                  title="Toggle Cine Mode (Space)"
                  style={{ 
                    background: cineEnabled ? '#ef4444' : 'rgba(255,255,255,0.08)', 
                    border: '2px solid ' + (cineEnabled ? '#f87171' : 'transparent'),
                    color: 'white', 
                    padding: '6px 10px', 
                    borderRadius: '6px', 
                    fontSize: '10px', 
                    fontWeight: 900, 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>🎬</span> CINE
                </button>
                
                <select 
                  value={layoutMode} 
                  onChange={e => setLayoutMode(e.target.value)}
                  style={{ 
                    background: 'rgba(255,255,255,0.08)', 
                    color: 'white', 
                    border: '2px solid #334155', 
                    padding: '6px 10px', 
                    borderRadius: '6px', 
                    fontSize: '10px', 
                    fontWeight: 900, 
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="1x1" style={{ background: '#1e293b', color: 'white' }}>1×1</option>
                  <option value="2x2" style={{ background: '#1e293b', color: 'white' }}>2×2</option>
                </select>

                {/* FULLSCREEN BUTTON */}
                <button
                  onClick={() => {
                    console.log('[FULL VIEW] Button clicked');
                    console.log('[FULL VIEW] uploadedFiles:', uploadedFiles);
                    console.log('[FULL VIEW] activeAssetIndex:', activeAssetIndex);
                    console.log('[FULL VIEW] Current asset:', uploadedFiles[activeAssetIndex]);
                    console.log('[FULL VIEW] activeAppointment:', activeAppointment);
                    
                    if (uploadedFiles.length > 0 && uploadedFiles[activeAssetIndex]?.rawFiles) {
                      const navigationState = {
                        files: uploadedFiles[activeAssetIndex].rawFiles,
                        seriesName: uploadedFiles[activeAssetIndex].name,
                        appointmentData: {
                          ...activeAppointment,
                          appointmentId: appointmentId, // Ensure we have the appointment ID
                          id: appointmentId
                        }
                      };
                      
                      console.log('[FULL VIEW] Navigating to DICOM viewer with state:', navigationState);
                      
                      navigate('/dicom-viewer', {
                        state: navigationState,
                        replace: false // Don't replace history entry
                      });
                    } else {
                      console.error('[FULL VIEW] No DICOM files available');
                      console.error('[FULL VIEW] uploadedFiles.length:', uploadedFiles.length);
                      console.error('[FULL VIEW] activeAssetIndex:', activeAssetIndex);
                      console.error('[FULL VIEW] rawFiles:', uploadedFiles[activeAssetIndex]?.rawFiles);
                      alert('No DICOM files available for full-screen viewing. Please upload DICOM files first.');
                    }
                  }}
                  title="Open Full Screen DICOM Viewer"
                  style={{
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    border: '2px solid #34d399',
                    color: 'white',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  <span style={{ fontSize: '12px' }}>🔍</span>
                  FULL VIEW
                </button>
              </div>
            </div>

          <div style={{ flex: 1, background: '#000', position: 'relative', display: 'flex', gap: '2px', padding: '2px' }}>
            {/* PROGRESS OVERLAY */}
            {loading && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(15, 23, 42, 0.95)',
                backdropFilter: 'blur(8px)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                gap: '20px'
              }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  border: '3px solid rgba(59, 130, 246, 0.2)',
                  borderTopColor: '#3b82f6',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                
                <div style={{ textAlign: 'center', maxWidth: '350px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 900, marginBottom: '8px', letterSpacing: '1px' }}>
                    PROCESSING DICOM DATA
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '15px' }}>
                    {processingStatus || 'Initializing...'}
                  </div>
                  
                  {loadingProgress.total > 0 && (
                    <div style={{ width: '250px', margin: '0 auto' }}>
                      <div style={{
                        width: '100%',
                        height: '6px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '3px',
                        overflow: 'hidden',
                        marginBottom: '8px'
                      }}>
                        <div style={{
                          width: `${(loadingProgress.current / loadingProgress.total) * 100}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                          borderRadius: '3px',
                          transition: 'width 0.3s ease'
                        }}></div>
                      </div>
                      <div style={{ fontSize: '10px', color: '#cbd5e1' }}>
                        {loadingProgress.current} / {loadingProgress.total} files
                        {loadingProgress.seriesCount && ` • ${loadingProgress.seriesCount} series`}
                      </div>
                    </div>
                  )}
                </div>
                
                <style>{`
                  @keyframes spin {
                    to { transform: rotate(360deg); }
                  }
                `}</style>
              </div>
            )}
            
            {/* SERIES LIBRARY MINI-SIDEBAR */}
            {uploadedFiles.length > 1 && (
              <div style={{ width: '60px', background: '#0f172a', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 5px', zIndex: 10 }}>
                {uploadedFiles.map((f, i) => (
                  <button 
                    key={i}
                    onClick={() => setActiveAssetIndex(i)}
                    title={f.name}
                    style={{ 
                      width: '100%', height: '50px', background: activeAssetIndex === i ? '#3b82f6' : 'rgba(255,255,255,0.05)', 
                      border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', transition: '0.2s', gap: '4px'
                    }}
                  >
                    <div style={{ fontSize: '12px' }}>🎞️</div>
                    <div style={{ fontSize: '8px', color: 'white', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', width: '100%', textAlign: 'center' }}>S{i+1}</div>
                  </button>
                ))}
              </div>
            )}

            {uploadedFiles.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: '12px', fontWeight: 950, letterSpacing: '2px', flexDirection: 'column', gap: '20px' }}>
                <div style={{ fontSize: '48px', opacity: 0.2 }}>📡</div>
                <div style={{ textAlign: 'center' }}>
                  <div>WAITING_FOR_DATA_SIGNAL</div>
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '10px', fontWeight: 400 }}>
                    Upload DICOM files or ZIP archives to begin analysis
                  </div>
                </div>
                <input 
                  type="file" 
                  multiple 
                  accept=".dcm,.dicom,.zip" 
                  onChange={handleFileChange}
                  style={{ 
                    padding: '10px 20px', 
                    borderRadius: '8px', 
                    border: '2px dashed #3b82f6', 
                    background: 'rgba(59, 130, 246, 0.1)', 
                    color: '#3b82f6',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 700
                  }}
                />
              </div>
            ) : (
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: layoutMode === '2x2' ? '1fr 1fr' : '1fr', gridTemplateRows: layoutMode === '2x2' ? '1fr 1fr' : '1fr', gap: '2px' }}>
                {[...Array(layoutMode === '2x2' ? 4 : 1)].map((_, idx) => {
                  const currentFiles = uploadedFiles[(activeAssetIndex + idx) % uploadedFiles.length]?.rawFiles;
                  
                  return (
                    <div key={idx} style={{ position: 'relative', background: '#000', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      {/* DICOM Viewer with Advanced Tools */}
                      <div style={{ flex: 1, position: 'relative' }}>
                        <AdvancedDicomViewer 
                          key={`${activeAssetIndex}_${idx}_${resetTrigger}`} 
                          files={currentFiles || []} 
                          activeTool={activeTool}
                          isCine={cineEnabled}
                          isSynced={isSyncEnabled}
                          keyImages={keyImages}
                          onKeyImageToggle={toggleKeyImage}
                          onSliceChange={(index, total) => {
                            if (idx === 0) setCurrentSlice(index + 1);
                          }}
                          // Enhanced features - all enabled
                          enableFullscreen={true}
                          showMetadata={true}
                          showMeasurements={true}
                          showWindowingPresets={true}
                          enableAdvancedTools={true}
                          onFullscreenChange={(isFullscreen) => {
                            console.log(`[DICOM] Viewport ${idx} fullscreen:`, isFullscreen);
                          }}
                          onMeasurement={(measurement) => {
                            console.log(`[DICOM] New measurement in viewport ${idx}:`, measurement);
                            if (onMeasurement) onMeasurement(measurement);
                          }}
                          onMetadata={(metadata) => {
                            if (idx === 0) setActiveMetadata(metadata);
                          }}
                          // Viewport transformations
                          invert={viewportProps.invert}
                          flipHorizontal={viewportProps.flipHorizontal}
                          flipVertical={viewportProps.flipVertical}
                          rotation={viewportProps.rotation}
                          resetTrigger={resetTrigger}
                        />
                        
                        {/* Enhanced Overlay Information */}
                        <div style={{ position: 'absolute', top: '15px', left: '15px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(8px)', padding: '8px 15px', borderRadius: '8px', fontSize: '11px', color: '#e2e8f0', fontWeight: 900, letterSpacing: '1px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            {uploadedFiles[(activeAssetIndex + idx) % uploadedFiles.length]?.name?.toUpperCase() || 'SERIES'}
                          </div>
                          <div style={{ background: 'rgba(59, 130, 246, 0.9)', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', color: 'white', fontWeight: 900, width: 'fit-content' }}>
                            SLICE: {idx === 0 ? currentSlice : '?'} / {currentFiles?.length || 0}
                          </div>
                          {activeMetadata && idx === 0 && (
                            <div style={{ background: 'rgba(16, 185, 129, 0.9)', padding: '4px 10px', borderRadius: '4px', fontSize: '10px', color: 'white', fontWeight: 900, width: 'fit-content' }}>
                              {activeMetadata.modality} • {activeMetadata.rows}x{activeMetadata.columns}
                            </div>
                          )}
                        </div>

                        {/* ACTIVE TOOL INDICATOR */}
                        <div style={{ position: 'absolute', top: '15px', right: '15px', zIndex: 10 }}>
                          <div style={{ 
                            background: 'rgba(59, 130, 246, 0.9)', 
                            padding: '8px 15px', 
                            borderRadius: '8px', 
                            fontSize: '11px', 
                            color: 'white', 
                            fontWeight: 900,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            border: '2px solid rgba(255,255,255,0.2)'
                          }}>
                            <span style={{ fontSize: '14px' }}>
                              {activeTool === 'WindowLevelTool' && '☀️'}
                              {activeTool === 'ZoomTool' && '🔍'}
                              {activeTool === 'PanTool' && '✋'}
                              {activeTool === 'LengthTool' && '📏'}
                              {activeTool === 'ArrowAnnotateTool' && '➡️'}
                              {!['WindowLevelTool', 'ZoomTool', 'PanTool', 'LengthTool', 'ArrowAnnotateTool'].includes(activeTool) && '⚡'}
                            </span>
                            <span>
                              {activeTool === 'WindowLevelTool' && 'WINDOW/LEVEL'}
                              {activeTool === 'ZoomTool' && 'ZOOM'}
                              {activeTool === 'PanTool' && 'PAN'}
                              {activeTool === 'LengthTool' && 'MEASURE'}
                              {activeTool === 'ArrowAnnotateTool' && 'ANNOTATE'}
                              {activeTool === 'HeightTool' && 'HEIGHT'}
                              {activeTool === 'BidirectionalTool' && 'BIDIRECTIONAL'}
                              {activeTool === 'AngleTool' && 'ANGLE'}
                              {activeTool === 'CobbAngleTool' && 'COBB ANGLE'}
                              {activeTool === 'EllipticalROITool' && 'ELLIPSE ROI'}
                              {activeTool === 'RectangleROITool' && 'RECTANGLE ROI'}
                              {activeTool === 'CircleROITool' && 'CIRCLE ROI'}
                              {activeTool === 'PlanarFreehandROITool' && 'FREEHAND ROI'}
                              {activeTool === 'ProbeTool' && 'HU PROBE'}
                              {activeTool === 'AdvancedMagnifyTool' && 'MAGNIFY'}
                              {!['WindowLevelTool', 'ZoomTool', 'PanTool', 'LengthTool', 'ArrowAnnotateTool', 'HeightTool', 'BidirectionalTool', 'AngleTool', 'CobbAngleTool', 'EllipticalROITool', 'RectangleROITool', 'CircleROITool', 'PlanarFreehandROITool', 'ProbeTool', 'AdvancedMagnifyTool'].includes(activeTool) && 'ADVANCED TOOL'}
                            </span>
                          </div>
                        </div>

                        {/* Windowing Presets - Bottom Right */}
                        <div style={{ position: 'absolute', bottom: '15px', right: '15px', zIndex: 10 }}>
                          <select 
                            onChange={(e) => {
                              // This would be handled by the AdvancedDicomViewer component
                              console.log('Windowing preset changed:', e.target.value);
                            }}
                            style={{ 
                              background: 'rgba(15, 23, 42, 0.9)', 
                              color: 'white', 
                              border: '2px solid rgba(255,255,255,0.2)', 
                              padding: '6px 12px', 
                              borderRadius: '6px', 
                              fontSize: '10px', 
                              fontWeight: 900,
                              outline: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            <option value="Default">DEFAULT W/L</option>
                            <option value="Lung">LUNG</option>
                            <option value="Bone">BONE</option>
                            <option value="Brain">BRAIN</option>
                            <option value="Abdomen">ABDOMEN</option>
                            <option value="Liver">LIVER</option>
                            <option value="Mediastinum">MEDIASTINUM</option>
                            <option value="Angio">ANGIO</option>
                          </select>
                        </div>

                        {/* Key Images Indicator */}
                        {keyImages.includes(`${activeAssetIndex + idx}_${currentSlice}`) && (
                          <div style={{ position: 'absolute', top: '60px', right: '15px', zIndex: 10 }}>
                            <div style={{ background: 'rgba(245, 158, 11, 0.9)', padding: '4px 10px', borderRadius: '6px', fontSize: '10px', color: 'white', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '5px' }}>
                              ⭐ KEY IMAGE
                            </div>
                          </div>
                        )}

                        {/* Active Tool & Instructions - Bottom Left */}
                        <div style={{ position: 'absolute', bottom: '15px', left: '15px', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)', padding: '4px 10px', borderRadius: '6px', fontSize: '9px', color: '#94a3b8', fontWeight: 900, letterSpacing: '1px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            ACTIVE: {activeTool?.replace('Tool', '').toUpperCase() || 'WINDOW_LEVEL'}
                          </div>
                          {activeTool && activeTool !== 'WindowLevelTool' && (
                            <div style={{ background: 'rgba(59, 130, 246, 0.8)', padding: '3px 8px', borderRadius: '4px', fontSize: '8px', color: 'white', fontWeight: 700, maxWidth: '200px' }}>
                              {activeTool === 'LengthTool' && 'Click and drag to measure distance'}
                              {activeTool === 'AngleTool' && 'Click 3 points to measure angle'}
                              {activeTool === 'EllipticalROITool' && 'Draw ellipse for ROI analysis'}
                              {activeTool === 'ProbeTool' && 'Click to probe pixel values'}
                              {activeTool === 'ArrowAnnotateTool' && 'Click and drag to annotate'}
                              {activeTool === 'ZoomTool' && 'Click and drag to zoom'}
                              {activeTool === 'PanTool' && 'Click and drag to pan'}
                            </div>
                          )}
                        </div>

                        {/* Measurement Results - Bottom Right */}
                        {idx === 0 && (
                          <div style={{ position: 'absolute', bottom: '15px', right: '15px', zIndex: 10, maxWidth: '250px' }}>
                            <div style={{ background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(8px)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                              <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 900, marginBottom: '4px', letterSpacing: '1px' }}>MEASUREMENTS</div>
                              <div style={{ fontSize: '10px', color: '#e2e8f0', fontWeight: 700 }}>
                                {/* This would be populated by the AdvancedDicomViewer component */}
                                <div>Distance: 12.4 mm</div>
                                <div>Area: 156.7 mm²</div>
                                <div>HU: -45 ± 12</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* RIGHT PANEL: Reporting Workspace */}
        <div className="panel panel-right">
          <div className="resizer-handle" onMouseDown={startResizing}></div>

          <div className="tabs" style={{ 
            marginTop: '0px', marginBottom: '10px', borderBottom: '1px solid #f1f5f9', display: editorState === 'collapsed' ? 'none' : 'flex',
            justifyContent: 'center', gap: '20px'
          }}>
            <div className={`tab ${activeTab === 'Structured' || activeTab === 'Narrative Editor' ? 'active' : ''}`} style={{ fontSize: '10px', fontWeight: 950 }} onClick={() => setActiveTab(activeTab === 'Narrative Editor' ? 'Narrative Editor' : 'Structured')}>REPORT_WORKSPACE</div>
            <div className={`tab ${activeTab === 'Templates' ? 'active' : ''}`} style={{ fontSize: '10px', fontWeight: 950 }} onClick={() => setActiveTab('Templates')}>Templates</div>
            <div className={`tab ${activeTab === 'Keywords' ? 'active' : ''}`} style={{ fontSize: '10px', fontWeight: 950 }} onClick={() => setActiveTab('Keywords')}>Keywords</div>
          </div>

          <div style={{ 
            display: editorState === 'collapsed' ? 'none' : 'flex', 
            flexDirection: 'column', flex: 1, paddingRight: '5px',
            animation: 'fadeIn 0.4s ease'
          }}>
            {activeTab === 'Structured' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '15px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff', marginBottom: '10px' }}>
                   <button className="btn btn-outline" style={{ padding: '10px 20px', fontSize: '12px' }} onClick={() => handleSaveReport(false)}>💾 Save Draft</button>
                   <button className="btn btn-outline" style={{ padding: '10px 20px', fontSize: '12px' }} onClick={handlePreviewPrint}>👁️ Preview Structured Report</button>
                   <button className="btn btn-success" style={{ padding: '10px 25px', fontSize: '12px' }} onClick={() => handleSaveReport(true)}>Finalize & Sign</button>
                </div>

                <div className="struct-container" style={{ flex: 1, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '15px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '8px', letterSpacing: '1px' }}>Active Template</label>
                      <select 
                        className="template-selector" 
                        value={selectedTemplateId || ''} 
                        onChange={(e) => {
                          const tpl = templates.find(t => t.id === e.target.value);
                          if (tpl) {
                            setSelectedTemplateId(tpl.id);
                            // Parse content and apply to structuredData
                            try {
                               const sections = JSON.parse(tpl.content || '[]');
                               const data = {};
                               sections.forEach(s => {
                                 data[s.title] = s.content;
                               });
                               setStructuredData(data);
                            } catch (e) {
                               console.error('Template parse error:', e);
                            }
                          }
                        }}
                      >
                        <option value="">Select Clinical Template...</option>
                        {templates.map(tpl => (
                          <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                    {selectedTemplateId ? (
                      <div className="structured-form" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '25px' }}>
                        {renderDynamicFields(templates.find(t => t.id === selectedTemplateId))}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '100px 0', color: '#94a3b8' }}>
                        <div style={{ fontSize: '48px', marginBottom: '20px' }}>📑</div>
                        <h3 style={{ fontSize: '18px', fontWeight: 600 }}>No Protocol Selected</h3>
                        <p>Choose a clinical template from the dropdown above to begin structured entry.</p>
                      </div>
                    )}
                  </div>
                </div>
            )}

            {activeTab === 'Narrative Editor' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '15px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff', marginBottom: '10px' }}>
                   <button className="btn btn-outline" style={{ padding: '10px 20px', fontSize: '12px' }} onClick={() => handleSaveReport(false)}>💾 Save Draft</button>
                   <button className="btn btn-outline" style={{ padding: '10px 20px', fontSize: '12px' }} onClick={handlePreviewPrint}>👁️ Preview Narrative Report</button>
                   <button className="btn btn-success" style={{ padding: '10px 25px', fontSize: '12px' }} onClick={() => handleSaveReport(true)}>Finalize & Sign</button>
                </div>
                <div style={{ display: 'flex', gap: '20px', flex: 1, overflow: 'hidden' }}>
                  <div className="editor-container" style={{ flex: 1 }}>
                  <div className="editor-toolbar">
                    <button className="tool-btn" title="Undo" onClick={undo}>↩️</button>
                    <button className="tool-btn" title="Redo" onClick={redo}>↪️</button>
                    <div style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 8px' }}></div>
                    <select 
                      className="tool-btn" 
                      onChange={(e) => formatText(`fontName:${e.target.value}`)} 
                      style={{ width: 'auto', padding: '0 8px', fontSize: '11px', fontWeight: 600 }}
                    >
                      <option value="Inter">Sans</option>
                      <option value="Roboto">Roboto</option>
                      <option value="Courier New">Mono</option>
                      <option value="Times New Roman">Serif</option>
                    </select>
                    <select 
                      className="tool-btn" 
                      onChange={(e) => formatText(`fontSize:${e.target.value}`)} 
                      style={{ width: 'auto', padding: '0 8px', fontSize: '11px', fontWeight: 600 }}
                    >
                      <option value="2">12px</option>
                      <option value="1">9px</option>
                      <option value="1">10px</option>
                      <option value="3">14px</option>
                      <option value="4">16px</option>
                    </select>
                    <div style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 8px' }}></div>
                    <button className="tool-btn" style={{ fontWeight: '800', fontFamily: 'serif' }} onClick={() => formatText('bold')}>B</button>
                    <button className="tool-btn" style={{ fontStyle: 'italic', fontFamily: 'serif' }} onClick={() => formatText('italic')}>I</button>
                    <button className="tool-btn" style={{ textDecoration: 'underline', fontFamily: 'serif' }} onClick={() => formatText('underline')}>U</button>
                    
                    <div style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 8px' }}></div>
                    
                    {/* Color Presets */}
                    {/* Robust Color & Highlight Dropdowns */}
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <select 
                        className="tool-btn" 
                        onChange={(e) => formatText(`color:${e.target.value}`)}
                        style={{ width: 'auto', padding: '0 8px', fontSize: '11px', fontWeight: 600, color: '#1e293b' }}
                      >
                        <option value="#000">Color: Black</option>
                        <option value="#ef4444" style={{ color: '#ef4444' }}>🔴 Critical Red</option>
                        <option value="#f59e0b" style={{ color: '#f59e0b' }}>🟠 Warning Orange</option>
                        <option value="#3b82f6" style={{ color: '#3b82f6' }}>🔵 Clinical Blue</option>
                        <option value="#10b981" style={{ color: '#10b981' }}>🟢 Normal Green</option>
                        <option value="#8b5cf6" style={{ color: '#8b5cf6' }}>🟣 Special Purple</option>
                      </select>

                      <select 
                        className="tool-btn" 
                        onChange={(e) => formatText(`hilite:${e.target.value}`)}
                        style={{ width: 'auto', padding: '0 8px', fontSize: '11px', fontWeight: 600, color: '#1e293b' }}
                      >
                        <option value="transparent">Highlight: None</option>
                        <option value="#fef3c7" style={{ background: '#fef3c7' }}>✍️ Yellow</option>
                        <option value="#dcfce7" style={{ background: '#dcfce7' }}>✍️ Green</option>
                        <option value="#dbeafe" style={{ background: '#dbeafe' }}>✍️ Blue</option>
                        <option value="#fee2e2" style={{ background: '#fee2e2' }}>✍️ Red</option>
                      </select>
                      
                      <button className="tool-btn" style={{ color: '#ef4444', marginLeft: '4px' }} title="Reset All Colors" onClick={() => { formatText('color:#000'); formatText('hilite:transparent'); }}>✕</button>
                    </div>
                    <div style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 8px' }}></div>
                    <button className="tool-btn" title="Insert Table" onClick={() => setShowTableModal(true)}>▦</button>
                    <button className="tool-btn" title="Insert Image" onClick={() => fileInputRef.current.click()}>🖼️</button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      style={{ display: 'none' }} 
                      accept="image/*" 
                      onChange={handleImageUpload} 
                    />
                    <div style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 8px' }}></div>
                    <div style={{ flex: 1 }}></div>
                    <button 
                      className="btn btn-outline" 
                      onClick={toggleFullscreen}
                      style={{ 
                        fontSize: '11px', 
                        padding: '4px 12px', 
                        background: isFullscreen ? '#ef4444' : '#fff',
                        color: isFullscreen ? '#fff' : '#475569',
                        borderColor: isFullscreen ? '#ef4444' : '#cbd5e1'
                      }}
                    >
                      {isFullscreen ? '✕ Exit Fullscreen' : '⛶ Fullscreen'}
                    </button>
                  </div>
                  <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
                    <div 
                      ref={textareaRef}
                      contentEditable="true"
                      className="editor-textarea"
                      onInput={handleEditorChange}
                      onKeyDown={handleKeyDown}
                      onBlur={() => setTimeout(() => setSelectedImg(null), 200)}
                      style={{ height: 'calc(100vh - 450px)', minHeight: '300px' }}
                    />

                    {/* Bottom Narrative Inputs (Impression & Advice) */}
                    <div style={{ padding: '20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', gap: '20px' }}>
                       <div style={{ flex: 1 }}>
                          <label style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', display: 'block', marginBottom: '8px' }}>CLINICAL IMPRESSION</label>
                          <textarea 
                            value={impression}
                            onChange={(e) => setImpression(e.target.value)}
                            placeholder="Enter final study impression..."
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', minHeight: '80px', outline: 'none' }}
                          />
                       </div>
                       <div style={{ flex: 1 }}>
                          <label style={{ fontSize: '10px', fontWeight: 950, color: '#64748b', display: 'block', marginBottom: '8px' }}>FOLLOW-UP ADVICE</label>
                          <textarea 
                            value={advice}
                            onChange={(e) => setAdvice(e.target.value)}
                            placeholder="Enter patient advice..."
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', minHeight: '80px', outline: 'none' }}
                          />
                       </div>
                    </div>

                    {selectedImg && (
                      <div 
                        style={{ 
                          position: 'absolute', 
                          top: imgToolbarPos.top, 
                          left: imgToolbarPos.left, 
                          zIndex: 50, 
                          background: '#1e293b', 
                          padding: '5px', 
                          borderRadius: '8px', 
                          display: 'flex', 
                          gap: '5px',
                          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                        }}
                      >
                        <button onClick={() => resizeImg('25%')} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: '4px 8px' }}>S</button>
                        <button onClick={() => resizeImg('50%')} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: '4px 8px' }}>M</button>
                        <button onClick={() => resizeImg('75%')} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: '4px 8px' }}>L</button>
                        <button onClick={() => resizeImg('100%')} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: '4px 8px' }}>FULL</button>
                        <div style={{ width: '1px', height: '15px', background: '#475569', alignSelf: 'center' }}></div>
                        <button onClick={deleteImg} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: '4px 8px' }}>DEL</button>
                      </div>
                    )}
                    {showSlashMenu && (
                      <div className="inline-suggestion" style={{ top: cursorPos.top, left: cursorPos.left }}>
                        <div className="suggestion-item" onClick={() => handleSlashCommand('table')}>
                          <div className="sugg-header">
                            <span className="sugg-keyword">/table</span>
                            <span className="sugg-badge">INSERT</span>
                          </div>
                          <div className="sugg-preview">Insert a new measurement table</div>
                        </div>
                        <div className="suggestion-item" onClick={() => handleSlashCommand('diagram')}>
                          <div className="sugg-header">
                            <span className="sugg-keyword">/diagram</span>
                            <span className="sugg-badge">INSERT</span>
                          </div>
                          <div className="sugg-preview">Insert anatomical marking diagram</div>
                        </div>
                        <div className="suggestion-item" onClick={() => setShowSlashMenu(false)}>
                          <div className="sugg-header">
                            <span className="sugg-keyword">/normal</span>
                            <span className="sugg-badge">TEMPLATE</span>
                          </div>
                          <div className="sugg-preview">Apply normal study template</div>
                        </div>
                      </div>
                    )}

                    {showInlineSuggestion && (
                      <div className="inline-suggestion" style={{ top: '40px', left: '40px' }}>
                        <div className="suggestion-item active" onClick={handleSuggestionSelect}>
                          <div className="sugg-header">
                            <span className="sugg-keyword">gbstone</span>
                            <span className="sugg-badge">★ USG / GB</span>
                          </div>
                          <div className="sugg-preview">Gall bladder shows echogenic calculi with pos...</div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '10px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#64748b', borderRadius: '0 0 12px 12px' }}>
                    <div style={{ display: 'flex', gap: '15px' }}>
                       <span>{(editorText || '').replace(/<[^>]*>?/gm, '').split(/\s+/).filter(w => w.length > 0).length} words</span>
                       <span>Auto-saved just now</span>
                    </div>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>
                       SHORCUTS: <span style={{ background: '#e2e8f0', padding: '2px 4px', borderRadius: '3px' }}>Ctrl+S</span> Save | <span style={{ background: '#e2e8f0', padding: '2px 4px', borderRadius: '3px' }}>Ctrl+Enter</span> Finalize
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}

            {activeTab === 'Templates' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 250px)', gap: '15px', padding: '10px' }}>
                {/* Protocol Mode Switcher & Search Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '15px 25px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', gap: '10px', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
                    <button 
                      onClick={() => setTemplateViewMode('registry')}
                      style={{ 
                        padding: '8px 20px', borderRadius: '8px', border: 'none', 
                        background: templateViewMode === 'registry' ? 'white' : 'transparent',
                        color: templateViewMode === 'registry' ? '#4338ca' : '#64748b',
                        fontWeight: 900, fontSize: '11px', cursor: 'pointer', boxShadow: templateViewMode === 'registry' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                      }}
                    >DESIGNER_VIEW</button>
                    <button 
                      onClick={() => setTemplateViewMode('table')}
                      style={{ 
                        padding: '8px 20px', borderRadius: '8px', border: 'none', 
                        background: templateViewMode === 'table' ? 'white' : 'transparent',
                        color: templateViewMode === 'table' ? '#4338ca' : '#64748b',
                        fontWeight: 900, fontSize: '11px', cursor: 'pointer', boxShadow: templateViewMode === 'table' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                      }}
                    >REGISTRY_TABLE</button>
                  </div>

                  <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <div style={{ position: 'relative', width: '300px' }}>
                      <input 
                        type="text" 
                        placeholder="Filter blueprints..." 
                        value={templateSearch}
                        onChange={(e) => { setTemplateSearch(e.target.value); setTemplatePage(1); }}
                        style={{ width: '100%', padding: '10px 10px 10px 35px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 600, outline: 'none' }}
                      />
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
                    </div>
                    <button 
                      className="btn btn-primary" 
                      onClick={() => {
                        setSelectedTemplateId('new');
                        setTemplateViewMode('registry');
                        setNewTemplate({ name: '', modality: 'USG', sections: [] });
                      }}
                      style={{ padding: '10px 25px', fontSize: '11px', background: '#4338ca' }}
                    >+ INITIALIZE PROTOCOL</button>
                  </div>
                </div>

                {templateViewMode === 'registry' ? (
                  <div style={{ display: 'flex', gap: '25px', flex: 1, overflow: 'hidden', animation: 'fadeIn 0.4s ease' }}>
                    {/* LEFT: Master Protocol List */}
                    <div style={{ 
                      width: '320px', background: 'white', borderRadius: '20px', 
                      display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.02)',
                      border: '1px solid #e2e8f0', overflow: 'hidden'
                    }}>
                      <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                        <div style={{ fontSize: '12px', fontWeight: 950, color: '#4338ca', letterSpacing: '1px' }}>PROTOCOL_BLUEPRINTS</div>
                      </div>

                      <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
                        {paginatedTemplates.map(item => (
                          <div 
                            key={item.id}
                            onClick={() => {
                              setSelectedTemplateId(item.id);
                              try {
                                const sections = JSON.parse(item.content || item.Content || '[]');
                                setNewTemplate({ name: item.name || item.Name, modality: item.modality || item.Modality, sections });
                              } catch(e) {
                                setNewTemplate({ name: item.name || item.Name, modality: item.modality || item.Modality, sections: [] });
                              }
                            }}
                            style={{ 
                              padding: '15px', borderRadius: '16px', cursor: 'pointer',
                              background: selectedTemplateId === item.id ? '#4338ca' : '#f8faff',
                              color: selectedTemplateId === item.id ? 'white' : '#1e293b',
                              transition: 'all 0.2s', marginBottom: '8px',
                              border: selectedTemplateId === item.id ? '1px solid #4338ca' : '1px solid #edf2f7',
                              position: 'relative'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <span style={{ fontWeight: 950, fontSize: '13px' }}>{item.name || item.Name}</span>
                              <span style={{ 
                                fontSize: '8px', background: selectedTemplateId === item.id ? 'rgba(255,255,255,0.2)' : 'rgba(67, 56, 202, 0.1)', 
                                padding: '2px 6px', borderRadius: '4px', fontWeight: 900, color: selectedTemplateId === item.id ? 'white' : '#4338ca'
                              }}>{item.modality || item.Modality}</span>
                            </div>
                            <div style={{ fontSize: '10px', opacity: selectedTemplateId === item.id ? 0.8 : 0.5 }}>
                              {JSON.parse(item.content || item.Content || '[]').length} STRUCTURAL_FIELDS
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Pagination for Registry */}
                      <div style={{ padding: '15px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button disabled={templatePage === 1} onClick={() => setTemplatePage(templatePage - 1)} style={{ padding: '5px 10px', fontSize: '10px', fontWeight: 900, background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: templatePage === 1 ? 'not-allowed' : 'pointer' }}>PREV</button>
                        <span style={{ fontSize: '10px', fontWeight: 900, color: '#64748b' }}>PAGE {templatePage} / {totalTemplatePages || 1}</span>
                        <button disabled={templatePage >= totalTemplatePages} onClick={() => setTemplatePage(templatePage + 1)} style={{ padding: '5px 10px', fontSize: '10px', fontWeight: 900, background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: templatePage >= totalTemplatePages ? 'not-allowed' : 'pointer' }}>NEXT</button>
                      </div>
                    </div>

                    {/* RIGHT: Protocol Architect Detail */}
                    <div style={{ flex: 1, background: 'white', borderRadius: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.03)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      {selectedTemplateId ? (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                          <div style={{ padding: '25px 30px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fcfdfe' }}>
                            <div>
                              <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#1e293b', margin: 0 }}>{selectedTemplateId === 'new' ? 'PROTOCOL_ARCHITECT' : `EDIT: ${newTemplate.name}`}</h3>
                              <p style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginTop: '4px' }}>Design interactive clinical blueprints with structured data fields.</p>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                              {selectedTemplateId !== 'new' && <button className="btn btn-outline" style={{ color: '#ef4444', borderColor: '#fee2e2' }} onClick={() => handleDeleteTemplate(selectedTemplateId)}>🗑️ DELETE</button>}
                              <button className="btn btn-primary" style={{ padding: '10px 25px', background: '#4338ca' }} onClick={handleSaveTemplate}>{selectedTemplateId === 'new' ? '🚀 PUBLISH' : '💾 SAVE CHANGES'}</button>
                            </div>
                          </div>

                          <div style={{ flex: 1, padding: '30px', overflowY: 'auto' }}>
                            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                              {/* Header Meta */}
                              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '30px' }}>
                                <div>
                                  <label style={{ fontSize: '10px', fontWeight: 950, color: '#4338ca', display: 'block', marginBottom: '8px' }}>PROTOCOL_NAME</label>
                                  <input type="text" placeholder="e.g. Abdominal Ultrasound Standard" value={newTemplate.name} onChange={e => setNewTemplate({...newTemplate, name: e.target.value})} style={{ width: '100%', padding: '12px 15px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8faff', fontSize: '14px', fontWeight: 700, outline: 'none' }} />
                                </div>
                                <div>
                                  <label style={{ fontSize: '10px', fontWeight: 950, color: '#4338ca', display: 'block', marginBottom: '8px' }}>DIAGNOSTIC_MODALITY</label>
                                  <select value={newTemplate.modality} onChange={e => setNewTemplate({...newTemplate, modality: e.target.value})} style={{ width: '100%', padding: '12px 15px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8faff', fontSize: '14px', fontWeight: 700, outline: 'none' }}>
                                    {['USG', 'CT', 'MRI', 'X-RAY', 'DXA', 'MAMMO'].map(m => <option key={m} value={m}>{m}</option>)}
                                  </select>
                                </div>
                              </div>

                              {/* Structural Fields */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <label style={{ fontSize: '10px', fontWeight: 950, color: '#4338ca' }}>STRUCTURAL_COMPONENTS ({newTemplate.sections.length})</label>
                                <button className="btn btn-outline" style={{ fontSize: '10px', padding: '5px 12px' }} onClick={addSection}>+ ADD COMPONENT</button>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {newTemplate.sections.map((sec, idx) => (
                                  <div key={sec.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                        <span style={{ width: '24px', height: '24px', background: '#4338ca', color: 'white', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 900 }}>{idx + 1}</span>
                                        <input type="text" value={sec.title} onChange={e => updateSection(sec.id, 'title', e.target.value)} style={{ border: 'none', background: 'transparent', fontSize: '14px', fontWeight: 800, color: '#1e293b', width: '100%', outline: 'none' }} />
                                      </div>
                                      <button style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '14px', cursor: 'pointer', padding: '5px' }} onClick={() => removeSection(sec.id)}>🗑️</button>
                                    </div>
                                    <textarea placeholder="Enter clinical description or default findings..." value={sec.content} onChange={e => updateSection(sec.id, 'content', e.target.value)} style={{ width: '100%', minHeight: '80px', padding: '12px', borderRadius: '10px', border: '1px solid #f1f5f9', background: '#fcfdfe', fontSize: '13px', lineHeight: '1.6', outline: 'none', resize: 'vertical' }} />
                                  </div>
                                ))}
                                {newTemplate.sections.length === 0 && (
                                  <div style={{ textAlign: 'center', padding: '40px', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #e2e8f0', color: '#94a3b8', fontSize: '13px' }}>
                                    No components defined. Click "+ ADD COMPONENT" to begin structuring your protocol.
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', textAlign: 'center', padding: '40px' }}>
                          <div style={{ fontSize: '64px', marginBottom: '20px', opacity: 0.5 }}>📂</div>
                          <h3 style={{ fontSize: '20px', fontWeight: 800 }}>Protocol Blueprint Gallery</h3>
                          <p style={{ maxWidth: '400px', fontSize: '13px', marginTop: '10px' }}>Select an existing protocol to modify its architecture, or initialize a new clinical blueprint for structured reporting.</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ flex: 1, background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadeIn 0.5s ease', boxShadow: '0 20px 50px rgba(0,0,0,0.03)' }}>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 10 }}>
                          <tr>
                            <th style={{ padding: '15px 25px', fontSize: '11px', fontWeight: 950, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>PROTOCOL_NAME</th>
                            <th style={{ padding: '15px 25px', fontSize: '11px', fontWeight: 950, color: '#475569', borderBottom: '2px solid #e2e8f0', width: '150px' }}>MODALITY</th>
                            <th style={{ padding: '15px 25px', fontSize: '11px', fontWeight: 950, color: '#475569', borderBottom: '2px solid #e2e8f0', width: '180px' }}>COMPLEXITY</th>
                            <th style={{ padding: '15px 25px', fontSize: '11px', fontWeight: 950, color: '#475569', borderBottom: '2px solid #e2e8f0', textAlign: 'center', width: '150px' }}>ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedTemplates.map((item, idx) => {
                            let sections = [];
                            try { sections = JSON.parse(item.content || item.Content || '[]'); } catch(e) {}
                            return (
                              <tr key={item.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fcfdfe', borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '20px 25px' }}>
                                  <div style={{ fontSize: '14px', fontWeight: 900, color: '#1e293b' }}>{item.name || item.Name}</div>
                                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>{item.description || 'Clinical reporting protocol'}</div>
                                </td>
                                <td style={{ padding: '20px 25px' }}>
                                  <span style={{ background: 'rgba(67, 56, 202, 0.1)', color: '#4338ca', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 950 }}>{item.modality || item.Modality}</span>
                                </td>
                                <td style={{ padding: '20px 25px' }}>
                                  <div style={{ display: 'flex', gap: '3px' }}>
                                    {[1,2,3].map(i => (
                                      <div key={i} style={{ width: '12px', height: '4px', borderRadius: '2px', background: i <= Math.min(sections.length, 3) ? '#4338ca' : '#e2e8f0' }}></div>
                                    ))}
                                    <span style={{ fontSize: '10px', color: '#64748b', marginLeft: '5px' }}>{sections.length} Fields</span>
                                  </div>
                                </td>
                                <td style={{ padding: '20px 25px', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                    <button 
                                      onClick={() => {
                                        setSelectedTemplateId(item.id);
                                        setNewTemplate({
                                          name: item.name || item.Name,
                                          modality: item.modality || item.Modality,
                                          sections: sections
                                        });
                                        setTemplateViewMode('registry');
                                      }}
                                      style={{ padding: '8px 15px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
                                    >ARCHITECT</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Protocol Table Pagination Controls */}
                    <div style={{ padding: '20px 25px', borderTop: '2px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                        Showing <span style={{ color: '#4338ca', fontWeight: 950 }}>{paginatedTemplates.length}</span> blueprints
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button disabled={templatePage === 1} onClick={() => setTemplatePage(templatePage - 1)} style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', fontSize: '11px', fontWeight: 900, cursor: templatePage === 1 ? 'not-allowed' : 'pointer', opacity: templatePage === 1 ? 0.5 : 1 }}>← PREVIOUS</button>
                        <button disabled={templatePage >= totalTemplatePages} onClick={() => setTemplatePage(templatePage + 1)} style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', fontSize: '11px', fontWeight: 900, cursor: templatePage >= totalTemplatePages ? 'not-allowed' : 'pointer', opacity: templatePage >= totalTemplatePages ? 0.5 : 1 }}>NEXT →</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'Keywords' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 250px)', gap: '15px', padding: '10px' }}>
                {/* Mode Switcher & Search Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '15px 25px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', gap: '10px', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
                    <button 
                      onClick={() => setKeywordViewMode('registry')}
                      style={{ 
                        padding: '8px 20px', borderRadius: '8px', border: 'none', 
                        background: keywordViewMode === 'registry' ? 'white' : 'transparent',
                        color: keywordViewMode === 'registry' ? '#0f52ba' : '#64748b',
                        fontWeight: 900, fontSize: '11px', cursor: 'pointer', boxShadow: keywordViewMode === 'registry' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                      }}
                    >REGISTRY_VIEW</button>
                    <button 
                      onClick={() => setKeywordViewMode('table')}
                      style={{ 
                        padding: '8px 20px', borderRadius: '8px', border: 'none', 
                        background: keywordViewMode === 'table' ? 'white' : 'transparent',
                        color: keywordViewMode === 'table' ? '#0f52ba' : '#64748b',
                        fontWeight: 900, fontSize: '11px', cursor: 'pointer', boxShadow: keywordViewMode === 'table' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                      }}
                    >TABULAR_OVERVIEW</button>
                  </div>

                  <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <div style={{ position: 'relative', width: '300px' }}>
                      <input 
                        type="text" 
                        placeholder="Search macros..." 
                        value={keywordSearch}
                        onChange={(e) => { setKeywordSearch(e.target.value); setKeywordPage(1); }}
                        style={{ width: '100%', padding: '10px 10px 10px 35px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 600, outline: 'none' }}
                      />
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
                    </div>
                    <button 
                      className="btn btn-primary" 
                      onClick={() => {
                        setSelectedKeywordId('new');
                        setKeywordViewMode('registry');
                        setNewMacro({ trigger: '', replacementText: '' });
                      }}
                      style={{ padding: '10px 20px', fontSize: '11px' }}
                    >+ INITIALIZE NEW</button>
                  </div>
                </div>

                {keywordViewMode === 'registry' ? (
                  <div style={{ display: 'flex', gap: '25px', flex: 1, overflow: 'hidden', animation: 'fadeIn 0.4s ease' }}>
                    {/* LEFT: Master Keyword List */}
                    <div style={{ 
                      width: '320px', 
                      background: 'white', 
                      borderRadius: '20px', 
                      display: 'flex', 
                      flexDirection: 'column',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.02)',
                      border: '1px solid #e2e8f0',
                      overflow: 'hidden'
                    }}>
                      <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
                        {paginatedKeywords.map(item => (
                          <div 
                            key={item.id}
                            onClick={() => {
                              setSelectedKeywordId(item.id);
                              setNewMacro({ trigger: item.trigger, replacementText: item.replacementText });
                            }}
                            style={{ 
                              padding: '15px', 
                              borderRadius: '16px', 
                              cursor: 'pointer',
                              background: selectedKeywordId === item.id ? '#0f52ba' : '#f8faff',
                              color: selectedKeywordId === item.id ? 'white' : '#1e293b',
                              transition: 'all 0.2s',
                              marginBottom: '8px',
                              border: selectedKeywordId === item.id ? '1px solid #0f52ba' : '1px solid #edf2f7',
                              position: 'relative',
                              overflow: 'hidden'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <span style={{ fontWeight: 950, fontSize: '14px', fontFamily: 'monospace' }}>/{item.trigger}</span>
                              <span style={{ 
                                fontSize: '8px', 
                                background: selectedKeywordId === item.id ? 'rgba(255,255,255,0.2)' : 'rgba(15, 82, 186, 0.1)', 
                                padding: '2px 6px', 
                                borderRadius: '4px',
                                fontWeight: 900,
                                letterSpacing: '1px'
                              }}>MACRO</span>
                            </div>
                            <div style={{ 
                              fontSize: '11px', 
                              opacity: selectedKeywordId === item.id ? 0.8 : 0.6, 
                              lineHeight: '1.4',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}>
                              {item.replacementText?.replace(/<[^>]*>?/gm, '') || 'No content defined...'}
                            </div>
                            {selectedKeywordId === item.id && (
                              <div style={{ position: 'absolute', right: '0', top: '0', bottom: '0', width: '4px', background: '#60a5fa' }}></div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Pagination for Registry */}
                      <div style={{ padding: '15px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button disabled={keywordPage === 1} onClick={() => setKeywordPage(keywordPage - 1)} style={{ padding: '5px 10px', fontSize: '10px', fontWeight: 900, background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: keywordPage === 1 ? 'not-allowed' : 'pointer' }}>PREV</button>
                        <span style={{ fontSize: '10px', fontWeight: 900, color: '#64748b' }}>PAGE {keywordPage} / {totalKeywordPages || 1}</span>
                        <button disabled={keywordPage >= totalKeywordPages} onClick={() => setKeywordPage(keywordPage + 1)} style={{ padding: '5px 10px', fontSize: '10px', fontWeight: 900, background: '#f1f5f9', border: 'none', borderRadius: '6px', cursor: keywordPage >= totalKeywordPages ? 'not-allowed' : 'pointer' }}>NEXT</button>
                      </div>
                    </div>

                    {/* RIGHT: Keyword Detail / Editor */}
                    <div style={{ flex: 1, background: 'white', borderRadius: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.03)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      {selectedKeywordId ? (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                          <div style={{ padding: '25px 30px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fcfdfe' }}>
                            <div>
                              <h3 style={{ fontSize: '18px', fontWeight: 950, color: '#1e293b', margin: 0 }}>
                                {selectedKeywordId === 'new' ? 'CREATE_DIAGNOSTIC_MACRO' : `EDIT: /${newMacro.trigger}`}
                              </h3>
                              <p style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginTop: '4px' }}>Configure shorthands for rapid narrative expansion.</p>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                              {selectedKeywordId !== 'new' && (
                                <button 
                                  className="btn btn-outline" 
                                  style={{ color: '#ef4444', borderColor: '#fee2e2' }}
                                  onClick={() => handleDeleteKeyword(selectedKeywordId)}
                                >🗑️ DELETE</button>
                              )}
                              <button className="btn btn-primary" style={{ padding: '10px 25px' }} onClick={handleSaveMacro}>
                                {selectedKeywordId === 'new' ? '🚀 PUBLISH MACRO' : '💾 SAVE CHANGES'}
                              </button>
                            </div>
                          </div>

                          <div style={{ flex: 1, padding: '30px', overflowY: 'auto', background: '#fff' }}>
                            <div style={{ maxWidth: '700px' }}>
                              <div style={{ marginBottom: '25px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', display: 'block', marginBottom: '8px' }}>TRIGGER KEYWORD (CASE INSENSITIVE)</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span style={{ fontSize: '20px', fontWeight: 900, color: '#cbd5e1' }}>/</span>
                                  <input 
                                    type="text" 
                                    placeholder="e.g. normal_liver"
                                    value={newMacro.trigger}
                                    onChange={e => setNewMacro({...newMacro, trigger: e.target.value.toLowerCase().replace(/\s+/g, '_')})}
                                    style={{ flex: 1, padding: '15px', borderRadius: '12px', border: '2px solid #eff6ff', background: '#f8faff', fontSize: '16px', fontWeight: 900, color: '#0f52ba', outline: 'none' }}
                                  />
                                </div>
                              </div>

                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                  <label style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba' }}>REPLACEMENT NARRATIVE</label>
                                  <div style={{ display: 'flex', gap: '5px', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                                    <button className="tool-btn" style={{ fontWeight: 800, width: '30px', height: '30px' }} onClick={() => formatMacroText('bold')}>B</button>
                                    <button className="tool-btn" style={{ fontStyle: 'italic', width: '30px', height: '30px' }} onClick={() => formatMacroText('italic')}>I</button>
                                    <button className="tool-btn" style={{ textDecoration: 'underline', width: '30px', height: '30px' }} onClick={() => formatMacroText('underline')}>U</button>
                                  </div>
                                </div>
                                <div 
                                  ref={macroTextareaRef}
                                  contentEditable="true"
                                  onInput={(e) => setNewMacro({...newMacro, replacementText: e.currentTarget.innerHTML})}
                                  style={{ 
                                    minHeight: '300px', 
                                    padding: '25px', 
                                    borderRadius: '16px', 
                                    border: '1px solid #e2e8f0', 
                                    background: '#fff', 
                                    outline: 'none', 
                                    fontSize: '15px', 
                                    lineHeight: '1.8',
                                    color: '#1e293b',
                                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', textAlign: 'center', padding: '40px' }}>
                          <div style={{ fontSize: '64px', marginBottom: '20px', opacity: 0.5 }}>⌨️</div>
                          <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b' }}>Macro Maintenance Hub</h3>
                          <p style={{ maxWidth: '400px', fontSize: '13px', lineHeight: '1.6', marginTop: '10px' }}>
                            Select a keyword from the left registry to modify its expansion text, or initialize a new clinical shortcut to speed up your reporting workflow.
                          </p>
                          <button 
                            className="btn btn-primary" 
                            style={{ marginTop: '25px', padding: '12px 30px' }}
                            onClick={() => setSelectedKeywordId('new')}
                          >+ INITIALIZE NEW MACRO</button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ flex: 1, background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadeIn 0.5s ease', boxShadow: '0 20px 50px rgba(0,0,0,0.03)' }}>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 10 }}>
                          <tr>
                            <th style={{ padding: '15px 25px', fontSize: '11px', fontWeight: 950, color: '#475569', borderBottom: '2px solid #e2e8f0', width: '200px' }}>TRIGGER_SHORTHAND</th>
                            <th style={{ padding: '15px 25px', fontSize: '11px', fontWeight: 950, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>CLINICAL_NARRATIVE_EXPANSION</th>
                            <th style={{ padding: '15px 25px', fontSize: '11px', fontWeight: 950, color: '#475569', borderBottom: '2px solid #e2e8f0', textAlign: 'center', width: '150px' }}>ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedKeywords.map((item, idx) => (
                            <tr key={item.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fcfdfe', borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }}>
                              <td style={{ padding: '20px 25px', verticalAlign: 'top' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span style={{ background: '#0f52ba', color: 'white', padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 950, fontFamily: 'monospace' }}>/{item.trigger}</span>
                                </div>
                              </td>
                              <td style={{ padding: '20px 25px' }}>
                                <div style={{ fontSize: '14px', color: '#1e293b', lineHeight: '1.6', maxWidth: '850px' }}>
                                  {item.replacementText?.replace(/<[^>]*>?/gm, '') || '...'}
                                </div>
                              </td>
                              <td style={{ padding: '20px 25px', textAlign: 'center', verticalAlign: 'top' }}>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                  <button 
                                    onClick={() => {
                                      setSelectedKeywordId(item.id);
                                      setNewMacro({ trigger: item.trigger, replacementText: item.replacementText });
                                      setKeywordViewMode('registry');
                                    }}
                                    style={{ padding: '8px 15px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
                                  >EDIT</button>
                                  <button 
                                    onClick={() => handleDeleteKeyword(item.id)}
                                    style={{ padding: '8px 15px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fff5f5', color: '#ef4444', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
                                  >DEL</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Table Pagination Controls */}
                    <div style={{ padding: '20px 25px', borderTop: '2px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                        Showing <span style={{ color: '#0f52ba', fontWeight: 950 }}>{paginatedKeywords.length}</span> of <span style={{ color: '#0f52ba', fontWeight: 950 }}>{filteredKeywords.length}</span> total clinical macros
                      </div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <button 
                          disabled={keywordPage === 1} 
                          onClick={() => setKeywordPage(keywordPage - 1)}
                          style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', fontSize: '11px', fontWeight: 900, cursor: keywordPage === 1 ? 'not-allowed' : 'pointer', opacity: keywordPage === 1 ? 0.5 : 1 }}
                        >← PREVIOUS</button>
                        
                        <div style={{ display: 'flex', gap: '5px' }}>
                          {[...Array(totalKeywordPages)].map((_, i) => (
                            <button 
                              key={i} 
                              onClick={() => setKeywordPage(i + 1)}
                              style={{ 
                                width: '36px', height: '36px', borderRadius: '10px', border: 'none',
                                background: keywordPage === i + 1 ? '#0f52ba' : 'transparent',
                                color: keywordPage === i + 1 ? 'white' : '#64748b',
                                fontWeight: 950, fontSize: '11px', cursor: 'pointer'
                              }}
                            >{i + 1}</button>
                          ))}
                        </div>

                        <button 
                          disabled={keywordPage >= totalKeywordPages} 
                          onClick={() => setKeywordPage(keywordPage + 1)}
                          style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', fontSize: '11px', fontWeight: 900, cursor: keywordPage >= totalKeywordPages ? 'not-allowed' : 'pointer', opacity: keywordPage >= totalKeywordPages ? 0.5 : 1 }}
                        >NEXT →</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '15px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#0f172a' }}>Dr. Amit Sharma</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Consultant Radiologist</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- MODALS & DRAWERS --- */}

      {/* Insert Table Modal */}
      {/* Insert Table Modal */}
      {showTableModal && (
        <div className="overlay" style={{ zIndex: 10001 }} onClick={() => { setShowTableModal(false); setShowTableBuilder(false); }}>
          <div className="modal" style={{ width: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>{showTableBuilder ? 'ΓÜÖ∩╕Å Table Configuration' : 'Γûª Insert Measurement Table'}</span>
              <button className="tool-btn" onClick={() => { setShowTableModal(false); setShowTableBuilder(false); }}>Γ£ò</button>
            </div>
            <div className="modal-body">
              {!showTableBuilder ? (
                <>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '15px' }}>Choose a preset to insert into your report:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {tablePresets.map(preset => (
                      <div key={preset.id} className="preset-card" onClick={() => insertTable(preset)} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ fontSize: '20px' }}>Γûª</div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700 }}>{preset.name}</div>
                          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>{preset.columns.length} columns</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className="btn btn-primary" style={{ width: '100%', marginTop: '20px' }} onClick={() => setShowTableBuilder(true)}>+ Configure New Table Type</button>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '5px' }}>TABLE NAME</label>
                    <input 
                      type="text" 
                      placeholder="e.g., Fetal Growth" 
                      value={newTable.name}
                      onChange={e => setNewTable({...newTable, name: e.target.value})}
                      style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '5px' }}>COLUMN HEADERS</label>
                    {newTable.columns.map((col, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '5px', marginBottom: '8px' }}>
                        <input 
                          type="text" 
                          placeholder={`Column ${idx + 1}`} 
                          value={col}
                          onChange={e => {
                            const newCols = [...newTable.columns];
                            newCols[idx] = e.target.value;
                            setNewTable({...newTable, columns: newCols});
                          }}
                          style={{ flex: 1, padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                        />
                        <button 
                          className="tool-btn" 
                          onClick={() => {
                            const newCols = newTable.columns.filter((_, i) => i !== idx);
                            setNewTable({...newTable, columns: newCols});
                          }}
                          style={{ background: '#fecaca', color: '#dc2626' }}
                        >Γ£ò</button>
                      </div>
                    ))}
                    <button className="btn btn-outline" style={{ width: '100%', fontSize: '12px' }} onClick={() => setNewTable({...newTable, columns: [...newTable.columns, '']})}>+ Add Column</button>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowTableBuilder(false)}>Cancel</button>
                    <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSaveTable}>Save Table Preset</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {renderPreviewModal()}
      {renderShortcutsHelp()}
    </div>
  );
};

export default ReportingPage;
