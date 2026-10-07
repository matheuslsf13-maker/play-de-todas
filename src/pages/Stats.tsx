import { useEffect, useMemo, useState } from 'react'
import GraficoDeForca from '../components/GraficoDeForca'
import { normalizar } from '../lib/roster'
import { NomeClicavel, ProvedorDePerfil } from '../components/NomeClicavel'
import { NomesDaDupla } from '../components/NomeClicavel'
import { Avatar, Empty, Modal, StatBox } from '../components/ui'
import {
  aplicarBye,
  aplicarColocacao,
  aplicarByeNasDuplas,
  avgPoints,
  balance,
  computeStats,
  computeStatsComPontos,
  duoMatches,
  type DuoStat,
  duoStatsComPontos,
  emptyStat,
  opponentStats,
  type PairKeyStat,
  partnerStats,
  playedMatches,
  pontosDeBye,
  winRate,
} from '../lib/stats'
import { colocacaoNoRecorte, colocacaoPorDupla } from '../lib/campeonato'
import {
  JOGOS_PARA_ENTROSAMENTO,
  JOGOS_PARA_FIRMAR,
  NIVEIS_DE_FORCA,
  forcaDeDuplas,
  nivelDeForca,
  rankingDeForca,
  textoDaQueda,
  type ForcaDeDupla,
  type LinhaDeForca,
} from '../lib/forca'
import { matchPoints } from '../lib/scoring'
import { applyBonuses, computeStreaks, STREAK_LADDER, streakLevel } from '../lib/streaks'
import { useStore } from '../lib/store'
import { dateLabel, monthLabel, monthOf, plural } from '../lib/types'

type Modo = 'jogadora' | 'duplas' | 'forca'

export default function Stats({
  abrir,
  onAbriu,
}: { abrir?: Modo | { jogadora: string } | null; onAbriu?: () => void } = {}) {
  const { data, nameOf } = useStore()

  const months = useMemo(() => {
    const set = new Set(data.sessions.map((s) => monthOf(s.date)))
    return [...set].sort().reverse()
  }, [data.sessions])

  const [modo, setModo] = useState<Modo>(typeof abrir === 'string' ? abrir : 'jogadora')
  const [period, setPeriod] = useState<string>('all')
  const [playerId, setPlayerId] = useState<string>(abrir && typeof abrir === 'object' ? abrir.jogadora : '')
  /** As fichas abertas antes desta, para o "voltar". */
  const [anteriores, setAnteriores] = useState<string[]>([])

  // chegou de outra tela pedindo uma aba (a Força) ou a ficha de uma menina (o Ranking)
  useEffect(() => {
    if (!abrir) return
    if (typeof abrir === 'string') setModo(abrir)
    else {
      setModo('jogadora')
      setPlayerId(abrir.jogadora)
      setAnteriores([])
    }
    onAbriu?.()
  }, [abrir, onAbriu])

  const matches = useMemo(
    // o mes acompanha o ranking (so os plays que valem); o historico traz tudo,
    // inclusive os plays avulsos
    () => playedMatches(data, period === 'all' ? {} : { month: period, ranked: true }),
    [data, period],
  )
  const streaks = useMemo(() => computeStreaks(data), [data])
  const stats = useMemo(() => {
    const awards = period === 'all' ? streaks.awards : streaks.awards.filter((a) => a.month === period)
    // partidas, V/D e games de TUDO (quem so jogou a fase de grupos jogou);
    // os pontos so das partidas que pontuam
    const stats = computeStatsComPontos(data.sessions, matches)
    const bye = pontosDeBye(data.sessions, matches).porJogadora
    // no campeonato os pontos saem da colocacao final, nao do placar
    return aplicarColocacao(aplicarBye(applyBonuses(stats, awards), bye), colocacaoNoRecorte(data.sessions, matches))
  }, [data.sessions, matches, streaks, period])

  const comJogo = useMemo(
    () => [...data.players].filter((p) => (stats.get(p.id)?.matches ?? 0) > 0),
    [data.players, stats],
  )
  // sem ninguem escolhida, abre na 1a da forca que nao esta pausada (antes era
  // a primeira em ordem alfabetica, que nao diz nada)
  const topoDaForca = useMemo(
    () => rankingDeForca(data, nameOf).find((l) => !l.pausada && comJogo.some((p) => p.id === l.player_id))?.player_id,
    [data, nameOf, comJogo],
  )
  const selected = playerId || topoDaForca || comJogo[0]?.id || data.players[0]?.id || ''

  if (data.players.length === 0) {
    return (
      <div className="card">
        <Empty icon="📊">Cadastre as jogadoras e registre um play para ver as estatísticas.</Empty>
      </div>
    )
  }

  /** Tocar num nome dentro do Stats abre a ficha dela, guardando a anterior para o "voltar". */
  const abrirJogadora = (id: string) => {
    if (id === selected && modo === 'jogadora') return
    setAnteriores((a) => [...a, selected])
    setPlayerId(id)
    setModo('jogadora')
    window.scrollTo(0, 0)
  }
  const anterior = anteriores[anteriores.length - 1]
  function voltar() {
    setAnteriores((a) => a.slice(0, -1))
    if (anterior) setPlayerId(anterior)
  }

  return (
    <ProvedorDePerfil value={abrirJogadora}>
      <div className="card">
        <div className="segmented">
          <button className={modo === 'jogadora' ? 'on' : ''} onClick={() => setModo('jogadora')}>
            👤 Jogadora
          </button>
          <button className={modo === 'duplas' ? 'on' : ''} onClick={() => setModo('duplas')}>
            🤝 Dupla
          </button>
          <button className={modo === 'forca' ? 'on' : ''} onClick={() => setModo('forca')}>
            💪 Força
          </button>
        </div>
        {modo !== 'forca' && (
        <label className="field" style={{ marginTop: 12 }}>
          <span>Período</span>
          <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="all">🏅 Histórico completo</option>
            {months.map((m, i) => (
              <option key={m} value={m}>
                {i === 0 ? `${monthLabel(m)} (mês atual)` : monthLabel(m)}
              </option>
            ))}
          </select>
          <em className="hint">
            O ranking zera todo mês, mas as partidas ficam guardadas para sempre. Os{' '}
            <strong>plays avulsos</strong> aparecem só no histórico, porque não valem para o
            campeonato. As duplas equilibradas não saem deste total: saem de uma nota
            própria, em que <strong>vencer quem está jogando melhor vale mais</strong>.
          </em>
        </label>
        )}
      </div>

      {modo === 'forca' ? (
        <PainelForca />
      ) : modo === 'jogadora' ? (
        <PainelJogadora
          selected={selected}
          setPlayerId={setPlayerId}
          anterior={anterior}
          onVoltar={voltar}
          matches={matches}
          stats={stats}
          streaks={streaks}
          period={period}
        />
      ) : (
        <PainelDuplas matches={matches} />
      )}
    </ProvedorDePerfil>
  )
}

/* ------------------------------------------------------- por jogadora */

function PainelJogadora({
  selected,
  setPlayerId,
  anterior,
  onVoltar,
  matches,
  stats,
  streaks,
  period,
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
}) {
  const { data, nameOf, playerById } = useStore()

  // a forca e sempre do historico inteiro, mesmo com o periodo filtrado: ela
  // nao e desempenho do mes, e o que o app aprendeu sobre a jogadora ate hoje
  const forcas = useMemo(() => rankingDeForca(data, nameOf), [data, nameOf])
  // a posicao conta so quem esta no ranking; a pausada continua com a ficha
  const noRanking = useMemo(() => forcas.filter((l) => !l.pausada), [forcas])
  const minhaForca = forcas.find((l) => l.player_id === selected) ?? null
  const posicaoNaForca = noRanking.findIndex((l) => l.player_id === selected) + 1
  const totalNaForca = noRanking.length

  const partners = useMemo(() => partnerStats(matches), [matches])
  const opponents = useMemo(() => opponentStats(matches), [matches])

  const [busca, setBusca] = useState('')
  const achadas = useMemo(() => {
    const q = normalizar(busca.trim())
    if (!q) return []
    return data.players
      .filter((p) => normalizar(p.name).includes(q) || normalizar(p.nickname ?? '').includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, 8)
  }, [busca, data.players])
  const s = stats.get(selected) ?? emptyStat(selected)
  const meusPares = sortPairs(partners.get(selected))
  const meusRivais = sortPairs(opponents.get(selected))

  const melhorPar = meusPares.filter((p) => p.wins > 0).sort((a, b) => b.wins - a.wins || b.points - a.points)[0]
  const parDificil = meusPares.filter((p) => p.losses > 0).sort((a, b) => b.losses - a.losses || rate(a) - rate(b))[0]
  const freguesa = meusRivais.filter((p) => p.wins > 0).sort((a, b) => b.wins - a.wins || rate(b) - rate(a))[0]
  const pedra = meusRivais.filter((p) => p.losses > 0).sort((a, b) => b.losses - a.losses || rate(a) - rate(b))[0]

  const seq = streaks.current.get(selected) ?? 0
  const nivel = streakLevel(seq)
  const conquistas = streaks.conquistas.get(selected)
  const maiorNivel = conquistas ? streakLevel(conquistas.melhor) : null
  const dataDaSessao = new Map(data.sessions.map((x) => [x.id, x.date]))
  const noPeriodo = (sid: string) => period === 'all' || monthOf(dataDaSessao.get(sid) ?? '') === period
  const diasVencidos = [...streaks.winnersOf.entries()].filter(([sid, ids]) => ids.includes(selected) && noPeriodo(sid)).length
  const podios = [...streaks.podiumOf.entries()].filter(([sid, ids]) => ids.includes(selected) && noPeriodo(sid)).length
  const statusUsados = streaks.awards.filter((a) => a.player_id === selected && (period === 'all' || a.month === period))

  return (
    <>
      <div className="card">
        {anterior && (
          <button className="btn ghost sm" style={{ marginBottom: 8 }} onClick={onVoltar}>
            ‹ voltar para {nameOf(anterior)}
          </button>
        )}
        {/* BUSCA: com 30+ meninas, rolar a lista no celular cansa. Ignora acento e
            maiuscula e acha pelo nome ou pelo apelido */}
        <label className="field">
          <span>🔎 Buscar menina</span>
          <input
            className="input"
            type="search"
            placeholder="Digite um pedaço do nome"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        {achadas.length > 0 && (
          <div className="row wrap" style={{ gap: 6, margin: '-4px 0 10px' }}>
            {achadas.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`chip ${p.id === selected ? 'on' : 'off'}`}
                style={{ flex: 'none' }}
                onClick={() => {
                  setPlayerId(p.id)
                  setBusca('')
                }}
              >
                {p.nickname?.trim() || p.name}
              </button>
            ))}
          </div>
        )}
        {busca.trim() !== '' && achadas.length === 0 && (
          <p className="tiny muted" style={{ margin: '-4px 0 10px' }}>Nenhuma menina com “{busca}”.</p>
        )}
        <label className="field">
          <span>Jogadora</span>
          <select className="select" value={selected} onChange={(e) => setPlayerId(e.target.value)}>
            {[...data.players]
              .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
              .map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
          </select>
        </label>

        <div className="row" style={{ margin: '14px 0 12px' }}>
          <Avatar player={playerById(selected)} size={62} />
          <div className="grow">
            <div style={{ fontSize: 19, fontWeight: 800 }} className="ellipsis">
              <NomeClicavel id={selected}>{nameOf(selected)}</NomeClicavel>
            </div>
            {(conquistas?.duquesas.length ?? 0) > 0 && (
              <div className="tiny" style={{ color: 'var(--ouro)', fontWeight: 800 }}>
                👑 Duquesa da V3{conquistas!.duquesas.length > 1 && ` ×${conquistas!.duquesas.length}`}
              </div>
            )}
            <div className="small muted">
              {plural(s.days, 'play')} · {avgPoints(s).toFixed(2)} pontos por partida
            </div>
            {nivel && (
              <div className="tiny" style={{ color: 'var(--pink)', fontWeight: 800, marginTop: 2 }}>
                {nivel.emoji} {nivel.title} · {seq} pódios seguidos
              </div>
            )}
          </div>
        </div>

        <Barra titulo="Aproveitamento" pct={winRate(s)} legenda={`${s.wins}V · ${s.losses}D em ${s.matches} partidas`} />

        <div className="grid3" style={{ marginTop: 12 }}>
          <StatBox k="Pontos" v={s.points} />
          <StatBox k="Saldo" v={balance(s) > 0 ? `+${balance(s)}` : balance(s)} />
          <StatBox k="Games" v={`${s.gamesWon}/${s.gamesLost}`} />
        </div>
      </div>

      <div className="card">
        <div className="section-title">💪 Força</div>
        {minhaForca ? (
          <>
            <div className="row" style={{ gap: 10 }}>
              <span style={{ fontSize: 26 }}>{minhaForca.nivel.emoji}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: minhaForca.nivel.cor }}>
                  {minhaForca.nivel.titulo}
                </div>
                <div className="tiny muted">
                  {minhaForca.pausada ? 'fora do ranking da força' : `${posicaoNaForca}ª mais forte de ${totalNaForca}`}
                  {minhaForca.provisoria && ' · nota provisória'}
                  {minhaForca.queda && ` · ${textoDaQueda(minhaForca.queda)}`}
                </div>
              </div>
              <span style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                {minhaForca.nota}
              </span>
            </div>
            <p className="tiny muted" style={{ marginBottom: 0, marginTop: 8 }}>
              Não é o ranking do mês: a força atravessa o ano e mede <strong>de quem</strong>{' '}
              você ganhou. É ela que monta os grupos e escolhe as duplas. 1500 é a média do grupo.
            </p>
            <GraficoDeForca data={data} playerId={selected} />
            <PausaDaJogadora id={selected} pausada={minhaForca.pausada} />
          </>
        ) : (
          <p className="tiny muted" style={{ margin: 0 }}>Ainda sem partidas para medir.</p>
        )}
      </div>

      <div className="card">
        <div className="section-title">🏅 Status e conquistas</div>
        <div className="grid3">
          <StatBox k="Seguidos agora" v={seq} />
          <StatBox k="Pódios" v={podios} />
          <StatBox k="Dias vencidos" v={diasVencidos} />
        </div>
        <div className="conquistas" style={{ marginTop: 10 }}>
          <div className="tiny muted">
            Maior status:{' '}
            <strong style={{ color: 'var(--text)' }}>
              {maiorNivel ? `${maiorNivel.emoji} ${maiorNivel.title}` : 'ainda nenhum'}
            </strong>
          </div>
          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
            {STREAK_LADDER.map((x) => {
              const n = conquistas?.vezes[x.from] ?? 0
              return (
                <span key={x.from} className={`chip ${n > 0 ? 'on' : 'off'}`} style={{ flex: 'none' }} title={x.title}>
                  {x.emoji} {x.title} ×{n}
                </span>
              )
            })}
          </div>
          {(conquistas?.duquesas.length ?? 0) > 0 && (
            <div className="tiny" style={{ marginTop: 8, color: 'var(--ouro)', fontWeight: 700 }}>
              👑 Duquesa em {conquistas!.duquesas.map(dateLabel).join(', ')}
            </div>
          )}
        </div>
        {statusUsados.length > 0 && (
          <div className="stack" style={{ marginTop: 10 }}>
            {statusUsados.map((a) => (
              <div key={a.month} className="tiny" style={{ background: 'var(--yellow-suave)', color: 'var(--yellow)', borderRadius: 10, padding: '8px 10px' }}>
                {a.emoji} usou <strong>{a.title}</strong> no fechamento de {monthLabel(a.month)} — <strong>+{a.bonus} pts</strong> (regra antiga)
              </div>
            ))}
          </div>
        )}
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          O status segue enquanto ela terminar no pódio; no 5º seguido vira 👑 Duquesa e recomeça.
        </p>
      </div>

      <div className="card">
        <div className="section-title">💫 Destaques</div>
        {meusPares.length === 0 && meusRivais.length === 0 ? (
          <Empty icon="🏐">Sem partidas neste período.</Empty>
        ) : (
          <div className="stack">
            <Destaque icone="🤝" rotulo="Melhor parceria" par={melhorPar} tipo="parceira" />
            <Destaque icone="😅" rotulo="Parceria mais difícil" par={parDificil} tipo="parceira" />
            <Destaque icone="🎯" rotulo="Ganha mais de" par={freguesa} tipo="rival" />
            <Destaque icone="🔥" rotulo="Perde mais para" par={pedra} tipo="rival" />
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">🤝 Com quem já jogou</div>
        <TabelaPares linhas={meusPares} primeira="Parceira" />
      </div>

      <div className="card">
        <div className="section-title">⚔️ Contra quem já jogou</div>
        <TabelaPares linhas={meusRivais} primeira="Adversária" />
      </div>
    </>
  )
}

/* ---------------------------------------------------------- por dupla */

type Ordem = 'jogos' | 'aproveitamento' | 'pontos' | 'forca'

function PainelDuplas({ matches }: { matches: ReturnType<typeof playedMatches> }) {
  const { nameOf, playerById } = useStore()
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('jogos')
  const [aberta, setAberta] = useState<DuoStat | null>(null)

  // o mesmo bye conta aqui: a dupla que passou direto tambem nao pode
  // aparecer com menos pontos por causa da partida que nao teve
  const { data: dadosDoBye } = useStore()
  const duplas = useMemo(
    () => [
      ...aplicarByeNasDuplas(
        aplicarByeNasDuplas(
          duoStatsComPontos(dadosDoBye.sessions, matches),
          pontosDeBye(dadosDoBye.sessions, matches).porDupla,
        ),
        // no campeonato a dupla pontua pela colocacao, nao pelas partidas
        colocacaoPorDupla(dadosDoBye.sessions, matches),
      ).values(),
    ],
    [matches, dadosDoBye.sessions],
  )

  // a forca sai do historico INTEIRO da dupla, e nao do periodo filtrado:
  // e o que as duas renderam juntas desde sempre
  const { data } = useStore()
  const forcas = useMemo(() => forcaDeDuplas(data), [data])
  const forcaDe = (d: DuoStat) => forcas.get(d.key)?.nota ?? 1500

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const filtradas = termo
      ? duplas.filter((d) => `${nameOf(d.a)} ${nameOf(d.b)}`.toLowerCase().includes(termo))
      : duplas
    const aprov = (d: DuoStat) => (d.matches === 0 ? 0 : d.wins / d.matches)
    return [...filtradas].sort((a, b) => {
      if (ordem === 'forca') return forcaDe(b) - forcaDe(a) || b.matches - a.matches
      if (ordem === 'pontos') return b.points - a.points || b.matches - a.matches
      if (ordem === 'aproveitamento') return aprov(b) - aprov(a) || b.matches - a.matches
      return b.matches - a.matches || b.wins - a.wins
    })
  }, [duplas, busca, ordem, nameOf])

  if (duplas.length === 0) {
    return (
      <div className="card">
        <Empty icon="🤝">Nenhuma dupla se formou neste período ainda.</Empty>
      </div>
    )
  }

  return (
    <>
      <div className="card">
        <div className="section-title">🤝 Duplas que já jogaram juntas ({duplas.length})</div>
        <input
          className="input"
          placeholder="Buscar por nome…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div className="chips-scroll" style={{ marginTop: 10 }}>
          {([['jogos', 'Mais jogos'], ['aproveitamento', 'Melhor %'], ['pontos', 'Mais pontos'], ['forca', '💪 Mais fortes']] as [Ordem, string][]).map(
            ([id, txt]) => (
              <button
                key={id}
                className={`chip ${ordem === id ? 'on' : 'off'}`}
                style={{ flex: 'none' }}
                onClick={() => setOrdem(id)}
              >
                {txt}
              </button>
            ),
          )}
        </div>
      </div>

      <div className="card">
        {lista.length === 0 ? (
          <Empty icon="🔎">Nenhuma dupla com esse nome.</Empty>
        ) : (
          <div className="stack">
            {lista.slice(0, 40).map((d) => {
              const pct = d.matches === 0 ? 0 : d.wins / d.matches
              return (
                <button key={d.key} className="duo-row" onClick={() => setAberta(d)}>
                  <span className="duo-fotos">
                    <Avatar player={playerById(d.a)} size={30} />
                    <Avatar player={playerById(d.b)} size={30} />
                  </span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="duo-nomes">
                      <NomesDaDupla a={d.a} b={d.b} nomeDe={nameOf} />
                    </span>
                    <span className="mini-barra"><i style={{ width: `${Math.round(pct * 100)}%` }} /></span>
                    <span className="tiny muted">{plural(d.matches, 'jogo')} · {d.wins}V {d.losses}D · {d.points} pts</span>
                    <ForcaDaDupla f={forcas.get(d.key)} />
                  </span>
                  <span className="duo-pct">{Math.round(pct * 100)}%</span>
                </button>
              )
            })}
            {lista.length > 40 && (
              <p className="tiny muted center" style={{ margin: 0 }}>
                mostrando as 40 primeiras de {lista.length} — use a busca para achar uma dupla
              </p>
            )}
          </div>
        )}
      </div>

      {aberta && <DetalheDupla duo={aberta} matches={matches} onClose={() => setAberta(null)} />}
    </>
  )
}

function DetalheDupla({
  duo,
  matches,
  onClose,
}: {
  duo: DuoStat
  matches: ReturnType<typeof playedMatches>
  onClose: () => void
}) {
  const { data, nameOf, playerById } = useStore()
  const forca = useMemo(() => forcaDeDuplas(data).get(duo.key), [data, duo.key])
  const jogos = useMemo(() => duoMatches(matches, duo.a, duo.b), [matches, duo])
  const dataDaSessao = new Map(data.sessions.map((s) => [s.id, s.date]))
  const pct = duo.matches === 0 ? 0 : duo.wins / duo.matches

  // contra quem essa dupla mais jogou
  const rivais = useMemo(() => {
    const m = new Map<string, { key: string; a: string; b: string; v: number; d: number }>()
    for (const j of jogos) {
      const somosA = j.team_a.includes(duo.a) && j.team_a.includes(duo.b)
      const outros = (somosA ? j.team_b : j.team_a) as [string, string]
      const key = [...outros].sort().join('|')
      const e = m.get(key) ?? { key, a: outros[0], b: outros[1], v: 0, d: 0 }
      const venceu = somosA ? (j.score_a as number) > (j.score_b as number) : (j.score_b as number) > (j.score_a as number)
      if (venceu) e.v++
      else e.d++
      m.set(key, e)
    }
    return [...m.values()].sort((x, y) => y.v + y.d - (x.v + x.d))
  }, [jogos, duo])

  return (
    <Modal title={`${nameOf(duo.a)} + ${nameOf(duo.b)}`} onClose={onClose}>
      <div className="row center" style={{ justifyContent: 'center', gap: 10, marginBottom: 12 }}>
        <Avatar player={playerById(duo.a)} size={52} />
        <Avatar player={playerById(duo.b)} size={52} />
      </div>
      <div className="grid3">
        <StatBox k="Jogos" v={duo.matches} />
        <StatBox k="Vitórias" v={duo.wins} />
        <StatBox k="Aproveit." v={`${Math.round(pct * 100)}%`} />
        <StatBox k="Pontos" v={duo.points} />
        <StatBox k="Games" v={`${duo.gamesWon}/${duo.gamesLost}`} />
        <StatBox k="Plays" v={duo.sessions.size} />
      </div>

      {forca && (
        <div className="card" style={{ marginTop: 12, marginBottom: 0 }}>
          <div className="row" style={{ gap: 10 }}>
            <span style={{ fontSize: 24 }}>{nivelDeForca(forca.nota).emoji}</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, color: nivelDeForca(forca.nota).cor }}>
                Força da dupla: {forca.nota}
              </div>
              <div className="tiny muted">
                {forca.entrosamento === 0
                  ? 'exatamente o que a força das duas previa'
                  : forca.entrosamento > 0
                    ? `+${forca.entrosamento} além do que a força das duas previa`
                    : `${forca.entrosamento} abaixo do que a força das duas previa`}
                {forca.provisoria && ' · provisória'}
              </div>
            </div>
          </div>
          <p className="tiny muted" style={{ marginTop: 8, marginBottom: 0 }}>
            A média das duas dá <strong>{forca.base}</strong> — é o que a dupla deveria valer.
            O número acima é o que ela vale <strong>pelo que renderam juntas</strong>: cada partida
            delas move essa nota conforme o resultado e a força de quem estava do outro lado.
            {forca.provisoria &&
              ` Com menos de ${JOGOS_PARA_ENTROSAMENTO} jogos juntas, ainda é cedo para tirar conclusão.`}
          </p>
        </div>
      )}

      <div className="section-title" style={{ marginTop: 16 }}>⚔️ Contra quem jogaram</div>
      <div className="scroll-x">
        <table className="table">
          <thead><tr><th style={{ textAlign: 'left' }}>Dupla adversária</th><th>V</th><th>D</th></tr></thead>
          <tbody>
            {rivais.map((r) => (
              <tr key={r.key}>
                <td className="ellipsis">{nameOf(r.a)} + {nameOf(r.b)}</td>
                <td>{r.v}</td>
                <td>{r.d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title" style={{ marginTop: 16 }}>📅 Partidas</div>
      <div className="stack">
        {jogos.map((j) => {
          const somosA = j.team_a.includes(duo.a) && j.team_a.includes(duo.b)
          const nosso = somosA ? (j.score_a as number) : (j.score_b as number)
          const deles = somosA ? (j.score_b as number) : (j.score_a as number)
          const outros = (somosA ? j.team_b : j.team_a) as [string, string]
          const [pa, pb] = matchPoints(j.score_a as number, j.score_b as number)
          const nossosPts = somosA ? pa : pb
          return (
            <div key={j.id} className="row tiny" style={{ borderBottom: '1px dashed var(--line)', paddingBottom: 6 }}>
              <span className="muted nowrap">{dateLabel(dataDaSessao.get(j.session_id) ?? '')}</span>
              <span className="grow ellipsis">vs {nameOf(outros[0])} + {nameOf(outros[1])}</span>
              <strong style={{ color: nosso > deles ? 'var(--teal)' : 'var(--muted)' }}>{nosso} x {deles}</strong>
              {nossosPts > 0 && <span style={{ color: 'var(--pink)', fontWeight: 800 }}>+{nossosPts}</span>}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------- apoio */

function Barra({ titulo, pct, legenda }: { titulo: string; pct: number; legenda: string }) {
  return (
    <div>
      <div className="row spread tiny muted" style={{ marginBottom: 4 }}>
        <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>{titulo}</span>
        <span style={{ fontWeight: 800, color: 'var(--pink)' }}>{Math.round(pct * 100)}%</span>
      </div>
      <div className="barra"><i style={{ width: `${Math.round(pct * 100)}%` }} /></div>
      <div className="tiny muted" style={{ marginTop: 4 }}>{legenda}</div>
    </div>
  )
}

function rate(p: PairKeyStat): number {
  return p.matches === 0 ? 0 : p.wins / p.matches
}

function sortPairs(m: Map<string, PairKeyStat> | undefined): PairKeyStat[] {
  return m ? [...m.values()].sort((a, b) => b.matches - a.matches || b.wins - a.wins) : []
}

function Destaque({
  icone,
  rotulo,
  par,
  tipo,
}: {
  icone: string
  rotulo: string
  par: PairKeyStat | undefined
  tipo: 'parceira' | 'rival'
}) {
  const { nameOf, playerById } = useStore()
  if (!par) return null
  const detalhe =
    tipo === 'parceira'
      ? `${par.wins}V/${par.losses}D em ${plural(par.matches, 'jogo')} · ${par.points} pts juntas`
      : `${par.wins}V/${par.losses}D em ${par.matches} confronto(s)`
  return (
    <div className="row">
      <span style={{ fontSize: 20 }}>{icone}</span>
      <Avatar player={playerById(par.other_id)} size={34} />
      <div className="grow">
        <div className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>{rotulo}</div>
        <NomeClicavel id={par.other_id} className="ellipsis"><strong>{nameOf(par.other_id)}</strong></NomeClicavel>
        <div className="tiny muted">{detalhe}</div>
      </div>
    </div>
  )
}

function TabelaPares({ linhas, primeira }: { linhas: PairKeyStat[]; primeira: string }) {
  const { nameOf, playerById } = useStore()
  if (linhas.length === 0) return <Empty icon="🏐">Nada por aqui ainda.</Empty>
  return (
    <div className="scroll-x">
      <table className="table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>{primeira}</th>
            <th>J</th><th>V</th><th>D</th><th>%</th><th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((p) => (
            <tr key={p.other_id}>
              <td>
                <div className="row" style={{ gap: 8 }}>
                  <Avatar player={playerById(p.other_id)} size={26} />
                  <NomeClicavel id={p.other_id} className="ellipsis">{nameOf(p.other_id)}</NomeClicavel>
                </div>
              </td>
              <td>{p.matches}</td>
              <td>{p.wins}</td>
              <td>{p.losses}</td>
              <td>{Math.round(rate(p) * 100)}%</td>
              <td style={{ fontWeight: 700 }}>{p.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}


/** A forca da dupla na linha da lista: nivel, nota e o entrosamento. */
function ForcaDaDupla({ f }: { f?: ForcaDeDupla }) {
  if (!f) return null
  const n = nivelDeForca(f.nota)
  return (
    <span className="tiny nowrap" style={{ display: 'block', marginTop: 2 }}>
      <span style={{ color: n.cor, fontWeight: 800 }}>{n.emoji} força {f.nota}</span>
      {f.entrosamento !== 0 && (
        <span className="muted">
          {' '}
          ({f.entrosamento > 0 ? '+' : ''}
          {f.entrosamento} juntas{f.provisoria ? '?' : ''})
        </span>
      )}
    </span>
  )
}

/**
 * O ranking de forca do grupo.
 *
 * De proposito sem seletor de periodo: forca nao e desempenho do mes, e o que
 * o app aprendeu sobre a jogadora desde sempre. Filtrar por mes daria um
 * numero que nao e usado para nada -- o equilibrio das duplas le o total.
 */
function PainelForca() {
  const { data, nameOf, playerById } = useStore()
  // quem esta pausada (na mao ou por faltas) fica fora do ranking da forca
  const todasAsLinhas = useMemo(() => rankingDeForca(data, nameOf), [data, nameOf])
  const linhas = useMemo(() => todasAsLinhas.filter((l) => !l.pausada), [todasAsLinhas])
  const foraDoRanking = useMemo(() => todasAsLinhas.filter((l) => l.pausada), [todasAsLinhas])

  if (linhas.length === 0) {
    return (
      <div className="card">
        <Empty icon="💪">Registre um play para o app começar a medir a força de cada uma.</Empty>
      </div>
    )
  }

  const maior = Math.max(...linhas.map((l) => Math.abs(l.nota - 1500)), 60)

  return (
    <>
      <div className="card">
        <div className="section-title">💪 Força de cada jogadora</div>
        <p className="tiny muted" style={{ marginTop: 0 }}>
          Esta é a nota que o app já usava por baixo do pano para montar os grupos e escolher as
          duplas — agora à vista. <strong>Não é o ranking do mês.</strong> O ranking soma pontos e
          zera todo mês; a força atravessa o ano e mede <strong>de quem</strong> você ganhou:
          vencer quem está melhor rende muito mais, e vencer apertado rende pouco. 1500 é a média
          do grupo, e ela não se move — o que uma ganha, a outra perde.
        </p>

        <div className="stack" style={{ gap: 10 }}>
          {linhas.map((l, i) => (
            <LinhaDaForca key={l.player_id} linha={l} pos={i + 1} maior={maior} nome={nameOf(l.player_id)} foto={playerById(l.player_id)} />
          ))}
        </div>
        {foraDoRanking.length > 0 && (
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            ⏸️ <strong>Fora do ranking agora:</strong>{' '}
            {foraDoRanking.map((l, i) => (
              <span key={l.player_id}>
                {i > 0 && ', '}
                <NomeClicavel id={l.player_id}>{nameOf(l.player_id)}</NomeClicavel>
                {l.pausada === 'manual' ? ' (pausada)' : ' (2+ faltas seguidas)'}
              </span>
            ))}
            . O perfil continua aberto; volta quando jogar de novo ou ao despausar.
          </p>
        )}
      </div>

      <div className="card">
        <div className="section-title">📏 O que cada nível quer dizer</div>
        <div className="stack" style={{ gap: 6 }}>
          {NIVEIS_DE_FORCA.map((n) => (
            <div key={n.titulo} className="row" style={{ gap: 8 }}>
              <span style={{ width: 28, textAlign: 'center' }}>{n.emoji}</span>
              <strong style={{ color: n.cor, minWidth: 130 }}>{n.titulo}</strong>
              <span className="tiny muted">
                {n.de === -Infinity
                  ? 'abaixo de 1425'
                  : n.de >= 0
                    ? `de ${1500 + n.de} para cima`
                    : `a partir de ${1500 + n.de}`}
              </span>
            </div>
          ))}
        </div>
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          Com menos de {JOGOS_PARA_FIRMAR} partidas a nota aparece como <em>provisória</em>: uma
          sexta ruim ainda mexe demais nela. Quem nunca jogou não entra na lista — a nota dela seria
          exatamente a média, mas por falta de informação, não por equilíbrio.
        </p>
      </div>
    </>
  )
}

function LinhaDaForca({
  linha,
  pos,
  maior,
  nome,
  foto,
}: {
  linha: LinhaDeForca
  pos: number
  maior: number
  nome: string
  foto: ReturnType<ReturnType<typeof useStore>['playerById']>
}) {
  const dif = linha.nota - 1500
  // a barra sai do meio para os dois lados: forca e distancia da media, com sinal
  const largura = (Math.abs(dif) / maior) * 50
  return (
    <div>
      <div className="row" style={{ gap: 8 }}>
        <span className={`rank-pos top${pos}`} style={{ fontWeight: 800, minWidth: 22 }}>{pos}</span>
        <Avatar player={foto} size={28} />
        <NomeClicavel id={linha.player_id} className="grow ellipsis">{nome}</NomeClicavel>
        <span className="nowrap tiny" style={{ color: linha.nivel.cor, fontWeight: 800 }}>
          {linha.nivel.emoji} {linha.nivel.titulo}
        </span>
        <span className="nowrap" style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          {linha.nota}
        </span>
      </div>
      <div className="forca-trilho">
        <div className="forca-meio" />
        <div
          className="forca-barra"
          style={{
            background: linha.nivel.cor,
            left: dif >= 0 ? '50%' : `${50 - largura}%`,
            width: `${Math.max(largura, 1)}%`,
          }}
        />
      </div>
      <div className="tiny muted">
        {linha.jogos} {linha.jogos === 1 ? 'partida' : 'partidas'}
        {linha.provisoria && ' · nota provisória'}
        {linha.queda && ` · ${textoDaQueda(linha.queda)}`}
        {' · '}
        {dif === 0 ? 'exatamente na média' : dif > 0 ? `+${dif} sobre a média` : `${dif} da média`}
      </div>
    </div>
  )
}

/**
 * A PAUSA, so para acompanhar: o Stats mostra, quem pausa e despausa e a aba
 * Meninas (la e onde o perfil se edita). Pausada na mao ou por 2 faltas
 * seguidas: fora do ranking da forca, e as faltas continuam baixando a nota.
 */
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
        ? `${aberta ? ` desde ${dateLabel(aberta.de)}` : ''} — fora do ranking da força. As faltas continuam baixando a força, como as de todo mundo.`
        : ' por 2 ou mais faltas seguidas — fora do ranking da força. Volta sozinha quando jogar de novo.'}
    </div>
  )
}
