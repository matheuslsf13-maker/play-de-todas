-- ============================================================
--  Play de Todos (masculino) — as tabelas do app masculino
--  Rode no SQL Editor do Supabase DEPOIS de todos os outros scripts.
--
--  O masculino usa o MESMO projeto e o MESMO login, mas os dados ficam
--  num schema separado, `masculino`, com tabelas de nomes iguais às do
--  feminino (`public`). O app só troca o schema; nenhuma consulta muda.
--
--  O script COPIA a estrutura de hoje (colunas, chaves, índices, regras
--  de acesso e tempo real) a partir do próprio banco, em vez de repetir
--  os 26 scripts. Pode rodar de novo sem estragar nada.
--
--  ⚠️ Depois de rodar, falta UM passo no painel:
--     Project Settings → Data API → Exposed schemas → adicionar `masculino`
-- ============================================================

create schema if not exists masculino;
grant usage on schema masculino to anon, authenticated, service_role;

do $$
declare
  tabelas text[] := array[
    'players', 'sessions', 'matches', 'streak_choices', 'month_closures',
    'checkin_locais', 'checkin_planos', 'checkin_contas', 'checkin_dias',
    'checkins', 'checkin_pagamentos', 'caixa', 'checkin_acertos'
  ];
  t text;
  r record;
begin
  -- sem public no caminho, o Postgres escreve "public.sessions" por extenso
  -- nas definições lidas abaixo -- e aí dá para trocar pelo schema novo
  perform set_config('search_path', 'pg_catalog', true);

  -- 1. as tabelas: colunas, padrões, checks, chave primária e índices
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('create table if not exists masculino.%I (like public.%I including all)', t, t);
  end loop;

  -- 2. chaves estrangeiras (o LIKE não copia), apontando para masculino
  for r in
    select c.conname, cl.relname as tabela, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public' and c.contype = 'f' and cl.relname = any(tabelas)
  loop
    if not exists (
      select 1 from pg_constraint c2
      join pg_class cl2 on cl2.oid = c2.conrelid
      join pg_namespace n2 on n2.oid = cl2.relnamespace
      where n2.nspname = 'masculino' and cl2.relname = r.tabela and c2.conname = r.conname
    ) then
      execute format('alter table masculino.%I add constraint %I %s',
        r.tabela, r.conname, replace(r.def, 'public.', 'masculino.'));
    end if;
  end loop;

  -- 3. regras de acesso: as mesmas do feminino (todo mundo lê, só quem tem
  --    login escreve, e o que é só da organização continua só dela)
  foreach t in array tabelas loop
    if to_regclass('masculino.' || t) is null then continue; end if;
    if (select relrowsecurity from pg_class where oid = to_regclass('public.' || t)) then
      execute format('alter table masculino.%I enable row level security', t);
    end if;
    -- tempo real com a linha inteira, se o feminino usa assim
    if (select relreplident from pg_class where oid = to_regclass('public.' || t)) = 'f' then
      execute format('alter table masculino.%I replica identity full', t);
    end if;
  end loop;

  for r in
    select * from pg_policies where schemaname = 'public' and tablename = any(tabelas)
  loop
    execute format('drop policy if exists %I on masculino.%I', r.policyname, r.tablename);
    execute format('create policy %I on masculino.%I as %s for %s to %s %s %s',
      r.policyname, r.tablename, r.permissive, r.cmd,
      (select string_agg(quote_ident(x), ', ') from unnest(r.roles) x),
      case when r.qual is not null then 'using (' || r.qual || ')' else '' end,
      case when r.with_check is not null then 'with check (' || r.with_check || ')' else '' end);
  end loop;

  -- 4. tempo real: o ranking atualiza sozinho no celular de todo mundo
  foreach t in array tabelas loop
    if to_regclass('masculino.' || t) is null then continue; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'masculino' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table masculino.%I', t);
    end if;
  end loop;
end $$;

-- 5. permissões de tabela iguais às do public no Supabase (quem limita de
--    verdade são as regras de acesso acima)
grant select, insert, update, delete on all tables in schema masculino to anon, authenticated, service_role;
grant usage, select on all sequences in schema masculino to anon, authenticated, service_role;
alter default privileges in schema masculino grant select, insert, update, delete on tables to anon, authenticated, service_role;

-- 6. configuração que não é de pessoa nenhuma: as arenas e os planos
--    (Wellhub/TotalPass) valem igual para os dois campeonatos
insert into masculino.checkin_locais select * from public.checkin_locais on conflict do nothing;
insert into masculino.checkin_planos select * from public.checkin_planos on conflict do nothing;
