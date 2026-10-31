import { t } from '../i18n';

/**
 * One set of words for where a visit is (UI review: each board used its own —
 * Expected / Not started / Needs report / ACQUIRED…). Every screen shows these.
 *
 *   notArrived → arrived → inScan → waitingReport → reportReady → given
 *   (+ cancelled)
 *
 * Arrival: status CONFIRMED (set by "Mark arrived") or arrivedAt.
 * COMPLETED is the legacy word for scanned.
 */
export const STAGES = ['notArrived', 'arrived', 'inScan', 'waitingReport', 'reportReady', 'given', 'cancelled'];

export function visitStage(status, arrivedAt) {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'cancelled') return 'cancelled';
  if (s === 'delivered') return 'given';
  if (s === 'reported') return 'reportReady';
  if (s === 'scanned' || s === 'completed' || s === 'reporting') return 'waitingReport';
  if (s === 'in_progress' || s === 'scanning') return 'inScan';
  // CONFIRMED is what "Mark arrived" sets (the API stamps ArrivedAt with it).
  if (arrivedAt || s === 'arrived' || s === 'confirmed') return 'arrived';
  return 'notArrived';
}

/** Background / text colours per stage; text passes 4.5:1 on its background. */
export const STAGE_COLORS = {
  notArrived: { bg: '#FEF3C7', fg: '#92400E' },
  arrived: { bg: '#DBEAFE', fg: '#1E40AF' },
  inScan: { bg: '#EDE9FE', fg: '#5B21B6' },
  waitingReport: { bg: '#FFEDD5', fg: '#9A3412' },
  reportReady: { bg: '#DCFCE7', fg: '#166534' },
  given: { bg: '#F1F5F9', fg: '#334155' },
  cancelled: { bg: '#F3F4F6', fg: '#4B5563' },
};

export const stageLabel = (stage) => t(`stage.${stage}`);
