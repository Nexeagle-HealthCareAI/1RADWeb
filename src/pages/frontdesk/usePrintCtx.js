import React from 'react';
import apiClient from '../../api/apiClient';
import { useBillingSettings } from '../../api/billing/billingSettingsApi';

/**
 * What Billing's print functions need (centre tax identity, GST switch, owner
 * contact) — loaded the same way BillingPage does, so a bill or receipt printed
 * from the front desk looks exactly like one printed from Billing.
 */
export default function usePrintCtx(activeCenter) {
  const [taxProfile, setTaxProfile] = React.useState(null);
  const [ownerDetails, setOwnerDetails] = React.useState(null);
  const id = activeCenter?.id;
  React.useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    apiClient.get(`/hospitals/${id}`, { suppressErrorToast: true }).then(res => {
      if (!alive) return;
      const d = res?.data || {};
      setTaxProfile({
        gstin: (d.gstin || d.GSTIN || '').toUpperCase(), pan: (d.pan || d.PAN || '').toUpperCase(),
        hospitalAddress: d.hospitalAddress || '', registrationNumber: d.registrationNumber || '',
        nabhNumber: d.nabhNumber || d.NABHNumber || '', publicContact: d.publicContact || '', publicEmail: d.publicEmail || '',
      });
    }).catch(() => {});
    apiClient.get('/personnel', { suppressErrorToast: true }).then(res => {
      if (!alive) return;
      const list = Array.isArray(res?.data) ? res.data : res?.data?.items || [];
      const has = (u, r) => (u.roles || u.Roles || []).map(x => String(x).toLowerCase()).includes(r);
      const owner = list.find(u => has(u, 'admindoctor')) || list.find(u => has(u, 'admin'));
      if (owner) setOwnerDetails({ name: owner.fullName || owner.FullName || '', contact: owner.mobile || owner.Mobile || owner.phoneNumber || '', email: owner.email || owner.Email || '' });
    }).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  const taxSettings = useBillingSettings(id);
  const gstEnabled = taxSettings?.gstEnabled !== false;
  return React.useMemo(() => ({
    activeCenter, ownerDetails, taxProfile: taxProfile ? { ...taxProfile, gstEnabled } : taxProfile,
  }), [activeCenter, ownerDetails, taxProfile, gstEnabled]);
}
