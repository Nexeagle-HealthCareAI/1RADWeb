import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../auth/useAuth';
import apiClient from '../api/apiClient';

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const Icons = {
  Check: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  ),
  Shield: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
    </svg>
  ),
  Clock: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  ),
  Star: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="url(#premiumGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="premiumGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
    </svg>
  ),
  Refresh: ({ spinning }) => (
    <svg style={{ animation: spinning ? 'spin 1s linear infinite' : 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
      <path d="M3 3v5h5"/>
    </svg>
  ),
};

// ─── Theme Constants ──────────────────────────────────────────────────────────
const NAVY  = '#0a1628';
const GOLD  = '#d4a017';
const GOLD2 = '#f5d76e';

// ─── Payment Request Side Drawer ──────────────────────────────────────────────
const PaymentRequestDrawer = ({ isOpen, plan, billingCycle, planId, estimate, onClose, onSuccess, currentUser }) => {
  const [step, setStep] = useState('form'); // 'form' | 'submitting' | 'done' | 'error'
  const [form, setForm] = useState({
    payerName: currentUser?.name || '',
    payerContact: '',
    paymentMode: 'UPI',
    transactionReference: '',
    paidAt: new Date().toISOString().slice(0, 10),
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      setStep('form');
      setForm(f => ({ ...f, payerName: currentUser?.name || '' }));
      setErrors({});
    }
  }, [isOpen, currentUser]);

  const priceMap = { monthly: 4999, yearly: 53988 };
  // Server-computed amount due (base + metered storage overage) when available;
  // else the legacy full-product price.
  const amount = estimate?.total ?? (priceMap[billingCycle] || priceMap.monthly);

  const validate = () => {
    const e = {};
    if (!form.payerName.trim()) e.payerName = 'Required';
    if (!form.payerContact.trim()) e.payerContact = 'Required';
    if (!form.transactionReference.trim()) e.transactionReference = 'Required — enter your UTR / reference number';
    if (!form.paidAt) e.paidAt = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setStep('submitting');
    try {
      await apiClient.post('/subscriptions/payment-request', {
        // PlanId is authoritative — the server derives the edition, modules,
        // storage overage and final amount from it. The rest is for the record.
        planId: planId || null,
        planName: plan.name,
        billingCycle: billingCycle.charAt(0).toUpperCase() + billingCycle.slice(1),
        amount,
        payerName: form.payerName,
        payerContact: form.payerContact,
        transactionReference: form.transactionReference,
        paymentMode: form.paymentMode,
        paidAt: form.paidAt,
      });
      setStep('done');
      setTimeout(() => { onSuccess(); onClose(); }, 2500);
    } catch {
      setStep('error');
    }
  };

  const labelStyle = { display:'block',fontSize:'11px',fontWeight:700,color:'#475569',letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:'7px' };

  return (
    <>
      {/* ── Drawer overlay ── */}
      {isOpen && (
        <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:2000,background:'rgba(10,22,40,0.45)',backdropFilter:'blur(4px)' }} />
      )}

      {/* ── Slide-out Drawer ── */}
      <div style={{
        position:'fixed', top:0, right:0, width:'420px', maxWidth:'100vw', height:'100%',
        background:'white', zIndex:2001, display:'flex', flexDirection:'column',
        boxShadow:'-12px 0 40px rgba(10,22,40,0.18)',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition:'transform 0.28s cubic-bezier(0.16,1,0.3,1)',
      }}>
        {/* Hero header */}
        <div style={{ padding:'22px 24px 20px', background:`linear-gradient(135deg,${NAVY} 0%,#1e3a5f 100%)`, position:'relative', overflow:'hidden', flexShrink:0 }}>
          <div style={{ position:'absolute',top:0,left:0,right:0,height:'3px',background:`linear-gradient(90deg,transparent,${GOLD} 30%,${GOLD2} 50%,${GOLD} 70%,transparent)` }} />
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:'10px',fontWeight:700,color:GOLD,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:'4px' }}>
                {billingCycle === 'yearly' ? 'Yearly Plan' : 'Monthly Plan'}
              </div>
              <h3 style={{ margin:0,fontSize:'18px',fontWeight:800,color:'white',letterSpacing:'-0.2px' }}>
                Submit Payment Details
              </h3>
              <p style={{ margin:'5px 0 0',fontSize:'12px',color:'rgba(255,255,255,0.5)',fontWeight:500 }}>
                ₹{amount.toLocaleString('en-IN')} via 1Rad Premium
              </p>
            </div>
            <button onClick={onClose} style={{ width:'32px',height:'32px',borderRadius:'50%',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.15)',color:'white',cursor:'pointer',fontSize:'16px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>×</button>
          </div>
        </div>

        {/* Drawer body */}
        <div style={{ flex:1, overflowY:'auto', padding:'22px 24px', display:'flex', flexDirection:'column', gap:'20px' }}>
          
          {step === 'form' && (
            <>
              {/* Summary strip */}
              <div style={{ background:'#f8fafc',borderRadius:'12px',padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',border:'1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize:'10px',fontWeight:800,color:'#94a3b8',letterSpacing:'1px',textTransform:'uppercase' }}>Amount to Pay</div>
                  <div style={{ fontSize:'22px',fontWeight:900,color:'#0ea5e9',letterSpacing:'-1px' }}>₹{amount.toLocaleString('en-IN')}</div>
                  {estimate?.overageAmount > 0 && (
                    <div style={{ fontSize:'11px',color:'#64748b',fontWeight:600,marginTop:'2px' }}>
                      ₹{estimate.basePrice.toLocaleString('en-IN')} base + ₹{estimate.overageAmount.toLocaleString('en-IN')} storage ({estimate.overageGb}GB over {estimate.includedStorageGb}GB)
                    </div>
                  )}
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:'10px',fontWeight:800,color:'#94a3b8',letterSpacing:'1px',textTransform:'uppercase' }}>Pay To</div>
                  <div style={{ fontSize:'13px',fontWeight:700,color:'#0f172a' }}>1Rad by Nexeagle</div>
                  <div style={{ fontSize:'11px',color:'#64748b',fontWeight:600 }}>Contact Admin for UPI</div>
                </div>
              </div>

              {/* Payer Name */}
              <div>
                <label style={labelStyle}>Your Name <span style={{ color:'#dc2626' }}>*</span></label>
                <input type="text" placeholder="Full name of the person who paid" value={form.payerName} onChange={e => setForm(f => ({ ...f, payerName: e.target.value }))}
                  style={{ width:'100%',padding:'11px 14px',borderRadius:'10px',border:`1.5px solid ${errors.payerName?'#fca5a5':'#e2e8f0'}`,fontSize:'13px',outline:'none',boxSizing:'border-box',color:NAVY,fontWeight:600,transition:'border-color 0.15s',fontFamily:'inherit',background:errors.payerName?'#fef2f2':'white' }}
                  onFocus={e => e.target.style.borderColor='#0f52ba'} onBlur={e => e.target.style.borderColor=errors.payerName?'#fca5a5':'#e2e8f0'} />
                {errors.payerName && <span style={{ fontSize:'11px',color:'#dc2626',marginTop:'4px',display:'block' }}>{errors.payerName}</span>}
              </div>

              {/* Contact */}
              <div>
                <label style={labelStyle}>Contact (Mobile / Email) <span style={{ color:'#dc2626' }}>*</span></label>
                <input type="text" placeholder="Mobile or email for confirmation" value={form.payerContact} onChange={e => setForm(f => ({ ...f, payerContact: e.target.value }))}
                  style={{ width:'100%',padding:'11px 14px',borderRadius:'10px',border:`1.5px solid ${errors.payerContact?'#fca5a5':'#e2e8f0'}`,fontSize:'13px',outline:'none',boxSizing:'border-box',color:NAVY,fontWeight:600,transition:'border-color 0.15s',fontFamily:'inherit',background:errors.payerContact?'#fef2f2':'white' }}
                  onFocus={e => e.target.style.borderColor='#0f52ba'} onBlur={e => e.target.style.borderColor=errors.payerContact?'#fca5a5':'#e2e8f0'} />
                {errors.payerContact && <span style={{ fontSize:'11px',color:'#dc2626',marginTop:'4px',display:'block' }}>{errors.payerContact}</span>}
              </div>

              {/* Payment Mode */}
              <div>
                <label style={labelStyle}>Payment Mode</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {['UPI', 'NEFT/RTGS', 'Bank Transfer', 'Cheque'].map(mode => (
                    <button key={mode} onClick={() => setForm(f => ({ ...f, paymentMode: mode }))}
                      style={{ padding:'7px 14px',borderRadius:'8px',border:`1px solid ${form.paymentMode===mode?NAVY:'#e2e8f0'}`,background:form.paymentMode===mode?NAVY:'white',color:form.paymentMode===mode?'white':'#64748b',fontSize:'12px',fontWeight:700,cursor:'pointer',transition:'all 0.15s' }}>
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transaction Reference */}
              <div>
                <label style={labelStyle}>Transaction Reference / UTR Number <span style={{ color:'#dc2626' }}>*</span></label>
                <input type="text" placeholder="e.g. UPI ref, UTR, Cheque No, NEFT ref" value={form.transactionReference} onChange={e => setForm(f => ({ ...f, transactionReference: e.target.value }))}
                  style={{ width:'100%',padding:'11px 14px',borderRadius:'10px',border:`1.5px solid ${errors.transactionReference?'#fca5a5':'#e2e8f0'}`,fontSize:'13px',outline:'none',boxSizing:'border-box',color:NAVY,fontWeight:600,transition:'border-color 0.15s',fontFamily:'inherit',background:errors.transactionReference?'#fef2f2':'white' }}
                  onFocus={e => e.target.style.borderColor='#0f52ba'} onBlur={e => e.target.style.borderColor=errors.transactionReference?'#fca5a5':'#e2e8f0'} />
                {errors.transactionReference && <span style={{ fontSize:'11px',color:'#dc2626',marginTop:'4px',display:'block' }}>{errors.transactionReference}</span>}
              </div>

              {/* Date of Payment */}
              <div>
                <label style={labelStyle}>Date of Payment <span style={{ color:'#dc2626' }}>*</span></label>
                <input type="date" max={new Date().toISOString().slice(0, 10)} value={form.paidAt} onChange={e => setForm(f => ({ ...f, paidAt: e.target.value }))}
                  style={{ width:'100%',padding:'11px 14px',borderRadius:'10px',border:`1.5px solid ${errors.paidAt?'#fca5a5':'#e2e8f0'}`,fontSize:'13px',outline:'none',boxSizing:'border-box',color:NAVY,fontWeight:600,transition:'border-color 0.15s',fontFamily:'inherit',background:errors.paidAt?'#fef2f2':'white' }}
                  onFocus={e => e.target.style.borderColor='#0f52ba'} onBlur={e => e.target.style.borderColor=errors.paidAt?'#fca5a5':'#e2e8f0'} />
                {errors.paidAt && <span style={{ fontSize:'11px',color:'#dc2626',marginTop:'4px',display:'block' }}>{errors.paidAt}</span>}
              </div>
              
              <div style={{ marginTop:'10px',padding:'12px 14px',borderRadius:'10px',background:'#f0fdf4',border:'1px solid #bbf7d0',display:'flex',gap:'10px' }}>
                <span style={{ color:'#16a34a',fontSize:'16px' }}>ℹ️</span>
                <p style={{ margin:0,fontSize:'11.5px',color:'#166534',lineHeight:1.5,fontWeight:500 }}>
                  After submitting, our team will verify your payment within 24 hours and activate your plan. You'll see the status update on this page.
                </p>
              </div>
            </>
          )}

          {step === 'submitting' && (
            <div style={{ textAlign:'center',padding:'40px 0',flex:1,display:'flex',flexDirection:'column',justifyContent:'center' }}>
              <div className="spinner" style={{ width:'36px',height:'36px',border:'3px solid #f1f5f9',borderTopColor:'#0ea5e9',borderRadius:'50%',margin:'0 auto 20px',animation:'spin 0.8s linear infinite' }} />
              <h4 style={{ margin:'0 0 8px',color:NAVY,fontSize:'16px',fontWeight:800 }}>Submitting...</h4>
              <p style={{ margin:0,fontSize:'13px',color:'#64748b' }}>Please wait while we record your details.</p>
            </div>
          )}

          {step === 'done' && (
            <div style={{ textAlign:'center',padding:'40px 0',flex:1,display:'flex',flexDirection:'column',justifyContent:'center' }}>
              <div style={{ width:'60px',height:'60px',background:'#f0fdf4',color:'#10b981',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px',fontSize:'28px',boxShadow:'0 4px 14px rgba(16,185,129,0.2)' }}>✓</div>
              <h4 style={{ margin:'0 0 8px',color:NAVY,fontSize:'20px',fontWeight:800 }}>Payment Submitted</h4>
              <p style={{ margin:'0',fontSize:'13px',color:'#64748b',lineHeight:1.6 }}>
                Our team has received your details.<br/>We'll verify and activate within 24 hours.
              </p>
            </div>
          )}

          {step === 'error' && (
            <div style={{ textAlign:'center',padding:'40px 0',flex:1,display:'flex',flexDirection:'column',justifyContent:'center' }}>
              <div style={{ width:'60px',height:'60px',background:'#fef2f2',color:'#ef4444',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px',fontSize:'28px',boxShadow:'0 4px 14px rgba(239,68,68,0.2)' }}>✕</div>
              <h4 style={{ margin:'0 0 8px',color:NAVY,fontSize:'20px',fontWeight:800 }}>Submission Failed</h4>
              <p style={{ margin:'0 0 24px',fontSize:'13px',color:'#64748b',lineHeight:1.6 }}>
                Couldn't reach our servers. Please check your connection and try again.
              </p>
              <button onClick={() => setStep('form')} style={{ padding:'10px 20px',borderRadius:'10px',border:'1px solid #e2e8f0',background:'white',color:NAVY,fontSize:'13px',fontWeight:700,cursor:'pointer',boxShadow:'0 2px 6px rgba(0,0,0,0.05)' }}>
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'form' && (
          <div style={{ padding:'16px 24px',borderTop:'1px solid #e8edf2',display:'flex',gap:'10px',background:'white',flexShrink:0 }}>
            <button onClick={onClose} style={{ flex:1,padding:'11px',borderRadius:'10px',border:'1.5px solid #e2e8f0',background:'white',fontWeight:700,fontSize:'13px',cursor:'pointer',color:'#475569',fontFamily:'inherit' }}
              onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'} onMouseLeave={e=>e.currentTarget.style.background='white'}>
              Cancel
            </button>
            <button onClick={handleSubmit} style={{ flex:2,padding:'11px',borderRadius:'10px',border:'none',background:`linear-gradient(135deg,${NAVY},#1e3a5f)`,color:'white',fontWeight:800,fontSize:'13px',cursor:'pointer',fontFamily:'inherit',boxShadow:'0 4px 14px rgba(10,22,40,0.25)',transition:'all 0.15s' }}>
              Submit for Review
            </button>
          </div>
        )}
      </div>
    </>
  );
};

// ─── Trial Countdown Ring ─────────────────────────────────────────────────────
const TrialCountdownRing = ({ daysLeft, totalDays = 14 }) => {
  const pct = Math.max(0, Math.min(1, daysLeft / totalDays));
  const r = 42, circ = 2 * Math.PI * r;
  const dash = pct * circ;
  const color = daysLeft <= 3 ? '#ef4444' : daysLeft <= 7 ? '#f59e0b' : '#10b981';
  return (
    <div style={{ position: 'relative', width: '100px', height: '100px', flexShrink: 0 }}>
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ / 4}
          strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '22px', fontWeight: 900, color, lineHeight: 1 }}>{daysLeft}</span>
        <span style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>days</span>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const SubscriptionPage = () => {
  const [billingCycle, setBillingCycle] = useState(() => localStorage.getItem('1rad_billing_pref') || 'monthly');
  const [paymentModal, setPaymentModal] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('status');
  const [transactions, setTransactions] = useState([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const { subscription, refreshSubscription, currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fetchTransactions = async () => {
      setLoadingTx(true);
      try {
        const res = await apiClient.get('/subscriptions/invoices');
        if (res.data?.success) {
          setTransactions(res.data.data);
        }
      } catch (err) {
        console.error('Failed to load transactions:', err);
      }
      setLoadingTx(false);
    };
    fetchTransactions();
  }, []);

  const daysLeft = subscription?.daysRemaining ?? 0;
  const isActive = subscription?.isActive ?? false;
  const isTrial = subscription?.isTrial ?? false;
  const subStatus = subscription?.status ?? 'Unknown';
  const billingCycleFromServer = subscription?.billingCycle ?? 'Trial';
  const hasPending = subscription?.hasPendingPaymentRequest ?? false;
  const pendingStatus = subscription?.pendingRequestStatus ?? null;
  const isPaidPlan = !isTrial && (subStatus === 'Active' || subStatus === 'Expiring');

  // ── Edition-aware pricing (per-SKU tiers + metered storage + PAYG) ─────────
  const [plans, setPlans] = useState([]);
  const [estimate, setEstimate] = useState(null);
  // Selection is BY TIER (not plan id) so it survives cycle/edition switches.
  const [selectedTier, setSelectedTier] = useState(null); // 'Starter'|'Growth'|'Clinic'|'PAYG'
  useEffect(() => {
    apiClient.get('/subscriptions/plans').then(r => setPlans(r?.data?.data || [])).catch(() => {});
  }, []);

  // Default to the center's current edition; the user can pick a different
  // edition/tier/PAYG via the selector.
  const currentEdition = (() => {
    const m = (subscription?.modules || []).map(x => String(x).toUpperCase());
    const hasR = m.includes('RIS'), hasP = m.includes('PACS');
    if (hasR && hasP) return 'RIS+PACS';
    if (hasR) return 'RIS';
    if (hasP) return 'PACS';
    return 'RIS+PACS';
  })();
  const [selectedEdition, setSelectedEdition] = useState(null);
  const editionInView = selectedEdition || currentEdition;
  const cycleName = billingCycle === 'yearly' ? 'Yearly' : 'Monthly';
  // Subscription tier cards for the edition+cycle in view (Starter→Clinic, asc).
  const editionTiers = plans
    .filter(p => p.edition === editionInView && p.billingMode !== 'PerStudy' && !p.isCustom && p.name === cycleName)
    .sort((a, b) => a.price - b.price);
  // PAYG + Chain plans for the edition in view (cycle-independent).
  const editionPayg = plans.find(p => p.edition === editionInView && p.billingMode === 'PerStudy');
  const editionChain = plans.find(p => p.edition === editionInView && p.isCustom);
  // Default highlight = the middle tier (most popular); selection follows the
  // TIER across cycle/edition switches instead of resetting.
  const defaultPlan = editionTiers[1] || editionTiers[0] || null;
  const activePlan = selectedTier === 'PAYG'
    ? (editionPayg || defaultPlan)
    : (editionTiers.find(p => p.tier === selectedTier) || defaultPlan);

  // Metered amount-due estimate for the active plan (base + storage overage, or
  // PAYG studies × rate).
  useEffect(() => {
    if (!activePlan?.planId) { setEstimate(null); return; }
    apiClient.get('/subscriptions/estimate', { params: { planId: activePlan.planId } })
      .then(r => setEstimate(r?.data?.success ? r.data.data : null))
      .catch(() => setEstimate(null));
  }, [activePlan?.planId]);

  const handleBillingCycle = (cycle) => {
    setBillingCycle(cycle);
    localStorage.setItem('1rad_billing_pref', cycle);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshSubscription();
    try {
      const res = await apiClient.get('/subscriptions/invoices');
      if (res.data?.success) setTransactions(res.data.data);
    } catch (e) {}
    setIsRefreshing(false);
  };

  const onPaymentSuccess = async () => {
    await refreshSubscription();
    try {
      const res = await apiClient.get('/subscriptions/invoices');
      if (res.data?.success) setTransactions(res.data.data);
    } catch (e) {}
  };

  const premiumPlan = {
    name: '1Rad Premium',
    price: billingCycle === 'monthly' ? '4,999' : '53,988',
    priceMonthly: billingCycle === 'yearly' ? '4,499' : '4,999',
    features: [
      'Unlimited DICOM Studies & Storage', 
      'Advanced Diagnostic Viewer', 
      'AI-Powered Reporting', 
      'Teleradiology & Referral Portal', 
      'Multi-Clinic Synchronization', 
      'Automated Billing & Invoicing',
      'Custom Roles & Permissions',
      'Payroll & Leave Management',
      'Priority 24/7 Support'
    ],
  };

  const statusColor = {
    Active: '#10b981', Expiring: '#f59e0b', Expired: '#ef4444',
    Locked: '#ef4444', Trial: '#3b82f6', Unknown: '#94a3b8',
  }[subStatus] || '#94a3b8';

  const statusLabel = isTrial
    ? (subStatus === 'Active' ? 'Free Trial Active' : subStatus === 'Expiring' ? 'Trial Expiring' : subStatus)
    : subStatus;

  return (
    <div className="sub-page">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

        .sub-page { background: #f8fafc; min-height: 100vh; padding: 40px; box-sizing: border-box; }

        .sub-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; gap: 20px; flex-wrap: wrap; }

        .sub-tabs { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
        .sub-tab-btn { padding: 7px 16px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }

        .sub-card { background: white; border-radius: 24px; border: 1px solid #e2e8f0; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); box-sizing: border-box; animation: fadeIn 0.3s ease; }

        .status-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 24px; }
        .status-cell { padding: 18px; background: #f8fafc; border-radius: 14px; border: 1px solid #e2e8f0; }

        .plans-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }

        /* ── Upgrade tab (premium pricing layout) ── */
        .up-hero { text-align: center; margin-bottom: 30px; }
        .up-hero h3 { font-size: 24px; font-weight: 800; color: #0a1628; margin: 0 0 6px; letter-spacing: -0.5px; }
        .up-hero p { margin: 0 0 18px; font-size: 13px; color: #6b7280; }
        .up-controls { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }
        .up-seg { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 4px; display: inline-flex; gap: 4px; flex-wrap: wrap; }
        .up-seg button { padding: 8px 16px; border-radius: 9px; border: none; background: transparent; color: #6b7280; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 7px; }
        .up-seg button.on { background: #0a1628; color: white; }
        .up-current-dot { width: 7px; height: 7px; border-radius: 50%; background: #10b981; display: inline-block; }
        .up-save-chip { background: #ecfdf5; color: #10b981; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 20px; }

        .up-tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; align-items: stretch; }
        .up-tier { position: relative; display: flex; flex-direction: column; background: white; border: 1.5px solid #e2e8f0; border-radius: 22px; padding: 28px 26px 24px; cursor: pointer; transition: transform 0.22s, box-shadow 0.22s, border-color 0.22s, background 0.22s; }
        .up-tier:hover { transform: translateY(-3px); box-shadow: 0 16px 36px -14px rgba(10,22,40,0.16); }
        .up-tier.popular { border-color: #bfdbfe; box-shadow: 0 18px 44px -16px rgba(29,78,216,0.22); }
        .up-tier.on { background: #0a1628; border-color: #1d4ed8; box-shadow: 0 24px 52px -14px rgba(10,22,40,0.45); }
        .up-ribbon { position: absolute; top: -11px; left: 50%; transform: translateX(-50%); background: linear-gradient(90deg, #38bdf8, #1d4ed8); color: white; font-size: 10px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; padding: 4px 14px; border-radius: 20px; box-shadow: 0 4px 12px rgba(29,78,216,0.35); white-space: nowrap; }
        .up-tier-name { font-size: 11px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #94a3b8; margin: 0 0 2px; }
        .up-tier.on .up-tier-name { color: #38bdf8; }
        .up-tagline { font-size: 12px; color: #6b7280; margin: 0 0 16px; min-height: 18px; }
        .up-tier.on .up-tagline { color: #94a3b8; }
        .up-price-row { display: flex; align-items: baseline; gap: 5px; }
        .up-price { font-size: 32px; font-weight: 800; letter-spacing: -1px; color: #0a1628; }
        .up-tier.on .up-price, .up-flex-card.on .up-price { color: white; }
        .up-cycle { font-size: 13px; color: #6b7280; font-weight: 500; }
        .up-tier.on .up-cycle, .up-flex-card.on .up-cycle { color: #94a3b8; }
        .up-price-note { font-size: 12px; color: #6b7280; margin: 4px 0 0; min-height: 16px; }
        .up-tier.on .up-price-note { color: #94a3b8; }
        .up-price-note em { font-style: normal; color: #10b981; font-weight: 700; }
        .up-features { display: flex; flex-direction: column; gap: 9px; margin: 18px 0 22px; flex: 1; }
        .up-feature { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #374151; font-weight: 500; }
        .up-tier.on .up-feature { color: #e2e8f0; }
        .up-tick { color: #94a3b8; flex-shrink: 0; display: flex; }
        .up-tier.on .up-tick { color: #38bdf8; }
        .up-tier.popular:not(.on) .up-tick { color: #1d4ed8; }
        .up-cta { padding: 11px 18px; border-radius: 10px; border: 1px solid #e2e8f0; background: #f8fafc; color: #475569; font-size: 13px; font-weight: 700; cursor: pointer; width: 100%; transition: all 0.2s; }
        .up-cta:hover { border-color: #93c5fd; color: #1d4ed8; }
        .up-tier.popular:not(.on) .up-cta { background: #1d4ed8; border-color: #1d4ed8; color: white; }
        .up-cta.on { background: #1d4ed8; border-color: #1d4ed8; color: white; }

        .up-divider { display: flex; align-items: center; gap: 14px; margin: 28px 0 18px; }
        .up-divider::before, .up-divider::after { content: ''; flex: 1; height: 1px; background: #e2e8f0; }
        .up-divider span { font-size: 10px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #94a3b8; }
        .up-flex { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .up-flex-card { display: flex; justify-content: space-between; gap: 20px; background: white; border: 1.5px solid #e2e8f0; border-radius: 18px; padding: 22px 24px; cursor: pointer; transition: all 0.2s; }
        .up-flex-card:hover:not(.chain) { border-color: #93c5fd; }
        .up-flex-card.on { background: #0a1628; border-color: #1d4ed8; box-shadow: 0 18px 40px -14px rgba(10,22,40,0.4); }
        .up-flex-card.on .up-tier-name { color: #38bdf8; }
        .up-flex-card.chain { border-style: dashed; cursor: default; }
        .up-flex-body { flex: 1; min-width: 0; }
        .up-flex-text { font-size: 12.5px; color: #6b7280; line-height: 1.6; margin: 6px 0 0; }
        .up-flex-card.on .up-flex-text { color: #94a3b8; }
        .up-flex-side { display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; gap: 12px; flex-shrink: 0; }
        .up-flex-side .up-cta { width: auto; white-space: nowrap; }

        .up-summary { margin-top: 26px; background: #0a1628; border: 1px solid #1e293b; border-radius: 20px; padding: 22px 26px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
        .up-summary-label { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
        .up-summary-title { font-size: 18px; font-weight: 700; color: white; }
        .up-summary-sub { font-size: 13px; color: #94a3b8; margin-top: 4px; }
        .up-submit { padding: 13px 28px; border-radius: 10px; border: none; background: #1d4ed8; color: white; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 14px rgba(29,78,216,0.3); transition: all 0.2s; }
        .up-submit:hover { background: #1e40af; }
        .up-footnote { margin-top: 16px; font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.7; }
        .up-footnote-meta { display: block; font-size: 11px; color: #cbd5e1; }

        @media (max-width: 980px) { .up-tiers { grid-template-columns: 1fr; gap: 24px; } .up-flex { grid-template-columns: 1fr; } }

        .billing-toggle { background: white; padding: 4px; border-radius: 10px; display: flex; gap: 4px; border: 1px solid #e2e8f0; }

        .pending-badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 20px; background: #eff6ff; color: #3b82f6; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; animation: pulse 2s infinite; }

        @media (max-width: 639px) {
          .sub-page { padding: 20px 16px; }
          .sub-header { margin-bottom: 20px; flex-direction: column; align-items: flex-start; }
          .sub-header h1 { font-size: 18px !important; }
          .status-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
          .plans-grid { grid-template-columns: 1fr; }
          .sub-card { padding: 20px; }
        }

        @media (min-width: 640px) and (max-width: 1023px) {
          .sub-page { padding: 30px 20px; }
          .plans-grid { grid-template-columns: 1fr; }
          .status-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <PaymentRequestDrawer
        isOpen={!!paymentModal}
        plan={premiumPlan}
        billingCycle={paymentModal || 'monthly'}
        planId={activePlan?.planId}
        estimate={estimate}
        currentUser={currentUser}
        onClose={() => setPaymentModal(null)}
        onSuccess={onPaymentSuccess}
      />

      {/* ── Header ── */}
      <div className="sub-header">
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0a1628', letterSpacing: '-0.5px', margin: 0, marginBottom: '4px' }}>Subscription</h1>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>Manage your plan and billing</div>
          <div className="sub-tabs">
            {[{ key: 'status', label: 'Current Plan' }, { key: 'upgrade', label: 'Upgrade Plan' }].map(t => (
              <button key={t.key} className="sub-tab-btn" onClick={() => setActiveTab(t.key)}
                style={{ background: activeTab === t.key ? '#0a1628' : 'white', color: activeTab === t.key ? 'white' : '#6b7280' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={handleRefresh} disabled={isRefreshing}
          style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#0a1628', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}>
          <Icons.Refresh spinning={isRefreshing} />
          {isRefreshing ? 'Syncing...' : 'Sync Data'}
        </button>
      </div>

      {/* ── Status Tab ── */}
      {activeTab === 'status' && (
        <div style={{ width: '100%' }}>

          {/* ── TRIAL ACTIVE CARD ── */}
          {isTrial && (subStatus === 'Active' || subStatus === 'Expiring') && (
            <div className="sub-card" style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap' }}>
                <TrialCountdownRing daysLeft={daysLeft} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '10px', fontWeight: 900, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Free Trial</span>
                    <span style={{ padding: '3px 10px', borderRadius: '20px', background: statusColor + '15', color: statusColor, fontSize: '11px', fontWeight: 800 }}>{statusLabel}</span>
                  </div>
                  <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 800, color: '#0a1628', letterSpacing: '-0.3px' }}>
                    {daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining in your free trial` : 'Trial period has ended'}
                  </h2>
                  <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b', lineHeight: 1.6 }}>
                    {daysLeft <= 3 && daysLeft > 0
                      ? 'Your trial is ending very soon. Upgrade now to avoid service interruption. You have a 2-day grace period after expiry.'
                      : daysLeft === 0
                      ? 'Your trial has ended. You have a 2-day grace period before access is restricted. Upgrade now.'
                      : 'Explore all features during your trial. Upgrade anytime to continue uninterrupted access.'}
                  </p>
                  {hasPending ? (
                    <div className="pending-badge">⏳ Payment under review — we'll activate within 24 hrs</div>
                  ) : (
                    <button onClick={() => setActiveTab('upgrade')}
                      style={{ padding: '10px 22px', borderRadius: '10px', border: 'none', background: '#0a1628', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(10,22,40,0.15)', transition: 'all 0.2s' }}>
                      Upgrade Now →
                    </button>
                  )}
                </div>
              </div>

              <div className="status-grid">
                {[
                  { label: 'Trial Start', value: subscription?.startDate ? new Date(subscription.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
                  { label: 'Trial End', value: subscription?.endDate ? new Date(subscription.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
                  { label: 'Grace Period Ends', value: subscription?.endDate ? new Date(new Date(subscription.endDate).getTime() + 2 * 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
                ].map(c => (
                  <div key={c.label} className="status-cell">
                    <p style={{ fontSize: '10px', fontWeight: 900, color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 6px' }}>{c.label}</p>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0a1628' }}>{c.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── PAID ACTIVE PLAN CARD ── */}
          {isPaidPlan && (
            <div className="sub-card" style={{ background: '#0a1628', border: '1px solid #1e293b', marginBottom: '20px' }}>
              <div style={{ position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(56,189,248,0.05)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #38bdf8, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(56,189,248,0.25)', flexShrink: 0 }}>
                    <Icons.Star />
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 900, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Active Plan</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>
                      1Rad Premium — {billingCycleFromServer}
                    </div>
                  </div>
                  <span style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: '20px', background: '#10b981', color: 'white', fontSize: '11px', fontWeight: 800 }}>ACTIVE</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '14px' }}>
                  {[
                    { label: 'Valid From', value: subscription?.startDate ? new Date(subscription.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
                    { label: 'Valid Until', value: subscription?.endDate ? new Date(subscription.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' },
                    { label: 'Days Left', value: `${daysLeft} day${daysLeft !== 1 ? 's' : ''}` },
                  ].map(c => (
                    <div key={c.label} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <p style={{ fontSize: '10px', fontWeight: 900, color: '#64748b', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 6px' }}>{c.label}</p>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'white' }}>{c.value}</div>
                    </div>
                  ))}
                </div>

                {/* Days remaining bar */}
                <div style={{ marginTop: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Plan usage</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{daysLeft} / {billingCycleFromServer === 'Yearly' ? 365 : 30} days remaining</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: '99px', background: 'linear-gradient(90deg, #38bdf8, #1d4ed8)', width: `${Math.min(100, (daysLeft / (billingCycleFromServer === 'Yearly' ? 365 : 30)) * 100)}%`, transition: 'width 0.6s ease' }} />
                  </div>
                </div>

                {/* PAYG running charge (only when on pay-per-study) */}
                {subscription?.billingMode === 'PerStudy' && (
                  <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(56,189,248,0.08)', borderRadius: '12px', border: '1px solid rgba(56,189,248,0.2)' }}>
                    <p style={{ fontSize: '10px', fontWeight: 900, color: '#38bdf8', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 6px' }}>Pay-per-study — this cycle</p>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'white' }}>
                      {(subscription?.paygStudiesThisCycle ?? 0)} finalized {(subscription?.paygStudiesThisCycle === 1) ? 'study' : 'studies'} · ₹{Number(subscription?.paygAmountDue ?? 0).toLocaleString('en-IN')} due
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#94a3b8', lineHeight: 1.6 }}>
                      Billed in arrears. Pay this amount via the normal payment-request flow at the end of the cycle.
                    </p>
                  </div>
                )}

                {/* Features List */}
                <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <p style={{ fontSize: '10px', fontWeight: 900, color: '#64748b', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 16px' }}>Current Features</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                    {premiumPlan.features.map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ color: '#10b981', flexShrink: 0 }}><Icons.Check /></div>
                        <span style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 500 }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── PAYMENT UNDER REVIEW CARD ── */}
          {hasPending && !isPaidPlan && (
            <div className="sub-card" style={{ border: '1px solid #bfdbfe', background: '#eff6ff', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>⏳</div>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 900, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Payment Under Review</div>
                  <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800, color: '#1e3a8a' }}>Your payment details have been submitted</h3>
                  <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#3b82f6', lineHeight: 1.6 }}>
                    Our team is verifying your payment. Your plan will be activated within 24 hours of confirmation. No action needed.
                  </p>
                  <button onClick={handleRefresh} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #bfdbfe', background: 'white', color: '#1d4ed8', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                    Check Status
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── EXPIRED / LOCKED CARD ── */}
          {(subStatus === 'Expired' || subStatus === 'Locked') && !hasPending && (
            <div className="sub-card" style={{ border: '1px solid #fecaca', background: '#fef2f2', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>🔒</div>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>{subStatus === 'Locked' ? 'Access Locked' : 'Grace Period Active'}</div>
                  <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800, color: '#7f1d1d' }}>
                    {subStatus === 'Locked' ? 'Your subscription has expired and access is restricted' : 'Trial ended — 2-day grace period in progress'}
                  </h3>
                  <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#b91c1c', lineHeight: 1.6 }}>
                    {subStatus === 'Locked'
                      ? 'Upgrade to a paid plan to restore full access for all users in your facility.'
                      : 'You have a short grace window. Upgrade now to avoid access being restricted.'}
                  </p>
                  <button onClick={() => setActiveTab('upgrade')}
                    style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#dc2626', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                    Upgrade Now →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Base info row */}
          <div className="sub-card">
            <p style={{ fontSize: '10px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1.5px', margin: '0 0 16px' }}>Subscription Details</p>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
              {[
                { label: 'Plan Type', value: subStatus === 'None' ? 'No Active Plan' : (isTrial ? 'Free Trial' : `Premium — ${billingCycleFromServer}`) },
                { label: 'Status', value: statusLabel, color: statusColor },
                { label: 'Valid Until', value: (subscription?.endDate && !subscription.endDate.startsWith('0001')) ? new Date(subscription.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A' },
                { label: 'Days Remaining', value: subStatus === 'None' ? '—' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''}`, color: (daysLeft <= 3 && subStatus !== 'None') ? '#ef4444' : undefined },
              ].map(c => (
                <div key={c.label} style={{ padding: '14px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <p style={{ fontSize: '10px', fontWeight: 900, color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 6px' }}>{c.label}</p>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: c.color || '#0a1628' }}>{c.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── TRANSACTIONS TABLE ── */}
          <div className="sub-card" style={{ marginTop: '20px' }}>
            <p style={{ fontSize: '10px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1.5px', margin: '0 0 16px' }}>Transaction History</p>
            {loadingTx ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>Loading transactions...</div>
            ) : transactions.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #e2e8f0', color: '#64748b', fontSize: '13px', fontWeight: 500 }}>
                No payment transactions found.
              </div>
            ) : isMobile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {transactions.map(tx => (
                  <div key={tx.requestId} style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e8edf2', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>{new Date(tx.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      <span style={{ 
                        padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px',
                        background: tx.status === 'Approved' ? '#dcfce7' : tx.status === 'Rejected' ? '#fee2e2' : '#fef9c3',
                        color: tx.status === 'Approved' ? '#166534' : tx.status === 'Rejected' ? '#991b1b' : '#854d0e'
                      }}>
                        {tx.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#0a1628' }}>{tx.planName || 'Premium'}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, marginTop: '2px' }}>{tx.billingCycle}</div>
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: 900, color: '#0ea5e9' }}>₹{tx.amount.toLocaleString('en-IN')}</div>
                    </div>
                    <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Ref: {tx.transactionReference}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500, marginTop: '2px' }}>Mode: {tx.paymentMode}</div>
                    </div>
                    {tx.reviewNote && <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '10px', fontWeight: 500, lineHeight: 1.4, padding: '8px 12px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>Reason: {tx.reviewNote}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                      <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Date</th>
                      <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Plan</th>
                      <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Amount</th>
                      <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Reference</th>
                      <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => (
                      <tr key={tx.requestId} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 700, color: '#0a1628' }}>{new Date(tx.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0a1628' }}>{tx.planName || 'Premium'}</div>
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500, marginTop: '2px' }}>{tx.billingCycle}</div>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: 800, color: '#0a1628' }}>₹{tx.amount.toLocaleString('en-IN')}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>{tx.transactionReference}</div>
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500, marginTop: '2px' }}>{tx.paymentMode}</div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ 
                            padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px',
                            background: tx.status === 'Approved' ? '#dcfce7' : tx.status === 'Rejected' ? '#fee2e2' : '#fef9c3',
                            color: tx.status === 'Approved' ? '#166534' : tx.status === 'Rejected' ? '#991b1b' : '#854d0e'
                          }}>
                            {tx.status}
                          </span>
                          {tx.reviewNote && <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '6px', maxWidth: '200px', fontWeight: 500, lineHeight: 1.4 }}>Reason: {tx.reviewNote}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Upgrade Tab ── */}
      {activeTab === 'upgrade' && (
        <div style={{ width: '100%' }}>
          {/* Hero + controls */}
          <div className="up-hero">
            <h3>Choose your plan</h3>
            <p>Simple pricing that scales with your centre. Pay offline, activated within 24 hours of review.</p>
            <div className="up-controls">
              <div className="up-seg">
                {[{ k: 'RIS', label: 'RIS' }, { k: 'PACS', label: 'Cloud PACS' }, { k: 'RIS+PACS', label: 'RIS + Cloud PACS' }].map(e => (
                  <button key={e.k} className={editionInView === e.k ? 'on' : ''} onClick={() => setSelectedEdition(e.k)}>
                    {e.label}
                    {e.k === currentEdition && <span className="up-current-dot" title="Your current edition" />}
                  </button>
                ))}
              </div>
              <div className="up-seg">
                {[{ key: 'monthly', label: 'Monthly' }, { key: 'yearly', label: 'Yearly', badge: 'Save 10%' }].map(c => (
                  <button key={c.key} className={billingCycle === c.key ? 'on' : ''} onClick={() => handleBillingCycle(c.key)}>
                    {c.label}
                    {c.badge && <span className="up-save-chip">{c.badge}</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tier cards */}
          <div className="up-tiers">
            {editionTiers.map((p, i) => {
              const on = activePlan?.planId === p.planId;
              const popular = i === 1 && editionTiers.length > 2;
              const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
              const monthlyTwin = plans.find(x => x.edition === p.edition && x.tier === p.tier && x.name === 'Monthly' && x.billingMode !== 'PerStudy' && !x.isCustom);
              const yearlySave = cycleName === 'Yearly' && monthlyTwin ? Math.max(0, monthlyTwin.price * 12 - p.price) : 0;
              const tagline = { Starter: 'For solo practices getting started', Growth: 'For busy single-centre clinics', Clinic: 'For high-volume, multi-room centres' }[p.tier] || '';
              return (
                <div key={p.planId} className={`up-tier${on ? ' on' : ''}${popular ? ' popular' : ''}`} onClick={() => setSelectedTier(p.tier)}>
                  {popular && <div className="up-ribbon">Most popular</div>}
                  <p className="up-tier-name">{p.tier}</p>
                  <p className="up-tagline">{tagline}</p>
                  <div className="up-price-row">
                    <span className="up-price">{fmt(p.price)}</span>
                    <span className="up-cycle">/ {cycleName === 'Yearly' ? 'year' : 'month'}</span>
                  </div>
                  <div className="up-price-note">
                    {cycleName === 'Yearly'
                      ? <>≈ {fmt(Math.round(p.price / 12))}/mo{yearlySave > 0 && <em> · save {fmt(yearlySave)}</em>}</>
                      : <>billed monthly</>}
                  </div>
                  <div className="up-features">
                    {[
                      `${p.maxUsers == null ? 'Unlimited' : `Up to ${p.maxUsers}`} staff users`,
                      `${p.maxSites == null ? 'Unlimited' : p.maxSites} site${p.maxSites === 1 ? '' : 's'}`,
                      p.includedStorageGb > 0 ? `${p.includedStorageGb >= 1024 ? `${Math.round(p.includedStorageGb / 1024)} TB` : `${p.includedStorageGb} GB`} cloud DICOM storage` : (p.edition === 'RIS' ? 'PDF / JPG attachments' : 'Storage included'),
                      'Diagnostic reporting included',
                    ].map(f => (
                      <div key={f} className="up-feature">
                        <span className="up-tick"><Icons.Check /></span>
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                  <button className={`up-cta${on ? ' on' : ''}`} onClick={(ev) => { ev.stopPropagation(); setSelectedTier(p.tier); }}>
                    {on ? '✓ Selected' : `Choose ${p.tier}`}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Flexible options — PAYG + Chain */}
          {(editionPayg || editionChain) && (
            <>
              <div className="up-divider"><span>Flexible options</span></div>
              <div className="up-flex">
                {editionPayg && (() => {
                  const on = activePlan?.planId === editionPayg.planId;
                  return (
                    <div className={`up-flex-card${on ? ' on' : ''}`} onClick={() => setSelectedTier('PAYG')}>
                      <div className="up-flex-body">
                        <p className="up-tier-name">Pay per study</p>
                        <p className="up-flex-text">No monthly commitment — billed monthly in arrears for every finalized report. Ideal for low or variable volume.</p>
                      </div>
                      <div className="up-flex-side">
                        <div className="up-price-row">
                          <span className="up-price" style={{ fontSize: 26 }}>₹{Number(editionPayg.perStudyPrice || 0).toLocaleString('en-IN')}</span>
                          <span className="up-cycle">/ study</span>
                        </div>
                        <button className={`up-cta${on ? ' on' : ''}`} onClick={(ev) => { ev.stopPropagation(); setSelectedTier('PAYG'); }}>
                          {on ? '✓ Selected' : 'Choose PAYG'}
                        </button>
                      </div>
                    </div>
                  );
                })()}
                {editionChain && (
                  <div className="up-flex-card chain">
                    <div className="up-flex-body">
                      <p className="up-tier-name">Chain / Enterprise</p>
                      <p className="up-flex-text">Unlimited users, multi-site and bespoke storage for hospital chains. Tailored quote and onboarding.</p>
                    </div>
                    <div className="up-flex-side">
                      <div className="up-price-row"><span className="up-price" style={{ fontSize: 26 }}>Custom</span></div>
                      <button className="up-cta" disabled style={{ cursor: 'default', opacity: 0.7 }}>Contact us</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Selected-plan summary + submit */}
          {activePlan && (
            <div className="up-summary">
              <div>
                <div className="up-summary-label">You selected</div>
                <div className="up-summary-title">
                  {editionInView === 'PACS' ? 'Cloud PACS' : editionInView} · {activePlan.billingMode === 'PerStudy' ? 'Pay per study' : `${activePlan.tier} · ${cycleName}`}
                </div>
                {activePlan.billingMode === 'PerStudy' ? (
                  <div className="up-summary-sub">
                    {estimate?.studiesCount != null
                      ? `${estimate.studiesCount} finalized ${estimate.studiesCount === 1 ? 'study' : 'studies'} this cycle × ₹${Number(activePlan.perStudyPrice).toLocaleString('en-IN')} = ₹${Number(estimate.total || 0).toLocaleString('en-IN')} due`
                      : `₹${Number(activePlan.perStudyPrice).toLocaleString('en-IN')} per finalized study, billed monthly`}
                  </div>
                ) : (
                  <div className="up-summary-sub">
                    ₹{Number(estimate?.total ?? activePlan.price).toLocaleString('en-IN')} due
                    {estimate && estimate.overageAmount > 0 && ` (incl. ₹${Number(estimate.overageAmount).toLocaleString('en-IN')} storage overage)`}
                    {' '}· per {cycleName === 'Yearly' ? 'year' : 'month'}
                  </div>
                )}
              </div>
              {hasPending ? (
                <div className="pending-badge" style={{ alignSelf: 'center' }}>⏳ Payment Under Review</div>
              ) : (
                <button className="up-submit" onClick={() => setPaymentModal(billingCycle)}>
                  Submit Payment →
                </button>
              )}
            </div>
          )}

          {/* Reassurance strip */}
          <div className="up-footnote">
            {isTrial
              ? 'You are on the 14-day free trial — pick a plan to continue after it ends.'
              : 'Pay the shown amount to the provided UPI ID, then Submit Payment with your transaction reference. Activated within 24 hours of review.'}
            <span className="up-footnote-meta">Prices in INR · Reporting included in every plan · Upgrade or change anytime</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionPage;
