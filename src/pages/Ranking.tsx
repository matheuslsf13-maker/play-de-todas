import { useMemo, useState } from 'react'
import { Avatar, Empty, Logo, Modal, StatBox, shareOrCopy } from '../components/ui'
import { buildMonthPoster } from '../lib/poster'
import { monthRankingText } from '../lib/share'
import { POINTS_TABLE } from '../lib/scoring'
import {
  balance,
  aplicarBye,
  computeStatsComPontos,
  playedMatches,
  pontosDeBye,
  rankPlayers,
  winRate,
  type PlayerStat,
} from '../lib/stats'

/** Empate de verdade (mesmos pontos, saldo e vitorias) fica na mesma posicao. */
function positionsOf(rows: PlayerStat[]): number[] {
  const pos: number[] = []
  rows.forEach((s, i) => {
    const ant = rows[i - 1]
    const igual = ant && ant.points === s.points && balance(ant) === balance(s) && ant.wins === s.wins
    pos.push(igual ? pos[i - 1] : i + 1)
  })
  return pos
}
import {
  applyBonuses,
  computeStreaks,
  isMaxLevel,
  mesFechado,
  newChoice,
  onFire,
  PODIO,
  STREAK_LADDER,
  streakLevel,
} from '../lib/streaks'
import { forcaDeDuplas, rankingDeForca } from '../lib/forca'
import { useStore } from '../lib/store'
import { dateLabel, monthLabel, monthOf, todayISO, type MonthClosure } from '../lib/types'

/** Opcao do seletor que mostra tudo o que ja foi jogado, sem cortar por mes. */
const HISTORICO = 'all'

export default function Ranking({
  onToast,
  onAbrirPlay,
  onVerForca,
}: {
  onToast: (m: string) => void
  onAbrirPlay?: (sessionId: string) => void
  /** Leva para a aba Stats ja na Força. */
  onVerForca?: () => void
}) {
  const { data, nameOf, playerById, canEdit, saveChoice, saveClosure, deleteClosure } = useStore()

  const months = useMemo(() => {
    const set = new Set(data.sessions.map((s) => monthOf(s.date)))
    set.add(monthOf(todayISO()))
    return [...set].sort().reverse()
  }, [data.sessions])

  const [month, setMonth] = useState(months[0])
  const [verTodas, setVerTodas] = useState(false)
  const [poster, setPoster] = useState<{ url: string; blob: Blob } | null>(null)
  const [gerando, setGerando] = useState(false)
  const [fechando, setFechando] = useState(false)
  const periodo = month === HISTORICO || months.includes(month) ? month : months[0]
  const historico = periodo === HISTORICO
  // no historico nao existe "mes ativo"; as partes que so fazem sentido por mes
  // usam o mes corrente e ficam escondidas
  const activeMonth = historico ? months[0] : periodo
  const rotuloPeriodo = historico ? 'Histórico completo' : monthLabel(activeMonth)

  const streaks = useMemo(() => computeStreaks(data), [data])
  const fechado = useMemo(() => mesFechado(data, activeMonth), [data, activeMonth])
  const naMao = useMemo(
    () => data.closures.some((c) => c.month === activeMonth),
    [data.closures, activeMonth],
  )
  /** Quem fecharia o mes com status em jogo, se ele fosse fechado agora. */
  const comStatus = useMemo(() => onFire(streaks), [streaks])

  // play ja montado e ainda nao finalizado: as leitoras podem ver as chaves
  const emAndamento = useMemo(
    () =>
      [...data.sessions]
        .filter((s) => s.status === 'open')
        .sort((a, b) => b.date.localeCompare(a.date))[0],
    [data.sessions],
  )

  const rows = useMemo(() => {
    // no mes entram so os plays do campeonato; no historico entra tudo
    const ms = playedMatches(data, historico ? {} : { month: activeMonth, ranked: true })
    const awards = historico ? streaks.awards : streaks.awards.filter((a) => a.month === activeMonth)
    // partidas, V/D e saldo contam tudo; os PONTOS so das partidas que
    // pontuam (a fase de grupos do grupos+duplas nao pontua -- sem isto o
    // total do mes nao batia com a soma dos dias)
    const stats = computeStatsComPontos(data.sessions, ms)
    // o bye do mata-mata paga pontos: quem passa direto joga uma partida a
    // menos e nao pode terminar o mes atras de quem precisou jogar
    const bye = pontosDeBye(data.sessions, ms).porJogadora
    return rankPlayers(aplicarBye(applyBonuses(stats, awards), bye), nameOf)
  }, [data, activeMonth, historico, nameOf, streaks])

  const fire = comStatus
  const decisoes = useMemo(
    () => (historico ? [] : streaks.decisions.filter((d) => d.month === activeMonth)),
    [streaks, activeMonth, historico],
  )

  const totals = useMemo(() => {
    const ms = playedMatches(data, historico ? {} : { month: activeMonth, ranked: true })
    const days = new Set(ms.map((m) => m.session_id)).size
    return { games: ms.length, days, players: rows.length }
  }, [data, activeMonth, historico, rows.length])

  const posicoes = useMemo(() => positionsOf(rows), [rows])
  // cinco basta para saber quem esta na briga; a lista inteira fica a um toque
  const TOPO = 5
  const visiveis = verTodas ? rows : rows.slice(0, TOPO)

  async function gerarImagem() {
    setGerando(true)
    try {
      const usoDoMes = new Map(
        streaks.awards
          .filter((a) => historico || a.month === activeMonth)
          .map((a) => [a.player_id, a]),
      )
      const linhas = rows.slice(0, 8).map((s, i) => {
        // o fogo e o titulo so aparecem para a campea do mes que usou o status
        const usou = i === 0 ? usoDoMes.get(s.player_id) : undefined
        const lvl = usou ? streakLevel(usou.streak) : null
        return {
          name: nameOf(s.player_id),
          points: s.points,
          wins: s.wins,
          losses: s.losses,
          photo: playerById(s.player_id)?.photo_url ?? null,
          streak: streaks.current.get(s.player_id) ?? 0,
          statusTitle: lvl?.title,
          statusEmoji: lvl?.emoji,
          statusPoints: usou?.bonus,
        }
      })
      const blob = await buildMonthPoster(rotuloPeriodo, linhas, `${import.meta.env.BASE_URL}logo.png`)
      setPoster({ url: URL.createObjectURL(blob), blob })
    } catch (e) {
      onToast('Não consegui gerar a imagem')
      console.error(e)
    } finally {
      setGerando(false)
    }
  }

  function fecharPoster() {
    if (poster) URL.revokeObjectURL(poster.url)
    setPoster(null)
  }

  async function salvarImagem() {
    if (!poster) return
    const arquivo = new File([poster.blob], `ranking-${historico ? 'historico' : activeMonth}.png`, { type: 'image/png' })
    const nav = navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean
      share?: (d: { files: File[]; text?: string }) => Promise<void>
    }
    if (nav.canShare?.({ files: [arquivo] }) && nav.share) {
      try {
        await nav.share({ files: [arquivo], text: `Ranking — ${rotuloPeriodo} 🏆` })
        return
      } catch {
        /* cancelou: cai para o download */
      }
    }
    const a = document.createElement('a')
    a.href = poster.url
    a.download = arquivo.name
    a.click()
    onToast('Imagem salva 📸')
  }
  const podium = rows.slice(0, 3)
  const order = [1, 0, 2] // 2º, 1º, 3º na tela

  return (
    <>
      <div className="card hero">
        <Logo size={92} />
        <div className="hero-txt">
          <div className="hero-nome">Play de Todas</div>
          <div className="tiny muted">Beach Tennis · V3 Arena · <em>mais que um play, uma experiência!</em></div>
        </div>
      </div>

      <a
        className="card apresentacao"
        href={`${import.meta.env.BASE_URL}apresentacao/`}
        target="_blank"
        rel="noopener"
      >
        <span className="prox-selo">📖</span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="prox-titulo">Primeira vez aqui?</span>
          <span className="prox-info">Como funciona o Play de Todas</span>
          <span className="prox-acao">
            participação, instalação, formatos e o mini-game dos status
          </span>
        </span>
        {/* sem isto o card parece so um aviso: nada dizia que da para tocar */}
        <span className="prox-abrir">Abrir ↗</span>
      </a>

      {emAndamento && (
        <button className="card proximo" onClick={() => onAbrirPlay?.(emAndamento.id)}>
          <span className="prox-selo">🏐</span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="prox-titulo">
              {emAndamento.date >= todayISO() ? 'Próximo play' : 'Play em andamento'}
            </span>
            <span className="prox-info">
              {dateLabel(emAndamento.date)} · {emAndamento.player_ids.length} jogadoras ·{' '}
              {emAndamento.courts} quadras · {emAndamento.rounds} partidas
            </span>
            <span className="prox-acao">ver a fila de partidas →</span>
          </span>
        </button>
      )}

      <div className="card">
        <div className="row spread">
          <div className="section-title" style={{ margin: 0 }}>
            {historico ? '🏆 Ranking geral' : '🏆 Ranking do mês'}
          </div>
          <select className="select" style={{ width: 'auto' }} value={periodo} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
            <option value={HISTORICO}>🏅 Histórico completo</option>
          </select>
        </div>

        {historico && (
          <p className="tiny muted" style={{ marginTop: 8, marginBottom: 0 }}>
            Soma de <strong>todos os plays já registrados</strong>, incluindo os avulsos. O
            ranking do mês zera a cada virada, mas nada é apagado. Para equilibrar as duplas o
            app não usa este total nem o mês: usa uma nota própria, em que{' '}
            <strong>vencer quem está jogando melhor vale mais</strong>, e que se atualiza a
            cada partida.
          </p>
        )}

        {rows.length === 0 ? (
          <Empty>Nenhuma partida registrada {historico ? 'ainda' : 'neste mês ainda'}.<br />Vá em <strong>Play</strong> e crie o play do dia.</Empty>
        ) : (
          <>
            <div className="podium">
              {order.map((idx) => {
                const s = podium[idx]
                if (!s) return <div key={idx} />
                const pos = posicoes[idx] ?? idx + 1
                return (
                  <div className={`slot p${pos}`} key={s.player_id}>
                    <Avatar player={playerById(s.player_id)} size={pos === 1 ? 66 : 52} />
                    <div className="nm ellipsis">{nameOf(s.player_id)}</div>
                    <div className="base">
                      <div className="pos">{pos}º</div>
                      <div className="pts">{s.points} pts</div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="grid3" style={{ marginTop: 14 }}>
              <StatBox k="Plays" v={totals.days} />
              <StatBox k="Partidas" v={totals.games} />
              <StatBox k="Jogadoras" v={totals.players} />
            </div>
          </>
        )}

        {!historico && canEdit && (
          <div className="fechamento">
            {fechado ? (
              <div className="row spread" style={{ gap: 10 }}>
                <span className="tiny grow">
                  🏁 <strong>{monthLabel(activeMonth)} está fechado.</strong>{' '}
                  {naMao
                    ? 'As escolhas de status aparecem logo abaixo.'
                    : 'Fechou sozinho porque o calendário já passou do mês.'}
                </span>
                {naMao && (
                  <button
                    className="btn ghost sm nowrap"
                    onClick={() => {
                      if (!confirm(`Reabrir ${monthLabel(activeMonth)}?\n\nAs sequências voltam a correr como se o mês não tivesse fechado. Serve para desfazer um fechamento feito por engano ou para teste.`)) return
                      deleteClosure(activeMonth)
                      onToast('Mês reaberto')
                    }}
                  >↩️ Reabrir</button>
                )}
              </div>
            ) : (
              <button className="btn teal block sm" onClick={() => setFechando(true)}>
                🏁 Finalizar {monthLabel(activeMonth)}
              </button>
            )}
          </div>
        )}
      </div>

      {fechando && (
        <ConfirmarFechamento
          mes={activeMonth}
          emChamas={comStatus}
          onClose={() => setFechando(false)}
          onConfirmar={() => {
            const closure: MonthClosure = {
              id: activeMonth,
              month: activeMonth,
              closed_at: new Date().toISOString(),
            }
            saveClosure(closure)
            setFechando(false)
            onToast('Mês finalizado! Agora é só perguntar quem usa o status 🏁')
          }}
        />
      )}

      {fire.length > 0 && (
        <div className="card">
          <div className="section-title">🔥 Em chamas</div>
          <div className="stack">
            {fire.map((f) => {
              const lvl = streakLevel(f.streak)
              const max = isMaxLevel(f.streak)
              return (
                <div className={`row${max ? ' queen' : ''}`} key={f.player_id}>
                  <Avatar player={playerById(f.player_id)} size={max ? 46 : 38} />
                  <div className="grow">
                    <div style={{ fontWeight: 800 }} className="ellipsis">
                      {nameOf(f.player_id)} {lvl?.emoji}
                    </div>
                    <div className="tiny muted">
                      {lvl?.title} · {f.streak} semanas seguidas no pódio
                      {f.life > 0 && ' · 💚 tem 1 vida'}
                    </div>
                  </div>
                  <span className="badge open nowrap" title="quanto vale o status se ela usar no fechamento">
                    {f.value} pts
                  </span>
                </div>
              )
            })}
          </div>
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            O status se mantém enquanto ela terminar o play no <strong>pódio do dia</strong> (top {PODIO} —
            e, quando o play é em grupos, o top {PODIO} <strong>do grupo dela</strong>).
            Ele só vira pontos no fechamento do mês, se ela escolher usar.
          </p>
        </div>
      )}

      {decisoes.length > 0 && (
        <div className="card">
          <div className="section-title">🏁 Fechamento de {monthLabel(activeMonth)}</div>
          <p className="tiny muted" style={{ marginTop: 0 }}>
            Estas jogadoras fecharam o mês com status. Pergunte a cada uma: <strong>usar</strong> o
            status agora (os pontos entram neste mês e a sequência zera) ou <strong>preservar</strong>
            {' '}(não pontua, o status continua crescendo no mês que vem e ela ganha <strong>1 vida</strong>)?
            Sem resposta, o status fica preservado.
          </p>
          <div className="stack">
            {decisoes.map((d) => {
              const lvl = streakLevel(d.streak)
              const usou = d.action === 'usar'
              return (
                <div key={d.player_id} className="row bet-row">
                  <Avatar player={playerById(d.player_id)} size={40} />
                  <div className="grow">
                    <div style={{ fontWeight: 800 }} className="ellipsis">
                      {nameOf(d.player_id)} {lvl?.emoji}
                    </div>
                    <div className="tiny muted">
                      {lvl?.title} · {d.streak} semanas · vale <strong>{d.value} pts</strong>
                      {!d.respondido && ' · ainda não respondeu'}
                    </div>
                    {canEdit && (
                      <div className="row" style={{ gap: 6, marginTop: 6 }}>
                        <button
                          className={`btn sm ${usou ? 'teal' : 'ghost'}`}
                          onClick={() => {
                            const lbl = lvl?.title ?? 'status'
                            if (usou) return
                            if (
                              !confirm(
                                `Usar o status de ${nameOf(d.player_id)}?\n\n` +
                                  `Ela ganha ${d.value} pontos em ${monthLabel(d.month)}, ` +
                                  `mas o ${lbl} (${d.streak} semanas) zera e ela recomeça do zero.\n\n` +
                                  `Essa escolha não tem volta.`,
                              )
                            )
                              return
                            saveChoice(newChoice(d.player_id, d.month, 'usar', d.streak, d.value))
                          }}
                        >
                          💰 Usar +{d.value}
                        </button>
                        <button
                          className={`btn sm ${!usou ? 'pink' : 'ghost'}`}
                          onClick={() => saveChoice(newChoice(d.player_id, d.month, 'preservar', d.streak, d.value))}
                        >
                          🔥 Preservar {!usou && '✓'}
                        </button>
                      </div>
                    )}
                    {!canEdit && (
                      <div className="tiny" style={{ color: usou ? 'var(--teal)' : 'var(--pink)', fontWeight: 700 }}>
                        {usou ? `usou o status (+${d.value})` : 'preservou o status'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <TopDaForca onVerTudo={onVerForca} />

      {rows.length > 0 && (
        <div className="card">
          <div className="section-title">📊 Classificação do mês</div>
          <RankTable rows={visiveis} fire={streaks.current} />
          {rows.length > TOPO && (
            <button className="btn ghost block sm" style={{ marginTop: 10 }} onClick={() => setVerTodas((v) => !v)}>
              {verTodas ? `Mostrar só o top ${TOPO}` : `Ver todas as ${rows.length} jogadoras`}
            </button>
          )}
          <button
            className="btn pink block"
            style={{ marginTop: 12 }}
            onClick={async () => {
              const ok = await shareOrCopy(monthRankingText(activeMonth, rows, nameOf, streaks.current))
              onToast(ok ? 'Ranking pronto para colar no grupo 💬' : 'Não consegui copiar 😕')
            }}
          >
            💬 Compartilhar no WhatsApp
          </button>
          <button className="btn purple block" style={{ marginTop: 8 }} disabled={gerando} onClick={() => void gerarImagem()}>
            {gerando ? 'Montando a arte…' : '👑 Gerar imagem do fechamento do mês'}
          </button>
        </div>
      )}

      {poster && (
        <Modal title={rotuloPeriodo} onClose={fecharPoster}>
          <img src={poster.url} alt="Imagem do ranking do mês" style={{ width: '100%', borderRadius: 14 }} />
          <button className="btn pink block" style={{ marginTop: 12 }} onClick={() => void salvarImagem()}>
            📲 Compartilhar / salvar imagem
          </button>
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            No celular também dá para segurar o dedo na imagem e escolher <em>salvar</em>.
          </p>
        </Modal>
      )}

      <div className="card dark">
        <div className="section-title">⭐ Pontuação individual</div>
        <div className="grid2" style={{ gap: 8 }}>
          {POINTS_TABLE.map((p) => (
            <div key={p.label} style={{ background: p.color, borderRadius: 12, padding: '8px 10px', color: 'var(--sempre-escuro)' }}>
              <div className="tiny" style={{ fontWeight: 800, letterSpacing: '.5px' }}>VITÓRIA POR {p.label}</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{p.points} <span style={{ fontSize: 11 }}>PONTOS</span></div>
            </div>
          ))}
        </div>
        <p className="small" style={{ color: 'var(--muted)' }}>
          Cada partida vai até 4 pontos, sem empate. Quem vence leva os pontos da tabela; a derrota não pontua.
          Ao final do play, os pontos são somados ao ranking mensal.
        </p>
        <hr className="sep" style={{ borderColor: 'rgba(255,255,255,.15)' }} />
        <div className="section-title" style={{ marginBottom: 6 }}>🔥 Bônus em chamas</div>
        <p className="small" style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 8 }}>
          Terminou várias semanas seguidas no <strong>pódio do dia</strong> (top {PODIO}; nos plays em
          grupos, o pódio é um por grupo)? Você ganha um status:
        </p>
        <div className="grid2" style={{ gap: 8 }}>
          {STREAK_LADDER.map((x) => {
            const faixa = x.to === null ? `${x.from} ou mais` : x.from === x.to ? `${x.from} seguidos` : `${x.from} a ${x.to}`
            const top = x.to === null
            return (
              <div
                key={x.title}
                style={{
                  background: top ? 'var(--por-do-sol)' : 'var(--card-2)',
                  color: top ? 'var(--sempre-escuro)' : undefined,
                  borderRadius: 12,
                  padding: '8px 10px',
                  gridColumn: top ? '1 / -1' : undefined,
                }}
              >
                <div className="tiny" style={{ fontWeight: 800, letterSpacing: '.5px' }}>
                  {x.emoji} {faixa.toUpperCase()} · {x.title.toUpperCase()}
                </div>
                <div style={{ fontSize: 20, fontWeight: 900 }}>{x.value} <span style={{ fontSize: 11 }}>PONTOS</span></div>
              </div>
            )
          })}
        </div>
        <p className="tiny" style={{ color: 'var(--muted)', marginBottom: 0 }}>
          <strong>No fechamento do mês ela escolhe:</strong> <em>usar</em> o status (os pontos entram
          naquele mês e a sequência zera) ou <em>preservar</em> (não pontua, o status continua
          crescendo e ela ganha <strong>1 vida</strong>, que segura um play fora do pódio).
          Faltar zera o status mesmo com vida — tem que estar lá. Como o mês tem 4 ou 5 plays,
          Imperatriz e Duquesa só existem para quem preserva e atravessa meses.
        </p>
      </div>
    </>
  )
}

/**
 * Fechar o mes mexe no mini-game do status, entao a tela mostra exatamente o
 * que vai acontecer com cada uma antes de confirmar.
 */
function ConfirmarFechamento({
  mes,
  emChamas,
  onClose,
  onConfirmar,
}: {
  mes: string
  emChamas: { player_id: string; streak: number; value: number; life: number }[]
  onClose: () => void
  onConfirmar: () => void
}) {
  const { nameOf, playerById } = useStore()
  return (
    <Modal title={`Finalizar ${monthLabel(mes)}?`} onClose={onClose}>
      <p className="tiny muted" style={{ marginTop: 0 }}>
        O mês fecha e o app abre o <strong>fechamento do status</strong>: cada uma que está em
        chamas escolhe <strong>usar</strong> (vira pontos deste mês e a sequência zera) ou{' '}
        <strong>preservar</strong> (não pontua, o status continua e ela ganha 1 vida). Sem
        resposta, fica preservado. Dá para <strong>reabrir</strong> depois, se foi teste.
      </p>

      {emChamas.length === 0 ? (
        <div className="banner info" style={{ marginTop: 0 }}>
          Nenhuma jogadora está em chamas agora, então fechar o mês não muda pontuação nenhuma.
        </div>
      ) : (
        <>
          <div className="section-title" style={{ fontSize: 13 }}>
            🔥 {emChamas.length === 1 ? 'Uma jogadora fecha' : `${emChamas.length} jogadoras fecham`} com status
          </div>
          <div className="stack">
            {emChamas.map((f) => {
              const lvl = streakLevel(f.streak)
              return (
                <div key={f.player_id} className="row" style={{ gap: 10 }}>
                  <Avatar player={playerById(f.player_id)} size={34} />
                  <span className="grow ellipsis" style={{ fontWeight: 700 }}>
                    {nameOf(f.player_id)} {lvl?.emoji}
                  </span>
                  <span className="tiny nowrap" style={{ fontWeight: 800, color: 'var(--pink)' }}>
                    vale {f.value} pts
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      <button className="btn teal block" style={{ marginTop: 14 }} onClick={onConfirmar}>
        🏁 Finalizar {monthLabel(mes)}
      </button>
      <button className="btn ghost block sm" style={{ marginTop: 8 }} onClick={onClose}>
        Cancelar
      </button>
    </Modal>
  )
}

export function RankTable({
  rows,
  fire,
  vagas = 3,
}: {
  rows: PlayerStat[]
  fire?: Map<string, number>
  /** Quantas posicoes ganham cor de podio: num grupo pequeno o podio tem menos de 3. */
  vagas?: number
}) {
  const { nameOf, playerById } = useStore()
  const showBonus = rows.some((r) => r.bonus > 0)
  // a coluna so aparece quando ha bye no recorte: nos plays sem chave
  // ela seria uma coluna de zeros ocupando largura no celular
  const showBye = rows.some((r) => r.bye > 0)
  const posicoes = positionsOf(rows)
  return (
    <div className="scroll-x">
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th style={{ textAlign: 'left' }}>Jogadora</th>
            <th>Pts</th>
            {showBonus && <th>🔥</th>}
            {showBye && <th title="Pontos pagos por bye no mata-mata">🎫</th>}
            <th>J</th>
            <th>V</th>
            <th>D</th>
            <th>Saldo</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s, i) => {
            const bal = balance(s)
            return (
              <tr key={s.player_id}>
                <td className={`rank-pos${posicoes[i] <= vagas ? ` top${posicoes[i]}` : ''}`} style={{ fontWeight: 800 }}>{posicoes[i]}</td>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    <Avatar player={playerById(s.player_id)} size={28} />
                    <span className="ellipsis">{nameOf(s.player_id)}</span>
                    {fire && (fire.get(s.player_id) ?? 0) >= 2 && (
                      <span className="nowrap" title={`${fire.get(s.player_id)} vitórias seguidas`}>
                        {streakLevel(fire.get(s.player_id) as number)?.emoji}
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ fontWeight: 800, color: 'var(--pink)' }}>{s.points}</td>
                {showBonus && <td className="tiny" style={{ color: 'var(--orange)', fontWeight: 800 }}>{s.bonus > 0 ? `+${s.bonus}` : ''}</td>}
                {showBye && <td className="tiny" style={{ color: 'var(--teal)', fontWeight: 800 }}>{s.bye > 0 ? `+${s.bye}` : ''}</td>}
                <td>{s.matches}</td>
                <td>{s.wins}</td>
                <td>{s.losses}</td>
                <td>{bal > 0 ? `+${bal}` : bal}</td>
                <td>{Math.round(winRate(s) * 100)}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}


/**
 * A forca na tela inicial: individual ou por dupla, cinco de cada vez.
 *
 * As duas medem coisas diferentes e ninguem precisa das duas ao mesmo tempo,
 * entao sao uma escolha e nao duas listas empilhadas -- a tela inicial ja tem
 * o ranking do mes, o proximo play e o status.
 */
function TopDaForca({ onVerTudo }: { onVerTudo?: () => void }) {
  const { data, nameOf, playerById } = useStore()
  const [modo, setModo] = useState<'individual' | 'duplas'>('individual')

  const individuais = useMemo(() => rankingDeForca(data, nameOf), [data, nameOf])
  const duplas = useMemo(
    () =>
      [...forcaDeDuplas(data).values()].sort(
        (a, b) => b.nota - a.nota || nameOf(a.a).localeCompare(nameOf(b.a), 'pt-BR'),
      ),
    [data, nameOf],
  )

  const total = modo === 'individual' ? individuais.length : duplas.length
  if (individuais.length === 0) return null

  return (
    <div className="card">
      <div className="section-title">💪 Força</div>

      <div className="segmented" style={{ marginBottom: 10 }}>
        <button
          className={modo === 'individual' ? 'on' : ''}
          onClick={() => setModo('individual')}
        >
          👤 Individual
        </button>
        <button className={modo === 'duplas' ? 'on' : ''} onClick={() => setModo('duplas')}>
          🤝 Duplas
        </button>
      </div>

      {modo === 'duplas' && duplas.length === 0 ? (
        <p className="tiny muted" style={{ margin: 0 }}>
          Nenhuma dupla jogou junta ainda.
        </p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {modo === 'individual'
            ? individuais.slice(0, 5).map((l, i) => (
                <div key={l.player_id} className="row" style={{ gap: 8 }}>
                  <span className={`rank-pos top${i + 1}`} style={{ fontWeight: 800, minWidth: 22 }}>
                    {i + 1}
                  </span>
                  <Avatar player={playerById(l.player_id)} size={28} />
                  <span className="grow ellipsis">{nameOf(l.player_id)}</span>
                  <span className="nowrap tiny" style={{ color: l.nivel.cor, fontWeight: 800 }}>
                    {l.nivel.emoji}
                  </span>
                  <span
                    className="nowrap"
                    style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {l.nota}
                  </span>
                </div>
              ))
            : duplas.slice(0, 5).map((d, i) => (
                <div key={d.key} className="row" style={{ gap: 8 }}>
                  <span className={`rank-pos top${i + 1}`} style={{ fontWeight: 800, minWidth: 22 }}>
                    {i + 1}
                  </span>
                  <Avatar player={playerById(d.a)} size={24} />
                  <Avatar player={playerById(d.b)} size={24} />
                  <span className="grow ellipsis">
                    {nameOf(d.a)} + {nameOf(d.b)}
                  </span>
                  {d.entrosamento !== 0 && (
                    <span className="nowrap tiny muted">
                      {d.entrosamento > 0 ? '+' : ''}
                      {d.entrosamento} juntas
                    </span>
                  )}
                  <span
                    className="nowrap"
                    style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {d.nota}
                  </span>
                </div>
              ))}
        </div>
      )}

      {total > 5 && onVerTudo && (
        <button className="btn ghost block sm" style={{ marginTop: 10 }} onClick={onVerTudo}>
          {modo === 'individual'
            ? `Ver as ${total} jogadoras →`
            : `Ver as ${total} duplas →`}
        </button>
      )}

      <p className="tiny muted" style={{ marginTop: 8, marginBottom: 0 }}>
        {modo === 'individual' ? (
          <>
            Não é o ranking do mês: o ranking soma pontos e zera na virada, a força atravessa o
            ano. 1500 é a média.
          </>
        ) : (
          <>
            A força da dupla parte da média das duas e muda com o que elas rendem{' '}
            <strong>juntas</strong> — e é isso que o app usa para escolher os confrontos.
          </>
        )}
      </p>
    </div>
  )
}
