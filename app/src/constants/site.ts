/**
 * Facts the onmylead.com showcase and the legal pages share, kept in one place so the prices and
 * the store link only ever change here.
 */

/**
 * The App Store listing. Leave it null until the app is live: the site then says "Coming Soon to
 * iPhone". Once set (e.g. 'https://apps.apple.com/us/app/onmylead/id0000000000'), every download
 * button on the site links straight to it.
 */
export const APP_STORE_URL: string | null = null;

/** Pro prices in US dollars, as set up in App Store Connect (see /pro/plan.md). */
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
