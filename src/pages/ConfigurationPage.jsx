import React from 'react';
import ReportingRegistry from '../components/ReportingRegistry';
import apiClient from '../api/apiClient';
import useAuth from '../auth/useAuth';

export default function ConfigurationPage() {
  const { activeCenter, currentUser } = useAuth();

  return (
    <div style={{ padding: '25px', height: 'calc(100vh - 64px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '20px', flexShrink: 0 }}>
        <h1 style={{ fontSize: '24px', fontWeight: 950, color: '#1e293b', margin: 0 }}>CLINICAL_REGISTRY</h1>
        <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
          Manage global report templates and diagnostic shorthand macros for {activeCenter?.name || 'the current facility'}.
        </p>
      </div>
      
      <div style={{ flex: 1, background: 'white', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <ReportingRegistry 
          apiClient={apiClient}
          hospitalId={activeCenter?.id}
          doctorId={currentUser?.id}
          onRefresh={() => console.log('Registry refreshed')}
        />
      </div>
    </div>
  );
}
