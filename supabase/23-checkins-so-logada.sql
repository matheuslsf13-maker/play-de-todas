-- ============================================================
--  23 · Check-ins so para quem organiza
--
--  Rode o arquivo INTEIRO no SQL Editor. Pode rodar de novo.
--
--  As abas Meninas e Check-ins agora so aparecem para quem esta logada. Mas
--  esconder a aba nao esconde o dado: a chave publica do site deixa qualquer
--  um ler as tabelas que tem "leitura publica". O dinheiro (pagamentos, caixa,
--  acertos) ja era so logada; aqui as contas de passe, os dias, os check-ins,
--  as arenas e os planos passam a ser tambem. A escrita continua como era.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array['checkin_locais', 'checkin_contas', 'checkin_dias', 'checkins', 'checkin_planos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "leitura publica" on public.%I', t);
    execute format('drop policy if exists "leitura de quem organiza" on public.%I', t);
    execute format('create policy "leitura de quem organiza" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- ---- conferencia: cada tabela com a leitura so para "authenticated"
select tablename, policyname, roles, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename in ('checkin_locais', 'checkin_contas', 'checkin_dias', 'checkins', 'checkin_planos')
   and cmd = 'SELECT'
 order by tablename;
