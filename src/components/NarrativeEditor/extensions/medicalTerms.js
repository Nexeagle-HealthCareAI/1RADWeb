/**
 * Radiology / medical terminology list for the autocomplete engine.
 * ~300 terms covering anatomy, pathology, MRI/CT descriptors, and impression phrases.
 */
export const MEDICAL_TERMS = [
  // ── Anatomy — Brain ─────────────────────────────────────────────────────
  'amygdala', 'aqueduct of Sylvius', 'basal ganglia', 'brainstem', 'caudate nucleus',
  'cerebellopontine angle', 'cerebellum', 'cerebral cortex', 'cerebrum',
  'choroid plexus', 'corpus callosum', 'foramen of Monro', 'frontal lobe',
  'hippocampus', 'hypothalamus', 'internal capsule', 'insula', 'midbrain',
  'occipital lobe', 'parietal lobe', 'periventricular white matter', 'pons',
  'putamen', 'temporal lobe', 'thalamus', 'third ventricle', 'fourth ventricle',
  'lateral ventricle', 'white matter',

  // ── Anatomy — Spine ─────────────────────────────────────────────────────
  'annulus fibrosus', 'cauda equina', 'cervical spine', 'conus medullaris',
  'disc space', 'endplate', 'facet joint', 'intervertebral disc', 'lamina',
  'ligamentum flavum', 'lumbar spine', 'neural foramina', 'nucleus pulposus',
  'pedicle', 'posterior longitudinal ligament', 'sacrum', 'spinal canal',
  'spinous process', 'thoracic spine', 'transverse process', 'vertebral body',

  // ── Anatomy — Thorax ────────────────────────────────────────────────────
  'aorta', 'ascending aorta', 'descending aorta', 'aortic arch', 'left atrium',
  'right atrium', 'left ventricle', 'right ventricle', 'bronchus', 'carina',
  'diaphragm', 'hilum', 'lingula', 'lobar fissure', 'main bronchus',
  'mediastinum', 'pericardium', 'pleura', 'pulmonary artery', 'pulmonary vein',
  'thymus', 'trachea', 'superior vena cava', 'inferior vena cava',

  // ── Anatomy — Abdomen / Pelvis ───────────────────────────────────────────
  'adrenal gland', 'appendix', 'bile duct', 'cecum', 'common bile duct',
  'duodenum', 'gallbladder', 'hepatic vein', 'ileum', 'jejunum', 'kidney',
  'mesentery', 'pancreas', 'pancreatic duct', 'portal vein', 'rectum',
  'retroperitoneum', 'sigmoid colon', 'spleen', 'stomach', 'ureter',
  'urinary bladder', 'uterus', 'ovary', 'prostate gland',

  // ── Anatomy — Musculoskeletal ─────────────────────────────────────────────
  'acetabulum', 'biceps tendon', 'bursa', 'cartilage', 'fibula', 'femur',
  'glenohumeral joint', 'humerus', 'labrum', 'ligament', 'medial meniscus',
  'lateral meniscus', 'patella', 'periosteum', 'radius', 'rotator cuff',
  'supraspinatus', 'infraspinatus', 'subscapularis', 'synovium', 'tendon',
  'tibia', 'ulna', 'ACL', 'PCL', 'MCL', 'LCL',

  // ── Pathology — Neurological ──────────────────────────────────────────────
  'aneurysm', 'arteriovenous malformation', 'cerebral atrophy', 'cavernoma',
  'cavernous malformation', 'cerebral contusion', 'demyelination', 'cerebral edema',
  'encephalomalacia', 'epidural hematoma', 'gliosis', 'intracranial hemorrhage',
  'hydrocephalus', 'cerebral infarct', 'ischemic stroke', 'lacunar infarct',
  'leptomeningeal enhancement', 'leukoaraiosis', 'mass effect', 'midline shift',
  'microangiopathy', 'periventricular changes', 'subdural hematoma',
  'subarachnoid hemorrhage', 'ventriculomegaly', 'white matter lesions',
  'diffuse axonal injury', 'cerebral metastasis',

  // ── Pathology — Thoracic ──────────────────────────────────────────────────
  'atelectasis', 'bronchiectasis', 'consolidation', 'pleural effusion',
  'emphysema', 'pulmonary fibrosis', 'ground-glass opacity', 'hemothorax',
  'pulmonary infiltrate', 'interstitial lung disease', 'mediastinal widening',
  'pulmonary nodule', 'pulmonary opacification', 'pericardial effusion',
  'pleural thickening', 'pneumonia', 'pneumothorax', 'pulmonary embolism',
  'pulmonary edema', 'reticulation', 'airspace disease', 'lung mass',
  'cavitary lesion', 'hilar adenopathy',

  // ── Pathology — Abdominal ──────────────────────────────────────────────────
  'abscess', 'ascites', 'bowel obstruction', 'cholecystitis', 'cholelithiasis',
  'hepatic cirrhosis', 'colitis', 'diverticulitis', 'free fluid',
  'hepatomegaly', 'hepatic steatosis', 'hydronephrosis', 'intussusception',
  'mesenteric ischemia', 'lymphadenopathy', 'nephrolithiasis', 'pancreatitis',
  'pneumoperitoneum', 'portal hypertension', 'splenomegaly', 'volvulus',
  'hepatic lesion', 'renal cyst', 'adrenal adenoma',

  // ── Pathology — Musculoskeletal ───────────────────────────────────────────
  'avulsion fracture', 'bone marrow edema', 'cortical breach', 'dislocation',
  'stress fracture', 'joint effusion', 'lytic lesion', 'marrow replacement',
  'osteolysis', 'osteophyte', 'osteoporosis', 'periosteal reaction',
  'sclerotic lesion', 'spondylosis', 'subluxation', 'tendinopathy',
  'tendinosis', 'rotator cuff tear', 'meniscal tear', 'labral tear',

  // ── Descriptors ───────────────────────────────────────────────────────────
  'bilateral', 'calcification', 'circumscribed', 'compression', 'contiguous',
  'contrast enhancement', 'diffuse', 'displacement', 'enlargement', 'focal',
  'heterogeneous', 'homogeneous', 'hyperattenuating', 'hyperdense',
  'hyperintense', 'hypoattenuating', 'hypodense', 'hypointense', 'ill-defined',
  'infiltrating', 'lobulated', 'lucency', 'mass-like', 'multilocular',
  'peripheral enhancement', 'perifocal edema', 'rim-enhancing', 'septated',
  'signal abnormality', 'solid component', 'spiculated', 'subcentimeter',
  'unilocular', 'vascular',

  // ── Measurements & Modifiers ──────────────────────────────────────────────
  'anteroposterior diameter', 'craniocaudal dimension', 'maximum diameter',
  'no significant change', 'not visualized', 'previously noted',
  'redemonstrated', 'stable appearance', 'superimposed', 'transverse diameter',
  'unchanged since prior', 'increased in size', 'decreased in size',
  'new since prior', 'no prior for comparison',

  // ── MRI-specific ──────────────────────────────────────────────────────────
  'diffusion restriction', 'FLAIR hyperintensity', 'fluid-attenuated inversion recovery',
  'gradient echo', 'inversion recovery', 'isointense', 'post-contrast',
  'perfusion imaging', 'signal void', 'STIR sequence', 'susceptibility artifact',
  'T1 shortening', 'T1-weighted', 'T2 prolongation', 'T2-weighted',
  'diffusion-weighted imaging', 'apparent diffusion coefficient',

  // ── CT-specific ───────────────────────────────────────────────────────────
  'air bronchogram', 'beaded septum sign', 'ground-glass attenuation',
  'Hounsfield unit', 'hyperattenuating', 'hypoattenuating',
  'interstitial thickening', 'isoattenuating', 'mosaic attenuation',
  'tree-in-bud pattern', 'vascular blush', 'portal venous phase',
  'arterial phase', 'delayed phase',

  // ── Impression / Conclusion phrases ───────────────────────────────────────
  'clinical correlation recommended', 'correlate clinically', 'dedicated imaging recommended',
  'follow-up recommended', 'further evaluation suggested', 'incompletely evaluated',
  'interval decrease', 'interval increase', 'no acute abnormality identified',
  'no significant interval change', 'recommend MRI', 'recommend CT',
  'recommend ultrasound', 'short-interval follow-up', 'warrants further evaluation',
  'findings are suspicious for', 'findings consistent with', 'cannot exclude',
  'unremarkable examination', 'within normal limits',
];
