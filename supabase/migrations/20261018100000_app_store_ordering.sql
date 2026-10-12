-- StoreKit 2 subscriptions (appstore-verify and appstore-notifications edge functions).
--
-- Apple can deliver App Store Server Notifications out of order and retries failed ones, and the
-- app can verify a transaction at the same moment a notification arrives. last_signed_at is the
-- signing time of the newest Apple message stored for a subscription; the functions only update a
-- row when what they hold was signed at or after it, so older news never replaces newer.
alter table app_store_subscriptions add column if not exists last_signed_at timestamptz;

-- has_pro() and the dashboard look subscriptions up by account.
create index if not exists app_store_subscriptions_user_id_idx on app_store_subscriptions (user_id);
