import React from 'react';
import * as XLSX from 'xlsx-js-style';
import apiClient from '../../api/apiClient';
import { t } from '../../i18n';
import { Button, Chip, Sheet, Tag } from '../../components/saral/Saral';
import { C } from '../../components/saral/tokens';
import { Err, Note } from '../frontdesk/parts';
import { apiError, fieldStyle } from '../frontdesk/fdUtil';

/**
 * Add many partners from an Excel sheet (POST /referrers/bulk) - same template and
 * column names as the Referrals page. A name the centre already has (same mobile)
 * only fills in what was blank; the same name on another mobile is skipped.
 */
export function UploadSheet({ onClose, onDone }) {
  const [rows, setRows] = React.useState([]);
  const [result, setResult] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');

  const template = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Contact', 'IsDoctor (Yes/No)', 'Specialty', 'Degree', 'Email', 'Address', 'SupportedByDoctor'],
      ['Dr A Sharma', '9876543210', 'Yes', 'Radiology', 'MD', '', '', ''],
      ['Rahul Kumar', '9000000000', 'No', '', '', '', '', 'Dr A Sharma'],
    ]);
    ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Partners');
    const blob = new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'partner_upload_template.xlsx'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const read = async (file) => {
    if (!file) return;
    setErr(''); setResult(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const get = (row, keys) => {
        for (const k of Object.keys(row)) if (keys.includes(k.toLowerCase().replace(/[^a-z]/g, ''))) return String(row[k] ?? '').trim();
        return '';
      };
      const list = json.map(r => {
        const doc = get(r, ['isdoctor', 'isdoctoryesno', 'doctor']).toLowerCase();
        return {
          name: get(r, ['name', 'partnername', 'fullname']), contact: get(r, ['contact', 'mobile', 'phone']),
          specialty: get(r, ['specialty', 'speciality']), degree: get(r, ['degree']), email: get(r, ['email']),
          address: get(r, ['address']), supportedByDoctor: get(r, ['supportedbydoctor', 'forwhichdoctor']),
          isDoctor: !['no', 'n', 'false', '0'].includes(doc),
        };
      }).filter(r => r.name);
      if (!list.length) setErr(t('bu.noRows'));
      setRows(list);
    } catch { setErr(t('bu.badFile')); }
  };

  const add = async () => {
    setBusy(true); setErr('');
    try {
      const n = (v) => (String(v || '').trim() || null);
      const { data } = await apiClient.post('/referrers/bulk', {
        referrers: rows.map(r => ({ name: r.name.trim(), contact: n(r.contact), address: n(r.address), email: n(r.email), specialty: n(r.specialty), degree: n(r.degree), isDoctor: r.isDoctor !== false, supportedByDoctor: n(r.supportedByDoctor) })),
      }, { suppressErrorToast: true });
      setResult(data || {}); setRows([]); onDone?.();
    } catch (e) { setErr(apiError(e) || t('pf.failed')); }
    setBusy(false);
  };

  return (
    <Sheet open onClose={onClose} wide title={t('bu.title')} footer={
      <div style={{ display: 'grid', gap: 8 }}>
        {err && <Err>{err}</Err>}
        {rows.length > 0
          ? <Button size="lg" disabled={busy} onClick={add}>{busy ? t('pf.saving') : t('bu.add', { n: rows.length })}</Button>
          : <Button kind="outline" size="lg" onClick={onClose}>{t('tk.done')}</Button>}
      </div>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Note>{t('bu.help')}</Note>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <Button kind="outline" onClick={template}>{t('bu.template')}</Button>
          <label style={{ display: 'block' }}>
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => read(e.target.files?.[0])} />
            <span style={{ height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, background: C.primary, color: 'white', cursor: 'pointer' }}>{t('bu.choose')}</span>
          </label>
        </div>
        {result && <div style={{ background: C.okSoft, color: C.ok, borderRadius: 14, padding: 12, fontSize: 16, fontWeight: 700 }}>{t('bu.result', { created: result.created || 0, merged: result.merged || 0, skipped: result.skipped || 0 })}</div>}
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'white', border: `1px solid ${C.line}`, borderRadius: 12, padding: '8px 12px' }}>
            <Tag bg={r.isDoctor ? C.primarySoft : '#F3F4F6'} fg={r.isDoctor ? C.primary : '#374151'} style={{ fontSize: 13, padding: '3px 10px' }}>{r.isDoctor ? t('ps.doctor') : t('ps.agent')}</Tag>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{r.name}{r.specialty ? ` · ${r.specialty}` : ''}</div>
              <div style={{ fontSize: 14, color: C.muted }}>{[r.contact, r.supportedByDoctor && t('ps.agentFor', { name: r.supportedByDoctor })].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/**
 * Send portal links to many partners at once (POST /referrers/send-links-whatsapp or
 * /send-links with their ids) - the "select and send" of the Doctor Links tab.
 */
export function LinksSheet({ roster, linkStatus, onClose }) {
  const people = (roster || []).filter(p => !p.mergedIntoId && !p.deletedAt && String(p.name || '').trim().toLowerCase() !== 'self')
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const [q, setQ] = React.useState('');
  const [picked, setPicked] = React.useState(() => new Set());
  const [busy, setBusy] = React.useState('');
  const [done, setDone] = React.useState(null);
  const [err, setErr] = React.useState('');
  const shown = people.filter(p => !q.trim() || String(p.name).toLowerCase().includes(q.trim().toLowerCase()) || String(p.contact || '').includes(q.trim()));
  const toggle = (id) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const send = async (channel) => {
    if (!picked.size) return setErr(t('ls.pickSome'));
    setBusy(channel); setErr('');
    try {
      const { data } = await apiClient.post(channel === 'wa' ? '/referrers/send-links-whatsapp' : '/referrers/send-links',
        { referrerIds: [...picked], baseUrl: window.location.origin }, { suppressErrorToast: true });
      setDone({
        sent: data?.sent || 0,
        skipped: channel === 'wa' ? (data?.noContact?.length || 0) : (data?.skipped || 0),
        failed: data?.failed?.length || 0, error: data?.error || '',
      });
      setPicked(new Set());
    } catch (e) { setErr(apiError(e) || t('ps.linkFailed')); }
    setBusy('');
  };

  return (
    <Sheet open onClose={onClose} wide title={t('ls.title')} footer={
      <div style={{ display: 'grid', gap: 8 }}>
        {err && <Err>{err}</Err>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Button icon="whatsapp" disabled={!!busy || !picked.size} onClick={() => send('wa')}>{busy === 'wa' ? t('ps.sending') : t('ls.sendWa', { n: picked.size })}</Button>
          <Button kind="outline" disabled={!!busy || !picked.size} onClick={() => send('email')}>{busy === 'email' ? t('ps.sending') : t('ls.sendEmail', { n: picked.size })}</Button>
        </div>
      </div>}>
      <div style={{ display: 'grid', gap: 10 }}>
        {done && (
          <div style={{ background: done.sent > 0 ? C.okSoft : C.dueSoft, color: done.sent > 0 ? C.ok : C.dueInk, borderRadius: 14, padding: 12, fontSize: 16, fontWeight: 700 }}>
            {t('ls.result', { sent: done.sent, skipped: done.skipped, failed: done.failed })}{done.error ? ` · ${done.error}` : ''}
          </div>
        )}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('pt.search')} aria-label={t('pt.search')} style={fieldStyle} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Chip on={false} onClick={() => setPicked(new Set(shown.map(p => p.referrerId)))}>{t('ls.all', { n: shown.length })}</Chip>
          {picked.size > 0 && <Chip on={false} onClick={() => setPicked(new Set())}>{t('ls.clear')}</Chip>}
        </div>
        {shown.map(p => {
          const ls = linkStatus?.[p.referrerId];
          return (
            <label key={p.referrerId} style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'white', border: `1.5px solid ${picked.has(p.referrerId) ? C.primary : C.line}`, borderRadius: 14, padding: '10px 12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={picked.has(p.referrerId)} onChange={() => toggle(p.referrerId)} style={{ width: 22, height: 22 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 14, color: C.muted }}>
                  {[p.contact || t('ls.noMobile'), p.email || t('ls.noEmail'), ls?.lastSentAt ? t('ls.lastSent', { date: new Date(ls.lastSentAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }) : t('ps.linkNever')].join(' · ')}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </Sheet>
  );
}
