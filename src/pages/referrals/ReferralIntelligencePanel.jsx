import React from 'react';
import DoctorLinksView from './DoctorLinksView';
import PatientSourcesView from './PatientSourcesView';
import { getReferrerProfileCompletion, completionColor } from './referrerProfile';
import { sortArrow } from './sortArrow';
import { getISODate, getOverviewDates } from './dateRanges';
import { parsePatientAge, formatPatientAge } from '../../utils/patientAge';

/**
 * ReferralIntelligencePanel — the core "Referral Intelligence" feature: a
 * 5-way view switcher (Source Analytics / Case Ledger / Partner Network /
 * Patient Section / Doctor Links) sharing one header (tab switcher, search,
 * person-type filter, temporal-unit filter) over the referral commission
 * ledger.
 *
 * Extracted verbatim from ReferralsPage.jsx's inline `renderReferralIntel()`
 * — this is intentionally still one large component rather than further
 * split into 5 sub-views: its internal control flow (particularly inside
 * the Source Analytics / Case Ledger branches) is dense enough that
 * splitting it safely needs its own dedicated pass, not a rushed one bolted
 * onto this extraction. Moving it to its own file already gets it out of
 * the 6,800-line page component and gives it real prop boundaries — the
 * next SRP step (breaking up the internals) is easier to do safely now that
 * it's isolated here instead of buried in ReferralsPage.jsx.
 */
export default function ReferralIntelligencePanel({
  bulkSend,
  caseLedgerList,
  copyDoctorLink,
  revokeDoctorLinks,
  linkStatus,
  doctorList,
  emailDoctors,
  expandedReferrer,
  exportParams,
  fetchPatientMasterList,
  getStatusConfig,
  handleDeleteReferrer,
  handleExportIntelligence,
  handleExportLedger,
  handleExportMatrix,
  handleExportPatientMasterList,
  handleExportRoster,
  handleUnmergeReferrer,
  isAllLedgerSelected,
  isExporting,
  isMobile,
  isTestMode,
  linkSend,
  linksBusy,
  linksSort,
  loadingMaster,
  masterSort,
  matrixDateStr,
  matrixPeriod,
  matrixWeekIndex,
  openBulkAdd,
  openLinkSend,
  patientMasterList,
  patientMasterError,
  retryPatientMasterList,
  personTypeFilter,
  referralAggregated,
  referralFilterMode,
  referralLinksSearch,
  referralLoading,
  referralError,
  referralUpdatedAt,
  onRetryReferrals,
  referralLogSearch,
  referralMatrixSearch,
  referralPatientsSearch,
  referralRange,
  referralRosterSearch,
  referralViewMode,
  hideZeroSources,
  setHideZeroSources,
  channelData,
  channelRangeLabel,
  rosterSort,
  selectedLedgerRows,
  selectedLinks,
  selfSummary,
  unlinkedSources,
  unattributedSummary,
  referralSort,
  matrixLoading,
  matrixError,
  sendSelectedLinks,
  setBulkSend,
  setDeleteAfterMerge,
  setEditingPatient,
  setEditingReferrer,
  setExpandedReferrer,
  setExportParams,
  setIsMergeModalOpen,
  setIsPatientEditDrawerOpen,
  setIsReferrerEditDrawerOpen,
  setLinkSend,
  setMatrixDateStr,
  setMatrixPeriod,
  setMatrixWeekIndex,
  setPersonTypeFilter,
  setReferralFilterMode,
  setReferralLinksSearch,
  setReferralLogSearch,
  setReferralMatrixSearch,
  setReferralPatientsSearch,
  setReferralRange,
  setReferralRosterSearch,
  setReferralViewMode,
  setSelectedLedgerRows,
  setSelectedLinks,
  setShowExportOverlay,
  showExportOverlay,
  sortedMaster,
  sortedRoster,
  submitLinkSend,
  temporalMatrixData,
  totalAttendedVisits,
  loadMoreSourceVisits,
  retrySourceVisits,
  toggleAllLedger,
  toggleLedgerSelection,
  toggleLinkSel,
  toggleLinksSort,
  toggleMasterSort,
  toggleRosterSort,
  whatsappDoctors,
}) {
    // A visit can carry several service lines; the scalar modality/service on the row is only the first
    // one, so a CT + MRI visit used to look like a CT-only visit.
    const visitModalities = (p) => (Array.isArray(p.serviceLines) && p.serviceLines.length > 0
      ? [...new Set(p.serviceLines.map(l => l.modality).filter(Boolean))].join(' + ')
      : (p.modality || ''));
    const visitServices = (p) => (Array.isArray(p.serviceLines) && p.serviceLines.length > 0
      ? p.serviceLines.map(l => l.serviceName).filter(Boolean).join(' + ')
      : (p.service || ''));
    // A server total across every source (the summary carries no visit rows to count).
    const totalPatientsCount = totalAttendedVisits || 0;
    const totalMissions = referralAggregated.reduce((acc, curr) => acc + curr.patients.length, 0);
    const totalPayout = referralAggregated.reduce((acc, curr) => acc + (curr.totalCommission || 0), 0);
    const paidPayout = referralAggregated.reduce((acc, curr) => acc + (curr.paidCommission || 0), 0);
    const unpaidPayout = totalPayout - paidPayout;
    const totalRevenue = referralAggregated.reduce((acc, curr) => acc + (curr.totalRevenue || 0), 0);

    const topModality = (() => {
       const counts = {};
       referralAggregated.forEach(r => {
          Object.entries(r.modalities).forEach(([mod, count]) => {
             counts[mod] = (counts[mod] || 0) + count;
          });
       });
       const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
       return sorted.length > 0 ? sorted[0][0] : 'N/A';
    })();

    return (
      <div className="referral-intel-view fade-in">
        {/* Level 0 KPIs (Strategic Velocity / Network Payout / Revenue Integrity)
            removed per request. */}

        {/* Level 1: Tactical Control Deck */}
        <div style={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between', 
          alignItems: isMobile ? 'stretch' : 'flex-end', 
          gap: '20px', 
          marginBottom: '30px' 
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              display: 'flex', 
              background: '#f1f5f9', 
              padding: '4px', 
              borderRadius: '12px', 
              border: '1px solid #e2e8f0',
              overflowX: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              gap: '4px'
            }}>
              {['MATRIX', 'LOG', 'ROSTER', 'PATIENTS', 'LINKS', 'CHANNELS'].map(mode => (
                <button 
                  key={mode} 
                  onClick={() => {
                    setReferralViewMode(mode);
                    if (mode === 'PATIENTS') fetchPatientMasterList();
                    // Roster has no "Self" concept — fall back to All so it isn't blanked.
                    if (mode === 'ROSTER' && personTypeFilter === 'SELF') setPersonTypeFilter('ALL');
                  }}
                  style={{ 
                    padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '9px', fontWeight: 950,
                    background: referralViewMode === mode ? 'white' : 'transparent',
                    color: referralViewMode === mode ? '#0f52ba' : '#64748b',
                    boxShadow: referralViewMode === mode ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
                    cursor: 'pointer', transition: 'all 0.2s', letterSpacing: '0.5px',
                    whiteSpace: 'nowrap',
                    flex: isMobile ? '0 0 auto' : 1
                  }}
                >
                  {mode === 'MATRIX' ? 'Source Analytics' : mode === 'LOG' ? 'Case Ledger' : mode === 'ROSTER' ? 'Partner Network' : mode === 'PATIENTS' ? 'Patient Section' : mode === 'CHANNELS' ? 'How They Heard' : 'Doctor Links'}
                </button>
              ))}
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '15px', alignItems: isMobile ? 'stretch' : 'center' }}>
             {/* Unified Search Sub-node (the How They Heard report has nothing to search) */}
             {referralViewMode !== 'CHANNELS' && (
             <div style={{ position: 'relative', width: isMobile ? '100%' : '240px' }}>
                <span style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.3, fontSize: '12px' }}>🔍</span>
                <input 
                  type="text" 
                  placeholder={
                    referralViewMode === 'MATRIX' ? "FILTER ANALYTICS..." : 
                    referralViewMode === 'LOG' ? "SEARCH CASE LEDGER..." : 
                    referralViewMode === 'ROSTER' ? "FILTER NETWORK..." :
                    referralViewMode === 'LINKS' ? "SEARCH DOCTORS..." : "SEARCH PATIENT SECTION..."
                  }
                  value={
                    referralViewMode === 'MATRIX' ? referralMatrixSearch : 
                    referralViewMode === 'LOG' ? referralLogSearch : 
                    referralViewMode === 'ROSTER' ? referralRosterSearch :
                    referralViewMode === 'LINKS' ? referralLinksSearch : referralPatientsSearch
                  }
                  onChange={e => {
                    const str = e.target.value;
                    if (referralViewMode === 'MATRIX') setReferralMatrixSearch(str);
                    else if (referralViewMode === 'LOG') setReferralLogSearch(str);
                    else if (referralViewMode === 'ROSTER') setReferralRosterSearch(str);
                    else if (referralViewMode === 'LINKS') setReferralLinksSearch(str);
                    else setReferralPatientsSearch(str);
                  }}
                  style={{ 
                    width: '100%', padding: '14px 15px 14px 42px', borderRadius: '14px', border: '1px solid #e2e8f0', 
                    fontSize: '11px', fontWeight: 900, background: 'white', outline: 'none', transition: 'all 0.3s'
                  }} 
                />
             </div>
             )}

              {/* Person-type filter (#2) — Doctor / Other / Self (Self only where it applies) */}
              {(referralViewMode === 'MATRIX' || referralViewMode === 'LOG' || referralViewMode === 'ROSTER') && (
                <select
                  value={personTypeFilter}
                  onChange={e => setPersonTypeFilter(e.target.value)}
                  title="Filter by referral source type"
                  style={{ padding: '10px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#0f172a', fontSize: '11px', fontWeight: 900, letterSpacing: '0.3px', cursor: 'pointer', outline: 'none' }}
                >
                  {[['ALL', 'All'], ['DOCTOR', '👨‍⚕️ Doctor'], ['OTHER', '👤 Other'], ...(referralViewMode === 'ROSTER' ? [] : [['SELF', '🏥 Self']])].map(([k, lbl]) => (
                    <option key={k} value={k}>{lbl}</option>
                  ))}
                </select>
              )}

              {/* Hide zero-visit partners (Source Analytics + Case Ledger only - Roster is a directory, not an activity list) */}
              {(referralViewMode === 'MATRIX' || referralViewMode === 'LOG') && (
                <label
                  title="Hide a registered partner that has no visits in this range"
                  style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', background: hideZeroSources ? '#eff6ff' : '#f8fafc', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  <input
                    type="checkbox"
                    checked={hideZeroSources}
                    onChange={e => setHideZeroSources(e.target.checked)}
                    style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#0f52ba' }}
                  />
                  <span style={{ fontSize: '10px', fontWeight: 900, color: hideZeroSources ? '#1d4ed8' : '#64748b', letterSpacing: '0.3px' }}>HIDE 0-VISIT</span>
                </label>
              )}

              {/* Temporal Unit */}
             <div style={{ 
               display: 'flex', 
               background: '#f8fafc', 
               padding: '4px', 
               borderRadius: '16px', 
               border: '1px solid #e2e8f0',
               width: isMobile ? '100%' : 'auto',
               justifyContent: 'space-between'
             }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['SINGLE', 'RANGE', 'ALL'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => {
                        setReferralFilterMode(mode);
                        // SINGLE → today; RANGE → current calendar week.
                        // Both refresh on click so an overnight-open tab
                        // still lands on the correct window the moment the
                        // user touches the toolbar.
                        if (mode === 'SINGLE') {
                          const today = getISODate(0);
                          setReferralRange({ start: today, end: today });
                        } else if (mode === 'RANGE') {
                          const { start, end } = getOverviewDates('WEEK');
                          setReferralRange({ start, end });
                        }
                      }}
                      style={{
                        padding: '10px 18px', borderRadius: '12px', border: 'none', fontSize: '9px', fontWeight: 950,
                        background: referralFilterMode === mode ? '#1e293b' : 'transparent',
                        color: referralFilterMode === mode ? 'white' : '#64748b',
                        cursor: 'pointer', transition: 'all 0.2s', letterSpacing: '1px'
                      }}
                    >
                      {mode === 'SINGLE' ? 'D' : mode === 'RANGE' ? 'R' : 'ALL'}
                    </button>
                  ))}
                </div>
                {referralFilterMode !== 'ALL' && (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', paddingRight: '10px' }}>
                    <input 
                      type="date" 
                      value={referralRange.start} 
                      onChange={e => setReferralRange(prev => ({ ...prev, start: e.target.value }))}
                      style={{ border: 'none', background: 'transparent', fontSize: '11px', fontWeight: 950, color: '#1e293b', outline: 'none' }}
                    />
                    {referralFilterMode === 'RANGE' && (
                      <>
                        <span style={{ fontSize: '12px', color: '#cbd5e1' }}>→</span>
                        <input 
                          type="date" 
                          value={referralRange.end} 
                          onChange={e => setReferralRange(prev => ({ ...prev, end: e.target.value }))}
                          style={{ border: 'none', background: 'transparent', fontSize: '11px', fontWeight: 950, color: '#1e293b', outline: 'none' }}
                        />
                      </>
                    )}
                  </div>
                )}
             </div>

             {/* Tactical Export Node */}
             <div style={{ position: 'relative' }}>
                <button 
                  onClick={() => setShowExportOverlay(!showExportOverlay)}
                  disabled={isExporting}
                  style={{ 
                    padding: '10px 20px', borderRadius: '14px', background: '#f0f3fd', border: '1px solid #0f52ba30',
                    color: '#0f52ba', fontSize: '9px', fontWeight: 950, letterSpacing: '1px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s'
                  }}
                >
                  {isExporting ? 'GENERATING...' : '📥 EXPORT INTEL'}
                </button>

                {showExportOverlay && (
                  <>
                    <div 
                      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, background: 'transparent' }} 
                      onClick={() => setShowExportOverlay(false)}
                    />
                    <div style={{ 
                      position: 'absolute', top: '100%', right: 0, marginTop: '10px', width: '320px', 
                      background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', 
                      boxShadow: '0 10px 40px rgba(0,0,0,0.1)', padding: '25px', zIndex: 1000 
                    }}>
                    <div style={{ fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '2px', marginBottom: '20px' }}>EXPORT PARAMETERS</div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <input 
                            type="checkbox" 
                            checked={exportParams.allTime} 
                            onChange={(e) => setExportParams(prev => ({ ...prev, allTime: e.target.checked }))} 
                            id="export-all-time"
                          />
                          <label htmlFor="export-all-time" style={{ fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>ALL HISTORICAL REFERRALS</label>
                       </div>

                       {!exportParams.allTime && (
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                               <span style={{ fontSize: '9px', fontWeight: 900, color: '#64748b' }}>START DATE</span>
                               <input type="date" value={exportParams.start} onChange={e => setExportParams(prev => ({ ...prev, start: e.target.value }))} style={{ border: '1px solid #e2e8f0', padding: '6px 10px', borderRadius: '8px', fontSize: '11px' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                               <span style={{ fontSize: '9px', fontWeight: 900, color: '#64748b' }}>END DATE</span>
                               <input type="date" value={exportParams.end} onChange={e => setExportParams(prev => ({ ...prev, end: e.target.value }))} style={{ border: '1px solid #e2e8f0', padding: '6px 10px', borderRadius: '8px', fontSize: '11px' }} />
                            </div>
                         </div>
                       )}

                       <button 
                         onClick={handleExportIntelligence}
                         style={{ 
                           marginTop: '10px', padding: '12px', borderRadius: '12px', 
                           background: '#0f52ba', color: 'white', fontWeight: 950, 
                           fontSize: '10px', border: 'none', cursor: 'pointer', letterSpacing: '1px' 
                         }}
                       >
                         {isExporting ? 'Exporting...' : 'Export Data'}
                       </button>
                    </div>
                  </div>
                </>
              )}
             </div>
          </div>
        </div>

        {referralError && (
          <div role="alert" style={{ margin: '0 0 14px', padding: '10px 14px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span>⚠ {referralError}</span>
            {onRetryReferrals && (
              <button type="button" onClick={onRetryReferrals} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #fca5a5', background: 'white', color: '#991b1b', fontWeight: 900, fontSize: '11px', cursor: 'pointer' }}>RETRY</button>
            )}
          </div>
        )}
        {!referralError && referralUpdatedAt && !referralLoading && (
          <div style={{ margin: '0 0 8px', fontSize: '10px', fontWeight: 800, color: '#94a3b8', textAlign: 'right' }}>
            Live · updated {new Date(referralUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}

        {referralLoading ? (
            <div style={{ padding: '120px', textAlign: 'center' }}>
                <div className="pulse-loader"></div>
                <p style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', marginTop: '25px', letterSpacing: '2px' }}>Loading referral data...</p>
            </div>
        ) : (
          <>

            {/* Self / Walk-in is no longer a standalone card — it's folded in as a
                single accumulated row: a card in the Source Analytics referral list
                and a row in the Case Ledger matrix grid. (#20) */}

            {/* Level 3: Dual-Mode Intelligence List */}
            {referralViewMode === 'CHANNELS' ? (
              <PatientSourcesView
                data={channelData?.data}
                loading={!!channelData?.loading}
                error={channelData?.error}
                rangeLabel={channelRangeLabel}
                isMobile={isMobile}
              />
            ) : referralViewMode === 'LINKS' ? (
              <DoctorLinksView
                isMobile={isMobile}
                doctorList={doctorList}
                referralLinksSearch={referralLinksSearch}
                linksSort={linksSort}
                toggleLinksSort={toggleLinksSort}
                selectedLinks={selectedLinks}
                setSelectedLinks={setSelectedLinks}
                toggleLinkSel={toggleLinkSel}
                linksBusy={linksBusy}
                bulkSend={bulkSend}
                setBulkSend={setBulkSend}
                sendSelectedLinks={sendSelectedLinks}
                whatsappDoctors={whatsappDoctors}
                emailDoctors={emailDoctors}
                openLinkSend={openLinkSend}
                copyDoctorLink={copyDoctorLink}
                revokeDoctorLinks={revokeDoctorLinks}
                linkStatus={linkStatus}
                linkSend={linkSend}
                setLinkSend={setLinkSend}
                submitLinkSend={submitLinkSend}
              />
            ) : referralViewMode === 'PATIENTS' ? (
              <div style={{ 
                background: 'white', 
                borderRadius: '24px', 
                border: '1px solid #e2e8f0', 
                overflow: 'hidden',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch'
              }}>
                <div style={{ padding: '20px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', background: '#fcfdfe' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b' }}>Patient Directory</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>All patients linked to referrers</div>
                  </div>
                  <button
                    onClick={handleExportPatientMasterList}
                    style={{ padding: '10px 16px', borderRadius: '12px', background: '#f0f3fd', border: '1px solid #0f52ba30', color: '#0f52ba', fontSize: '9px', fontWeight: 950, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    📥 EXPORT TO EXCEL
                  </button>
                </div>
                {patientMasterError && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '12px 30px', background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#b91c1c' }}>{patientMasterError}</span>
                    <button type="button" onClick={retryPatientMasterList}
                      style={{ padding: '6px 12px', borderRadius: '9px', border: '1px solid #fecaca', background: 'white', color: '#b91c1c', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}>Retry</button>
                  </div>
                )}
                {!isMobile ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '100%' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>ID</th>
                      <th onClick={() => toggleMasterSort('patientIdentifier')} style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: masterSort.key === 'patientIdentifier' ? '#0f52ba' : '#94a3b8', letterSpacing: '1px', cursor: 'pointer', userSelect: 'none' }}>PTID (IDENTIFIER){sortArrow(masterSort, 'patientIdentifier')}</th>
                      <th onClick={() => toggleMasterSort('fullName')} style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: masterSort.key === 'fullName' ? '#0f52ba' : '#94a3b8', letterSpacing: '1px', cursor: 'pointer', userSelect: 'none' }}>FULL NAME{sortArrow(masterSort, 'fullName')}</th>
                      <th onClick={() => toggleMasterSort('mobile')} style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: masterSort.key === 'mobile' ? '#0f52ba' : '#94a3b8', letterSpacing: '1px', cursor: 'pointer', userSelect: 'none' }}>CONTACT NODE{sortArrow(masterSort, 'mobile')}</th>
                      <th onClick={() => toggleMasterSort('age')} style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: masterSort.key === 'age' ? '#0f52ba' : '#94a3b8', letterSpacing: '1px', cursor: 'pointer', userSelect: 'none' }}>AGE / GENDER{sortArrow(masterSort, 'age')}</th>
                      <th onClick={() => toggleMasterSort('address')} style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: masterSort.key === 'address' ? '#0f52ba' : '#94a3b8', letterSpacing: '1px', cursor: 'pointer', userSelect: 'none' }}>ADDRESS{sortArrow(masterSort, 'address')}</th>
                      <th onClick={() => toggleMasterSort('sourceOfInfo')} style={{ padding: '20px 30px', textAlign: 'left', fontSize: '10px', fontWeight: 950, color: masterSort.key === 'sourceOfInfo' ? '#0f52ba' : '#94a3b8', letterSpacing: '1px', cursor: 'pointer', userSelect: 'none' }}>SOURCE OF INFO{sortArrow(masterSort, 'sourceOfInfo')}</th>
                      <th onClick={() => toggleMasterSort('registeredAt')} style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: masterSort.key === 'registeredAt' ? '#0f52ba' : '#94a3b8', letterSpacing: '1px', cursor: 'pointer', userSelect: 'none' }}>REG DATE{sortArrow(masterSort, 'registeredAt')}</th>
                      <th style={{ padding: '20px 30px', textAlign: 'right', fontSize: '10px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingMaster ? (
                       <tr><td colSpan="9" style={{ padding: '60px', textAlign: 'center' }}><div className="pulse-loader" style={{ margin: '0 auto' }}></div></td></tr>
                    ) : patientMasterList.length === 0 ? (
                      <tr>
                        <td colSpan="9" style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>NO REGISTERED PATIENTS FOUND FOR THIS PERIOD</td>
                      </tr>
                    ) : (
                      sortedMaster.map((p, i) => (
                        <tr key={p.patientId} style={{ borderBottom: '1px solid #f1f5f9', transition: 'all 0.2s' }}>
                          <td style={{ padding: '20px 30px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 950, color: '#94a3b8' }}>#{i + 1}</div>
                          </td>
                          <td style={{ padding: '20px 30px' }}>
                            <div style={{ padding: '4px 10px', background: '#f0f3fd', color: '#0f52ba', borderRadius: '6px', fontSize: '10px', fontWeight: 950, display: 'inline-block' }}>{p.patientIdentifier || 'UNSET'}</div>
                          </td>
                          <td style={{ padding: '20px 30px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 850, color: '#1e293b' }}>{(p.fullName || 'Unknown').toUpperCase()}</div>
                          </td>
                          <td style={{ padding: '20px 30px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>{p.mobile}</div>
                          </td>
                          <td style={{ padding: '20px 30px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>{formatPatientAge(p.age)} / {(p.gender || 'U').toUpperCase()}</div>
                          </td>
                          <td style={{ padding: '20px 30px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>{[p.address, p.village, p.district].filter(Boolean).join(', ') || '—'}</div>
                          </td>
                          <td style={{ padding: '20px 30px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>{p.sourceOfInfo || '—'}</div>
                          </td>
                          <td style={{ padding: '20px 30px', textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', fontWeight: 900, color: '#0f52ba' }}>{new Date(p.registeredAt).toLocaleDateString()}</div>
                          </td>
                          <td style={{ padding: '20px 30px', textAlign: 'right' }}>
                             <button 
                               onClick={() => {
                                 const { value: ageVal, unit: ageUnitVal } = parsePatientAge(p.age);
                                 setEditingPatient({
                                   patientId: p.patientId,
                                   fullName: p.fullName,
                                   mobile: p.mobile,
                                   age: p.age,
                                   ageValue: ageVal || '',
                                   ageUnit: ageUnitVal || 'Y',
                                   gender: p.gender,
                                   village: p.village,
                                   block: p.block || '',
                                   district: p.district,
                                   address: p.address,
                                   sourceOfInfo: p.sourceOfInfo
                                 });
                                 setIsPatientEditDrawerOpen(true);
                               }}
                               style={{ 
                                 padding: '4px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', 
                                 borderRadius: '6px', fontSize: '9px', fontWeight: 950, color: '#0f52ba', 
                                 cursor: 'pointer', transition: 'all 0.2s' 
                                }}
                             >
                               EDIT
                             </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px', background: '#f8fafc' }}>
                    {loadingMaster ? (
                       <div style={{ padding: '60px', textAlign: 'center' }}><div className="pulse-loader" style={{ margin: '0 auto' }}></div></div>
                    ) : patientMasterList.length === 0 ? (
                       <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>NO REGISTERED PATIENTS FOUND FOR THIS PERIOD</div>
                    ) : (
                       sortedMaster.map((p, i) => (
                         <div key={p.patientId} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                               <div style={{ fontSize: '12px', fontWeight: 950, color: '#94a3b8' }}>#{i + 1}</div>
                               <div style={{ padding: '4px 10px', background: '#f0f3fd', color: '#0f52ba', borderRadius: '6px', fontSize: '10px', fontWeight: 950 }}>{p.patientIdentifier || 'UNSET'}</div>
                            </div>
                            <div>
                               <div style={{ fontSize: '14px', fontWeight: 850, color: '#1e293b' }}>{(p.fullName || 'Unknown').toUpperCase()}</div>
                               <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b', marginTop: '4px' }}>{formatPatientAge(p.age)} / {(p.gender || 'U').toUpperCase()}</div>
                               <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginTop: '4px' }}>{p.mobile}</div>
                               <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginTop: '4px' }}>📍 {[p.address, p.village, p.district].filter(Boolean).join(', ') || 'No address'}</div>
                               <div style={{ fontSize: '10px', fontWeight: 800, color: '#0f52ba', marginTop: '4px' }}>Source: {p.sourceOfInfo || 'Unknown'}</div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', paddingTop: '12px', borderTop: '1px dashed #e2e8f0' }}>
                               <div style={{ fontSize: '11px', fontWeight: 900, color: '#0f52ba' }}>{new Date(p.registeredAt).toLocaleDateString()}</div>
                               <button 
                                 onClick={() => {
                                   const { value: ageVal, unit: ageUnitVal } = parsePatientAge(p.age);
                                   setEditingPatient({
                                     patientId: p.patientId,
                                     fullName: p.fullName,
                                     mobile: p.mobile,
                                     age: p.age,
                                     ageValue: ageVal || '',
                                     ageUnit: ageUnitVal || 'Y',
                                     gender: p.gender,
                                     village: p.village,
                                     block: p.block || '',
                                     district: p.district,
                                     address: p.address,
                                     sourceOfInfo: p.sourceOfInfo
                                   });
                                   setIsPatientEditDrawerOpen(true);
                                 }}
                                 style={{ 
                                   padding: '6px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', 
                                   borderRadius: '8px', fontSize: '10px', fontWeight: 950, color: '#0f52ba', cursor: 'pointer' 
                                 }}
                               >EDIT</button>
                            </div>
                         </div>
                       ))
                    )}
                  </div>
                )}
              </div>
            ) : referralViewMode === 'ROSTER' ? (
              <div style={{ 
                background: 'white', 
                borderRadius: '24px', 
                border: '1px solid #e2e8f0', 
                overflow: 'hidden',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch'
              }}>
                <div style={{ padding: isMobile ? '18px' : '25px 30px', borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', background: '#fcfdfe', position: 'sticky', left: 0 }}>
                   <div>
                     <div style={{ fontSize: '15px', fontWeight: 950, color: '#0f172a', letterSpacing: '-0.2px' }}>Partner Network</div>
                     <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginTop: '2px' }}>
                       Everyone who refers patients to you, and what you owe them.
                     </div>
                   </div>
                   <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                     <button
                       onClick={() => {
                         setEditingReferrer({ name: '', contact: '', address: '', isDoctor: true });
                         setIsReferrerEditDrawerOpen(true);
                       }}
                       style={{ padding: '10px 18px', borderRadius: '12px', background: '#0f52ba', color: 'white', fontSize: '12px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', border: 'none', boxShadow: '0 4px 12px rgba(15,82,186,0.25)' }}
                     >
                       <span style={{ fontSize: '14px' }}>＋</span> Add Partner
                     </button>
                     <button
                       onClick={openBulkAdd}
                       style={{ padding: '10px 18px', borderRadius: '12px', background: 'white', color: '#0f52ba', fontSize: '12px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #bfdbfe' }}
                     >
                       <span style={{ fontSize: '14px' }}>⇪</span> Upload Excel
                     </button>
                     <button
                       onClick={handleExportRoster}
                       style={{ padding: '10px 18px', borderRadius: '12px', background: '#f0f3fd', border: '1px solid #bfdbfe', color: '#0f52ba', fontSize: '12px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                     >
                       <span style={{ fontSize: '14px' }}>⬇</span> Download for Excel
                     </button>
                   </div>
                </div>
                {!isMobile ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '100%' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '10px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px' }}>#</th>
                      <th onClick={() => toggleRosterSort('name')} style={{ padding: '16px 24px', textAlign: 'left', fontSize: '10px', fontWeight: 800, color: rosterSort.key === 'name' ? '#0f52ba' : '#94a3b8', letterSpacing: '0.5px', cursor: 'pointer', userSelect: 'none' }}>Partner{sortArrow(rosterSort, 'name')}</th>
                      <th onClick={() => toggleRosterSort('isDoctor')} style={{ padding: '16px 24px', textAlign: 'left', fontSize: '10px', fontWeight: 800, color: rosterSort.key === 'isDoctor' ? '#0f52ba' : '#94a3b8', letterSpacing: '0.5px', cursor: 'pointer', userSelect: 'none' }}>Type{sortArrow(rosterSort, 'isDoctor')}</th>
                      <th onClick={() => toggleRosterSort('contact')} style={{ padding: '16px 24px', textAlign: 'left', fontSize: '10px', fontWeight: 800, color: rosterSort.key === 'contact' ? '#0f52ba' : '#94a3b8', letterSpacing: '0.5px', cursor: 'pointer', userSelect: 'none' }}>Contact{sortArrow(rosterSort, 'contact')}</th>
                      <th onClick={() => toggleRosterSort('email')} style={{ padding: '16px 24px', textAlign: 'left', fontSize: '10px', fontWeight: 800, color: rosterSort.key === 'email' ? '#0f52ba' : '#94a3b8', letterSpacing: '0.5px', cursor: 'pointer', userSelect: 'none' }}>Email{sortArrow(rosterSort, 'email')}</th>
                      <th onClick={() => toggleRosterSort('address')} style={{ padding: '16px 24px', textAlign: 'left', fontSize: '10px', fontWeight: 800, color: rosterSort.key === 'address' ? '#0f52ba' : '#94a3b8', letterSpacing: '0.5px', cursor: 'pointer', userSelect: 'none' }}>Address{sortArrow(rosterSort, 'address')}</th>
                      <th onClick={() => toggleRosterSort('patientCount')} style={{ padding: '16px 24px', textAlign: 'right', fontSize: '10px', fontWeight: 800, color: rosterSort.key === 'patientCount' ? '#0f52ba' : '#94a3b8', letterSpacing: '0.5px', cursor: 'pointer', userSelect: 'none' }}>Studies{sortArrow(rosterSort, 'patientCount')}</th>
                      <th onClick={() => toggleRosterSort('totalCommission')} style={{ padding: '16px 24px', textAlign: 'right', fontSize: '10px', fontWeight: 800, color: rosterSort.key === 'totalCommission' ? '#0f52ba' : '#94a3b8', letterSpacing: '0.5px', cursor: 'pointer', userSelect: 'none' }}>Total Commission{sortArrow(rosterSort, 'totalCommission')}</th>
                      <th onClick={() => toggleRosterSort('paidCommission')} style={{ padding: '16px 24px', textAlign: 'right', fontSize: '10px', fontWeight: 800, color: rosterSort.key === 'paidCommission' ? '#0f52ba' : '#16a34a', letterSpacing: '0.5px', cursor: 'pointer', userSelect: 'none' }}>Total Paid Incentive{sortArrow(rosterSort, 'paidCommission')}</th>
                      <th onClick={() => toggleRosterSort('unpaidCommission')} style={{ padding: '16px 24px', textAlign: 'right', fontSize: '10px', fontWeight: 800, color: rosterSort.key === 'unpaidCommission' ? '#0f52ba' : '#94a3b8', letterSpacing: '0.5px', cursor: 'pointer', userSelect: 'none' }}>Unpaid{sortArrow(rosterSort, 'unpaidCommission')}</th>
                      <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: '10px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.5px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {caseLedgerList.length === 0 ? (
                      <tr>
                        <td colSpan="11" style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', fontWeight: 700 }}>No partners yet. Click “Add Partner” to add your first referring doctor or person.</td>
                      </tr>
                    ) : (
                        sortedRoster
                          .filter(s => !referralRosterSearch || s.name.toLowerCase().includes(referralRosterSearch.toLowerCase()))
                          .map((s, i) => (
                          <tr key={s.name || s.referrerId} style={{ borderBottom: '1px solid #f1f5f9', opacity: s.mergedIntoId ? 0.6 : 1 }}
                              onMouseOver={e => e.currentTarget.style.background = '#fafcff'}
                              onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                            <td style={{ padding: '16px 24px', paddingLeft: s.mergedIntoId ? '40px' : '24px' }}>
                              {s.mergedIntoId ? (
                                <div style={{ textAlign: 'center', color: '#cbd5e1', fontWeight: 900, fontSize: '16px' }}>↳</div>
                              ) : (
                                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: i < 3 ? '#f0f3fd' : '#f8fafc', color: i < 3 ? '#0f52ba' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900 }}>{i + 1}</div>
                              )}
                            </td>
                            <td style={{ padding: '16px 24px' }}>
                              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {s.name || 'Unnamed'}
                                {s.mergedIntoId && <span style={{ fontSize: '9px', fontWeight: 800, background: '#fef2f2', color: '#ef4444', padding: '2px 6px', borderRadius: '4px' }}>Merged Alias</span>}
                              </div>
                            {(s.specialty || s.degree || s.supportedByDoctor || getReferrerProfileCompletion(s).pct < 100) && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px', flexWrap: 'wrap' }}>
                                {s.isDoctor && (s.specialty || s.degree) && (
                                  <span style={{ fontSize: '9px', fontWeight: 600, color: '#64748b' }}>{[s.specialty, s.degree].filter(Boolean).join(' · ')}</span>
                                )}
                                {!s.isDoctor && s.supportedByDoctor && (
                                  <span style={{ fontSize: '9px', fontWeight: 600, color: '#64748b' }}>refers for Dr. {s.supportedByDoctor}</span>
                                )}
                                {(() => { const c = getReferrerProfileCompletion(s); return c.pct < 100 ? (
                                  <span title={`Profile ${c.pct}% complete — add: ${c.missing.join(', ')}`} style={{ fontSize: '9px', fontWeight: 900, padding: '2px 8px', borderRadius: '999px', background: '#fff7ed', color: completionColor(c.pct), border: `1px solid ${completionColor(c.pct)}33` }}>{c.pct}% profile</span>
                                ) : null; })()}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '16px 24px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, padding: '3px 9px', borderRadius: '999px', background: s.isDoctor ? '#eff6ff' : '#fef3c7', color: s.isDoctor ? '#1d4ed8' : '#b45309', whiteSpace: 'nowrap' }}>
                              {s.isDoctor ? '👨‍⚕️ Doctor' : '👤 Other person'}
                            </span>
                          </td>
                          <td style={{ padding: '16px 24px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>{s.contact || '—'}</div>
                          </td>
                          <td style={{ padding: '16px 24px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>{s.email || '—'}</div>
                          </td>
                          <td style={{ padding: '16px 24px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>{s.address || '—'}</div>
                          </td>
                          <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                            <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>{s.patientCount || 0}</div>
                          </td>
                          <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                            <div style={{ fontSize: '14px', fontWeight: 900, color: '#0f52ba' }}>₹{(s.totalCommission || 0).toLocaleString()}</div>
                          </td>
                          <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                            <div style={{ fontSize: '14px', fontWeight: 900, color: s.paidCommission > 0 ? '#16a34a' : '#94a3b8' }}>₹{(s.paidCommission || 0).toLocaleString()}</div>
                          </td>
                          <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                            <div style={{ fontSize: '14px', fontWeight: 900, color: s.unpaidCommission > 0 ? '#b45309' : '#94a3b8' }}>₹{(s.unpaidCommission || 0).toLocaleString()}</div>
                          </td>
                          <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '8px' }}>
                              <button
                                onClick={() => {
                                   setEditingReferrer(s);
                                   setIsReferrerEditDrawerOpen(true);
                                }}
                                style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#0f52ba', fontSize: '10px', fontWeight: 800, cursor: 'pointer' }}
                              >
                                Edit
                              </button>
                              {s.mergedIntoId ? (
                                <button
                                  onClick={() => handleUnmergeReferrer(s.referrerId, s.name)}
                                  title="Revert Merge"
                                  style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #fcd34d', background: '#fffbeb', color: '#d97706', fontSize: '10px', fontWeight: 800, cursor: 'pointer' }}
                                >
                                  Unmerge
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                     setEditingReferrer(s);
                                     setIsMergeModalOpen(true);
                                     setDeleteAfterMerge(false);
                                  }}
                                  title="Merge another partner into this one"
                                  style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: '10px', fontWeight: 800, cursor: 'pointer' }}
                                >
                                  Merge
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteReferrer(s)}
                                title="Delete partner"
                                style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #fecaca', background: 'white', color: '#dc2626', fontSize: '10px', fontWeight: 800, cursor: 'pointer' }}
                              >
                                Delete
                              </button>
                            </div>
                           </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px', background: '#f8fafc' }}>
                    {caseLedgerList.length === 0 ? (
                       <div style={{ padding: '50px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', fontWeight: 700 }}>No partners yet. Tap “Add Partner” to add your first referring doctor or person.</div>
                    ) : (
                        sortedRoster
                          .filter(s => !referralRosterSearch || s.name.toLowerCase().includes(referralRosterSearch.toLowerCase()))
                          .map((s, i) => (
                            <div key={s.name || s.referrerId} style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', opacity: s.mergedIntoId ? 0.7 : 1, marginLeft: s.mergedIntoId ? '20px' : '0' }}>
                               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                    {!s.mergedIntoId ? (
                                      <div style={{ width: '26px', height: '26px', borderRadius: '8px', background: i < 3 ? '#f0f3fd' : '#f8fafc', color: i < 3 ? '#0f52ba' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, flexShrink: 0 }}>{i + 1}</div>
                                    ) : (
                                      <div style={{ color: '#cbd5e1', fontWeight: 900, fontSize: '16px', marginLeft: '6px' }}>↳</div>
                                    )}
                                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      {s.name || 'Unnamed'}
                                      {s.mergedIntoId && <span style={{ fontSize: '9px', fontWeight: 800, background: '#fef2f2', color: '#ef4444', padding: '2px 6px', borderRadius: '4px' }}>Merged Alias</span>}
                                    </div>
                                 </div>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                   <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 8px', borderRadius: '999px', background: s.isDoctor ? '#eff6ff' : '#fef3c7', color: s.isDoctor ? '#1d4ed8' : '#b45309' }}>
                                     {s.isDoctor ? '👨‍⚕️ Doctor' : '👤 Other person'}
                                   </span>
                                   {s.isDoctor && (s.specialty || s.degree) && (
                                     <span style={{ fontSize: '9px', fontWeight: 600, color: '#64748b' }}>{[s.specialty, s.degree].filter(Boolean).join(' · ')}</span>
                                   )}
                                   {!s.isDoctor && s.supportedByDoctor && (
                                     <span style={{ fontSize: '9px', fontWeight: 600, color: '#64748b' }}>refers for Dr. {s.supportedByDoctor}</span>
                                   )}
                                   {(() => { const c = getReferrerProfileCompletion(s); return c.pct < 100 ? (
                                     <span title={`Profile ${c.pct}% complete — add: ${c.missing.join(', ')}`} style={{ fontSize: '9px', fontWeight: 900, padding: '2px 8px', borderRadius: '999px', background: '#fff7ed', color: completionColor(c.pct), border: `1px solid ${completionColor(c.pct)}33` }}>{c.pct}% profile</span>
                                   ) : null; })()}
                                 </div>
                                 <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>{s.contact || '—'}{s.email ? ` · ${s.email}` : ''}</div>
                                 {s.address && <div style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8' }}>📍 {s.address}</div>}
                              </div>
                              {/* Financials row */}
                              <div style={{ display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px dashed #e2e8f0' }}>
                                 <div style={{ flex: 1, textAlign: 'center' }}>
                                   <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>{s.patientCount || 0}</div>
                                   <div style={{ fontSize: '8px', fontWeight: 700, color: '#94a3b8' }}>Studies</div>
                                 </div>
                                 <div style={{ flex: 1, textAlign: 'center' }}>
                                   <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f52ba' }}>₹{(s.totalCommission || 0).toLocaleString()}</div>
                                   <div style={{ fontSize: '8px', fontWeight: 700, color: '#94a3b8' }}>Commission</div>
                                 </div>
                                 <div style={{ flex: 1, textAlign: 'center' }}>
                                   <div style={{ fontSize: '15px', fontWeight: 900, color: s.paidCommission > 0 ? '#16a34a' : '#94a3b8' }}>₹{(s.paidCommission || 0).toLocaleString()}</div>
                                   <div style={{ fontSize: '8px', fontWeight: 700, color: '#94a3b8' }}>Paid</div>
                                 </div>
                                 <div style={{ flex: 1, textAlign: 'center' }}>
                                   <div style={{ fontSize: '15px', fontWeight: 900, color: s.unpaidCommission > 0 ? '#b45309' : '#94a3b8' }}>₹{(s.unpaidCommission || 0).toLocaleString()}</div>
                                   <div style={{ fontSize: '8px', fontWeight: 700, color: '#94a3b8' }}>Unpaid</div>
                                 </div>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                 <button
                                   onClick={() => { setEditingReferrer(s); setIsReferrerEditDrawerOpen(true); }}
                                   style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#0f52ba', fontSize: '11px', fontWeight: 800, cursor: 'pointer', minWidth: '60px' }}
                                 >
                                   Edit
                                 </button>
                                 {s.mergedIntoId ? (
                                   <button
                                     onClick={() => handleUnmergeReferrer(s.referrerId, s.name)}
                                     style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #fcd34d', background: '#fffbeb', color: '#d97706', fontSize: '11px', fontWeight: 800, cursor: 'pointer', minWidth: '60px' }}
                                   >
                                     Unmerge
                                   </button>
                                 ) : (
                                   <button
                                     onClick={() => { setEditingReferrer(s); setIsMergeModalOpen(true); setDeleteAfterMerge(false); }}
                                     style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: '11px', fontWeight: 800, cursor: 'pointer', minWidth: '60px' }}
                                   >
                                     Merge
                                   </button>
                                 )}
                                 <button
                                   onClick={() => handleDeleteReferrer(s)}
                                   style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #fecaca', background: 'white', color: '#dc2626', fontSize: '11px', fontWeight: 800, cursor: 'pointer', minWidth: '60px' }}
                                 >
                                   Delete
                                 </button>
                              </div>
                           </div>
                         ))
                    )}
                  </div>
                )}
              </div>
            ) : referralViewMode === 'MATRIX' ? (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '350px 1fr', gap: '30px', alignItems: 'flex-start' }}>
                {/* Master Pane: Intelligence Roster */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.5px', marginBottom: '5px' }}>Referral List</div>
                  {referralAggregated.map((s, i) => {
                    const isSelected = expandedReferrer === s.referrerId;
                    return (
                      <div 
                        key={s.referrerId || s.name} 
                        onClick={() => setExpandedReferrer(s.referrerId)}
                        style={{ 
                          background: isSelected ? '#f0f3fd' : 'white', 
                          padding: '20px 25px', borderRadius: '18px', border: isSelected ? '1px solid #0f52ba' : '1px solid #e2e8f0', 
                          cursor: 'pointer', transition: 'all 0.2s', position: 'relative', overflow: 'hidden'
                        }}
                      >
                        {isSelected && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: '#0f52ba' }}></div>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                             <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: isSelected ? 'white' : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', border: '1px solid #f1f5f9' }}>👤</div>
                             <div>
                                <div style={{ fontSize: '12px', fontWeight: 950, color: isSelected ? '#0f52ba' : '#1e293b' }}>{(s.name || 'Anonymous').toUpperCase()}</div>
                                <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 800 }}>{referralSort?.key && referralSort.key !== 'name' ? `RANK #${i + 1} • ` : ''}{s.totalPatients} {s.totalPatients === 1 ? 'VISIT' : 'VISITS'}{(s.noShows || s.bookedPending) ? ` • ${s.noShows ? `${s.noShows} NO-SHOW` : ''}${s.noShows && s.bookedPending ? ' • ' : ''}${s.bookedPending ? `${s.bookedPending} BOOKED` : ''}` : ''}</div>
                                 <div style={{ display: 'flex', gap: '8px', marginTop: '5px' }}>
                                    <div style={{ fontSize: '8px', fontWeight: 950, color: '#059669' }}>₹{(s.paidCommission || 0).toLocaleString()} PAID</div>
                                    <div style={{ fontSize: '8px', fontWeight: 950, color: '#dc2626' }}>₹{(s.unpaidCommission || 0).toLocaleString()} PENDING</div>
                                 </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                                   <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 850 }}>{s.contact}</div>
                                   <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{s.address}</div>
                                </div>
                             </div>
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 950, color: isSelected ? '#0f52ba' : '#cbd5e1' }}>→</div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Self / Walk-in — one accumulated row in the referral list
                      (direct patients, no commission). Replaces the old card. */}
                  {(personTypeFilter === 'ALL' || personTypeFilter === 'SELF') && selfSummary && selfSummary.patientCount > 0 && (
                    <div style={{ background: 'white', padding: '20px 25px', borderRadius: '18px', border: '1px dashed #cbd5e1' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', border: '1px solid #f1f5f9' }}>🏥</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '12px', fontWeight: 950, color: '#1e293b' }}>SELF / WALK-IN</div>
                          <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 800 }}>{selfSummary.patientCount} DIRECT PATIENTS • NO COMMISSION</div>
                          <div style={{ display: 'flex', gap: '12px', marginTop: '5px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 950, color: '#059669' }}>₹{(selfSummary.totalRevenue || 0).toLocaleString()} REVENUE</div>
                            <div style={{ fontSize: '9px', fontWeight: 950, color: '#dc2626' }}>₹{(selfSummary.totalDiscount || 0).toLocaleString()} DISCOUNT</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* UNLINKED sources: a referrer NAME typed on visits with no partner record. They used to be
                      folded into Self / Walk-in or dropped; listed here so their visits are counted and can be fixed. */}
                  {personTypeFilter === 'ALL' && unlinkedSources && unlinkedSources.length > 0 && (
                    <div style={{ background: '#fffbeb', padding: '16px 22px', borderRadius: '18px', border: '1px dashed #fcd34d' }}>
                      <div style={{ fontSize: '11px', fontWeight: 950, color: '#92400e' }}>UNLINKED SOURCES</div>
                      <div style={{ fontSize: '9px', color: '#b45309', fontWeight: 800, marginTop: '2px', lineHeight: 1.45 }}>
                        Referrer names typed on visits that have no partner record. Add them as partners so their visits and payouts can be tracked.
                      </div>
                      {unlinkedSources.map(u => (
                        <div key={u.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '8px', fontSize: '11px', fontWeight: 850, color: '#78350f' }}>
                          <span>{(u.name || '').toUpperCase()}</span>
                          <span>{u.totalPatients} {u.totalPatients === 1 ? 'visit' : 'visits'}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* UNATTRIBUTED: attended visits with no referrer recorded at all - missing data made visible. */}
                  {personTypeFilter === 'ALL' && unattributedSummary && unattributedSummary.patientCount > 0 && (
                    <div style={{ background: '#fef2f2', padding: '16px 22px', borderRadius: '18px', border: '1px dashed #fca5a5' }}>
                      <div style={{ fontSize: '11px', fontWeight: 950, color: '#991b1b' }}>NO SOURCE RECORDED</div>
                      <div style={{ fontSize: '10px', color: '#b91c1c', fontWeight: 800, marginTop: '3px', lineHeight: 1.45 }}>
                        {unattributedSummary.patientCount} attended {unattributedSummary.patientCount === 1 ? 'visit has' : 'visits have'} no referrer at all, so they cannot be credited to anyone.
                        Fill in "Referred By" on those appointments.
                      </div>
                    </div>
                  )}
                </div>

                {/* Detail Pane: Referral Briefing */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {expandedReferrer ? (
                    (() => {
                      const selected = referralAggregated.find(r => r.referrerId === expandedReferrer);
                      if (!selected) return null;
                      const percentage = totalPatientsCount > 0 ? (selected.totalPatients / totalPatientsCount) * 100 : 0;

return (
                        <div style={{ background: 'white', borderRadius: '30px', border: '1px solid #e2e8f0', overflow: isTestMode ? 'visible' : 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.02)' }}>
                          <div style={{ padding: '35px 40px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', background: '#fcfdfe' }}>
                             <div>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: '#0f52ba', letterSpacing: '0', marginBottom: '8px' }}>Referral Summary</div>
                                <div style={{ fontSize: '22px', fontWeight: 950, color: '#1e293b', letterSpacing: '-0.5px' }}>{(selected.name || 'Anonymous').toUpperCase()}</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '15px' }}>
                                    <div style={{ padding: '6px 12px', background: '#eff6ff', borderRadius: '8px', fontSize: '10px', fontWeight: 950, color: '#2563eb' }}>
                                       {selected.totalPatients} {selected.totalPatients === 1 ? 'Visit' : 'Visits'}
                                    </div>
                                    <div style={{ padding: '6px 12px', background: '#ecfdf5', borderRadius: '8px', fontSize: '10px', fontWeight: 950, color: '#059669' }}>
                                       ₹{(selected.totalRevenue || 0).toLocaleString()} Billed
                                    </div>
                                    <div title="Cash actually received against these visits' invoices" style={{ padding: '6px 12px', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '8px', fontSize: '10px', fontWeight: 950, color: '#0f766e' }}>
                                       ₹{(selected.totalCollected || 0).toLocaleString()} Collected
                                    </div>
                                    {(selected.bookedPending > 0 || selected.noShows > 0) && (
                                      <div title="Booked appointments that are not counted as visits: still ahead, or in the past and never arrived" style={{ padding: '6px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '10px', fontWeight: 950, color: '#64748b' }}>
                                         {selected.bookedPending || 0} booked · {selected.noShows || 0} no-show
                                      </div>
                                    )}
                                    <div style={{ padding: '6px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '10px', fontWeight: 950, color: '#d97706' }}>
                                       ₹{(selected.totalDiscount || 0).toLocaleString()} DISCOUNT
                                    </div>
                                    <div style={{ padding: '6px 12px', background: '#eff6ff', borderRadius: '8px', fontSize: '10px', fontWeight: 950, color: '#2563eb' }}>
                                       ₹{(selected.paidCommission || 0).toLocaleString()} Comm. Paid
                                    </div>
                                    <div style={{ padding: '6px 12px', background: '#fef2f2', borderRadius: '8px', fontSize: '10px', fontWeight: 950, color: '#dc2626' }}>
                                       ₹{(selected.unpaidCommission || 0).toLocaleString()} Comm. Due
                                    </div>
                                    <div style={{ padding: '6px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '10px', fontWeight: 950, color: '#16a34a' }}>
                                       ₹{(selected.netProfit || 0).toLocaleString()} BILLED − COMMISSION
                                    </div>
                                 </div>
                             </div>
                             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: isMobile ? 'flex-start' : 'flex-end', maxWidth: isMobile ? '100%' : '300px', marginTop: isMobile ? '20px' : 0 }}>
                                <div style={{ textAlign: 'center', minWidth: '80px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc' }}>
                                   <div style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba' }}>₹{(selected.totalCommission || 0).toLocaleString()}</div>
                                   <div style={{ fontSize: '8px', fontWeight: 800, color: '#94a3b8' }}>Commission Total</div>
                                </div>
                                {Object.entries(selected.modalities).map(([mod, count]) => (
                                   <div key={mod} style={{ textAlign: 'center', minWidth: '60px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '12px', background: 'white' }}>
                                      <div style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>{count}</div>
                                      <div style={{ fontSize: '8px', fontWeight: 800, color: '#94a3b8' }}>{mod}</div>
                                   </div>
                                ))}
                             </div>
                          </div>

                           {/* Physician PRM ROI & Loyalty Console */}
                           <div style={{ padding: '0 30px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px', marginTop: '10px', marginBottom: '10px' }}>
                              {/* ROI Multiplier Card */}
                              {(() => {
                                 // A source with NO commission (none configured, or its visits are not billed yet) has no meaningful
                                 // return ratio. It used to be labelled "HIGH MARGIN PARTNER" - which is how a partner whose
                                 // commission simply hadn't been generated looked like the best one.
                                 const hasCommission = (Number(selected.totalCommission) || 0) > 0;
                                 const roiValue = hasCommission ? (selected.totalRevenue / selected.totalCommission) : null;
                                 const isInfinite = !hasCommission;
                                 const roiLabel = isInfinite ? 'No commission' : `${roiValue.toFixed(1)}x`;
                                 const statusColor = isInfinite ? '#94a3b8' : roiValue >= 8.0 ? '#10b981' : roiValue >= 4.0 ? '#3b82f6' : '#ea580c';
                                 const statusText = isInfinite ? 'NOT ENOUGH DATA' : roiValue >= 8.0 ? 'HIGH MARGIN PARTNER 🌟' : roiValue >= 4.0 ? 'SOLID PERFORMER 👍' : 'LOW MARGIN AWARENESS ⚠️';
                                 
                                 return (
                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Physician ROI Multiplier</span>
                                          <span style={{ fontSize: '8px', fontWeight: 950, color: statusColor, background: 'white', padding: '3px 8px', borderRadius: '6px', border: '1px solid', borderColor: statusColor }}>
                                             {statusText}
                                          </span>
                                       </div>
                                       <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                          <span style={{ fontSize: '28px', fontWeight: 950, color: '#1e293b' }}>{roiLabel}</span>
                                          <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>RETURN RATIO</span>
                                       </div>
                                       <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 650, lineHeight: '1.4' }}>
                                          {isInfinite
                                            ? 'No commission has been generated for this source in this period (none is configured, or the visits are not billed yet), so a return ratio cannot be worked out.'
                                            : <>This source generates <strong style={{ color: '#1e293b' }}>₹{roiValue.toFixed(1)}</strong> in billed revenue for every ₹1 of commission.</>}
                                       </div>
                                    </div>
                                 );
                              })()}

                              {/* Cohort Loyalty & Acquisition Card */}
                              {(() => {
                                 // Real facts from the server: a NEW patient is one whose first-ever attended visit at the
                                 // centre is one of these visits; every other visit is a repeat. (This used to match on
                                 // the patient NAME within the selected date range - two different people called RAM KUMAR
                                 // counted as one, and anyone seen once in the range counted as "new" even if they had
                                 // been coming for years.) An older API falls back to distinct patient ids.
                                 const totalScans = selected.totalPatients;
                                 const uniqueCount = selected.uniquePatients ?? new Set((selected.patients || []).map(p => p.patientId)).size;
                                 const newCount = selected.newPatients ?? uniqueCount;
                                 const repeatCount = selected.returningVisits ?? Math.max(0, totalScans - newCount);
                                 const repeatPercentage = totalScans > 0 ? (repeatCount / totalScans) * 100 : 0;
                                 
                                 return (
                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <span style={{ fontSize: '9px', fontWeight: 950, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Patient Acquisition & Loyalty</span>
                                          <span style={{ fontSize: '8px', fontWeight: 950, color: '#3b82f6', background: 'white', padding: '3px 8px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                                             REPEAT VISITS: {repeatPercentage.toFixed(0)}%
                                          </span>
                                       </div>
                                       <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                          <span style={{ fontSize: '28px', fontWeight: 950, color: '#1e293b' }}>{newCount} <span style={{ fontSize: '14px', fontWeight: 700, color: '#94a3b8' }}>/ {uniqueCount}</span></span>
                                          <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>NEW PATIENTS OF {uniqueCount} SEEN</span>
                                       </div>
                                       <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontWeight: 900, color: '#64748b' }}>
                                             <span>Acquisition Stream</span>
                                             <span>{newCount} New • {repeatCount} Repeat visits</span>
                                          </div>
                                          <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                                             <div style={{ width: `${totalScans > 0 ? (newCount / totalScans) * 100 : 0}%`, height: '100%', background: '#3b82f6' }}></div>
                                             <div style={{ width: `${totalScans > 0 ? (repeatCount / totalScans) * 100 : 0}%`, height: '100%', background: '#10b981' }}></div>
                                          </div>
                                       </div>
                                    </div>
                                 );
                              })()}
                           </div>

                          <div style={{ padding: '30px' }}>
                             {/* Referral Case Table Selection Hub */}
                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 500, color: '#64748b', letterSpacing: '0' }}>
                                   {selectedLedgerRows.length > 0 ? `${selectedLedgerRows.length} records selected` : 'Case Records'}
                                </div>
                                {selectedLedgerRows.length > 0 && (
                                   <div style={{ display: 'flex', gap: '10px' }}>
                                      <button 
                                        onClick={() => handleExportLedger('EXCEL')}
                                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #10b981', background: '#ecfdf5', color: '#059669', fontSize: '9px', fontWeight: 950, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                      >
                                        📥 DOWNLOAD EXCEL
                                      </button>
                                      <button 
                                        onClick={() => handleExportLedger('WHATSAPP')}
                                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #25d366', background: '#e8faf0', color: '#128c7e', fontSize: '9px', fontWeight: 950, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                      >
                                        💬 SHARE ON WHATSAPP
                                      </button>
                                      <button 
                                        onClick={() => setSelectedLedgerRows([])}
                                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: '9px', fontWeight: 950, cursor: 'pointer' }}
                                      >
                                        RESET
                                      </button>
                                   </div>
                                )}
                             </div>

                             {/* Referral Case Table */}
                             <div style={{ borderRadius: '20px', border: '1px solid #f1f5f9', overflow: 'hidden', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                            {!isMobile ? (
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '100%' }}>
                                  <thead style={{ background: '#fcfdfe' }}>
                                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                      <th style={{ padding: '15px 25px', textAlign: 'left', width: '40px' }}>
                                         <input 
                                           type="checkbox" 
                                           checked={isAllLedgerSelected(selected.patients)} 
                                           onChange={() => toggleAllLedger(selected.patients)} 
                                           style={{ cursor: 'pointer' }}
                                         />
                                      </th>
                                      <th style={{ padding: '15px 15px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>ID</th>
                                      <th style={{ padding: '15px 25px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>PATIENT</th>
                                      <th style={{ padding: '15px 25px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>CONTACT</th>
                                      <th style={{ padding: '15px 25px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>SCAN TYPE</th>
                                      <th style={{ padding: '15px 25px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>COMMISSION</th>
                                      <th style={{ padding: '15px 25px', textAlign: 'left', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>STATUS</th>
                                      <th style={{ padding: '15px 25px', textAlign: 'right', fontSize: '9px', fontWeight: 950, color: '#94a3b8', letterSpacing: '1px' }}>DATE</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {selected.patients.map(p => {
                                      const rowId = p.appointmentId || p.patientId;
                                      const isSelected = selectedLedgerRows.includes(rowId);
                                      return (
                                        <tr key={rowId} style={{ borderBottom: '1px solid #f8fafc', background: isSelected ? '#f0f7ff' : 'transparent', transition: 'all 0.2s' }}>
                                          <td style={{ padding: '15px 25px' }}>
                                             <input 
                                               type="checkbox" 
                                               checked={isSelected} 
                                               onChange={() => toggleLedgerSelection(rowId)} 
                                               style={{ cursor: 'pointer' }}
                                             />
                                          </td>
                                          <td style={{ padding: '15px 15px', fontSize: '11px', fontWeight: 950, color: '#0f52ba', fontFamily: 'monospace' }}>{p.patientIdentifier || 'UNSET'}</td>
                                          <td style={{ padding: '15px 25px' }}>
                                             <div style={{ fontSize: '13px', fontWeight: 850, color: '#1e293b' }}>{(p.name || 'Unknown').toUpperCase()}</div>
                                             <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>{formatPatientAge(p.age)} • {(p.gender || 'U').toUpperCase()}</div>
                                          </td>
                                          <td style={{ padding: '15px 25px' }}>
                                             <div style={{ fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>{p.mobile}</div>
                                             <div style={{ fontSize: '9px', color: '#0f52ba', fontWeight: 950, textTransform: 'uppercase' }}>{p.sourceOfInfo || 'DIRECT'}</div>
                                          </td>
                                          <td style={{ padding: '15px 25px' }}>
                                             <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                <span style={{ fontSize: '9px', color: 'white', background: '#334155', padding: '2px 8px', borderRadius: '4px', fontWeight: 950 }}>{visitModalities(p)}</span>
                                                <span style={{ fontSize: '9px', color: '#475569', border: '1px solid #e2e8f0', padding: '1px 6px', borderRadius: '4px', fontWeight: 850 }}>{visitServices(p)}</span>
                                             </div>
                                          </td>
                                          <td style={{ padding: '15px 25px' }}>
                                             <div style={{ fontSize: '11px', fontWeight: 950, color: '#1e293b' }}>₹{(p.commissionAmount || 0).toLocaleString()}</div>
                                             <div style={{ fontSize: '8px', fontWeight: 800, color: p.commissionStatus === 'Paid' ? '#059669' : p.commissionStatus === 'None' ? '#94a3b8' : '#dc2626' }}>{p.commissionStatus === 'None' ? 'NO COMMISSION' : (p.commissionStatus || 'Unpaid').toUpperCase()}</div>
                                          </td>
                                          <td style={{ padding: '15px 25px' }}>
                                             {(() => {
                                                const cfg = getStatusConfig(p.status);
                                                return <span style={{ fontSize: '8px', fontWeight: 950, padding: '3px 8px', borderRadius: '6px', background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                                             })()}
                                          </td>
                                          <td style={{ padding: '15px 25px', fontSize: '11px', color: '#94a3b8', textAlign: 'right', fontWeight: 900 }}>{p.registrationDate}{p.visitAt ? <div style={{ fontSize: '9px', color: '#cbd5e1', fontWeight: 800, marginTop: '2px' }}>{p.visitAt.slice(11)}</div> : null}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px', background: '#f8fafc' }}>
                                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 15px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '4px' }}>
                                    <input 
                                       type="checkbox" 
                                       checked={isAllLedgerSelected(selected.patients)} 
                                       onChange={() => toggleAllLedger(selected.patients)} 
                                       style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                                    />
                                    <span style={{ fontSize: '11px', fontWeight: 950, color: '#64748b' }}>SELECT ALL</span>
                                  </div>
                                  {selected.patients.map(p => {
                                      const rowId = p.appointmentId || p.patientId;
                                      const isSelected = selectedLedgerRows.includes(rowId);
                                      return (
                                        <div key={rowId} onClick={() => toggleLedgerSelection(rowId)} style={{ background: isSelected ? '#f0f7ff' : 'white', borderRadius: '16px', border: isSelected ? '1px solid #3b82f6' : '1px solid #e2e8f0', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', cursor: 'pointer', transition: 'all 0.2s' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                             <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                <input 
                                                  type="checkbox" 
                                                  checked={isSelected} 
                                                  readOnly
                                                  style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                                                />
                                                <div style={{ fontSize: '11px', fontWeight: 950, color: '#0f52ba', fontFamily: 'monospace' }}>{p.patientIdentifier || 'UNSET'}</div>
                                             </div>
                                             <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b' }}>{p.registrationDate}</div>
                                          </div>
                                          <div>
                                             <div style={{ fontSize: '14px', fontWeight: 850, color: '#1e293b' }}>{(p.name || 'Unknown').toUpperCase()}</div>
                                             <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b', marginTop: '4px' }}>{formatPatientAge(p.age)} • {(p.gender || 'U').toUpperCase()}</div>
                                             <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginTop: '4px' }}>{p.mobile}</div>
                                          </div>
                                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                              <span style={{ fontSize: '10px', color: 'white', background: '#334155', padding: '3px 8px', borderRadius: '6px', fontWeight: 950 }}>{visitModalities(p)}</span>
                                              <span style={{ fontSize: '10px', color: '#475569', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: '6px', fontWeight: 850 }}>{visitServices(p)}</span>
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', paddingTop: '12px', borderTop: '1px dashed #e2e8f0' }}>
                                             <div>
                                                <div style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b' }}>₹{(p.commissionAmount || 0).toLocaleString()}</div>
                                                <div style={{ fontSize: '9px', fontWeight: 900, color: p.commissionStatus === 'Paid' ? '#059669' : p.commissionStatus === 'None' ? '#94a3b8' : '#dc2626' }}>{p.commissionStatus === 'None' ? 'NO COMMISSION' : (p.commissionStatus || 'Unpaid').toUpperCase()}</div>
                                             </div>
                                             {(() => {
                                                const cfg = getStatusConfig(p.status);
                                                return <span style={{ fontSize: '10px', fontWeight: 950, padding: '4px 10px', borderRadius: '8px', background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                                             })()}
                                          </div>
                                        </div>
                                      );
                                  })}
                                </div>
                            )}
                             </div>
                             {(selected.visitsError || selected.visitsLoading || selected.patients.length < selected.totalPatients) && (
                               <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '14px 4px 0' }}>
                                 <div style={{ fontSize: '11px', fontWeight: 700, color: selected.visitsError ? '#b91c1c' : '#64748b' }}>
                                   {selected.visitsError
                                     ? selected.visitsError
                                     : (selected.visitsLoading && selected.patients.length === 0)
                                       ? 'Loading visits…'
                                       : `Showing ${selected.patients.length} of ${selected.totalPatients} visits`}
                                 </div>
                                 {selected.visitsError ? (
                                   <button type="button" onClick={() => retrySourceVisits(selected.sourceKey)}
                                     style={{ padding: '7px 14px', borderRadius: '10px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: '10px', fontWeight: 950, cursor: 'pointer' }}>Retry</button>
                                 ) : (selected.patients.length < selected.totalPatients && !(selected.visitsLoading && selected.patients.length === 0)) && (
                                   <button type="button" disabled={selected.visitsLoading} onClick={() => loadMoreSourceVisits(selected.sourceKey)}
                                     style={{ padding: '7px 14px', borderRadius: '10px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: '10px', fontWeight: 950, cursor: selected.visitsLoading ? 'wait' : 'pointer', opacity: selected.visitsLoading ? 0.6 : 1 }}>
                                     {selected.visitsLoading ? 'Loading…' : 'Load more'}
                                   </button>
                                 )}
                               </div>
                             )}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div style={{ padding: '100px', textAlign: 'center', background: 'white', borderRadius: '30px', border: '1px dashed #cbd5e1' }}>
                       <div style={{ fontSize: '50px', marginBottom: '20px' }}>🧭</div>
                       <div style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b' }}>SELECT A SOURCE</div>
                       <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '10px' }}>Select a referral source from the list on the left to view their details.</p>
                    </div>
                  )}
                </div>
              </div>
                                    ) : referralViewMode === 'LOG' ? (
              /* Unified Referral Intelligence: Matrix + Case Ledger showing all registered doctors */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                 {/* 1. Tactical Matrix Grid */}
                 <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: isTestMode ? 'visible' : 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.01)', padding: '30px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', marginBottom: '25px', flexDirection: isMobile ? 'column' : 'row', gap: '20px' }}>
                       <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'center', gap: '20px', flexDirection: isMobile ? 'column' : 'row' }}>
                         <div>
                           <h3 style={{ fontSize: '14px', fontWeight: 950, color: '#1e293b', margin: 0 }}>Referral Volume Matrix</h3>
                           <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Attended visits by referral source over time (IST)</p>
                         </div>
                         <button 
                           onClick={handleExportMatrix}
                           style={{ padding: '12px 18px', borderRadius: '14px', background: '#f0f3fd', border: '1px solid #0f52ba30', color: '#0f52ba', fontSize: '10px', fontWeight: 950, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                         >
                           📥 DOWNLOAD MATRIX (CSV)
                         </button>
                       </div>
                       <div style={{ display: 'flex', gap: '15px', alignItems: 'center', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
                         {matrixPeriod === 'DAY' && (
                           <input 
                             type="date"
                             value={matrixDateStr}
                             onChange={(e) => e.target.value && setMatrixDateStr(e.target.value)}
                             style={{ padding: '10px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc' }}
                           />
                         )}
                         {matrixPeriod === 'WEEK' && (
                           <>
                             <input 
                               type="month"
                               value={matrixDateStr.substring(0,7)}
                               onChange={(e) => e.target.value && setMatrixDateStr(e.target.value + '-01')}
                               style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc' }}
                             />
                             <select
                               value={matrixWeekIndex}
                               onChange={(e) => setMatrixWeekIndex(parseInt(e.target.value))}
                               style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc' }}
                             >
                               <option value={1}>Week 1 (1st - 7th)</option>
                               <option value={2}>Week 2 (8th - 14th)</option>
                               <option value={3}>Week 3 (15th - 21st)</option>
                               <option value={4}>Week 4 (22nd - End)</option>
                             </select>
                           </>
                         )}
                         {matrixPeriod === 'MONTH' && (
                           <input 
                             type="month"
                             value={matrixDateStr.substring(0,7)}
                             onChange={(e) => e.target.value && setMatrixDateStr(e.target.value + '-01')}
                             style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc' }}
                           />
                         )}
                         {matrixPeriod === 'YEAR' && (
                           <input 
                             type="number"
                             min="2000"
                             max="2100"
                             step="1"
                             value={matrixDateStr.substring(0,4)}
                             onChange={(e) => e.target.value && setMatrixDateStr(`${e.target.value}-01-01`)}
                             style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc', width: '90px' }}
                           />
                         )}
                         <div style={{ display: 'flex', gap: '5px', background: '#f8fafc', padding: '6px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                           {['DAY', 'WEEK', 'MONTH', 'YEAR'].map(p => (
                             <button
                               key={p}
                               onClick={() => setMatrixPeriod(p)}
                               style={{
                                 padding: '8px 16px',
                                 borderRadius: '8px',
                                 border: 'none',
                                 fontSize: '9px',
                                 fontWeight: 950,
                                 background: matrixPeriod === p ? 'white' : 'transparent',
                                 color: matrixPeriod === p ? '#0f52ba' : '#64748b',
                                 boxShadow: matrixPeriod === p ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
                                 cursor: 'pointer',
                                 transition: 'all 0.2s'
                               }}
                             >
                               {p}
                             </button>
                           ))}
                         </div>
                       </div>
                    </div>

                    {matrixError && (
                      <div role="alert" style={{ margin: '0 0 14px', padding: '10px 14px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '12px', fontWeight: 800 }}>⚠ {matrixError}</div>
                    )}
                    {matrixLoading && (
                      <div style={{ margin: '0 0 12px', fontSize: '11px', fontWeight: 800, color: '#94a3b8' }}>Loading the matrix…</div>
                    )}
                    {temporalMatrixData?.rows.length > 0 ? (
                       <div style={{ overflowX: 'auto', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                         <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                           <thead>
                             <tr>
                               <th style={{ padding: '15px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 900, color: '#94a3b8', borderBottom: '2px solid #f1f5f9', background: '#fcfdfe', position: 'sticky', left: 0, zIndex: 10, minWidth: '200px' }}>REFERRING SOURCE</th>
                               {temporalMatrixData?.cols.map(c => (
                                 <th key={c} style={{ padding: '15px 20px', textAlign: 'center', fontSize: '11px', fontWeight: 900, color: '#94a3b8', borderBottom: '2px solid #f1f5f9', background: '#fcfdfe', whiteSpace: 'nowrap' }}>
                                   {c.toUpperCase()}
                                 </th>
                               ))}
                               <th style={{ padding: '15px 20px', textAlign: 'center', fontSize: '11px', fontWeight: 900, color: '#0f52ba', borderBottom: '2px solid #f1f5f9', background: '#fcfdfe', whiteSpace: 'nowrap' }}>TOTAL PULL</th>
                             </tr>
                           </thead>
                           <tbody>
                             {temporalMatrixData?.rows.map((row) => (
                               <tr key={`${row.kind || 'PARTNER'}:${row.referrerId || row.name}`} style={{ borderBottom: '1px solid #f8fafc' }}>
                                 <td style={{ padding: '15px 20px', position: 'sticky', left: 0, background: 'white', zIndex: 5, borderRight: '1px solid #f1f5f9' }}>
                                   <div style={{ fontSize: '13px', fontWeight: 850, color: '#1e293b' }}>{(row.name || 'ANONYMOUS').toUpperCase()}</div>
                                   <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>{row.contact || (row.kind === 'PARTNER' ? 'No Contact Info' : '')}</div>
                                   {row.kind === 'UNLINKED' && <div style={{ fontSize: '9px', fontWeight: 900, color: '#b45309', marginTop: '2px' }}>NOT A PARTNER YET</div>}
                                   {row.kind === 'UNATTRIBUTED' && <div style={{ fontSize: '9px', fontWeight: 900, color: '#b91c1c', marginTop: '2px' }}>FIX THE APPOINTMENTS</div>}
                                 </td>
                                 {temporalMatrixData?.cols.map(c => {
                                   const count = row.counts[c] || 0;
                                   return (
                                     <td key={c} style={{ padding: '15px 20px', textAlign: 'center' }}>
                                       {count > 0 ? (
                                         <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4', color: '#16a34a', width: '28px', height: '28px', borderRadius: '8px', fontSize: '12px', fontWeight: 900 }}>
                                           {count}
                                         </div>
                                       ) : (
                                         <div style={{ color: '#ef4444', fontSize: '14px', fontWeight: 900, opacity: 0.3 }}>✗</div>
                                       )}
                                     </td>
                                   );
                                 })}
                                 <td style={{ padding: '15px 20px', textAlign: 'center' }}>
                                   <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#eff6ff', color: '#0f52ba', width: '32px', height: '32px', borderRadius: '10px', fontSize: '13px', fontWeight: 900 }}>
                                     {row.total}
                                   </div>
                                 </td>
                               </tr>
                             ))}
                           </tbody>
                         </table>
                       </div>
                    ) : (
                       <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>No temporal density markers detected in this period.</div>
                    )}
                 </div>
              </div>
            ) : (
              /* Global Referral Matrix View */
              <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: isTestMode ? 'visible' : 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.01)', padding: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#1e293b', margin: 0 }}>SOURCE ANALYTICS MATRIX</h3>
                    <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Temporal volume density across diagnostic network</p>
                  </div>
                  <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    {matrixPeriod === 'DAY' && (
                      <input 
                        type="date"
                        value={matrixDateStr}
                        onChange={(e) => e.target.value && setMatrixDateStr(e.target.value)}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc' }}
                      />
                    )}
                    {matrixPeriod === 'WEEK' && (
                      <>
                        <input 
                          type="month"
                          value={matrixDateStr.substring(0,7)}
                          onChange={(e) => e.target.value && setMatrixDateStr(e.target.value + '-01')}
                          style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc' }}
                        />
                        <select
                          value={matrixWeekIndex}
                          onChange={(e) => setMatrixWeekIndex(parseInt(e.target.value))}
                          style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc' }}
                        >
                          <option value={1}>Week 1 (1st - 7th)</option>
                          <option value={2}>Week 2 (8th - 14th)</option>
                          <option value={3}>Week 3 (15th - 21st)</option>
                          <option value={4}>Week 4 (22nd - End)</option>
                        </select>
                      </>
                    )}
                    {matrixPeriod === 'MONTH' && (
                      <input 
                        type="month"
                        value={matrixDateStr.substring(0,7)}
                        onChange={(e) => e.target.value && setMatrixDateStr(e.target.value + '-01')}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc' }}
                      />
                    )}
                    {matrixPeriod === 'YEAR' && (
                      <input 
                        type="number"
                        min="2000"
                        max="2100"
                        step="1"
                        value={matrixDateStr.substring(0,4)}
                        onChange={(e) => e.target.value && setMatrixDateStr(`${e.target.value}-01-01`)}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 800, color: '#1e293b', outline: 'none', background: '#f8fafc', width: '90px' }}
                      />
                    )}
                    <div style={{ display: 'flex', gap: '5px', background: '#f8fafc', padding: '6px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                      {['DAY', 'WEEK', 'MONTH', 'YEAR'].map(period => (
                        <button
                          key={period}
                          onClick={() => setMatrixPeriod(period)}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            background: matrixPeriod === period ? 'white' : 'transparent',
                            color: matrixPeriod === period ? '#0f52ba' : '#64748b',
                            fontSize: '11px',
                            fontWeight: 850,
                            cursor: 'pointer',
                            boxShadow: matrixPeriod === period ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
                            transition: 'all 0.2s'
                          }}
                        >
                          {period}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {temporalMatrixData?.rows.length > 0 && (
                  <div style={{ overflowX: 'auto', borderRadius: '16px', border: '1px solid #f1f5f9' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '15px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 900, color: '#94a3b8', borderBottom: '2px solid #f1f5f9', background: '#fcfdfe', position: 'sticky', left: 0, zIndex: 10, minWidth: '200px' }}>REFERRING SOURCE</th>
                          {temporalMatrixData?.cols.map(c => (
                            <th key={c} style={{ padding: '15px 20px', textAlign: 'center', fontSize: '11px', fontWeight: 900, color: '#94a3b8', borderBottom: '2px solid #f1f5f9', background: '#fcfdfe', whiteSpace: 'nowrap' }}>
                              {c.toUpperCase()}
                            </th>
                          ))}
                          <th style={{ padding: '15px 20px', textAlign: 'center', fontSize: '11px', fontWeight: 900, color: '#0f52ba', borderBottom: '2px solid #f1f5f9', background: '#fcfdfe', whiteSpace: 'nowrap' }}>TOTAL PULL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {temporalMatrixData?.rows.map((row) => (
                          <tr key={`${row.kind || 'PARTNER'}:${row.referrerId || row.name}`} style={{ borderBottom: '1px solid #f8fafc', transition: 'background 0.2s', ':hover': { background: '#f8fafc' } }}>
                            <td style={{ padding: '15px 20px', position: 'sticky', left: 0, background: 'white', zIndex: 5, borderRight: '1px solid #f1f5f9' }}>
                              <div style={{ fontSize: '13px', fontWeight: 850, color: '#1e293b' }}>{(row.name || 'ANONYMOUS').toUpperCase()}</div>
                              <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8' }}>{row.contact || (row.kind === 'PARTNER' ? 'No Contact Info' : '')}</div>
                                   {row.kind === 'UNLINKED' && <div style={{ fontSize: '9px', fontWeight: 900, color: '#b45309', marginTop: '2px' }}>NOT A PARTNER YET</div>}
                                   {row.kind === 'UNATTRIBUTED' && <div style={{ fontSize: '9px', fontWeight: 900, color: '#b91c1c', marginTop: '2px' }}>FIX THE APPOINTMENTS</div>}
                            </td>
                            {temporalMatrixData?.cols.map(c => {
                              const count = row.counts[c] || 0;
                              return (
                                <td key={c} style={{ padding: '15px 20px', textAlign: 'center' }}>
                                  {count > 0 ? (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4', color: '#16a34a', width: '28px', height: '28px', borderRadius: '8px', fontSize: '12px', fontWeight: 900 }}>
                                      {count}
                                    </div>
                                  ) : (
                                    <div style={{ color: '#ef4444', fontSize: '14px', fontWeight: 900 }}>✗</div>
                                  )}
                                </td>
                              );
                            })}
                            <td style={{ padding: '15px 20px', textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#eff6ff', color: '#0f52ba', width: '32px', height: '32px', borderRadius: '10px', fontSize: '13px', fontWeight: 900 }}>
                                {row.total}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {referralViewMode !== 'LINKS' && (referralViewMode === 'LOG' ? (temporalMatrixData?.rows.length === 0) : (totalPatientsCount === 0)) && (
              <div style={{ padding: '150px 20px', textAlign: 'center', background: 'white', borderRadius: '40px', border: '1px dashed #cbd5e1' }}>
                <div style={{ fontSize: '60px', marginBottom: '25px' }}>📡</div>
                <div style={{ fontSize: '18px', fontWeight: 950, color: '#1e293b' }}>NO REFERRAL DATA FOUND</div>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '10px', maxWidth: '350px', margin: '15px auto', fontWeight: 600 }}>The active scan yielded zero signatures. Synchronize parameters or check global registry.</p>
              </div>
            )}
          </>
        )}
      </div>
    );
}
