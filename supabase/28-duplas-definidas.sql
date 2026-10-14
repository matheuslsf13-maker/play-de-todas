-- ============================================================
--  Duplas fixas desde o início (formato "🔗 Duplas fixas")
--  Rode no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.
--
--  Guarda no play as duplas da noite, formadas na criação. Vale para o
--  Play de Todas (public) e para o Play de Terça (masculino).
-- ============================================================

alter table public.sessions add column if not exists duplas_definidas jsonb;

do $$
begin
  if to_regclass('masculino.sessions') is not null then
    execute 'alter table masculino.sessions add column if not exists duplas_definidas jsonb';
  end if;
end $$;
