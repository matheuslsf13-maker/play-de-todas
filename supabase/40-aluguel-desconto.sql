-- 40: desconto do aluguel escolhido no lancamento (dono, 18/11/2026).
-- Fracao (0.05 = 5%). O que o desconto economizou vai para a caixinha de eventos, no mensal e no avulso.
-- Nulo = lancamento antigo: plano mensal vale 5%, avulso 0.
alter table public.caixa add column if not exists desconto numeric;

notify pgrst, 'reload schema';
