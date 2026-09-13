import React from 'react';

/**
 * DoctorLinkSendSheet — the single-doctor "send portal link" bottom sheet
 * (email/WhatsApp channel choice, captures a missing contact on the fly).
 * Extracted from ReferralsPage.jsx's inline `renderLinkSendSheet()`.
 *
 * @param {{doctor: object, channel: 'email'|'whatsapp', email?: string, contact?: string, err?: string, saving?: boolean}} linkSend
 * @param {function} setLinkSend
 * @param {() => void} submitLinkSend
 * @param {(referrerId: string) => void} copyDoctorLink
 */
export default function DoctorLinkSendSheet({ linkSend, setLinkSend, submitLinkSend, copyDoctorLink }) {
  const d = linkSend.doctor;
  const ch = linkSend.channel;
  return (
    <div onClick={() => !linkSend.saving && setLinkSend(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000, padding: '20px' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '440px', background: 'white', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 30px 70px -15px rgba(0,0,0,0.4)' }}>
        <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg,#0a1628,#0f52ba)', color: 'white' }}>
          <div style={{ fontSize: '10px', fontWeight: 950, letterSpacing: '1.5px', opacity: 0.75 }}>SEND PORTAL LINK</div>
          <div style={{ fontSize: '18px', fontWeight: 950, marginTop: '4px' }}>{d.name}</div>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 900, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>How would you like to send it?</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[['email', '📧 Email'], ['whatsapp', '💬 WhatsApp']].map(([key, label]) => (
                <button key={key} onClick={() => setLinkSend(s => ({ ...s, channel: key, err: '' }))}
                  style={{ flex: 1, padding: '12px', borderRadius: '12px', border: ch === key ? '2px solid #0f52ba' : '1px solid #e2e8f0', background: ch === key ? '#eff6ff' : 'white', color: ch === key ? '#0f52ba' : '#64748b', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}>{label}</button>
              ))}
            </div>
          </div>
          {ch === 'email' ? (
            <div>
              <label style={{ fontSize: '10px', fontWeight: 900, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Email address</label>
              <input type="email" value={linkSend.email} onChange={e => setLinkSend(s => ({ ...s, email: e.target.value, err: '' }))} placeholder="name@example.com"
                style={{ width: '100%', boxSizing: 'border-box', marginTop: '5px', padding: '11px 13px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, outline: 'none' }} />
              {!d.email && <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', marginTop: '5px' }}>No email on file — we&apos;ll save this to their profile.</div>}
            </div>
          ) : (
            <div>
              <label style={{ fontSize: '10px', fontWeight: 900, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Mobile number</label>
              <input type="tel" value={linkSend.contact} onChange={e => setLinkSend(s => ({ ...s, contact: e.target.value, err: '' }))} placeholder="10-digit mobile"
                style={{ width: '100%', boxSizing: 'border-box', marginTop: '5px', padding: '11px 13px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, outline: 'none' }} />
              {!d.contact && <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', marginTop: '5px' }}>No mobile on file — we&apos;ll save this to their profile.</div>}
            </div>
          )}
          {linkSend.err && <div style={{ fontSize: '11px', fontWeight: 800, color: '#b91c1c' }}>{linkSend.err}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={submitLinkSend} disabled={linkSend.saving}
              style={{ flex: 1, padding: '12px', borderRadius: '11px', border: 'none', background: linkSend.saving ? '#cbd5e1' : 'linear-gradient(135deg,#0f52ba,#1d4ed8)', color: 'white', fontSize: '12px', fontWeight: 950, cursor: linkSend.saving ? 'not-allowed' : 'pointer' }}>
              {linkSend.saving ? 'Sending…' : (ch === 'email' ? 'Save & email' : 'Save & send on WhatsApp')}
            </button>
            <button onClick={() => setLinkSend(null)} disabled={linkSend.saving} style={{ padding: '12px 16px', borderRadius: '11px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
          </div>
          <button onClick={() => copyDoctorLink(d.referrerId)} style={{ padding: '9px', borderRadius: '10px', border: '1px dashed #cbd5e1', background: 'white', color: '#475569', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>Or just copy the link</button>
        </div>
      </div>
    </div>
  );
}
