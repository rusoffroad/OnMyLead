/**
 * Facts the onmylead.com showcase and the legal pages share, kept in one place so the prices and
 * the store link only ever change here.
 */

/**
 * The store listings. Every download button on the site links straight to them. Set one back to
 * null to take its buttons off the site (with both null the site says "Coming Soon").
 */
export const APP_STORE_URL: string | null = 'https://apps.apple.com/us/app/onmylead/id6822352321';
export const PLAY_STORE_URL: string | null = 'https://play.google.com/store/apps/details?id=com.rusoffroad.onmylead.app';

/** Pro prices in US dollars, the same in App Store Connect and Google Play Console (see /pro/plan.md). */
export const PRO_PRICES = {
  monthly: '$4.99',
  annual: '$29.99',
  /** The annual plan spread over twelve months. */
  annualPerMonth: '$2.50',
  /** 12 × $4.99 = $59.88 against $29.99 a year. */
  annualSavings: 'Save 50%',
} as const;

/** Days of Pro every new account gets automatically, with no card. */
export const TRIAL_DAYS = 30;

export const COMPANY = 'RUS Offroad LLC';
export const RUS_URL = 'https://rusoffroad.com';

/** Where riders and Apple reach us. Shown on the Support, Terms and Privacy pages. */
export const SUPPORT_EMAIL = 'support@rusoffroad.com';
