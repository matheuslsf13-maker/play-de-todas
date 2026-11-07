-- ============================================================
--  35 · Aluguel da V3 no plano mensal (D47, dono 07/11/2026)
--
--  Rode o arquivo INTEIRO no SQL Editor (a última linha é "order by 1;").
--  Pode rodar de novo. Só acrescenta: colunas no caixa, nos check-ins e nos cadastros (lista de espera)
--  e a tabela `ajustes` (limite de mensalistas). Não mexe em nada que existe.
--
--  No lançamento de aluguel: `valor` continua sendo o que saiu de verdade (o Pix);
--  `plano_mensal` diz se foi pago no plano (5% de desconto: a economia vai para o
--  caixa de eventos), `valor_cobrado` é o que a V3 cobrou e `checkins_abatidos`
--  quantos check-ins do mês anterior ela abateu (R$ 25 cada).
-- ============================================================

alter table public.caixa add column if not exists plano_mensal boolean;
alter table public.caixa add column if not exists valor_cobrado numeric(10,2);
alter table public.caixa add column if not exists checkins_abatidos int;

-- a substituta: o lançamento da avulsa que entrou no lugar de uma mensalista (id do cadastro dela;
-- sem FK, como o player_id dos check-ins). Metade do valor cheio do dia vai para o caixa de eventos.
alter table public.checkins add column if not exists substitui text;

-- ajustes da organização que valem para todo mundo (ex.: 'limite_mensalistas' -> 12). Só logada.
create table if not exists public.ajustes (
  id          text primary key,
  valor       jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.ajustes enable row level security;
drop policy if exists "so quem organiza" on public.ajustes;
create policy "so quem organiza" on public.ajustes for all to authenticated using (true) with check (true);
revoke all on public.ajustes from public, anon, authenticated;
grant select on public.ajustes to anon;  -- sem política para anon: volta vazio, sem erro
grant select, insert, update, delete on public.ajustes to authenticated;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'ajustes') then
    alter publication supabase_realtime add table public.ajustes;
  end if;
end $$;

-- lista de espera para virar mensalista: quando ela pediu (nulo = não está na espera)
alter table public.players add column if not exists espera_mensalista timestamptz;

-- ---- conferência: 7 linhas (ajustes.id, ajustes.valor, caixa x3, checkins.substitui, players.espera_mensalista)
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'caixa' and column_name in ('plano_mensal', 'valor_cobrado', 'checkins_abatidos'))
    or (table_name = 'checkins' and column_name = 'substitui')
    or (table_name = 'ajustes' and column_name in ('id', 'valor'))
    or (table_name = 'players' and column_name = 'espera_mensalista'))
order by 1, 2;
