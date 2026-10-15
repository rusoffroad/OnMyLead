/** Every page of the dashboard, in menu order. Groups become headings in the menu. */
export type AdminSection = { key: string; title: string; href: string; group: 'People' | 'Rides' | 'Money' | 'System' };

export const ADMIN_SECTIONS: AdminSection[] = [
  { key: 'overview', title: 'Overview', href: '/admin', group: 'People' },
  { key: 'growth', title: 'Signups and Downloads', href: '/admin/growth', group: 'People' },
  { key: 'users', title: 'Users', href: '/admin/users', group: 'People' },
  { key: 'trials', title: 'Pro Trials', href: '/admin/trials', group: 'People' },
  { key: 'reports', title: 'Reports', href: '/admin/reports', group: 'People' },
  { key: 'contact', title: 'Contact Messages', href: '/admin/contact', group: 'People' },
  { key: 'rides', title: 'Rides', href: '/admin/rides', group: 'Rides' },
  { key: 'analytics', title: 'Analytics', href: '/admin/analytics', group: 'Rides' },
  { key: 'subscriptions', title: 'Subscriptions', href: '/admin/subscriptions', group: 'Money' },
  { key: 'promo-codes', title: 'Promo Codes', href: '/admin/promo-codes', group: 'Money' },
  { key: 'exports', title: 'CSV Exports', href: '/admin/exports', group: 'Money' },
  { key: 'help', title: 'Help Center', href: '/admin/help', group: 'System' },
  { key: 'app-health', title: 'App Health', href: '/admin/app-health', group: 'System' },
  { key: 'settings', title: 'Settings', href: '/admin/settings', group: 'System' },
  { key: 'audit', title: 'Audit Log', href: '/admin/audit', group: 'System' },
];

/** The section a path belongs to (/admin/users/abc -> users). */
export function sectionFor(pathname: string): AdminSection {
  const rest = pathname.replace(/^\/admin\/?/, '');
  const first = rest.split('/')[0];
  return ADMIN_SECTIONS.find((s) => s.key === first) ?? ADMIN_SECTIONS[0];
}
