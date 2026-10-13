import { LegalPage } from '@/components/legal-page';
import { COMPANY, SUPPORT_EMAIL } from '@/constants/site';

// The App Store's Support URL points here, so it answers the questions riders actually ask.
export default function Support() {
  return (
    <LegalPage
      title="Help and Support"
      updated="October 13, 2026"
      draft={false}
      intro={`Something not working, or a question about OnMyLead? Email ${SUPPORT_EMAIL} and a real person at ${COMPANY} will answer, usually within a day.`}
      sections={[
        {
          title: 'Joining a Ride',
          body: [
            'Ask the organizer for the ride code or link, or scan their QR code with your iPhone camera. Then tap Join a Ride on the Home tab.',
            'Your location is only shared with the ride while you are sharing, and sharing always stops when the ride ends or your timer runs out.',
          ],
        },
        {
          title: 'Location and Battery',
          body: [
            'For Ride Mode to keep your group updated with the phone locked, allow location Always when the app asks. You can change this anytime in Settings > OnMyLead > Location.',
            'Out of service, the app keeps your last known position for the group and shows how old it is. Offline maps keep the map and your route on screen; other riders’ positions update again once you have signal.',
          ],
        },
        {
          title: 'Pro and Your Subscription',
          body: [
            'Manage or cancel Pro in You > Subscription > Manage Subscription, or in your iPhone’s Settings > Apple Account > Subscriptions.',
            'New phone or reinstalled the app? Sign in, then tap Restore Purchases in You > Subscription.',
            'Refunds are handled by Apple at reportaproblem.apple.com.',
          ],
        },
        {
          title: 'Reporting and Blocking',
          body: [
            'Tap a rider in a ride’s Riders list, or press and hold one of their messages, to report or block them. Blocked riders’ messages are hidden from you, and they are not told.',
            `We review every report within 24 hours. For anything urgent, email ${SUPPORT_EMAIL}.`,
          ],
        },
        {
          title: 'Deleting Your Account',
          body: [
            'Go to You, scroll to the bottom and tap Delete Account. Your account, rides you organized, messages and location history are deleted. Cancel any Pro subscription with Apple first, because Apple bills it, not us.',
          ],
        },
        {
          title: 'In an Emergency',
          body: ['OnMyLead is not an emergency service. Call 911 or your local emergency number first, then use the EMERGENCY button to alert your group.'],
        },
      ]}
    />
  );
}
