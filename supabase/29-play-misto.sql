-- ============================================================
--  Play Misto — as tabelas do app misto (/misto/)
--  Rode no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.
--
--  O misto guarda SO os plays (sessions, matches, escolhas e fechamentos
--  do mes) num schema proprio, `misto`. Os jogadores continuam no Play de
--  Todas (public) e no Play de Terca (masculino), e o app le dos dois.
--  Os check-ins tambem ficam nos campeonatos.
--
--  ⚠️ Depois de rodar, falta UM passo no painel:
--     Integrations → Data API → Settings → Exposed schemas → adicionar `misto`
-- ============================================================

create schema if not exists misto;
grant usage on schema misto to anon, authenticated, service_role;

do $$
declare
  tabelas text[] := array[
    'sessions', 'matches', 'streak_choices', 'month_closures'
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
    execute format('create table if not exists misto.%I (like public.%I including all)', t, t);
  end loop;

  -- 2. chaves estrangeiras (o LIKE não copia), apontando para misto
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
      where n2.nspname = 'misto' and cl2.relname = r.tabela and c2.conname = r.conname
    ) then
      execute format('alter table misto.%I add constraint %I %s',
        r.tabela, r.conname, replace(r.def, 'public.', 'misto.'));
    end if;
  end loop;

  -- 3. regras de acesso: as mesmas do feminino (todo mundo lê, só quem tem
  --    login escreve, e o que é só da organização continua só dela)
  foreach t in array tabelas loop
    if to_regclass('misto.' || t) is null then continue; end if;
    if (select relrowsecurity from pg_class where oid = to_regclass('public.' || t)) then
      execute format('alter table misto.%I enable row level security', t);
    end if;
    -- tempo real com a linha inteira, se o feminino usa assim
    if (select relreplident from pg_class where oid = to_regclass('public.' || t)) = 'f' then
      execute format('alter table misto.%I replica identity full', t);
    end if;
  end loop;

  for r in
    select * from pg_policies where schemaname = 'public' and tablename = any(tabelas)
  loop
    execute format('drop policy if exists %I on misto.%I', r.policyname, r.tablename);
    execute format('create policy %I on misto.%I as %s for %s to %s %s %s',
      r.policyname, r.tablename, r.permissive, r.cmd,
      (select string_agg(quote_ident(x), ', ') from unnest(r.roles) x),
      case when r.qual is not null then 'using (' || r.qual || ')' else '' end,
      case when r.with_check is not null then 'with check (' || r.with_check || ')' else '' end);
  end loop;

  -- 4. tempo real: o ranking atualiza sozinho no celular de todo mundo
  foreach t in array tabelas loop
    if to_regclass('misto.' || t) is null then continue; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'misto' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table misto.%I', t);
    end if;
  end loop;
end $$;

-- 5. permissões de tabela iguais às do public no Supabase (quem limita de
--    verdade são as regras de acesso acima)
grant select, insert, update, delete on all tables in schema misto to anon, authenticated, service_role;
grant usage, select on all sequences in schema misto to anon, authenticated, service_role;
alter default privileges in schema misto grant select, insert, update, delete on tables to anon, authenticated, service_role;

-- 6. o que so o misto tem: as duplas do rodizio sao mistas (1 homem + 1 mulher)
--    ou livres, escolhido a cada play
alter table misto.sessions add column if not exists duplas_mistas boolean;
