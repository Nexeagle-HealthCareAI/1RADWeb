/**
 * Auto-correct dictionary for radiology / general-medical typos.
 *
 * Each entry: typo (lowercase) → correct spelling (canonical case).
 *
 * Hand-curated rather than fuzzy-matched against the medical terms list — a
 * map gives the typist predictable, undoable corrections. A Levenshtein
 * search would risk "correcting" valid words that just look similar to a
 * medical term (e.g., "lever" → "liver"), which is worse than no correction.
 *
 * Matching is case-insensitive on the key; the replacement preserves the
 * typist's leading-case (Pnuemonia → Pneumonia, pnuemonia → pneumonia).
 *
 * Add entries with: { 'typedform': 'correctform' }
 */
export const AUTOCORRECT_MAP = {
  // ── Anatomy / pathology — common typos ──────────────────────────────────
  'pnuemonia': 'pneumonia',
  'pneumona': 'pneumonia',
  'pneumonai': 'pneumonia',
  'pneunmonia': 'pneumonia',
  'atelactasis': 'atelectasis',
  'attelectasis': 'atelectasis',
  'atelactesis': 'atelectasis',
  'pneumothroax': 'pneumothorax',
  'pneumothrax': 'pneumothorax',
  'pnuemothorax': 'pneumothorax',
  'haemorrage': 'hemorrhage',
  'hemorrage': 'hemorrhage',
  'haemorhage': 'hemorrhage',
  'hemorhage': 'hemorrhage',
  'haemmorhage': 'hemorrhage',
  'oedema': 'edema',           // BE → AE for consistency in reports
  'occulsion': 'occlusion',
  'oclusion': 'occlusion',
  'thromboisis': 'thrombosis',
  'thromobosis': 'thrombosis',
  'thrombosis,': 'thrombosis,',
  'effussion': 'effusion',
  'efusion': 'effusion',
  'opactiy': 'opacity',
  'opasity': 'opacity',
  'leson': 'lesion',
  'lession': 'lesion',
  'cyts': 'cyst',
  'cysist': 'cyst',
  'apperance': 'appearance',
  'apparance': 'appearance',
  'apperance.': 'appearance.',
  'recieved': 'received',
  'occured': 'occurred',
  'occuring': 'occurring',
  'sufficeint': 'sufficient',
  'suficient': 'sufficient',
  'previuosly': 'previously',
  'previosly': 'previously',
  'corelation': 'correlation',
  'corellation': 'correlation',
  'metastatses': 'metastases',
  'metasteses': 'metastases',
  'metasises': 'metastases',
  'metastatsis': 'metastasis',
  'lymphnode': 'lymph node',
  'lyphnode': 'lymph node',
  'lymphnodes': 'lymph nodes',
  'hydronefrosis': 'hydronephrosis',
  'hydronephroisis': 'hydronephrosis',
  'pancreatits': 'pancreatitis',
  'pancrease': 'pancreas',
  'gallbladder': 'gallbladder',
  'gall-bladder': 'gallbladder',
  'gallblader': 'gallbladder',
  'gallbladdar': 'gallbladder',
  'cholelithisis': 'cholelithiasis',
  'cholithiasis': 'cholelithiasis',
  'echogenecity': 'echogenicity',
  'echogenicty': 'echogenicity',
  'echotextture': 'echotexture',
  'echtexture': 'echotexture',
  'hyperdensity': 'hyperdensity',
  'hypodensity': 'hypodensity',
  'hypoechoic': 'hypoechoic',
  'hyperechoic': 'hyperechoic',
  'enchancing': 'enhancing',
  'enhansing': 'enhancing',
  'enhancment': 'enhancement',
  'enhancemnt': 'enhancement',
  'attneuation': 'attenuation',
  'attenutation': 'attenuation',
  'attenutaion': 'attenuation',
  'caclification': 'calcification',
  'calficiation': 'calcification',
  'calcfication': 'calcification',
  'osseus': 'osseous',
  'ossious': 'osseous',
  'discitis': 'discitis',
  'degenartive': 'degenerative',
  'degenarative': 'degenerative',
  'aneursym': 'aneurysm',
  'aneurism': 'aneurysm',
  'aneursm': 'aneurysm',
  'infract': 'infarct',
  'infarctt': 'infarct',
  'ischemic': 'ischemic',
  'ishaemic': 'ischemic',
  'ischaemic': 'ischemic',
  'sublxation': 'subluxation',
  'sublaxation': 'subluxation',
  'flunoroscopy': 'fluoroscopy',
  'flouroscopy': 'fluoroscopy',
  'flouroscopic': 'fluoroscopic',
  'transluscent': 'translucent',
  'radioluscent': 'radiolucent',
  'periphery': 'periphery',
  'periphereal': 'peripheral',
  'peripherial': 'peripheral',
  'paraenchyma': 'parenchyma',
  'parenchma': 'parenchyma',
  'mediastnial': 'mediastinal',
  'medisatinal': 'mediastinal',
  'mediastenal': 'mediastinal',
  'mediastinum,': 'mediastinum,',
  'mediastnium': 'mediastinum',
  'pulmoanry': 'pulmonary',
  'pulmoanary': 'pulmonary',
  'pulmnary': 'pulmonary',

  // ── General English — short, high-confidence corrections ────────────────
  'teh': 'the',
  'adn': 'and',
  'taht': 'that',
  'wiht': 'with',
  'wihtin': 'within',
  'becuase': 'because',
  'recive': 'receive',
  'reccomend': 'recommend',
  'reccommend': 'recommend',
  'reccomended': 'recommended',
  'reccommended': 'recommended',
  'reccommendation': 'recommendation',
  'recommedation': 'recommendation',
  'recomendation': 'recommendation',
  'recomendations': 'recommendations',
  'aprox': 'approximately',
  'approxiamte': 'approximate',
  'approxmiately': 'approximately',
  'approximatley': 'approximately',
  'approximaterly': 'approximately',
  'compatable': 'compatible',
  'comparable': 'comparable',
  'consitent': 'consistent',
  'consistenly': 'consistently',
  'demonstartes': 'demonstrates',
  'demonstrats': 'demonstrates',
  'demosntrates': 'demonstrates',
  'evlauation': 'evaluation',
  'evaulation': 'evaluation',
  'identifeid': 'identified',
  'identifyed': 'identified',
  'measurment': 'measurement',
  'mesaurement': 'measurement',
  'measursement': 'measurement',
  'managment': 'management',
  'mangement': 'management',
  'mangagement': 'management',
  'normall': 'normal',
  'norml': 'normal',
  'occure': 'occur',
  'similiar': 'similar',
  'similarily': 'similarly',
  'suggesst': 'suggest',
  'suggessted': 'suggested',
  'suggestes': 'suggests',
  'tho': 'though',
};

/**
 * Look up a typo's correction with case preservation.
 *
 * Returns null if no correction is found, otherwise the corrected word
 * with the same capitalisation pattern as the input:
 *   'Pnuemonia' → 'Pneumonia'   (leading-cap → leading-cap)
 *   'PNUEMONIA' → 'PNEUMONIA'   (all-caps → all-caps)
 *   'pnuemonia' → 'pneumonia'   (lowercase → lowercase)
 *   'pNuEmOnIa' → 'pneumonia'   (mixed → lowercase fallback)
 */
export function lookupAutoCorrect(word) {
  if (!word || typeof word !== 'string') return null;
  const key = word.toLowerCase();
  const replacement = AUTOCORRECT_MAP[key];
  if (!replacement) return null;
  // Case preservation
  if (word === word.toUpperCase()) return replacement.toUpperCase();
  if (word[0] === word[0]?.toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}
