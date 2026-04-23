import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import JSZip from 'jszip';
import dicomParser from 'dicom-parser';
import AdvancedDicomViewer from '../components/AdvancedDicomViewer';
import apiClient from '../api/apiClient';

const ReportingPage = () => {
  const [activeTab, setActiveTab] = useState('Structured');
  const [showKeywordDrawer, setShowKeywordDrawer] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [editorText, setEditorText] = useState('Liver is normal in size and echotexture. No focal hepatic lesion is seen.\n\n');
  const [showInlineSuggestion, setShowInlineSuggestion] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [cursorPos, setCursorPos] = useState({ top: 0, left: 0 });
  const [history, setHistory] = useState([editorText]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [templates, setTemplates] = useState([
    { id: 1, name: 'USG Whole Abdomen', modality: 'USG', lastModified: '2 days ago' },
    { id: 2, name: 'USG KUB', modality: 'USG', lastModified: '1 week ago' }
  ]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ 
    name: '', 
    modality: 'USG', 
    sections: [
      { id: 1, title: 'Clinical History', content: 'Pain abdomen, fever.' },
      { id: 2, title: 'Findings', content: 'LIVER: Normal size.\nKIDNEYS: {{size}} cm.' },
      { id: 3, title: 'Impression', content: 'Normal study.' }
    ]
  });
  const [keywordLibrary, setKeywordLibrary] = useState([
    { id: 1, keyword: 'normal_liver', paragraph: 'LIVER: Normal in size and echotexture. No focal lesion seen. Intrahepatic biliary radicals are not dilated.' },
    { id: 2, keyword: 'gb_stone', paragraph: 'GALL BLADDER: Shows echogenic calculi with posterior acoustic shadowing. No pericholecystic fluid is seen.' }
  ]);
  const [tablePresets, setTablePresets] = useState([
    { id: 1, name: 'Lesion Measurement', columns: ['Lesion #', 'Location', 'Size (cm)', 'Description'] },
    { id: 2, name: 'Organ Dimensions', columns: ['Organ', 'Size (cm)', 'Echotexture', 'Contours'] }
  ]);
  const [showTableBuilder, setShowTableBuilder] = useState(false);
  const [newTable, setNewTable] = useState({ name: '', columns: [''] });
  const [showNewKeywordForm, setShowNewKeywordForm] = useState(false);
  const [newMacro, setNewMacro] = useState({ keyword: '', paragraph: '' });
  const textareaRef = useRef(null);
  const macroTextareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [selectedImg, setSelectedImg] = useState(null);
  const [imgToolbarPos, setImgToolbarPos] = useState({ top: 0, left: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- DICOM VIEWER STATES ---
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
  const [isDicomImage, setIsDicomImage] = useState(false);

  // Mock patient data
  const patient = {
    name: 'Rina Das',
    age: '34/F',
    uhid: 'UH-29484',
    study: 'USG Whole Abdomen',
    history: 'Pain abdomen, fever',
    accession: 'ACC-20230910',
    modality: 'US',
    refDoctor: 'Dr. A. Sharma'
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
      try {
        const zip = await JSZip.loadAsync(file);
        const seriesGroups = {};

        for (const fileName of Object.keys(zip.files)) {
          const zipFile = zip.files[fileName];
          if (!zipFile.dir && !fileName.includes('__MACOSX')) {
            const content = await zipFile.async('arraybuffer');
            const dcmFile = new File([content], fileName.split('/').pop(), { type: 'application/dicom' });
            
            try {
              const byteArray = new Uint8Array(content);
              const dataSet = dicomParser.parseDicom(byteArray);
              if (!dataSet.elements['x7fe00010']) continue;

              const seriesUID = dataSet.string('x0020000e') || 'UNKNOWN';
              const seriesDesc = dataSet.string('x0008103e') || 'UNNAMED SERIES';
              const instanceNum = parseInt(dataSet.string('x00200013') || '0', 10);

              if (!seriesGroups[seriesUID]) {
                seriesGroups[seriesUID] = { seriesUID, seriesDesc, files: [] };
              }
              seriesGroups[seriesUID].files.push({ file: dcmFile, instanceNum });
            } catch (err) {}
          }
        }
        
        const assets = Object.values(seriesGroups).map(group => ({
          name: group.seriesDesc,
          rawFiles: group.files.sort((a, b) => a.instanceNum - b.instanceNum).map(f => f.file),
          size: `${group.files.length} slices`
        }));
        
        setUploadedFiles(assets);
        setIsDicomImage(true);
      } catch (err) {
        console.error('ZIP load failed', err);
      } finally {
        setLoading(false);
      }
    }
  };



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

  const handleSuggestionSelect = () => {
    insertContent('Gall bladder shows echogenic calculi with posterior acoustic shadowing. No pericholecystic fluid is seen.');
    setShowInlineSuggestion(false);
  };

  const handlePreviewPrint = () => {
    const printWindow = window.open('', '_blank');
    const headerHtml = `
      <div style="border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between;">
          <h2 style="margin:0;">CITY RADIOLOGY CENTER</h2>
          <div style="text-align: right; font-size: 12px;">
            Date: ${new Date().toLocaleDateString()}<br/>
            Ref: ${patient.accession}
          </div>
        </div>
        <div style="margin-top: 15px; display: grid; grid-template-columns: 1fr 1fr 1fr; font-size: 13px; gap: 10px;">
          <div><strong>PATIENT:</strong> ${patient.name}</div>
          <div><strong>AGE/SEX:</strong> ${patient.age}</div>
          <div><strong>UHID:</strong> ${patient.uhid}</div>
          <div><strong>STUDY:</strong> ${patient.modality} WHOLE ABDOMEN</div>
          <div><strong>REFERRING:</strong> DR. SELF</div>
        </div>
      </div>
    `;

    const footerHtml = `
      <div style="margin-top: 50px; border-top: 1px solid #eee; pt: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-end;">
          <div style="font-size: 10px; color: #666;">Generated by 1Rad Suite</div>
          <div style="text-align: center; width: 200px;">
            <div style="margin-bottom: 10px;">_________________________</div>
            <strong>Dr. Amit Sharma</strong><br/>
            <span style="font-size: 11px;">MD, Radiology</span>
          </div>
        </div>
      </div>
    `;

    let bodyHtml = '';
    if (activeTab === 'Structured') {
      bodyHtml = `
        <h3 style="text-align: center; text-decoration: underline;">STRUCTURED RADIOLOGY REPORT</h3>
        <div style="margin-top: 20px;">
          ${templates[0].sections.map(s => `
            <div style="margin-bottom: 15px;">
              <strong style="text-transform: uppercase; color: #444;">${s.title}:</strong>
              <div style="padding-left: 15px; margin-top: 5px;">${s.content}</div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      bodyHtml = `
        <h3 style="text-align: center; text-decoration: underline;">RADIOLOGY REPORT</h3>
        <div style="margin-top: 20px; line-height: 1.6;">
          ${editorText}
        </div>
      `;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Preview Report - ${patient.name}</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            img { max-width: 300px; display: block; margin: 10px 0; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          ${headerHtml}
          ${bodyHtml}
          ${footerHtml}
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
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

      const match = keywordLibrary.find(k => k.keyword.toLowerCase() === lastSegment.toLowerCase());
      if (match) {
        e.preventDefault();
        
        // Remove the keyword text
        range.setStart(range.startContainer, cursor - lastSegment.length);
        range.deleteContents();
        
        // Insert the paragraph
        const html = match.paragraph.replace(/\n/g, '<br>');
        document.execCommand('insertHTML', false, html);
        
        setEditorText(el.innerHTML);
      }
    }
  };

  const handleSaveMacro = () => {
    if (!newMacro.keyword || !newMacro.paragraph) return alert('Please fill both fields');
    setKeywordLibrary([...keywordLibrary, { id: Date.now(), ...newMacro }]);
    setShowNewKeywordForm(false);
    setNewMacro({ keyword: '', paragraph: '' });
    if (macroTextareaRef.current) macroTextareaRef.current.innerHTML = '';
  };

  const formatMacroText = (style) => {
    const el = macroTextareaRef.current;
    if (!el) return;
    el.focus();
    if (style === 'bold') document.execCommand('bold', false, null);
    else if (style === 'italic') document.execCommand('italic', false, null);
    else if (style === 'underline') document.execCommand('underline', false, null);
    setNewMacro({ ...newMacro, paragraph: el.innerHTML });
  };

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

  const handleSaveTemplate = () => {
    if (!newTemplate.name) return alert('Please enter a template name');
    const template = {
      ...newTemplate,
      id: Date.now(),
      lastModified: 'Just now',
      contentPreview: newTemplate.sections.map(s => s.title).join(', ')
    };
    setTemplates([template, ...templates]);
    setShowTemplateForm(false);
    setNewTemplate({ 
      name: '', 
      modality: 'USG', 
      sections: [
        { id: 1, title: 'Clinical History', content: '' },
        { id: 2, title: 'Findings', content: '' },
        { id: 3, title: 'Impression', content: '' },
        { id: 4, title: 'Recommendation', content: '' }
      ] 
    });
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

  return (
    <div className="reporting-app-container">
      {/* SCOPED CSS */}
      <style>{`
        .reporting-app-container {
          height: 100vh;
          width: 100%;
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
        .panel-center { flex: 1; background: #0f172a; padding: 0; display: flex; flex-direction: column; }
        .panel-right { flex: 1; background: #ffffff; padding: 20px 30px; overflow-y: auto; display: flex; flexDirection: column; }

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
      `}</style>

      {/* --- HEADER --- */}
      <header className="reporting-header">
        <div className="header-left">
          <button className="back-btn">← Worklist</button>
          <div className="patient-badge-header">
            <div>
              <div style={{ fontSize: '20px', fontWeight: 950, color: '#1a1a2e', letterSpacing: '-0.5px' }}>{patient.name?.toUpperCase()}</div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>ID: {patient.uhid}</span>
                <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>ACC: {patient.accession}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginLeft: '15px' }}>
              <span style={{ background: '#0f52ba', color: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 950, letterSpacing: '1px' }}>{patient.modality}</span>
            </div>
          </div>
        </div>
        <div className="header-right">
          <button className="btn btn-outline" onClick={() => setActiveTab('Keywords')}>⌨️ Keywords</button>
          <div style={{ marginLeft: '10px', padding: '6px 12px', background: '#eff6ff', borderRadius: '6px', border: '1px solid #dbeafe' }}>
            <span style={{ fontSize: '10px', fontWeight: 950, color: '#1e40af', letterSpacing: '1px' }}>STATUS: </span>
            <span style={{ fontSize: '11px', fontWeight: 950, color: '#2563eb' }}>DRAFT_SAVED</span>
          </div>
        </div>
      </header>

      {/* --- MAIN LAYOUT --- */}
      <div className="main-layout">
        
        {/* LEFT PANEL removed for cleaner workspace */}

        {/* CENTER PANEL: DICOM Viewer */}
        <div className="panel panel-center">
          <div className="viewer-header" style={{ height: '54px', background: '#0f172a', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', padding: '0 15px', gap: '8px' }}>
            {[
              { id: 'WindowLevel', icon: '☀️', label: 'W/L' },
              { id: 'Zoom', icon: '🔍', label: 'ZOOM' },
              { id: 'Pan', icon: '✋', label: 'PAN' },
              { id: 'Length', icon: '📏', label: 'LEN' },
              { id: 'Angle', icon: '📐', label: 'ANG' },
              { id: 'ArrowAnnotate', icon: '↗️', label: 'ANN' }
            ].map(t => (
              <button 
                key={t.id}
                onClick={() => setActiveTool(t.id)}
                style={{ 
                  background: activeTool === t.id ? '#3b82f6' : 'rgba(255,255,255,0.05)', 
                  border: 'none', 
                  color: activeTool === t.id ? 'white' : '#94a3b8',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '10px',
                  fontWeight: 950,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
            
            <div style={{ width: '1px', height: '24px', background: '#334155', margin: '0 8px' }}></div>
            
            <button onClick={() => setCineEnabled(!cineEnabled)} style={{ background: cineEnabled ? '#3b82f6' : 'rgba(255,255,255,0.05)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}>🎬 CINE</button>
            <button onClick={() => setIsSyncEnabled(!isSyncEnabled)} style={{ background: isSyncEnabled ? '#3b82f6' : 'rgba(255,255,255,0.05)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}>🔗 SYNC</button>

            <div style={{ flex: 1 }}></div>

            <select 
              value={layoutMode} 
              onChange={e => setLayoutMode(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid #334155', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 950, outline: 'none' }}
            >
              <option value="1x1">1X1</option>
              <option value="2x2">2X2</option>
            </select>
          </div>

          <div style={{ flex: 1, background: '#000', position: 'relative', display: 'flex', gap: '2px', padding: '2px' }}>
            {uploadedFiles.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: '12px', fontWeight: 950, letterSpacing: '2px', flexDirection: 'column', gap: '20px' }}>
                <div style={{ fontSize: '48px', opacity: 0.2 }}>📡</div>
                WAITING_FOR_DATA_SIGNAL
              </div>
            ) : (
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: layoutMode === '2x2' ? '1fr 1fr' : '1fr', gridTemplateRows: layoutMode === '2x2' ? '1fr 1fr' : '1fr', gap: '2px' }}>
                {[...Array(layoutMode === '2x2' ? 4 : 1)].map((_, idx) => (
                  <div key={idx} style={{ position: 'relative', background: '#000', overflow: 'hidden' }}>
                    <AdvancedDicomViewer 
                      key={`${activeAssetIndex}_${idx}`} 
                      files={uploadedFiles[(activeAssetIndex + idx) % uploadedFiles.length]?.rawFiles} 
                      activeTool={activeTool}
                      isCine={cineEnabled}
                      isSynced={isSyncEnabled}
                      layoutMode={layoutMode}
                      keyImages={keyImages}
                      onKeyImageToggle={toggleKeyImage}
                    />
                    <div style={{ position: 'absolute', top: '15px', left: '15px', zIndex: 10 }}>
                      <div style={{ background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(8px)', padding: '4px 10px', borderRadius: '6px', fontSize: '9px', color: '#94a3b8', fontWeight: 950, letterSpacing: '1px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        {uploadedFiles[(activeAssetIndex + idx) % uploadedFiles.length]?.name.toUpperCase()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Reporting Workspace */}
        <div className="panel panel-right">
          <div className="tabs">
            <div className={`tab ${activeTab === 'Structured' ? 'active' : ''}`} onClick={() => setActiveTab('Structured')}>Structured</div>
            <div className={`tab ${activeTab === 'Narrative Editor' ? 'active' : ''}`} onClick={() => setActiveTab('Narrative Editor')}>Narrative Editor</div>
            <div className={`tab ${activeTab === 'Templates' ? 'active' : ''}`} onClick={() => setActiveTab('Templates')}>Templates</div>
            <div className={`tab ${activeTab === 'Keywords' ? 'active' : ''}`} onClick={() => setActiveTab('Keywords')}>Keywords</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: '5px' }}>
            {activeTab === 'Structured' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div className="struct-container" style={{ flex: 1, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '15px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '8px', letterSpacing: '1px' }}>Active Template</label>
                      <select className="template-selector" defaultValue="usg_abdomen" style={{ margin: 0, width: '100%', maxWidth: '300px', fontWeight: 700 }}>
                        <option value="usg_abdomen">USG Whole Abdomen - Standard</option>
                        <option value="usg_kub">USG KUB</option>
                        <option value="usg_pelvis">USG Pelvis</option>
                      </select>
                    </div>
                    <div style={{ width: '150px', marginLeft: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>COMPLETION</span>
                        <span style={{ fontSize: '10px', fontWeight: 950, color: '#10b981' }}>85%</span>
                      </div>
                      <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: '85%', height: '100%', background: '#10b981' }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="struct-section">
                    <div className="struct-header">
                      <span>Clinical History</span>
                      <span className="status-indicator"></span>
                    </div>
                    <textarea 
                      className="struct-textarea" 
                      placeholder="Type 'gbstone'..."
                    />
                  </div>
                  
                  <div className="struct-section">
                    <div className="struct-header">
                      <span>CBD</span>
                      <span className="status-indicator"></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input type="text" defaultValue="5" style={{ width: '60px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
                      <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>mm</span>
                    </div>
                  </div>

                  <div className="struct-section">
                    <div className="struct-header">
                      <span>Pancreas</span>
                      <span className="status-indicator status-empty"></span>
                    </div>
                    <textarea className="struct-textarea" placeholder="Normal" />
                  </div>
                  
                  <div className="struct-section">
                    <div className="struct-header">
                      <span>Spleen</span>
                      <span className="status-indicator status-empty"></span>
                    </div>
                    <textarea className="struct-textarea" placeholder="Normal" />
                  </div>
                  
                  <div className="struct-section">
                    <div className="struct-header">
                      <span>Kidneys</span>
                      <span className="status-indicator status-empty"></span>
                    </div>
                    <textarea className="struct-textarea" placeholder="Normal" />
                  </div>
                  <div className="struct-section" style={{ border: '2px solid #e0e7ff', background: '#f8faff' }}>
                    <div className="struct-header">
                      <span style={{ color: '#4338ca', fontWeight: 800 }}>IMPRESSION / CONCLUSION</span>
                      <span className="status-indicator" style={{ background: '#4338ca' }}></span>
                    </div>
                    <textarea 
                      className="struct-textarea" 
                      placeholder="Type final clinical impression here..."
                      style={{ minHeight: '120px', fontSize: '15px', fontWeight: 500 }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: '15px', padding: '20px', borderTop: '1px solid #e2e8f0', background: '#fff' }}>
                   <button className="btn btn-outline" style={{ padding: '12px 25px' }} onClick={handlePreviewPrint}>👁️ Preview Structured Report</button>
                   <button className="btn btn-success" style={{ padding: '12px 30px' }}>Finalize & Sign</button>
                </div>
              </div>
            )}

            {activeTab === 'Narrative Editor' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
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
                        <option value="#fef3c7" style={{ background: '#fef3c7' }}>✎ Yellow</option>
                        <option value="#dcfce7" style={{ background: '#dcfce7' }}>✎ Green</option>
                        <option value="#dbeafe" style={{ background: '#dbeafe' }}>✎ Blue</option>
                        <option value="#fee2e2" style={{ background: '#fee2e2' }}>✎ Red</option>
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
                    <button className="tool-btn" title="Manage Macros" onClick={() => setShowKeywordDrawer(true)} style={{ color: '#2563eb', fontSize: '11px', fontWeight: 800, width: 'auto', padding: '0 10px', borderRadius: '6px', border: '1px solid #dbeafe', background: '#eff6ff' }}>⌨️ MACROS</button>
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
                      style={{ height: 'calc(100vh - 250px)', minHeight: '400px' }}
                    />

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
          )}
            {activeTab === 'Templates' && (
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Template Manager</h3>
                  <button className="btn btn-primary" onClick={() => setShowTemplateForm(!showTemplateForm)}>
                    {showTemplateForm ? '✕ Close Builder' : '+ Create New Template'}
                  </button>
                </div>
                
                {showTemplateForm && (
                  <div className="card" style={{ marginBottom: '20px', border: '1px solid #e0e7ff', background: '#f8faff', padding: '20px' }}>
                    <div style={{ fontWeight: 700, color: '#4338ca', marginBottom: '20px', fontSize: '16px', borderBottom: '1px solid #e0e7ff', paddingBottom: '10px' }}>
                      🏗️ Structured Template Builder
                    </div>
                    
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '5px', fontWeight: 600 }}>TEMPLATE NAME</label>
                        <input 
                          type="text" 
                          placeholder="e.g. USG Whole Abdomen - Detailed" 
                          value={newTemplate.name}
                          onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})}
                          style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }} 
                        />
                      </div>
                      <div style={{ width: '150px' }}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '5px', fontWeight: 600 }}>MODALITY</label>
                        <select 
                          value={newTemplate.modality}
                          onChange={(e) => setNewTemplate({...newTemplate, modality: e.target.value})}
                          style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                        >
                          <option>USG</option>
                          <option>CT</option>
                          <option>MRI</option>
                          <option>X-RAY</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>Report Sections</span>
                      <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={addSection}>+ Add Section</button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {newTemplate.sections.map((section, index) => (
                        <div key={section.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '15px', position: 'relative' }}>
                          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <input 
                              type="text" 
                              value={section.title}
                              onChange={(e) => updateSection(section.id, 'title', e.target.value)}
                              placeholder="Section Title (e.g. Findings)"
                              style={{ flex: 1, fontWeight: 700, border: 'none', borderBottom: '1px solid #f1f5f9', padding: '5px 0', fontSize: '13px', outline: 'none', color: '#4338ca' }}
                            />
                            <button 
                              style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}
                              onClick={() => removeSection(section.id)}
                            >✕</button>
                          </div>
                          <textarea 
                            value={section.content}
                            onChange={(e) => updateSection(section.id, 'content', e.target.value)}
                            placeholder="Enter default findings for this section..."
                            style={{ width: '100%', minHeight: '80px', border: 'none', resize: 'vertical', fontSize: '13px', lineHeight: '1.6', outline: 'none', color: '#334155' }}
                          />
                          <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '5px', display: 'flex', gap: '10px' }}>
                             <span>TIP: Use {`{{field}}`} for interactive data</span>
                             <span>DRAG TO REORDER</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: '25px', pt: '20px', borderTop: '1px solid #e0e7ff', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                      <button className="btn btn-outline" onClick={() => setShowTemplateForm(false)}>Discard Draft</button>
                      <button className="btn btn-primary" style={{ padding: '10px 25px' }} onClick={handleSaveTemplate}>🚀 Save & Publish Template</button>
                    </div>
                  </div>
                )}

                <div className="table-container" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Template Name</th>
                        <th>Modality</th>
                        <th>Last Modified</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templates.map(tpl => (
                        <tr key={tpl.id}>
                          <td style={{ fontWeight: 600 }}>{tpl.name}</td>
                          <td>{tpl.modality}</td>
                          <td>{tpl.lastModified}</td>
                          <td>
                            <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '12px' }}>Edit</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'Keywords' && (
              <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>⌨️ Keyword & Macro Maintenance</h3>
                  <button className="btn btn-primary" onClick={() => setShowNewKeywordForm(!showNewKeywordForm)}>
                    {showNewKeywordForm ? '✕ Close Builder' : '+ Create New Macro'}
                  </button>
                </div>

                {showNewKeywordForm && (
                  <div className="card" style={{ marginBottom: '30px', background: '#f8faff', padding: '25px', border: '1px solid #e0e7ff' }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#4338ca', marginBottom: '20px', borderBottom: '1px solid #e0e7ff', paddingBottom: '10px' }}>
                      🏗️ Build Clinical Shortcut
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px', marginBottom: '20px' }}>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Keyword Trigger</label>
                        <input 
                          type="text" 
                          placeholder="e.g., normal_liver" 
                          value={newMacro.keyword}
                          onChange={e => setNewMacro({...newMacro, keyword: e.target.value})}
                          style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', fontWeight: 700, color: '#2563eb' }}
                        />
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '5px' }}>Type this in the editor and press Enter.</div>
                      </div>
                      
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Diagnostic Paragraph</label>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button className="tool-btn" style={{ fontWeight: 800 }} onClick={() => formatMacroText('bold')}>B</button>
                            <button className="tool-btn" style={{ fontStyle: 'italic' }} onClick={() => formatMacroText('italic')}>I</button>
                            <button className="tool-btn" style={{ textDecoration: 'underline' }} onClick={() => formatMacroText('underline')}>U</button>
                          </div>
                        </div>
                        <div 
                          ref={macroTextareaRef}
                          contentEditable="true"
                          onInput={(e) => setNewMacro({...newMacro, paragraph: e.currentTarget.innerHTML})}
                          style={{ minHeight: '150px', padding: '15px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff', outline: 'none', fontSize: '14px', lineHeight: '1.6' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowNewKeywordForm(false)}>Cancel</button>
                      <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSaveMacro}>🚀 Save Macro to Library</button>
                    </div>
                  </div>
                )}

                <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                  <div style={{ padding: '15px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, color: '#475569' }}>ACTIVE MACRO LIBRARY ({keywordLibrary.length})</div>
                    <input type="text" placeholder="Search keywords..." style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', width: '200px' }} />
                  </div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: '200px' }}>Keyword</th>
                        <th>Paragraph Content</th>
                        <th style={{ width: '100px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keywordLibrary.map(item => (
                        <tr key={item.id}>
                          <td style={{ fontWeight: 800, color: '#2563eb' }}>{item.keyword}</td>
                          <td style={{ fontSize: '13px', color: '#475569' }}>
                            <div dangerouslySetInnerHTML={{ __html: item.paragraph.substring(0, 150) + (item.paragraph.length > 150 ? '...' : '') }} />
                          </td>
                          <td>
                            <button className="btn btn-outline" style={{ color: '#ef4444', padding: '4px 8px', fontSize: '11px' }} onClick={() => setKeywordLibrary(keywordLibrary.filter(k => k.id !== item.id))}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
              <span>{showTableBuilder ? '⚙️ Table Configuration' : '▦ Insert Measurement Table'}</span>
              <button className="tool-btn" onClick={() => { setShowTableModal(false); setShowTableBuilder(false); }}>✕</button>
            </div>
            <div className="modal-body">
              {!showTableBuilder ? (
                <>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '15px' }}>Choose a preset to insert into your report:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {tablePresets.map(preset => (
                      <div key={preset.id} className="preset-card" onClick={() => insertTable(preset)} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ fontSize: '20px' }}>▦</div>
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
                        >✕</button>
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

    </div>
  );
};

export default ReportingPage;
