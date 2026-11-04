import { tc } from './i18n';

/**
 * Countries and states for the badge leaderboard (riders pick where they ride from). Codes are
 * what the server stores (migration 20261104050000_badge_leaderboard.sql): ISO 3166-1 alpha-2 for
 * countries, and the part of the ISO 3166-2 code after the dash for states and provinces.
 *
 * States are listed for the countries most OnMyLead riders are in. Riders anywhere else pick just
 * their country, and the leaderboard filters by country there.
 */

export type Country = { code: string; name: string };
export type State = { code: string; name: string };

/** Every country (ISO 3166-1, plus Kosovo), by English name. */
export const COUNTRIES: Country[] = ([
  ["AF", "Afghanistan"],
  ["AX", "Åland Islands"],
  ["AL", "Albania"],
  ["DZ", "Algeria"],
  ["AS", "American Samoa"],
  ["AD", "Andorra"],
  ["AO", "Angola"],
  ["AI", "Anguilla"],
  ["AQ", "Antarctica"],
  ["AG", "Antigua and Barbuda"],
  ["AR", "Argentina"],
  ["AM", "Armenia"],
  ["AW", "Aruba"],
  ["AU", "Australia"],
  ["AT", "Austria"],
  ["AZ", "Azerbaijan"],
  ["BS", "Bahamas"],
  ["BH", "Bahrain"],
  ["BD", "Bangladesh"],
  ["BB", "Barbados"],
  ["BY", "Belarus"],
  ["BE", "Belgium"],
  ["BZ", "Belize"],
  ["BJ", "Benin"],
  ["BM", "Bermuda"],
  ["BT", "Bhutan"],
  ["BO", "Bolivia"],
  ["BA", "Bosnia and Herzegovina"],
  ["BW", "Botswana"],
  ["BV", "Bouvet Island"],
  ["BR", "Brazil"],
  ["IO", "British Indian Ocean Territory"],
  ["VG", "British Virgin Islands"],
  ["BN", "Brunei"],
  ["BG", "Bulgaria"],
  ["BF", "Burkina Faso"],
  ["BI", "Burundi"],
  ["KH", "Cambodia"],
  ["CM", "Cameroon"],
  ["CA", "Canada"],
  ["CV", "Cape Verde"],
  ["BQ", "Caribbean Netherlands"],
  ["KY", "Cayman Islands"],
  ["CF", "Central African Republic"],
  ["TD", "Chad"],
  ["CL", "Chile"],
  ["CN", "China"],
  ["CX", "Christmas Island"],
  ["CC", "Cocos (Keeling) Islands"],
  ["CO", "Colombia"],
  ["KM", "Comoros"],
  ["CG", "Congo - Brazzaville"],
  ["CD", "Congo - Kinshasa"],
  ["CK", "Cook Islands"],
  ["CR", "Costa Rica"],
  ["CI", "Côte d’Ivoire"],
  ["HR", "Croatia"],
  ["CU", "Cuba"],
  ["CW", "Curaçao"],
  ["CY", "Cyprus"],
  ["CZ", "Czechia"],
  ["DK", "Denmark"],
  ["DJ", "Djibouti"],
  ["DM", "Dominica"],
  ["DO", "Dominican Republic"],
  ["EC", "Ecuador"],
  ["EG", "Egypt"],
  ["SV", "El Salvador"],
  ["GQ", "Equatorial Guinea"],
  ["ER", "Eritrea"],
  ["EE", "Estonia"],
  ["SZ", "Eswatini"],
  ["ET", "Ethiopia"],
  ["FK", "Falkland Islands"],
  ["FO", "Faroe Islands"],
  ["FJ", "Fiji"],
  ["FI", "Finland"],
  ["FR", "France"],
  ["GF", "French Guiana"],
  ["PF", "French Polynesia"],
  ["TF", "French Southern Territories"],
  ["GA", "Gabon"],
  ["GM", "Gambia"],
  ["GE", "Georgia"],
  ["DE", "Germany"],
  ["GH", "Ghana"],
  ["GI", "Gibraltar"],
  ["GR", "Greece"],
  ["GL", "Greenland"],
  ["GD", "Grenada"],
  ["GP", "Guadeloupe"],
  ["GU", "Guam"],
  ["GT", "Guatemala"],
  ["GG", "Guernsey"],
  ["GN", "Guinea"],
  ["GW", "Guinea-Bissau"],
  ["GY", "Guyana"],
  ["HT", "Haiti"],
  ["HM", "Heard and McDonald Islands"],
  ["HN", "Honduras"],
  ["HK", "Hong Kong"],
  ["HU", "Hungary"],
  ["IS", "Iceland"],
  ["IN", "India"],
  ["ID", "Indonesia"],
  ["IR", "Iran"],
  ["IQ", "Iraq"],
  ["IE", "Ireland"],
  ["IM", "Isle of Man"],
  ["IL", "Israel"],
  ["IT", "Italy"],
  ["JM", "Jamaica"],
  ["JP", "Japan"],
  ["JE", "Jersey"],
  ["JO", "Jordan"],
  ["KZ", "Kazakhstan"],
  ["KE", "Kenya"],
  ["KI", "Kiribati"],
  ["XK", "Kosovo"],
  ["KW", "Kuwait"],
  ["KG", "Kyrgyzstan"],
  ["LA", "Laos"],
  ["LV", "Latvia"],
  ["LB", "Lebanon"],
  ["LS", "Lesotho"],
  ["LR", "Liberia"],
  ["LY", "Libya"],
  ["LI", "Liechtenstein"],
  ["LT", "Lithuania"],
  ["LU", "Luxembourg"],
  ["MO", "Macao"],
  ["MG", "Madagascar"],
  ["MW", "Malawi"],
  ["MY", "Malaysia"],
  ["MV", "Maldives"],
  ["ML", "Mali"],
  ["MT", "Malta"],
  ["MH", "Marshall Islands"],
  ["MQ", "Martinique"],
  ["MR", "Mauritania"],
  ["MU", "Mauritius"],
  ["YT", "Mayotte"],
  ["MX", "Mexico"],
  ["FM", "Micronesia"],
  ["MD", "Moldova"],
  ["MC", "Monaco"],
  ["MN", "Mongolia"],
  ["ME", "Montenegro"],
  ["MS", "Montserrat"],
  ["MA", "Morocco"],
  ["MZ", "Mozambique"],
  ["MM", "Myanmar (Burma)"],
  ["NA", "Namibia"],
  ["NR", "Nauru"],
  ["NP", "Nepal"],
  ["NL", "Netherlands"],
  ["NC", "New Caledonia"],
  ["NZ", "New Zealand"],
  ["NI", "Nicaragua"],
  ["NE", "Niger"],
  ["NG", "Nigeria"],
  ["NU", "Niue"],
  ["NF", "Norfolk Island"],
  ["KP", "North Korea"],
  ["MK", "North Macedonia"],
  ["MP", "Northern Mariana Islands"],
  ["NO", "Norway"],
  ["OM", "Oman"],
  ["PK", "Pakistan"],
  ["PW", "Palau"],
  ["PS", "Palestinian Territories"],
  ["PA", "Panama"],
  ["PG", "Papua New Guinea"],
  ["PY", "Paraguay"],
  ["PE", "Peru"],
  ["PH", "Philippines"],
  ["PN", "Pitcairn Islands"],
  ["PL", "Poland"],
  ["PT", "Portugal"],
  ["PR", "Puerto Rico"],
  ["QA", "Qatar"],
  ["RE", "Réunion"],
  ["RO", "Romania"],
  ["RU", "Russia"],
  ["RW", "Rwanda"],
  ["WS", "Samoa"],
  ["SM", "San Marino"],
  ["ST", "São Tomé and Príncipe"],
  ["SA", "Saudi Arabia"],
  ["SN", "Senegal"],
  ["RS", "Serbia"],
  ["SC", "Seychelles"],
  ["SL", "Sierra Leone"],
  ["SG", "Singapore"],
  ["SX", "Sint Maarten"],
  ["SK", "Slovakia"],
  ["SI", "Slovenia"],
  ["SB", "Solomon Islands"],
  ["SO", "Somalia"],
  ["ZA", "South Africa"],
  ["GS", "South Georgia and South Sandwich Islands"],
  ["KR", "South Korea"],
  ["SS", "South Sudan"],
  ["ES", "Spain"],
  ["LK", "Sri Lanka"],
  ["BL", "St. Barthélemy"],
  ["SH", "St. Helena"],
  ["KN", "St. Kitts and Nevis"],
  ["LC", "St. Lucia"],
  ["MF", "St. Martin"],
  ["PM", "St. Pierre and Miquelon"],
  ["VC", "St. Vincent and Grenadines"],
  ["SD", "Sudan"],
  ["SR", "Suriname"],
  ["SJ", "Svalbard and Jan Mayen"],
  ["SE", "Sweden"],
  ["CH", "Switzerland"],
  ["SY", "Syria"],
  ["TW", "Taiwan"],
  ["TJ", "Tajikistan"],
  ["TZ", "Tanzania"],
  ["TH", "Thailand"],
  ["TL", "Timor-Leste"],
  ["TG", "Togo"],
  ["TK", "Tokelau"],
  ["TO", "Tonga"],
  ["TT", "Trinidad and Tobago"],
  ["TN", "Tunisia"],
  ["TR", "Türkiye"],
  ["TM", "Turkmenistan"],
  ["TC", "Turks and Caicos Islands"],
  ["TV", "Tuvalu"],
  ["UM", "U.S. Outlying Islands"],
  ["VI", "U.S. Virgin Islands"],
  ["UG", "Uganda"],
  ["UA", "Ukraine"],
  ["AE", "United Arab Emirates"],
  ["GB", "United Kingdom"],
  ["US", "United States"],
  ["UY", "Uruguay"],
  ["UZ", "Uzbekistan"],
  ["VU", "Vanuatu"],
  ["VA", "Vatican City"],
  ["VE", "Venezuela"],
  ["VN", "Vietnam"],
  ["WF", "Wallis and Futuna"],
  ["EH", "Western Sahara"],
  ["YE", "Yemen"],
  ["ZM", "Zambia"],
  ["ZW", "Zimbabwe"],
] as [string, string][]).map(([code, name]) => ({ code, name }));

const s = (pairs: [string, string][]): State[] => pairs.map(([code, name]) => ({ code, name }));

/** States, provinces and territories, for the countries that have them here. */
export const STATES: Record<string, State[]> = {
  US: s([
    ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
    ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'],
    ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
    ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'],
    ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'],
    ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
    ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
    ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
    ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
    ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
  ]),
  CA: s([
    ['AB', 'Alberta'], ['BC', 'British Columbia'], ['MB', 'Manitoba'], ['NB', 'New Brunswick'],
    ['NL', 'Newfoundland and Labrador'], ['NT', 'Northwest Territories'], ['NS', 'Nova Scotia'], ['NU', 'Nunavut'],
    ['ON', 'Ontario'], ['PE', 'Prince Edward Island'], ['QC', 'Quebec'], ['SK', 'Saskatchewan'], ['YT', 'Yukon'],
  ]),
  MX: s([
    ['AGU', 'Aguascalientes'], ['BCN', 'Baja California'], ['BCS', 'Baja California Sur'], ['CAM', 'Campeche'],
    ['CHP', 'Chiapas'], ['CHH', 'Chihuahua'], ['CMX', 'Mexico City'], ['COA', 'Coahuila'], ['COL', 'Colima'],
    ['DUR', 'Durango'], ['GUA', 'Guanajuato'], ['GRO', 'Guerrero'], ['HID', 'Hidalgo'], ['JAL', 'Jalisco'],
    ['MEX', 'State of Mexico'], ['MIC', 'Michoacán'], ['MOR', 'Morelos'], ['NAY', 'Nayarit'], ['NLE', 'Nuevo León'],
    ['OAX', 'Oaxaca'], ['PUE', 'Puebla'], ['QUE', 'Querétaro'], ['ROO', 'Quintana Roo'], ['SLP', 'San Luis Potosí'],
    ['SIN', 'Sinaloa'], ['SON', 'Sonora'], ['TAB', 'Tabasco'], ['TAM', 'Tamaulipas'], ['TLA', 'Tlaxcala'],
    ['VER', 'Veracruz'], ['YUC', 'Yucatán'], ['ZAC', 'Zacatecas'],
  ]),
  AU: s([
    ['ACT', 'Australian Capital Territory'], ['NSW', 'New South Wales'], ['NT', 'Northern Territory'], ['QLD', 'Queensland'],
    ['SA', 'South Australia'], ['TAS', 'Tasmania'], ['VIC', 'Victoria'], ['WA', 'Western Australia'],
  ]),
};

/** What a state is called in each country ("State", "Province"). */
export const STATE_WORD: Record<string, string> = { US: 'State', CA: 'Province', MX: 'State', AU: 'State' };
export const stateWord = (country: string | null | undefined) => (country && STATE_WORD[country]) || tc('State');

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export const countryName = (code: string | null | undefined) => (code ? COUNTRY_BY_CODE.get(code)?.name ?? code : null);
export const statesOf = (country: string | null | undefined): State[] => (country ? STATES[country] ?? [] : []);
export const stateName = (country: string | null | undefined, state: string | null | undefined) =>
  state ? statesOf(country).find((x) => x.code === state)?.name ?? state : null;

/** "Texas, United States", "Iceland", or null when nothing is picked. */
export function areaLabel(country: string | null | undefined, state: string | null | undefined): string | null {
  const c = countryName(country);
  if (!c) return null;
  const st = stateName(country, state);
  return st ? `${st}, ${c}` : c;
}

/** The short form beside a name on the leaderboard: "Texas, US", "Ontario, CA", "Iceland". */
export function areaShort(country: string | null | undefined, state: string | null | undefined): string | null {
  if (!country) return null;
  return state ? `${stateName(country, state)}, ${country}` : countryName(country);
}

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Countries whose name (or code) matches what the rider typed, best matches first. */
export function searchCountries(query: string, list: Country[] = COUNTRIES): Country[] {
  const q = fold(query);
  if (!q) return list;
  const starts: Country[] = [];
  const word: Country[] = [];
  const inside: Country[] = [];
  for (const c of list) {
    const n = fold(c.name);
    if (c.code.toLowerCase() === q || n.startsWith(q)) starts.push(c);
    else if (n.split(' ').some((w) => w.startsWith(q))) word.push(c);
    else if (n.includes(q)) inside.push(c);
  }
  return [...starts, ...word, ...inside];
}

/**
 * The country and state codes for a place the phone looked up (expo-location reverse geocoding):
 * the country's ISO code, and the state as a code ("TX", iOS) or a name ("Texas", Android).
 * A state that isn't in our list is left out rather than guessed.
 */
export function areaFromPlace(place: { isoCountryCode?: string | null; region?: string | null } | null | undefined): { country: string; state: string | null } | null {
  const country = (place?.isoCountryCode ?? '').trim().toUpperCase();
  if (!COUNTRY_BY_CODE.has(country)) return null;
  const region = fold(place?.region ?? '');
  if (!region) return { country, state: null };
  const match = statesOf(country).find((x) => x.code.toLowerCase() === region || fold(x.name) === region);
  return { country, state: match?.code ?? null };
}
