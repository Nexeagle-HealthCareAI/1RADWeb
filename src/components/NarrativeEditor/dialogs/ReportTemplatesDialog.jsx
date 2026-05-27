import React from 'react';
import { createPortal } from 'react-dom';

// ─── Template definitions ─────────────────────────────────────────────────────
// Exported so the QAT TemplatesQuickPicker can reuse the same list without
// re-defining them — one source of truth.
export const TEMPLATES = [
  {
    id: 'blank',
    modality: 'Blank Report',
    icon: '📄',
    color: '#6c757d',
    description: 'Standard sections, no pre-filled content',
    html: `<h2>Clinical History</h2><p></p><h2>Technique</h2><p></p><h2>Findings</h2><p></p><h2>Impression</h2><p></p>`,
  },
  {
    id: 'ct-chest',
    modality: 'CT Chest',
    icon: '🫁',
    color: '#0d6efd',
    description: 'Lungs, pleura, mediastinum, cardiovascular, chest wall',
    html: `<h2>Clinical History</h2><p></p>
<h2>Technique</h2><p>CT examination of the chest was performed with axial sections acquired in standard lung and mediastinal window settings.</p>
<h2>Findings</h2>
<h3>Lungs and Airways</h3><p></p>
<h3>Pleura</h3><p></p>
<h3>Mediastinum and Hila</h3><p></p>
<h3>Cardiovascular</h3><p></p>
<h3>Chest Wall and Diaphragm</h3><p></p>
<h3>Upper Abdomen</h3><p></p>
<h2>Impression</h2><p></p>
<h2>Recommendation</h2><p></p>`,
  },
  {
    id: 'mri-brain',
    modality: 'MRI Brain',
    icon: '🧠',
    color: '#6610f2',
    description: 'Parenchyma, ventricles, posterior fossa, vasculature',
    html: `<h2>Clinical History</h2><p></p>
<h2>Technique</h2><p>MRI of the brain was performed using standard sequences including sagittal T1, axial T2, FLAIR, DWI, and post-contrast T1-weighted imaging.</p>
<h2>Findings</h2>
<h3>Brain Parenchyma</h3><p></p>
<h3>White Matter</h3><p></p>
<h3>Ventricles and CSF Spaces</h3><p></p>
<h3>Extra-Axial Spaces</h3><p></p>
<h3>Posterior Fossa</h3><p></p>
<h3>Vascular Structures</h3><p></p>
<h3>Orbits and Skull Base</h3><p></p>
<h2>Impression</h2><p></p>
<h2>Recommendation</h2><p></p>`,
  },
  {
    id: 'cxr',
    modality: 'Chest X-Ray',
    icon: '🩻',
    color: '#198754',
    description: 'Lungs, pleura, heart/mediastinum, bones',
    html: `<h2>Clinical History</h2><p></p>
<h2>Technique</h2><p>PA and lateral chest radiographs were obtained.</p>
<h2>Findings</h2>
<h3>Lungs</h3><p></p>
<h3>Pleura</h3><p></p>
<h3>Heart and Mediastinum</h3><p></p>
<h3>Bones and Soft Tissues</h3><p></p>
<h2>Impression</h2><p></p>`,
  },
  {
    id: 'us-abdomen',
    modality: 'US Abdomen',
    icon: '🔊',
    color: '#fd7e14',
    description: 'Liver, GB, pancreas, spleen, kidneys, aorta',
    html: `<h2>Clinical History</h2><p></p>
<h2>Technique</h2><p>Ultrasound examination of the abdomen was performed using a broadband transducer with the patient in the supine position.</p>
<h2>Findings</h2>
<h3>Liver</h3><p></p>
<h3>Gallbladder and Bile Ducts</h3><p></p>
<h3>Pancreas</h3><p></p>
<h3>Spleen</h3><p></p>
<h3>Kidneys</h3><p></p>
<h3>Aorta and IVC</h3><p></p>
<h3>Free Fluid</h3><p></p>
<h2>Impression</h2><p></p>
<h2>Recommendation</h2><p></p>`,
  },
  {
    id: 'mri-lumbar',
    modality: 'MRI Lumbar Spine',
    icon: '🦴',
    color: '#dc3545',
    description: 'Vertebrae, disc levels L1-S1, foramina, cord/conus',
    html: `<h2>Clinical History</h2><p></p>
<h2>Technique</h2><p>MRI of the lumbar spine was performed with sagittal T1, T2, and STIR sequences, along with axial T2-weighted images through the disc levels.</p>
<h2>Findings</h2>
<h3>Vertebral Bodies and Alignment</h3><p></p>
<h3>Disc Levels</h3>
<p>L1–L2: </p>
<p>L2–L3: </p>
<p>L3–L4: </p>
<p>L4–L5: </p>
<p>L5–S1: </p>
<h3>Neural Foramina and Nerve Roots</h3><p></p>
<h3>Posterior Elements</h3><p></p>
<h3>Spinal Canal and Cord/Conus</h3><p></p>
<h3>Paraspinal Soft Tissues</h3><p></p>
<h2>Impression</h2><p></p>
<h2>Recommendation</h2><p></p>`,
  },
  {
    id: 'ct-abdomen',
    modality: 'CT Abdomen/Pelvis',
    icon: '🫃',
    color: '#20c997',
    description: 'Liver, bowel, solid organs, retroperitoneum, pelvis',
    html: `<h2>Clinical History</h2><p></p>
<h2>Technique</h2><p>CT examination of the abdomen and pelvis was performed with oral and intravenous contrast in portal venous phase.</p>
<h2>Findings</h2>
<h3>Liver, Gallbladder and Biliary</h3><p></p>
<h3>Pancreas and Spleen</h3><p></p>
<h3>Kidneys and Adrenals</h3><p></p>
<h3>Bowel and Mesentery</h3><p></p>
<h3>Retroperitoneum and Vessels</h3><p></p>
<h3>Pelvis</h3><p></p>
<h3>Bones and Soft Tissues</h3><p></p>
<h2>Impression</h2><p></p>
<h2>Recommendation</h2><p></p>`,
  },
  {
    id: 'mri-cervical',
    modality: 'MRI Cervical Spine',
    icon: '🏥',
    color: '#e91e8c',
    description: 'Vertebrae, disc levels C2-T1, cord signal, foramina',
    html: `<h2>Clinical History</h2><p></p>
<h2>Technique</h2><p>MRI of the cervical spine was performed with sagittal T1, T2, and STIR sequences, along with axial T2-weighted images through the disc levels.</p>
<h2>Findings</h2>
<h3>Vertebral Bodies and Alignment</h3><p></p>
<h3>Disc Levels</h3>
<p>C2–C3: </p>
<p>C3–C4: </p>
<p>C4–C5: </p>
<p>C5–C6: </p>
<p>C6–C7: </p>
<p>C7–T1: </p>
<h3>Spinal Cord Signal</h3><p></p>
<h3>Neural Foramina</h3><p></p>
<h3>Posterior Elements</h3><p></p>
<h2>Impression</h2><p></p>
<h2>Recommendation</h2><p></p>`,
  },
];

// ─── Card component ───────────────────────────────────────────────────────────
function TemplateCard({ tmpl, onInsert, onReplace }) {
  return (
    <div
      style={{
        border: `2px solid ${tmpl.color}20`,
        borderTop: `4px solid ${tmpl.color}`,
        borderRadius: '8px',
        padding: '12px',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        transition: 'box-shadow 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '22px', lineHeight: 1 }}>{tmpl.icon}</span>
        <span style={{
          fontWeight: 700,
          fontSize: '13px',
          color: '#1a1a2e',
          fontFamily: '"Segoe UI", system-ui, sans-serif',
        }}>
          {tmpl.modality}
        </span>
      </div>
      <p style={{
        margin: 0,
        fontSize: '11px',
        color: '#666',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        lineHeight: 1.4,
        flexGrow: 1,
      }}>
        {tmpl.description}
      </p>
      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
        <button
          onClick={() => onInsert(tmpl.html)}
          title="Insert sections at the current cursor position"
          style={{
            flex: 1,
            padding: '4px 0',
            fontSize: '11px',
            fontFamily: '"Segoe UI", system-ui, sans-serif',
            border: `1px solid ${tmpl.color}`,
            borderRadius: '4px',
            background: '#fff',
            color: tmpl.color,
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          + Insert
        </button>
        <button
          onClick={() => onReplace(tmpl.html)}
          title="Replace all editor content with this template"
          style={{
            flex: 1,
            padding: '4px 0',
            fontSize: '11px',
            fontFamily: '"Segoe UI", system-ui, sans-serif',
            border: 'none',
            borderRadius: '4px',
            background: tmpl.color,
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          ↺ Replace
        </button>
      </div>
    </div>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────
/**
 * ReportTemplatesDialog — pick a radiology report template and insert/replace.
 *
 * Props:
 *   open        {boolean}
 *   onClose     {() => void}
 *   onInsert    {(html: string) => void}  — insert at cursor
 *   onReplace   {(html: string) => void}  — replace all content
 */
export default function ReportTemplatesDialog({ open, onClose, onInsert, onReplace }) {
  if (!open) return null;

  const panel = (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 22, 40, 0.45)',
        backdropFilter: 'blur(2px)',
        zIndex: 13500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      <div
        style={{
          background: '#f8f9fa',
          borderRadius: '12px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
          width: 'min(780px, 96vw)',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          background: '#fff',
          borderBottom: '1px solid #dee2e6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: '#1a1a2e' }}>
              Report Templates
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
              Choose a template — <strong>Insert</strong> adds sections at the cursor,{' '}
              <strong>Replace</strong> clears the editor and loads the template.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: '#666',
              padding: '0 4px',
              lineHeight: 1,
            }}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Template grid */}
        <div style={{
          overflowY: 'auto',
          padding: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '12px',
        }}>
          {TEMPLATES.map(tmpl => (
            <TemplateCard
              key={tmpl.id}
              tmpl={tmpl}
              onInsert={(html) => { onInsert?.(html); onClose?.(); }}
              onReplace={(html) => { onReplace?.(html); onClose?.(); }}
            />
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(panel, (document.fullscreenElement || document.body));
}
