/**
 * Data for the Admin Dashboard's Store Reviews page: admin_reviews() in migration
 * 20261101000000_store_reviews.sql and the store-reviews edge function. Every call is refused by
 * the server unless the caller is an admin with an authenticator session.
 */
import type { StoreKey } from '@/core/admin-growth';
import type { Review, StoreReviewTotals } from '@/core/admin-reviews';
import { adminFn, adminRpc } from './admin';

export type StoreFilter = 'all' | StoreKey;
export type ReplyFilter = 'all' | 'unanswered' | 'answered';

export type ReviewsPage = { rows: Review[]; total: number; stores: Record<StoreKey, StoreReviewTotals> };

export type ReviewConfig = { configured: Record<StoreKey, boolean> & { google_history?: boolean } };

export const reviews = (store: StoreFilter, stars: number | null, reply: ReplyFilter, q: string, page: number, pageSize = 30) =>
  adminRpc<ReviewsPage>('admin_reviews', { p_store: store, p_stars: stars, p_reply: reply, p_q: q, p_page: page, p_page_size: pageSize });

/** Which stores have their keys set on the server. */
export const reviewStatus = () => adminFn<ReviewConfig>('store-reviews', 'status');

/** Reads the stores again (the function skips a store read in the last 15 minutes unless forced). */
export const refreshReviews = (force = false) =>
  adminFn<ReviewConfig & { results: Record<StoreKey, unknown> }>('store-reviews', 'refresh', { force });

/** Posts (or replaces) the public reply to a review on its store. */
export const replyToReview = (store: StoreKey, reviewId: string, text: string) =>
  adminFn<{ ok: true; state: string }>('store-reviews', 'reply', { store, review_id: reviewId, text });
