import { LegalPage } from '@/components/legal-page';
import { RIDER_AGREEMENT } from '@/core/rider-agreement';

/**
 * onmylead.com/rider-agreement and Profile > Safety Agreement: the full Rider Safety and
 * Liability Agreement every rider accepts on first launch (components/rider-agreement.tsx).
 */
export default function RiderAgreementPage() {
  const a = RIDER_AGREEMENT;
  return (
    <LegalPage
      title={a.title}
      updated={`${a.effective} (version ${a.version})`}
      intro={`${a.summary} Every rider agrees to this the first time they open OnMyLead, and again whenever it changes. We keep a record of each agreement.`}
      sections={[...a.sections.map((s) => ({ title: s.title, body: [s.body] })), { title: 'What You Agree To', body: [a.checkbox] }]}
    />
  );
}
