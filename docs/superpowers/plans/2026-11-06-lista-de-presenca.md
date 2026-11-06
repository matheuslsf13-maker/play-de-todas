# Lista de presença por link — Plano de implementação

> **Para agentes:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans,
> tarefa por tarefa. Passos com checkbox (`- [ ]`).

**Objetivo:** a organizadora cria uma lista com vagas e prazo, manda o link no grupo; cada atleta (sem
login) coloca o nome completo e recebe a posição dada pelo **servidor**; a organizadora vincula os nomes
aos cadastros, mexe na lista e monta o play a partir dela.

**Arquitetura:** três tabelas novas só no schema `public` (Play de Todas), escritas pela visitante
**apenas** por duas funções `security definer` (`lista_colocar`, `lista_tirar`); a organizadora escreve
direto (RLS `authenticated`) e por uma função de troca. Regras puras em `src/lib/listaDePresenca.ts`
(testadas com `node:test`). Os dados da lista **não entram** no `AppData` nem no canal geral de tempo
real: um hook próprio (`useLista`) carrega a lista e ouve um canal filtrado por ela. Uma página só
(`src/pages/ListaDePresenca.tsx`) serve a visitante e, logada, a gestão.

**Desenho:** `docs/superpowers/specs/2026-11-05-lista-de-presenca-design.md` — a seção
**"Decisões do dono depois da revisão (06/11/2026)" manda sobre o resto**.

## Regras do trabalho

- Sem push (push na `main` publica). Sem SQL no banco real: **quem roda o script 31 é o dono**.
- Sem dependência nova no app. Ferramentas de teste só fora do repo (`C:/Users/OFFICE01/Documents/ChatGPT/pdt-teste/`).
- Play de Terça e Play Mista: recurso **escondido** (sem botão, sem cartão, sem tabela, sem consulta).
- Antes de cada commit: `npm test` e `npm run build` verdes. Commits pequenos, em português, terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Português do Brasil na tela, identificadores sem acento, `plural()` em vez de "(s)", alvos ≥ 44 px,
  estilo existente (`card`, `btn`, `prox-*`, `Modal`, `Avatar`, `shareOrCopy`).
- Truque para ver como visitante no modo local (ex.: `canEdit: false` em `store.tsx`) é **temporário e
  nunca commitado**.

## Decisões tomadas pelo builder (dono dormindo — conservadoras, a confirmar)

| # | Decisão | Por quê |
|---|---------|---------|
| D1 | Tabelas `listas`, `lista_nomes`, `lista_aparelhos`; funções `lista_colocar`, `lista_tirar`, `lista_trocar`, `lista_normalizar`. | Nomes curtos, no padrão do schema. |
| D2 | O hash do código do aparelho mora numa **tabela à parte** (`lista_aparelhos`) **sem leitura para ninguém** (nem anon nem logada); só as funções `security definer` tocam nela. | `lista_nomes` tem leitura pública e entra no tempo real; coluna escondida por grant quebra `select *` e o tempo real não respeita grant de coluna. Tabela separada não vaza por nenhum caminho. |
| D3 | Ordem = `coalesce(ordem, chegada)`. `chegada` é `identity` (dada pelo banco, nunca muda); `ordem` é nula até a organizadora mexer (garantir/trocar) ou nas pré-incluídas (1, 2, 3…). | Zero código para o caso comum; a ordem de chegada continua sendo a regra de quem vem pelo link. |
| D4 | Trava por lista: `pg_advisory_xact_lock(hashtextextended('lista:'‖id, 0))` em `lista_colocar`, `lista_tirar` e `lista_trocar`. | As checagens (aparelho, nome repetido, teto) e a posição devolvida não correm entre si. |
| D5 | Saída é **suave** (`saiu_em`, `saiu_por`), nunca `delete`. | Guarda a hora de saída (regra das 24h) e o tempo real filtrado por lista não entrega `DELETE`. |
| D6 | Vínculo automático **no banco**, dentro de `lista_colocar`: grafia igual (normalizada) ao nome, apelido ou um alias de **exatamente um** cadastro → `player_id` já preenchido. Se esse cadastro já está ativo na lista → `ja_na_lista` ("Você já está na lista"). Duas "Bruna" → não vincula. | Uma regra só, no lugar que decide; o modo local repete a regra com `vinculoAutomatico` (pura, testada). |
| D7 | Unicidade no banco: `(lista_id, nome_norm)` e `(lista_id, player_id)` entre os ativos (índices únicos parciais). `nome_norm` é coluna **gerada** por `lista_normalizar(nome)`. | O banco garante "o mesmo nome não entra duas vezes" e "a mesma atleta não fica duas vezes" para os dois caminhos de escrita. Escritas da organizadora não passam pela fila (D9), então uma recusa não trava nada. |
| D8 | `avisou_24h` fica em `lista_nomes` (leitura pública). | É um sim/não sobre o aviso, não valor; a parte de dinheiro vem com o modelo financeiro (que pode mover isso para tabela só-logada). |
| D9 | Escritas da organizadora na lista são **diretas** (aguardam o banco, erro vira toast), **não** pela fila offline. Exceção: o alias aprendido no vínculo vai por `savePlayer` (fila), como no `ImportarLista`. | A ordem é decidida no servidor com atletas escrevendo ao mesmo tempo; uma troca guardada offline e enviada depois inverteria posições já vistas por todas. |
| D10 | Código da lista: 10 caracteres de `abcdefghjkmnpqrstuvwxyz23456789` (`crypto.getRandomValues`, ~49 bits). | Não adivinhável na URL. **Não é segredo**: `listas` tem leitura pública (o cartão da tela inicial precisa). A segurança está nas funções. |
| D11 | Horas no fuso fixo `America/Sao_Paulo` (formatar com `Intl`, montar com `-03:00`). | A arena é no Brasil, sem horário de verão desde 2019; testes não dependem do fuso da máquina. `shortcut:` comentado no código. |
| D12 | "Mensalista em dia para o play" = categoria mensalista, **ativa**, **sem pausa aberta**, e (`pago_mes ≥ mês do play`, ou dia do play ≤ 5 e `pago_mes` = mês anterior ao do play). Avaliado **na hora de criar a lista**. | Leitura do "prazo até o dia 5" (dono, 06/11): quem pagou o mês passado ainda está no prazo; quem está atrasada há mais tempo não. Pausada/inativa não pode ocupar vaga. |
| D13 | Pré-incluídas ordenadas por força (`notaDeForca(ratings(data))`) da maior para a menor; empate pelo nome. Entram com `origem='mensalista'`, `garantida=true`, `ordem = 1..n`. | Decisão do dono (ordem por força). |
| D14 | "Garantir vaga" só para nome **adicionado à mão** (`origem='organizadora'`): `garantida=true` e `ordem` no meio entre a última garantida e o próximo nome (`ordemParaGarantir`). | É o que o desenho pede; trocar posições cobre o resto. |
| D15 | "Trocar posições" = trocar os valores de `coalesce(ordem, chegada)` dos dois nomes, numa função `lista_trocar` (`security invoker`, só `authenticated`). O selo `garantida` não muda. | Atômico (duas linhas numa transação) e sob a mesma trava. |
| D16 | Ao tirar uma mensalista (pré-incluída **ou** vinculada a cadastro de categoria mensalista) a organizadora responde "Ela avisou com 24h de antecedência?" (Sim/Não/Cancelar); a tela mostra quantas horas antes do play foi. | Decisão do dono; o app não decide sozinho. |
| D17 | Teto contra spam = `vagas × 3` nomes ativos. Nome: 3 a 60 caracteres, letras (com acento), espaço, ponto, apóstrofo e hífen; começa com letra. | O desenho sugere esses números. |
| D18 | Link `?lista=` no build feminino: **não redireciona** para o play guardado e pula a "Qual play você quer abrir?". Só grava a escolha "Play de Todas" se o aparelho **ainda não tinha** escolha. | "Link sempre abre o Play de Todas" sem apagar a escolha de quem já usa outro play. |
| D19 | A página da lista aparece **dentro do app** (no lugar da aba, com o topo e a barra de abas); tocar numa aba, em "Agora não", ou terminar (colocar/tirar) volta à tela inicial e limpa `?lista=` da URL (`history.replaceState`). | Ela já cai no app e explora o ranking. Sem router novo. |
| D20 | Montar o play **fecha a lista** no toque (antes de abrir o Novo Play) e grava `listas.session_id` quando o play é criado. As confirmadas passam pelo mesmo `aplicarLista` da lista colada (pausa e portão do pagamento). | Ninguém entra enquanto ela monta; `session_id` serve ao financeiro. |
| D21 | Defaults do formulário: título "Play de Todas", próxima segunda 20:00, fecha no domingo anterior 18:00, 16 vagas, "Já incluir as mensalistas em dia" ligado. | Calendário do Play de Todas (DECISOES.md: segunda 20h). |
| D22 | Reabrir com o prazo vencido exige escolher um novo prazo. | "Aberta" é `not fechada and now() < fecha_em`; reabrir sem prazo novo não abriria nada. |
| D23 | Em `lista_colocar`, o vínculo (`ja_na_lista`) é conferido **antes** do nome repetido; o nome chega com `normalize(NFC)` e o apóstrofo do iPhone (`’`) vira `'`; o código da lista é comparado em minúsculas; `unique_violation` (corrida com escrita da organizadora, que não pega a trava) vira `repetido`/`ja_na_lista`. | A mensalista pré-incluída que digita o próprio nome ouve "Você já está na lista" (não "nome repetido"); teclado do iPhone não recusa "D’Ávila". **`validarNome` (A1) faz o mesmo `’`→`'`** para a tela e o banco concordarem. |
| D24 | `lista_trocar` só troca dois nomes **ativos** da mesma lista; `lista_colocar`/`lista_tirar` releem a lista **depois** da trava; a sequência de `chegada` fica sem grant para anon/logada (identity não precisa). | Sem posição trocada com quem já saiu; fechar a lista no meio de uma rajada vale na hora. |
| D25–D32 | Decisões do app: ver `DECISOES.md` (seção "Lista de presença por link"). | Registradas onde o próximo leitor procura. |

---

# ETAPA 1 — BANCO

### Tarefa B1: `supabase/31-lista-de-presenca.sql`

**Arquivos:** criar `supabase/31-lista-de-presenca.sql`.

Padrão dos scripts: cabeçalho explicando, "Rode o arquivo INTEIRO no SQL Editor. Pode rodar de novo.",
`if not exists` / `create or replace` / `drop policy if exists`, termina com **conferência** (selects) e um
**teste de segurança** que, se falhar, desfaz tudo. O script inteiro vai entre `begin;` … `commit;`
(uma exceção no meio aborta a transação e o `commit` vira `rollback`). **Não** mexer no `27-liga-masculina.sql`
(o masculino e o misto não ganham as tabelas).

- [ ] **1. Normalização** (tem de ser `immutable` para virar coluna gerada; acentos maiúsculos e minúsculos no
  `translate`, porque o `lower()` com locale C não conhece acento):

```sql
create or replace function public.lista_normalizar(s text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(lower(translate(coalesce(s, ''),
    'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝáàâãäåéèêëíìîïóòôõöúùûüçñý',
    'AAAAAAEEEEIIIIOOOOOUUUUCNYaaaaaaeeeeiiiiooooouuuucny')), '[^a-z0-9]+', ' ', 'g'))
$$;
```

- [ ] **2. Tabelas e índices**

```sql
create table if not exists public.listas (
  id          text primary key,
  codigo      text not null unique check (codigo ~ '^[a-z0-9]{8,32}$'),
  titulo      text not null default 'Play de Todas' check (length(titulo) between 1 and 60),
  play_em     timestamptz not null,
  fecha_em    timestamptz not null,
  vagas       int  not null check (vagas between 1 and 100),
  texto       text check (length(texto) <= 300),
  fechada     boolean not null default false,
  session_id  text references public.sessions(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.lista_nomes (
  id          text primary key default gen_random_uuid()::text,
  lista_id    text not null references public.listas(id) on delete cascade,
  nome        text not null check (length(nome) between 1 and 80),
  nome_norm   text generated always as (public.lista_normalizar(nome)) stored,
  player_id   text references public.players(id) on delete set null,
  chegada     bigint generated always as identity,
  ordem       double precision,
  origem      text not null check (origem in ('link', 'mensalista', 'organizadora')),
  garantida   boolean not null default false,
  entrou_em   timestamptz not null default now(),
  saiu_em     timestamptz,
  saiu_por    text check (saiu_por in ('atleta', 'organizadora')),
  avisou_24h  boolean
);
create index if not exists lista_nomes_lista on public.lista_nomes (lista_id);
create unique index if not exists lista_nomes_nome_ativo
  on public.lista_nomes (lista_id, nome_norm) where saiu_em is null;
create unique index if not exists lista_nomes_atleta_ativa
  on public.lista_nomes (lista_id, player_id) where saiu_em is null and player_id is not null;

-- o hash do codigo do aparelho: ninguem le, so as funcoes
create table if not exists public.lista_aparelhos (
  nome_id       text primary key references public.lista_nomes(id) on delete cascade,
  lista_id      text not null references public.listas(id) on delete cascade,
  aparelho_hash text not null
);
create index if not exists lista_aparelhos_lista on public.lista_aparelhos (lista_id, aparelho_hash);
```

- [ ] **3. `lista_colocar(p_codigo, p_nome, p_aparelho) returns jsonb`** — `security definer`,
  `set search_path = ''`, tudo qualificado com `public.`. Ordem das checagens (cada falha devolve
  `{ok:false, motivo}` em vez de exceção, para a tela dar a frase certa):
  1. `p_aparelho` com 16 a 100 caracteres → senão `aparelho`;
  2. nome: `normalize(NFC)`, `’`→`'`, espaços colapsados e `btrim`; 3–60; regex
     `^[A-Za-zÀ-ÖØ-öø-ÿ]([A-Za-zÀ-ÖØ-öø-ÿ .''-]*[A-Za-zÀ-ÖØ-öø-ÿ.])?$` → senão `nome`;
  3. lista pelo `codigo` → senão `nao_existe`;
  4. **trava** da lista (D4);
  5. `fechada` ou `now() >= fecha_em` → `fechada` (relógio do servidor);
  6. `v_hash := encode(sha256(convert_to(p_aparelho, 'UTF8')), 'hex')` (`sha256` é nativo do PG ≥ 11, sem
     extensão); já existe nome **ativo** desta lista com esse hash → `aparelho_ja_tem_nome`;
  7. vínculo automático (D6): `array_agg(p.id)` dos `players` cujo `lista_normalizar(name)`,
     `lista_normalizar(nickname)` ou algum `lista_normalizar(alias)` (`unnest(aliases)`) é igual;
     exatamente 1 → `v_player`; se ele já está ativo na lista → `ja_na_lista` (D23: antes do repetido);
  8. `nome_norm` já ativo na lista → `repetido`;
  9. ativos `>= vagas * 3` → `cheia`;
  10. `insert` em `lista_nomes` (`origem='link'`, `player_id = v_player`) `returning id`; `insert` em
      `lista_aparelhos`;
  11. posição = `row_number() over (order by coalesce(ordem, chegada), chegada)` entre os ativos;
      devolve `{ok:true, id, posicao, vagas}`.

- [ ] **4. `lista_tirar(p_nome_id, p_aparelho) returns jsonb`** — `security definer`, `search_path = ''`:
  nome não existe ou já saiu → `nao_esta`; **trava**; lista fechada/prazo vencido → `fechada`;
  **não existe** linha em `lista_aparelhos` com `nome_id = p_nome_id` e o hash de `p_aparelho` →
  `nao_e_seu`; senão `update … set saiu_em = now(), saiu_por = 'atleta' where id = p_nome_id and saiu_em is null`
  → `{ok:true}`.

- [ ] **5. `lista_trocar(p_a, p_b) returns void`** — `security invoker` (vale a RLS de quem chama),
  `search_path = ''`: lê `lista_id` de `p_a`, **trava**, lê `coalesce(ordem, chegada)` dos dois (o `p_b`
  tem de ser da mesma lista, senão `raise exception`) e faz um `update … set ordem = case id when p_a then kb else ka end where id in (p_a, p_b)`.

- [ ] **6. RLS, grants e tempo real**

```sql
alter table public.listas          enable row level security;
alter table public.lista_nomes     enable row level security;
alter table public.lista_aparelhos enable row level security;

do $$
declare t text;
begin
  foreach t in array array['listas', 'lista_nomes'] loop
    execute format('drop policy if exists "leitura publica" on public.%I', t);
    execute format('drop policy if exists "escrita autenticada" on public.%I', t);
    execute format('create policy "leitura publica" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "escrita autenticada" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
-- lista_aparelhos: RLS ligada e NENHUMA policy = ninguem le nem escreve direto

-- o Supabase da "all" para anon/authenticated em tabela nova do public: tirar tudo e dar so o necessario
revoke all on public.listas, public.lista_nomes, public.lista_aparelhos from anon, authenticated;
grant select on public.listas, public.lista_nomes to anon, authenticated;
grant insert, update, delete on public.listas, public.lista_nomes to authenticated;

revoke all on function public.lista_colocar(text, text, text) from public, anon, authenticated;
revoke all on function public.lista_tirar(text, text)         from public, anon, authenticated;
revoke all on function public.lista_trocar(text, text)        from public, anon, authenticated;
grant execute on function public.lista_colocar(text, text, text) to anon, authenticated;
grant execute on function public.lista_tirar(text, text)         to anon, authenticated;
grant execute on function public.lista_trocar(text, text)        to authenticated;

-- tempo real so das duas tabelas publicas (NUNCA lista_aparelhos)
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.listas';      exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.lista_nomes'; exception when duplicate_object then null; end;
end $$;
```

- [ ] **7. Teste de segurança (no próprio script, antes do `commit`)** — um `do $$ … $$` cujo corpo roda
  num sub-bloco `begin … exception`: cria dados de teste, testa, e termina com `raise exception 'teste-ok'`
  para **desfazer os dados de teste** sempre; o `exception when others` engole só o `teste-ok` e
  re-lança qualquer outra coisa → o script inteiro volta atrás e nada fica criado pela metade.
  Casos (cada um `raise exception 'FALHOU: …'` se não der o esperado):
  1. cria um player de teste (`id 'teste-lista-31'`, nome "Zzteste Unica", alias "Zz Apelido") e uma lista
     aberta (`fecha_em = now() + 1 hour`, 2 vagas);
  2. como postgres: `lista_colocar(cod, 'Maria Teste', 'aparelho-A-0123456789')` → `ok`, posição 1;
  3. `execute 'set local role anon'`;
  4. **a regra que importa:** `lista_tirar(id_da_maria, 'aparelho-B-0123456789')` → tem de vir `ok=false`
     (`nao_e_seu`) e a linha continuar ativa;
  5. como anon: `update public.lista_nomes set saiu_em = now()` → erro de permissão **ou** 0 linhas
     (`get diagnostics`); `delete from public.lista_nomes` idem; `insert into public.lista_nomes …` → erro;
     `select … from public.lista_aparelhos` → erro de permissão; `perform public.lista_trocar(a, b)` → erro;
  6. como anon: mesmo aparelho A coloca outro nome → `aparelho_ja_tem_nome`; outro aparelho com
     "maria   TESTE" → `repetido`; "zzteste única" → `ok` com `player_id = 'teste-lista-31'`; outro aparelho
     com "Zz Apelido" → `ja_na_lista`; nome "<b>x</b>" → `nome`;
  7. teto: 2 vagas × 3 = 6 ativos → o 7º → `cheia`;
  8. controle positivo: `lista_tirar(id_da_maria, 'aparelho-A-0123456789')` → `ok`;
  9. `reset role`; fecha a lista (`fecha_em = now() - interval '1 second'`); como anon `lista_colocar` →
     `fechada`;
  10. `raise exception 'teste-ok'`.
  Depois do bloco: `select 'teste de seguranca: ok' as resultado;`.

- [ ] **8. Conferência** (selects no fim, como os outros scripts): as 3 tabelas com `relrowsecurity`; as
  policies de `listas`/`lista_nomes` (`pg_policies`); zero policies em `lista_aparelhos`; os privilégios de
  `anon` (`information_schema.role_table_grants`: só `SELECT` nas duas, nada em `lista_aparelhos`);
  `has_function_privilege('anon', …)` = true para colocar/tirar e **false** para trocar; as duas tabelas na
  `supabase_realtime` e `lista_aparelhos` fora; `select public.lista_normalizar('Ána  Lúcia-Prétti')`
  = `ana lucia pretti`.

- [x] **9. Commit:** `Script 31: lista de presenca por link (tabelas, funcoes, RLS e teste de seguranca)`.

### Tarefa B2: validar o script fora do repo (sem banco real)

**Feito em 06/11** (pasta `pdt-teste/sql-teste/`): `teste-31.mjs` (PGlite 0.5.15, dono não-superusuário,
default privileges do Supabase) e `teste-31-concorrencia.mjs` (Postgres 17.9 local via `embedded-postgres`,
30 conexões ao mesmo tempo, o 31 inteiro numa query só como no SQL Editor). Tudo passou: rodar 2×, as 10
linhas da conferência "ok", visitante não tira nome de outra, sem escrita/leitura direta, prazo, fechada,
teto, suplente sobe, vínculo sem duplicar, 5 rajadas de 30 com posições 1..30 sem repetir, mesmo aparelho/
mesmo nome/teto sob corrida, prova negativa (script quebrado falha e não deixa tabela). Achado: com o
`begin;` explícito, um erro deixa a sessão do SQL Editor abortada até um `rollback;`. Sem prova local: o
tempo real do Supabase (publicação só conferida no catálogo) e o PostgREST chamando as funções.

- [x] Em `C:/Users/OFFICE01/Documents/ChatGPT/pdt-teste/lista-sql/`, instalar **lá** o PGlite
  (`npm i @electric-sql/pglite`) e montar um "Supabase de mentira": roles `anon`, `authenticated`
  (`grant anon, authenticated to` o usuário do PGlite), `create publication supabase_realtime`, e as
  tabelas `players` (com `nickname`, `aliases text[] default '{}'`) e `sessions` mínimas. Rodar o
  `31-lista-de-presenca.sql` **duas vezes** (pode rodar de novo) e conferir a saída `teste de seguranca: ok`.
- [ ] Prova negativa: numa cópia do script, trocar a comparação de hash em `lista_tirar` por `true` e
  confirmar que o script **falha** e não deixa tabela criada (rollback).
- [ ] Conferir em especial: insert da organizadora (`authenticated`) na coluna `identity` sem grant de
  sequência; `sha256`/`hashtextextended` existentes; a regex com `À-ÿ`.
- [ ] Se o PGlite não suportar algo (ex.: `set role` dentro de `do`), anotar no DECISOES.md o que ficou sem
  prova local e o que o dono deve olhar na saída do SQL Editor. Nada disso vai para o repo.

---

# ETAPA 2 — APP

### Tarefa A1: regra pura + testes

**Arquivos:** criar `src/lib/listaDePresenca.ts`, `tests/listaDePresenca.test.ts`; modificar
`src/lib/mensalidade.ts`.

- [x] Tipos (em `listaDePresenca.ts`, não em `types.ts` — não fazem parte do `AppData`):

```ts
export type Lista = {
  id: string; codigo: string; titulo: string
  play_em: string; fecha_em: string           // ISO
  vagas: number; texto: string | null; fechada: boolean
  session_id: string | null; created_at: string
}
export type OrigemDoNome = 'link' | 'mensalista' | 'organizadora'
export type NomeNaLista = {
  id: string; lista_id: string; nome: string; player_id: string | null
  chegada: number; ordem: number | null; origem: OrigemDoNome; garantida: boolean
  entrou_em: string; saiu_em: string | null; saiu_por: 'atleta' | 'organizadora' | null
  avisou_24h: boolean | null
}
export type ListaCompleta = { lista: Lista; nomes: NomeNaLista[] }
export type MotivoDaLista = 'aparelho' | 'nome' | 'nao_existe' | 'fechada' | 'aparelho_ja_tem_nome'
  | 'repetido' | 'ja_na_lista' | 'cheia' | 'nao_esta' | 'nao_e_seu' | 'sem_tabela'
export type RespostaDaLista = { ok: true; id?: string; posicao?: number; vagas?: number } | { ok: false; motivo: MotivoDaLista }
```

- [x] Funções (todas puras; `agora` sempre por parâmetro):
  - `TETO_POR_VAGA = 3`; `validarNome(texto): { nome: string } | { erro: string }` — mesma regra do SQL (D17).
  - `chaveDeOrdem(n) = n.ordem ?? n.chegada`; `ativosEmOrdem(nomes)` (sem `saiu_em`, por chave e chegada).
  - `dividir(lista, nomes): { titulares; suplentes }` — os `vagas` primeiros ativos são titulares.
  - `estaAberta(lista, agora: Date)` — `!fechada && agora < fecha_em`.
  - `quando(iso)` → `"seg 20h"` / `"seg 20h30"`; `quandoComData(iso)` → `"seg 10/11 às 20h"`;
    `dataDoPlay(lista)` → `'2026-11-10'` (fuso de São Paulo, D11);
    `inicioEmSaoPaulo('2026-11-10', '20:00')` → `'2026-11-10T23:00:00.000Z'` (`shortcut:` -03:00 fixo).
  - `resumoDoCartao(lista, nomes)` → `"Lista aberta · seg 20h · 14/16 · 2 vagas · fecha dom 18h"` ou
    `"… · 16/16 · 3 suplentes · …"` (singular com `plural()`; cheia sem suplente = `"16/16 · lotada"`).
  - `textoDaPosicao(posicao, vagas)` → `"Você é a 15ª — confirmada"` / `"Você é a 2ª suplente"`.
  - `MENSAGEM_DO_MOTIVO: Record<MotivoDaLista, string>` (ex.: `ja_na_lista` → "Você já está na lista",
    `fechada` → "A lista já fechou. Fale com a organização.", `aparelho_ja_tem_nome` → "Este celular já
    colocou um nome nesta lista. Para trocar, tire o nome primeiro.", `nao_e_seu` → "Só dá para tirar o
    nome colocado por este celular. Fale com a organização.").
  - `vinculoAutomatico(texto, players): string | null` — `normalizar` de `roster.ts` contra nome, apelido
    e aliases; só devolve se casar com **um** cadastro (D6).
  - `sugestaoDeVinculo(texto, players)` → `conciliar([texto], players)[0].sugestoes` (reuso direto).
  - `preIncluidas(data: AppData, dataDoPlay: string): string[]` — `mensalistaEmDiaNoPlay` + ativa + sem
    `pausaAberta`; ordem `notaDeForca(ratings(data).get(id) ?? 2)` desc, empate por nome (D13).
  - `ordemParaGarantir(nomes): number` — meio entre a chave da última garantida ativa e a do nome ativo
    seguinte (sem garantidas: chave do primeiro − 1) (D14).
  - `horasAntesDoPlay(saiu_em, play_em): number` (arredonda para baixo).
  - `urlDaLista(base, codigo)` → `${base}?lista=${codigo}`; `novoCodigo()` (D10).
  - `mensagemDoLink(lista, url)` e `mensagemDeAtualizacao(lista, nomes, nomeDe, url)` — textos abaixo.
- [x] Em `mensalidade.ts`: `mensalistaEmDiaNoPlay(p: Player, dataDoPlay: string): boolean` (D12),
  ao lado de `situacaoDoAtleta` (que não muda).
- [x] Textos do WhatsApp (decididos aqui, dentro do que o dono pediu):

```
🎾 *Play de Todas* — seg 10/11 às 20h
📋 Lista aberta até dom 09/11 às 18h · 16 vagas
<texto curto da organizadora, se houver>

Coloque seu nome completo pelo link:
https://playdetodas.com.br/?lista=k7m2p9qx4t

Não mensalistas: para sair, abra o mesmo link e toque em Tirar meu nome. Mensalistas: avisem a organização.
Mensalistas não precisam colocar o nome: já estão na lista. Abram o link só para conferir; se o seu nome não estiver, fale com a organização.
```

  Atualização (mesmo cabeçalho com `14/16 · 2 vagas` no lugar de `16 vagas`), depois
  `✅ Confirmadas` numeradas (mensalista pré-incluída com ` 📅`), `⏳ Suplentes` numeradas (se houver),
  o **mesmo link** e os mesmos dois avisos. Nome vinculado sai pelo `nameOf` (apelido); sem vínculo, o
  texto digitado.
- [x] Testes em `tests/listaDePresenca.test.ts` (escrever antes, ver falhar, implementar):
  dividir com 18 ativos/16 vagas e com saída de titular (a 1ª suplente sobe); ordem com `ordem` trocada;
  resumo nos três formatos e singulares; posição titular/suplente; `validarNome` (aceita "Ana Lúcia D'Ávila",
  "Maria-Clara", colapsa espaços; recusa "ab", 61 letras, "<b>x</b>", "1234"); `vinculoAutomatico` (nome,
  apelido, alias com acento/caixa, duas "Bruna" → null, parcial → null); `mensalistaEmDiaNoPlay` (pago no
  mês; dia 3 com mês anterior pago → sim; dia 6 com mês anterior → não; dois meses atrás no dia 3 → não;
  avulsa → não; pago adiantado → sim); `preIncluidas` (inativa e pausada fora, ordem por força);
  `ordemParaGarantir`; `estaAberta`; `inicioEmSaoPaulo`; as duas mensagens contêm data/hora, prazo, vagas,
  texto, link e os dois avisos exatos.
- [x] `npm test`, `npm run build`. Commit: `Lista de presenca: regra pura e testes`.

### Tarefa A2: chaves, repositório local e Supabase

**Arquivos:** modificar `src/lib/chaves.ts`, `src/data/repo.ts`, `src/data/localRepo.ts`,
`src/data/supabaseRepo.ts`.

- [x] `chaves.ts`: `aparelho` (`${P}:aparelho`, `crypto.randomUUID()` gerado na 1ª confirmação),
  `listaNome` (último nome digitado), `listaMeus` (`{ [lista_id]: nome_id }` do que este aparelho colocou),
  `listas` (dados do modo local). Todo acesso em `try/catch` (aba anônima).
- [x] `repo.ts` — métodos novos no `Repo` (os dois drivers implementam):

```ts
carregarLista(ref: { codigo: string } | { id: string }): Promise<ListaCompleta | null>
listaAberta(): Promise<ListaCompleta | null>          // a aberta com o play mais próximo
listasRecentes(limite: number): Promise<Lista[]>      // para a organizadora, na aba Play
colocarNaLista(codigo: string, nome: string, aparelho: string): Promise<RespostaDaLista>
tirarDaLista(nomeId: string, aparelho: string): Promise<RespostaDaLista>
salvarLista(l: Lista): Promise<void>                                    // organizadora (upsert)
incluirNaLista(nomes: Pick<NomeNaLista, 'lista_id' | 'nome' | 'player_id' | 'origem' | 'garantida' | 'ordem'>[]): Promise<void>
mexerNoNome(id: string, campos: Partial<Pick<NomeNaLista, 'player_id' | 'ordem' | 'garantida' | 'saiu_em' | 'saiu_por' | 'avisou_24h'>>): Promise<void>
trocarNaLista(a: string, b: string): Promise<void>
ouvirLista(listaId: string, cb: () => void): () => void
```

- [x] `supabaseRepo.ts`:
  - `const TEM_LISTA = LIGA.id === 'feminino'`: fora dele os métodos devolvem `null`/`[]`/`{ok:false, motivo:'sem_tabela'}`
    **sem consultar** e `ouvirLista` devolve `() => {}`.
  - Leitura tolerante: erro de tabela ausente (`PGRST205`, `42P01`, ou "Could not find the table") →
    `avisosDoBanco.tabelas.add('listas')` e `null`/`[]`; sucesso → `delete('listas')`.
  - `colocarNaLista`/`tirarDaLista` = `sb.rpc('lista_colocar', { p_codigo, p_nome, p_aparelho })` etc.;
    o `jsonb` volta como `RespostaDaLista`. `trocarNaLista` = `sb.rpc('lista_trocar', …)`.
  - `listaAberta`: `listas` com `fechada=false` e `fecha_em > agora`, `order play_em`, `limit 1`, e os nomes dela.
  - `ouvirLista`: `sb.channel('lista-' + id)` com `postgres_changes` em `lista_nomes` (`filter: lista_id=eq.<id>`)
    e em `listas` (`filter: id=eq.<id>`). **Não** mexer em `subscribe()` (o canal geral continua sem
    essas tabelas).
- [x] `localRepo.ts`: guarda `{ listas, nomes, aparelhos: {nome_id: aparelho} }` em `CHAVE.listas` e
  **repete as checagens** com as funções puras (`validarNome`, `estaAberta`, aparelho, repetido por
  `normalizar`, `vinculoAutomatico` com os players do `read()`, `ja_na_lista`, teto) — `chegada` =
  maior + 1. `ouvirLista`: avisa por um `EventTarget` do módulo (mesma aba) e pelo evento `storage`
  (outra aba). Aqui o aparelho fica em claro: é só o navegador local.
- [x] `npm test`, `npm run build`. Commit: `Lista de presenca: repositorio local e Supabase`.

### Tarefa A3: hook com canal próprio + entrada pelo link + página da visitante

**Arquivos:** criar `src/lib/useLista.ts`, `src/pages/ListaDePresenca.tsx`; modificar `src/main.tsx`,
`src/App.tsx`, `src/styles.css`.

- [x] `useLista(ref | null)`: `undefined` carregando, `null` não existe/sem tabela, senão `ListaCompleta`.
  Carrega por `useStore().repo`, assina `repo.ouvirLista(id)` com **debounce de 300 ms** (rajada de nomes
  = uma leitura), recarrega ao voltar para a tela (`visibilitychange`) e expõe `recarregar()`. Agenda um
  re-render em `fecha_em` (a tela fecha sozinha na hora). **Nada** de `reload()` do store.
- [x] `main.tsx` (D18): `const temLista = LIGA.id === 'feminino' && new URLSearchParams(location.search).has('lista')`;
  `redirecionar` só sem `temLista`; com `temLista` e sem escolha guardada → `guardarEscolha(LIGA)`;
  `Entrada` começa com `escolheu = true` quando `temLista`.
- [x] `App.tsx` (D19): `const [lista, setLista] = useState<string | null>(codigo da URL)` (só feminino);
  com `lista`, o `<main>` mostra `<ListaDePresenca codigo={lista} onSair={sair} onMontarPlay={…} />`;
  `sair()` = `history.replaceState(null, '', location.pathname)`, `setLista(null)`, `setTab('ranking')`;
  tocar numa aba também sai. `abrirLista(codigo)` desce para Ranking (cartão) e Play (listas/criar).
- [x] Página (visitante): cabeçalho (título, `quandoComData(play_em)`, "fecha `quandoComData(fecha_em)`",
  "14/16 · 2 vagas", texto curto); lista numerada: titulares, divisória "Suplentes", suplentes. Cada nome:
  vinculado → `Avatar` + `nameOf` + força (`notaDeForca(ratings(data).get(id))`) ou, se
  `emAvaliacao(data).has(id) && !canEdit`, `avaliacaoCurta(n)` sem número; sem vínculo → só o texto.
  Embaixo, se aberta: campo "Seu nome completo" (preenchido com `CHAVE.listaNome`), **sem sugestão de
  cadastro**, botão "Colocar meu nome" (≥ 44 px) e "Agora não". Resposta: `ok` → grava aparelho/nome/
  `listaMeus`, modal com `textoDaPosicao` e "Ir para o app" → `onSair`; erro → `MENSAGEM_DO_MOTIVO`.
  Fechada: "A lista fechou em …" e só a lista.
- [x] "Tirar meu nome" só na linha cujo id está em `listaMeus[lista.id]` (e ativa); confirmação com o texto
  exato do desenho (titular × suplente); `ok` → limpa `listaMeus[lista.id]` e `onSair`.
- [x] `null` (link velho ou masculino) → "Esta lista não existe mais." + botão para o app.
- [x] Prints com o robô (ver A8) do visitante: aberta, com vagas, cheia com suplentes, depois de colocar,
  tirar, fechada — 375 px, claro e escuro. Commit: `Lista de presenca: link e pagina da atleta`.

### Tarefa A4: gestão da organizadora (mesma página, `canEdit`)

**Arquivos:** modificar `src/pages/ListaDePresenca.tsx` (se passar de ~500 linhas, separar
`src/components/GestaoDaLista.tsx`).

- [x] Linha sem vínculo: sugestão de `sugestaoDeVinculo` ("É a Fulana? ✓"), "Outra…" (modal com busca nos
  players ativos), "➕ Nova" (reusa `NovaAtleta` com o nome digitado). Vincular = `mexerNoNome(id, {player_id})`
  + `savePlayer({...p, aliases: [...aliases, texto]})` quando a grafia é nova (mesma condição do
  `ImportarLista.tsx:69`). Se a atleta já está ativa noutra linha: "Ela já está na lista (posição N).
  Tirar esta duplicada?" → `mexerNoNome(id, {saiu_em, saiu_por:'organizadora'})`.
- [x] Tirar qualquer nome: confirmação; mensalista (D16) → "Ela avisou com 24h de antecedência?" Sim/Não,
  mostrando "saiu N h antes do play"; grava `saiu_em`, `saiu_por='organizadora'`, `avisou_24h`.
- [x] ➕ Adicionar à mão: escolher cadastro (ou nome livre) → `incluirNaLista([{origem:'organizadora', …}])`
  (entra no fim). "⭐ Garantir vaga" nos `origem='organizadora'` ainda não garantidos →
  `mexerNoNome(id, {garantida:true, ordem: ordemParaGarantir(nomes)})`.
- [x] ⇅ Trocar: tocar em "Trocar" num nome e depois noutro → confirmação "A decisão é sua: X vai para a
  posição N e Y para a M." → `trocarNaLista(a, b)`.
- [x] ✏️ Editar (título, data/hora, prazo, vagas, texto) com o mesmo formulário de A5; 🔒 Fechar /
  🔓 Reabrir (D22); 📤 Copiar atualização (`shareOrCopy(mensagemDeAtualizacao(…))`); 🔗 Mensagem do link.
- [x] Seção recolhida "Saíram (n)": nome, hora de saída, quem tirou, horas antes do play, avisou 24h.
- [x] Toda escrita: `await`, botão ocupado, erro → toast; o tempo real atualiza a lista (D9).
- [x] Commit: `Lista de presenca: gestao da organizadora`.

### Tarefa A5: criar a lista no Novo Play + listas na aba Play

**Arquivos:** criar `src/components/CriarLista.tsx`; modificar `src/pages/Play.tsx`.

- [x] `NewPlay`: no topo do card "🎾 Novo Play", só feminino + `canEdit`, botão
  "📋 Criar lista de presença por link" → `Play` troca para `<CriarLista>` (estado `criandoLista`). Com
  `avisosDoBanco.tabelas.has('listas')` o botão fica desabilitado com "rode o supabase/31-lista-de-presenca.sql".
- [x] `CriarLista`: campos de D21 (título, data, hora, fecha em data+hora, vagas com `Stepper`, texto curto,
  "Já incluir as mensalistas em dia (N)" com a contagem de `preIncluidas`). Validação: prazo antes do play e no
  futuro, vagas ≥ 1. Criar = `salvarLista` → `incluirNaLista(preIncluidas…)` com `ordem` 1..n. Se a 2ª
  escrita falhar: toast e a lista abre mesmo assim (a organizadora adiciona à mão).
- [x] Depois de criar: modal com o link, a `mensagemDoLink` e botões "Compartilhar/copiar" e "Abrir a lista".
- [x] `PlayList`: card "📋 Listas de presença" (feminino + `canEdit`) com `listasRecentes(5)`: título,
  `resumoDoCartao` ou "fechada", toque abre a lista.
- [x] Commit: `Lista de presenca: criar a lista pelo Novo Play`.

### Tarefa A6: montar o play com a lista

**Arquivos:** modificar `src/pages/ListaDePresenca.tsx`, `src/App.tsx`, `src/pages/Play.tsx`.

- [x] Botão "🎾 Montar play com a lista": titular sem vínculo → bloqueia com a lista dos nomes a vincular.
  Antes do prazo → confirmação "Montar o play agora fecha a lista. Quem ainda não colocou o nome vai
  precisar falar com você." → `salvarLista({...lista, fechada:true})` (D20).
- [x] `onMontarPlay({ listaId, titulo, data: dataDoPlay(lista), ids })` → `App` guarda em estado, vai para a
  aba Play; `Play` recebe `montar` e abre `NewPlay` com `preset {title, date}` e prop nova `daLista: string[]`;
  `NewPlay` aplica uma vez com `aplicarLista(daLista)` (pausa + portão, como a lista colada).
- [x] `onCreated(id)` com `montar` → `salvarLista({...lista, session_id: id})`.
- [x] Commit: `Lista de presenca: montar o play a partir da lista`.

### Tarefa A7: cartão na tela inicial

**Arquivos:** modificar `src/pages/Ranking.tsx`.

- [x] Só feminino: `useLista` sobre `repo.listaAberta()` (variante do hook por "a aberta"); com lista aberta,
  um `button.card.proximo` logo **acima** do "Próximo play", selo 📋, título "Lista aberta",
  `resumoDoCartao` sem o prefixo, ação "ver a lista →"; toque → `abrirLista(codigo)`. Sem tabela/sem lista:
  nada.
- [x] Commit: `Lista de presenca: cartao na tela inicial`.

### Tarefa A8: prints, conferência final e documentação

- [x] Vite local em segundo plano (`$env:VITE_SUPABASE_URL='local'; npx vite --port <PORTA> --strictPort --host 127.0.0.1`),
  scripts em `pdt-teste/` usando `abrir(porta, {largura, altura, tema})`: organizadora cria lista, abre
  `?lista=`, coloca nomes (vários aparelhos = `CHAVE.aparelho` limpo entre eles), vincula, garante, troca,
  tira mensalista (pergunta 24h), copia atualização, monta o play, cartão na tela inicial. Visitante com o
  truque temporário de `canEdit` — **desfazer antes do commit** (`git diff src/lib/store.tsx` vazio).
  375 px e 320 px, claro e escuro, sem rolagem horizontal; parar o vite.
  **Feito em 06/11:** 375 e 360 px, escuro (o pedido desta rodada), sem rolagem horizontal; prints em
  `pdt-teste/prints/lista/`, robô `pdt-teste/lista-prints.mjs` e `lista-fechada.mjs`.
- [x] `$env:VITE_LIGA='masculino'; npm run build` e `'misto'`: compila e o recurso não aparece.
- [x] `CLAUDE.md`: bloco "📋 Lista de presença por link" (tabelas, funções, quem escreve o quê, canal
  próprio, `?lista=`, só feminino, script 31). `DECISOES.md`: as decisões D1–D22 em resumo + o que o teste
  B2 provou/não provou. Commit: `Lista de presenca: documentacao`.

## Ordem e dependências

```
B1 → B2 (validação fora do repo; corrige B1 se preciso)
A1 → A2 → A3 → A4 → A5 → A6 → A7 → A8
```

A1 não depende do banco e pode começar junto com B1. Nada vai ao ar sem o dono rodar o script 31 e dar OK
ao push: sem a tabela, a leitura tolerante esconde o cartão e o botão de criar avisa qual script rodar.

## Ligação com o financeiro (só guardar, nesta entrega)

`lista_nomes.entrou_em`, `saiu_em`, `saiu_por`, `origem`, `garantida`, `avisou_24h` e `listas.play_em`,
`listas.session_id`. A suplente "no lugar de uma mensalista" sai disso depois (quem subiu para titular
depois do `saiu_em` de uma `origem='mensalista'`); nada de valor, crédito ou caixa agora.

## Fora do escopo

Conta de atleta, pagamento pela lista, push, lista no Play de Terça/Mista, espelho para o QuadraFácil,
apagar lista pela tela (fica só fechar), histórico de trocas da organizadora.

## Riscos para o revisor

- **A regra de segurança mora no SQL**: a única prova automática é o teste dentro do script (roda no SQL
  Editor do dono) e a validação no PGlite (B2). Conferir a saída do script antes do push.
- `lista_normalizar` (SQL) e `normalizar` (JS) são parecidas, não idênticas (o SQL só conhece os acentos do
  `translate`). Para nomes em português dão o mesmo; um nome com letra fora da tabela só deixa de vincular
  sozinho.
- Insert da organizadora não pega a trava: em corrida rara com uma atleta, a posição devolvida a ela pode
  sair 1 diferente. A ordem gravada continua certa.
- Navegador interno do WhatsApp/Safari com armazenamento separado: ela não vê "Tirar meu nome" e pede à
  organização (limite aceito no desenho).
