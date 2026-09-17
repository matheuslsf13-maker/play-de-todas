-- ============================================================
--  Carga de setembro de 2026: a planilha "Controle Play de Todas"
--  Rode DEPOIS do 15-checkins.sql. Pode rodar de novo: o que ja existe
--  (mesmo id) fica como esta, entao uma correcao feita no app nao e desfeita.
--
--  O que entra:
--   - o dia 14/09 (R$ 50 integral, R$ 25 com check-in), ligado ao play do dia
--   - as contas: as secundarias (Brayan, Matheus, Rogério) e a principal de
--     quem fez check-in na propria conta, com o app e a arena de costume
--   - os 15 lancamentos da planilha, com pagamento e status iguais aos dela
--   - o caixa: a receita avulsa de 04/09 e as tres saidas de setembro
--
--  Conferencia: receita dos plays 500 + extra 90 = 590; despesas 802,99;
--  saldo -212,99 -- os mesmos numeros da aba Resumo da planilha.
-- ============================================================

-- ---- o dia
insert into public.checkin_dias (id, date, session_id, titulo, valor_cheio, valor_com_checkin) values
  ('seed-dia-2026-09-14', '2026-09-14', '6c4c5f4c-a107-4e82-996d-17f17e874d7a', null, 50, 25)
on conflict (id) do nothing;

-- ---- contas secundarias (o nome que a arena ve)
insert into public.checkin_contas (id, player_id, nome, principal, tipo, aulas_semana, local_padrao_id) values
  ('seed-conta-brayan',  'b9e07b3b-f302-4eff-9ca2-ea26fab6dc9c', 'Brayan de Oliveira Castro', false, 'wellhub',   null, 'local-arena-v3'),
  ('seed-conta-matheus', 'a2150a6d-ca0b-4750-81f3-d8c82d4ec1cd', 'Matheus',                   false, 'totalpass', null, 'local-arena-v3'),
  ('seed-conta-rogerio', '5985edb8-679b-4d63-9f1e-e6a3dc89c670', 'Rogério Dornelas',          false, 'totalpass', null, 'local-itaparica-beach')
on conflict (id) do nothing;

-- ---- a principal de quem usou a propria conta: so o app e a arena de costume
--      (as aulas ficam por informar; ate la a conta vale 12)
insert into public.checkin_contas (id, player_id, nome, principal, tipo, aulas_semana, local_padrao_id) values
  ('principal:3d09cbb3-9971-4d54-9f29-f7a7e0812e2a', '3d09cbb3-9971-4d54-9f29-f7a7e0812e2a', '', true, 'wellhub',   null, 'local-gw-lider'),   -- Bianca
  ('principal:4726ef0b-1844-4733-8d31-8ded2e0c2a68', '4726ef0b-1844-4733-8d31-8ded2e0c2a68', '', true, 'wellhub',   null, 'local-gw-lider'),   -- Eunice
  ('principal:07af6498-62de-445d-88c7-63cf93d29574', '07af6498-62de-445d-88c7-63cf93d29574', '', true, 'wellhub',   null, 'local-gw-lider'),   -- Karla Coelho
  ('principal:287ff2bc-fbfe-49ab-9a80-247fe5b18ac5', '287ff2bc-fbfe-49ab-9a80-247fe5b18ac5', '', true, 'wellhub',   null, 'local-gw-lider'),   -- Pamella
  ('principal:5a9b25f6-5c9e-4fe1-a52c-30b31f729694', '5a9b25f6-5c9e-4fe1-a52c-30b31f729694', '', true, 'wellhub',   null, 'local-gw-lider'),   -- Isabela Cardoso
  ('principal:7d2841a5-63d7-43fe-85ad-5c9ae9b1bd9c', '7d2841a5-63d7-43fe-85ad-5c9ae9b1bd9c', '', true, 'totalpass', null, 'local-arena-v3')    -- Izabelle Avena
on conflict (id) do nothing;

-- ---- os lancamentos de 14/09 (a parte publica)
insert into public.checkins (id, dia_id, player_id, conta_id, local_id, modo, compareceu, checkin_confirmado) values
  ('seed-ck-01', 'seed-dia-2026-09-14', '5bfe1450-8cd7-4e48-864d-87cefe93c0db', null,                  null,                    'integral', false, false), -- Gabriela Machado (nao foi)
  ('seed-ck-02', 'seed-dia-2026-09-14', 'b9e07b3b-f302-4eff-9ca2-ea26fab6dc9c', 'seed-conta-brayan',   'local-arena-v3',        'checkin',  true,  true),  -- Gabriela Colatto, conta do Brayan
  ('seed-ck-03', 'seed-dia-2026-09-14', 'a2150a6d-ca0b-4750-81f3-d8c82d4ec1cd', 'seed-conta-matheus',  'local-arena-v3',        'checkin',  true,  true),  -- Beatriz, conta do Matheus
  ('seed-ck-04', 'seed-dia-2026-09-14', '5985edb8-679b-4d63-9f1e-e6a3dc89c670', 'seed-conta-rogerio',  'local-itaparica-beach', 'checkin',  true,  true),  -- Lorena, conta do Rogério
  ('seed-ck-05', 'seed-dia-2026-09-14', '3d09cbb3-9971-4d54-9f29-f7a7e0812e2a', null,                  'local-gw-lider',        'checkin',  true,  true),  -- Bianca
  ('seed-ck-06', 'seed-dia-2026-09-14', '81cf32d0-a305-4397-ba82-ffd48b0785cb', null,                  null,                    'integral', true,  false), -- Ana Pretti
  ('seed-ck-07', 'seed-dia-2026-09-14', '7355e790-f24f-486d-9983-3fa1db2169bc', null,                  null,                    'integral', true,  false), -- Ana Christo (45 combinado)
  ('seed-ck-08', 'seed-dia-2026-09-14', '4726ef0b-1844-4733-8d31-8ded2e0c2a68', null,                  'local-gw-lider',        'checkin',  true,  true),  -- Eunice (pagou 45: credito 20)
  ('seed-ck-09', 'seed-dia-2026-09-14', '07af6498-62de-445d-88c7-63cf93d29574', null,                  'local-gw-lider',        'checkin',  true,  true),  -- Karla Coelho
  ('seed-ck-10', 'seed-dia-2026-09-14', '287ff2bc-fbfe-49ab-9a80-247fe5b18ac5', null,                  'local-gw-lider',        'checkin',  true,  true),  -- Pamella
  ('seed-ck-11', 'seed-dia-2026-09-14', '5a9b25f6-5c9e-4fe1-a52c-30b31f729694', null,                  'local-gw-lider',        'checkin',  true,  false), -- Isabela Cardoso (check-in a confirmar)
  ('seed-ck-12', 'seed-dia-2026-09-14', '7d2841a5-63d7-43fe-85ad-5c9ae9b1bd9c', null,                  'local-arena-v3',        'checkin',  true,  false), -- Izabelle Avena (check-in a confirmar)
  ('seed-ck-13', 'seed-dia-2026-09-14', '350549db-b184-4c5a-acb5-7ffc1fb197bc', null,                  null,                    'integral', true,  false), -- Mariana Valério
  ('seed-ck-14', 'seed-dia-2026-09-14', '12adc5b1-c159-485c-8527-4d1ccb214b82', null,                  null,                    'integral', false, false), -- Carol (nao foi)
  ('seed-ck-15', 'seed-dia-2026-09-14', 'e6d740e5-1117-4bb3-8da6-399519e6d8cd', null,                  null,                    'integral', false, false)  -- Maria Paula (nao foi)
on conflict (id) do nothing;

-- ---- o dinheiro de cada lancamento (so quem esta logada le)
insert into public.checkin_pagamentos (checkin_id, valor_pago, valor_devido, pagamento_confirmado, observacao) values
  ('seed-ck-01', 45, null, true, 'Crédito pois não foi'),
  ('seed-ck-02', 25, null, true, null),
  ('seed-ck-03', 25, null, true, null),
  ('seed-ck-04', 25, null, true, null),
  ('seed-ck-05', 25, null, true, null),
  ('seed-ck-06', 50, null, true, null),
  ('seed-ck-07', 45, 45,   true, null),  -- preco combinado: 45, nao 50
  ('seed-ck-08', 45, null, true, 'Crédito de 20,00 pois fez o check-in na GW'),
  ('seed-ck-09', 25, null, true, null),
  ('seed-ck-10', 25, null, true, null),
  ('seed-ck-11', 25, null, true, null),
  ('seed-ck-12', 25, null, true, null),
  ('seed-ck-13', 50, null, true, null),
  ('seed-ck-14', 45, null, true, 'Crédito pois não foi'),
  ('seed-ck-15', 20, null, true, 'Crédito pois não foi')
on conflict (checkin_id) do nothing;

-- ---- o caixa de setembro
insert into public.caixa (id, date, descricao, categoria, tipo, valor) values
  ('seed-caixa-01', '2026-09-04', 'Valor avulso do play de sexta', 'extra',   'entrada', 90),
  ('seed-caixa-02', '2026-09-08', 'Brindes Shopee',                'brinde',  'saida',   298.02),
  ('seed-caixa-03', '2026-09-11', 'Brindes Decathlon',             'brinde',  'saida',   104.97),
  ('seed-caixa-04', '2026-09-14', 'Aluguel GW Líder',              'aluguel', 'saida',   400)
on conflict (id) do nothing;

-- ---- conferencia: deve mostrar 500 | 90 | 802.99 | -212.99
select
  (select sum(valor_pago) from public.checkin_pagamentos where checkin_id like 'seed-ck-%') as receita_plays,
  (select sum(valor) from public.caixa where tipo = 'entrada' and date between '2026-09-01' and '2026-09-30') as receitas_extras,
  (select sum(valor) from public.caixa where tipo = 'saida' and date between '2026-09-01' and '2026-09-30') as despesas,
  (select sum(valor_pago) from public.checkin_pagamentos where checkin_id like 'seed-ck-%')
    + (select sum(valor) from public.caixa where tipo = 'entrada' and date between '2026-09-01' and '2026-09-30')
    - (select sum(valor) from public.caixa where tipo = 'saida' and date between '2026-09-01' and '2026-09-30') as saldo;
