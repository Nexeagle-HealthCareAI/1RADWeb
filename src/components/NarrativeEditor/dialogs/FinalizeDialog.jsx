import React, { useState, useRef, useEffect } from 'react';

const OVL = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.45)',
  zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
};

const BOX = {
  background: '#fff',
  borderRadius: '8px',
  boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
  width: '520px',
  maxWidth: '96vw',
  overflow: 'hidden',
};

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '7px 10px', border: '1px solid #d1d5db',
          borderRadius: '5px', fontSize: '13px',
          fontFamily: 'inherit', outline: 'none',
        }}
      />
    </div>
  );
}

const ATTESTATION = `I attest that this report represents my independent review of the images and clinical history, and that all findings and conclusions stated herein are accurate to the best of my knowledge.`;

/**
 * FinalizeDialog — prompts for radiologist name + credentials, then fires
 * onFinalize({ name, credentials, timestamp, attestation }).
 *
 * Props:
 *   open          {boolean}
 *   defaultName   {string}  — pre-fill from stored author
 *   onFinalize    {fn({name, credentials, timestamp})}
 *   onClose       {fn()}
 */
export default function FinalizeDialog({ open, defaultName = '', onFinalize, onClose }) {
  const [name, setName]               = useState(defaultName);
  const [credentials, setCredentials] = useState('');
  const [agreed, setAgreed]           = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setAgreed(false);
      setTimeout(() => nameRef.current?.focus(), 60);
    }
  }, [open, defaultName]);

  if (!open) return null;

  const canSign = name.trim() && agreed;
  const timestamp = new Date().toLocaleString(undefined, {
    dateStyle: 'full', timeStyle: 'long',
  });

  const handleSign = () => {
    if (!canSign) return;
    onFinalize({ name: name.trim(), credentials: credentials.trim(), timestamp });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && canSign) handleSign();
  };

  return (
    <div style={OVL} onClick={onClose} onKeyDown={handleKeyDown}>
      <div style={BOX} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #e5e7eb', background: '#f8f9fa' }}>
          <div style={{ fontWeight: 700, fontSize: '16px', color: '#111827' }}>✍️ Sign & Finalize Report</div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '3px' }}>
            Once finalized, the report will be locked and a signature block will be appended.
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px' }}>
          <Field
            label="Radiologist Name *"
            value={name}
            onChange={setName}
            placeholder="Dr. Jane Smith"
          />
          <Field
            label="Credentials / Degree"
            value={credentials}
            onChange={setCredentials}
            placeholder="MD, FRCPC, ABR"
          />

          {/* Timestamp preview */}
          <div style={{
            background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '5px',
            padding: '10px 14px', fontSize: '12px', color: '#166534', marginBottom: '16px',
          }}>
            <strong>Signature timestamp:</strong> {timestamp}
          </div>

          {/* Attestation */}
          <div style={{
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '5px',
            padding: '12px 14px', fontSize: '11px', color: '#78350f',
            lineHeight: 1.6, marginBottom: '14px',
          }}>
            {ATTESTATION}
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#374151' }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ marginTop: '2px', accentColor: '#2563eb', flexShrink: 0 }}
            />
            I agree to the attestation statement above and confirm the report is complete and ready for release.
          </label>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '7px 18px', border: '1px solid #d1d5db', background: '#fff', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}
          >
            Cancel
          </button>
          <button
            disabled={!canSign}
            onClick={handleSign}
            style={{
              padding: '7px 22px',
              border: '1px solid #1d4ed8',
              background: canSign ? '#2563eb' : '#93c5fd',
              color: '#fff',
              borderRadius: '5px',
              cursor: canSign ? 'pointer' : 'not-allowed',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            ✍️ Sign & Finalize
          </button>
        </div>

      </div>
    </div>
  );
}
