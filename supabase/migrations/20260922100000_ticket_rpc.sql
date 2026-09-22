-- Write path for tickets (BRIEF §7, atomicity and concurrency).
-- Every mutation of a ticket inserts its event in the same transaction.
-- Transition rules and permissions are validated in TypeScript before calling;
-- these functions guarantee atomicity and the expected-status guard.
-- Idempotent: create or replace.

-- ---------------------------------------------------------------------------
-- create_ticket: inserts the ticket and its `created` event.
-- area_id and priority are copied from the category; location from the requester.
-- ---------------------------------------------------------------------------
create or replace function create_ticket(
  p_requester_id uuid,
  p_title text,
  p_description text,
  p_category_id uuid
)
returns tickets
language plpgsql
as $$
declare
  v_category categories%rowtype;
  v_location_id uuid;
  v_ticket tickets%rowtype;
begin
  select * into v_category from categories where id = p_category_id and active;
  if not found then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;

  select location_id into v_location_id from users where id = p_requester_id;
  if not found then
    raise exception 'requester_not_found' using errcode = 'P0002';
  end if;

  insert into tickets (title, description, category_id, area_id, location_id, requester_id, status, priority)
  values (p_title, p_description, v_category.id, v_category.area_id, v_location_id, p_requester_id, 'open', v_category.default_priority)
  returning * into v_ticket;

  insert into ticket_events (ticket_id, actor_id, type, from_status, to_status, payload)
  values (
    v_ticket.id, p_requester_id, 'created', null, 'open',
    jsonb_build_object('priority', v_category.default_priority, 'priority_source', 'category_default')
  );

  return v_ticket;
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_ticket_transition: status change + event, guarded by expected status.
-- If the ticket is no longer in p_expected_status (someone else moved it),
-- raises ticket_state_conflict and nothing is written.
-- p_assignee_effect: 'assign' (actor becomes assignee), 'unassign', or null.
-- ---------------------------------------------------------------------------
create or replace function apply_ticket_transition(
  p_ticket_id uuid,
  p_actor_id uuid,
  p_expected_status ticket_status,
  p_to_status ticket_status,
  p_event_type ticket_event_type,
  p_assignee_effect text default null,
  p_payload jsonb default '{}'::jsonb
)
returns tickets
language plpgsql
as $$
declare
  v_ticket tickets%rowtype;
begin
  if p_assignee_effect is not null and p_assignee_effect not in ('assign', 'unassign') then
    raise exception 'invalid_assignee_effect' using errcode = '22023';
  end if;

  update tickets
     set status = p_to_status,
         assignee_id = case p_assignee_effect
                         when 'assign' then p_actor_id
                         when 'unassign' then null
                         else assignee_id
                       end,
         resolved_at = case
                         when p_to_status = 'resolved' then now()
                         when p_expected_status = 'resolved' and p_to_status <> 'closed' then null
                         else resolved_at
                       end,
         closed_at = case when p_to_status = 'closed' then now() else closed_at end
   where id = p_ticket_id
     and status = p_expected_status
  returning * into v_ticket;

  if not found then
    if not exists (select 1 from tickets where id = p_ticket_id) then
      raise exception 'ticket_not_found' using errcode = 'P0002';
    end if;
    raise exception 'ticket_state_conflict' using errcode = 'P0001',
      detail = format('expected %s', p_expected_status);
  end if;

  insert into ticket_events (ticket_id, actor_id, type, from_status, to_status, payload)
  values (p_ticket_id, p_actor_id, p_event_type, p_expected_status, p_to_status, coalesce(p_payload, '{}'::jsonb));

  return v_ticket;
end;
$$;

-- Only the server (service role) calls these.
revoke execute on function create_ticket(uuid, text, text, uuid) from anon, authenticated;
revoke execute on function apply_ticket_transition(uuid, uuid, ticket_status, ticket_status, ticket_event_type, text, jsonb) from anon, authenticated;
