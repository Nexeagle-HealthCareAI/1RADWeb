/**
 * Normal findings library — organised by modality and body region.
 * Each entry's `html` is ready to insert directly into Tiptap content.
 */

export const NORMAL_FINDINGS = [
  // ── CT ──────────────────────────────────────────────────────────────────────
  {
    id: 'ct-head',
    modality: 'CT',
    label: 'CT Head',
    icon: '🧠',
    sections: [
      {
        title: 'Normal CT Head',
        html: `<h2>Technique</h2>
<p>Non-contrast CT of the brain was performed.</p>
<h2>Findings</h2>
<p><strong>Brain parenchyma:</strong> No evidence of acute infarct, hemorrhage, mass, or mass effect. Gray-white matter differentiation is preserved. No periventricular or subcortical white matter changes to suggest significant small vessel ischemic disease.</p>
<p><strong>Ventricles:</strong> Normal in size and configuration. No hydrocephalus. Midline structures are in normal position.</p>
<p><strong>Extra-axial spaces:</strong> Sulci are symmetric and of normal caliber for age. No subdural or epidural collection.</p>
<p><strong>Posterior fossa:</strong> Cerebellum and brainstem appear unremarkable. Fourth ventricle is normal.</p>
<p><strong>Calvarium and soft tissues:</strong> No fracture. Visualized paranasal sinuses and mastoid air cells are well-aerated.</p>
<h2>Impression</h2>
<p>No acute intracranial abnormality.</p>`,
      },
    ],
  },
  {
    id: 'ct-chest',
    modality: 'CT',
    label: 'CT Chest',
    icon: '🫁',
    sections: [
      {
        title: 'Normal CT Chest (with contrast)',
        html: `<h2>Technique</h2>
<p>CT of the chest was performed following intravenous contrast administration in the portal venous phase.</p>
<h2>Findings</h2>
<p><strong>Lungs:</strong> No pulmonary nodule, mass, consolidation, or ground-glass opacity. No pleural effusion or pneumothorax. Lung parenchyma is clear bilaterally. Costophrenic angles are acute.</p>
<p><strong>Airways:</strong> Trachea and main bronchi are patent. No central airway lesion or bronchiectasis.</p>
<p><strong>Mediastinum:</strong> No mediastinal or hilar lymphadenopathy by CT size criteria. Cardiac size is normal. No pericardial effusion.</p>
<p><strong>Great vessels:</strong> Aorta is normal in caliber. Pulmonary arteries are of normal caliber. No filling defect to suggest pulmonary embolism.</p>
<p><strong>Chest wall and pleura:</strong> No pleural thickening or calcification. Chest wall is intact. No axillary lymphadenopathy.</p>
<p><strong>Upper abdomen:</strong> Partially visualized upper abdominal organs appear unremarkable.</p>
<h2>Impression</h2>
<p>Normal CT chest. No pulmonary embolism or acute cardiopulmonary process.</p>`,
      },
      {
        title: 'Normal HRCT Chest',
        html: `<h2>Technique</h2>
<p>High-resolution CT (HRCT) of the chest was performed without intravenous contrast using 1-mm slice thickness.</p>
<h2>Findings</h2>
<p><strong>Lung parenchyma:</strong> No ground-glass opacity, consolidation, nodule, or mass. No reticulation, honeycombing, or traction bronchiectasis. No mosaic attenuation or air trapping on expiratory images.</p>
<p><strong>Airways:</strong> No bronchiectasis or bronchial wall thickening. No mucus plugging.</p>
<p><strong>Pleura:</strong> No pleural effusion or thickening. No pneumothorax.</p>
<p><strong>Mediastinum:</strong> No significant lymphadenopathy.</p>
<h2>Impression</h2>
<p>Normal HRCT of the chest. No interstitial lung disease.</p>`,
      },
    ],
  },
  {
    id: 'ct-abd-pelvis',
    modality: 'CT',
    label: 'CT Abdomen & Pelvis',
    icon: '🔍',
    sections: [
      {
        title: 'Normal CT Abdomen & Pelvis (with contrast)',
        html: `<h2>Technique</h2>
<p>CT of the abdomen and pelvis was performed following intravenous and oral contrast administration in the portal venous phase.</p>
<h2>Findings</h2>
<p><strong>Liver:</strong> Normal in size and homogeneous in attenuation. No focal hepatic lesion. Intrahepatic and extrahepatic bile ducts are not dilated. No perihepatic fluid.</p>
<p><strong>Gallbladder:</strong> Well-distended. No cholelithiasis or wall thickening. No pericholecystic fluid or inflammatory change.</p>
<p><strong>Pancreas:</strong> Normal in size, contour, and attenuation. Pancreatic duct is not dilated.</p>
<p><strong>Spleen:</strong> Normal in size and homogeneous in attenuation. No focal lesion.</p>
<p><strong>Adrenal glands:</strong> Bilateral adrenal glands are normal in size and morphology.</p>
<p><strong>Kidneys:</strong> Both kidneys are normal in size with prompt symmetric enhancement. No hydronephrosis, nephrolithiasis, or perinephric stranding. Ureters are not dilated.</p>
<p><strong>Bowel:</strong> No bowel obstruction or wall thickening. No free air or free fluid in the abdomen or pelvis. Appendix is visualized and unremarkable.</p>
<p><strong>Vasculature:</strong> Aorta and iliac vessels are normal in caliber. No aneurysm.</p>
<p><strong>Lymph nodes:</strong> No abdominal or pelvic lymphadenopathy by CT size criteria.</p>
<p><strong>Pelvis:</strong> Urinary bladder is normally distended. Pelvic organs are unremarkable.</p>
<p><strong>Osseous structures:</strong> No acute osseous abnormality. No suspicious lytic or blastic lesion.</p>
<h2>Impression</h2>
<p>Normal CT abdomen and pelvis. No acute intra-abdominal or pelvic pathology.</p>`,
      },
    ],
  },
  {
    id: 'ct-cspine',
    modality: 'CT',
    label: 'CT Cervical Spine',
    icon: '🦴',
    sections: [
      {
        title: 'Normal CT Cervical Spine',
        html: `<h2>Technique</h2>
<p>CT of the cervical spine was performed without contrast with multiplanar reformations.</p>
<h2>Findings</h2>
<p><strong>Alignment:</strong> Cervical lordosis is maintained. No anterolisthesis or retrolisthesis. No fracture or dislocation.</p>
<p><strong>Vertebral bodies:</strong> Vertebral body heights are maintained from C1 through C7. No compression deformity. No suspicious lytic or blastic osseous lesion.</p>
<p><strong>Disc spaces:</strong> Intervertebral disc spaces are maintained at all levels. No significant disc space narrowing.</p>
<p><strong>Spinal canal:</strong> Spinal canal is patent at all levels. No significant canal stenosis.</p>
<p><strong>Neural foramina:</strong> Neural foramina appear patent at all visualized levels.</p>
<p><strong>Posterior elements:</strong> Posterior elements are intact. Facet joints are unremarkable.</p>
<p><strong>Prevertebral soft tissues:</strong> Prevertebral soft tissues are within normal limits.</p>
<h2>Impression</h2>
<p>No acute fracture or traumatic malalignment. Normal cervical spine CT.</p>`,
      },
    ],
  },

  // ── MRI ─────────────────────────────────────────────────────────────────────
  {
    id: 'mri-brain',
    modality: 'MRI',
    label: 'MRI Brain',
    icon: '🧲',
    sections: [
      {
        title: 'Normal MRI Brain (without contrast)',
        html: `<h2>Technique</h2>
<p>MRI of the brain was performed including axial T1, T2, FLAIR, DWI, and ADC sequences.</p>
<h2>Findings</h2>
<p><strong>Brain parenchyma:</strong> No acute infarct on diffusion-weighted imaging. No abnormal T2/FLAIR signal. Gray-white matter differentiation is well maintained. No mass or mass effect. No intracranial hemorrhage.</p>
<p><strong>White matter:</strong> No periventricular or subcortical white matter T2/FLAIR hyperintensities to suggest significant small vessel ischemic change.</p>
<p><strong>Ventricles:</strong> Lateral, third, and fourth ventricles are normal in size and configuration. No hydrocephalus. No midline shift.</p>
<p><strong>Extra-axial spaces:</strong> Subarachnoid spaces and sulci are symmetric and appropriate for age. No subdural or epidural collection.</p>
<p><strong>Posterior fossa:</strong> Cerebellum and brainstem are unremarkable. No signal abnormality. Cerebellar tonsils are at normal position.</p>
<p><strong>Pituitary:</strong> Normal size and configuration. No sellar or suprasellar mass.</p>
<p><strong>Vessels:</strong> Major intracranial flow voids are maintained. No vascular malformation identified.</p>
<h2>Impression</h2>
<p>No acute or significant intracranial abnormality on MRI.</p>`,
      },
      {
        title: 'Normal MRI Brain (with contrast)',
        html: `<h2>Technique</h2>
<p>MRI of the brain was performed including pre- and post-gadolinium T1, T2, FLAIR, and DWI sequences.</p>
<h2>Findings</h2>
<p><strong>Brain parenchyma:</strong> No acute infarct on diffusion-weighted imaging. No abnormal T2/FLAIR signal. No intracranial hemorrhage. Gray-white matter differentiation is maintained.</p>
<p><strong>Enhancement:</strong> No abnormal parenchymal, leptomeningeal, or vascular enhancement following contrast administration.</p>
<p><strong>Ventricles:</strong> Normal in size and configuration. No hydrocephalus. No midline shift.</p>
<p><strong>Extra-axial spaces:</strong> No subdural or epidural collection. No leptomeningeal thickening or enhancement.</p>
<p><strong>Posterior fossa:</strong> Cerebellum and brainstem are unremarkable.</p>
<p><strong>Vessels:</strong> Major intracranial flow voids are maintained.</p>
<h2>Impression</h2>
<p>No acute intracranial abnormality. No abnormal enhancement to suggest neoplasm or infection.</p>`,
      },
    ],
  },
  {
    id: 'mri-ls-spine',
    modality: 'MRI',
    label: 'MRI Lumbar Spine',
    icon: '🦴',
    sections: [
      {
        title: 'Normal MRI Lumbar Spine',
        html: `<h2>Technique</h2>
<p>MRI of the lumbar spine was performed including sagittal T1, T2, STIR, and axial T2-weighted sequences.</p>
<h2>Findings</h2>
<p><strong>Alignment:</strong> Lumbar lordosis is preserved. No spondylolisthesis at any level. No scoliosis.</p>
<p><strong>Vertebral bodies:</strong> Vertebral body heights are maintained from T12 through S1. No compression fracture or marrow signal abnormality. No suspicious osseous lesion.</p>
<p><strong>Intervertebral discs:</strong> Discs maintain normal height and T2 signal intensity from L1-L2 through L5-S1. No disc herniation, protrusion, or extrusion. No significant annular fissure.</p>
<p><strong>Spinal canal:</strong> Spinal canal is patent at all levels. No significant central canal stenosis. Conus medullaris terminates normally at the T12-L1 level. Cauda equina nerve roots are symmetrically arranged with no clumping or enhancement.</p>
<p><strong>Neural foramina:</strong> Neural foramina are patent bilaterally at all levels. No significant foraminal or lateral recess stenosis.</p>
<p><strong>Facet joints:</strong> No significant facet arthropathy or effusion.</p>
<p><strong>Paraspinal soft tissues:</strong> Paraspinal musculature is well maintained without significant atrophy or fatty replacement.</p>
<h2>Impression</h2>
<p>Normal MRI of the lumbar spine. No disc herniation, spinal canal stenosis, or neural foraminal narrowing.</p>`,
      },
    ],
  },
  {
    id: 'mri-c-spine',
    modality: 'MRI',
    label: 'MRI Cervical Spine',
    icon: '🦴',
    sections: [
      {
        title: 'Normal MRI Cervical Spine',
        html: `<h2>Technique</h2>
<p>MRI of the cervical spine was performed including sagittal T1, T2, STIR, and axial T2-weighted sequences.</p>
<h2>Findings</h2>
<p><strong>Alignment:</strong> Cervical lordosis is maintained. No anterolisthesis or retrolisthesis.</p>
<p><strong>Vertebral bodies:</strong> Vertebral body heights and signal are preserved from C2 through T1. No fracture or marrow abnormality.</p>
<p><strong>Intervertebral discs:</strong> Intervertebral discs maintain normal height and T2 signal from C2-C3 through C7-T1. No disc herniation or extrusion at any level.</p>
<p><strong>Spinal cord:</strong> Cervical spinal cord is of normal caliber and signal intensity throughout. No myelopathy, cord compression, or intrinsic signal change.</p>
<p><strong>Spinal canal:</strong> Spinal canal is patent at all levels without significant central stenosis.</p>
<p><strong>Neural foramina:</strong> Neural foramina are patent bilaterally. No significant foraminal stenosis.</p>
<p><strong>Posterior elements:</strong> Facet joints and posterior elements are unremarkable.</p>
<h2>Impression</h2>
<p>Normal MRI of the cervical spine. No disc herniation, myelopathy, or canal stenosis.</p>`,
      },
    ],
  },
  {
    id: 'mri-shoulder',
    modality: 'MRI',
    label: 'MRI Shoulder',
    icon: '💪',
    sections: [
      {
        title: 'Normal MRI Shoulder',
        html: `<h2>Technique</h2>
<p>MRI of the [right/left] shoulder was performed without contrast including coronal oblique, sagittal oblique, and axial sequences.</p>
<h2>Findings</h2>
<p><strong>Rotator cuff:</strong> Supraspinatus, infraspinatus, subscapularis, and teres minor tendons are intact with no full-thickness tear, partial tear, or tendinosis. No peritendinous fluid or bursal fluid.</p>
<p><strong>Biceps tendon:</strong> Long head of the biceps tendon is intact and in normal position within the bicipital groove. No tenosynovitis or subluxation.</p>
<p><strong>Labrum:</strong> Anterior, posterior, superior, and inferior labrum are intact. No labral tear or detachment. No paralabral cyst.</p>
<p><strong>Glenohumeral joint:</strong> No significant joint effusion. Articular cartilage surfaces appear intact without chondral defect or flap.</p>
<p><strong>Acromioclavicular joint:</strong> No significant AC joint arthrosis. Distal clavicle is unremarkable.</p>
<p><strong>Subacromial space:</strong> Subacromial-subdeltoid bursa is not distended. No impingement. Acromion morphology is type ___.</p>
<p><strong>Osseous structures:</strong> No fracture, bone marrow edema, or avascular necrosis. No Hill-Sachs or Bankart bony lesion.</p>
<h2>Impression</h2>
<p>Normal MRI of the [right/left] shoulder. No rotator cuff tear, labral pathology, or significant glenohumeral joint disease.</p>`,
      },
    ],
  },
  {
    id: 'mri-knee',
    modality: 'MRI',
    label: 'MRI Knee',
    icon: '🦵',
    sections: [
      {
        title: 'Normal MRI Knee',
        html: `<h2>Technique</h2>
<p>MRI of the [right/left] knee was performed without contrast including sagittal PD, coronal PD FS, axial PD, and sagittal T1-weighted sequences.</p>
<h2>Findings</h2>
<p><strong>Menisci:</strong> Medial and lateral menisci are intact. No tear, extrusion, or maceration. Meniscal horns are of normal morphology and signal.</p>
<p><strong>Cruciate ligaments:</strong> Anterior and posterior cruciate ligaments are intact, of normal caliber and signal.</p>
<p><strong>Collateral ligaments:</strong> Medial and lateral collateral ligamentous complexes are intact.</p>
<p><strong>Extensor mechanism:</strong> Quadriceps tendon and patellar tendon are intact. No tear or tendinosis.</p>
<p><strong>Articular cartilage:</strong> Articular cartilage is intact throughout the patellofemoral, medial, and lateral compartments without focal defect or chondromalacia.</p>
<p><strong>Bone marrow:</strong> No bone marrow edema, fracture, or osseous contusion.</p>
<p><strong>Joint:</strong> Trace physiologic joint fluid. No significant effusion. No loose bodies.</p>
<p><strong>Soft tissues:</strong> Surrounding soft tissues are unremarkable. No Baker's cyst or popliteal mass.</p>
<h2>Impression</h2>
<p>Normal MRI of the [right/left] knee. No meniscal tear, ligamentous injury, or chondral defect.</p>`,
      },
    ],
  },

  // ── X-Ray ───────────────────────────────────────────────────────────────────
  {
    id: 'xray-chest',
    modality: 'X-Ray',
    label: 'X-Ray Chest',
    icon: '📡',
    sections: [
      {
        title: 'Normal Chest X-Ray (PA & Lateral)',
        html: `<h2>Technique</h2>
<p>PA and lateral chest radiographs were obtained.</p>
<h2>Findings</h2>
<p><strong>Lungs:</strong> Clear lung fields bilaterally. No focal consolidation, interstitial opacification, or pleural effusion. No pneumothorax. Costophrenic and cardiophrenic angles are acute.</p>
<p><strong>Cardiac:</strong> Cardiac silhouette is normal in size (cardiothoracic ratio &lt; 0.5). Cardiac contours are within normal limits.</p>
<p><strong>Mediastinum:</strong> Mediastinum is of normal width. Aortic knuckle is normal. No mediastinal widening.</p>
<p><strong>Hila:</strong> Bilateral hila are of normal size and configuration. No hilar lymphadenopathy.</p>
<p><strong>Trachea:</strong> Trachea is midline. No tracheal deviation.</p>
<p><strong>Bones:</strong> Visualized ribs and thoracic spine appear intact. No acute rib fracture or osseous lesion.</p>
<p><strong>Soft tissues:</strong> Visualized soft tissues are unremarkable. No subcutaneous emphysema. No pneumomediastinum.</p>
<h2>Impression</h2>
<p>Normal chest radiograph. No acute cardiopulmonary process.</p>`,
      },
    ],
  },

  // ── Ultrasound ───────────────────────────────────────────────────────────────
  {
    id: 'us-abdomen',
    modality: 'US',
    label: 'Ultrasound Abdomen',
    icon: '📻',
    sections: [
      {
        title: 'Normal Ultrasound Abdomen',
        html: `<h2>Technique</h2>
<p>Real-time grayscale and color Doppler ultrasound of the abdomen was performed.</p>
<h2>Findings</h2>
<p><strong>Liver:</strong> Normal in size and echogenicity. Smooth margins. No focal hepatic lesion. No intrahepatic biliary dilatation. Normal hepatic vasculature with appropriate flow direction on Doppler.</p>
<p><strong>Gallbladder:</strong> Well-distended with a thin wall. No cholelithiasis, polyps, or wall thickening. No pericholecystic fluid. No sonographic Murphy's sign.</p>
<p><strong>Common bile duct:</strong> Not dilated (measures ___ mm in caliber).</p>
<p><strong>Pancreas:</strong> Head, body, and tail are visualized and within normal limits. Pancreatic duct is not dilated.</p>
<p><strong>Spleen:</strong> Normal in size (___ cm) and echogenicity. No focal splenic lesion.</p>
<p><strong>Right kidney:</strong> Normal in size (___ cm) with preserved corticomedullary differentiation. Normal cortical echogenicity. No hydronephrosis, calculus, or perinephric fluid.</p>
<p><strong>Left kidney:</strong> Normal in size (___ cm) with preserved corticomedullary differentiation. Normal cortical echogenicity. No hydronephrosis, calculus, or perinephric fluid.</p>
<p><strong>Aorta:</strong> Visualized aorta is normal in caliber. No aneurysm. No significant atherosclerotic change.</p>
<p><strong>Free fluid:</strong> No ascites or free fluid in the abdomen.</p>
<h2>Impression</h2>
<p>Normal ultrasound of the abdomen.</p>`,
      },
    ],
  },
  {
    id: 'us-thyroid',
    modality: 'US',
    label: 'Ultrasound Thyroid',
    icon: '🦋',
    sections: [
      {
        title: 'Normal Ultrasound Thyroid',
        html: `<h2>Technique</h2>
<p>Grayscale and color Doppler ultrasound of the thyroid gland and adjacent neck was performed.</p>
<h2>Findings</h2>
<p><strong>Thyroid gland:</strong> Normal in size. Right lobe measures ___ × ___ × ___ cm. Left lobe measures ___ × ___ × ___ cm. Isthmus measures ___ mm in AP diameter. Echogenicity is homogeneous and normal. No focal nodule or cyst. No calcification. Normal vascularity on Doppler imaging.</p>
<p><strong>Parathyroid glands:</strong> No parathyroid gland enlargement identified.</p>
<p><strong>Cervical lymph nodes:</strong> No pathologically enlarged cervical lymph node identified. Visualized lymph nodes are of normal morphology.</p>
<h2>Impression</h2>
<p>Normal thyroid ultrasound. No thyroid nodule, cyst, or lymphadenopathy identified. TIRADS 1.</p>`,
      },
    ],
  },
];

/** All unique modalities present in the library */
export const MODALITIES = [...new Set(NORMAL_FINDINGS.map(e => e.modality))];
