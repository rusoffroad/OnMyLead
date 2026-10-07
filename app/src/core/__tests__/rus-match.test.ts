import { describe, expect, it } from 'vitest';
import {
  buyUrl, categoryHits, categoryVehicle, decodeEntities, fitment, formatPrice, isRusUrl, matchProducts, parseStoreProducts,
  storeUrl, vehicleMatches, withParams,
} from '../rus-match';

// Shaped like the real https://rusoffroad.com/wp-json/wc/store/v1/products response (Oct 2026).
const cat = (id: number, name: string, slug: string) => ({ id, name, slug, link: `https://rusoffroad.com/product-category/${slug}/` });
const ALL_VEHICLES = [
  cat(143, 'Can-Am (All Models)', 'can-am-all-models'), cat(329, 'Can-Am Defender HD11', 'can-am-defender-hd11'),
  cat(307, 'Can-Am X3', 'can-am-x3'), cat(133, 'Polaris RZR XP4 (2014-2023)', 'polaris-rzr-xp4-2014-2023'),
  cat(306, 'Ranger 1000', 'ranger-1000'), cat(132, 'RZR Pro R', 'polaris-rzr-pro-r'),
];
const API = [
  {
    id: 35677, name: 'Security Cable for Starlink Mini Mount v2', type: 'simple',
    permalink: 'https://rusoffroad.com/product/security-cable-for-starlink-mini-mount-v2/',
    short_description: '<p>Locks your Mini &amp; mount.</p>',
    prices: { price: '1500', regular_price: '1500', currency_code: 'USD', currency_minor_unit: 2 },
    images: [{ id: 1, src: 'https://rusoffroad.com/wp-content/uploads/2026/09/cable.webp', thumbnail: 'https://rusoffroad.com/wp-content/uploads/2026/09/cable-300x300.webp' }],
    categories: [cat(332, 'Starlink', 'starlink')], tags: [],
    is_purchasable: true, is_in_stock: true, has_options: false,
  },
  {
    id: 35665, name: 'Battery &#8211; Starlink Mini &#8211; PeakDo LinkPower 2 Battery', type: 'simple',
    permalink: 'https://rusoffroad.com/product/battery-starlink-mini/',
    prices: { price: '25900', currency_minor_unit: 2 },
    images: [{ src: 'https://rusoffroad.com/wp-content/uploads/battery.webp' }],
    categories: [...ALL_VEHICLES, cat(332, 'Starlink', 'starlink'), cat(268, 'Universal', 'universal'), cat(121, 'SxS Equipment', 'sxs-equipment')],
    tags: [], is_purchasable: true, is_in_stock: true, has_options: false,
  },
  {
    id: 35588, name: 'Starlink Mini Mount V2 &#8211; MoreLock&#8482; Series', type: 'variable',
    permalink: 'https://rusoffroad.com/product/starlink-mini-mount-v2/',
    prices: { price: '24900', currency_minor_unit: 2 }, images: [],
    categories: [cat(185, 'Packout Mounts', 'milwaukee-packout-mounts'), cat(132, 'RZR Pro R', 'polaris-rzr-pro-r'), cat(329, 'Can-Am Defender HD11', 'can-am-defender-hd11')],
    tags: [], is_purchasable: true, is_in_stock: true, has_options: false,
  },
  {
    id: 30001, name: 'XP4 Bed Storage Box', type: 'simple', permalink: 'https://rusoffroad.com/product/xp4-box/',
    prices: { price: '39900', currency_minor_unit: 2 }, images: [],
    categories: [cat(133, 'Polaris RZR XP4 (2014-2023)', 'polaris-rzr-xp4-2014-2023'), cat(235, 'Bed Storage', 'bed-storage')],
    tags: [], is_purchasable: true, is_in_stock: true,
  },
  {
    id: 30002, name: 'Ranger Cooler Mount', type: 'simple', permalink: 'https://rusoffroad.com/product/ranger-cooler/',
    prices: { price: '18900', currency_minor_unit: 2 }, images: [],
    categories: [cat(312, 'Ranger', 'ranger'), cat(181, 'Cooler Mounts', 'cooler-mounts')], tags: [{ name: 'Cooler' }],
    is_purchasable: true, is_in_stock: true,
  },
  {
    id: 30003, name: 'Sold Out Tee', type: 'simple', permalink: 'https://rusoffroad.com/product/tee/',
    prices: { price: '2500', currency_minor_unit: 2 }, images: [], categories: [cat(237, 'Apparel', 'apparel')], tags: [],
    is_purchasable: true, is_in_stock: false,
  },
  // Malformed or off-site rows are dropped.
  { id: 1, name: 'Phish', permalink: 'https://evil.example/product/x' },
  { id: 'nope', name: 'Bad id', permalink: 'https://rusoffroad.com/x' },
  { id: 2, name: '', permalink: 'https://rusoffroad.com/x' },
  null,
];

const products = parseStoreProducts(API);
const byId = (id: number) => products.find((p) => p.id === id)!;

describe('parsing the Store API', () => {
  it('keeps valid on-site products and normalizes them', () => {
    expect(products.map((p) => p.id)).toEqual([35677, 35665, 35588, 30001, 30002, 30003]);
    const cable = byId(35677);
    expect(cable.priceCents).toBe(1500);
    expect(cable.image).toBe('https://rusoffroad.com/wp-content/uploads/2026/09/cable-300x300.webp');
    expect(cable.summary).toBe('Locks your Mini & mount.');
    expect(cable.hasOptions).toBe(false);
    expect(byId(35665).name).toBe('Battery – Starlink Mini – PeakDo LinkPower 2 Battery');
    expect(byId(35588).name).toBe('Starlink Mini Mount V2 – MoreLock™ Series');
    expect(byId(35588).hasOptions).toBe(true);
    expect(byId(35588).image).toBeNull();
    expect(byId(30003).inStock).toBe(false);
    expect(parseStoreProducts({ code: 'rest_no_route' })).toEqual([]);
  });

  it('handles other currency minor units', () => {
    expect(parseStoreProducts([{ ...API[0], prices: { price: '15', currency_minor_unit: 0 } }])[0].priceCents).toBe(1500);
    expect(parseStoreProducts([{ ...API[0], prices: { price: 'abc' } }])[0].priceCents).toBeNull();
  });

  it('decodes entities and only trusts rusoffroad.com links', () => {
    expect(decodeEntities('A &amp; B &#8211; C&#x2122; &nbsp;&bogus;')).toBe('A & B – C™  &bogus;');
    expect(isRusUrl('https://rusoffroad.com/product/x/')).toBe(true);
    expect(isRusUrl('https://www.rusoffroad.com/')).toBe(true);
    expect(isRusUrl('http://rusoffroad.com/')).toBe(false);
    expect(isRusUrl('https://rusoffroad.com.evil.example/')).toBe(false);
  });
});

describe('vehicle fitment', () => {
  it('reads vehicle categories', () => {
    expect(categoryVehicle({ slug: 'x', name: 'Polaris RZR XP4 (2014-2023)' })).toEqual({ make: 'polaris', tokens: ['rzr', 'xp', '4'], years: [2014, 2023] });
    expect(categoryVehicle({ slug: 'x', name: 'RZR Pro R' })).toEqual({ make: 'polaris', tokens: ['rzr', 'pro', 'r'], years: null });
    expect(categoryVehicle({ slug: 'x', name: 'Can-Am (All Models)' })).toEqual({ make: 'canam', tokens: [], years: null });
    expect(categoryVehicle({ slug: 'x', name: 'Kawasaki TERYX 4 H2' })!.make).toBe('kawasaki');
    expect(categoryVehicle({ slug: 'x', name: 'Bed Storage' })).toBeNull();
    expect(categoryVehicle({ slug: 'x', name: 'Universal' })).toBeNull();
    expect(categoryVehicle({ slug: 'x', name: 'MoreLock Triple Mount Series' })).toBeNull();
  });

  it('matches a rider\'s machine by make, model words and year', () => {
    const xp4 = categoryVehicle({ slug: 'x', name: 'Polaris RZR XP4 (2014-2023)' })!;
    expect(vehicleMatches(xp4, { make: 'Polaris', model: 'RZR XP 4 1000', year: 2019 })).toBe(true);
    expect(vehicleMatches(xp4, { make: 'POLARIS', model: 'RZR XP4 Turbo', year: null })).toBe(true);
    expect(vehicleMatches(xp4, { make: 'Polaris', model: 'RZR XP 4 1000', year: 2024 })).toBe(false);
    expect(vehicleMatches(xp4, { make: 'Polaris', model: 'RZR Pro R', year: 2022 })).toBe(false);

    const proR = categoryVehicle({ slug: 'x', name: 'RZR Pro R' })!;
    expect(vehicleMatches(proR, { make: 'Polaris', model: 'RZR Pro R', trim: 'Ultimate' })).toBe(true);
    expect(vehicleMatches(proR, { make: 'Polaris', model: 'RZR Pro XP' })).toBe(false);

    const ranger = categoryVehicle({ slug: 'x', name: 'Ranger' })!;
    expect(vehicleMatches(ranger, { make: 'Polaris', model: 'Ranger XP 1000' })).toBe(true);
    expect(vehicleMatches(ranger, { make: 'Ford', model: 'Ranger' })).toBe(false);
    expect(vehicleMatches(categoryVehicle({ slug: 'x', name: 'Can-Am X3' })!, { make: 'BMW', model: 'X3' })).toBe(false);
    expect(vehicleMatches(categoryVehicle({ slug: 'x', name: 'Can-Am X3' })!, { make: 'Can-Am', model: 'Maverick X3 Max RS' })).toBe(true);
    expect(vehicleMatches(categoryVehicle({ slug: 'x', name: 'Can-Am Defender HD11' })!, { make: 'Can Am', model: 'Defender MAX HD10' })).toBe(false);

    const allCanAm = categoryVehicle({ slug: 'x', name: 'Can-Am (All Models)' })!;
    expect(vehicleMatches(allCanAm, { make: 'CAN-AM', model: 'Commander' })).toBe(true);
    expect(vehicleMatches(allCanAm, { make: 'Polaris', model: 'RZR' })).toBe(false);
    expect(vehicleMatches(allCanAm, { make: null, model: 'Commander' })).toBe(false);
  });

  it('treats universal and uncategorized gear as fitting anything', () => {
    expect(fitment(byId(35677), null)).toEqual({ universal: true, specific: false, fits: true });
    expect(fitment(byId(35665), { make: 'Polaris', model: 'RZR Pro R' })).toEqual({ universal: true, specific: true, fits: true });
    expect(fitment(byId(30001), { make: 'Polaris', model: 'RZR Pro R' }).fits).toBe(false);
    expect(fitment(byId(30001), null).fits).toBe(false);
  });
});

describe('suggestions', () => {
  it('ranks gear for a machine, vehicle-specific first, nothing that does not fit', () => {
    const s = matchProducts(products, { vehicle: { make: 'Polaris', model: 'RZR Pro R', trim: 'Ultimate', year: 2022 } });
    expect(s.map((x) => x.product.id)).toEqual([35588, 35665, 35677]);
    expect(s[0].reason).toBe('Fits your Polaris RZR Pro R');
    expect(s[2].reason).toBe('Fits most machines');
  });

  it('without a vehicle, only suggests gear that fits anything', () => {
    expect(matchProducts(products).map((x) => x.product.id)).toEqual([35665, 35677]);
    expect(matchProducts(products, { vehicle: { make: null, model: null } }).map((x) => x.product.id)).toEqual([35665, 35677]);
  });

  it('filters to checklist categories and skips sold-out gear', () => {
    const ranger = { make: 'Polaris', model: 'Ranger 1000', year: 2023 };
    expect(matchProducts(products, { vehicle: ranger, categories: ['food_water'] }).map((x) => x.product.id)).toEqual([30002]);
    expect(matchProducts(products, { vehicle: ranger, categories: ['power_starlink'] }).map((x) => x.product.id)).toEqual([35665, 35677]);
    expect(matchProducts(products, { categories: ['clothing'] })).toEqual([]);
    expect(matchProducts(products, { categories: ['documents'] })).toEqual([]);
    expect(matchProducts(products, { limit: 1 })).toHaveLength(1);
    expect(categoryHits(byId(30002), ['camping', 'food_water', 'recovery'])).toBe(2);
  });
});

describe('links', () => {
  it('appends attribution and add-to-cart only for simple products', () => {
    expect(buyUrl(byId(35677), 'trip checklist')).toBe(
      'https://rusoffroad.com/product/security-cable-for-starlink-mini-mount-v2/?add-to-cart=35677&utm_source=onmylead&utm_medium=app&utm_campaign=trip_checklist',
    );
    expect(buyUrl(byId(35588), 'garage_vehicle')).toBe(
      'https://rusoffroad.com/product/starlink-mini-mount-v2/?utm_source=onmylead&utm_medium=app&utm_campaign=garage_vehicle',
    );
    expect(withParams('https://rusoffroad.com/p/?a=1#top', { b: '2 3' })).toBe('https://rusoffroad.com/p/?a=1&b=2%203#top');
    expect(storeUrl('ride page')).toBe('https://rusoffroad.com/?utm_source=onmylead&utm_medium=app&utm_campaign=ride_page');
  });

  it('formats prices', () => {
    expect(formatPrice(1500)).toBe('$15');
    expect(formatPrice(25950)).toBe('$259.50');
    expect(formatPrice(123400)).toBe('$1,234');
    expect(formatPrice(null)).toBeNull();
  });
});
