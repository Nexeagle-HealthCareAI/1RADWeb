import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { t } from '../../i18n';
import { Button, Icon, Sheet } from '../../components/saral/Saral';
import { C } from '../../components/saral/tokens';

/**
 * The patient's token after arrival (and any time from "Show token"): the big
 * token number, a QR code of the signed tracking link the patient can scan, the
 * tests, and one-tap Print token / Send on WhatsApp — like the arrival pop-up
 * and queue pass on the full appointment list.
 */
export default function TokenSheet({ visit, token, link, tests, onClose, onPrint, onWhatsApp }) {
  return (
    <Sheet open onClose={onClose} title={t('tk.title')}
      footer={<Button kind="quiet" size="lg" full onClick={onClose}>{t('tk.done')}</Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: C.ok, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="check" size={22} stroke={2.8} />{t('tk.arrived', { name: visit.patientName || '' })}
        </div>
        <div style={{ width: '100%', background: 'white', border: `2px solid ${C.primary}`, borderRadius: 22, padding: '14px 12px' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.muted }}>{t('tk.number')}</div>
          {token
            ? <div aria-live="polite" style={{ fontSize: 72, fontWeight: 800, color: C.primary, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{token}</div>
            : <div style={{ fontSize: 17, color: C.muted, padding: '18px 0' }}>{t('tk.none')}</div>}
          {tests && <div style={{ fontSize: 16, color: C.ink, marginTop: 4 }}>{tests}</div>}
        </div>
        {link && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ background: 'white', padding: 10, borderRadius: 14, border: `1px solid ${C.line}` }}>
              <QRCodeCanvas value={link} size={150} level="M" />
            </div>
            <div style={{ fontSize: 14, color: C.muted, maxWidth: 260 }}>{t('tk.qr')}</div>
          </div>
        )}
        <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
          <Button kind="primary" size="lg" icon="print" onClick={onPrint}>{t('tk.print')}</Button>
          <Button kind="ok" size="lg" icon="whatsapp" onClick={onWhatsApp}>{t('tk.whatsapp')}</Button>
        </div>
      </div>
    </Sheet>
  );
}
