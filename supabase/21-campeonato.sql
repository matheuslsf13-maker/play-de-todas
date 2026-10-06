-- ============================================================
--  21 · Modo campeonato (categorias + grupos + duplas)
--
--  Rode o arquivo INTEIRO no SQL Editor. Pode rodar de novo.
--
--  O campeonato e um play so, dividido em categorias (A, B, C...), cada uma
--  com os seus grupos e as suas quadras. Tambem guarda a tabela de pontos
--  por colocacao, os desempates decididos em quadra e as quadras cedidas por
--  uma categoria que ja terminou. Sem estas colunas o app ate abre, mas o
--  campeonato nao fica gravado direito.
-- ============================================================

alter table public.sessions add column if not exists categorias jsonb;
alter table public.sessions add column if not exists pontuacao jsonb;
alter table public.sessions add column if not exists desempates_grupo jsonb;
alter table public.sessions add column if not exists quadras_cedidas jsonb;

comment on column public.sessions.categorias is
  'campeonato: [{nome, grupos: indices em groups, quadras}]; nulo = uma categoria';
comment on column public.sessions.pontuacao is
  'pontos do mes por colocacao: [campea, vice, 3o, semifinal, quartas, grupos]; nulo = regra antiga';
comment on column public.sessions.desempates_grupo is
  'desempates em quadra: [{grupo, ordem, como, at}]';
comment on column public.sessions.quadras_cedidas is
  'quadra de categoria terminada -> indice da categoria que recebe';

-- ---- conferencia: tem de listar as 4 colunas
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'sessions'
   and column_name in ('categorias', 'pontuacao', 'desempates_grupo', 'quadras_cedidas')
 order by column_name;
