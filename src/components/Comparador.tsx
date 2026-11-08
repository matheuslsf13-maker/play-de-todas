import { useMemo, useState, type ReactNode } from 'react'
import CampoDeBusca from './CampoDeBusca'
import {
  BarrasDeComparacao,
  Cartao,
  ChanceEmQuadra,
  FormaRecente,
  GraficoComparado,
  ListaDeConfrontos,
  PlacarGrande,
  legendaDoConfronto,
  type LinhaDeBarra,
} from './ComparadorPecas'
import { Avatar, Modal } from './ui'
import {
  confrontosDeAtletas,
  confrontosDeDuplas,
  juntarSeries,
  ladoDaAtleta,
  ladoDaDupla,
  placarDosConfrontos,
  ultimosResultados,
  type Time,
} from '../lib/comparar'
import { duplasDoRecorte } from '../lib/duplasDoRecorte'
import { emAvaliacao, forcaDeDuplas, historicoDaDupla, rankingDeForca } from '../lib/forca'
import { emptyStat, historicoDeForca, mediaDaForca, opponentStats, partnerStats, winRate, type computeStats, type playedMatches } from '../lib/stats'
import type { computeStreaks } from '../lib/streaks'
import { normalizar } from '../lib/roster'
import { useStore } from '../lib/store'
import { monthOf, plural, type AppData } from '../lib/types'

const sinal = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')
const chaveDaDupla = (t: Time) => [...t].sort().join('|')

/** Cabecalho do comparador: os dois lados com o botao de trocar. */
function Lados({ esquerda, direita }: { esquerda: ReactNode; direita: ReactNode }) {
  return (
    <div className="cp-cartao">
      <div className="cp-vs">
        {esquerda}
        <span className="cp-x">VS</span>
        {direita}
      </div>
    </div>
  )
}

function Lado({ fotos, nome, sub, botao, onBotao }: { fotos: ReactNode; nome: string; sub?: string; botao: string; onBotao: () => void }) {
  return (
    <div className="cp-lado">
      <span className="cp-fotos">{fotos}</span>
      <b>{nome}</b>
      {sub && <small>{sub}</small>}
      <button type="button" className="cp-botao-pilula" onClick={onBotao}>{botao}</button>
    </div>
  )
}

/** A folha de escolher uma atleta (busca + lista), no estilo das folhas do app. */
function EscolherAtleta({
  titulo,
  candidatos,
  detalhe,
  onEscolher,
  onFechar,
}: {
  titulo: string
  candidatos: string[]
  detalhe: (id: string) => string
  onEscolher: (id: string) => void
  onFechar: () => void
}) {
  const { nameOf, playerById } = useStore()
  const [busca, setBusca] = useState('')
  const termo = normalizar(busca.trim())
  const lista = candidatos.filter((id) => !termo || normalizar(nameOf(id)).includes(termo))
  return (
    <Modal title={titulo} onClose={onFechar}>
      <CampoDeBusca valor={busca} onMudar={setBusca} placeholder="Buscar atleta" />
      <div className="folha-acoes" style={{ marginTop: 10 }}>
        {lista.length === 0 && <p className="tiny muted" style={{ margin: 12 }}>Nenhuma atleta com esse nome.</p>}
        {lista.map((id) => (
          <button key={id} type="button" className="cp-escolha" onClick={() => onEscolher(id)}>
            <Avatar player={playerById(id)} size={34} />
            <span className="grow">
              <b>{nameOf(id)}</b>
              <small>{detalhe(id)}</small>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

/** Dados que os dois comparadores usam. */
function useBasesDaForca() {
  const { data, nameOf, canEdit } = useStore()
  const linhas = useMemo(() => rankingDeForca(data, nameOf), [data, nameOf])
  const avaliacao = useMemo(() => emAvaliacao(data), [data])
  const media = mediaDaForca(data)
  const notaDe = (id: string) => linhas.find((l) => l.player_id === id)?.nota ?? media
  const emAvaliar = (ids: string[]) => !canEdit && ids.some((id) => avaliacao.has(id))
  return { notaDe, emAvaliar, media }
}

/* =============================================================== atleta × atleta */

/**
 * A aba Comparar do perfil da atleta: ela ja vem como lado A e voce escolhe a outra (ou troca qualquer lado). O
 * periodo do Desempenho vale para os numeros e confrontos; a forca e sempre do historico inteiro.
 */
export function ComparadorDeAtletas({
  inicial,
  matches,
  stats,
  streaks,
  period,
  comJogo,
}: {
  inicial: string
  matches: ReturnType<typeof playedMatches>
  stats: ReturnType<typeof computeStats>
  streaks: ReturnType<typeof computeStreaks>
  period: string
  comJogo: string[]
}) {
  const { data, nameOf, playerById } = useStore()
  const { notaDe, emAvaliar } = useBasesDaForca()
  const [ida, setIda] = useState(inicial)
  const [idb, setIdb] = useState<string | null>(null)
  const [escolhendo, setEscolhendo] = useState<'a' | 'b' | null>(null)

  const recorte = useMemo<AppData>(() => ({ ...data, matches }), [data, matches])
  const parceiras = useMemo(() => partnerStats(matches), [matches])
  const adversarias = useMemo(() => opponentStats(matches), [matches])

  const escolher = (
    <>
      {escolhendo && (
        <EscolherAtleta
          titulo={escolhendo === 'a' ? 'Trocar o lado A' : 'Escolher a outra atleta'}
          candidatos={comJogo
            .filter((id) => id !== (escolhendo === 'a' ? idb : ida) && id !== (escolhendo === 'a' ? ida : idb))
            .sort((x, y) => {
              const base = escolhendo === 'a' ? idb : ida
              const n = (id: string) => (base ? adversarias.get(base)?.get(id)?.matches ?? 0 : 0)
              return n(y) - n(x) || nameOf(x).localeCompare(nameOf(y), 'pt-BR')
            })}
          detalhe={(id) => {
            const base = escolhendo === 'a' ? idb : ida
            const contra = base ? adversarias.get(base)?.get(id)?.matches ?? 0 : 0
            const juntas = base ? parceiras.get(base)?.get(id)?.matches ?? 0 : 0
            return base ? `${plural(contra, 'partida')} contra · ${juntas} juntas` : `${plural(stats.get(id)?.matches ?? 0, 'partida')}`
          }}
          onEscolher={(id) => {
            if (escolhendo === 'a') setIda(id)
            else setIdb(id)
            setEscolhendo(null)
          }}
          onFechar={() => setEscolhendo(null)}
        />
      )}
    </>
  )

  const fotoDe = (id: string) => <Avatar player={playerById(id)} size={54} />

  // ainda sem a outra atleta: so o convite e as sugestoes (quem mais enfrentou)
  if (!idb) {
    const sugestoes = [...(adversarias.get(ida)?.values() ?? [])].sort((x, y) => y.matches - x.matches).slice(0, 4)
    return (
      <>
        <Cartao titulo={`Comparar ${nameOf(ida)} com`} explicacao="Escolha a outra atleta, ou troque quem está do lado A.">
          <div className="cp-vs">
            <Lado fotos={fotoDe(ida)} nome={nameOf(ida)} botao="Trocar" onBotao={() => setEscolhendo('a')} />
            <span className="cp-x">VS</span>
            <Lado fotos={<span className="cp-vazio">+</span>} nome="Escolher" botao="Escolher" onBotao={() => setEscolhendo('b')} />
          </div>
        </Cartao>
        {sugestoes.length > 0 && (
          <Cartao titulo="Quem mais enfrentou">
            {sugestoes.map((s) => (
              <button key={s.other_id} type="button" className="cp-escolha cheia" onClick={() => setIdb(s.other_id)}>
                <Avatar player={playerById(s.other_id)} size={34} />
                <span className="grow">
                  <b>{nameOf(s.other_id)}</b>
                  <small>{plural(s.matches, 'partida')} contra · {parceiras.get(ida)?.get(s.other_id)?.matches ?? 0} juntas</small>
                </span>
                <span aria-hidden="true" className="muted">›</span>
              </button>
            ))}
          </Cartao>
        )}
        {escolher}
      </>
    )
  }

  const nomeA = nameOf(ida)
  const nomeB = nameOf(idb)
  const oculta = emAvaliar([ida, idb])
  const confrontos = confrontosDeAtletas(recorte, ida, idb)
  const placar = placarDosConfrontos(confrontos)
  const juntas = parceiras.get(ida)?.get(idb)
  const forcaJuntas = forcaDeDuplas(data).get(chaveDaDupla([ida, idb]))
  const sa = stats.get(ida) ?? emptyStat(ida)
  const sb = stats.get(idb) ?? emptyStat(idb)
  const dataDaSessao = new Map(data.sessions.map((x) => [x.id, x.date]))
  const podios = (id: string) =>
    [...streaks.podiumOf.entries()].filter(([sid, ids]) => ids.includes(id) && (period === 'all' || monthOf(dataDaSessao.get(sid) ?? '') === period)).length
  const serie = (id: string) => historicoDeForca(data, id, true).map((p) => ({ date: p.date, nota: p.nota }))
  const pico = (id: string) => Math.max(...historicoDeForca(data, id).map((p) => p.nota), notaDe(id))
  const pct = (s: typeof sa) => Math.round(winRate(s) * 100)

  const linhas: LinhaDeBarra[] = [
    ...(oculta ? [] : [{ nome: 'Força', a: notaDe(ida), b: notaDe(idb) }]),
    { nome: 'Aproveitamento', a: pct(sa), b: pct(sb), textoA: `${pct(sa)}%`, textoB: `${pct(sb)}%` },
    { nome: 'Pontos', a: sa.points, b: sb.points },
    { nome: 'Pódios', a: podios(ida), b: podios(idb) },
    ...(oculta ? [] : [{ nome: 'Pico da força', a: pico(ida), b: pico(idb) }]),
  ]

  const melhorParceira = (id: string) =>
    [...(parceiras.get(id)?.values() ?? [])].filter((p) => p.wins > 0).sort((x, y) => y.wins - x.wins || y.points - x.points)[0]
  const destaque = (id: string) => {
    const p = melhorParceira(id)
    return (
      <div className="cp-destaque">
        <small>Melhor parceira da {nameOf(id)}</small>
        {p ? (
          <div className="linha">
            <Avatar player={playerById(p.other_id)} size={32} />
            <span><b>{nameOf(p.other_id)}</b><em>{p.wins}–{p.losses} juntas</em></span>
          </div>
        ) : (
          <em>ainda sem vitória em dupla</em>
        )}
      </div>
    )
  }

  // a atleta comparada vem primeiro no nome do time: "Carol + Julia", nao "Julia + Carol"
  const nomeDoTime = (t: [string, string]) => {
    const [x, y] = t[1] === ida || t[1] === idb ? [t[1], t[0]] : t
    return `${nameOf(x)} + ${nameOf(y)}`
  }

  return (
    <>
      <Lados
        esquerda={<Lado fotos={fotoDe(ida)} nome={nomeA} botao="Trocar" onBotao={() => setEscolhendo('a')} />}
        direita={<Lado fotos={fotoDe(idb)} nome={nomeB} botao="Trocar" onBotao={() => setEscolhendo('b')} />}
      />

      <Cartao titulo="Quando se enfrentaram" explicacao="Partidas em que uma jogou contra a outra, cada uma numa dupla.">
        <PlacarGrande a={placar.vitoriasA} b={placar.vitoriasB} legenda={legendaDoConfronto(placar, nomeA, nomeB, confrontos.length)} />
        <ListaDeConfrontos lista={confrontos} nomeDe={nomeDoTime} />
      </Cartao>

      <Cartao titulo="Quando jogaram juntas" explicacao="Partidas em que foram parceiras, na mesma dupla.">
        {juntas && juntas.matches > 0 ? (
          <>
            <PlacarGrande a={juntas.wins} b={juntas.losses} legenda={`vitórias × derrotas como dupla${forcaJuntas && !oculta ? ` · força ${forcaJuntas.nota} · entrosamento ${sinal(forcaJuntas.entrosamento)}` : ''}`} />
          </>
        ) : (
          <p className="cp-legenda">Nunca jogaram juntas.</p>
        )}
      </Cartao>

      <Cartao titulo="Frente a frente">
        <BarrasDeComparacao linhas={linhas} />
        {oculta && <p className="cp-nota">🔍 A força de quem está em avaliação não aparece aqui.</p>}
      </Cartao>

      <Cartao titulo="Forma recente" explicacao="Últimas 5 partidas de cada uma, da mais antiga para a mais recente. O anel marca a última.">
        <FormaRecente nomeA={nomeA} ra={ultimosResultados(recorte, ladoDaAtleta(ida), 5)} nomeB={nomeB} rb={ultimosResultados(recorte, ladoDaAtleta(idb), 5)} />
      </Cartao>

      <Cartao titulo="Com quem cada uma joga melhor">
        <div className="cp-destaques">
          {destaque(ida)}
          {destaque(idb)}
        </div>
      </Cartao>

      {!oculta && (
        <Cartao titulo="Força ao longo dos plays" explicacao="Cada linha é a força de uma atleta depois de cada play. Toque num play para ver as duas notas.">
          <GraficoComparado pontos={juntarSeries(serie(ida), serie(idb))} nomeA={nomeA} nomeB={nomeB} curtoA={nomeA} curtoB={nomeB} comFaixa />
        </Cartao>
      )}

      {!oculta && (
        <Cartao titulo="Chance estimada em quadra">
          <ChanceEmQuadra notaA={notaDe(ida)} notaB={notaDe(idb)} nomeA={nomeA} nomeB={nomeB} aviso="Pela força de hoje, numa partida de duplas equilibradas. É estimativa, não promessa." />
        </Cartao>
      )}
      {escolher}
    </>
  )
}

/* ================================================================ dupla × dupla */

/** A folha "Montar dupla": uma que ja jogou junta, ou duas atletas escolhidas do zero. */
function MontarDupla({
  titulo,
  excluir,
  comJogo,
  onEscolher,
  onFechar,
}: {
  titulo: string
  excluir: Time
  comJogo: string[]
  onEscolher: (t: Time) => void
  onFechar: () => void
}) {
  const { data, nameOf, playerById } = useStore()
  const { emAvaliar } = useBasesDaForca()
  const [modo, setModo] = useState<'juntas' | 'zero'>('juntas')
  const [busca, setBusca] = useState('')
  const [x1, setX1] = useState<string | null>(null)
  const [x2, setX2] = useState<string | null>(null)
  const forcas = useMemo(() => [...forcaDeDuplas(data).values()], [data])
  const termo = normalizar(busca.trim())
  const jaJogaram = forcas
    .filter((f) => f.key !== chaveDaDupla(excluir))
    .filter((f) => !termo || normalizar(`${nameOf(f.a)} ${nameOf(f.b)}`).includes(termo))
    .sort((p, q) => q.jogos - p.jogos)
  const existe = (a: string, b: string) => forcas.some((f) => f.key === chaveDaDupla([a, b]))
  const atletas = comJogo.filter((id) => id !== x1 && id !== x2 && (!termo || normalizar(nameOf(id)).includes(termo)))
  const tocar = (id: string) => {
    if (!x1) setX1(id)
    else setX2(id)
    setBusca('')
  }
  const pronto = x1 && x2

  return (
    <Modal title={titulo} onClose={onFechar}>
      <div className="cp-abas-folha" role="tablist">
        <button type="button" role="tab" aria-selected={modo === 'juntas'} className={modo === 'juntas' ? 'on' : ''} onClick={() => setModo('juntas')}>Já jogaram juntas</button>
        <button type="button" role="tab" aria-selected={modo === 'zero'} className={modo === 'zero' ? 'on' : ''} onClick={() => setModo('zero')}>Montar do zero</button>
      </div>
      <CampoDeBusca valor={busca} onMudar={setBusca} placeholder={modo === 'juntas' ? 'Buscar dupla' : 'Buscar atleta'} />

      {modo === 'juntas' ? (
        <div className="folha-acoes" style={{ marginTop: 10 }}>
          {jaJogaram.length === 0 && <p className="tiny muted" style={{ margin: 12 }}>Nenhuma dupla com esse nome.</p>}
          {jaJogaram.map((f) => (
            <button key={f.key} type="button" className="cp-escolha" onClick={() => onEscolher([f.a, f.b])}>
              <span className="st-par">
                <Avatar player={playerById(f.a)} size={34} />
                <Avatar player={playerById(f.b)} size={34} />
              </span>
              <span className="grow">
                <b>{nameOf(f.a)} + {nameOf(f.b)}</b>
                <small>{plural(f.jogos, 'jogo')} juntas{emAvaliar([f.a, f.b]) ? ' · 🔍 força em avaliação' : ` · força ${f.nota}`}</small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="cp-slots">
            {[x1, x2].map((id, i) => (
              <button key={i} type="button" className={`cp-slot${id ? ' cheio' : ''}`} onClick={() => (i === 0 ? setX1(null) : setX2(null))} aria-label={id ? `Tirar ${nameOf(id)}` : `Atleta ${i + 1}`}>
                {id ? <Avatar player={playerById(id)} size={40} /> : <span className="cp-vazio pequeno">+</span>}
                <b>{id ? nameOf(id) : `Atleta ${i + 1}`}</b>
              </button>
            ))}
          </div>
          <div className="folha-acoes">
            {atletas.map((id) => (
              <button key={id} type="button" className="cp-escolha" onClick={() => tocar(id)}>
                <Avatar player={playerById(id)} size={34} />
                <span className="grow">
                  <b>{nameOf(id)}</b>
                  <small>{x1 ? (existe(x1, id) ? 'já jogaram juntas' : 'nunca jogaram juntas · força estimada') : 'toque para escolher'}</small>
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn pink block"
            style={{ marginTop: 12 }}
            disabled={!pronto}
            onClick={() => pronto && onEscolher([x1 as string, x2 as string])}
          >
            Usar esta dupla
          </button>
        </>
      )}
    </Modal>
  )
}

/**
 * A aba Comparar do perfil da dupla: ela vem como dupla A; a B se escolhe entre as que ja jogaram juntas ou se monta
 * do zero. Dupla que nunca jogou junta entra com a forca estimada (a media das duas) e o aviso aparece na tela.
 */
export function ComparadorDeDuplas({
  inicial,
  matches,
  comJogo,
}: {
  inicial: Time
  matches: ReturnType<typeof playedMatches>
  comJogo: string[]
}) {
  const { data, nameOf, playerById } = useStore()
  const { notaDe, emAvaliar } = useBasesDaForca()
  const [pa, setPa] = useState<Time>(inicial)
  const [pb, setPb] = useState<Time | null>(null)
  const [escolhendo, setEscolhendo] = useState<'a' | 'b' | null>(null)
  const recorte = useMemo<AppData>(() => ({ ...data, matches }), [data, matches])
  const forcas = useMemo(() => forcaDeDuplas(data), [data])
  const duplas = useMemo(() => duplasDoRecorte(data.sessions, matches), [data.sessions, matches])

  const folha = escolhendo && (
    <MontarDupla
      titulo={escolhendo === 'a' ? 'Trocar a dupla A' : 'Dupla B'}
      excluir={escolhendo === 'a' ? (pb ?? ['', '']) : pa}
      comJogo={comJogo}
      onEscolher={(t) => {
        if (escolhendo === 'a') setPa(t)
        else setPb(t)
        setEscolhendo(null)
      }}
      onFechar={() => setEscolhendo(null)}
    />
  )
  const nomeDupla = (t: Time) => `${nameOf(t[0])} + ${nameOf(t[1])}`
  const fotos = (t: Time) => (
    <span className="st-par">
      <Avatar player={playerById(t[0])} size={46} />
      <Avatar player={playerById(t[1])} size={46} />
    </span>
  )
  const info = (t: Time) => {
    const f = forcas.get(chaveDaDupla(t))
    return f ? `${plural(f.jogos, 'jogo')} juntas${emAvaliar(t) ? '' : ` · força ${f.nota}`}` : 'nunca jogaram juntas'
  }

  if (!pb) {
    return (
      <>
        <Cartao titulo="Comparar com outra dupla" explicacao="Escolha uma dupla que já jogou, ou monte uma com duas atletas.">
          <div className="cp-vs">
            <Lado fotos={fotos(pa)} nome={nomeDupla(pa)} sub={info(pa)} botao="Trocar" onBotao={() => setEscolhendo('a')} />
            <span className="cp-x">VS</span>
            <Lado fotos={<span className="cp-vazio">+</span>} nome="Nenhuma dupla" botao="Montar dupla" onBotao={() => setEscolhendo('b')} />
          </div>
        </Cartao>
        {folha}
      </>
    )
  }

  const chaveA = chaveDaDupla(pa)
  const chaveB = chaveDaDupla(pb)
  const oculta = emAvaliar([...pa, ...pb])
  const confrontos = confrontosDeDuplas(recorte, pa, pb)
  const placar = placarDosConfrontos(confrontos)
  const nomeA = nomeDupla(pa)
  const nomeB = nomeDupla(pb)
  const fA = forcas.get(chaveA)
  const fB = forcas.get(chaveB)
  const estimada = (t: Time) => Math.round((notaDe(t[0]) + notaDe(t[1])) / 2)
  const notaA = fA?.nota ?? estimada(pa)
  const notaB = fB?.nota ?? estimada(pb)
  const sdA = duplas.find((d) => d.key === chaveA)
  const sdB = duplas.find((d) => d.key === chaveB)
  const pctDe = (d: typeof sdA) => (d && d.matches > 0 ? Math.round((d.wins / d.matches) * 100) : null)
  const serie = (t: Time) => historicoDaDupla(data, t[0], t[1]).pontos.map((p) => ({ date: p.date, nota: p.nota }))

  const linhas: LinhaDeBarra[] = [
    ...(oculta ? [] : [{ nome: 'Força da dupla', a: notaA, b: notaB }]),
    ...(oculta || !fA || !fB ? [] : [{ nome: 'Entrosamento', a: fA.entrosamento, b: fB.entrosamento, textoA: sinal(fA.entrosamento), textoB: sinal(fB.entrosamento) }]),
    { nome: 'Aproveitamento', a: pctDe(sdA), b: pctDe(sdB), textoA: pctDe(sdA) === null ? '—' : `${pctDe(sdA)}%`, textoB: pctDe(sdB) === null ? '—' : `${pctDe(sdB)}%` },
    { nome: 'Jogos juntas', a: fA?.jogos ?? 0, b: fB?.jogos ?? 0 },
  ]
  const nuncaJogou = [!fA && 'A', !fB && 'B'].filter(Boolean)

  return (
    <>
      <Lados
        esquerda={<Lado fotos={fotos(pa)} nome={nomeA} botao="Trocar" onBotao={() => setEscolhendo('a')} />}
        direita={<Lado fotos={fotos(pb)} nome={nomeB} botao="Trocar" onBotao={() => setEscolhendo('b')} />}
      />
      {nuncaJogou.length > 0 && (
        <div className="cp-aviso">
          {nuncaJogou.length === 2 ? 'As duas duplas nunca jogaram juntas' : `A dupla ${nuncaJogou[0]} nunca jogou junta`}: a força entra estimada (a média das duas atletas).
        </div>
      )}

      <Cartao titulo="Quando se enfrentaram" explicacao="Partidas entre as duas duplas.">
        <PlacarGrande a={placar.vitoriasA} b={placar.vitoriasB} legenda={legendaDoConfronto(placar, nomeA, nomeB, confrontos.length)} />
        <ListaDeConfrontos lista={confrontos} nomeDe={nomeDupla} />
      </Cartao>

      <Cartao titulo="Frente a frente">
        <BarrasDeComparacao linhas={linhas} />
        {oculta && <p className="cp-nota">🔍 A força de quem está em avaliação não aparece aqui.</p>}
      </Cartao>

      <Cartao titulo="Forma recente" explicacao="Últimas 5 partidas de cada dupla, da mais antiga para a mais recente. O anel marca a última.">
        <FormaRecente nomeA={nomeA} ra={ultimosResultados(recorte, ladoDaDupla(pa), 5)} nomeB={nomeB} rb={ultimosResultados(recorte, ladoDaDupla(pb), 5)} />
      </Cartao>

      {!oculta && (
        <Cartao titulo="Força ao longo dos plays" explicacao="Cada linha é a força de uma dupla depois de cada play que ela jogou. Toque num play para ver as duas notas.">
          <GraficoComparado pontos={juntarSeries(serie(pa), serie(pb))} nomeA={nomeA} nomeB={nomeB} curtoA={nameOf(pa[0])} curtoB={nameOf(pb[0])} />
        </Cartao>
      )}

      {!oculta && (
        <Cartao titulo="Chance estimada em quadra">
          <ChanceEmQuadra notaA={notaA} notaB={notaB} nomeA={nomeA} nomeB={nomeB} aviso="Pela força das duas duplas, com o entrosamento de cada uma. É estimativa, não promessa." />
        </Cartao>
      )}
      {folha}
    </>
  )
}
