import React from 'react';
import DoctorLinkSendSheet from './DoctorLinkSendSheet';
import { sortArrow } from './sortArrow';

/**
 * DoctorLinksView — the "Doctor Links" tab: slim toolbar + tabular (desktop)
 * or card (mobile) per-doctor send/copy list, with multi-select bulk send
 * and a bulk-send progress/result overlay.
 * Extracted from ReferralsPage.jsx's inline `renderLinksView()`.
 */
export default function DoctorLinksView({
  isMobile,
  doctorList,
  referralLinksSearch,
  linksSort,
  toggleLinksSort,
  selectedLinks,
  setSelectedLinks,
  toggleLinkSel,
  linksBusy,
  bulkSend,
  setBulkSend,
  sendSelectedLinks,
  whatsappDoctors,
  emailDoctors,
  openLinkSend,
  copyDoctorLink,
  linkSend,
  setLinkSend,
  submitLinkSend,
}) {
  const q = referralLinksSearch.trim().toLowerCase();
  const baseList = q ? doctorList.filter(d => (d.name || '').toLowerCase().includes(q)) : doctorList;
  const list = [...baseList].sort((a, b) => {
    const r = String(a[linksSort.key] || '').toLowerCase().localeCompare(String(b[linksSort.key] || '').toLowerCase());
    return linksSort.dir === 'asc' ? r : -r;
  });
  const selIds = list.map(d => d.referrerId);
  const allSelected = selIds.length > 0 && selIds.every(id => selectedLinks.has(id));
  const someSelected = selectedLinks.size > 0;
  const toggleAllLinks = () => setSelectedLinks(allSelected ? new Set() : new Set(selIds));
  const checkboxStyle = { width: '17px', height: '17px', cursor: 'pointer', accentColor: '#0f52ba', flexShrink: 0 };
  const bulkBtn = (color, on) => ({ padding: '9px 14px', borderRadius: '11px', border: 'none', background: on ? color : '#e2e8f0', color: on ? 'white' : '#94a3b8', fontSize: '11.5px', fontWeight: 900, cursor: on ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' });
  const chIcon = (color, on) => ({ width: '22px', height: '22px', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', background: on ? `${color}14` : '#f1f5f9', opacity: on ? 1 : 0.5, flexShrink: 0 });
  const actBtn = (fg, bg, bd, busy) => ({ flex: 1, padding: '9px', borderRadius: '10px', border: `1px solid ${bd}`, background: busy ? '#f1f5f9' : bg, color: busy ? '#cbd5e1' : fg, fontSize: '11.5px', fontWeight: 900, cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' });
  const actGhost = (fg) => ({ flex: 1, padding: '9px', borderRadius: '10px', border: `1px dashed ${fg}55`, background: 'white', color: fg, fontSize: '11px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' });
  const iconBtn = { width: '40px', flexShrink: 0, padding: '9px 0', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#475569', fontSize: '15px', fontWeight: 900, cursor: 'pointer' };
  const tSend = (fg, bg, bd, busy) => ({ padding: '7px 11px', borderRadius: '9px', border: `1px solid ${bd}`, background: busy ? '#f1f5f9' : bg, color: busy ? '#cbd5e1' : fg, fontSize: '11px', fontWeight: 900, cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' });
  const tGhost = (fg) => ({ padding: '7px 11px', borderRadius: '9px', border: `1px dashed ${fg}55`, background: 'white', color: fg, fontSize: '11px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' });
  const thStyle = { padding: '14px 20px', textAlign: 'left', fontSize: '10px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: '14px' }}>
        <div>
          <div style={{ fontSize: '17px', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.3px' }}>Doctor portal links</div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginTop: '3px' }}>Send each doctor their private dashboard in one tap — WhatsApp, email, or a copied link.</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {someSelected ? (
            <>
              <span style={{ fontSize: '11.5px', fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap' }}>{selectedLinks.size} selected</span>
              <button onClick={() => sendSelectedLinks('whatsapp')} disabled={linksBusy} style={bulkBtn('#16a34a', !linksBusy)}>💬 Send WhatsApp</button>
              <button onClick={() => sendSelectedLinks('email')} disabled={linksBusy} style={bulkBtn('#0f52ba', !linksBusy)}>📧 Send Email</button>
              <button onClick={() => setSelectedLinks(new Set())} disabled={linksBusy} style={{ padding: '9px 14px', borderRadius: '11px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '11.5px', fontWeight: 900, cursor: linksBusy ? 'not-allowed' : 'pointer' }}>Clear</button>
            </>
          ) : (
            <button onClick={toggleAllLinks} disabled={list.length === 0} style={bulkBtn('#0f52ba', list.length > 0)}>☑ Select all ({list.length})</button>
          )}
        </div>
      </div>

      {bulkSend && (
        <div onClick={bulkSend.status === 'done' ? () => setBulkSend(null) : undefined}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '380px', background: 'white', borderRadius: '22px', padding: '30px 26px', textAlign: 'center', boxShadow: '0 30px 70px -15px rgba(0,0,0,0.45)' }}>
            {bulkSend.status === 'sending' ? (
              <>
                <div className="pulse-loader" style={{ margin: '4px auto 18px' }}></div>
                <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>Sending {bulkSend.channel === 'email' ? 'emails' : 'WhatsApp messages'}…</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginTop: '6px' }}>Delivering portal links — please hold on.</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '44px', lineHeight: 1 }}>{bulkSend.sent > 0 ? '🎉' : '📭'}</div>
                <div style={{ fontSize: '18px', fontWeight: 950, color: '#0f172a', marginTop: '10px' }}>{bulkSend.sent > 0 ? 'Links sent!' : 'Nothing sent'}</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginTop: '6px', lineHeight: 1.5 }}>
                  {bulkSend.sent > 0
                    ? `${bulkSend.sent} ${bulkSend.channel === 'email' ? 'email' : 'WhatsApp message'}${bulkSend.sent === 1 ? '' : 's'} delivered.`
                    : 'No selected doctor had a usable contact.'}
                  {bulkSend.skipped > 0 ? ` · ${bulkSend.skipped} skipped (no ${bulkSend.channel === 'email' ? 'email' : 'mobile'}).` : ''}
                  {bulkSend.failed > 0 ? ` · ${bulkSend.failed} failed.` : ''}
                </div>
                <button onClick={() => setBulkSend(null)} style={{ marginTop: '18px', width: '100%', padding: '13px', borderRadius: '13px', border: 'none', background: 'linear-gradient(135deg,#0f52ba,#1d4ed8)', color: 'white', fontSize: '13px', fontWeight: 950, cursor: 'pointer' }}>Done</button>
              </>
            )}
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #eef2f7', padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', fontWeight: 700 }}>{doctorList.length === 0 ? 'No doctor partners yet.' : 'No doctors match your search.'}</div>
      ) : !isMobile ? (
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #eef2f7', overflow: 'hidden', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <tr>
                <th style={{ ...thStyle, width: '44px', textAlign: 'center' }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAllLinks} title="Select all" style={checkboxStyle} />
                </th>
                <th onClick={() => toggleLinksSort('name')} style={{ ...thStyle, color: linksSort.key === 'name' ? '#0f52ba' : '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>Doctor{sortArrow(linksSort, 'name')}</th>
                <th onClick={() => toggleLinksSort('contact')} style={{ ...thStyle, color: linksSort.key === 'contact' ? '#0f52ba' : '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>Mobile{sortArrow(linksSort, 'contact')}</th>
                <th onClick={() => toggleLinksSort('email')} style={{ ...thStyle, color: linksSort.key === 'email' ? '#0f52ba' : '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>Email{sortArrow(linksSort, 'email')}</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Send link</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.referrerId} style={{ borderBottom: '1px solid #f1f5f9', background: selectedLinks.has(d.referrerId) ? '#f0f7ff' : 'transparent' }}
                    onMouseOver={e => { if (!selectedLinks.has(d.referrerId)) e.currentTarget.style.background = '#fafcff'; }}
                    onMouseOut={e => { e.currentTarget.style.background = selectedLinks.has(d.referrerId) ? '#f0f7ff' : 'transparent'; }}>
                  <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                    <input type="checkbox" checked={selectedLinks.has(d.referrerId)} onChange={() => toggleLinkSel(d.referrerId)} style={checkboxStyle} />
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 900, color: '#0f172a' }}>{d.name}</div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', marginTop: '2px' }}>{[d.specialty, d.degree].filter(Boolean).join(' · ') || 'Referring doctor'}</div>
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    {d.contact
                      ? <span style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>{d.contact}</span>
                      : <span style={{ fontSize: '11px', fontWeight: 800, color: '#e11d48' }}>Not available</span>}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    {d.email
                      ? <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>{d.email}</span>
                      : <span style={{ fontSize: '11px', fontWeight: 800, color: '#e11d48' }}>Not available</span>}
                  </td>
                  <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '7px' }}>
                      {d.contact
                        ? <button onClick={() => whatsappDoctors([d.referrerId])} disabled={linksBusy} style={tSend('#16a34a', '#ecfdf5', '#bbf7d0', linksBusy)}>💬 WhatsApp</button>
                        : <button onClick={() => openLinkSend(d, 'whatsapp')} style={tGhost('#16a34a')}>+ Add mobile</button>}
                      {d.email
                        ? <button onClick={() => emailDoctors([d.referrerId])} disabled={linksBusy} style={tSend('#0f52ba', '#eff6ff', '#bfdbfe', linksBusy)}>📧 Email</button>
                        : <button onClick={() => openLinkSend(d, 'email')} style={tGhost('#0f52ba')}>+ Add email</button>}
                      <button onClick={() => copyDoctorLink(d.referrerId)} title="Copy link to send personally" style={{ ...iconBtn, width: '36px', padding: '7px 0', fontSize: '13px' }}>🔗</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
          {list.map(d => {
            const initial = (d.name || '?').trim().charAt(0).toUpperCase();
            const subtitle = [d.specialty, d.degree].filter(Boolean).join(' · ') || 'Referring doctor';
            return (
              <div key={d.referrerId} style={{ background: selectedLinks.has(d.referrerId) ? '#f0f7ff' : 'white', borderRadius: '16px', border: selectedLinks.has(d.referrerId) ? '1px solid #bfdbfe' : '1px solid #eef2f7', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: '0 2px 12px rgba(15,23,42,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <input type="checkbox" checked={selectedLinks.has(d.referrerId)} onChange={() => toggleLinkSel(d.referrerId)} style={checkboxStyle} />
                  <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', color: '#0f52ba', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 950, flexShrink: 0 }}>{initial}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span style={chIcon('#16a34a', !!d.contact)}>💬</span>
                    {d.contact
                      ? <span style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>{d.contact}</span>
                      : <span style={{ fontSize: '11px', fontWeight: 800, color: '#e11d48' }}>Mobile not available</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span style={chIcon('#0f52ba', !!d.email)}>📧</span>
                    {d.email
                      ? <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.email}</span>
                      : <span style={{ fontSize: '11px', fontWeight: 800, color: '#e11d48' }}>Email not available</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {d.contact
                    ? <button onClick={() => whatsappDoctors([d.referrerId])} disabled={linksBusy} style={actBtn('#16a34a', '#ecfdf5', '#bbf7d0', linksBusy)}>💬 WhatsApp</button>
                    : <button onClick={() => openLinkSend(d, 'whatsapp')} style={actGhost('#16a34a')}>+ Add mobile</button>}
                  {d.email
                    ? <button onClick={() => emailDoctors([d.referrerId])} disabled={linksBusy} style={actBtn('#0f52ba', '#eff6ff', '#bfdbfe', linksBusy)}>📧 Email</button>
                    : <button onClick={() => openLinkSend(d, 'email')} style={actGhost('#0f52ba')}>+ Add email</button>}
                  <button onClick={() => copyDoctorLink(d.referrerId)} title="Copy link to send personally" style={iconBtn}>🔗</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {linkSend && (
        <DoctorLinkSendSheet
          linkSend={linkSend}
          setLinkSend={setLinkSend}
          submitLinkSend={submitLinkSend}
          copyDoctorLink={copyDoctorLink}
        />
      )}
    </div>
  );
}
