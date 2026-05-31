import { useNavigate } from 'react-router-dom';
import useAuth from '../auth/useAuth';

/**
 * SettingsHomePage — landing page at /settings.
 *
 * Surfaces the three account-level features the sidebar's Settings group
 * collapses (Security & PIN, Sync & offline, Active sessions) as premium
 * tiles. Lets the user pick a destination from one calm screen instead
 * of memorising sub-routes.
 */
export default function SettingsHomePage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const tiles = [
    {
      key: 'security',
      title: 'Security & PIN',
      description: 'Set or change your 4-digit quick-unlock PIN. Used to sign in offline or after a short break.',
      cta: 'Manage PIN',
      accent: { from: '#2563eb', to: '#1d4ed8', glow: 'rgba(37,99,235,0.30)' },
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
      to: '/settings/security',
    },
    {
      key: 'sync',
      title: 'Sync & offline queue',
      description: 'See what is waiting to upload, how fresh your local copy is, and how much space the app is using.',
      cta: 'View sync status',
      accent: { from: '#10b981', to: '#047857', glow: 'rgba(16,185,129,0.30)' },
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      ),
      to: '/settings/sync',
    },
    {
      key: 'sessions',
      title: 'Active sessions',
      description: 'See every device signed into your account right now. Sign out the ones you do not recognise.',
      cta: 'Review devices',
      accent: { from: '#f59e0b', to: '#b45309', glow: 'rgba(245,158,11,0.30)' },
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
      to: '/settings/sessions',
    },
  ];

  return (
    <div style={{
      maxWidth: '960px',
      margin: '0 auto',
      padding: '32px 24px 48px',
      fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{
          fontSize: '11px', fontWeight: 800, letterSpacing: '2px',
          color: '#3b82f6', textTransform: 'uppercase', marginBottom: '8px',
        }}>
          Your account
        </div>
        <h1 style={{
          fontSize: '28px', fontWeight: 800, color: '#0f172a',
          letterSpacing: '-0.6px', margin: 0,
        }}>
          Settings
        </h1>
        <p style={{
          fontSize: '14px', color: '#64748b', margin: '6px 0 0',
          lineHeight: 1.55, maxWidth: '560px',
        }}>
          {currentUser?.name ? `Hi ${String(currentUser.name).split(' ')[0]}, manage` : 'Manage'} how you sign in, what gets cached on this device, and which devices have access.
        </p>
      </div>

      {/* Tiles */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '18px',
      }}>
        {tiles.map(tile => (
          <button
            key={tile.key}
            type="button"
            onClick={() => navigate(tile.to)}
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '18px',
              padding: '22px',
              display: 'flex', flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
              transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
              fontFamily: 'inherit',
              position: 'relative',
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = `0 18px 36px -16px ${tile.accent.glow}, 0 6px 14px -8px rgba(15,23,42,0.08)`;
              e.currentTarget.style.borderColor = '#cbd5e1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,0.04)';
              e.currentTarget.style.borderColor = '#e2e8f0';
            }}
          >
            <div style={{
              width: '52px', height: '52px', borderRadius: '14px',
              background: `linear-gradient(135deg, ${tile.accent.from} 0%, ${tile.accent.to} 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 10px 22px -6px ${tile.accent.glow}, inset 0 1px 0 rgba(255,255,255,0.22)`,
              flexShrink: 0,
            }}>
              {tile.icon}
            </div>

            <div style={{ flex: 1 }}>
              <h2 style={{
                fontSize: '16px', fontWeight: 800, color: '#0f172a',
                margin: '0 0 6px', letterSpacing: '-0.2px',
              }}>
                {tile.title}
              </h2>
              <p style={{
                fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.55,
              }}>
                {tile.description}
              </p>
            </div>

            <div style={{
              marginTop: '4px',
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              fontSize: '12px', fontWeight: 700,
              color: tile.accent.from,
              letterSpacing: '0.2px',
            }}>
              {tile.cta}
              <span aria-hidden="true" style={{ fontSize: '14px' }}>→</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
