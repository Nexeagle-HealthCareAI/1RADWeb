const axios = require('axios');
const path = require('path');
const fs = require('fs');
const os = require('os');

const client = axios.create({
  baseURL: process.env.ORTHANC_URL || 'http://localhost:8042',
  auth: {
    username: process.env.ORTHANC_USER || 'orthanc',
    password: process.env.ORTHANC_PASS || 'orthanc',
  },
  timeout: 30000,
});

const orthanc = {
  // Poll the /changes feed from a given sequence ID
  async getChanges(lastId = 0, limit = 100) {
    const res = await client.get('/changes', { params: { last: lastId, limit } });
    // Returns: { Changes: [{ChangeType, Date, ID, Path, Seq, ResourceType}], Done, Last }
    return res.data;
  },

  // Full study object including MainDicomTags and PatientMainDicomTags
  async getStudy(studyUid) {
    const res = await client.get(`/studies/${studyUid}`);
    return res.data;
  },

  // Stream study ZIP to a temp file, returns the temp file path
  async downloadStudyZip(studyUid, onProgress) {
    const tmpPath = path.join(os.tmpdir(), `nexegale_${studyUid}_${Date.now()}.zip`);
    const writer = fs.createWriteStream(tmpPath);

    const res = await client.get(`/studies/${studyUid}/archive`, {
      responseType: 'stream',
      timeout: 10 * 60 * 1000, // 10 min for large studies
    });

    const total = parseInt(res.headers['content-length'] || '0', 10);
    let downloaded = 0;

    res.data.on('data', (chunk) => {
      downloaded += chunk.length;
      if (onProgress && total > 0) {
        onProgress(Math.round((downloaded / total) * 100));
      }
    });

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
      res.data.pipe(writer);
    });

    return tmpPath;
  },

  // Extract clean metadata from Orthanc study response
  parseStudyMeta(study) {
    const main    = study.MainDicomTags || {};
    const patient = study.PatientMainDicomTags || {};

    // Orthanc encodes DICOM names with ^ separators: SMITH^JOHN^M → "SMITH JOHN M"
    const rawName = patient.PatientName || '';
    const patientName = rawName.replace(/\^+/g, ' ').trim();

    // Modalities can be multi-value: "CT\\MR" — take first
    const rawModality = main.ModalitiesInStudy || main.Modality || '';
    const modality = rawModality.split(/[\\,]/)[0].toUpperCase().trim();

    return {
      studyUid:         study.ID,
      instanceUid:      main.StudyInstanceUID || study.ID,
      patientName,
      patientId:        patient.PatientID || '',
      studyDate:        main.StudyDate || '',       // YYYYMMDD
      studyTime:        main.StudyTime || '',
      modality,
      accessionNumber:  main.AccessionNumber || '',
      studyDescription: main.StudyDescription || '',
      seriesCount:      (study.Series || []).length,
    };
  },

  // Verify Orthanc is reachable
  async ping() {
    try {
      await client.get('/system', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  },
};

module.exports = orthanc;
