-- Quick ride polls: the leader asks one question in the ride chat ("Lunch stop?",
-- "Saturday or Sunday?") with a few choices, and every rider on the ride gets one vote they
-- can change. A poll is an ordinary chat message (body = the question) with a list of
-- choices, so it shows up, notifies and is read exactly like chat.
-- Additive only: one column and check on ride_messages, one insert guard, one restrictive
-- insert rule, one votes table and one voting function. Nothing is dropped or rewritten.

-- ---------------------------------------------------------------------------
-- The poll itself. Null for every ordinary message (and for old app versions, which simply
-- show the question as a chat message).
-- ---------------------------------------------------------------------------
alter table ride_messages add column poll_options text[];
alter table ride_messages add constraint ride_messages_poll_size
  check (poll_options is null or cardinality(poll_options) between 2 and 5);

-- Tidies and checks the choices: trimmed, 1 to 60 characters, no repeats. A poll is always a
-- chat message to everyone (not an announcement, status or leader-only message), and the
-- question is at most 200 characters. Runs after ride_messages_guard (triggers fire by
-- name), so the question is already trimmed.
create or replace function ride_poll_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_options text[];
begin
  if new.poll_options is null then return new; end if;
  if new.kind <> 'chat' or new.audience <> 'everyone' then
    raise exception 'a poll is a chat message to everyone';
  end if;
  if length(new.body) > 200 then raise exception 'poll question too long (200 characters max)'; end if;
  select array_agg(btrim(o) order by n) into v_options from unnest(new.poll_options) with ordinality as t (o, n);
  if exists (select 1 from unnest(v_options) o where o is null or length(o) = 0) then
    raise exception 'poll choice is empty';
  end if;
  if exists (select 1 from unnest(v_options) o where length(o) > 60) then
    raise exception 'poll choice too long (60 characters max)';
  end if;
  if (select count(distinct lower(o)) from unnest(v_options) o) <> cardinality(v_options) then
    raise exception 'poll choices repeat';
  end if;
  new.poll_options := v_options;
  return new;
end;
$$;

create trigger ride_messages_poll_guard before insert on ride_messages
  for each row execute function ride_poll_guard();

-- Only the ride's leader (or an organizer or co-organizer) asks the group. Restrictive, so
-- it is ANDed with messages_write (joined riders posting as themselves).
create policy messages_poll_write on ride_messages as restrictive for insert to authenticated
  with check (poll_options is null or is_ride_leader(ride_id, auth.uid()) or is_ride_manager(ride_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- Votes: one per rider per poll, changeable. Riders on the ride see every vote (that is
-- what makes the live counts work); nobody writes the table directly, only vote_on_poll.
-- ---------------------------------------------------------------------------
create table ride_poll_votes (
  message_id uuid not null references ride_messages (id) on delete cascade,
  ride_id uuid not null references rides (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  choice smallint not null check (choice between 0 and 4),
  voted_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index on ride_poll_votes (ride_id);
alter table ride_poll_votes enable row level security;
create policy poll_votes_read on ride_poll_votes for select to authenticated
  using (is_ride_member(ride_id, auth.uid()));
grant select on ride_poll_votes to authenticated;

-- Casts or changes the signed-in rider's vote. p_choice is the 0-based position of the
-- choice. Only joined riders on the poll's ride can vote.
create or replace function vote_on_poll(p_message uuid, p_choice int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_msg ride_messages;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into v_msg from ride_messages where id = p_message;
  if not found or v_msg.poll_options is null then raise exception 'poll not found'; end if;
  if not is_ride_member(v_msg.ride_id, auth.uid()) then
    raise exception 'only riders on this ride can vote';
  end if;
  if p_choice is null or p_choice < 0 or p_choice >= cardinality(v_msg.poll_options) then
    raise exception 'not one of the poll choices';
  end if;
  insert into ride_poll_votes (message_id, ride_id, user_id, choice)
  values (p_message, v_msg.ride_id, auth.uid(), p_choice)
  on conflict (message_id, user_id) do update set choice = excluded.choice, voted_at = now();
end;
$$;
revoke execute on function vote_on_poll(uuid, int) from public, anon;
grant execute on function vote_on_poll(uuid, int) to authenticated;

-- Live counts. Votes are only ever inserted or updated (never deleted except with their
-- ride or message), so realtime never has to announce a removal.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table ride_poll_votes;
  end if;
end $$;
