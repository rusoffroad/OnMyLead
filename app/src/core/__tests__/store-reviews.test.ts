import { describe, expect, it } from 'vitest';

import {
  csvRecords, mergeReview, mergeReviews, monthsSince, parseAppleReviews, parsePlayReviews, parsePlayReviewsCsv, playReviewsObject,
  reviewIdFromLink, type ReviewRow,
} from '../../../../supabase/functions/_shared/store-reviews';
import {
  canReply, combineTotals, fmtAverage, placeLabel, REPLY_LIMIT as APP_LIMIT, replyProblem, replyStateLabel, starShares, starText,
  type StoreReviewTotals,
} from '../admin-reviews';
import { REPLY_LIMIT } from '../../../../supabase/functions/_shared/store-reviews';

const PKG = 'com.rusoffroad.onmylead.app';

describe('parseAppleReviews', () => {
  const doc = {
    data: [
      {
        type: 'customerReviews', id: 'r1',
        attributes: { rating: 5, title: 'Great for group rides', body: 'Kept the whole crew together.', reviewerNickname: 'trailboss', createdDate: '2026-10-30T12:00:00-07:00', territory: 'USA' },
        relationships: { response: { data: { type: 'customerReviewResponses', id: 'resp1' } } },
      },
      { type: 'customerReviews', id: 'r2', attributes: { rating: 2, title: null, body: '  ', reviewerNickname: 'x', createdDate: '2026-10-29T08:00:00Z', territory: 'CAN' }, relationships: { response: { data: null } } },
      { type: 'customerReviews', id: 'bad', attributes: { rating: 9, createdDate: '2026-10-29T08:00:00Z' } },
    ],
    included: [{ type: 'customerReviewResponses', id: 'resp1', attributes: { responseBody: 'Thanks!', lastModifiedDate: '2026-10-31T10:00:00Z', state: 'PUBLISHED' } }],
    links: { next: 'https://api.appstoreconnect.apple.com/v1/apps/1/customerReviews?cursor=abc' },
  };

  it('reads each review with its reply, skips bad rows and returns the next page', () => {
    const { rows, next } = parseAppleReviews(doc);
    expect(next).toContain('cursor=abc');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      store: 'apple', review_id: 'r1', rating: 5, title: 'Great for group rides', author: 'trailboss', territory: 'USA',
      created_at: '2026-10-30T19:00:00.000Z', reply_body: 'Thanks!', reply_state: 'PUBLISHED', reply_at: '2026-10-31T10:00:00.000Z',
    });
    expect(rows[1]).toMatchObject({ review_id: 'r2', body: null, reply_body: null });
  });

  it('copes with an empty document', () => {
    expect(parseAppleReviews(null)).toEqual({ rows: [], next: null });
  });
});

describe('parsePlayReviews', () => {
  it('reads the user comment, the device and the developer reply', () => {
    const { rows, next } = parsePlayReviews({
      reviews: [
        {
          reviewId: 'gp:AOqp1', authorName: 'Dana',
          comments: [
            { userComment: { text: '\tLove the regroup button', lastModified: { seconds: '1793534400', nanos: 500000000 }, starRating: 4, reviewerLanguage: 'en_US', appVersionName: '1.0.1', appVersionCode: 4, deviceMetadata: { manufacturer: 'Samsung', productName: 'Galaxy S25' } } },
            { developerComment: { text: 'Thanks Dana', lastModified: { seconds: '1793538000' } } },
          ],
        },
        { reviewId: 'gp:none', comments: [] },
      ],
      tokenPagination: { nextPageToken: 'tok2' },
    }, PKG);
    expect(next).toBe('tok2');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      store: 'google', review_id: 'gp:AOqp1', rating: 4, body: 'Love the regroup button', author: 'Dana', language: 'en_US',
      app_version: '1.0.1', device: 'Samsung Galaxy S25', created_at: '2026-11-01T12:00:00.500Z', reply_body: 'Thanks Dana', reply_state: 'PUBLISHED',
    });
    expect(rows[0].link).toContain('reviewId=gp%3AAOqp1');
  });
});

describe('Play reviews report', () => {
  const head = 'Package Name,App Version Code,App Version Name,Reviewer Language,Device,Review Submit Date and Time,Review Submit Millis Since Epoch,Review Last Update Date and Time,Review Last Update Millis Since Epoch,Star Rating,Review Title,Review Text,Developer Reply Date and Time,Developer Reply Millis Since Epoch,Developer Reply Text,Review Link';
  const csv = [
    head,
    `${PKG},4,1.0.1,en,a52q,2026-10-20T10:00:00Z,1792490400000,2026-10-20T10:00:00Z,1792490400000,5,,"Works great, even with ""no service""\nsecond line",,,,http://play.google.com/console/developers/123/app/456/user-feedback/review-details?reviewId=gp%3AAOqpX&corpus=PUBLIC_REVIEWS`,
    `${PKG},4,1.0.1,en,b0q,2026-10-21T10:00:00Z,1792576800000,2026-10-21T10:00:00Z,1792576800000,3,,,,,,`,
    `com.other.app,1,1,en,x,2026-10-21T10:00:00Z,1792576800000,,,1,,nope,,,,`,
  ].join('\r\n');

  it('splits records with quoted commas, quotes and line breaks', () => {
    const recs = csvRecords(csv);
    expect(recs).toHaveLength(4);
    expect(recs[1][11]).toBe('Works great, even with "no service"\nsecond line');
  });

  it('reads rows for the app, ids from the review link, and star-only ratings', () => {
    const rows = parsePlayReviewsCsv(csv, PKG);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ review_id: 'gp:AOqpX', rating: 5, device: 'a52q', app_version: '1.0.1', created_at: '2026-10-20T10:00:00.000Z' });
    expect(rows[1]).toMatchObject({ rating: 3, body: null });
    expect(rows[1].review_id).toMatch(/^report:/);
  });

  it('refuses a file without the columns it needs', () => {
    expect(() => parsePlayReviewsCsv('a,b\n1,2', PKG)).toThrow(/missing columns/);
  });

  it('names the monthly objects and the months to read', () => {
    expect(playReviewsObject(PKG, '202611')).toBe(`reviews/reviews_${PKG}_202611.csv`);
    expect(monthsSince('2026-10-01', new Date('2027-01-15T00:00:00Z'))).toEqual(['202701', '202612', '202611', '202610']);
    expect(monthsSince('2026-10-01', new Date('2026-10-02T00:00:00Z'))).toEqual(['202610']);
    expect(reviewIdFromLink('x?reviewid=abc&y=1')).toBe('abc');
    expect(reviewIdFromLink(null)).toBeNull();
  });
});

const row = (over: Partial<ReviewRow>): ReviewRow => ({
  store: 'google', review_id: 'g1', rating: 4, title: null, body: 'Nice', author: null, territory: null, language: 'en',
  app_version: '1.0.1', device: 'Pixel', created_at: '2026-10-20T00:00:00.000Z', updated_at: '2026-10-20T00:00:00.000Z',
  reply_body: null, reply_at: null, reply_state: null, link: null, ...over,
});

describe('mergeReview', () => {
  it('saves a new review and skips one that did not change', () => {
    const r = row({});
    expect(mergeReview(null, r)).toEqual(r);
    expect(mergeReview(r, { ...r })).toBeNull();
  });

  it('App Store rows always win, so a removed reply goes away', () => {
    const saved = row({ store: 'apple', reply_body: 'Old', reply_at: '2026-10-21T00:00:00.000Z' });
    expect(mergeReview(saved, { ...saved, reply_body: null, reply_at: null })?.reply_body).toBeNull();
  });

  it('Google Play: an older report does not undo a newer edit or a reply posted from the dashboard', () => {
    const saved = row({ rating: 2, body: 'Changed my mind', updated_at: '2026-10-25T00:00:00.000Z', author: 'Dana', reply_body: 'Sorry, fixed in 1.0.2', reply_at: '2026-10-26T00:00:00.000Z' });
    const report = row({ review_id: 'g1', rating: 4, body: 'Nice', updated_at: '2026-10-20T00:00:00.000Z' });
    expect(mergeReview(saved, report)).toBeNull();
  });

  it('Google Play: a newer edit wins, keeping the author and the reply', () => {
    const saved = row({ author: 'Dana', reply_body: 'Thanks', reply_at: '2026-10-21T00:00:00.000Z' });
    const live = row({ rating: 5, body: 'Even better now', updated_at: '2026-10-28T00:00:00.000Z' });
    expect(mergeReview(saved, live)).toMatchObject({ rating: 5, body: 'Even better now', author: 'Dana', reply_body: 'Thanks' });
  });

  it('batches: one write per review, the newest version', () => {
    const out = mergeReviews([], [row({}), row({ rating: 1, updated_at: '2026-10-30T00:00:00.000Z' }), row({ review_id: 'g2' })]);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.review_id === 'g1')?.rating).toBe(1);
  });
});

const totals = (stars: number[], over: Partial<StoreReviewTotals> = {}): StoreReviewTotals => ({
  checked_at: null, ok_at: null, error: null, count: stars.reduce((a, n) => a + n, 0), average: null, written: 0, unanswered: 1, recent_count: 2, recent_average: null, stars, ...over,
});

describe('Store Reviews page helpers', () => {
  it('combines both stores into one average and star counts', () => {
    const t = combineTotals({ apple: totals([3, 1, 0, 0, 0]), google: totals([1, 0, 0, 0, 1]) });
    expect(t.count).toBe(6);
    expect(t.stars).toEqual([4, 1, 0, 0, 1]);
    expect(t.average).toBeCloseTo((4 * 5 + 4 + 1) / 6);
    expect(t.unanswered).toBe(2);
    expect(t.recent).toBe(4);
    expect(combineTotals({}).average).toBeNull();
  });

  it('formats averages and shares', () => {
    expect(fmtAverage(4.666)).toBe('4.7');
    expect(fmtAverage('5.00')).toBe('5.0');
    expect(fmtAverage(null)).toBe('–');
    expect(starShares([1, 1, 0, 0, 2])).toEqual([0.25, 0.25, 0, 0, 0.5]);
    expect(starShares([0, 0, 0, 0, 0])).toEqual([0, 0, 0, 0, 0]);
    expect(starText(3)).toBe('★★★☆☆');
  });

  it('only offers replies the store accepts', () => {
    expect(canReply({ store: 'apple', review_id: '1', body: 'Hi' })).toBe(true);
    expect(canReply({ store: 'apple', review_id: '1', body: ' ' })).toBe(false);
    expect(canReply({ store: 'google', review_id: 'report:1:x', body: 'Hi' })).toBe(false);
    expect(replyProblem('google', '   ')).toMatch(/Write a reply/);
    expect(replyProblem('google', 'x'.repeat(351))).toMatch(/350/);
    expect(replyProblem('apple', 'x'.repeat(351))).toBeNull();
    expect(APP_LIMIT).toEqual(REPLY_LIMIT);
    expect(replyStateLabel('PENDING_PUBLISH')).toBe('Waiting for Apple');
    expect(placeLabel({ territory: 'USA', language: null })).toBe('United States');
    expect(placeLabel({ territory: null, language: 'en_US' })).toBe('en-US');
  });
});
