import { Platform } from 'react-native';

import { HelpCenterCard } from '@/components/help-center-card';
import { LegalPage } from '@/components/legal-page';
import { COMPANY, SUPPORT_EMAIL } from '@/constants/site';
import { SUPPORT_GUIDES } from '@/core/help-link';

import { t } from '@/lib/i18n';
// The App Store's Support URL points here, so it answers the questions riders actually ask. The
// website shows the iPhone answers; the Android app shows its own where they differ. The Help Center
// (onmylead.com/help) comes first: it has the step-by-step guides, and each topic links its guide.
const ANDROID = Platform.OS === 'android';

export default function Support() {
  return (
    <LegalPage
      title={t('Help and Support')}
      updated="November 3, 2026"
      lead={<HelpCenterCard />}
      intro={`Something not working, or a question about OnMyLead? Send us a message with the Contact Us form below, or email ${SUPPORT_EMAIL}, and a real person at ${COMPANY} will answer, usually within a day.`}
      action={{ title: t('Contact Us'), href: '/contact' }}
      sections={[
        {
          title: t('Joining a Ride'),
          guide: SUPPORT_GUIDES.joining,
          body: [
            `Ask the organizer for the ride code or link, or scan their QR code with your ${ANDROID ? 'phone’s' : 'iPhone'} camera. Then tap Join a Ride on the Rides tab.`,
            'Your location is only shared with the ride while you are sharing, and sharing always stops when the ride ends or your timer runs out.',
          ],
        },
        {
          title: t('Location and Battery'),
          guide: SUPPORT_GUIDES.location,
          body: [
            ANDROID
              ? 'Allow location While Using the App when the app asks. While you share, OnMyLead shows a Sharing Your Location notification, and that keeps your group updated with the phone locked. You can change this anytime in Settings > Apps > OnMyLead > Permissions.'
              : 'For Ride Mode to keep your group updated with the phone locked, allow location Always when the app asks. You can change this anytime in Settings > OnMyLead > Location.',
            'Out of service, the app keeps your last known position for the group and shows how old it is. Offline maps keep the map and your route on screen; other riders’ positions update again once you have signal.',
          ],
        },
        {
          title: t('Pro and Your Subscription'),
          guide: SUPPORT_GUIDES.pro,
          body: [
            ANDROID
              ? 'Manage or cancel Pro in You > Subscription > Manage Subscription, or in the Play Store app under Profile > Payments & Subscriptions > Subscriptions.'
              : 'Manage or cancel Pro in You > Subscription > Manage Subscription, or in your iPhone’s Settings > Apple Account > Subscriptions.',
            'New phone or reinstalled the app? Sign in, then tap Restore Purchases in You > Subscription. Pro works on every device you sign in to with the same OnMyLead account.',
            ANDROID
              ? 'Refunds are handled by Google Play at play.google.com/store/account/orderhistory.'
              : 'Refunds are handled by Apple at reportaproblem.apple.com.',
          ],
        },
        {
          title: t('Reporting and Blocking'),
          guide: SUPPORT_GUIDES.reporting,
          body: [
            'Tap a rider in a ride’s Riders list, or press and hold one of their messages, to report or block them. Blocked riders’ messages are hidden from you, and they are not told.',
            `We review every report within 24 hours. For anything urgent, email ${SUPPORT_EMAIL}.`,
          ],
        },
        {
          title: t('Deleting Your Account'),
          guide: SUPPORT_GUIDES.deleting,
          body: [
            'Go to You, scroll to the bottom and tap Delete Account. Your account, rides you organized, messages and location history are deleted. Cancel any Pro subscription with Apple first, because Apple bills it, not us.',
          ],
        },
        {
          title: t('In an Emergency'),
          guide: SUPPORT_GUIDES.emergency,
          body: ['OnMyLead is not an emergency service. Call 911 or your local emergency number first, then use the EMERGENCY button to alert your group.'],
        },
      ]}
    />
  );
}
