// ════════════════════════════════════════════════════════════════
// Structured RADS reporting data.
//
// Two kinds of helpers:
//   • CATEGORY systems (BI-RADS, Lung-RADS, PI-RADS, LI-RADS): the radiologist
//     picks the category; we insert the standardized assessment + management.
//   • ACR TI-RADS: a deterministic points calculator (composition, echogenicity,
//     shape, margin, echogenic foci) → points → TR level → size-based FNA/follow.
//
// ⚠️ Clinical note: standardized wording is a drafting aid. The radiologist owns
// the final category and recommendation; always verify against current criteria.
// ════════════════════════════════════════════════════════════════

// ─── Category-pick systems ─────────────────────────────────────────────────
export const CATEGORY_SYSTEMS = {
  BIRADS: {
    label: 'BI-RADS (Breast)',
    categories: [
      { code: '0', label: 'Incomplete', assessment: 'Incomplete — need additional imaging evaluation and/or prior mammograms for comparison.', management: 'Recall for additional imaging and/or comparison with priors.' },
      { code: '1', label: 'Negative', assessment: 'Negative.', management: 'Routine screening.' },
      { code: '2', label: 'Benign', assessment: 'Benign finding.', management: 'Routine screening.' },
      { code: '3', label: 'Probably benign', assessment: 'Probably benign finding.', management: 'Short-interval (6-month) follow-up. ≤2% likelihood of malignancy.' },
      { code: '4A', label: 'Low suspicion', assessment: 'Suspicious — low suspicion for malignancy.', management: 'Tissue diagnosis recommended. (>2% to ≤10%).' },
      { code: '4B', label: 'Moderate suspicion', assessment: 'Suspicious — moderate suspicion for malignancy.', management: 'Tissue diagnosis recommended. (>10% to ≤50%).' },
      { code: '4C', label: 'High suspicion', assessment: 'Suspicious — high suspicion for malignancy.', management: 'Tissue diagnosis recommended. (>50% to <95%).' },
      { code: '5', label: 'Highly suggestive', assessment: 'Highly suggestive of malignancy.', management: 'Take appropriate action. (≥95%).' },
      { code: '6', label: 'Known malignancy', assessment: 'Known biopsy-proven malignancy.', management: 'Appropriate action as clinically indicated.' },
    ],
  },
  LUNGRADS: {
    label: 'Lung-RADS (Chest LDCT)',
    categories: [
      { code: '0', label: 'Incomplete', assessment: 'Incomplete.', management: 'Additional imaging and/or comparison with priors needed.' },
      { code: '1', label: 'Negative', assessment: 'No nodules; or definitely benign nodule.', management: 'Continue annual screening (LDCT) in 12 months.' },
      { code: '2', label: 'Benign appearance', assessment: 'Benign-appearing nodule(s) with very low likelihood of malignancy.', management: 'Continue annual screening (LDCT) in 12 months.' },
      { code: '3', label: 'Probably benign', assessment: 'Probably benign nodule.', management: '6-month low-dose CT follow-up.' },
      { code: '4A', label: 'Suspicious', assessment: 'Suspicious nodule.', management: '3-month LDCT; PET/CT may be considered.' },
      { code: '4B', label: 'Suspicious', assessment: 'Suspicious nodule, higher likelihood of malignancy.', management: 'Chest CT ± contrast, PET/CT and/or tissue sampling.' },
      { code: '4X', label: 'Suspicious (add’l features)', assessment: 'Category 3 or 4 nodule with additional features increasing suspicion of malignancy.', management: 'Chest CT ± contrast, PET/CT and/or tissue sampling.' },
    ],
  },
  PIRADS: {
    label: 'PI-RADS (Prostate mpMRI)',
    categories: [
      { code: '1', label: 'Very low', assessment: 'Clinically significant cancer is highly unlikely.', management: 'Routine; no targeted biopsy on imaging grounds.' },
      { code: '2', label: 'Low', assessment: 'Clinically significant cancer is unlikely.', management: 'Routine; no targeted biopsy on imaging grounds.' },
      { code: '3', label: 'Intermediate', assessment: 'The presence of clinically significant cancer is equivocal.', management: 'Consider biopsy per PSA density / clinical factors.' },
      { code: '4', label: 'High', assessment: 'Clinically significant cancer is likely.', management: 'Targeted biopsy recommended.' },
      { code: '5', label: 'Very high', assessment: 'Clinically significant cancer is highly likely.', management: 'Targeted biopsy recommended.' },
    ],
  },
  LIRADS: {
    label: 'LI-RADS (Liver, at-risk)',
    categories: [
      { code: 'LR-1', label: 'Definitely benign', assessment: 'Definitely benign.', management: 'Per clinical pathway.' },
      { code: 'LR-2', label: 'Probably benign', assessment: 'Probably benign.', management: 'Per clinical pathway / surveillance.' },
      { code: 'LR-3', label: 'Intermediate', assessment: 'Intermediate probability of malignancy.', management: 'Repeat or alternative imaging in 3–6 months.' },
      { code: 'LR-4', label: 'Probably HCC', assessment: 'Probably HCC.', management: 'Multidisciplinary discussion; consider biopsy.' },
      { code: 'LR-5', label: 'Definitely HCC', assessment: 'Definitely HCC.', management: 'Treat as HCC per multidisciplinary pathway.' },
      { code: 'LR-M', label: 'Malignant, not HCC-specific', assessment: 'Probably or definitely malignant but not HCC-specific.', management: 'Biopsy / multidisciplinary discussion.' },
      { code: 'LR-TIV', label: 'Tumor in vein', assessment: 'Definite tumor in vein.', management: 'Treat per multidisciplinary pathway.' },
    ],
  },
};

// ─── ACR TI-RADS calculator ────────────────────────────────────────────────
// Each group's options carry the ACR point value. Echogenic foci may be summed.
export const TIRADS = {
  label: 'ACR TI-RADS (Thyroid nodule)',
  groups: [
    { key: 'composition', label: 'Composition', multi: false, options: [
      { label: 'Cystic or almost completely cystic', pts: 0 },
      { label: 'Spongiform', pts: 0 },
      { label: 'Mixed cystic and solid', pts: 1 },
      { label: 'Solid or almost completely solid', pts: 2 },
    ]},
    { key: 'echogenicity', label: 'Echogenicity', multi: false, options: [
      { label: 'Anechoic', pts: 0 },
      { label: 'Hyperechoic or isoechoic', pts: 1 },
      { label: 'Hypoechoic', pts: 2 },
      { label: 'Very hypoechoic', pts: 3 },
    ]},
    { key: 'shape', label: 'Shape', multi: false, options: [
      { label: 'Wider-than-tall', pts: 0 },
      { label: 'Taller-than-wide', pts: 3 },
    ]},
    { key: 'margin', label: 'Margin', multi: false, options: [
      { label: 'Smooth', pts: 0 },
      { label: 'Ill-defined', pts: 0 },
      { label: 'Lobulated or irregular', pts: 2 },
      { label: 'Extra-thyroidal extension', pts: 3 },
    ]},
    { key: 'foci', label: 'Echogenic foci (sum all that apply)', multi: true, options: [
      { label: 'None or large comet-tail artifacts', pts: 0 },
      { label: 'Macrocalcifications', pts: 1 },
      { label: 'Peripheral (rim) calcifications', pts: 2 },
      { label: 'Punctate echogenic foci', pts: 3 },
    ]},
  ],
};

// points → TR level + size-based recommendation.
export function tiradsLevel(points) {
  if (points <= 1) return { tr: 'TR1', risk: 'Benign' };
  if (points === 2) return { tr: 'TR2', risk: 'Not suspicious' };
  if (points === 3) return { tr: 'TR3', risk: 'Mildly suspicious' };
  if (points <= 6) return { tr: 'TR4', risk: 'Moderately suspicious' };
  return { tr: 'TR5', risk: 'Highly suspicious' };
}

// size in mm → recommendation string for the TR level.
export function tiradsRecommendation(tr, sizeMm) {
  const s = Number(sizeMm) || 0;
  if (tr === 'TR1' || tr === 'TR2') return 'No FNA. Follow-up not indicated on imaging grounds.';
  if (tr === 'TR3') {
    if (s >= 25) return 'FNA recommended (≥2.5 cm).';
    if (s >= 15) return 'Follow-up recommended (≥1.5 cm).';
    return 'No FNA or follow-up indicated (<1.5 cm).';
  }
  if (tr === 'TR4') {
    if (s >= 15) return 'FNA recommended (≥1.5 cm).';
    if (s >= 10) return 'Follow-up recommended (≥1.0 cm).';
    return 'No FNA or follow-up indicated (<1.0 cm).';
  }
  // TR5
  if (s >= 10) return 'FNA recommended (≥1.0 cm).';
  if (s >= 5) return 'Follow-up recommended (≥0.5 cm).';
  return 'No FNA or follow-up indicated (<0.5 cm).';
}
