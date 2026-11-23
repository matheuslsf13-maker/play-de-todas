-- 42: a data em que o check-in foi feito (dono, 19/11/2026)
-- O check-in do play pode ser feito noutro dia (a atrasada faz depois; quem não vem pode fazer antes).
-- Nulo = o dia do play (todo lançamento antigo). A cota do mês, o "um check-in por conta por dia",
-- o relatório e o Excel da arena e o aluguel da V3 usam esta data.
-- Só o Play de Todas usa; rodar uma vez no SQL Editor.

alter table public.checkins add column if not exists data_checkin date;

-- o masculino e o misto estão parados, mas o código é o mesmo: a coluna também, se a tabela existir
do $$ begin
  if to_regclass('masculino.checkins') is not null then
    alter table masculino.checkins add column if not exists data_checkin date;
  end if;
end $$;

notify pgrst, 'reload schema';
