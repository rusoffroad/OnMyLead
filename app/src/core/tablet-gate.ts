/**
 * OnMyLead on an iPad, an Android tablet or the website is part of Pro (Chris, 2026-11-03,
 * feature tablet_web). Joining a ride and following the leader stay free on every device, so these
 * screens always open there: ride pages and Ride Mode, links people send (rides, groups, friends,
 * events, family links), the Pro and Subscription screens, sign-in, the You tab (account,
 * sign out and Delete Account) and the legal and help pages. Pure, so it's unit tested.
 */

const ALWAYS_OPEN: RegExp[] = [
  /^\/r\//, // a ride's page: join, check in, open Ride Mode
  /^\/ride\/[^/]+\/(live|waypoints)$/, // Ride Mode and the ride's waypoints map
  /^\/(f|g|e|friend)\//, // links: family link, group, event, friend
  /^\/(pro|subscription|sign-in|auth-callback|reset-password|profile|privacy|terms|rider-agreement|support|contact|help)(\/|$)/,
  /^\/admin(\/|$)/, // the owner's dashboard (admin accounts are Pro anyway)
];

/** Whether this screen is covered by the tablet and website Pro screen. */
export function tabletGateCovers(s: { bigScreen: boolean; signedIn: boolean; allowed: boolean; path: string }): boolean {
  if (!s.bigScreen || !s.signedIn || s.allowed) return false;
  return !ALWAYS_OPEN.some((r) => r.test(s.path));
}
