/**
 * Match an Orthanc study to a 1Rad appointment.
 *
 * Scoring weights:
 *   Patient name similarity  50%
 *   Study date exact match   35%
 *   Modality exact match     15%
 */

// Normalise a name to lowercase alpha-numeric tokens
function normalizeName(name = '') {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Token-overlap Jaccard similarity (0–1)
function nameSimilarity(a, b) {
  const ta = new Set(normalizeName(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeName(b).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  const intersection = [...ta].filter(t => tb.has(t)).length;
  return intersection / (ta.size + tb.size - intersection);
}

// Convert DICOM date YYYYMMDD → YYYY-MM-DD
function dicomDateToISO(dicomDate = '') {
  if (!dicomDate || dicomDate.length < 8) return null;
  const d = dicomDate.replace(/\D/g, '');
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

// Score a single appointment against study metadata
function scoreAppointment(appointment, meta) {
  // 1. Precise Accession Number Match (100% confidence)
  // In radiology, AccessionNumber perfectly maps to the RIS DisplayId or UUID.
  if (meta.accessionNumber) {
    const accession = meta.accessionNumber.trim().toLowerCase();
    if (appointment.displayId && accession === appointment.displayId.trim().toLowerCase()) {
      return 1000; // Unbeatable perfect score
    }
    if (appointment.appointmentId && accession === appointment.appointmentId.toLowerCase()) {
      return 1000;
    }
  }

  let score = 0;

  // Name (50%)
  const nameScore = nameSimilarity(appointment.patientName || '', meta.patientName);
  score += nameScore * 0.50;

  // Date (35%)
  const studyISO = dicomDateToISO(meta.studyDate);
  const apptDate = appointment.dateTime ? appointment.dateTime.split('T')[0] : null;
  if (studyISO && apptDate) {
    score += (studyISO === apptDate ? 1 : 0) * 0.35;
  }

  // Modality (15%)
  if (meta.modality && appointment.modality) {
    const modalityOk =
      appointment.modality.toUpperCase() === meta.modality ||
      appointment.modality.toUpperCase().startsWith(meta.modality);
    score += (modalityOk ? 1 : 0) * 0.15;
  }

  return score;
}

const matcher = {
  /**
   * Find the best matching appointment from a list.
   * @param {Array}  appointments  - array from GET /appointments
   * @param {Object} meta          - parsed study metadata from Orthanc
   * @param {number} threshold     - minimum confidence (default 0.6)
   * @returns {{ appointment, confidence } | null}
   */
  findBestMatch(appointments, meta, threshold = 0.6) {
    if (!appointments.length) return null;

    const scored = appointments
      .map(appt => ({ appointment: appt, confidence: scoreAppointment(appt, meta) }))
      .sort((a, b) => b.confidence - a.confidence);

    const best = scored[0];
    if (best.confidence >= threshold) return best;
    return null;
  },

  // Expose helpers for testing / logging
  nameSimilarity,
  dicomDateToISO,
  scoreAppointment,
};

module.exports = matcher;
