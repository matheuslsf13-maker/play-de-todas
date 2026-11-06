-- ============================================================
--  31 · Lista de presenca por link (so o Play de Todas, schema public)
--
--  Rode o arquivo INTEIRO no SQL Editor. Pode rodar de novo.
--  NAO rode o 27 nem o 29 por causa deste: o Play de Terca e o Play Mista
--  nao ganham a lista (o recurso fica escondido la).
--
--  A organizadora cria a lista e manda o link no grupo; a atleta (sem login)
--  coloca o nome e o BANCO da a posicao. Tres tabelas:
--   - listas          a lista (vagas, prazo). Todo mundo le; so logada escreve.
--   - lista_nomes     os nomes. Todo mundo le; so logada escreve direto.
--   - lista_aparelhos o hash do codigo do celular que colocou cada nome.
--                     NINGUEM le nem escreve direto, so as funcoes abaixo.
--  A visitante so escreve por duas funcoes:
--   - lista_colocar(codigo, nome, aparelho)  coloca o nome e devolve a posicao
--   - lista_tirar(nome_id, aparelho)         tira o PROPRIO nome (confere o hash)
--  A organizadora troca posicoes com lista_trocar(a, b).
--
--  Tudo vai numa transacao: se qualquer parte falhar (inclusive o teste de
--  seguranca no fim), nada fica criado. O ultimo resultado e a conferencia:
--  todas as linhas tem de dizer "ok".
-- ============================================================

begin;

-- ---- 1. nome comparavel: minusculas, sem acento, sem pontuacao
-- (immutable para virar coluna gerada; acentos maiusculos no translate porque
--  o lower() com locale C nao conhece acento)
create or replace function public.lista_normalizar(s text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(lower(translate(coalesce(s, ''),
    'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝáàâãäåéèêëíìîïóòôõöúùûüçñý',
    'AAAAAAEEEEIIIIOOOOOUUUUCNYaaaaaaeeeeiiiiooooouuuucny')), '[^a-z0-9]+', ' ', 'g'))
$$;

-- ---- 2. tabelas
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

-- ordem na lista = coalesce(ordem, chegada). chegada e dada pelo banco e nunca
-- muda; ordem so existe quando a organizadora mexe (garantir/trocar) ou nas
-- mensalistas pre-incluidas (1, 2, 3...). Sair e suave (saiu_em), nunca delete.
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
-- o mesmo nome (normalizado) e a mesma atleta nao ficam duas vezes ativos
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

-- ---- 3. colocar o nome (visitante). Cada recusa volta como {ok:false, motivo}.
create or replace function public.lista_colocar(p_codigo text, p_nome text, p_aparelho text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_nome   text;
  v_lista  public.listas;
  v_hash   text;
  v_player text;
  v_achou  text[];
  v_id     text;
  v_pos    bigint;
begin
  if p_aparelho is null or length(p_aparelho) not between 16 and 100 then
    return jsonb_build_object('ok', false, 'motivo', 'aparelho');
  end if;

  -- apostrofo do iPhone (’) vira o reto; espacos colapsados
  v_nome := btrim(regexp_replace(replace(normalize(coalesce(p_nome, ''), NFC), '’', ''''), '\s+', ' ', 'g'));
  if length(v_nome) not between 3 and 60
     or v_nome !~ '^[A-Za-zÀ-ÖØ-öø-ÿ]([A-Za-zÀ-ÖØ-öø-ÿ .''-]*[A-Za-zÀ-ÖØ-öø-ÿ.])?$' then
    return jsonb_build_object('ok', false, 'motivo', 'nome');
  end if;

  select * into v_lista from public.listas where codigo = lower(btrim(p_codigo));
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'nao_existe');
  end if;

  -- uma de cada vez por lista: checagens e posicao nao correm entre si
  perform pg_advisory_xact_lock(hashtextextended('lista:' || v_lista.id, 0));

  -- le de novo depois da trava (a organizadora pode ter fechado nesse meio tempo)
  select * into v_lista from public.listas where id = v_lista.id;
  if v_lista.fechada or now() >= v_lista.fecha_em then
    return jsonb_build_object('ok', false, 'motivo', 'fechada');
  end if;

  v_hash := encode(sha256(convert_to(p_aparelho, 'UTF8')), 'hex');
  if exists (select 1 from public.lista_aparelhos a
               join public.lista_nomes n on n.id = a.nome_id
              where a.lista_id = v_lista.id and a.aparelho_hash = v_hash and n.saiu_em is null) then
    return jsonb_build_object('ok', false, 'motivo', 'aparelho_ja_tem_nome');
  end if;

  -- vinculo automatico: a grafia e o nome, apelido ou alias de UM cadastro so
  select array_agg(p.id) into v_achou
    from public.players p
   where public.lista_normalizar(p.name) = public.lista_normalizar(v_nome)
      or public.lista_normalizar(p.nickname) = public.lista_normalizar(v_nome)
      or exists (select 1 from unnest(p.aliases) a
                  where public.lista_normalizar(a) = public.lista_normalizar(v_nome));
  if cardinality(v_achou) = 1 then
    v_player := v_achou[1];
    if exists (select 1 from public.lista_nomes
                where lista_id = v_lista.id and player_id = v_player and saiu_em is null) then
      return jsonb_build_object('ok', false, 'motivo', 'ja_na_lista');
    end if;
  end if;

  if exists (select 1 from public.lista_nomes
              where lista_id = v_lista.id and nome_norm = public.lista_normalizar(v_nome)
                and saiu_em is null) then
    return jsonb_build_object('ok', false, 'motivo', 'repetido');
  end if;

  -- teto contra spam
  if (select count(*) from public.lista_nomes where lista_id = v_lista.id and saiu_em is null)
     >= v_lista.vagas * 3 then
    return jsonb_build_object('ok', false, 'motivo', 'cheia');
  end if;

  begin
    insert into public.lista_nomes (lista_id, nome, player_id, origem)
    values (v_lista.id, v_nome, v_player, 'link')
    returning id into v_id;
  exception when unique_violation then
    -- a organizadora (que nao pega a trava) incluiu o mesmo nome/atleta agora
    return jsonb_build_object('ok', false, 'motivo',
      case when v_player is not null then 'ja_na_lista' else 'repetido' end);
  end;
  insert into public.lista_aparelhos (nome_id, lista_id, aparelho_hash) values (v_id, v_lista.id, v_hash);

  select pos into v_pos from (
    select id, row_number() over (order by coalesce(ordem, chegada), chegada) as pos
      from public.lista_nomes where lista_id = v_lista.id and saiu_em is null
  ) t where t.id = v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'posicao', v_pos, 'vagas', v_lista.vagas);
end $$;

-- ---- 4. tirar o PROPRIO nome (visitante): so com o mesmo codigo de aparelho
create or replace function public.lista_tirar(p_nome_id text, p_aparelho text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_lista public.listas;
  v_n     int;
begin
  select l.* into v_lista
    from public.lista_nomes n join public.listas l on l.id = n.lista_id
   where n.id = p_nome_id and n.saiu_em is null;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'nao_esta');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('lista:' || v_lista.id, 0));

  select * into v_lista from public.listas where id = v_lista.id;
  if v_lista.fechada or now() >= v_lista.fecha_em then
    return jsonb_build_object('ok', false, 'motivo', 'fechada');
  end if;

  if not exists (select 1 from public.lista_aparelhos
                  where nome_id = p_nome_id
                    and aparelho_hash = encode(sha256(convert_to(coalesce(p_aparelho, ''), 'UTF8')), 'hex')) then
    return jsonb_build_object('ok', false, 'motivo', 'nao_e_seu');
  end if;

  update public.lista_nomes set saiu_em = now(), saiu_por = 'atleta'
   where id = p_nome_id and saiu_em is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'nao_esta');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---- 5. trocar dois nomes de lugar (organizadora; vale a permissao de quem chama)
create or replace function public.lista_trocar(p_a text, p_b text)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_lista text;
  ka double precision;
  kb double precision;
begin
  select lista_id into v_lista from public.lista_nomes where id = p_a and saiu_em is null;
  if not found then
    raise exception 'lista_trocar: nome % nao esta na lista', p_a;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('lista:' || v_lista, 0));

  select coalesce(ordem, chegada) into ka from public.lista_nomes
   where id = p_a and lista_id = v_lista and saiu_em is null;
  select coalesce(ordem, chegada) into kb from public.lista_nomes
   where id = p_b and lista_id = v_lista and saiu_em is null;
  if ka is null or kb is null then
    raise exception 'lista_trocar: os dois nomes tem de estar ativos na mesma lista';
  end if;

  update public.lista_nomes set ordem = case id when p_a then kb else ka end
   where id in (p_a, p_b);
end $$;

-- ---- 6. permissoes (RLS + grants) e tempo real
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
-- a coluna identity nao precisa de grant na sequencia; ninguem de fora mexe nela
revoke all on sequence public.lista_nomes_chegada_seq from anon, authenticated;

revoke all on function public.lista_normalizar(text)           from anon, authenticated;
grant execute on function public.lista_normalizar(text)        to anon, authenticated;
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

-- ---- 7. teste de seguranca: cria dados de teste, testa como visitante e
-- desfaz tudo no fim (raise 'teste-ok'). Qualquer FALHOU desfaz o script inteiro.
do $$
declare
  v_cod  text := 'zzteste31lista';
  r      jsonb;
  v_ana  text;
  v_bia  text;
  v_org  text;
  v_n    int;
  v_ok   boolean;
begin
  begin
    insert into public.players (id, name, aliases) values ('teste-lista-31', 'Zzteste Unica', array['Zz Apelido']);
    insert into public.listas (id, codigo, play_em, fecha_em, vagas)
    values ('teste-lista-31', v_cod, now() + interval '2 days', now() + interval '1 hour', 2);

    r := public.lista_colocar(v_cod, 'Zzana Teste', 'aparelho-A-0123456789');
    if not coalesce((r->>'ok')::boolean, false) or (r->>'posicao')::int <> 1 then
      raise exception 'FALHOU: colocar o primeiro nome devolveu %', r;
    end if;
    v_ana := r->>'id';

    -- daqui em diante: como VISITANTE (chave publica do site)
    execute 'set local role anon';

    -- a regra que importa: tirar o nome de outra com outro aparelho
    r := public.lista_tirar(v_ana, 'aparelho-B-0123456789');
    if coalesce((r->>'ok')::boolean, true) or r->>'motivo' <> 'nao_e_seu' then
      raise exception 'FALHOU: a visitante tirou o nome de outra (%)', r;
    end if;
    if not exists (select 1 from public.lista_nomes where id = v_ana and saiu_em is null) then
      raise exception 'FALHOU: o nome saiu da lista com o aparelho errado';
    end if;

    -- nada de escrita direta
    begin
      update public.lista_nomes set saiu_em = now() where id = v_ana;
      get diagnostics v_n = row_count;
      if v_n > 0 then raise exception 'FALHOU: visitante fez update direto em lista_nomes'; end if;
    exception when insufficient_privilege then null;
    end;
    begin
      delete from public.lista_nomes where id = v_ana;
      get diagnostics v_n = row_count;
      if v_n > 0 then raise exception 'FALHOU: visitante fez delete direto em lista_nomes'; end if;
    exception when insufficient_privilege then null;
    end;
    begin
      update public.listas set fechada = true where id = 'teste-lista-31';
      get diagnostics v_n = row_count;
      if v_n > 0 then raise exception 'FALHOU: visitante mudou a lista direto'; end if;
    exception when insufficient_privilege then null;
    end;
    v_ok := false;
    begin
      insert into public.lista_nomes (lista_id, nome, origem) values ('teste-lista-31', 'Zzinvasora Teste', 'link');
    exception when insufficient_privilege then v_ok := true;
    end;
    if not v_ok then raise exception 'FALHOU: visitante fez insert direto em lista_nomes'; end if;
    v_ok := false;
    begin
      perform 1 from public.lista_aparelhos limit 1;
    exception when insufficient_privilege then v_ok := true;
    end;
    if not v_ok then raise exception 'FALHOU: visitante leu lista_aparelhos'; end if;
    v_ok := false;
    begin
      perform public.lista_trocar(v_ana, v_ana);
    exception when insufficient_privilege then v_ok := true;
    end;
    if not v_ok then raise exception 'FALHOU: visitante chamou lista_trocar'; end if;

    -- as recusas das regras
    r := public.lista_colocar(v_cod, 'Zzoutra Teste', 'aparelho-A-0123456789');
    if r->>'motivo' is distinct from 'aparelho_ja_tem_nome' then raise exception 'FALHOU: dois nomes no mesmo aparelho (%)', r; end if;
    r := public.lista_colocar(v_cod, 'zzANA   teste', 'aparelho-C-0123456789');
    if r->>'motivo' is distinct from 'repetido' then raise exception 'FALHOU: nome repetido entrou (%)', r; end if;
    r := public.lista_colocar(v_cod, 'zzteste única', 'aparelho-D-0123456789');
    if not coalesce((r->>'ok')::boolean, false)
       or (select player_id from public.lista_nomes where id = r->>'id') is distinct from 'teste-lista-31' then
      raise exception 'FALHOU: vinculo automatico pelo nome (%)', r;
    end if;
    r := public.lista_colocar(v_cod, 'Zz Apelido', 'aparelho-E-0123456789');
    if r->>'motivo' is distinct from 'ja_na_lista' then raise exception 'FALHOU: atleta ja na lista entrou de novo (%)', r; end if;
    r := public.lista_colocar(v_cod, '<b>x</b>', 'aparelho-F-0123456789');
    if r->>'motivo' is distinct from 'nome' then raise exception 'FALHOU: nome invalido aceito (%)', r; end if;

    -- teto: 2 vagas x 3 = 6 ativos
    r := public.lista_colocar(v_cod, 'Zzbia Teste', 'aparelho-G-0123456789');  v_bia := r->>'id';
    r := public.lista_colocar(v_cod, 'Zzcris Teste', 'aparelho-H-0123456789');
    r := public.lista_colocar(v_cod, 'Zzduda Teste', 'aparelho-I-0123456789');
    r := public.lista_colocar(v_cod, 'Zzeva Teste', 'aparelho-J-0123456789');
    if not coalesce((r->>'ok')::boolean, false) or (r->>'posicao')::int <> 6 then
      raise exception 'FALHOU: sexto nome devolveu %', r;
    end if;
    r := public.lista_colocar(v_cod, 'Zzfabi Teste', 'aparelho-K-0123456789');
    if r->>'motivo' is distinct from 'cheia' then raise exception 'FALHOU: passou do teto (%)', r; end if;

    -- controle positivo: o proprio aparelho tira o proprio nome
    r := public.lista_tirar(v_ana, 'aparelho-A-0123456789');
    if not coalesce((r->>'ok')::boolean, false) then raise exception 'FALHOU: nao tirou o proprio nome (%)', r; end if;

    -- prazo vencido: ninguem coloca nem tira
    execute 'reset role';
    update public.listas set fecha_em = now() - interval '1 second' where id = 'teste-lista-31';
    execute 'set local role anon';
    r := public.lista_colocar(v_cod, 'Zzfabi Teste', 'aparelho-K-0123456789');
    if r->>'motivo' is distinct from 'fechada' then raise exception 'FALHOU: entrou com o prazo vencido (%)', r; end if;
    r := public.lista_tirar(v_bia, 'aparelho-G-0123456789');
    if r->>'motivo' is distinct from 'fechada' then raise exception 'FALHOU: saiu com o prazo vencido (%)', r; end if;

    -- a organizadora (logada) escreve direto e troca posicoes, mas tambem nao le os hashes
    execute 'set local role authenticated';
    insert into public.lista_nomes (lista_id, nome, origem) values ('teste-lista-31', 'Zzmanual Teste', 'organizadora')
    returning id into v_org;
    perform public.lista_trocar(v_bia, v_org);
    if (select ordem from public.lista_nomes where id = v_bia)
       <= (select ordem from public.lista_nomes where id = v_org) then
      raise exception 'FALHOU: lista_trocar nao trocou';
    end if;
    v_ok := false;
    begin
      perform 1 from public.lista_aparelhos limit 1;
    exception when insufficient_privilege then v_ok := true;
    end;
    if not v_ok then raise exception 'FALHOU: logada leu lista_aparelhos'; end if;

    raise exception 'teste-ok';
  exception when others then
    if sqlerrm <> 'teste-ok' then raise; end if;
  end;
end $$;

commit;

-- ---- 8. conferencia: todas as linhas tem de dizer "ok"
select conferencia, case when certo then 'ok' else 'FALHOU' end as resultado from (values
  ('teste de seguranca (visitante nao tira nome de outra etc.)', true),
  ('RLS ligada nas 3 tabelas',
    (select count(*) from pg_class where relrowsecurity and oid in
      ('public.listas'::regclass, 'public.lista_nomes'::regclass, 'public.lista_aparelhos'::regclass)) = 3),
  ('listas e lista_nomes: leitura publica + escrita autenticada',
    (select count(*) from pg_policies where schemaname = 'public' and tablename in ('listas', 'lista_nomes')) = 4),
  ('lista_aparelhos sem nenhuma policy',
    not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lista_aparelhos')),
  ('visitante so le listas e lista_nomes',
    has_table_privilege('anon', 'public.listas', 'select') and has_table_privilege('anon', 'public.lista_nomes', 'select')
    and not has_table_privilege('anon', 'public.listas', 'insert,update,delete')
    and not has_table_privilege('anon', 'public.lista_nomes', 'insert,update,delete')),
  ('ninguem le lista_aparelhos (visitante nem logada)',
    not has_table_privilege('anon', 'public.lista_aparelhos', 'select,insert,update,delete')
    and not has_table_privilege('authenticated', 'public.lista_aparelhos', 'select,insert,update,delete')),
  ('visitante chama colocar e tirar, mas nao trocar',
    has_function_privilege('anon', 'public.lista_colocar(text,text,text)', 'execute')
    and has_function_privilege('anon', 'public.lista_tirar(text,text)', 'execute')
    and not has_function_privilege('anon', 'public.lista_trocar(text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.lista_trocar(text,text)', 'execute')),
  ('colocar e tirar rodam como dono (security definer)',
    (select bool_and(prosecdef) from pg_proc where oid in
      ('public.lista_colocar(text,text,text)'::regprocedure, 'public.lista_tirar(text,text)'::regprocedure))),
  ('tempo real: listas e lista_nomes dentro, lista_aparelhos fora',
    (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('listas', 'lista_nomes')) = 2
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'lista_aparelhos')),
  ('lista_normalizar(''Ána  Lúcia-Prétti'') = ana lucia pretti',
    public.lista_normalizar('Ána  Lúcia-Prétti') = 'ana lucia pretti')
) as c(conferencia, certo);
