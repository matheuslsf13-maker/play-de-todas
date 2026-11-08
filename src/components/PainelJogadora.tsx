import { useMemo, useState, type ReactNode } from 'react'
import CampoDeBusca from './CampoDeBusca'
import { ComparadorDeAtletas } from './Comparador'
import GraficoDeForca from './GraficoDeForca'
import HistoricoDePartidas from './HistoricoDePartidas'
import { NomeClicavel } from './NomeClicavel'
import { ListaExpansivel } from './StatsPecas'
import { Avatar, Empty } from './ui'
import {
  PLAYS_EM_AVALIACAO,
  rankingDeForca,
  textoDaAvaliacao,
  textoDaQueda,
} from '../lib/forca'
import { movimentoDaForca } from '../lib/movimentoDoStats'
import { normalizar } from '../lib/roster'
import {
  balance,
  emptyStat,
  historicoDeForca,
  mediaDaForca,
  opponentStats,
  partnerStats,
  winRate,
  type computeStats,
  type PairKeyStat,
  type playedMatches,
} from '../lib/stats'
import { STREAK_LADDER, streakLevel, type computeStreaks } from '../lib/streaks'
import { useStore } from '../lib/store'
import { dateLabel, monthOf, plural } from '../lib/types'

type Aba = 'resumo' | 'partidas' | 'parcerias' | 'comparar'
type Lado = 'com' | 'contra'
type OrdemDeParceria = 'jogos' | 'melhor'

const LINHAS_DE_CARA = 5
const rate = (p: PairKeyStat) => (p.matches === 0 ? 0 : p.wins / p.matches)

/**
 * O Stats › Jogadora novo (08/11/2026): trilha de fotos para trocar de atleta, cartao com a forca, tres numeros e
 * abas internas (Resumo, Partidas, Parcerias). A forca segue sendo sempre a do historico inteiro, mesmo com o periodo
 * filtrado: nao e desempenho do mes, e o que o app aprendeu sobre a jogadora ate hoje.
 */
export default function PainelJogadora({
  selected,
  setPlayerId,
  anterior,
  onVoltar,
  matches,
  stats,
  streaks,
  period,
  comJogo,
}: {
  selected: string
  setPlayerId: (id: string) => void
  /** A ficha aberta antes desta (tocando num nome), para voltar. */
  anterior?: string
  onVoltar?: () => void
  matches: ReturnType<typeof playedMatches>
  stats: ReturnType<typeof computeStats>
  streaks: ReturnType<typeof computeStreaks>
  period: string
  /** Quem ja jogou: a trilha de fotos. */
  comJogo: string[]
}) {
  const { data, nameOf, playerById, canEdit } = useStore()
  const [aba, setAba] = useState<Aba>('resumo')
  const [buscando, setBuscando] = useState(false)
  const [busca, setBusca] = useState('')

  const forcas = useMemo(() => rankingDeForca(data, nameOf), [data, nameOf])
  // a posicao conta so quem esta no ranking; a pausada continua com a ficha. Para quem nao e admin, quem esta em
  // avaliacao tambem nao conta (a nota e oculta)
  const noRanking = useMemo(() => forcas.filter((l) => !l.pausada && (canEdit || l.emAvaliacao === undefined)), [forcas, canEdit])
  const mov = useMemo(() => movimentoDaForca(data, nameOf, canEdit), [data, nameOf, canEdit])
  const media = mediaDaForca(data)
  const minhaForca = forcas.find((l) => l.player_id === selected) ?? null
  const forcaOculta = !canEdit && minhaForca?.emAvaliacao !== undefined
  const posicaoNaForca = noRanking.findIndex((l) => l.player_id === selected) + 1
  const setaDela = mov.porId.get(selected)

  const partners = useMemo(() => partnerStats(matches), [matches])
  const opponents = useMemo(() => opponentStats(matches), [matches])
  const s = stats.get(selected) ?? emptyStat(selected)
  const meusPares = sortPairs(partners.get(selected))
  const meusRivais = sortPairs(opponents.get(selected))
  const melhorPar = meusPares.filter((p) => p.wins > 0).sort((a, b) => b.wins - a.wins || b.points - a.points)[0]
  const parDificil = meusPares.filter((p) => p.losses > 0).sort((a, b) => b.losses - a.losses || rate(a) - rate(b))[0]
  const freguesa = meusRivais.filter((p) => p.wins > 0).sort((a, b) => b.wins - a.wins || rate(b) - rate(a))[0]
  const pedra = meusRivais.filter((p) => p.losses > 0).sort((a, b) => b.losses - a.losses || rate(a) - rate(b))[0]

  const seq = streaks.current.get(selected) ?? 0
  const statusAtual = streakLevel(seq)
  const conquistas = streaks.conquistas.get(selected)
  const maiorNivel = conquistas ? streakLevel(conquistas.melhor) : null
  const dataDaSessao = new Map(data.sessions.map((x) => [x.id, x.date]))
  const noPeriodo = (sid: string) => period === 'all' || monthOf(dataDaSessao.get(sid) ?? '') === period
  const diasVencidos = [...streaks.winnersOf.entries()].filter(([sid, ids]) => ids.includes(selected) && noPeriodo(sid)).length
  const podios = [...streaks.podiumOf.entries()].filter(([sid, ids]) => ids.includes(selected) && noPeriodo(sid)).length

  // a trilha: quem esta aberta primeiro, depois as outras pela ordem da forca
  const trilha = useMemo(() => {
    const ordem = forcas.map((l) => l.player_id).filter((id) => comJogo.includes(id))
    const resto = comJogo.filter((id) => !ordem.includes(id))
    return [selected, ...[...ordem, ...resto].filter((id) => id !== selected)].slice(0, 16)
  }, [forcas, comJogo, selected])

  const termo = normalizar(busca.trim())
  const achadas = termo
    ? data.players
        .filter((p) => normalizar(p.name).includes(termo) || normalizar(p.nickname ?? '').includes(termo))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .slice(0, 8)
    : []

  const jogadora = playerById(selected)
  const nomeCompleto = jogadora && jogadora.name !== nameOf(selected) ? jogadora.name : ''
  const pct = Math.round(winRate(s) * 100)
  const saldo = balance(s)
  const cor = minhaForca && !forcaOculta ? minhaForca.nivel.cor : 'var(--pink)'

  return (
    <>
      {anterior && (
        <button className="btn ghost sm" style={{ marginBottom: 8 }} onClick={onVoltar}>
          ‹ voltar para {nameOf(anterior)}
        </button>
      )}

      <div className="st-trilha" role="listbox" aria-label="Trocar de jogadora">
        <button type="button" aria-label="Buscar jogadora" aria-pressed={buscando} onClick={() => setBuscando(!buscando)}>
          <span className="st-lupa-foto" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="M15.5 15.5 21 21" />
            </svg>
          </span>
          <span>Buscar</span>
        </button>
        {trilha.map((id) => (
          <button key={id} type="button" role="option" aria-selected={id === selected} className={id === selected ? 'on' : ''} onClick={() => setPlayerId(id)}>
            <Avatar player={playerById(id)} size={46} />
            <span>{nameOf(id)}</span>
          </button>
        ))}
      </div>
      {buscando && (
        <div className="st-busca-linha">
          <CampoDeBusca valor={busca} onMudar={setBusca} placeholder="Digite um pedaço do nome" rotulo="Buscar menina" />
          {achadas.length > 0 && (
            <div className="busca-lista" style={{ marginTop: 8 }}>
              {achadas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`busca-item${p.id === selected ? ' on' : ''}`}
                  onClick={() => {
                    setPlayerId(p.id)
                    setBusca('')
                    setBuscando(false)
                  }}
                >
                  <Avatar player={p} size={28} />
                  <span className="grow ellipsis" style={{ fontWeight: 700 }}>{p.nickname?.trim() || p.name}</span>
                  {p.nickname?.trim() && p.nickname.trim() !== p.name && <span className="tiny muted ellipsis">{p.name}</span>}
                </button>
              ))}
            </div>
          )}
          {termo !== '' && achadas.length === 0 && <p className="tiny muted" style={{ margin: '8px 0 0' }}>Nenhuma menina com “{busca}”.</p>}
        </div>
      )}

      <div className="st-card st-heroi" style={{ ['--cor-nivel' as string]: cor }}>
        <div className="st-heroi-topo">
          <Avatar player={jogadora} size={68} />
          <div style={{ minWidth: 0 }}>
            <h3>
              <NomeClicavel id={selected}>{nameOf(selected)}</NomeClicavel>
            </h3>
            <div className="st-sub">
              {nomeCompleto && `${nomeCompleto} · `}
              {plural(s.days, 'play')} · {plural(s.matches, 'partida')}
            </div>
            <div className="st-pilulas">
              {minhaForca && !forcaOculta && (
                <span className="st-pilula" style={{ color: minhaForca.nivel.cor }}>
                  {minhaForca.nivel.emoji} {minhaForca.nivel.titulo}
                </span>
              )}
              {statusAtual && <span className="st-pilula fogo">{statusAtual.emoji} {statusAtual.title}</span>}
              {(conquistas?.duquesas.length ?? 0) > 0 && (
                <span className="st-pilula fogo" style={{ color: 'var(--ouro)' }}>
                  👑 Duquesa da V3{conquistas!.duquesas.length > 1 && ` ×${conquistas!.duquesas.length}`}
                </span>
              )}
            </div>
          </div>
        </div>
        {minhaForca && forcaOculta && (
          <div className="st-forca-heroi">
            <div>
              <small>Força</small>
              <b style={{ fontSize: 22 }}>🔍 em avaliação</b>
              <div className="tiny muted" style={{ marginTop: 4 }}>{minhaForca.emAvaliacao} de {PLAYS_EM_AVALIACAO} plays</div>
            </div>
          </div>
        )}
        {minhaForca && !forcaOculta && (
          <div className="st-forca-heroi">
            <div style={{ minWidth: 0 }}>
              <small>
                Força · {minhaForca.pausada ? 'fora do ranking' : `${posicaoNaForca}ª do grupo`}
                {mov.temAnterior && !minhaForca.pausada && setaDela ? (
                  <span className={setaDela > 0 ? 'st-sobe' : 'st-desce'} style={{ marginLeft: 6 }}>{setaDela > 0 ? '▲' : '▼'}{Math.abs(setaDela)}</span>
                ) : null}
              </small>
              <b>{minhaForca.nota}</b>
              <span className={`st-delta ${minhaForca.nota > media ? 'pos' : minhaForca.nota < media ? 'neg' : 'zero'}`}>
                {minhaForca.nota === media ? 'na média' : `${minhaForca.nota > media ? '+' : '−'}${Math.abs(minhaForca.nota - media)} ${minhaForca.nota > media ? 'sobre' : 'sob'} a média`}
              </span>
              {(minhaForca.provisoria || minhaForca.queda) && (
                <div className="tiny muted" style={{ marginTop: 4 }}>
                  {minhaForca.provisoria && 'nota provisória'}
                  {minhaForca.provisoria && minhaForca.queda && ' · '}
                  {minhaForca.queda && textoDaQueda(minhaForca.queda)}
                </div>
              )}
            </div>
            <MiniGrafico id={selected} />
          </div>
        )}
        {!minhaForca && <p className="tiny muted" style={{ margin: '10px 0 0' }}>Ainda sem partidas para medir.</p>}
      </div>

      <div className="st-kpis">
        <div className="st-kpi">
          <Anel pct={pct} />
          <small>{s.wins}V · {s.losses}D</small>
        </div>
        <div className="st-kpi">
          <b>{s.points}</b>
          <small>Pontos</small>
        </div>
        <div className="st-kpi">
          <b style={{ color: saldo > 0 ? 'var(--teal)' : saldo < 0 ? 'var(--pink)' : undefined }}>{saldo > 0 ? `+${saldo}` : saldo}</b>
          <small>Saldo</small>
        </div>
      </div>

      <div className="st-seg interno" role="tablist">
        {(['resumo', 'partidas', 'parcerias', 'comparar'] as Aba[]).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} className={aba === id ? 'on' : ''} onClick={() => setAba(id)}>
            {id === 'resumo' ? 'Resumo' : id === 'partidas' ? 'Partidas' : id === 'parcerias' ? 'Parcerias' : 'Comparar'}
          </button>
        ))}
      </div>

      {aba === 'resumo' && (
        <>
          {minhaForca && forcaOculta && <EmAvaliacao plays={minhaForca.emAvaliacao as number} />}
          {minhaForca && !forcaOculta && (
            <div className="st-card">
              {minhaForca.emAvaliacao !== undefined && (
                <div className="tiny" style={{ fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
                  {textoDaAvaliacao(minhaForca.emAvaliacao)} — só você (admin) vê o número
                </div>
              )}
              <GraficoDeForca data={data} playerId={selected} />
              <PausaDaJogadora id={selected} pausada={minhaForca.pausada} />
            </div>
          )}

          {meusPares.length === 0 && meusRivais.length === 0 ? (
            <div className="st-card"><Empty icon="🏐">Sem partidas neste período.</Empty></div>
          ) : (
            <>
              <div className="st-rotulo">Destaques</div>
              <div className="st-destaques">
                <Destaque rotulo="💛 Melhor parceria" par={melhorPar} />
                <Destaque rotulo="😅 Parceria difícil" par={parDificil} />
                <Destaque rotulo="🎯 Ganha mais de" par={freguesa} />
                <Destaque rotulo="🔥 Perde mais para" par={pedra} />
              </div>
            </>
          )}

          <Escada
            seq={seq}
            vezes={(from) => conquistas?.vezes[from] ?? 0}
            maior={maiorNivel ? `${maiorNivel.emoji} ${maiorNivel.title}` : 'ainda nenhum'}
            podios={podios}
            diasVencidos={diasVencidos}
            duquesas={conquistas?.duquesas.map(dateLabel).join(', ')}
          />
        </>
      )}

      {aba === 'partidas' && (
        <div className="st-card">
          <HistoricoDePartidas partidas={matches} jogadora={selected} semForca={forcaOculta} />
        </div>
      )}

      {aba === 'parcerias' && <Parcerias pares={meusPares} rivais={meusRivais} />}

      {aba === 'comparar' && <ComparadorDeAtletas key={selected} inicial={selected} matches={matches} stats={stats} streaks={streaks} period={period} comJogo={comJogo} />}
    </>
  )
}

function sortPairs(m: Map<string, PairKeyStat> | undefined): PairKeyStat[] {
  return m ? [...m.values()].sort((a, b) => b.matches - a.matches || b.wins - a.wins) : []
}

/** O aproveitamento num anel: a porcentagem no meio. */
function Anel({ pct }: { pct: number }) {
  const r = 18
  const c = 2 * Math.PI * r
  return (
    <svg className="st-anel" viewBox="0 0 46 46" role="img" aria-label={`${pct}% de aproveitamento`}>
      <circle cx="23" cy="23" r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
      <circle
        cx="23"
        cy="23"
        r={r}
        fill="none"
        stroke="var(--teal)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 23 23)"
      />
      <text x="23" y="26.5" textAnchor="middle" fontSize="11" fontWeight={800} fill="var(--text)">{pct}%</text>
    </svg>
  )
}

/** A forca dos ultimos plays, so o tracado (a ficha completa fica no Resumo). */
function MiniGrafico({ id }: { id: string }) {
  const { data } = useStore()
  const pontos = useMemo(() => historicoDeForca(data, id, true).slice(-10), [data, id])
  if (pontos.length < 2) return null
  const notas = pontos.map((p) => p.nota)
  const min = Math.min(...notas)
  const max = Math.max(...notas)
  const W = 110
  const H = 34
  const x = (i: number) => 3 + (i * (W - 8)) / (pontos.length - 1)
  const y = (v: number) => 4 + ((max - v) * (H - 10)) / Math.max(1, max - min)
  const d = pontos.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.nota)}`).join(' ')
  return (
    <svg className="st-mini-grafico" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--marca)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(pontos.length - 1)} cy={y(notas[notas.length - 1])} r="3.4" fill="var(--marca)" />
    </svg>
  )
}

function Destaque({ rotulo, par }: { rotulo: string; par: PairKeyStat | undefined }) {
  const { nameOf, playerById } = useStore()
  if (!par) return <div className="st-dest" style={{ opacity: 0.6 }}><small>{rotulo}</small><em>ainda não tem</em></div>
  return (
    <div className="st-dest">
      <small>{rotulo}</small>
      <span className="linha">
        <Avatar player={playerById(par.other_id)} size={32} />
        <span style={{ minWidth: 0 }}>
          <strong><NomeClicavel id={par.other_id}>{nameOf(par.other_id)}</NomeClicavel></strong>
          <em>{par.wins}V · {par.losses}D</em>
        </span>
      </span>
    </div>
  )
}

/** O status como escada: 1º pódio, 🔥, ⚡, 💎, 👑. */
function Escada({
  seq,
  vezes,
  maior,
  podios,
  diasVencidos,
  duquesas,
}: {
  seq: number
  vezes: (from: number) => number
  maior: string
  podios: number
  diasVencidos: number
  duquesas?: string
}) {
  const degraus: { emoji: string; titulo: string; from: number }[] = [
    { emoji: '🏅', titulo: '1º pódio', from: 1 },
    ...STREAK_LADDER.map((x) => ({ emoji: x.emoji, titulo: x.title, from: x.from })),
  ]
  // o degrau de agora: o mais alto que a sequencia alcanca (0 = nenhum)
  const agora = degraus.reduce((m, d, i) => (seq >= d.from ? i : m), -1)
  return (
    <div className="st-card">
      <div className="st-rotulo">
        Status · {seq === 0 ? 'sem sequência' : `${seq} ${seq === 1 ? 'pódio seguido' : 'pódios seguidos'}`}
      </div>
      <div className="st-escada">
        {degraus.map((d, i) => {
          const n = d.from > 1 ? vezes(d.from) : 0
          return (
            <div key={d.from} className={`st-degrau${i < agora ? ' feito' : i === agora ? ' agora' : ''}`}>
              <div className="st-bola" aria-hidden="true">{d.emoji}</div>
              {d.titulo.replace(' da V3', '').replace(' do Play', '')}
              {n > 0 && <small>×{n}</small>}
            </div>
          )
        })}
      </div>
      <div className="tiny muted" style={{ marginTop: 10 }}>
        Maior status: <strong style={{ color: 'var(--text)' }}>{maior}</strong> · {plural(podios, 'pódio')} · {plural(diasVencidos, 'dia vencido')}
      </div>
      {duquesas && (
        <div className="tiny" style={{ marginTop: 6, color: 'var(--ouro)', fontWeight: 700 }}>👑 Duquesa em {duquesas}</div>
      )}
    </div>
  )
}

/** Parcerias: com quem e contra quem jogou, por jogos ou por aproveitamento. */
function Parcerias({ pares, rivais }: { pares: PairKeyStat[]; rivais: PairKeyStat[] }) {
  const { nameOf, playerById } = useStore()
  const [lado, setLado] = useState<Lado>('com')
  const [ordem, setOrdem] = useState<OrdemDeParceria>('jogos')
  const base = lado === 'com' ? pares : rivais
  const lista = [...base].sort((a, b) =>
    ordem === 'melhor' ? rate(b) - rate(a) || b.matches - a.matches : b.matches - a.matches || b.wins - a.wins,
  )
  const itens: ReactNode[] = lista.map((p) => {
    const pct = Math.round(rate(p) * 100)
    return (
      <div key={p.other_id} className="st-linha">
        <Avatar player={playerById(p.other_id)} size={40} />
        <span className="st-nome">
          <b><NomeClicavel id={p.other_id}>{nameOf(p.other_id)}</NomeClicavel></b>
          <span>{plural(p.matches, 'jogo')}{lado === 'com' && ` · ${p.points} pts juntas`}</span>
          <span className="st-barrinha" style={{ display: 'block' }}><i style={{ width: `${pct}%` }} /></span>
        </span>
        <span className="st-valor">
          <b>{p.wins}-{p.losses}</b>
          <span className="tiny muted">{pct}%</span>
        </span>
      </div>
    )
  })
  return (
    <>
      <div className="chips-scroll" style={{ marginBottom: 12 }}>
        {([['com', '🤝 Com quem'], ['contra', '⚔️ Contra quem']] as [Lado, string][]).map(([id, txt]) => (
          <button key={id} type="button" className={`chip ${lado === id ? 'on' : 'off'}`} style={{ flex: 'none' }} onClick={() => setLado(id)}>
            {txt}
          </button>
        ))}
        {([['jogos', 'Mais jogos'], ['melhor', 'Melhor %']] as [OrdemDeParceria, string][]).map(([id, txt]) => (
          <button key={id} type="button" className={`chip ${ordem === id ? 'on' : 'off'}`} style={{ flex: 'none' }} onClick={() => setOrdem(id)}>
            {txt}
          </button>
        ))}
      </div>
      <div className="st-card">
        {itens.length === 0 ? <Empty icon="🏐">Nada por aqui ainda.</Empty> : <ListaExpansivel itens={itens} visiveis={LINHAS_DE_CARA} rotulo={lado === 'com' ? 'as parcerias' : 'as adversárias'} />}
      </div>
    </>
  )
}

/** A pausa, so para acompanhar: quem pausa e despausa e a aba Meninas. */
function PausaDaJogadora({ id, pausada }: { id: string; pausada?: 'manual' | 'faltas' }) {
  const { data } = useStore()
  const p = data.players.find((x) => x.id === id)
  if (!p || !pausada) return null
  const sessoes = new Set(data.sessions.map((s) => s.id))
  const aberta = (p.pausas ?? []).find((x) => !x.ate || (x.play && !sessoes.has(x.play)))
  return (
    <div className="banner warn" style={{ marginTop: 10, marginBottom: 0 }}>
      ⏸️ <strong>Pausada</strong>
      {pausada === 'manual'
        ? `${aberta ? ` desde ${dateLabel(aberta.de)}` : ''} — fora do ranking da força. As faltas continuam baixando a força, como as de todo mundo. Volta sozinha quando jogar de novo.`
        : ' por 2 ou mais faltas seguidas — fora do ranking da força. Volta sozinha quando jogar de novo.'}
    </div>
  )
}

/** A ficha de quem esta em avaliacao, para quem nao e admin: sem numero, sem nivel, sem grafico. */
function EmAvaliacao({ plays }: { plays: number }) {
  return (
    <div className="st-card">
      <div className="row" style={{ gap: 10 }}>
        <span style={{ fontSize: 26 }}>🔍</span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800 }}>Em avaliação</div>
          <div className="tiny muted">
            {plays} de {PLAYS_EM_AVALIACAO} plays. Nos primeiros plays a força ainda muda muito; ela aparece depois do {PLAYS_EM_AVALIACAO}º. Até lá o app já
            usa para montar grupos e duplas.
          </div>
        </div>
      </div>
    </div>
  )
}
