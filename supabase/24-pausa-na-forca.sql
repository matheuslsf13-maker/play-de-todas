-- ============================================================
--  24 · Pausar uma menina (fora do ranking da forca)
--
--  Rode o arquivo INTEIRO no SQL Editor. Pode rodar de novo.
--
--  Quem vai ficar um tempo fora (viagem, lesao) pode ser PAUSADA na ficha:
--  some do ranking da forca, o perfil continua aberto e as faltas nao
--  derrubam a nota enquanto durar a pausa. Ao colocar no play, o app pergunta
--  se e para despausar. `reativada_em` guarda o "voltar ao ranking" na mao
--  depois da pausa automatica por 2 faltas seguidas.
-- ============================================================

alter table public.players add column if not exists pausas jsonb;
alter table public.players add column if not exists reativada_em text;

comment on column public.players.pausas is
  'pausas na mao: [{de, ate}] (ate nulo = pausada agora); forca congelada e fora do ranking da forca';
comment on column public.players.reativada_em is
  'voltou ao ranking da forca na mao (so faltas depois disto contam para a pausa automatica)';

-- ---- conferencia: tem de listar as 2 colunas
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'players'
   and column_name in ('pausas', 'reativada_em')
 order by column_name;
