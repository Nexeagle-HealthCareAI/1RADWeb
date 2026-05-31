// React surface for the quota monitor. Subscribes to the monitor's
// emitter and re-renders when usage crosses a threshold. The TopNav badge
// uses this to render "Cache 85%" when over the warn threshold, with
// red/amber tinting matching useSyncStatus.

import { useEffect, useState } from 'react';
import { onQuotaChange, getQuotaSnapshot } from './quotaMonitor';

export default function useQuotaStatus() {
  const [snap, setSnap] = useState(() => getQuotaSnapshot());
  useEffect(() => onQuotaChange(setSnap), []);
  return snap;
}
