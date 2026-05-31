import { useNavigate } from 'react-router-dom';

/**
 * SettingsSubPageHeader — shared header for every /settings/* sub-page.
 *
 * Surfaces a premium "back to Settings" affordance, a breadcrumb crumb,
 * a bold title and a soft subtitle. Optional `rightAction` slot lets a
 * page place a primary CTA (e.g. "Sync now") flush with the title.
 *
 * Used by SecuritySettingsPage, SyncStatusPage, and ActiveSessionsPage.
 *
 * Props
 *   title       — main heading line
 *   description — one-paragraph context blurb (optional)
 *   rightAction — React node placed at the top-right (optional)
 */
export default function SettingsSubPageHeader({ title, description, rightAction }) {
  const navigate = useNavigate();

  return (
    <div style={{
      marginBottom: '24px',
      fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    }}>
      {/* Back chip — large enough to be obvious, subtle enough to defer
          to the page title underneath. */}
      <button
        type="button"
        onClick={() => navigate('/settings')}
        aria-label="Back to Settings"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '7px 14px 7px 11px',
          marginBottom: '16px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '999px',
          color: '#475569',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.1px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.borderColor = '#cbd5e1';
          e.currentTarget.style.color = '#1e293b';
          e.currentTarget.style.boxShadow = '0 6px 18px -8px rgba(15,23,42,0.18)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.borderColor = '#e2e8f0';
          e.currentTarget.style.color = '#475569';
          e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,0.04)';
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back to Settings
      </button>

      {/* Title row — single line on desktop, stacks on narrow screens.
          flexWrap lets a long rightAction wrap below the title naturally. */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: '16px',
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: '1 1 360px', minWidth: 0 }}>
          {/* Breadcrumb crumb */}
          <div style={{
            fontSize: '11px',
            fontWeight: 800,
            color: '#94a3b8',
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            marginBottom: '6px',
          }}>
            Settings <span style={{ opacity: 0.5, margin: '0 6px' }}>›</span> {title}
          </div>

          <h1 style={{
            fontSize: '26px',
            fontWeight: 800,
            color: '#0f172a',
            margin: '0 0 8px',
            letterSpacing: '-0.5px',
            lineHeight: 1.15,
          }}>
            {title}
          </h1>

          {description && (
            <p style={{
              fontSize: '13.5px',
              color: '#64748b',
              margin: 0,
              lineHeight: 1.55,
              maxWidth: '640px',
            }}>
              {description}
            </p>
          )}
        </div>

        {rightAction && (
          <div style={{ flexShrink: 0 }}>
            {rightAction}
          </div>
        )}
      </div>
    </div>
  );
}
