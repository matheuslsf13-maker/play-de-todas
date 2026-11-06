-- 34: pagamento pela lista, nas mesmas tabelas dos Check-ins.
-- Idempotente, sem limpar ou migrar dados antigos. Apenas public (feminino).
-- A transacao curta trava as tres tabelas para incluir, corrigir ou desfazer
-- o par checkin/pagamento inteiro, comparando com o que a organizadora viu.
begin;
create or replace function public.gravar_pagamento_lista(pedido jsonb)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  d public.checkin_dias; c public.checkins; p public.checkin_pagamentos;
  ac public.checkins; ap public.checkin_pagamentos;
  nc public.checkins; np public.checkin_pagamentos;
  l public.listas; n public.lista_nomes; escolhido text; qtd int;
  anterior jsonb := pedido->'antes'; depois jsonb := pedido->'depois';
begin
  lock table public.checkin_dias, public.checkins, public.checkin_pagamentos in share row exclusive mode;
  d := jsonb_populate_record(null::public.checkin_dias, pedido->'dia');
  nc := jsonb_populate_record(null::public.checkins, coalesce(nullif(depois,'null'::jsonb), anterior)->'checkin');
  if d.id is null or nc.player_id is null or nc.dia_id is distinct from d.id then raise exception 'Lancamento invalido'; end if;
  if pedido->>'listaId' is not null then
    select * into l from public.listas where id = pedido->>'listaId' for update;
    select * into n from public.lista_nomes where id = pedido->>'nomeId' and lista_id = l.id for update;
    if l.id is null or n.id is null or n.saiu_em is not null or n.player_id is distinct from nc.player_id then
      raise exception 'O nome ou a lista mudou. Abra novamente.';
    end if;
    if not exists(select 1 from public.players where id = n.player_id and categoria = 'avulsa') then raise exception 'So avulsas podem receber este lancamento.'; end if;
    select count(*), min(id) into qtd, escolhido from public.checkin_dias where session_id = l.session_id;
    if qtd = 0 then
      select count(*), min(id) into qtd, escolhido from public.checkin_dias where date = (l.play_em at time zone 'America/Sao_Paulo')::date and session_id is null;
    end if;
    if qtd > 1 then raise exception 'Ha mais de um dia possivel. Confira a aba Check-ins.'; end if;
    if qtd = 1 and escolhido <> d.id then raise exception 'O dia mudou. Abra novamente.'; end if;
    if qtd = 0 and (d.date <> (l.play_em at time zone 'America/Sao_Paulo')::date or d.session_id is distinct from l.session_id or exists(select 1 from public.checkin_dias where id = d.id)) then
      raise exception 'O dia mudou. Abra novamente.';
    end if;
  elsif not exists(select 1 from public.checkin_dias where id = d.id) then
    raise exception 'O dia nao existe mais.';
  end if;
  if exists(select 1 from public.checkin_dias x where x.id=d.id and (x.valor_cheio <> d.valor_cheio or x.valor_com_checkin <> d.valor_com_checkin)) then raise exception 'Os valores do dia mudaram. Abra novamente.'; end if;
  select count(*) into qtd from public.checkins where dia_id = d.id and player_id = nc.player_id;
  if qtd > 1 then raise exception 'Ha lancamentos duplicados. Confira a aba Check-ins.'; end if;
  select * into c from public.checkins where dia_id = d.id and player_id = nc.player_id;
  select * into p from public.checkin_pagamentos where checkin_id = c.id;
  ac := jsonb_populate_record(null::public.checkins, anterior->'checkin');
  ap := jsonb_populate_record(null::public.checkin_pagamentos, anterior->'pagamento');
  if (to_jsonb(c) - 'created_at') is distinct from (to_jsonb(ac) - 'created_at') or to_jsonb(p) is distinct from to_jsonb(ap) then
    raise exception 'O lancamento mudou em outro aparelho. Feche e abra novamente.';
  end if;
  if depois is null or depois = 'null'::jsonb then
    if exists(select 1 from public.checkins where credito_de = c.id) then raise exception 'Este check-in ja foi usado como credito. Confira a aba Check-ins.'; end if;
    delete from public.checkins where id = c.id;
    return;
  end if;
  nc := jsonb_populate_record(null::public.checkins, depois->'checkin');
  np := jsonb_populate_record(null::public.checkin_pagamentos, depois->'pagamento');
  if nc.id is null or (c.id is not null and nc.id <> c.id) or np.checkin_id is distinct from nc.id or nc.modo not in ('integral','checkin') or np.valor_pago is null or np.valor_pago < 0 or np.valor_pago::text in ('NaN','Infinity','-Infinity') or (np.valor_devido is not null and (np.valor_devido < 0 or np.valor_devido::text in ('NaN','Infinity','-Infinity'))) then raise exception 'Confira o valor e o lancamento.'; end if;
  if exists(select 1 from public.checkins where id = nc.id and (dia_id <> d.id or player_id <> nc.player_id)) then raise exception 'Identificador ja usado por outro lancamento.'; end if;
  if nc.conta_id is not null and not exists(select 1 from public.checkin_contas where id = nc.conta_id and player_id = nc.player_id) then raise exception 'Conta de outra atleta.'; end if;
  insert into public.checkin_dias select d.* on conflict (id) do nothing;
  insert into public.checkins select nc.* on conflict (id) do update set
    conta_id=excluded.conta_id, local_id=excluded.local_id, modo=excluded.modo, compareceu=excluded.compareceu,
    checkin_confirmado=excluded.checkin_confirmado, credito_checkin=excluded.credito_checkin, credito_de=excluded.credito_de;
  insert into public.checkin_pagamentos select np.* on conflict(checkin_id) do update set
    valor_pago=excluded.valor_pago, valor_devido=excluded.valor_devido, pagamento_confirmado=excluded.pagamento_confirmado, observacao=excluded.observacao;
end;
$$;
revoke all on function public.gravar_pagamento_lista(jsonb) from public, anon;
grant execute on function public.gravar_pagamento_lista(jsonb) to authenticated;

-- O dia pago antes da montagem acompanha o vinculo da lista ao play.
create or replace function public.ligar_dia_da_lista()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare ids text[];
begin
  if new.session_id is not null and new.session_id is distinct from old.session_id then
    select array_agg(id) into ids from public.checkin_dias where date = (new.play_em at time zone 'America/Sao_Paulo')::date and session_id is null;
    if array_length(ids,1) = 1 and not exists(select 1 from public.checkin_dias where session_id=new.session_id) then
      update public.checkin_dias set session_id = new.session_id where id=ids[1];
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.ligar_dia_da_lista() from public, anon;
grant execute on function public.ligar_dia_da_lista() to authenticated;
drop trigger if exists ligar_dia_da_lista on public.listas;
create trigger ligar_dia_da_lista after update of session_id on public.listas for each row execute function public.ligar_dia_da_lista();
commit;
