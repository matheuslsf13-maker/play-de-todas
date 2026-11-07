-- ============================================================
--  35 · Aluguel da V3 no plano mensal (D47, dono 07/11/2026)
--
--  Rode o arquivo INTEIRO no SQL Editor (a última linha é "order by 1;").
--  Pode rodar de novo. Só acrescenta colunas (três no caixa, uma nos check-ins); não mexe em nada que existe.
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

-- ---- conferência: 4 linhas
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'caixa' and column_name in ('plano_mensal', 'valor_cobrado', 'checkins_abatidos'))
    or (table_name = 'checkins' and column_name = 'substitui'))
order by 1, 2;
