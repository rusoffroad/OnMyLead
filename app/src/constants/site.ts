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

/**
 * Mapbox's public token for the 3D Terrain map (Ride Mode and Map Mode, apps and website). Kept
 * out of this public repo: builds read EXPO_PUBLIC_MAPBOX_TOKEN (app/.env on the Mac, the
 * MAPBOX_PUBLIC_TOKEN Actions variable for the website). Empty: 3D Terrain isn't offered and every
 * map stays as it was.
 */
export const MAPBOX_PUBLIC_TOKEN = '';

/**
 * The 3D Terrain line in the showcase. Off until the app version with 3D Terrain (2.1) is live in
 * the stores and the Mapbox token above is set, so the website never shows what riders can't get.
 */
export const SHOWCASE_3D_TERRAIN: boolean = false;

/**
 * The Map Features line in the showcase (roads, hiking trails and land boundaries you switch on and
 * off). Off until the app version with Map Features (2.1) is live in the stores.
 */
export const SHOWCASE_MAP_FEATURES: boolean = false;

/**
 * The rider dot and Zoom In at Intersections line in the showcase (2.1). Off until that version is
 * live in the stores.
 */
export const SHOWCASE_INTERSECTION_ZOOM: boolean = false;
/**
 * The Leader Trackline line in the showcase (a line behind the leader; older passes fade when the
 * leader crosses back over it). Off until the app version with it (2.1) is live in the stores.
 */
export const SHOWCASE_LEADER_TRACKLINE: boolean = false;
/** The Park Trails line in the showcase. Off until the app version with park trails (2.1) is live in the stores. */
export const SHOWCASE_PARK_TRAILS: boolean = false;
/** The comment likes and replies line in the showcase. Off until the app version with them (2.1) is live in the stores. */
export const SHOWCASE_COMMENT_REPLIES: boolean = false;
