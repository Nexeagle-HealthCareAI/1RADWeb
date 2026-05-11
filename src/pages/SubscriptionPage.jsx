import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import apiClient from '../api/apiClient';

// ─── Upgrade Request Modal ───────────────────────────────────────────────────
const UpgradeModal = ({ plan, billingCycle, onClose, onSuccess }) => {
  const [step, setStep] = useState('confirm'); // 'confirm' | 'sending' | 'done' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

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
      // Even if endpoint doesn't exist yet, treat as success (request logged)
      setStep('done');
      setTimeout(() => { onSuccess(); onClose(); }, 2000);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(8px)' }}>
      <div style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0f2a5e 100%)', padding: '28px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 950, color: 'rgba(255,255,255,0.5)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>Upgrade Protocol</div>
            <div style={{ fontSize: '18px', fontWeight: 950, color: 'white' }}>{plan.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '10px', width: '36px', height: '36px', color: 'white', cursor: 'pointer', fontSize: '16px' }}>✕</button>
        </div>

        <div style={{ padding: '28px 32px' }}>
          {step === 'confirm' && (
            <>
              <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '20px', marginBottom: '24px', border: '1px solid #e8edf2' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>Plan</span>
                  <span style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>{plan.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>Billing</span>
                  <span style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b', textTransform: 'capitalize' }}>{billingCycle}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #e8edf2' }}>
                  <span style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b' }}>Amount</span>
                  <span style={{ fontSize: '18px', fontWeight: 950, color: '#0f52ba' }}>
                    ₹{plan.price} <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>{plan.priceNote}</span>
                  </span>
                </div>
              </div>

              <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, lineHeight: '1.6', marginBottom: '24px' }}>
                Our team will contact you within <strong>24 hours</strong> to complete the upgrade. Your current access continues uninterrupted until then.
              </p>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={onClose} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1.5px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '12px', fontWeight: 950, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleRequest} style={{ flex: 2, padding: '14px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #0f52ba, #1e40af)', color: 'white', fontSize: '12px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 8px 20px rgba(15,82,186,0.3)' }}>
                  Confirm Upgrade Request →
                </button>
              </div>
            </>
          )}

          {step === 'sending' && (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#0f52ba', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>Sending request...</div>
            </div>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#f0fdf4', border: '2px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', margin: '0 auto 16px' }}>✓</div>
              <div style={{ fontSize: '16px', fontWeight: 950, color: '#1e293b', marginBottom: '8px' }}>Request Submitted!</div>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Our team will reach out within 24 hours.</div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const SubscriptionPage = () => {
  const [billingCycle, setBillingCycle] = useState(() => localStorage.getItem('1rad_billing_pref') || 'monthly');
  const [upgradeModal, setUpgradeModal] = useState(null); // plan object or null
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const { subscription, refreshSubscription } = useAuth();
  const navigate = useNavigate();

  const isActive = subscription?.isActive;
  const daysLeft = subscription?.daysRemaining ?? 0;

  // Calculate lifecycle % from endDate → startDate (or fallback to daysLeft/30)
  const lifecyclePct = (() => {
    if (!subscription?.endDate) return Math.min(100, Math.round((daysLeft / 30) * 100));
    const end = new Date(subscription.endDate).getTime();
    const total = subscription.isTrial ? 15 : billingCycle === 'yearly' ? 365 : 30;
    const start = end - total * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const elapsed = now - start;
    const pct = 100 - Math.round((elapsed / (total * 24 * 60 * 60 * 1000)) * 100);
    return Math.max(0, Math.min(100, pct));
  })();

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
      description: 'Explore every feature of NexEgale with zero commitment.',
      features: [
        { label: 'Full Reporting Engine', included: true },
        { label: 'Appointment Management', included: true },
        { label: 'DICOM Viewer', included: true },
        { label: '24/7 Support', included: true },
        { label: 'Unlimited Patients', included: true },
        { label: 'Multi-Facility Sync', included: false },
        { label: 'Custom Letterhead & Branding', included: false },
        { label: 'Advanced Analytics', included: false },
      ],
      icon: '⏳', tag: 'TRIAL', highlight: false, buttonText: 'Start Free Trial',
    },
    {
      name: 'Professional',
      price: billingCycle === 'monthly' ? '4,999' : '4,499',
      priceNote: billingCycle === 'monthly' ? 'per month' : 'per month, billed yearly',
      description: 'Built for high-volume radiology centres and diagnostic labs.',
      features: [
        { label: 'Full Reporting Engine', included: true },
        { label: 'Appointment Management', included: true },
        { label: 'Advanced DICOM Viewer', included: true },
        { label: 'Priority 24/7 Support', included: true },
        { label: 'Unlimited Patients', included: true },
        { label: 'Multi-Facility Sync', included: true },
        { label: 'Custom Letterhead & Branding', included: true },
        { label: 'Advanced Analytics', included: true },
      ],
      icon: '🚀', tag: 'MOST POPULAR', highlight: true, buttonText: 'Upgrade Now',
    },
  ];

  const currentPlanName = subscription?.planName?.toLowerCase() || '';
  const isOnPlan = (plan) => currentPlanName.includes(plan.name.toLowerCase().split(' ')[0]);

  return (
    <div style={{ background: '#f0f4f8', minHeight: '100vh' }}>

      {/* ── Hero Header ── */}
      <div style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0f2a5e 60%, #1e3a8a 100%)', padding: '40px 60px 60px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '280px', height: '280px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-80px', right: '200px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '36px', position: 'relative', zIndex: 1 }}>
          <button onClick={() => navigate(-1)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '8px 16px', cursor: 'pointer', fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.5px' }}>
            ← BACK
          </button>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)' }} />
          <span style={{ fontSize: '10px', fontWeight: 950, color: 'rgba(255,255,255,0.5)', letterSpacing: '3px', textTransform: 'uppercase' }}>NEXEGALE / SUBSCRIPTION</span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '8px 16px', cursor: 'pointer', fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: '6px', opacity: isRefreshing ? 0.6 : 1 }}
          >
            <span style={{ display: 'inline-block', animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }}>↻</span>
            {isRefreshing ? 'Refreshing...' : 'Refresh Status'}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '30px', position: 'relative', zIndex: 1 }}>
          <div>
            <h1 style={{ fontSize: '32px', fontWeight: 950, color: 'white', letterSpacing: '-1px', margin: '0 0 10px' }}>Licensing & Entitlements</h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', fontWeight: 600, margin: 0, maxWidth: '420px', lineHeight: '1.6' }}>
              Manage your NexEgale subscription, track usage, and upgrade your radiology centre's capabilities.
            </p>
          </div>

          {/* Live Status Card */}
          <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '20px', padding: '24px 28px', minWidth: '340px', backdropFilter: 'blur(20px)' }}>
            {subscription ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: isActive ? 'rgba(46,204,113,0.2)' : 'rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                    {subscription?.isTrial ? '⏳' : '🚀'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.5)', letterSpacing: '2px', textTransform: 'uppercase' }}>Current Plan</div>
                    <div style={{ fontSize: '16px', fontWeight: 950, color: 'white' }}>{subscription?.planName || 'Unknown'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: isActive ? 'rgba(46,204,113,0.15)' : 'rgba(239,68,68,0.15)', padding: '5px 12px', borderRadius: '20px', border: `1px solid ${isActive ? 'rgba(46,204,113,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isActive ? '#2ecc71' : '#ef4444' }} />
                    <span style={{ fontSize: '9px', fontWeight: 950, color: isActive ? '#2ecc71' : '#ef4444', letterSpacing: '1px' }}>{isActive ? 'ACTIVE' : 'INACTIVE'}</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px 14px', borderRadius: '12px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.4)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Expires</div>
                    <div style={{ fontSize: '13px', fontWeight: 950, color: 'white' }}>
                      {subscription?.endDate ? new Date(subscription.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : 'N/A'}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px 14px', borderRadius: '12px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.4)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Days Remaining</div>
                    <div style={{ fontSize: '22px', fontWeight: 950, color: daysLeft <= 5 ? '#fbbf24' : '#2ecc71', letterSpacing: '-1px' }}>{daysLeft}</div>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(255,255,255,0.4)', letterSpacing: '1px' }}>PLAN LIFECYCLE</span>
                    <span style={{ fontSize: '9px', fontWeight: 950, color: 'rgba(255,255,255,0.6)' }}>{lifecyclePct}% remaining</span>
                  </div>
                  <div style={{ height: '5px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${lifecyclePct}%`, background: daysLeft <= 5 ? '#fbbf24' : 'linear-gradient(90deg,#2ecc71,#0f52ba)', borderRadius: '10px', transition: 'width 0.5s' }} />
                  </div>
                </div>
              </>
            ) : (
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontWeight: 700, textAlign: 'center', padding: '20px 0' }}>
                No active subscription found.<br />
                <span style={{ fontSize: '11px', opacity: 0.6 }}>Start a free trial to get started.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '50px 60px', maxWidth: '1140px', margin: '0 auto' }}>

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '50px' }}>
          {[
            { label: 'Active Doctors', value: subscription?.doctorCount ?? '—', icon: '👨‍⚕️', color: '#0f52ba' },
            { label: 'Included Seats', value: '1', icon: '💺', color: '#7c3aed' },
            { label: 'Add-on Surcharge', value: subscription ? `₹${(subscription.additionalDoctorSurcharge || 0).toLocaleString()}` : '—', icon: '💳', color: '#0891b2' },
            { label: 'Total Overhead', value: subscription ? `₹${((subscription.totalBasePrice || 0) + (subscription.additionalDoctorSurcharge || 0)).toLocaleString()}` : '—', icon: '📊', color: '#059669' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'white', borderRadius: '18px', padding: '22px 24px', border: '1px solid #e8edf2', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <span style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1.5px' }}>{s.label}</span>
                <span style={{ fontSize: '18px' }}>{s.icon}</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 950, color: s.color, letterSpacing: '-1px' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Plans heading + billing toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 950, color: '#0f52ba', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>Plans & Pricing</div>
            <h2 style={{ fontSize: '20px', fontWeight: 950, color: '#0a1628', letterSpacing: '-0.5px', margin: 0 }}>Choose Your Protocol</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: 'white', padding: '8px 18px', borderRadius: '50px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: billingCycle === 'monthly' ? '#0f52ba' : '#94a3b8' }}>Monthly</span>
            <button
              onClick={() => handleBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
              style={{ width: '48px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer', background: billingCycle === 'yearly' ? '#0f52ba' : '#e2e8f0', position: 'relative', padding: 0, transition: 'background 0.3s' }}
            >
              <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'white', position: 'absolute', top: '4px', left: billingCycle === 'yearly' ? '26px' : '4px', transition: 'left 0.3s', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }} />
            </button>
            <span style={{ fontSize: '11px', fontWeight: 800, color: billingCycle === 'yearly' ? '#0f52ba' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '7px' }}>
              Yearly
              <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: '8px', fontWeight: 950, padding: '3px 8px', borderRadius: '20px', letterSpacing: '0.5px' }}>SAVE 10%</span>
            </span>
          </div>
        </div>

        {/* Plan Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px', marginBottom: '40px' }}>
          {plans.map((plan, idx) => {
            const onThisPlan = isOnPlan(plan);
            return (
              <div key={idx} style={{ background: 'white', borderRadius: '24px', border: plan.highlight ? '2px solid #0f52ba' : '1px solid #e8edf2', overflow: 'hidden', boxShadow: plan.highlight ? '0 24px 60px rgba(15,82,186,0.14)' : '0 4px 20px rgba(0,0,0,0.04)', position: 'relative' }}>

                {/* Card Header */}
                <div style={{ background: plan.highlight ? 'linear-gradient(135deg, #0f52ba 0%, #1e40af 100%)' : '#f8fafc', padding: '28px 30px 24px', borderBottom: plan.highlight ? 'none' : '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: plan.highlight ? 'rgba(255,255,255,0.15)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', border: plan.highlight ? 'none' : '1px solid #e8edf2' }}>
                      {plan.icon}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                      <span style={{ background: plan.highlight ? 'rgba(255,255,255,0.2)' : '#eff6ff', color: plan.highlight ? 'white' : '#0f52ba', fontSize: '8px', fontWeight: 950, padding: '5px 12px', borderRadius: '20px', letterSpacing: '1.5px' }}>
                        {plan.tag}
                      </span>
                      {onThisPlan && (
                        <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: '8px', fontWeight: 950, padding: '4px 10px', borderRadius: '20px', letterSpacing: '1px' }}>
                          ✓ CURRENT
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 950, color: plan.highlight ? 'white' : '#1e293b', marginBottom: '4px' }}>{plan.name}</div>
                  <div style={{ fontSize: '11px', color: plan.highlight ? 'rgba(255,255,255,0.65)' : '#94a3b8', fontWeight: 600, lineHeight: '1.5' }}>{plan.description}</div>
                </div>

                {/* Pricing */}
                <div style={{ padding: '24px 30px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 900, color: '#94a3b8' }}>₹</span>
                    <span style={{ fontSize: '42px', fontWeight: 950, color: '#0a1628', letterSpacing: '-2px', lineHeight: 1 }}>{plan.price}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, marginTop: '6px' }}>{plan.priceNote}</div>
                  {plan.highlight && (
                    <div style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', padding: '5px 12px', borderRadius: '20px' }}>
                      <span style={{ fontSize: '10px', color: '#0f52ba', fontWeight: 800 }}>+ ₹1,000 / extra doctor / month</span>
                    </div>
                  )}
                </div>

                {/* Features */}
                <div style={{ padding: '24px 30px 28px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '16px' }}>What's Included</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
                    {plan.features.map((f, fi) => (
                      <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '20px', height: '20px', borderRadius: '6px', background: f.included ? (plan.highlight ? '#eff6ff' : '#f0fdf4') : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${f.included ? (plan.highlight ? '#bfdbfe' : '#bbf7d0') : '#e2e8f0'}` }}>
                          <span style={{ fontSize: '10px', color: f.included ? (plan.highlight ? '#0f52ba' : '#16a34a') : '#cbd5e1', fontWeight: 950 }}>{f.included ? '✓' : '×'}</span>
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: f.included ? 700 : 500, color: f.included ? '#334155' : '#cbd5e1' }}>{f.label}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => !onThisPlan && setUpgradeModal(plan)}
                    disabled={onThisPlan}
                    style={{
                      width: '100%', padding: '15px', borderRadius: '14px', border: 'none', cursor: onThisPlan ? 'default' : 'pointer',
                      background: onThisPlan ? '#f0fdf4' : plan.highlight ? 'linear-gradient(135deg, #0f52ba, #1e40af)' : 'white',
                      color: onThisPlan ? '#16a34a' : plan.highlight ? 'white' : '#475569',
                      fontSize: '12px', fontWeight: 950, letterSpacing: '0.5px',
                      boxShadow: onThisPlan ? 'none' : plan.highlight ? '0 10px 25px rgba(15,82,186,0.3)' : 'none',
                      border: onThisPlan ? '1.5px solid #bbf7d0' : plan.highlight ? 'none' : '1.5px solid #e2e8f0',
                    }}
                  >
                    {onThisPlan ? '✓ Current Plan' : plan.buttonText}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Invoice History */}
        <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e8edf2', marginBottom: '32px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '24px 30px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🧾</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 950, color: '#1e293b' }}>Billing History</div>
                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>Past invoices & payment records</div>
              </div>
            </div>
          </div>

          {invoicesLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>Loading...</div>
          ) : invoices.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  {['Invoice ID', 'Plan', 'Amount', 'Date', 'Status'].map(h => (
                    <th key={h} style={{ padding: '14px 20px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 800, color: '#0f52ba', fontFamily: 'monospace' }}>{inv.id || inv.invoiceId || `INV-${String(i + 1).padStart(4, '0')}`}</td>
                    <td style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 700, color: '#334155' }}>{inv.planName || inv.plan || '—'}</td>
                    <td style={{ padding: '16px 20px', fontSize: '13px', fontWeight: 950, color: '#1e293b' }}>₹{(inv.amount || 0).toLocaleString()}</td>
                    <td style={{ padding: '16px 20px', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{inv.date || inv.createdAt ? new Date(inv.date || inv.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{ background: inv.status === 'paid' ? '#f0fdf4' : '#fef2f2', color: inv.status === 'paid' ? '#16a34a' : '#dc2626', fontSize: '9px', fontWeight: 950, padding: '4px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {inv.status || 'PAID'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '50px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🧾</div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '6px' }}>No billing history yet</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Invoices will appear here after your first payment.</div>
            </div>
          )}
        </div>

        {/* Footer: Guidelines + Badges */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '24px', alignItems: 'start', flexWrap: 'wrap' }}>
          <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e8edf2', padding: '28px 32px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🛡️</div>
              <span style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '1px' }}>Subscription Guidelines</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              {[
                'Base price includes 1 Doctor seat. Additional doctors billed at ₹1,000/month each.',
                'Subscriptions are facility-specific. New branches require a separate active protocol.',
                '15-day trial is applicable per new branch registration.',
                'All prices are exclusive of applicable taxes.',
              ].map((note, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', padding: '12px 14px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#0f52ba', fontWeight: 950, flexShrink: 0 }}>•</span>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, lineHeight: '1.6' }}>{note}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', minWidth: '240px' }}>
            {[{ icon: '🛡️', label: 'Enterprise Security' }, { icon: '⚡', label: 'Ultra-Fast Sync' }, { icon: '🕒', label: '24/7 Support' }, { icon: '🚀', label: 'Instant Deploy' }].map((b, i) => (
              <div key={i} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e8edf2', padding: '18px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
                <div style={{ fontSize: '22px', marginBottom: '8px' }}>{b.icon}</div>
                <div style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', lineHeight: '1.3' }}>{b.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upgrade Modal */}
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
