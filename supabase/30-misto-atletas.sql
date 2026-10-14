-- ============================================================
--  Play Mista — o que cada atleta tem SO no misto
--  Rode no SQL Editor do Supabase (depois do 29). Pode rodar de novo.
--
--  O cadastro (nome, apelido, foto) continua no campeonato de cada um.
--  Aqui fica o que e do misto e de mais ninguem:
--   - forca_inicial: a forca do campeonato, puxada UMA vez (a "foto"),
--     quando a pessoa aparece no misto pela primeira vez. Dali em diante so
--     os jogos do misto mexem; o campeonato nao mexe mais.
--   - active, pausas, reativada_em: inativar e pausar no misto, sem mexer
--     no campeonato (e o campeonato sem mexer no misto).
-- ============================================================

create table if not exists misto.atletas (
  player_id     text primary key,
  forca_inicial int,
  active        boolean not null default true,
  pausas        jsonb,
  reativada_em  text,
  created_at    timestamptz not null default now()
);

-- todo mundo le (o ranking e publico); so quem tem login escreve
alter table misto.atletas enable row level security;
drop policy if exists "misto atletas leitura" on misto.atletas;
create policy "misto atletas leitura" on misto.atletas for select to anon, authenticated using (true);
drop policy if exists "misto atletas escrita" on misto.atletas;
create policy "misto atletas escrita" on misto.atletas for all to authenticated using (true) with check (true);

grant select, insert, update, delete on misto.atletas to anon, authenticated, service_role;

-- tempo real: pausar ou mudar a forca inicial aparece nos outros celulares
alter table misto.atletas replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'misto' and tablename = 'atletas'
  ) then
    alter publication supabase_realtime add table misto.atletas;
  end if;
end $$;
