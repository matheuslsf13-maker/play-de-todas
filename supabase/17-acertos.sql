-- ============================================================
--  17 · Acertos de saldo: a menina pagou depois, devolvi um crédito, perdoei
--
--  Rode o arquivo INTEIRO no SQL Editor (a última linha é "order by 1;").
--  Pode rodar de novo.
--
--  `valor` é o efeito no saldo dela: + a favor (pagou o que devia, ganhou
--  crédito), − contra (devolveram o crédito, tiraram). `dinheiro` diz se
--  dinheiro de verdade mudou de mão: só esses entram na receita do caixa
--  (o perdão de uma dívida não entra). Só quem está logada lê: é dinheiro.
-- ============================================================

create table if not exists public.checkin_acertos (
  id          text primary key,
  player_id   text not null,   -- sem FK de propósito: o caixa não muda se um cadastro for apagado
  date        date not null,
  valor       numeric(10,2) not null,
  dinheiro    boolean not null default true,
  descricao   text not null default '',
  created_at  timestamptz not null default now()
);

alter table public.checkin_acertos enable row level security;
drop policy if exists "so quem organiza" on public.checkin_acertos;
create policy "so quem organiza" on public.checkin_acertos
  for all to authenticated using (true) with check (true);

create index if not exists checkin_acertos_player_idx on public.checkin_acertos (player_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'checkin_acertos'
  ) then
    begin
      execute 'alter publication supabase_realtime add table public.checkin_acertos';
    exception when others then
      raise notice 'tempo real: nao consegui adicionar checkin_acertos: %', sqlerrm;
    end;
  end if;
end $$;

-- ---- conferência: 1 linha, rls_ligado = true, politicas = 1
select
  c.relname as tabela,
  c.relrowsecurity as rls_ligado,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as politicas,
  exists (
    select 1 from pg_publication_tables pt
    where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public' and pt.tablename = c.relname
  ) as tempo_real
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'checkin_acertos'
order by 1;
