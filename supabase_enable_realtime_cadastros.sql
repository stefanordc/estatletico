-- Mantém todos os cadastros e jogos sincronizados entre as sessões abertas.
-- Pode ser executado mais de uma vez com segurança.
do $$
declare
    table_name text;
begin
    if not exists (
        select 1 from pg_publication where pubname = 'supabase_realtime'
    ) then
        execute 'create publication supabase_realtime';
    end if;

    -- Publicações FOR ALL TABLES já incluem os registros abaixo.
    if exists (
        select 1 from pg_publication
        where pubname = 'supabase_realtime' and puballtables
    ) then
        return;
    end if;

    foreach table_name in array array[
        'adversarios', 'estadios', 'competicoes', 'arbitros', 'jogadores', 'jogos'
    ] loop
        if not exists (
            select 1
            from pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = table_name
        ) then
            execute format(
                'alter publication supabase_realtime add table public.%I',
                table_name
            );
        end if;
    end loop;
end;
$$;
