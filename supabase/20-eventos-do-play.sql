-- ============================================================
--  20 · O diário das intervenções do play
--
--  Rode o arquivo INTEIRO no SQL Editor. Pode rodar de novo.
--
--  Cada coisa feita na mão durante o play (trocar jogadora, entra/sai,
--  refazer a fila, refazer tudo, abrir/tirar quadra) fica anotada na
--  sessão, com a hora e quantas partidas já tinham sido jogadas. Sem isto
--  o app até funciona (a coluna é tolerada), mas o diário não fica gravado.
-- ============================================================

alter table public.sessions add column if not exists eventos jsonb not null default '[]'::jsonb;

comment on column public.sessions.eventos is
  'intervenções na mão durante o play: [{at, tipo, texto, jogadas, round?}]';

-- ---- conferência
select column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'sessions' and column_name = 'eventos';
