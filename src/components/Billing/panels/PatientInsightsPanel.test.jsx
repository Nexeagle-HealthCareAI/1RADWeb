// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import PatientInsightsPanel from './PatientInsightsPanel';

describe('PatientInsightsPanel', () => {
  it('renders an explanatory empty state when patientLtv is unavailable (offline)', () => {
    render(<PatientInsightsPanel patientLtv={null} />);
    expect(screen.getByText(/NEED A LIVE CONNECTION/i)).toBeInTheDocument();
  });

  it('renders headline stats, segments, churn alerts, and the retention heatmap when data is present', () => {
    const patientLtv = {
      averageOrderValue: 2500,
      purchaseFrequency: 1.8,
      estimatedLifetimeValue: 13500,
      segments: [
        { tier: 'High Value', patientCount: 4, totalRevenue: 80000, percentage: 20 },
        { tier: 'Mid Value', patientCount: 10, totalRevenue: 50000, percentage: 50 },
        { tier: 'Low Value', patientCount: 6, totalRevenue: 20000, percentage: 30 },
      ],
      retentionHeatmap: [
        { cohortMonth: '2026-03', size: 12, retentionRates: [100, 40, 30, 20, 15, 10] },
      ],
      churnAlerts: [
        { patientName: 'Jane Doe', lastModality: 'MRI', lastScanDate: '2026-06-01', daysSinceLastScan: 95, riskLevel: 'CRITICAL' },
      ],
    };

    render(<PatientInsightsPanel patientLtv={patientLtv} />);

    expect(screen.getByText('₹2,500')).toBeInTheDocument();
    expect(screen.getByText('₹13,500')).toBeInTheDocument();
    expect(screen.getByText('High Value')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByText('2026-03')).toBeInTheDocument();
  });

  it('renders segment/churn empty states without crashing when arrays are empty', () => {
    const patientLtv = { averageOrderValue: 0, purchaseFrequency: 0, estimatedLifetimeValue: 0, segments: [], retentionHeatmap: [], churnAlerts: [] };
    render(<PatientInsightsPanel patientLtv={patientLtv} />);
    expect(screen.getByText('No patients in the active scope.')).toBeInTheDocument();
    expect(screen.getByText('No patients currently at churn risk.')).toBeInTheDocument();
  });
});
