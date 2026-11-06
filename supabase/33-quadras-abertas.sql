-- D44: numeros fisicos e identificadores dos toques ja aplicados.
-- Idempotente; nao apaga dados nem muda as permissoes existentes.
begin;
do $migracao$
declare esquema text;
begin
  foreach esquema in array array['public', 'masculino', 'misto'] loop
    if to_regclass(format('%I.sessions', esquema)) is null then continue; end if;
    execute format('alter table %I.sessions add column if not exists quadras_abertas integer[]', esquema);
    execute format('alter table %I.sessions add column if not exists quadras_operacoes text[]', esquema);

    -- UPDATE da sessao ja segura a trava da linha. Inclui qualquer jogo que
    -- comecou antes da retirada, e mantem courts coerente para apps antigos.
    execute format($sql$
      create or replace function %1$I.proteger_quadras() returns trigger
      language plpgsql security invoker set search_path = pg_catalog as $fn$
      declare ocupadas integer[];
      begin
        execute format('select array_agg(distinct court) from %%I.matches where session_id = $1 and started_at is not null and (score_a is null or score_b is null) and court > 0', TG_TABLE_SCHEMA)
          into ocupadas using NEW.id;
        NEW.quadras_abertas := coalesce(NEW.quadras_abertas,
          array(select generate_series(1, greatest(1, NEW.courts))));
        NEW.quadras_abertas := array(select distinct q from unnest(NEW.quadras_abertas || coalesce(ocupadas, '{}'::integer[])) q where q > 0 order by q);
        if cardinality(NEW.quadras_abertas) = 0 then NEW.quadras_abertas := array[1]; end if;
        NEW.courts := cardinality(NEW.quadras_abertas);
        return NEW;
      end $fn$;
    $sql$, esquema);

    -- Um inicio que chegou depois da retirada reabre a quadra. O UPDATE
    -- serializa com a retirada na MESMA linha da sessao, em qualquer ordem.
    execute format($sql$
      create or replace function %1$I.garantir_quadra_da_partida() returns trigger
      language plpgsql security invoker set search_path = pg_catalog as $fn$
      begin
        if NEW.started_at is not null and (NEW.score_a is null or NEW.score_b is null) and NEW.court > 0 then
          execute format('update %%I.sessions set quadras_abertas = array(select distinct q from unnest(coalesce(quadras_abertas, array(select generate_series(1, greatest(1, courts)))) || array[$1]) q order by q) where id = $2', TG_TABLE_SCHEMA)
            using NEW.court, NEW.session_id;
        end if;
        return NEW;
      end $fn$;
    $sql$, esquema);
    execute format('create or replace trigger proteger_quadras before insert or update on %I.sessions for each row execute function %I.proteger_quadras()', esquema, esquema);
    execute format('create or replace trigger garantir_quadra_da_partida before insert or update on %I.matches for each row execute function %I.garantir_quadra_da_partida()', esquema, esquema);
  end loop;
end $migracao$;
notify pgrst, 'reload schema';
commit;
