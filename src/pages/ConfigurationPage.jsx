import React, { useState } from 'react';
import ReportingRegistry from '../components/ReportingRegistry';
import ThermalPrinterSettings from '../components/Billing/ThermalPrinterSettings';
import apiClient from '../api/apiClient';
import useAuth from '../auth/useAuth';

// Central configuration hub. Tabs keep distinct setting groups in one place:
//   • Report Templates — report scaffolds + shorthand macros (ReportingRegistry)
//   • Printing & Devices — the thermal receipt/token printer for this machine
const TABS = [
  { id: 'templates', label: 'Report Templates' },
  { id: 'printing',  label: 'Printing & Devices' },
];

export default function ConfigurationPage() {
  const { activeCenter, currentUser } = useAuth();
  const [tab, setTab] = useState('templates');

  return (
    <div style={{ padding: '25px', height: 'calc(100vh - 64px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '16px', flexShrink: 0 }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0a1628', margin: 0 }}>Configuration</h1>
        <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
          Report templates, macros and device settings for {activeCenter?.name || 'the current facility'}.
        </p>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', padding: '5px', background: '#f1f5f9', borderRadius: '12px', width: 'fit-content', flexShrink: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 20px', borderRadius: '8px', border: 'none',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              background: tab === t.id ? 'white' : 'transparent',
              color: tab === t.id ? '#1d4ed8' : '#6b7280',
              boxShadow: tab === t.id ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.2s',
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Report templates — keeps its full-height card */}
      {tab === 'templates' && (
        <div style={{ flex: 1, background: 'white', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <ReportingRegistry
            apiClient={apiClient}
            hospitalId={activeCenter?.id}
            doctorId={currentUser?.id}
            onRefresh={() => console.log('Registry refreshed')}
          />
        </div>
      )}

      {/* Printing & devices — scrollable settings column */}
      {tab === 'printing' && (
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
          <div style={{ maxWidth: '520px' }}>
            <ThermalPrinterSettings />
          </div>
        </div>
      )}
    </div>
  );
}
