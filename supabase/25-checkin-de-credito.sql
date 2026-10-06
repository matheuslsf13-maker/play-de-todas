-- ============================================================
--  25 · Check-in de credito
--
--  Rode o arquivo INTEIRO no SQL Editor. Pode rodar de novo.
--
--  A menina FEZ o check-in no app e nao foi: a arena recebeu por ele, entao
--  ela fica com um check-in de credito naquela arena. No proximo play vem por
--  ele, sem check-in novo (nao gasta cota). Mesma regra de leitura dos outros
--  check-ins (script 23: so logada); nada de dinheiro aqui.
-- ============================================================

alter table public.checkins add column if not exists credito_checkin boolean not null default false;
alter table public.checkins add column if not exists credito_de text;

comment on column public.checkins.credito_checkin is
  'nao veio, mas fez o check-in no app: vira um check-in de credito';
comment on column public.checkins.credito_de is
  'veio usando o check-in de credito deste lancamento (id em checkins); nao gasta cota';

-- ---- conferencia: tem de listar as 2 colunas
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'checkins'
   and column_name in ('credito_checkin', 'credito_de')
 order by column_name;
