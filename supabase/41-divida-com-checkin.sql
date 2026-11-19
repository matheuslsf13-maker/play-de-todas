-- 41: pagar dívida de play com check-in (dono, 18/11/2026)
-- O 💰 da lista grava cada check-in que pagou a dívida como um acerto (+R$ do check-in no saldo)
-- com a conta e a arena: ele entra na cota do mês e no relatório da arena pela data.
-- `credito_de` = o check-in de crédito (dia em que ela não veio) usado para pagar: não gasta cota.
-- Só o Play de Todas usa; rodar uma vez no SQL Editor.

alter table public.checkin_acertos add column if not exists conta_id   text;
alter table public.checkin_acertos add column if not exists local_id   text;
alter table public.checkin_acertos add column if not exists credito_de text;
