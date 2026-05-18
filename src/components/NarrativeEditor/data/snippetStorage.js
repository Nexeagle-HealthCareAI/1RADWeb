/**
 * Snippet / macro storage backed by localStorage.
 *
 * Each snippet: { id, trigger, label, category, content }
 *   trigger  — e.g. "/norm" — typed in the editor followed by Space/Enter
 *   content  — plain text or HTML inserted on expansion
 */

const STORAGE_KEY = 'narrative-editor:snippets';

export const CATEGORIES = ['Technique', 'Findings', 'Impression', 'General'];

export const DEFAULT_SNIPPETS = [
  // ── Technique ──────────────────────────────────────────────────────────────
  {
    id: 'ds-tech-ct',
    trigger: '/tech-ct',
    label: 'CT Technique (contrast)',
    category: 'Technique',
    content: 'CT was performed following intravenous contrast administration in the portal venous phase with 3-mm slice thickness and multiplanar reformations.',
  },
  {
    id: 'ds-tech-mri',
    trigger: '/tech-mri',
    label: 'MRI Technique (standard)',
    category: 'Technique',
    content: 'MRI was performed on a 1.5T scanner including T1, T2, FLAIR, and DWI sequences in standard orthogonal planes.',
  },
  {
    id: 'ds-tech-us',
    trigger: '/tech-us',
    label: 'US Technique',
    category: 'Technique',
    content: 'Real-time grayscale and color Doppler ultrasound was performed.',
  },
  {
    id: 'ds-tech-xr',
    trigger: '/tech-xr',
    label: 'X-Ray Technique',
    category: 'Technique',
    content: 'PA and lateral radiographs were obtained.',
  },
  {
    id: 'ds-ltd',
    trigger: '/ltd',
    label: 'Limited study disclaimer',
    category: 'Technique',
    content: 'Study is technically limited by patient motion / body habitus / metallic artifact. Findings should be interpreted with appropriate clinical correlation.',
  },

  // ── Findings ───────────────────────────────────────────────────────────────
  {
    id: 'ds-no-pe',
    trigger: '/nope',
    label: 'No pulmonary embolism',
    category: 'Findings',
    content: 'No pulmonary embolism. No filling defect within the central, lobar, or segmental pulmonary arteries.',
  },
  {
    id: 'ds-no-lad',
    trigger: '/nolad',
    label: 'No lymphadenopathy',
    category: 'Findings',
    content: 'No pathologically enlarged lymph nodes by CT size criteria.',
  },
  {
    id: 'ds-no-mets',
    trigger: '/nomets',
    label: 'No bone metastases',
    category: 'Findings',
    content: 'No aggressive osseous lesion or pathological fracture. No suspicious lytic or sclerotic bony lesion to suggest metastatic disease.',
  },

  // ── Impression ─────────────────────────────────────────────────────────────
  {
    id: 'ds-norm',
    trigger: '/norm',
    label: 'No acute finding',
    category: 'Impression',
    content: 'No acute intracranial / intrathoracic / intra-abdominal abnormality.',
  },
  {
    id: 'ds-cc',
    trigger: '/cc',
    label: 'Clinical correlation',
    category: 'Impression',
    content: 'Clinical correlation is recommended.',
  },
  {
    id: 'ds-stable',
    trigger: '/stable',
    label: 'No interval change',
    category: 'Impression',
    content: 'No significant interval change compared to prior study dated ___.',
  },
  {
    id: 'ds-reco',
    trigger: '/reco',
    label: 'Recommend follow-up',
    category: 'Impression',
    content: 'Recommend clinical correlation and follow-up imaging as clinically indicated.',
  },
  {
    id: 'ds-fu3',
    trigger: '/fu3',
    label: 'Follow-up 3 months',
    category: 'Impression',
    content: 'Short-interval follow-up CT/MRI in 3 months is recommended to assess for stability.',
  },
  {
    id: 'ds-fu6',
    trigger: '/fu6',
    label: 'Follow-up 6 months',
    category: 'Impression',
    content: 'Follow-up imaging in 6 months is recommended to assess for interval change.',
  },
  {
    id: 'ds-fu12',
    trigger: '/fu12',
    label: 'Follow-up 12 months',
    category: 'Impression',
    content: 'Annual follow-up imaging is recommended.',
  },
  {
    id: 'ds-fleischner',
    trigger: '/fleischner',
    label: 'Pulmonary nodule — Fleischner',
    category: 'Impression',
    content: 'Pulmonary nodule management per Fleischner Society guidelines is recommended based on nodule size, morphology, and patient risk factors.',
  },

  // ── General ────────────────────────────────────────────────────────────────
  {
    id: 'ds-compare',
    trigger: '/compare',
    label: 'Comparison study phrase',
    category: 'General',
    content: 'Comparison is made with prior study dated ___.',
  },
  {
    id: 'ds-incidental',
    trigger: '/incidental',
    label: 'Incidental finding disclaimer',
    category: 'General',
    content: 'This represents an incidental finding of uncertain clinical significance. Correlation with clinical history is recommended.',
  },
  {
    id: 'ds-contact',
    trigger: '/contact',
    label: 'Direct communication note',
    category: 'General',
    content: 'Results communicated directly to the referring clinician, Dr. ___, by telephone on ___ at ___.',
  },
];

// ── CRUD helpers ──────────────────────────────────────────────────────────────

export function loadSnippets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return DEFAULT_SNIPPETS.map(s => ({ ...s }));
}

export function saveSnippets(snippets) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
  } catch (_) {}
}

export function addSnippet(snippets, data) {
  const id = 'snip-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  return [...snippets, { ...data, id }];
}

export function updateSnippet(snippets, id, changes) {
  return snippets.map(s => (s.id === id ? { ...s, ...changes } : s));
}

export function removeSnippet(snippets, id) {
  return snippets.filter(s => s.id !== id);
}
