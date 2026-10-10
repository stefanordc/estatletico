-- Somente o e-mail administrador pode consultar dados de autenticação.
begin;
create schema if not exists estatletico_private;
revoke all on schema estatletico_private from public, anon;
grant usage on schema estatletico_private to authenticated;

create or replace function estatletico_private.list_users(page_offset integer, page_size integer)
returns table (id uuid, nome text, email text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
    if auth.uid() is null or not exists (
        select 1 from auth.users u where u.id = auth.uid()
        and lower(u.email) = 'stefanobrunofaria@gmail.com'
        and u.email_confirmed_at is not null
    ) then
        raise exception 'Apenas o administrador pode consultar usuários.' using errcode = '42501';
    end if;
    if page_offset < 0 or page_size < 1 or page_size > 500 or page_offset is null or page_size is null then
        raise exception 'Paginação inválida.' using errcode = '22023';
    end if;
    return query select u.id,
        coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'full_name', '')::text,
        u.email::text, u.created_at, u.last_sign_in_at
        from auth.users u order by u.created_at desc, u.id
        limit page_size offset page_offset;
end;
$$;
revoke all on function estatletico_private.list_users(integer, integer) from public, anon;
grant execute on function estatletico_private.list_users(integer, integer) to authenticated;

create or replace function public.estatletico_list_users(page_offset integer default 0, page_size integer default 500)
returns table (id uuid, nome text, email text, created_at timestamptz, last_sign_in_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from estatletico_private.list_users(page_offset, page_size); $$;
revoke all on function public.estatletico_list_users(integer, integer) from public, anon;
grant execute on function public.estatletico_list_users(integer, integer) to authenticated;
notify pgrst, 'reload schema';
commit;
