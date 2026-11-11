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

/**
 * App Store Connect's provider token (App Analytics > Campaigns > Generate a link: the pt= number).
 * With it, website store buttons carry the visitor's ad campaign, so App Store Connect can show
 * downloads by campaign. Not secret. Null leaves Apple links plain (lib/found-us.ts).
 */
export const APP_STORE_PROVIDER_TOKEN: string | null = null;

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

/*
 * The 2.1 showcase lines below were switched on for the 2.1 launch (2026-11-06, build 10). The
 * website is deployed with them only once 2.1 is live in the App Store and Google Play.
 */

/**
 * The 3D Terrain line in the showcase. Off until the app version with 3D Terrain (2.1) is live in
 * the stores and the Mapbox token above is set, so the website never shows what riders can't get.
 */
export const SHOWCASE_3D_TERRAIN: boolean = true;

/**
 * The Map Features line in the showcase (roads, hiking trails and land boundaries you switch on and
 * off). Off until the app version with Map Features (2.1) is live in the stores.
 */
export const SHOWCASE_MAP_FEATURES: boolean = true;

/**
 * The rider dot and Zoom In at Intersections line in the showcase (2.1). Off until that version is
 * live in the stores.
 */
export const SHOWCASE_INTERSECTION_ZOOM: boolean = true;
/**
 * The Leader Trackline line in the showcase (a line behind the leader; older passes fade when the
 * leader crosses back over it). Off until the app version with it (2.1) is live in the stores.
 */
export const SHOWCASE_LEADER_TRACKLINE: boolean = true;
/** The group spread ruler line in the showcase (leader-to-last-rider distance under the leader line). Off until 2.1 is live in the stores. */
export const SHOWCASE_SPREAD_RULER: boolean = true;
/** The Park Trails line in the showcase. Off until the app version with park trails (2.1) is live in the stores. */
export const SHOWCASE_PARK_TRAILS: boolean = true;
/** The comment likes and replies line in the showcase. Off until the app version with them (2.1) is live in the stores. */
export const SHOWCASE_COMMENT_REPLIES: boolean = true;
/** The Emergency Siren line in the showcase. Off until the app version with the siren (2.1 build 10) is live in the stores. */
export const SHOWCASE_EMERGENCY_SIREN: boolean = true;
/**
 * The No Service section on the homepage (Bluetooth Sharing: riders pass spots, status taps,
 * EMERGENCY and messages phone to phone with no cell service), its hero link and nav link. Off
 * until the app version with Bluetooth Sharing (2.1) is live in the stores. Also adds the 2.1 Pro
 * lines to the Free vs Pro table (Bluetooth Sharing, Group Photos, Custom Dots).
 */
export const SHOWCASE_NO_SERVICE: boolean = true;
/** The Group Photos line in the showcase. Off until the app version with group photos (2.1) is live in the stores. */
export const SHOWCASE_GROUP_PHOTOS: boolean = true;
/** The Crop Every Photo line in the showcase. Off until the app version with the crop screen (3.0) is live in the stores. */
export const SHOWCASE_PHOTO_CROP: boolean = true;
/**
 * The 3.0 redesign lines in the showcase (Home leads with Map Mode, Customize Home, and Make It a
 * Group Ride from a solo Map Mode ride). Off until the app version with them (3.0) is live in the stores.
 */
export const SHOWCASE_REDESIGN_3: boolean = true;
