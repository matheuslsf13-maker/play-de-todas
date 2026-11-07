-- 34 - Fichas de mensalidade e seus comprovantes (Play de Todas).
-- Reexecutável. A conferência final mostra as duas tabelas, políticas e tempo real.
begin;

create table if not exists public.mensalidades (
  id text primary key,
  player_id text not null,
  mes text not null check (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  valor_cheio numeric(10,2) not null default 180,
  valor_checkin numeric(10,2) not null default 25,
  max_checkins int not null default 4,
  created_at timestamptz not null default now(),
  unique (player_id, mes)
);

create table if not exists public.mensalidade_itens (
  id text primary key,
  player_id text not null,
  mes text not null check (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  tipo text not null check (tipo in ('checkin','dinheiro','abatimento')),
  date date not null,
  valor numeric(10,2) check (tipo <> 'checkin' or valor is null),
  conta_id text references public.checkin_contas(id) on delete set null,
  local_id text references public.checkin_locais(id) on delete set null,
  confirmado boolean not null default false,
  observacao text,
  created_at timestamptz not null default now()
);
create index if not exists mensalidade_itens_player_mes_idx on public.mensalidade_itens (player_id, mes);

alter table public.mensalidades enable row level security;
alter table public.mensalidade_itens enable row level security;
drop policy if exists "so quem organiza" on public.mensalidades;
create policy "so quem organiza" on public.mensalidades
  for all to authenticated using (true) with check (true);
drop policy if exists "so quem organiza" on public.mensalidade_itens;
create policy "so quem organiza" on public.mensalidade_itens
  for all to authenticated using (true) with check (true);

revoke all on public.mensalidades, public.mensalidade_itens from public, anon, authenticated;
-- Sem política de leitura para anon, a consulta pública recebe listas vazias.
grant select on public.mensalidades, public.mensalidade_itens to anon;
grant select, insert, update, delete on public.mensalidades, public.mensalidade_itens to authenticated;

-- Mover e remover na mesma transação permite repetir o envio sem substituir a ficha de destino.
create or replace function public.juntar_mensalidades(origem text, destino text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if origem = destino or destino is null or origem is null then
    raise exception 'Informe dois cadastros diferentes';
  end if;
  with fichas as (
    delete from public.mensalidades where player_id = origem returning *
  )
  insert into public.mensalidades (id, player_id, mes, valor_cheio, valor_checkin, max_checkins, created_at)
    select 'mensalidade:' || destino || ':' || mes, destino, mes, valor_cheio, valor_checkin, max_checkins, created_at
    from fichas
    on conflict (player_id, mes) do nothing;
  update public.mensalidade_itens set player_id = destino where player_id = origem;
  update public.mensalidade_itens set conta_id = 'principal:' || destino where conta_id = 'principal:' || origem;
end $$;
revoke all on function public.juntar_mensalidades(text, text) from public, anon;
grant execute on function public.juntar_mensalidades(text, text) to authenticated;

do $$
declare tabela text;
begin
  foreach tabela in array array['mensalidades', 'mensalidade_itens'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = tabela) then
      execute format('alter publication supabase_realtime add table public.%I', tabela);
    end if;
  end loop;
end $$;

commit;

select c.relname as tabela, c.relrowsecurity as rls_ligado,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
    and p.roles = array['authenticated']::name[] and p.cmd = 'ALL') as politicas_autenticadas,
  exists (select 1 from pg_publication_tables pt where pt.pubname = 'supabase_realtime'
    and pt.schemaname = 'public' and pt.tablename = c.relname) as tempo_real
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('mensalidades','mensalidade_itens')
order by 1;
