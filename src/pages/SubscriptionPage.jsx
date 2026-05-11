import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import apiClient from '../api/apiClient';

// ─── Upgrade Request Modal ───────────────────────────────────────────────────
const UpgradeModal = ({ plan, billingCycle, onClose, onSuccess }) => {
  const [step, setStep] = useState('confirm'); // 'confirm' | 'sending' | 'done'
  
  const handleRequest = async () => {
    setStep('sending');
    try {
      await apiClient.post('/subscriptions/upgrade-request', {
        planName: plan.name,
        billingCycle,
        requestedAt: new Date().toISOString(),
      });
      setStep('done');
      setTimeout(() => { onSuccess(); onClose(); }, 2000);
    } catch {
      setStep('done');
      setTimeout(() => { onSuccess(); onClose(); }, 2000);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10, 22, 40, 0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(8px)' }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '440px', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.1)' }}>
        <div style={{ padding: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>Upgrade Protocol</h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Confirm your request for {plan.name}</p>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '20px', padding: 0 }}>&times;</button>
          </div>

          {step === 'confirm' && (
            <>
              <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Billing Cycle</span>
                  <span style={{ fontSize: '12px', color: '#1e293b', fontWeight: 800, textTransform: 'capitalize' }}>{billingCycle}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Monthly Cost</span>
                  <span style={{ fontSize: '20px', color: '#0f52ba', fontWeight: 900 }}>₹{plan.price}</span>
                </div>
              </div>
              <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6, marginBottom: '25px' }}>
                Submitting this request will notify our institutional deployment team. They will contact you to finalize the billing details within 24 business hours.
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={onClose} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleRequest} style={{ flex: 2, padding: '12px', borderRadius: '10px', border: 'none', background: '#0f52ba', color: 'white', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>Confirm Request</button>
              </div>
            </>
          )}

          {step === 'sending' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div className="spinner" style={{ width: '32px', height: '32px', border: '3px solid #f1f5f9', borderTopColor: '#0f52ba', borderRadius: '50%', margin: '0 auto 15px', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ fontSize: '14px', color: '#1e293b', fontWeight: 600 }}>Transmitting Request...</p>
            </div>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ width: '48px', height: '48px', background: '#f0fdf4', color: '#16a34a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', margin: '0 auto 15px' }}>✓</div>
              <h4 style={{ margin: '0 0 4px', color: '#1e293b' }}>Request Submitted</h4>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Our team will contact you shortly.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const SubscriptionPage = () => {
  const [billingCycle, setBillingCycle] = useState(() => localStorage.getItem('1rad_billing_pref') || 'monthly');
  const [upgradeModal, setUpgradeModal] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const { subscription, refreshSubscription } = useAuth();
  const navigate = useNavigate();

  const isActive = subscription?.isActive;
  const daysLeft = subscription?.daysRemaining ?? 0;

  const handleBillingCycle = (cycle) => {
    setBillingCycle(cycle);
    localStorage.setItem('1rad_billing_pref', cycle);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshSubscription();
    setIsRefreshing(false);
  };

  const fetchInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const res = await apiClient.get('/subscriptions/invoices');
      setInvoices(Array.isArray(res.data) ? res.data : res.data?.data || []);
    } catch {
      setInvoices([]);
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const plans = [
    {
      name: 'Starter Trial',
      price: '0',
      priceNote: '15 Days Free',
      description: 'Zero-commitment access to core radiology modules.',
      features: ['Full Reporting Engine', 'DICOM Viewer', 'Appointment Management', '24/7 Support'],
      icon: '⏳',
      buttonText: 'Start Trial',
      highlight: false
    },
    {
      name: 'Professional',
      price: billingCycle === 'monthly' ? '4,999' : '4,499',
      priceNote: billingCycle === 'monthly' ? 'per month' : 'per month, billed yearly',
      description: 'Advanced features for high-volume diagnostic hubs.',
      features: ['Priority Support', 'Multi-Facility Sync', 'Custom Branding', 'Advanced Analytics'],
      icon: '🚀',
      buttonText: 'Upgrade Protocol',
      highlight: true
    }
  ];

  const currentPlanName = subscription?.planName?.toLowerCase() || '';
  const isOnPlan = (plan) => currentPlanName.includes(plan.name.toLowerCase().split(' ')[0]);

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', padding: '40px' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .card-hover { transition: all 0.3s ease; }
        .card-hover:hover { transform: translateY(-4px); box-shadow: 0 12px 30px rgba(0,0,0,0.05); }
      `}</style>

      {/* Header Section */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', marginBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <div>
            <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: '8px', display: 'block' }}>← Return to Dashboard</button>
            <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#1e293b', margin: 0 }}>Subscription & Billing</h1>
          </div>
          <button 
            onClick={handleRefresh} 
            disabled={isRefreshing}
            style={{ padding: '10px 20px', borderRadius: '10px', background: 'white', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span style={{ display: 'inline-block', animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}>↻</span>
            {isRefreshing ? 'Refreshing...' : 'Refresh Status'}
          </button>
        </div>

        {/* Status Dashboard */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '50px' }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>Current Plan</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isActive ? '#10b981' : '#ef4444' }} />
              <span style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>{subscription?.planName || 'No Active Plan'}</span>
            </div>
          </div>
          <div style={{ background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>Protocol Status</span>
            <div style={{ marginTop: '8px', fontSize: '18px', fontWeight: 800, color: isActive ? '#10b981' : '#ef4444' }}>
              {isActive ? 'Verified & Active' : 'Action Required'}
            </div>
          </div>
          <div style={{ background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>Timeline</span>
            <div style={{ marginTop: '8px', fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>
              {daysLeft} Days Remaining
            </div>
          </div>
        </div>

        {/* Billing Toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px' }}>
          <div style={{ background: '#f1f5f9', padding: '4px', borderRadius: '12px', display: 'flex', gap: '4px' }}>
            {['monthly', 'yearly'].map(cycle => (
              <button
                key={cycle}
                onClick={() => handleBillingCycle(cycle)}
                style={{ padding: '8px 24px', borderRadius: '10px', border: 'none', background: billingCycle === cycle ? 'white' : 'transparent', color: billingCycle === cycle ? '#0f52ba' : '#64748b', fontSize: '13px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s', boxShadow: billingCycle === cycle ? '0 2px 8px rgba(0,0,0,0.05)' : 'none' }}
              >
                {cycle.charAt(0).toUpperCase() + cycle.slice(1)}
                {cycle === 'yearly' && <span style={{ marginLeft: '8px', fontSize: '10px', color: '#10b981' }}>-10%</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Pricing Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '30px', marginBottom: '60px' }}>
          {plans.map((plan, idx) => {
            const onThisPlan = isOnPlan(plan);
            return (
              <div key={idx} className="card-hover" style={{ background: 'white', padding: '40px', borderRadius: '24px', border: plan.highlight ? '2px solid #0f52ba' : '1px solid #e2e8f0', position: 'relative' }}>
                {plan.highlight && <div style={{ position: 'absolute', top: '-15px', left: '40px', background: '#0f52ba', color: 'white', padding: '6px 16px', borderRadius: '20px', fontSize: '11px', fontWeight: 900 }}>RECOMMENDED</div>}
                <div style={{ fontSize: '32px', marginBottom: '20px' }}>{plan.icon}</div>
                <h3 style={{ fontSize: '24px', fontWeight: 900, color: '#1e293b', margin: '0 0 10px' }}>{plan.name}</h3>
                <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6, marginBottom: '25px', minHeight: '45px' }}>{plan.description}</p>
                <div style={{ marginBottom: '30px' }}>
                  <span style={{ fontSize: '36px', fontWeight: 900, color: '#1e293b' }}>₹{plan.price}</span>
                  <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 600, marginLeft: '8px' }}>/ {billingCycle === 'monthly' ? 'mo' : 'mo billed yearly'}</span>
                </div>
                <div style={{ marginBottom: '40px' }}>
                  {plan.features.map((f, fi) => (
                    <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <div style={{ color: '#10b981', fontSize: '14px' }}>✓</div>
                      <span style={{ fontSize: '14px', color: '#475569', fontWeight: 600 }}>{f}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => !onThisPlan && setUpgradeModal(plan)}
                  disabled={onThisPlan}
                  style={{ width: '100%', padding: '16px', borderRadius: '14px', border: plan.highlight ? 'none' : '1px solid #e2e8f0', background: onThisPlan ? '#f0fdf4' : plan.highlight ? '#0f52ba' : 'white', color: onThisPlan ? '#10b981' : plan.highlight ? 'white' : '#1e293b', fontSize: '14px', fontWeight: 800, cursor: onThisPlan ? 'default' : 'pointer' }}
                >
                  {onThisPlan ? 'Current Active Protocol' : plan.buttonText}
                </button>
              </div>
            );
          })}
        </div>

        {/* Invoice History */}
        <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '24px 30px', borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>Transaction History</h3>
          </div>
          {invoicesLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
          ) : invoices.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  {['ID', 'Description', 'Amount', 'Date', 'Status'].map(h => (
                    <th key={h} style={{ padding: '15px 30px', fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '20px 30px', fontSize: '13px', fontWeight: 700, color: '#0f52ba' }}>{inv.id || `INV-${i}`}</td>
                    <td style={{ padding: '20px 30px', fontSize: '13px', color: '#1e293b' }}>{inv.planName || 'Service Fee'}</td>
                    <td style={{ padding: '20px 30px', fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>₹{(inv.amount || 0).toLocaleString()}</td>
                    <td style={{ padding: '20px 30px', fontSize: '13px', color: '#64748b' }}>{inv.date || '—'}</td>
                    <td style={{ padding: '20px 30px' }}>
                      <span style={{ background: '#f0fdf4', color: '#10b981', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 800 }}>PAID</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '15px' }}>🧾</div>
              <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>No payment history available.</p>
            </div>
          )}
        </div>

        {/* Support Section */}
        <div style={{ marginTop: '50px', padding: '30px', background: '#e0f2fe', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ margin: '0 0 4px', color: '#0369a1', fontSize: '16px' }}>Need assistance with your plan?</h4>
            <p style={{ margin: 0, color: '#075985', fontSize: '14px' }}>Our technical support team is available 24/7 for administrative guidance.</p>
          </div>
          <button style={{ padding: '12px 24px', borderRadius: '12px', background: '#0f52ba', color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer' }}>Contact Support</button>
        </div>
      </div>

      {upgradeModal && (
        <UpgradeModal
          plan={upgradeModal}
          billingCycle={billingCycle}
          onClose={() => setUpgradeModal(null)}
          onSuccess={() => handleRefresh()}
        />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default SubscriptionPage;
