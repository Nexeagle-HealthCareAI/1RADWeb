import { useEffect, useState } from 'react';
import apiClient from '../apiClient';

/**
 * The centre's tax & billing switches (Admin → Tax & billing): GST on bills,
 * credit notes, TDS on referral payouts and its rates, front-desk discount limit.
 * Everyone at the centre can read them; only admins can change them.
 */
export const fetchBillingSettings = async (hospitalId) => {
  const res = await apiClient.get(`/hospitals/${hospitalId}/billing-settings`);
  return res.data;
};

export const saveBillingSettings = async (hospitalId, body) => {
  const res = await apiClient.put(`/hospitals/${hospitalId}/billing-settings`, body);
  cache.set(hospitalId, Promise.resolve(res.data));
  listeners.forEach(fn => fn(hospitalId, res.data));
  return res.data;
};

// One fetch per centre per page load, shared by every screen that needs it.
const cache = new Map();
const listeners = new Set();

/** Settings for the centre, or null while loading / if they can't be read (callers then assume the defaults). */
export function useBillingSettings(hospitalId) {
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    if (!hospitalId) return undefined;
    let alive = true;
    if (!cache.has(hospitalId)) {
      cache.set(hospitalId, fetchBillingSettings(hospitalId).catch(() => { cache.delete(hospitalId); return null; }));
    }
    cache.get(hospitalId).then(s => { if (alive) setSettings(s); });
    const onSave = (id, s) => { if (alive && id === hospitalId) setSettings(s); };
    listeners.add(onSave);
    return () => { alive = false; listeners.delete(onSave); };
  }, [hospitalId]);
  return settings;
}
