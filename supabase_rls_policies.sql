-- Supabase RLS policies for Estatletico.
-- Apply this in the Supabase SQL editor after enabling Email/Password Auth.

begin;

alter table public.adversarios enable row level security;
alter table public.estadios enable row level security;
alter table public.competicoes enable row level security;
alter table public.arbitros enable row level security;
alter table public.jogadores enable row level security;
alter table public.jogos enable row level security;

do $$
declare
    policy_record record;
begin
    for policy_record in
        select schemaname, tablename, policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = any (array['adversarios', 'estadios', 'competicoes', 'arbitros', 'jogadores', 'jogos'])
    loop
        execute format('drop policy if exists %I on %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
    end loop;
end $$;

drop policy if exists "authenticated read adversarios" on public.adversarios;
drop policy if exists "admin insert adversarios" on public.adversarios;
drop policy if exists "admin update adversarios" on public.adversarios;
drop policy if exists "admin delete adversarios" on public.adversarios;
create policy "authenticated read adversarios" on public.adversarios for select to authenticated using (true);
create policy "admin insert adversarios" on public.adversarios for insert to authenticated with check ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');
create policy "admin update adversarios" on public.adversarios for update to authenticated using ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com') with check ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');
create policy "admin delete adversarios" on public.adversarios for delete to authenticated using ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');

drop policy if exists "authenticated read estadios" on public.estadios;
drop policy if exists "admin insert estadios" on public.estadios;
drop policy if exists "admin update estadios" on public.estadios;
drop policy if exists "admin delete estadios" on public.estadios;
create policy "authenticated read estadios" on public.estadios for select to authenticated using (true);
create policy "admin insert estadios" on public.estadios for insert to authenticated with check ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');
create policy "admin update estadios" on public.estadios for update to authenticated using ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com') with check ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');
create policy "admin delete estadios" on public.estadios for delete to authenticated using ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');

drop policy if exists "authenticated read competicoes" on public.competicoes;
drop policy if exists "admin insert competicoes" on public.competicoes;
drop policy if exists "admin update competicoes" on public.competicoes;
drop policy if exists "admin delete competicoes" on public.competicoes;
create policy "authenticated read competicoes" on public.competicoes for select to authenticated using (true);
create policy "admin insert competicoes" on public.competicoes for insert to authenticated with check ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');
create policy "admin update competicoes" on public.competicoes for update to authenticated using ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com') with check ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');
create policy "admin delete competicoes" on public.competicoes for delete to authenticated using ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');

drop policy if exists "authenticated read arbitros" on public.arbitros;
drop policy if exists "admin insert arbitros" on public.arbitros;
drop policy if exists "admin update arbitros" on public.arbitros;
drop policy if exists "admin delete arbitros" on public.arbitros;
create policy "authenticated read arbitros" on public.arbitros for select to authenticated using (true);
create policy "admin insert arbitros" on public.arbitros for insert to authenticated with check ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');
create policy "admin update arbitros" on public.arbitros for update to authenticated using ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com') with check ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');
create policy "admin delete arbitros" on public.arbitros for delete to authenticated using ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');

drop policy if exists "authenticated read jogadores" on public.jogadores;
drop policy if exists "admin insert jogadores" on public.jogadores;
drop policy if exists "admin update jogadores" on public.jogadores;
drop policy if exists "admin delete jogadores" on public.jogadores;
create policy "authenticated read jogadores" on public.jogadores for select to authenticated using (true);
create policy "admin insert jogadores" on public.jogadores for insert to authenticated with check ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');
create policy "admin update jogadores" on public.jogadores for update to authenticated using ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com') with check ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');
create policy "admin delete jogadores" on public.jogadores for delete to authenticated using ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');

drop policy if exists "authenticated read jogos" on public.jogos;
drop policy if exists "admin insert jogos" on public.jogos;
drop policy if exists "admin update jogos" on public.jogos;
drop policy if exists "admin delete jogos" on public.jogos;
create policy "authenticated read jogos" on public.jogos for select to authenticated using (true);
create policy "admin insert jogos" on public.jogos for insert to authenticated with check ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');
create policy "admin update jogos" on public.jogos for update to authenticated using ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com') with check ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');
create policy "admin delete jogos" on public.jogos for delete to authenticated using ((auth.jwt() ->> 'email') = 'stefanobrunofaria@gmail.com');

commit;
