// Shared referrer-profile-completion helpers — used by the roster view, the
// referrer edit drawer, and anywhere else that shows "X% profile complete".
export const getReferrerProfileCompletion = (ref) => {
  if (!ref) return { pct: 0, filled: 0, total: 1, missing: [] };
  const isDoctor = ref.isDoctor !== false; // default Doctor
  const has = (v) => !!String(v ?? '').trim();
  const fields = isDoctor
    ? [
        { label: 'Name', ok: has(ref.name) },
        { label: 'Mobile', ok: has(ref.contact) },
        { label: 'Email', ok: has(ref.email) },
        { label: 'Speciality', ok: has(ref.specialty) },
        { label: 'Degree', ok: has(ref.degree) },
        { label: 'Address', ok: has(ref.address) },
      ]
    : [
        { label: 'Name', ok: has(ref.name) },
        { label: 'Mobile', ok: has(ref.contact) },
        { label: 'Email', ok: has(ref.email) },
        { label: 'Supporting doctor', ok: has(ref.supportedByDoctor) },
        { label: 'Address', ok: has(ref.address) },
      ];
  const total = fields.length;
  const filled = fields.filter(f => f.ok).length;
  const pct = Math.round((filled / total) * 100);
  const missing = fields.filter(f => !f.ok).map(f => f.label);
  return { pct, filled, total, missing };
};

// Shared colour ramp for a completion %: red (sparse) → amber → green (full).
export const completionColor = (pct) => (pct >= 80 ? '#16a34a' : pct >= 40 ? '#f59e0b' : '#ef4444');
