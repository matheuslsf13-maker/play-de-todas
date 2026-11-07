-- ============================================================
--  36 · Substituta na lista de presença (dono, 07/11/2026)
--
--  Rode o arquivo INTEIRO no SQL Editor. Pode rodar de novo. Só acrescenta uma coluna.
--
--  Quando uma mensalista sai das confirmadas avisando com 24h (tirada ou trocada de lugar), a
--  suplente que entra fica com `substitui` = o id do cadastro da mensalista; o 💰 da lista já lança
--  o play dela como substituta (metade do valor cheio do dia vai para o caixa de eventos).
-- ============================================================

alter table public.lista_nomes add column if not exists substitui text;

-- ---- conferência: 1 linha
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'lista_nomes' and column_name = 'substitui';
