import EventsScreen from '@/app/events/index';

/**
 * The Events tab (3.0; "Events and Group Rides" since 3.1): the same screen riders open from
 * Home, in the tab bar so the bar stays under it.
 */
export default function EventsTab() {
  return <EventsScreen inTab />;
}
