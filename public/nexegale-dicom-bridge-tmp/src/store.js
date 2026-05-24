/**
 * Pure-JS file-based store — no native dependencies.
 * Persists state to DATA_DIR/bridge.json
 */

const path = require('path');
const fs   = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'bridge.json');

// ── In-memory state ──────────────────────────────────────────────────────────
let _db = {
  lastChangeId: 0,
  studies: {},   // studyUid → { appointmentId, patientName, studyDate, modality, confidence, status, error, uploadedAt }
};

// Load from disk on startup
function load() {
  if (fs.existsSync(DB_PATH)) {
    try {
      _db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch {
      // corrupted file — start fresh
    }
  }
}

// Write to disk (synchronous, called after every mutation)
function save() {
  fs.writeFileSync(DB_PATH, JSON.stringify(_db, null, 2), 'utf8');
}

load();

// ── Public API ───────────────────────────────────────────────────────────────
const store = {
  isProcessed(studyUid) {
    return !!_db.studies[studyUid];
  },

  markProcessed(studyUid, appointmentId, meta, confidence) {
    _db.studies[studyUid] = {
      appointmentId,
      patientName:  meta.patientName,
      studyDate:    meta.studyDate,
      modality:     meta.modality,
      confidence:   confidence,
      status:       'uploaded',
      uploadedAt:   new Date().toISOString(),
    };
    save();
  },

  markFailed(studyUid, meta, errorMessage) {
    _db.studies[studyUid] = {
      patientName:  meta?.patientName  || '',
      studyDate:    meta?.studyDate    || '',
      modality:     meta?.modality     || '',
      status:       'failed',
      error:        errorMessage,
      uploadedAt:   new Date().toISOString(),
    };
    save();
  },

  getLastChangeId() {
    return _db.lastChangeId || 0;
  },

  setLastChangeId(id) {
    _db.lastChangeId = id;
    save();
  },

  getStats() {
    const all = Object.entries(_db.studies).map(([uid, v]) => ({ study_uid: uid, ...v,
      // normalise field names for the status.js display script
      patient_name:  v.patientName,
      study_date:    v.studyDate,
      error_message: v.error,
      uploaded_at:   v.uploadedAt,
    }));

    const uploaded = all.filter(r => r.status === 'uploaded').length;
    const failed   = all.filter(r => r.status === 'failed').length;
    const recent   = all
      .sort((a, b) => (b.uploaded_at || '').localeCompare(a.uploaded_at || ''))
      .slice(0, 20);

    return { uploaded, failed, recent };
  },
};

module.exports = store;
