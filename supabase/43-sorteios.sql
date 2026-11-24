-- 43: histórico do sorteio (dono, 24/11/2026)
-- Cada sorteio do ranking do dia ou do mês vira uma linha: em que lista foi (chave), quem ganhou e a hora.
--   chave: 'play:<id do play>', 'mes:AAAA-MM' ou 'historico' (o ranking geral)
--   player_id: o cadastro de quem ganhou ('extra:...' para um nome de fora digitado na hora)
-- Sem chave estrangeira de propósito: apagar ou juntar cadastro não pode travar a fila de envio.
-- Só quem está logada lê e grava (o sorteio só aparece para quem organiza). Só o Play de Todas.
-- Pode rodar de novo.

create table if not exists public.sorteios (
  id          text primary key,
  chave       text not null,
  player_id   text,
  nome        text not null,
  em          timestamptz not null default now()
);
create index if not exists sorteios_chave on public.sorteios (chave);

alter table public.sorteios enable row level security;
drop policy if exists "so quem organiza" on public.sorteios;
create policy "so quem organiza" on public.sorteios for all to authenticated using (true) with check (true);
revoke all on public.sorteios from public, anon, authenticated;
grant select on public.sorteios to anon;  -- sem política para anon: volta vazio, sem erro
grant select, insert, update, delete on public.sorteios to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'sorteios') then
    alter publication supabase_realtime add table public.sorteios;
  end if;
end $$;

notify pgrst, 'reload schema';

select 'sorteios' as tabela, count(*) as linhas from public.sorteios;
