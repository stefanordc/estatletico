-- Incremental client synchronization for Estatletico.
-- Apply once in the Supabase SQL editor with the project owner role.
begin;

create schema if not exists estatletico_private;

create table if not exists public.estatletico_change_log (
  revision bigint generated always as identity primary key,
  table_name text not null check (table_name in ('adversarios', 'arbitros', 'competicoes', 'estadios', 'jogadores', 'jogos')),
  row_id text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  occurred_at timestamptz not null default now()
);
create index if not exists estatletico_change_log_occurred_at_idx on public.estatletico_change_log (occurred_at);
alter table public.estatletico_change_log enable row level security;
drop policy if exists "authenticated read estatletico change log" on public.estatletico_change_log;
create policy "authenticated read estatletico change log"
  on public.estatletico_change_log for select to authenticated using (true);

create or replace function estatletico_private.purge_change_log()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.estatletico_change_log where occurred_at < now() - interval '35 days';
end;
$$;
revoke all on function estatletico_private.purge_change_log() from public;

create or replace function estatletico_private.capture_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row_id text;
  v_revision bigint;
begin
  if tg_op = 'UPDATE' and new is not distinct from old then return null; end if;
  v_row_id := case when tg_op = 'DELETE' then old.id::text else new.id::text end;
  insert into public.estatletico_change_log (table_name, row_id, operation)
    values (tg_table_name, v_row_id, tg_op)
    returning revision into v_revision;
  perform realtime.send(
    jsonb_build_object('revision', v_revision, 'table', tg_table_name, 'id', v_row_id, 'operation', tg_op),
    'change', 'estatletico:sync', true
  );
  return null;
end;
$$;
revoke all on function estatletico_private.capture_change() from public;

drop trigger if exists estatletico_capture_change on public.adversarios;
create trigger estatletico_capture_change after insert or update or delete on public.adversarios for each row execute function estatletico_private.capture_change();
drop trigger if exists estatletico_capture_change on public.arbitros;
create trigger estatletico_capture_change after insert or update or delete on public.arbitros for each row execute function estatletico_private.capture_change();
drop trigger if exists estatletico_capture_change on public.competicoes;
create trigger estatletico_capture_change after insert or update or delete on public.competicoes for each row execute function estatletico_private.capture_change();
drop trigger if exists estatletico_capture_change on public.estadios;
create trigger estatletico_capture_change after insert or update or delete on public.estadios for each row execute function estatletico_private.capture_change();
drop trigger if exists estatletico_capture_change on public.jogadores;
create trigger estatletico_capture_change after insert or update or delete on public.jogadores for each row execute function estatletico_private.capture_change();
drop trigger if exists estatletico_capture_change on public.jogos;
create trigger estatletico_capture_change after insert or update or delete on public.jogos for each row execute function estatletico_private.capture_change();

drop policy if exists "authenticated receive estatletico sync broadcasts" on realtime.messages;
create policy "authenticated receive estatletico sync broadcasts"
  on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'estatletico:sync' and extension = 'broadcast');

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$
      select cron.schedule('estatletico-purge-change-log', '15 3 * * *', 'select estatletico_private.purge_change_log()')
      where not exists (select 1 from cron.job where jobname = 'estatletico-purge-change-log')
    $cron$;
  end if;
end;
$$;

commit;
