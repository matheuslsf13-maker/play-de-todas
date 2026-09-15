-- ============================================================
--  O criterio do ranking DO DIA, gravado no play
--  Rode no SQL Editor do Supabase (depois dos scripts anteriores).
--
--  'pontos'   = como sempre foi: quem somou mais pontos no dia.
--  'vitorias' = quem venceu mais partidas; os pontos so desempatam.
--
--  Fica no play para um podio ja anunciado nunca mudar de criterio: os plays
--  antigos ficam sem valor (= pontos) e os novos nascem por vitorias. O
--  ranking do MES e sempre por pontos, e isto nao mexe nele.
-- ============================================================

alter table public.sessions
  add column if not exists criterio_dia text;

alter table public.sessions
  drop constraint if exists sessions_criterio_dia_check;

alter table public.sessions
  add constraint sessions_criterio_dia_check
    check (criterio_dia is null or criterio_dia in ('pontos', 'vitorias'));

comment on column public.sessions.criterio_dia is
  'o que decide o ranking do dia: pontos (padrao dos antigos) ou vitorias';
