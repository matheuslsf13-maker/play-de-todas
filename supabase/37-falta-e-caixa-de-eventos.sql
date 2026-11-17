-- ============================================================
--  Play de Todas — "Conta falta?" separado do status e gastos pagos
--  com o caixa de eventos
--  Rode no SQL Editor do Supabase (depois do script 36).
--
--  Marca se faltar a este play conta como falta: a falta baixa a força
--  (da 2ª seguida) e, com o status ligado, faz perder a sequência 🔥.
--  Antes isso vinha junto do "vale para o mês" e do "conta no status".
--
--  Nulo = a regra de antes (conta só se o play vale para o mês e para o
--  status): os plays que já existem não mudam.
-- ============================================================

alter table public.sessions
  add column if not exists conta_falta boolean;

comment on column public.sessions.conta_falta is
  'false = faltar a este play não conta como falta (força e 🔥); nulo = segue ranked e conta_status';

-- Saída do caixa paga com o 🎉 caixa de eventos: o caixa de eventos cobre até
-- o que tem na data; o que passar fica como despesa comum da categoria (a conta
-- é feita no app, nada é gravado além desta marca).
alter table public.caixa
  add column if not exists do_eventos boolean;

comment on column public.caixa.do_eventos is
  'true = saída paga com o caixa de eventos (até o saldo dele; o resto sai do caixa geral)';

notify pgrst, 'reload schema';
