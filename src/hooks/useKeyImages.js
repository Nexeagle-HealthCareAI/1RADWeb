import { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '../api/apiClient';

/**
 * Key images for the report on screen, saved on the server against the exact
 * DICOM instance (so they survive reloads, other devices, printing, and feed
 * drafting from images). Owner = this visit study, or the PACS study.
 */
export default function useKeyImages({ appointmentId, serviceId, studyId, notify }) {
  const [items, setItems] = useState([]);
  const owner = useMemo(() => (studyId
    ? { imagingStudyId: studyId }
    : appointmentId ? { appointmentId, appointmentServiceId: serviceId || null } : null),
  [appointmentId, serviceId, studyId]);

  useEffect(() => {
    let alive = true;
    if (!owner) return undefined;
    const params = owner.imagingStudyId
      ? { studyId: owner.imagingStudyId }
      : { appointmentId: owner.appointmentId, ...(owner.appointmentServiceId ? { serviceId: owner.appointmentServiceId } : {}) };
    apiClient.get('/reporting/key-images', { params })
      .then((res) => { if (alive) setItems(res?.data?.data || []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; setItems([]); };
  }, [owner]);

  const sops = useMemo(() => items.map(k => k.sopInstanceUid), [items]);

  /** Star / un-star one image. `file` needs sopInstanceUID; `asset` gives series + upload id. */
  const toggle = useCallback(async (file, asset, sliceIndex) => {
    if (!owner) return;
    const sop = file?.sopInstanceUID;
    if (!sop) {
      notify?.('info', 'KEY IMAGE', 'Key images can be saved once this study has finished processing on the server.');
      return;
    }
    const existing = items.find(k => k.sopInstanceUid === sop);
    try {
      if (existing) {
        setItems(list => list.filter(k => k.id !== existing.id));
        await apiClient.delete(`/reporting/key-images/${existing.id}`);
      } else {
        const res = await apiClient.post('/reporting/key-images', {
          ...owner,
          studyAssetId: asset?.sourceAssetId || null,
          seriesInstanceUid: asset?.seriesUID || null,
          sopInstanceUid: sop,
          sliceIndex: Number.isFinite(sliceIndex) ? sliceIndex : null,
        });
        const saved = res?.data?.data;
        if (saved) setItems(list => (list.some(k => k.id === saved.id) ? list : [...list, saved]));
      }
    } catch (e) {
      if (existing) setItems(list => (list.some(k => k.id === existing.id) ? list : [...list, existing]));
      notify?.('warning', 'KEY IMAGE', e?.response?.data?.error || 'Could not save the key image.');
    }
  }, [owner, items, notify]);

  return { keyImages: items, keyImageSops: sops, toggleKeyImage: toggle };
}
