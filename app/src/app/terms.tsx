import { LegalPage } from '@/components/legal-page';
import { COMPANY, PRO_PRICES, TRIAL_DAYS } from '@/constants/site';

// DRAFT for Chris's review. Not legal advice; have it checked before the App Store launch.
export default function Terms() {
  return (
    <LegalPage
      title="Terms of Use"
      updated="October 12, 2026"
      intro={`These terms cover your use of the OnMyLead app and onmylead.com, made by ${COMPANY} ("we"). By making an account or using the app, you agree to them.`}
      sections={[
        {
          title: 'Riding Is Your Responsibility',
          body: [
            'OnMyLead helps a group keep track of each other. It is not an emergency service, a navigation system you can rely on, or a substitute for your own judgment. Phones lose signal, batteries die and positions can be late or wrong.',
            'Ride within your skill and your machine’s limits, follow the law and land-use rules where you ride, and carry what you need to get yourself home. In an emergency, contact emergency services directly.',
            'Never type or read the screen while driving or riding. Ride Mode is built for one-tap use when you are stopped.',
          ],
        },
        {
          title: 'Your Account',
          body: [
            'You need an account to create or join rides. Keep your password private; you are responsible for what happens under your account. You can delete your account at any time from Profile.',
            'You must be at least 13 years old to use OnMyLead, and old enough where you live to agree to these terms.',
          ],
        },
        {
          title: 'Rides and What You Post',
          body: [
            'You own what you post (ride details, routes, messages, photos). You give us permission to store it and show it to the people you choose, so the app can work.',
            'Do not post anything unlawful, harassing or misleading, or anything that puts other riders at risk. Ride organizers decide who joins their rides. You can report a ride or a rider, and we may remove content or close accounts that break these terms.',
          ],
        },
        {
          title: 'Free, Pro and the Free Trial',
          body: [
            'OnMyLead Free costs nothing. It lets you create one ride a month and join as many as you like, and it always includes the safety features.',
            `Every new account gets ${TRIAL_DAYS} days of Pro automatically. The trial needs no payment details and never turns into a paid subscription; when it ends, your account moves to Free and you keep everything you made.`,
            `OnMyLead Pro is ${PRO_PRICES.monthly} a month or ${PRO_PRICES.annual} a year (US prices; other countries may differ). Pro is bought in the iPhone app and charged to your Apple Account when you confirm the purchase.`,
            'Pro renews automatically at the same price for the same period unless you turn off auto-renew at least 24 hours before the current period ends. Your Apple Account is charged for the renewal within the 24 hours before the period ends. You can manage or cancel your subscription in your Apple Account settings. Refunds are handled by Apple under its policies.',
            'If you go back to Free, nothing you made is deleted. Pro-only tools stop being available for new things, and rides past the Free limits stay visible.',
          ],
        },
        {
          title: 'Changes and Availability',
          body: [
            'We keep improving OnMyLead, so features can change. We will tell you in the app before a change to these terms takes effect. The app is provided as it is, without warranties, to the fullest extent the law allows, and our liability is limited to the amount you paid us in the last 12 months.',
            'These terms are governed by the laws of the State of Texas, USA, unless the law where you live says otherwise. Apple is not responsible for the app or these terms, and Apple’s standard Licensed Application End User License Agreement also applies to the iPhone app.',
          ],
        },
        {
          title: 'Contact',
          body: [`${COMPANY}. Contact email to be confirmed before launch.`],
        },
      ]}
    />
  );
}
