import React, { useState } from 'react';
import { createPortal } from 'react-dom';

const STORAGE_KEY = 'ne-versions';
const MAX_VERSIONS = 20;

/** Load versions from localStorage. Returns [] on error. */
export function loadVersions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

/** Persist updated versions array, keeping only the most recent MAX_VERSIONS. */
export function persistVersions(versions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(versions.slice(0, MAX_VERSIONS)));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded)
  }
}

/** Create a new version snapshot. Returns the new versions array. */
export function addVersion(versions, html, label = '') {
  const entry = {
    id: Date.now(),
    timestamp: Date.now(),
    label: label.trim() || new Date().toLocaleString(),
    html,
  };
  return [entry, ...versions].slice(0, MAX_VERSIONS);
}

/** Remove a version by id. Returns the updated array. */
export function removeVersion(versions, id) {
  return versions.filter(v => v.id !== id);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · '
    + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function wordCount(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').trim().split(/\s+/).filter(Boolean).length;
}

// ─── Version row ──────────────────────────────────────────────────────────────
function VersionRow({ version, onRestore, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const wc = wordCount(version.html);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        background: '#fff',
        borderRadius: '8px',
        border: '1px solid #e9ecef',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {/* Icon */}
      <div style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14px',
        flexShrink: 0,
      }}>
        📝
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 600,
          fontSize: '13px',
          color: '#1a1a2e',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontFamily: '"Segoe UI", system-ui, sans-serif',
        }}>
          {version.label}
        </div>
        <div style={{
          fontSize: '11px',
          color: '#888',
          marginTop: '2px',
          fontFamily: '"Segoe UI", system-ui, sans-serif',
        }}>
          {formatDate(version.timestamp)} · {wc} words
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <button
          onClick={() => onRestore(version)}
          title="Restore this version"
          style={{
            padding: '4px 10px',
            fontSize: '11px',
            fontFamily: '"Segoe UI", system-ui, sans-serif',
            border: '1px solid #2563eb',
            borderRadius: '4px',
            background: '#fff',
            color: '#2563eb',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          ↺ Restore
        </button>
        {confirmDelete ? (
          <>
            <button
              onClick={() => onDelete(version.id)}
              title="Confirm delete"
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                fontFamily: '"Segoe UI", system-ui, sans-serif',
                border: 'none',
                borderRadius: '4px',
                background: '#dc3545',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                fontFamily: '"Segoe UI", system-ui, sans-serif',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                background: '#fff',
                color: '#666',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            title="Delete this version"
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              fontFamily: '"Segoe UI", system-ui, sans-serif',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              background: '#fff',
              color: '#888',
              cursor: 'pointer',
            }}
          >
            🗑
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────
/**
 * VersionHistoryDialog — browse and restore saved editor snapshots.
 *
 * Props:
 *   open        {boolean}
 *   versions    {Array<{id, timestamp, label, html}>}
 *   onClose     {() => void}
 *   onSave      {(label: string) => void}  — save current snapshot
 *   onRestore   {(version) => void}        — restore a snapshot
 *   onDelete    {(id: number) => void}     — delete a snapshot
 */
export default function VersionHistoryDialog({
  open,
  versions = [],
  onClose,
  onSave,
  onRestore,
  onDelete,
}) {
  const [label, setLabel] = useState('');

  if (!open) return null;

  const handleSave = () => {
    onSave?.(label);
    setLabel('');
  };

  const panel = (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 22, 40, 0.45)',
        backdropFilter: 'blur(2px)',
        zIndex: 13500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}
    >
      <div
        style={{
          background: '#f8f9fa',
          borderRadius: '12px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
          width: 'min(520px, 96vw)',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          background: '#fff',
          borderBottom: '1px solid #dee2e6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: '#1a1a2e' }}>
              Version History
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
              {versions.length} saved version{versions.length !== 1 ? 's' : ''}{' '}
              · up to {20} stored locally
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: '#666',
              padding: '0 4px',
              lineHeight: 1,
            }}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Save snapshot row */}
        <div style={{
          padding: '12px 16px',
          background: '#eef2ff',
          borderBottom: '1px solid #dee2e6',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
        }}>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            placeholder='Optional label (e.g. "After CT findings")'
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '12px',
              fontFamily: '"Segoe UI", system-ui, sans-serif',
              border: '1px solid #c7d2fe',
              borderRadius: '6px',
              background: '#fff',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSave}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontFamily: '"Segoe UI", system-ui, sans-serif',
              border: 'none',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            💾 Save snapshot
          </button>
        </div>

        {/* Version list */}
        <div style={{ overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {versions.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '32px 16px',
              color: '#aaa',
              fontSize: '13px',
              fontFamily: '"Segoe UI", system-ui, sans-serif',
            }}>
              No saved versions yet. Click <strong>Save snapshot</strong> to capture the current state.
            </div>
          ) : (
            versions.map(v => (
              <VersionRow
                key={v.id}
                version={v}
                onRestore={onRestore}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(panel, (document.fullscreenElement || document.body));
}
