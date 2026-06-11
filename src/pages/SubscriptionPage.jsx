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

  // ── Edition-aware pricing (per-SKU + metered storage) ──────────────────────
  const [plans, setPlans] = useState([]);
  const [estimate, setEstimate] = useState(null);
  useEffect(() => {
    apiClient.get('/subscriptions/plans').then(r => setPlans(r?.data?.data || [])).catch(() => {});
  }, []);

  // The center renews/pays for its current edition. Derive it from the modules
  // the subscription enables.
  const currentEdition = (() => {
    const m = (subscription?.modules || []).map(x => String(x).toUpperCase());
    const hasR = m.includes('RIS'), hasP = m.includes('PACS');
    if (hasR && hasP) return 'RIS+PACS';
    if (hasR) return 'RIS';
    if (hasP) return 'PACS';
    return 'RIS+PACS';
  })();
  const cycleName = billingCycle === 'yearly' ? 'Yearly' : 'Monthly';
  const currentPlan = plans.find(p => p.edition === currentEdition && p.name === cycleName);

  // Metered amount-due estimate for the resolved plan (base + storage overage).
  useEffect(() => {
    if (!currentPlan?.planId) { setEstimate(null); return; }
    apiClient.get('/subscriptions/estimate', { params: { planId: currentPlan.planId } })
      .then(r => setEstimate(r?.data?.success ? r.data.data : null))
      .catch(() => setEstimate(null));
  }, [currentPlan?.planId]);

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
        planId={currentPlan?.planId}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0a1628', margin: '0 0 4px', letterSpacing: '-0.3px' }}>Choose a Plan</h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>Pay directly to our account — activated within 24 hours of review.</p>
            </div>
            <div className="billing-toggle">
              {[{ key: 'monthly', label: 'Monthly' }, { key: 'yearly', label: 'Yearly', badge: '10% off' }].map(c => (
                <button key={c.key} onClick={() => handleBillingCycle(c.key)}
                  style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: billingCycle === c.key ? '#0a1628' : 'transparent', color: billingCycle === c.key ? 'white' : '#6b7280', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {c.label}
                  {c.badge && <span style={{ background: '#ecfdf5', color: '#10b981', fontSize: '10px', padding: '1px 6px', borderRadius: '20px', fontWeight: 700 }}>{c.badge}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="plans-grid">
            {/* Free Trial Card */}
            <div className="sub-card">
              <p style={{ fontSize: '10px', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1.5px', margin: '0 0 12px' }}>Free Trial</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '8px' }}>
                <span style={{ fontSize: '36px', fontWeight: 700, color: '#0a1628', letterSpacing: '-1px' }}>₹0</span>
                <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>/ 14 days</span>
              </div>
              <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: '13px', lineHeight: 1.6 }}>Get started with all features for 14 days. No payment needed.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                {['All modules included', 'Basic DICOM Viewer', 'Single Clinic', 'Email Support'].map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ color: '#94a3b8', flexShrink: 0 }}><Icons.Check /></div>
                    <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>{f}</span>
                  </div>
                ))}
              </div>
              <button disabled style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#94a3b8', fontSize: '13px', fontWeight: 600, cursor: 'default', width: '100%' }}>
                {isTrial ? 'Current Plan' : 'Trial Used'}
              </button>
            </div>

            {/* Premium Card */}
            <div style={{ background: '#0a1628', padding: '30px', borderRadius: '24px', border: '1px solid #1e293b', boxShadow: '0 20px 40px -10px rgba(10,22,40,0.3)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #38bdf8, #1d4ed8)' }} />
              <div style={{ position: 'absolute', top: '16px', right: '16px', background: '#1d4ed8', color: 'white', fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px' }}>POPULAR</div>

              <p style={{ fontSize: '10px', fontWeight: 900, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '1.5px', margin: '0 0 12px' }}>1Rad Premium</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '4px' }}>
                <span style={{ fontSize: '36px', fontWeight: 700, color: 'white', letterSpacing: '-1px' }}>₹{premiumPlan.priceMonthly}</span>
                <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>/ mo</span>
              </div>
              {billingCycle === 'yearly' && (
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#10b981', marginBottom: '8px' }}>
                  ✓ Billed yearly — ₹{premiumPlan.price} total (save ₹5,988)
                </div>
              )}
              <p style={{ margin: '0 0 20px', color: '#94a3b8', fontSize: '13px', lineHeight: 1.6 }}>Unlimited access to all advanced features and priority support.</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                {premiumPlan.features.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ color: '#38bdf8', flexShrink: 0 }}><Icons.Check /></div>
                    <span style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 500 }}>{f}</span>
                  </div>
                ))}
              </div>

              {/* Payment info strip */}
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '14px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>How it works</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.7 }}>
                  1. Contact Nexeagle Administrator to get the official UPI ID for payment<br />
                  2. Pay ₹{billingCycle === 'yearly' ? '53,988' : '4,999'} to the provided UPI ID<br />
                  3. Click "Submit Payment" and enter your transaction details<br />
                  4. Our team reviews and activates within 24 hours
                </div>
              </div>

              {hasPending ? (
                <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(59,130,246,0.15)', color: '#93c5fd', fontSize: '13px', fontWeight: 700, textAlign: 'center', border: '1px solid rgba(59,130,246,0.2)' }}>
                  ⏳ Payment Under Review
                </div>
              ) : isPaidPlan ? (
                <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(16,185,129,0.15)', color: '#34d399', fontSize: '13px', fontWeight: 700, textAlign: 'center', border: '1px solid rgba(16,185,129,0.2)' }}>
                  ✓ Current Plan Active
                </div>
              ) : (
                <button
                  onClick={() => setPaymentModal(billingCycle)}
                  style={{ padding: '12px 20px', borderRadius: '10px', border: 'none', background: '#1d4ed8', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(29,78,216,0.3)', transition: 'all 0.2s', width: '100%' }}>
                  Submit Payment →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionPage;
