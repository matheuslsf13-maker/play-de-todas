-- ============================================================
--  15 · Check-ins: contas de passe, dias, lançamentos, pagamentos e caixa
--
--  Rode o arquivo INTEIRO no SQL Editor (a última linha é "order by 1;").
--  Pode rodar quantas vezes quiser: tudo aqui é "se não existir".
--
--  Cada conta de passe (Wellhub/TotalPass) dá 12 check-ins por mês; as aulas
--  gastam 8 (1x/semana) ou 12 (2x) e o que sobra paga o play. Quem esgota a
--  conta usa a de outra pessoa (conta secundária).
--
--  Quatro tabelas são públicas para leitura, como o resto do app. Duas NÃO:
--  checkin_pagamentos e caixa (dinheiro) só quem está logada lê — a chave
--  anon é pública, então esta política é a única cerca. Por isso o RLS vem
--  logo depois das tabelas, antes de qualquer outra coisa.
--
--  Nada aqui recusa o que a tela aceitou (sem unique dia+atleta, FKs "set
--  null"): uma escrita recusada travaria a fila de envio do app para sempre.
-- ============================================================

-- ---- 1. as tabelas
create table if not exists public.checkin_locais (
  id     text primary key,
  nome   text not null,
  ativo  boolean not null default true,
  ordem  int not null default 0
);

create table if not exists public.checkin_contas (
  id              text primary key,
  player_id       text not null references public.players(id) on delete cascade,
  nome            text not null default '',   -- vazio na principal (é a própria menina)
  principal       boolean not null default false,
  tipo            text not null default 'wellhub',
  aulas_semana    int,                        -- nulo = não informou
  local_padrao_id text references public.checkin_locais(id) on delete set null,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.checkin_dias (
  id                 text primary key,
  date               date not null,
  session_id         text references public.sessions(id) on delete set null,  -- o play do dia (não é sessão de login)
  titulo             text,
  valor_cheio        numeric(10,2) not null default 0,
  valor_com_checkin  numeric(10,2) not null default 0,
  created_at         timestamptz not null default now()
);

create table if not exists public.checkins (
  id                  text primary key,
  dia_id              text not null references public.checkin_dias(id) on delete cascade,
  player_id           text not null,   -- sem FK de propósito: o relatório da arena sobrevive a um cadastro apagado
  conta_id            text references public.checkin_contas(id) on delete set null,  -- nulo = conta principal
  local_id            text references public.checkin_locais(id) on delete set null,
  modo                text not null default 'checkin',
  compareceu          boolean not null default true,
  checkin_confirmado  boolean not null default false,
  created_at          timestamptz not null default now()
);

create table if not exists public.checkin_pagamentos (
  checkin_id            text primary key references public.checkins(id) on delete cascade,
  valor_pago            numeric(10,2) not null default 0,
  valor_devido          numeric(10,2),   -- preço combinado diferente do dia; nulo = o do dia
  pagamento_confirmado  boolean not null default false,
  observacao            text
);

create table if not exists public.caixa (
  id          text primary key,
  date        date not null,
  descricao   text not null default '',
  categoria   text not null default 'outra',
  tipo        text not null default 'saida',
  valor       numeric(10,2) not null default 0,
  created_at  timestamptz not null default now()
);

-- ---- 2. permissões (sem isto qualquer pessoa com o link escreve nas tabelas)
alter table public.checkin_locais     enable row level security;
alter table public.checkin_contas     enable row level security;
alter table public.checkin_dias       enable row level security;
alter table public.checkins           enable row level security;
alter table public.checkin_pagamentos enable row level security;
alter table public.caixa              enable row level security;

do $$
declare t text;
begin
  -- públicas: todo mundo lê, só quem está logada escreve (uma política por ação)
  foreach t in array array['checkin_locais','checkin_contas','checkin_dias','checkins'] loop
    execute format('drop policy if exists "leitura publica" on public.%I', t);
    execute format('drop policy if exists "escrita autenticada" on public.%I', t);
    execute format('drop policy if exists "insere autenticada" on public.%I', t);
    execute format('drop policy if exists "altera autenticada" on public.%I', t);
    execute format('drop policy if exists "apaga autenticada" on public.%I', t);
    execute format('create policy "leitura publica" on public.%I for select using (true)', t);
    execute format('create policy "insere autenticada" on public.%I for insert to authenticated with check (true)', t);
    execute format('create policy "altera autenticada" on public.%I for update to authenticated using (true) with check (true)', t);
    execute format('create policy "apaga autenticada" on public.%I for delete to authenticated using (true)', t);
  end loop;
  -- dinheiro: só quem está logada lê E escreve
  foreach t in array array['checkin_pagamentos','caixa'] loop
    execute format('drop policy if exists "leitura publica" on public.%I', t);
    execute format('drop policy if exists "escrita autenticada" on public.%I', t);
    execute format('drop policy if exists "so quem organiza" on public.%I', t);
    execute format('create policy "so quem organiza" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---- 3. as arenas de hoje (ids fixos, os mesmos de LOCAIS_INICIAIS no app)
insert into public.checkin_locais (id, nome, ordem) values
  ('local-arena-v3', 'Arena V3', 1),
  ('local-itaparica-beach', 'Itaparica Beach', 2),
  ('local-gw-lider', 'GW Líder', 3)
on conflict (id) do nothing;

-- ---- 4. regras e índices
alter table public.checkin_contas drop constraint if exists checkin_contas_tipo_check;
alter table public.checkin_contas add constraint checkin_contas_tipo_check
  check (tipo in ('wellhub', 'totalpass', 'outro'));
alter table public.checkin_contas drop constraint if exists checkin_contas_aulas_semana_check;
alter table public.checkin_contas add constraint checkin_contas_aulas_semana_check
  check (aulas_semana is null or aulas_semana between 0 and 2);
create unique index if not exists checkin_contas_principal_idx
  on public.checkin_contas (player_id) where principal;   -- uma principal por atleta
create index if not exists checkin_contas_player_idx on public.checkin_contas (player_id);
create index if not exists checkin_dias_date_idx on public.checkin_dias (date desc);
alter table public.checkins drop constraint if exists checkins_modo_check;
alter table public.checkins add constraint checkins_modo_check check (modo in ('checkin', 'integral'));
create index if not exists checkins_dia_idx on public.checkins (dia_id);
create index if not exists checkins_player_idx on public.checkins (player_id);
alter table public.caixa drop constraint if exists caixa_categoria_check;
alter table public.caixa add constraint caixa_categoria_check
  check (categoria in ('extra', 'aluguel', 'brinde', 'confraternizacao', 'outra'));
alter table public.caixa drop constraint if exists caixa_tipo_check;
alter table public.caixa add constraint caixa_tipo_check check (tipo in ('entrada', 'saida'));
create index if not exists caixa_date_idx on public.caixa (date desc);

-- ---- 5. tempo real (se falhar, só avisa: sem ele o outro aparelho vê a mudança ao voltar para a tela)
do $$
declare t text;
begin
  foreach t in array array['checkin_locais','checkin_contas','checkin_dias','checkins','checkin_pagamentos','caixa'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when others then
        raise notice 'tempo real: nao consegui adicionar %: %', t, sqlerrm;
      end;
    end if;
  end loop;
end $$;

-- ---- 6. conferência: 6 linhas com rls_ligado = true; checkin_locais com 3 linhas
select
  c.relname as tabela,
  c.relrowsecurity as rls_ligado,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as politicas,
  exists (
    select 1 from pg_publication_tables pt
    where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public' and pt.tablename = c.relname
  ) as tempo_real,
  case c.relname
    when 'checkin_locais'     then (select count(*) from public.checkin_locais)
    when 'checkin_contas'     then (select count(*) from public.checkin_contas)
    when 'checkin_dias'       then (select count(*) from public.checkin_dias)
    when 'checkins'           then (select count(*) from public.checkins)
    when 'checkin_pagamentos' then (select count(*) from public.checkin_pagamentos)
    when 'caixa'              then (select count(*) from public.caixa)
  end as linhas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('checkin_locais','checkin_contas','checkin_dias','checkins','checkin_pagamentos','caixa')
order by 1;
