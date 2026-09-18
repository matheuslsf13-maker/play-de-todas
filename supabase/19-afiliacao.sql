-- ============================================================
--  19 · Arenas que dividem check-in (V3 e Itaparica)
--
--  Rode o arquivo INTEIRO no SQL Editor. Pode rodar de novo.
--
--  O que as aulas cobram além da cota numa arena pode sair da cota de outra
--  arena da MESMA conta — mas só entre arenas afiliadas: a V3 e a Itaparica
--  se cobrem, a GW não divide com ninguém. `afiliacao` é um rótulo de grupo:
--  arenas com o mesmo rótulo se cobrem; nulo = não divide.
-- ============================================================

alter table public.checkin_locais add column if not exists afiliacao text;

update public.checkin_locais
   set afiliacao = 'v3-itaparica'
 where id in ('local-arena-v3', 'local-itaparica-beach') and afiliacao is null;

-- ---- conferência: V3 e Itaparica com 'v3-itaparica', GW sem nada
select id, nome, afiliacao from public.checkin_locais order by ordem;
