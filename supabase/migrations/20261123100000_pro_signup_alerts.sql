-- New Pro rider emails (supabase/functions/_shared/pro-alert.ts): one row per store subscription
-- and kind of email ('trial' = a store free trial started, 'paid' = the first charge), claimed by
-- the edge functions before they send, so each email goes out once even when the app's sync and
-- the store's notification arrive together. Written only by the service role.
create table if not exists pro_signup_alerts (
  store text not null check (store in ('apple', 'google')),
  subscription_id text not null,
  kind text not null check (kind in ('trial', 'paid')),
  sent_at timestamptz not null default now(),
  primary key (store, subscription_id, kind)
);
alter table pro_signup_alerts enable row level security;
revoke all on pro_signup_alerts from anon, authenticated;

-- Subscriptions already stored before this shipped are not new: mark them as told, so a renewal
-- of an old subscriber never sends "new Pro rider". A subscription still inside a store free
-- trial keeps its 'paid' email for the day the store first charges it.
insert into pro_signup_alerts (store, subscription_id, kind)
select 'apple', original_transaction_id, 'trial' from app_store_subscriptions
on conflict do nothing;
insert into pro_signup_alerts (store, subscription_id, kind)
select 'apple', original_transaction_id, 'paid' from app_store_subscriptions
where not (coalesce(offer_type, 0) = 1 and coalesce(price_milli, 0) = 0)
on conflict do nothing;
insert into pro_signup_alerts (store, subscription_id, kind)
select 'google', purchase_token, 'trial' from play_subscriptions
on conflict do nothing;
insert into pro_signup_alerts (store, subscription_id, kind)
select 'google', s.purchase_token, 'paid' from play_subscriptions s
where s.linked_purchase_token is not null
   or exists (select 1 from play_orders o where o.purchase_token = s.purchase_token and o.price_milli > 0)
   or not exists (select 1 from play_orders o where o.purchase_token = s.purchase_token)
on conflict do nothing;
