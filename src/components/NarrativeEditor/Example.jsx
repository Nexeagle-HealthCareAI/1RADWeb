import React, { useState } from 'react';
import NarrativeEditor from './index';

/**
 * Example usage of the NarrativeEditor component
 * This file demonstrates how to integrate the editor into your application
 */
const NarrativeEditorExample = () => {
  const [content, setContent] = useState('<p>Start typing your radiology report here...</p>');
  const [impression, setImpression] = useState('');
  const [advice, setAdvice] = useState('');

  const handleSave = () => {
    console.log('Saving report...');
    console.log('Content:', content);
    console.log('Impression:', impression);
    console.log('Advice:', advice);
    
    // Here you would typically send this data to your backend
    alert('Report saved successfully!');
  };

  const handleFinalize = () => {
    console.log('Finalizing report...');
    // Add your finalization logic here
    alert('Report finalized!');
  };

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      background: '#f8fafc',
      padding: '20px'
    }}>
      {/* Header */}
      <div style={{ 
        background: 'white', 
        padding: '20px', 
        borderRadius: '12px',
        marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ margin: 0, fontSize: '24px', color: '#0f172a' }}>
          Radiology Report Editor
        </h1>
        <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '14px' }}>
          Advanced narrative editor powered by TipTap
        </p>
      </div>

      {/* Action Buttons */}
      <div style={{ 
        display: 'flex', 
        gap: '12px', 
        marginBottom: '20px',
        justifyContent: 'flex-end'
      }}>
        <button
          onClick={handleSave}
          style={{
            padding: '10px 20px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          💾 Save Draft
        </button>
        <button
          onClick={handleFinalize}
          style={{
            padding: '10px 20px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          ✓ Finalize Report
        </button>
      </div>

      {/* Main Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <NarrativeEditor
          content={content}
          onChange={setContent}
          placeholder="Start typing your radiology report..."
          onSave={handleSave}
        />

        {/* Additional Fields */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '20px',
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '12px', 
              fontWeight: 700, 
              color: '#0f52ba',
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Clinical Impression
            </label>
            <textarea
              value={impression}
              onChange={(e) => setImpression(e.target.value)}
              placeholder="Enter final study impression..."
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '14px',
                minHeight: '100px',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
            />
          </div>
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '12px', 
              fontWeight: 700, 
              color: '#64748b',
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Follow-up Advice
            </label>
            <textarea
              value={advice}
              onChange={(e) => setAdvice(e.target.value)}
              placeholder="Enter patient advice..."
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '14px',
                minHeight: '100px',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default NarrativeEditorExample;
