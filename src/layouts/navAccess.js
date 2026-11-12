// ════════════════════════════════════════════════════════════════════════════
//  Which pages this user can open, worked out once for the phone navigation
//  (bottom bar + menu sheet) so the two never disagree with the sidebar.
//  Same rules as the Sidebar: role permissions (incl. custom roles), the
//  centre's modules (RIS / PACS) and the PACS-only minimal menu.
// ════════════════════════════════════════════════════════════════════════════
import useAuth from '../auth/useAuth';
import { NAV_ITEMS, getRolePermissions } from '../data/roles';

const PACS_ONLY_ROUTES = new Set(['/admin-board', '/configuration', '/studies', '/dicom-bridge']);

export function useNavAccess() {
  const { currentUser, activeCenter, hasModule, modules } = useAuth();
  const roles = currentUser?.roles || [];
  const allowed = roles.flatMap((r) => getRolePermissions(r, activeCenter?.id) || []);
  const isPacsOnly = Array.isArray(modules) && modules.includes('PACS') && !modules.includes('RIS');
  const items = NAV_ITEMS.filter((item) =>
    (allowed.includes(item.route) || (item.accessVia || []).some((r) => allowed.includes(r)))
    && hasModule(item.requiredModule)
    && (!isPacsOnly || PACS_ONLY_ROUTES.has(item.route)));
  return { items, can: (route) => items.some((i) => i.route === route) };
}

// Bottom-bar tabs, most used first. Each user gets the first four they can
// open; everything else lives in the Menu sheet.
export const TAB_DEFS = [
  { route: '/admin-board', key: 'nav.home', icon: 'home' },
  { route: '/appointment-board', key: 'nav.appointments', icon: '/appointment-board' },
  { route: '/money', key: 'nav.money', icon: '/billing' },
  { route: '/doctor-board', key: 'nav.reporting', icon: '/doctor-board' },
  { route: '/studies', key: 'nav.scans', icon: '/studies' },
  { route: '/partners', key: 'nav.partnersShort', icon: 'partners' },
  { route: '/operations-board', key: 'nav.trackerShort', icon: 'tracker' },
];

export const pickTabs = (can) => TAB_DEFS.filter((d) => can(d.route)).slice(0, 4);
