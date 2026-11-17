-- ============================================================
--  Play de Todas — transferir entre o caixa e a caixinha de eventos
--  Rode no SQL Editor do Supabase (depois do script 37).
--
--  Um lançamento do caixa com transferencia = true não é receita nem
--  despesa: só move dinheiro que já está no caixa.
--    saída   + transferencia = "Transferir do caixa" (o caixa geral separa
--                              esse valor para a caixinha de eventos)
--    entrada + transferencia = "Devolver ao caixa" (a caixinha libera o
--                              valor para o caixa geral)
--  O dinheiro de fora (terceiros ou aporte pessoal) não precisa deste
--  script: é uma receita extra com do_eventos = true (script 37).
--
--  Nulo = lançamento comum: nada do que já existe muda.
-- ============================================================

alter table public.caixa
  add column if not exists transferencia boolean;

comment on column public.caixa.transferencia is
  'true = transferência entre o caixa geral e a caixinha de eventos (saída = guardar, entrada = devolver); não é receita nem despesa';

notify pgrst, 'reload schema';
