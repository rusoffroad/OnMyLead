import { LegalPage } from '@/components/legal-page';
import { COMPANY, SUPPORT_EMAIL } from '@/constants/site';

// DRAFT for Chris's review. Not legal advice; have it checked before the App Store launch.
export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="October 12, 2026"
      intro={`OnMyLead is made by ${COMPANY}. This page explains what the app and onmylead.com collect, why, and the choices you have. The short version: your location is never public, you choose who sees it, and sharing always ends.`}
      sections={[
        {
          title: 'Your Location',
          body: [
            'OnMyLead only shares your location when you turn sharing on, for a ride or with people you pick, and only for the time you choose. Sharing stops when the timer runs out, when the ride ends or when you stop it. The rules are enforced by our database, not just the app.',
            'Your exact location is never shown publicly. Public rides show a rounded meeting area; the exact meeting point is only for riders who join.',
            'While a ride is live, the app keeps sharing with the phone locked so your group can see you. If you make a family link, anyone with that link can see your location until the share ends.',
            'Your own ride track is kept so you can see your ride summary. The group summary only shows totals, never anyone’s route.',
          ],
        },
        {
          title: 'What We Collect',
          body: [
            'Account: your email address and password (stored securely by our sign-in provider), and the ride name you pick.',
            'What you add: rides, routes, waypoints, Garage machines and photos, trip checklists, Starlink setup, riding groups, ride chat messages and poll votes. Waypoints you drop are only yours unless the ride’s leader shares them with the riders on that ride.',
            'Device and app: a push notification token and your notification settings, crash reports (through Sentry) and basic usage events, such as a ride being created, so we can fix problems and improve the app. Crash reports never include your location.',
            'Purchases: if you buy Pro, Apple sends us the subscription’s status and transaction details. We never see your card or payment details.',
            'Website: onmylead.com uses Cloudflare Web Analytics, which counts visits without cookies.',
          ],
        },
        {
          title: 'Who We Share It With',
          body: [
            'We do not sell your data or use it for advertising. We share it only with the services that run OnMyLead: Supabase (database and sign-in), Apple (push notifications and purchases), Sentry (crash reports), Resend (emails such as ride cancellations) and Cloudflare (the website). If you look up a VIN in your Garage, that VIN is sent to the US government’s free NHTSA lookup. When you search for a park, trailhead or town, only the words you type and a rough map area go to Photon, an OpenStreetMap place search; trail maps are loaded from OpenFreeMap. Neither is told who you are. When you tap Navigate or Directions, the destination opens in Apple Maps or Google Maps, and their own privacy policies apply there.',
            'Other riders see what you share with them: your ride name, the rides you join, your messages on those rides and, while you share, your location.',
            'We may disclose information if the law requires it.',
          ],
        },
        {
          title: 'Your Choices',
          body: [
            'You can stop sharing your location at any time, change notification settings in Profile, and turn off location or notifications in your phone’s settings.',
            'You can delete your account from You > Delete Account. Your account, the rides you organize, your Garage, trips, groups and location history are deleted right away.',
            `Email ${SUPPORT_EMAIL} to ask for a copy of your data or to ask any privacy question.`,
          ],
        },
        {
          title: 'Children',
          body: ['OnMyLead is not meant for children under 13, and we do not knowingly collect their information.'],
        },
        {
          title: 'Changes and Contact',
          body: [
            'We will post any change here and tell you in the app if it matters.',
            `${COMPANY}. Questions about your data, or a request to see or delete it: ${SUPPORT_EMAIL}.`,
          ],
        },
      ]}
    />
  );
}
