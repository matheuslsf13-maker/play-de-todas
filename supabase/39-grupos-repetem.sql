-- 39: "Todas repetem uma vez" (dono, 17/11/2026).
-- Indices dos grupos (sessions.groups) que jogam o rodizio duas vezes: cada dupla se forma de novo e todas jogam
-- o dobro. Vale so para grupo em que o rodizio fecha sem ninguem repetir (4, 5, 8, 9...). Nulo = ninguem repete.
alter table public.sessions add column if not exists grupos_repetem integer[];

notify pgrst, 'reload schema';
