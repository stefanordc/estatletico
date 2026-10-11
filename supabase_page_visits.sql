begin;
create table if not exists public.estatletico_page_visits (
    event_id uuid primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    page text not null check (page in ('dashboard','cadastros','jogos','elenco','jogadores-page','artilheiros','cartoes','adversarios','arbitragem','equipe-arbitragem','estatisticas','comparativo','novo-jogo','curiosidades','configuracoes','publico-renda')),
    visited_at timestamptz not null default now()
);
create index if not exists estatletico_visits_user_date on public.estatletico_page_visits(user_id, visited_at, page);
alter table public.estatletico_page_visits enable row level security;
revoke all on public.estatletico_page_visits from public, anon, authenticated;
grant insert(event_id, page) on public.estatletico_page_visits to authenticated;
drop policy if exists "record own page visit" on public.estatletico_page_visits;
create policy "record own page visit" on public.estatletico_page_visits for insert to authenticated with check (user_id = (select auth.uid()));
create or replace function public.estatletico_record_visit(page_name text, visit_id uuid)
returns void language sql security invoker set search_path = '' as $$
    insert into public.estatletico_page_visits(event_id, page) values (visit_id, page_name) on conflict do nothing;
$$;
revoke all on function public.estatletico_record_visit(text, uuid) from public, anon;
grant execute on function public.estatletico_record_visit(text, uuid) to authenticated;

create or replace function estatletico_private.user_page_accesses(target_user uuid, selected_month date)
returns table(page text, accesses bigint)
language plpgsql security definer set search_path = '' as $$
declare month_start timestamptz; month_end timestamptz;
begin
    if auth.uid() is null or not exists (select 1 from auth.users u where u.id = auth.uid() and lower(u.email) = 'stefanobrunofaria@gmail.com' and u.email_confirmed_at is not null) then
        raise exception 'Apenas o administrador pode consultar acessos.' using errcode = '42501';
    end if;
    if selected_month is null or target_user is null then raise exception 'Informe usuário e mês.'; end if;
    month_start := date_trunc('month', selected_month::timestamp) at time zone 'America/Sao_Paulo';
    month_end := (date_trunc('month', selected_month::timestamp) + interval '1 month') at time zone 'America/Sao_Paulo';
    return query select v.page, count(*) from public.estatletico_page_visits v
        where v.user_id = target_user and v.visited_at >= month_start and v.visited_at < month_end
        group by v.page order by count(*) desc, v.page;
end;
$$;
revoke all on function estatletico_private.user_page_accesses(uuid, date) from public, anon;
grant execute on function estatletico_private.user_page_accesses(uuid, date) to authenticated;
create or replace function public.estatletico_user_page_accesses(target_user uuid, selected_month date)
returns table(page text, accesses bigint) language sql security invoker set search_path = '' as $$
    select * from estatletico_private.user_page_accesses(target_user, selected_month);
$$;
revoke all on function public.estatletico_user_page_accesses(uuid, date) from public, anon;
grant execute on function public.estatletico_user_page_accesses(uuid, date) to authenticated;
notify pgrst, 'reload schema';
commit;
