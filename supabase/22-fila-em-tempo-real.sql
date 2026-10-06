-- ============================================================
--  22 · Fila igual em todos os celulares
--
--  Rode o arquivo INTEIRO no SQL Editor. Pode rodar de novo.
--
--  "⏳ Quem nao chegou" e a partida escolhida na mao para uma quadra
--  ("Trocar esta partida por outra") ficavam so no celular de quem tocou:
--  em 05/10 uma organizadora marcou quem nao tinha chegado e o outro celular
--  continuou mostrando outra fila. Agora ficam no play, e o tempo real leva
--  para todos. Sem estas colunas o app segue como antes (so no aparelho).
-- ============================================================

alter table public.sessions add column if not exists ausentes jsonb;
alter table public.sessions add column if not exists escolhas jsonb;

comment on column public.sessions.ausentes is
  'quem esta na lista mas ainda nao chegou: [player_id]';
comment on column public.sessions.escolhas is
  'partida escolhida na mao por quadra: {quadra: match_id}';

-- ---- conferencia: tem de listar as 2 colunas
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'sessions'
   and column_name in ('ausentes', 'escolhas')
 order by column_name;
