-- Priority change (BRIEF §8): agent or supervisor of the area adjusts the
-- priority with a reason; the change is recorded as a priority_changed event.
-- Permission and status rules are validated in TypeScript; this function
-- guarantees atomicity and guards against a concurrent change.
-- Idempotent: create or replace.

create or replace function change_ticket_priority(
  p_ticket_id uuid,
  p_actor_id uuid,
  p_expected_priority ticket_priority,
  p_new_priority ticket_priority,
  p_reason text
)
returns tickets
language plpgsql
as $$
declare
  v_ticket tickets%rowtype;
begin
  if p_new_priority = p_expected_priority then
    raise exception 'priority_unchanged' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  update tickets
     set priority = p_new_priority
   where id = p_ticket_id
     and priority = p_expected_priority
     and status in ('open', 'in_progress', 'waiting')
  returning * into v_ticket;

  if not found then
    if not exists (select 1 from tickets where id = p_ticket_id) then
      raise exception 'ticket_not_found' using errcode = 'P0002';
    end if;
    raise exception 'ticket_state_conflict' using errcode = 'P0001',
      detail = format('expected priority %s in an editable status', p_expected_priority);
  end if;

  insert into ticket_events (ticket_id, actor_id, type, from_status, to_status, payload)
  values (
    p_ticket_id, p_actor_id, 'priority_changed', null, null,
    jsonb_build_object('from', p_expected_priority, 'to', p_new_priority, 'reason', btrim(p_reason))
  );

  return v_ticket;
end;
$$;

-- Only the server (service role) calls these. Postgres grants execute to
-- PUBLIC by default, so revoking from anon/authenticated alone (as the phase 2
-- migration did) is not enough: revoke from PUBLIC too, for all three RPCs.
revoke execute on function change_ticket_priority(uuid, uuid, ticket_priority, ticket_priority, text) from public, anon, authenticated;
revoke execute on function create_ticket(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function apply_ticket_transition(uuid, uuid, ticket_status, ticket_status, ticket_event_type, text, jsonb) from public, anon, authenticated;
grant execute on function change_ticket_priority(uuid, uuid, ticket_priority, ticket_priority, text) to service_role;
grant execute on function create_ticket(uuid, text, text, uuid) to service_role;
grant execute on function apply_ticket_transition(uuid, uuid, ticket_status, ticket_status, ticket_event_type, text, jsonb) to service_role;
