-- ============================================================
--  Play de Todas — play sem status
--  Rode no SQL Editor do Supabase (depois do script 25).
--
--  Marca se o play mexe no status 🔥, separado do "vale para o mês"
--  (`ranked`). Um play sem status (um aniversário, o app emprestado para
--  outra organizadora) não existe para o 🔥: quem sobe ao pódio não soma e
--  quem fica fora ou falta não perde a sequência.
--
--  Nulo = segue o `ranked`, como sempre foi: os plays que já existem não mudam.
-- ============================================================

alter table public.sessions
  add column if not exists conta_status boolean;

comment on column public.sessions.conta_status is
  'false = o play não mexe no status 🔥 (nem soma, nem zera); nulo = segue o ranked';

notify pgrst, 'reload schema';
