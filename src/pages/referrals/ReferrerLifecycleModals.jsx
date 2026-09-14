import React from 'react';

const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)' };
const cardStyle = { width: '450px', background: 'white', borderRadius: '24px', boxShadow: '0 30px 60px rgba(0,0,0,0.15)', overflow: 'hidden', display: 'flex', flexDirection: 'column' };
const footerStyle = { padding: '20px 30px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '15px' };
const cancelBtnStyle = { flex: 1, padding: '14px', borderRadius: '12px', background: 'white', border: '1px solid #cbd5e1', color: '#475569', fontSize: '12px', fontWeight: 900, cursor: 'pointer' };

/**
 * UnmergeReferrerModal / DeleteReferrerModal / MergeReferrerModal — the three
 * small confirmation dialogs in the referrer lifecycle (undo a merge, delete
 * a partner, merge one partner into another). Grouped in one file since
 * they're small, share the same visual language, and are always rendered
 * together at the page's top level.
 * Extracted from ReferralsPage.jsx's inline renderUnmergeModal/renderDeleteModal/renderMergeModal.
 */

export function UnmergeReferrerModal({ unmergeModalData, setUnmergeModalData, confirmUnmerge, isUnmerging }) {
  if (!unmergeModalData) return null;
  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ padding: '30px', background: '#fcfdfe', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '10px', fontWeight: 900, color: '#d97706', letterSpacing: '2px', marginBottom: '8px' }}>PARTNER UNMERGE</div>
          <h2 style={{ fontSize: '18px', fontWeight: 950, color: '#0f172a', margin: 0 }}>Revert Merge</h2>
          <p style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', margin: '10px 0 0 0', lineHeight: 1.5 }}>
            Are you sure you want to unmerge <strong>{unmergeModalData.sourceName}</strong>? They will reappear as a separate entity in your partner network.
          </p>
        </div>
        <div style={footerStyle}>
          <button onClick={() => setUnmergeModalData(null)} style={cancelBtnStyle}>Cancel</button>
          <button
            onClick={confirmUnmerge}
            disabled={isUnmerging}
            style={{ flex: 1, padding: '14px', borderRadius: '12px', background: '#d97706', border: 'none', color: 'white', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}
          >
            {isUnmerging ? 'Unmerging...' : 'Confirm Unmerge'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeleteReferrerModal({ deleteModalData, setDeleteModalData, confirmDelete, isDeleting }) {
  if (!deleteModalData) return null;
  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ padding: '30px', background: '#fcfdfe', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '10px', fontWeight: 900, color: '#dc2626', letterSpacing: '2px', marginBottom: '8px' }}>DELETE PARTNER</div>
          <h2 style={{ fontSize: '18px', fontWeight: 950, color: '#0f172a', margin: 0 }}>Confirm Delete</h2>
          <p style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', margin: '10px 0 0 0', lineHeight: 1.5 }}>
            Are you sure you want to delete <strong>{deleteModalData.name}</strong> from the partner network?<br /><br />
            Historic referrals and commissions are kept for reporting, but the partner will no longer appear in the roster.
          </p>
        </div>
        <div style={footerStyle}>
          <button onClick={() => setDeleteModalData(null)} style={cancelBtnStyle}>Cancel</button>
          <button
            onClick={confirmDelete}
            disabled={isDeleting}
            style={{ flex: 1, padding: '14px', borderRadius: '12px', background: '#dc2626', border: 'none', color: 'white', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}
          >
            {isDeleting ? 'Deleting...' : 'Confirm Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MergeReferrerModal({
  isMergeModalOpen,
  editingReferrer,
  allReferrers,
  targetReferrerId,
  setTargetReferrerId,
  deleteAfterMerge,
  setDeleteAfterMerge,
  setIsMergeModalOpen,
  handleMergeReferrer,
  isMerging,
}) {
  if (!isMergeModalOpen || !editingReferrer) return null;
  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ padding: '30px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '10px', fontWeight: 900, color: '#dc2626', letterSpacing: '2px', marginBottom: '8px' }}>PARTNER MERGE</div>
          <h2 style={{ fontSize: '18px', fontWeight: 950, color: '#0f172a', margin: 0 }}>Select Partner to Merge In</h2>
          <p style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', margin: '10px 0 0 0', lineHeight: 1.5 }}>
            Which partner should be merged into <strong>{editingReferrer.name}</strong>? Their commissions and patients will roll up into {editingReferrer.name}.
          </p>
        </div>
        <div style={{ padding: '30px' }}>
          <select
            value={targetReferrerId}
            onChange={e => setTargetReferrerId(e.target.value)}
            style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '13px', fontWeight: 800, color: '#1e293b', outline: 'none' }}
          >
            <option value="">-- Choose Partner to Merge In --</option>
            {(allReferrers || []).filter(p => p.referrerId !== editingReferrer.referrerId && !p.mergedIntoId).map(p => (
              <option key={p.referrerId} value={p.referrerId}>{p.name}</option>
            ))}
          </select>
        </div>
        <div style={{ padding: '0 30px 20px 30px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={deleteAfterMerge}
              onChange={e => setDeleteAfterMerge(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
              Also delete the merged partner's record
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: '#94a3b8', marginTop: '2px' }}>They will be permanently removed from the system. (Cannot be unmerged later)</span>
            </span>
          </label>
        </div>
        <div style={footerStyle}>
          <button onClick={() => setIsMergeModalOpen(false)} style={cancelBtnStyle}>Cancel</button>
          <button
            onClick={handleMergeReferrer}
            disabled={!targetReferrerId || isMerging}
            style={{ flex: 1, padding: '14px', borderRadius: '12px', background: targetReferrerId ? '#0f52ba' : '#cbd5e1', border: 'none', color: 'white', fontSize: '12px', fontWeight: 900, cursor: targetReferrerId ? 'pointer' : 'not-allowed' }}
          >
            {isMerging ? 'Merging...' : 'Confirm Merge'}
          </button>
        </div>
      </div>
    </div>
  );
}
