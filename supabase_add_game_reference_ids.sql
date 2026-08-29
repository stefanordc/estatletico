-- Mantém a referência do clube adversário fora dos JSONs da partida.
-- Os IDs dos atletas são armazenados nos objetos de lineupGalo e cartoesGalo.
alter table public.jogos
    add column if not exists "adversarioId" bigint;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'jogos_adversarioId_fkey'
          and conrelid = 'public.jogos'::regclass
    ) then
        alter table public.jogos
            add constraint "jogos_adversarioId_fkey"
            foreign key ("adversarioId") references public.adversarios(id);
    end if;
end $$;

create index if not exists jogos_adversario_id_idx
    on public.jogos ("adversarioId");

-- Um atleta pode ter diversos registros (um por temporada). Este é o
-- identificador estável usado para agrupá-los por pessoa.
alter table public.jogadores
    add column if not exists id_jogador bigint;

with grupos as (
    select
        id,
        case
            when nullif(trim(nome_completo), '') is not null and nascimento is not null
                then min(id) over (partition by nome_completo, nascimento)
            else id
        end as id_global
    from public.jogadores
)
update public.jogadores as jogador
set id_jogador = grupos.id_global
from grupos
where jogador.id = grupos.id
  and jogador.id_jogador is distinct from grupos.id_global;

create index if not exists jogadores_id_jogador_idx
    on public.jogadores (id_jogador);

create or replace function public.set_id_jogador()
returns trigger
language plpgsql
as $$
begin
    if nullif(trim(new.nome_completo), '') is not null and new.nascimento is not null then
        select id_jogador
        into new.id_jogador
        from public.jogadores
        where nome_completo = new.nome_completo
          and nascimento = new.nascimento
          and id_jogador is not null
          and id <> new.id
        order by id
        limit 1;
    end if;

    new.id_jogador := coalesce(new.id_jogador, new.id);
    return new;
end;
$$;

drop trigger if exists jogadores_set_id_jogador on public.jogadores;
create trigger jogadores_set_id_jogador
before insert or update of nome_completo, nascimento on public.jogadores
for each row execute function public.set_id_jogador();
