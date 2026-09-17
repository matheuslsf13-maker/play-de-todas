-- ============================================================
--  18 · Planos de passe com cota POR ARENA (Wellhub Gold, Gold+, TotalPass)
--
--  Rode o arquivo INTEIRO no SQL Editor (a última linha é "order by 1;").
--  Pode rodar de novo.
--
--  A cota de check-ins é por local: o Wellhub Gold dá 12 na Arena V3 e 12 na
--  GW Líder (não aceita a Itaparica); Gold+ e TotalPass dão 12 em cada uma
--  das três. `cotas` é um json {local_id: n}; local ausente = não aceita.
--  A conta ganha `plano_id` e `aulas` (json [{local_id, por_semana}]): as
--  aulas cobram a cota do local onde são feitas (1/semana = 8, 2 = 12, 3 = 16).
--  As colunas antigas (`tipo`, `aulas_semana`) ficam; a migração abaixo
--  preenche o plano (Wellhub → Gold, TotalPass → TotalPass) e leva as aulas
--  por semana antigas para a arena padrão da conta.
-- ============================================================

-- ---- 1. os planos
create table if not exists public.checkin_planos (
  id     text primary key,
  nome   text not null,
  app    text not null default 'wellhub',
  cotas  jsonb not null default '{}'::jsonb,
  ativo  boolean not null default true,
  ordem  int not null default 0
);

-- ---- 2. permissões: todo mundo lê, só quem está logada escreve
alter table public.checkin_planos enable row level security;
drop policy if exists "leitura publica" on public.checkin_planos;
drop policy if exists "insere autenticada" on public.checkin_planos;
drop policy if exists "altera autenticada" on public.checkin_planos;
drop policy if exists "apaga autenticada" on public.checkin_planos;
create policy "leitura publica" on public.checkin_planos for select using (true);
create policy "insere autenticada" on public.checkin_planos for insert to authenticated with check (true);
create policy "altera autenticada" on public.checkin_planos for update to authenticated using (true) with check (true);
create policy "apaga autenticada" on public.checkin_planos for delete to authenticated using (true);

-- ---- 3. os três planos de hoje (ids fixos, os mesmos de PLANOS_INICIAIS no app)
insert into public.checkin_planos (id, nome, app, cotas, ordem) values
  ('plano-wellhub-gold',      'Wellhub Gold',  'wellhub',   '{"local-arena-v3": 12, "local-gw-lider": 12}'::jsonb, 1),
  ('plano-wellhub-gold-plus', 'Wellhub Gold+', 'wellhub',   '{"local-arena-v3": 12, "local-itaparica-beach": 12, "local-gw-lider": 12}'::jsonb, 2),
  ('plano-totalpass',         'TotalPass',     'totalpass', '{"local-arena-v3": 12, "local-itaparica-beach": 12, "local-gw-lider": 12}'::jsonb, 3)
on conflict (id) do nothing;

-- ---- 4. a conta ganha plano e aulas por local
alter table public.checkin_contas add column if not exists plano_id text references public.checkin_planos(id) on delete set null;
alter table public.checkin_contas add column if not exists aulas jsonb not null default '[]'::jsonb;
alter table public.checkin_planos drop constraint if exists checkin_planos_app_check;
alter table public.checkin_planos add constraint checkin_planos_app_check check (app in ('wellhub', 'totalpass', 'outro'));

-- ---- 5. migração das contas antigas: só onde ainda não há plano / aulas
update public.checkin_contas
   set plano_id = case tipo when 'totalpass' then 'plano-totalpass' else 'plano-wellhub-gold' end
 where plano_id is null and tipo in ('wellhub', 'totalpass');

update public.checkin_contas
   set aulas = jsonb_build_array(jsonb_build_object('local_id', local_padrao_id, 'por_semana', aulas_semana))
 where aulas = '[]'::jsonb and aulas_semana is not null and aulas_semana > 0 and local_padrao_id is not null;

-- ---- 6. tempo real (se falhar, só avisa)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'checkin_planos'
  ) then
    begin
      execute 'alter publication supabase_realtime add table public.checkin_planos';
    exception when others then
      raise notice 'tempo real: nao consegui adicionar checkin_planos: %', sqlerrm;
    end;
  end if;
end $$;

-- ---- 7. conferência: rls_ligado = true, planos = 3, contas_com_plano = todas as que tinham app
select
  c.relrowsecurity as rls_ligado,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'checkin_planos') as politicas,
  (select count(*) from public.checkin_planos) as planos,
  (select count(*) from public.checkin_contas where plano_id is not null) as contas_com_plano,
  (select count(*) from public.checkin_contas) as contas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'checkin_planos'
order by 1;
