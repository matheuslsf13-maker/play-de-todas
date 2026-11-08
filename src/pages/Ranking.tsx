import { lazy, Suspense, useMemo, useState } from 'react'
import { LIGA, URL_DO_LOGO } from '../liga'
import { Avatar, Empty, Modal, baixarOuCompartilhar, shareOrCopy } from '../components/ui'
import { BotoesDeFoto } from '../components/BotoesDeFoto'
import { monthRankingText } from '../lib/share'
import { POINTS_TABLE } from '../lib/scoring'
import {
  balance,
  aplicarBye,
  aplicarColocacao,
  computeStatsComPontos,
  playedMatches,
  pontosDeBye,
  rankPlayers,
  winRate,
  type PlayerStat, mediaDaForca } from '../lib/stats'
import { PONTUACAO_PADRAO, colocacaoNoRecorte } from '../lib/campeonato'

import {
  applyBonuses,
  computeStreaks,
  MAX_STREAK,
  mesFechado,
  onFire,
  STREAK_LADDER,
  streakLevel,
} from '../lib/streaks'
import { avaliacaoCurta, emAvaliacao, forcaDeDuplas, rankingDeForca } from '../lib/forca'
import { useStore } from '../lib/store'
import { ordenarComDesempates } from '../lib/desempateDoDia'
import { posicoesDaLista, semOPlay, ultimoPlayJogado, variacoes } from '../lib/variacao'
import { NomeClicavel, useAbrirPerfil } from '../components/NomeClicavel'
// o perfil da dupla vem do Stats, que carrega a parte: sem isto o Stats inteiro entrava no pacote da tela inicial
const PerfilDaDupla = lazy(() => import('./Stats').then((m) => ({ default: m.PerfilDaDupla })))
import CartaoDoMomento from '../components/CartaoDoMomento'
import { monthLabel, monthOf, plural, todayISO, type AppData, type DesempateDeGrupo, type Match, type MonthClosure } from '../lib/types'

/** Opcao do seletor que mostra tudo o que ja foi jogado, sem cortar por mes. */
const HISTORICO = 'all'

export default function Ranking({
  onToast,
  onAbrirPlay,
  onVerForca,
  onAbrirLista,
}: {
  onToast: (m: string) => void
  onAbrirPlay: (sessionId: string) => void
  /** Leva para a aba Stats ja na Força. */
  onVerForca?: () => void
  /** Abre a lista de presenca (cartao do momento). */
  onAbrirLista: (codigo: string) => void
}) {
  const { data, nameOf, playerById, canEdit, saveClosure, deleteClosure } = useStore()

  const months = useMemo(() => {
    const set = new Set(data.sessions.map((s) => monthOf(s.date)))
    set.add(monthOf(todayISO()))
    return [...set].sort().reverse()
  }, [data.sessions])

  const [month, setMonth] = useState(months[0])
  // quantas da classificacao aparecem: 0 = recolhida; abre de 10 em 10 (dono, 06/11)
  const [qtd, setQtd] = useState(0)
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
  /** Quem esta com status vivo agora. */
  const comStatus = useMemo(() => onFire(streaks), [streaks])

  const rows = useMemo(() => linhasDoMes(data, streaks, activeMonth, historico, nameOf), [data, activeMonth, historico, nameOf, streaks])

  // ▲/▼ desde o ultimo play do mes (dono, 07/11); com um play so no mes nao ha comparacao
  const variacaoDoMes = useMemo(() => {
    if (historico) return undefined
    const ultimo = ultimoPlayJogado(data, { month: activeMonth, ranked: true })
    if (!ultimo) return undefined
    const antes = semOPlay(data, ultimo)
    if (!playedMatches(antes, { month: activeMonth, ranked: true }).length) return undefined
    const linhasAntes = linhasDoMes(antes, computeStreaks(antes), activeMonth, false, nameOf)
    return variacoes(ordenarComDesempates(linhasAntes).posicao, ordenarComDesempates(rows).posicao)
  }, [data, activeMonth, historico, nameOf, rows])

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

  // empate de verdade (mesmos pontos, saldo e vitorias) fica na mesma posicao
  const posicoes = useMemo(() => {
    const { posicao } = ordenarComDesempates(rows)
    return rows.map((r) => posicao.get(r.player_id) ?? 0)
  }, [rows])
  // cinco basta para saber quem esta na briga; a lista inteira fica a um toque

  /** Sem foto, a arte de sempre; com foto, a do podio com a foto por fundo. */
  async function gerarImagem(foto?: File) {
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
        // o titulo da epoca: a escada mudou depois
        const lvl = usou ? { emoji: usou.emoji, title: usou.title } : null
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
      // a arte carrega so quando alguem pede (fica fora do pacote da tela inicial)
      const { buildMonthPoster, buildPosterComFoto } = await import('../lib/poster')
      const blob = foto
        ? await buildPosterComFoto({ data: rotuloPeriodo, titulo: 'Pódio do mês', rows: linhas.slice(0, 6), foto, logoUrl: URL_DO_LOGO })
        : await buildMonthPoster(rotuloPeriodo, linhas, URL_DO_LOGO)
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
    const arquivo = new File([poster.blob], `ranking-${historico ? 'historico' : activeMonth}.${poster.blob.type === 'image/jpeg' ? 'jpg' : 'png'}`, { type: poster.blob.type })
    const resultado = await baixarOuCompartilhar(arquivo, `Ranking — ${rotuloPeriodo} 🏆`)
    if (resultado === 'baixou') onToast('Imagem salva 📸')
  }
  const podium = rows.slice(0, 3)
  const order = [1, 0, 2] // 2º, 1º, 3º na tela

  return (
    <>
      {/* lista aberta -> lista fechada e o proximo play -> ao vivo -> podio da noite (D42) */}
      <CartaoDoMomento onAbrirPlay={onAbrirPlay} onAbrirLista={onAbrirLista} />

      <div className="ini-sec">
        <h2>{historico ? 'Ranking geral' : 'Ranking do mês'}</h2>
        {/* seletor compacto: largo, ele quebrava o titulo em duas linhas */}
        <select className="select select-compacta" value={periodo} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => (
            // "Nov 2026": "Novembro de 2026" nao cabia ao lado do titulo no celular
            <option key={m} value={m}>{`${monthLabel(m).slice(0, 3)} ${m.slice(0, 4)}`}</option>
          ))}
          <option value={HISTORICO}>🏅 Histórico</option>
        </select>
      </div>
      {/* a palavra leva ao cartao que explica (dono, 06/11) */}
      <div className="ini-nota">
        somado por <IrPara alvo="como-pontua">pontos</IrPara>
        {historico && <> · todos os plays já registrados, avulsos inclusive</>}
      </div>

      {rows.length === 0 ? (
        <div className="ini-grupo" style={{ padding: 14 }}>
          <Empty>Nenhuma partida registrada {historico ? 'ainda' : 'neste mês ainda'}.<br />Vá em <strong>Play</strong> e crie o play do dia.</Empty>
        </div>
      ) : (
        <>
          <div className="podium ini-podio">
            {order.map((idx) => {
              const s = podium[idx]
              if (!s) return <div key={idx} />
              const pos = posicoes[idx] ?? idx + 1
              return (
                <div className={`slot p${pos}`} key={s.player_id}>
                  <Avatar player={playerById(s.player_id)} size={pos === 1 ? 66 : 52} />
                  <NomeClicavel id={s.player_id} className="nm ellipsis">{nameOf(s.player_id)}</NomeClicavel>
                  {/* o selinho ▲/▼ desde o ultimo play do mes (proposta aprovada, 08/11) */}
                  {variacaoDoMes?.get(s.player_id) ? (
                    <span className={`podio-seta ${(variacaoDoMes.get(s.player_id) as number) > 0 ? 'sobe' : 'desce'}`}>
                      {(variacaoDoMes.get(s.player_id) as number) > 0 ? '▲' : '▼'}
                      {Math.abs(variacaoDoMes.get(s.player_id) as number)}
                    </span>
                  ) : null}
                  <div className="base">
                    <div className="pos">{pos}º</div>
                    <div className="pts">{s.points} pts</div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="ini-grupo ini-met">
            <div><strong>{totals.days}</strong><span>plays</span></div>
            <div><strong>{totals.games}</strong><span>partidas</span></div>
            <div><strong>{totals.players}</strong><span>jogadoras</span></div>
          </div>

          {/* a classificacao inteira fica recolhida aqui dentro (era um cartao a mais na tela inicial; dono, 06/11) */}
          <div className="ini-grupo" style={{ marginTop: 10 }}>
            {qtd === 0 ? (
              <button className="ini-linha ini-chev" onClick={() => setQtd(10)} aria-expanded={false}>
                <span className="g"><b>Ver a classificação</b></span>
                <span className="sub">{rows.length}</span>
              </button>
            ) : (
              <>
                <ClassificacaoEmLista rows={rows.slice(0, qtd)} fire={streaks.current} variacao={variacaoDoMes} />
                {qtd < rows.length && (
                  <button className="ini-linha ini-centro" onClick={() => setQtd((n) => n + 10)}>
                    Mostrar mais {Math.min(10, rows.length - qtd)} ↓
                  </button>
                )}
                <button className="ini-linha ini-centro" onClick={() => setQtd(0)} aria-expanded={true}>
                  Recolher ↑
                </button>
              </>
            )}
          </div>

          {qtd > 0 && (
            <div className="ini-grupo" style={{ marginTop: 14 }}>
              <button
                className="ini-linha ini-chev"
                onClick={async () => {
                  const ok = await shareOrCopy(monthRankingText(activeMonth, rows, nameOf, streaks.current))
                  onToast(ok ? 'Ranking pronto para colar no grupo 💬' : 'Não consegui copiar 😕')
                }}
              >
                <span className="ini-ic verde" aria-hidden="true">💬</span>
                <span className="g"><b>Compartilhar no WhatsApp</b></span>
              </button>
              <button className={`ini-linha ini-chev${gerando ? ' off' : ''}`} disabled={gerando} onClick={() => void gerarImagem()}>
                <span className="ini-ic roxo" aria-hidden="true">👑</span>
                <span className="g"><b>{gerando ? 'Montando a arte…' : 'Gerar imagem do fechamento do mês'}</b></span>
              </button>
              <BotoesDeFoto lista gerando={gerando} textoCamera="📷 Tirar foto" aoEscolher={(f) => void gerarImagem(f)} />
            </div>
          )}
        </>
      )}

      {!historico && canEdit && (
        <div className="fechamento">
          {fechado ? (
            <div className="row spread" style={{ gap: 10 }}>
              <span className="tiny grow">
                🏁 <strong>{monthLabel(activeMonth)} está fechado.</strong>{' '}
                {naMao
                  ? 'O ranking dele não muda mais.'
                  : 'Fechou sozinho porque o calendário já passou do mês.'}
              </span>
              {naMao && (
                <button
                  className="btn ghost sm nowrap"
                  onClick={() => {
                    if (!confirm(`Reabrir ${monthLabel(activeMonth)}?\n\nServe para desfazer um fechamento feito por engano ou para teste.`)) return
                    deleteClosure(activeMonth)
                    onToast('Mês reaberto')
                  }}
                >↩️ Reabrir</button>
              )}
            </div>
          ) : (
            <>
              <button className="btn teal block" onClick={() => setFechando(true)}>
                🏁 Finalizar {monthLabel(activeMonth)}
              </button>
              <div className="ini-legenda" style={{ textAlign: 'center' }}>Trava o ranking do mês. Dá para reabrir depois.</div>
            </>
          )}
        </div>
      )}

      {fechando && (
        <ConfirmarFechamento
          mes={activeMonth}
          onClose={() => setFechando(false)}
          onConfirmar={() => {
            const closure: MonthClosure = {
              id: activeMonth,
              month: activeMonth,
              closed_at: new Date().toISOString(),
            }
            saveClosure(closure)
            setFechando(false)
            onToast('Mês finalizado 🏁')
          }}
        />
      )}

      {/* UM bloco de status (dono, 08/11): quem esta em sequencia e, um toque abaixo, como funciona. */}
      <div className="ini-sec" id="como-funciona-status"><h2>Status</h2></div>
      <div className="ini-nota">pódios seguidos sem faltar · o último tem um prêmio secreto</div>
      <div className="ini-grupo">
        {fire.length > 0 ? (
          fire.map((f) => {
            const lvl = streakLevel(f.streak)
            const falta = MAX_STREAK - f.streak
            return (
              <div className={`ini-linha${f.streak >= MAX_STREAK - 1 ? ' queen' : ''}`} key={f.player_id}>
                <Avatar player={playerById(f.player_id)} size={42} />
                <div className="g">
                  <b className="ellipsis"><NomeClicavel id={f.player_id}>{nameOf(f.player_id)}</NomeClicavel></b>
                  <span className="ini-status">{lvl?.title} {lvl?.emoji}</span>
                  <div className="ini-pips" aria-label={`${f.streak} de ${MAX_STREAK} pódios seguidos`}>
                    {Array.from({ length: MAX_STREAK }, (_, i) => <i key={i} className={i < f.streak ? 'f' : undefined} />)}
                    <span>{falta === 1 ? 'falta 1 para 👑' : `faltam ${falta} para 👑`}</span>
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="ini-linha"><span className="sub">Ninguém em sequência agora: o próximo pódio começa uma.</span></div>
        )}
        <details className="ini-detalhe">
          <summary className="ini-linha"><span className="g"><b>Como funciona o status</b></span></summary>
          <div className="ini-corpo">
            <p className="regra-texto" style={{ marginTop: 0 }}>
              Cada play terminado no <strong>pódio</strong> sobe um degrau: o top 3 do play, o pódio do seu
              grupo, ou as 3 duplas medalhistas nas duplas fixas e no campeonato.
            </p>
            <ol className="escada">
              {STREAK_LADDER.map((x) => (
                <li key={x.title} className={x.from === MAX_STREAK ? 'topo' : undefined}>
                  <span className="degrau">{x.from}</span>
                  <span className="degrau-nome">
                    {x.emoji} {x.title}
                  </span>
                  <span className="degrau-conta">{x.from === MAX_STREAK ? 'o topo' : 'pódios seguidos'}</span>
                </li>
              ))}
            </ol>
            <ul className="regras-lista">
              <li>❌ Zera fora do pódio ou faltando</li>
              <li>🧊 Play sem status não sobe nem zera</li>
              <li>⭐ Não vale pontos: o ranking é só o que foi jogado</li>
            </ul>
            <div className="premio">
              👑 <strong>Duquesa da V3</strong>: o nome fica dourado com a coroa no app para sempre, e ela ganha um
              presente misterioso 🎁. O status recomeça.
            </div>
          </div>
        </details>
      </div>

      {decisoes.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="section-title">🏁 Status em {monthLabel(activeMonth)}</div>
          <p className="tiny muted" style={{ marginTop: 0 }}>
            Na regra antiga o status virava pontos no fechamento do mês. Ficou registrado o que
            cada uma escolheu.
          </p>
          <div className="stack">
            {decisoes.map((d) => {
              const usou = d.action === 'usar'
              return (
                <div key={d.player_id} className="row">
                  <Avatar player={playerById(d.player_id)} size={34} />
                  <span className="grow ellipsis" style={{ fontWeight: 700 }}>
                    <NomeClicavel id={d.player_id}>{nameOf(d.player_id)}</NomeClicavel>
                  </span>
                  <span className="tiny nowrap" style={{ color: usou ? 'var(--teal)' : 'var(--pink)', fontWeight: 700 }}>
                    {usou ? `usou o status (+${d.value})` : 'preservou'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <TopDaForca onVerTudo={onVerForca} />

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

      {/* Como pontua: o que pontua e o que da status. Os numeros saem das mesmas constantes que o app usa
          (POINTS_TABLE, PONTUACAO_PADRAO, STREAK_LADDER), para o cartao nunca contar uma regra velha. */}
      <div className="ini-sec"><h2>Ajuda</h2></div>
      <div className="ini-grupo">
        <details className="ini-detalhe" id="como-pontua">
          <summary className="ini-linha">
            <span className="ini-ic ouro" aria-hidden="true">⭐</span>
            <span className="g"><b>Como pontua</b></span>
          </summary>
          <div className="ini-corpo regras">
            <div className="regra-bloco">
              <div className="regra-titulo">🎾 Partida a partida</div>
              <p className="regra-texto">
                Quem vence leva a <strong>diferença de games</strong> (mínimo 1). A derrota não pontua.
              </p>
              <div className="placares">
                {POINTS_TABLE.map((p) => (
                  <div
                    key={p.label}
                    className="placar-chip"
                    // o roxo e o unico tom escuro da tabela: texto claro nele
                    style={{ background: p.color, color: p.color === 'var(--purple)' ? 'var(--sempre-claro)' : undefined }}
                  >
                    <span className="placar-pts">+{p.points}</span>
                    <span className="placar-jogo">{p.label.replace(/\s/g, '')}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="regra-bloco">
              <div className="regra-titulo">🤝 Duplas fixas e campeonato</div>
              <p className="regra-texto">
                A fase de grupos só forma as duplas. Os pontos do mês vêm de <strong>onde a dupla terminou</strong>:
              </p>
              <div className="colocacoes">
                {PONTUACAO_PADRAO.map((pts, i) => (
                  <div key={i} className={`colocacao-chip${i < 3 ? ' podio' : ''}`}>
                    <span className="colocacao-nome">{ROTULOS_DA_COLOCACAO[i]}</span>
                    <span className="colocacao-pts">{pts}</span>
                  </div>
                ))}
              </div>
              <p className="regra-nota">Tabela padrão: cada play pode ajustar na hora de criar.</p>
            </div>

            <div className="regra-rodape">
              📅 O <strong>dia</strong> é decidido por vitórias · o <strong>mês</strong> soma os pontos
            </div>
          </div>
        </details>
        {/* a apresentacao (public/apresentacao) e do Play de Todas: no masculino ainda nao existe */}
        {LIGA.id === 'feminino' && (
          <a className="ini-linha ini-chev" href={`${import.meta.env.BASE_URL}apresentacao/`} target="_blank" rel="noopener">
            <span className="ini-ic rosa" aria-hidden="true">📖</span>
            <span className="g">
              <b>Primeira vez aqui?</b>
              <span className="sub">Como funciona o Play de Todas: participação, instalação, formatos e o mini-game dos status</span>
            </span>
          </a>
        )}
      </div>
    </>
  )
}

/**
 * O podio (2o, 1o, 3o) de um recorte: o mesmo desenho do ranking do mes, para o ranking do dia dentro do play.
 * Empatadas dividem a colocacao (`ordenarComDesempates`); com menos de 3 sobe so quem tem.
 */
export function PodioDoRecorte({ rows: linhas, desempates, partidas }: { rows: PlayerStat[]; desempates?: DesempateDeGrupo[]; partidas?: Match[] }) {
  const { lista, posicao } = ordenarComDesempates(linhas, desempates, partidas)
  const { nameOf, playerById } = useStore()
  const podio = lista.slice(0, 3)
  if (podio.length === 0) return null
  return (
    <div className="podium ini-podio">
      {[1, 0, 2].map((idx) => {
        const s = podio[idx]
        if (!s) return <div key={idx} />
        const pos = posicao.get(s.player_id) ?? idx + 1
        return (
          <div className={`slot p${Math.min(3, pos)}`} key={s.player_id}>
            <Avatar player={playerById(s.player_id)} size={pos === 1 ? 66 : 52} />
            <NomeClicavel id={s.player_id} className="nm ellipsis">{nameOf(s.player_id)}</NomeClicavel>
            <div className="base">
              <div className="pos">{pos}º</div>
              <div className="pts">{s.points} pts</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * A classificacao em lista (tela inicial): posicao com ▲/▼, foto, nome (com o emoji do status), jogos, V, D e saldo
 * no texto pequeno, e os pontos grandes. Os extras (🔥 bonus, 🎫 bye, 🏅 colocacao) entram so quando existem no recorte.
 */
export function ClassificacaoEmLista({
  rows: linhas,
  fire,
  variacao,
  vagas = 3,
  desempates,
  partidas,
}: {
  rows: PlayerStat[]
  fire?: Map<string, number>
  variacao?: Map<string, number>
  /** Quantas posicoes ganham cor de podio (0 = nenhuma: a lista geral dos grupos). */
  vagas?: number
  /** Desempates em quadra e confronto direto que valem para estas linhas (o ranking do dia). */
  desempates?: DesempateDeGrupo[]
  partidas?: Match[]
}) {
  const { lista: rows, posicao } = ordenarComDesempates(linhas, desempates, partidas)
  const { nameOf, playerById } = useStore()
  return (
    <>
      {rows.map((s) => {
        const bal = balance(s)
        const emoji = (fire?.get(s.player_id) ?? 0) >= 2 ? streakLevel(fire?.get(s.player_id) as number)?.emoji : undefined
        return (
          <div className="ini-linha" key={s.player_id}>
            <Colocacao pos={posicao.get(s.player_id) ?? 0} v={variacao?.get(s.player_id)} vagas={vagas} />
            <Avatar player={playerById(s.player_id)} size={36} />
            <div className="g">
              <b className="ellipsis">
                <NomeClicavel id={s.player_id}>{nameOf(s.player_id)}</NomeClicavel>
                {emoji && <> {emoji}</>}
              </b>
              <span className="sub">
                {plural(s.matches, 'jogo')} · {s.wins}V {s.losses}D · saldo {bal > 0 ? `+${bal}` : bal < 0 ? `−${-bal}` : 0}
                {s.bonus > 0 && <span className="ini-extra" style={{ color: 'var(--orange)' }} title="Pontos do status">🔥 +{s.bonus}</span>}
                {s.bye > 0 && <span className="ini-extra" style={{ color: 'var(--teal)' }} title="Pontos pagos por bye no mata-mata">🎫 +{s.bye}</span>}
                {(s.colocacao ?? 0) > 0 && <span className="ini-extra" style={{ color: 'var(--purple)' }} title="Pontos pela colocação no campeonato">🏅 +{s.colocacao}</span>}
              </span>
            </div>
            <b className="ini-pts">{s.points}<small> pts</small></b>
          </div>
        )
      })}
    </>
  )
}

/** O nome de cada posicao da tabela de pontos por colocacao (PONTUACAO_PADRAO). */
const ROTULOS_DA_COLOCACAO = ['🥇 Campeã', '🥈 Vice', '🥉 3º lugar', 'Semifinal', 'Quartas', 'Grupos']

/** Fechar o mes so trava o ranking dele: o status nao depende mais do fechamento. */
/** A classificacao do mes (ou do historico), como sai na tela. */
function linhasDoMes(
  data: AppData,
  streaks: ReturnType<typeof computeStreaks>,
  activeMonth: string,
  historico: boolean,
  nameOf: (id: string) => string,
) {
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
    // no campeonato os pontos saem da colocacao final, nao do placar
    const colocacao = colocacaoNoRecorte(data.sessions, ms)
    return rankPlayers(aplicarColocacao(aplicarBye(applyBonuses(stats, awards), bye), colocacao), nameOf)
}

function ConfirmarFechamento({
  mes,
  onClose,
  onConfirmar,
}: {
  mes: string
  onClose: () => void
  onConfirmar: () => void
}) {
  return (
    <Modal title={`Finalizar ${monthLabel(mes)}?`} onClose={onClose}>
      <p className="tiny muted" style={{ marginTop: 0 }}>
        O mês fecha com o ranking como está. O status das meninas não muda: ele continua no
        próximo play. Dá para <strong>reabrir</strong> depois, se foi teste.
      </p>

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
  rows: linhas,
  fire,
  vagas = 3,
  desempates,
  partidas,
  variacao,
}: {
  rows: PlayerStat[]
  /** ▲/▼ desde o ultimo play (ranking do mes). */
  variacao?: Map<string, number>
  fire?: Map<string, number>
  /** Quantas posicoes ganham cor de podio: num grupo pequeno o podio tem menos de 3. */
  vagas?: number
  /** Desempates em quadra que valem para estas linhas (o grupo, ou o dia no todas). */
  desempates?: DesempateDeGrupo[]
  /** As partidas do dia, para o confronto direto entre duas empatadas. */
  partidas?: Match[]
}) {
  // empatadas em tudo dividem a posicao; o confronto direto ou a quadra decidem
  const { lista: rows, posicao } = ordenarComDesempates(linhas, desempates, partidas)
  const posicoes = rows.map((r) => posicao.get(r.player_id) ?? 0)
  const { nameOf, playerById } = useStore()
  const showBonus = rows.some((r) => r.bonus > 0)
  // a coluna so aparece quando ha bye no recorte: nos plays sem chave
  // ela seria uma coluna de zeros ocupando largura no celular
  const showBye = rows.some((r) => r.bye > 0)
  // idem para os pontos por colocacao do campeonato
  const showColocacao = rows.some((r) => (r.colocacao ?? 0) > 0)
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
            {showColocacao && <th title="Pontos pela colocação no campeonato">🏅</th>}
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
                <td>
                  <Colocacao pos={posicoes[i]} v={variacao?.get(s.player_id)} vagas={vagas} />
                </td>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    <Avatar player={playerById(s.player_id)} size={28} />
                    <NomeClicavel id={s.player_id} className="ellipsis">{nameOf(s.player_id)}</NomeClicavel>
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
                {showColocacao && (
                  <td className="tiny" style={{ color: 'var(--purple)', fontWeight: 800 }}>
                    {(s.colocacao ?? 0) > 0 ? `+${s.colocacao}` : ''}
                  </td>
                )}
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
  const { data, nameOf, playerById, canEdit } = useStore()
  const [modo, setModo] = useState<'individual' | 'duplas'>('individual')
  const [duplaAberta, setDuplaAberta] = useState<{ a: string; b: string } | null>(null)
  const abrirPerfil = useAbrirPerfil()

  // quem esta pausada (na mao ou por faltas) fica fora do ranking da forca; quem
  // esta em avaliacao so aparece para a admin (marcada 🔍), e a dupla dela tambem
  const individuais = useMemo(
    () => rankingDeForca(data, nameOf).filter((l) => !l.pausada && (canEdit || l.emAvaliacao === undefined)),
    [data, nameOf, canEdit],
  )
  const duplas = useMemo(() => {
    const avaliacao = emAvaliacao(data)
    return [...forcaDeDuplas(data).values()]
      .filter((d) => canEdit || (!avaliacao.has(d.a) && !avaliacao.has(d.b)))
      .sort((a, b) => b.nota - a.nota || nameOf(a.a).localeCompare(nameOf(b.a), 'pt-BR'))
  }, [data, nameOf, canEdit])

  // ▲/▼ desde o ultimo play: a mesma lista, com o mesmo filtro, sem ele (dono, 07/11)
  const variacao = useMemo(() => {
    const ultimo = ultimoPlayJogado(data)
    if (!ultimo) return { individual: new Map<string, number>(), duplas: new Map<string, number>() }
    const antes = semOPlay(data, ultimo)
    const avaliacao = emAvaliacao(antes)
    const indAntes = rankingDeForca(antes, nameOf).filter((l) => !l.pausada && (canEdit || l.emAvaliacao === undefined))
    const dupAntes = [...forcaDeDuplas(antes).values()]
      .filter((d) => canEdit || (!avaliacao.has(d.a) && !avaliacao.has(d.b)))
      .sort((a, b) => b.nota - a.nota || nameOf(a.a).localeCompare(nameOf(b.a), 'pt-BR'))
    return {
      individual: variacoes(posicoesDaLista(indAntes.map((l) => l.player_id)), posicoesDaLista(individuais.map((l) => l.player_id))),
      duplas: variacoes(posicoesDaLista(dupAntes.map((d) => d.key)), posicoesDaLista(duplas.map((d) => d.key))),
    }
  }, [data, nameOf, canEdit, individuais, duplas])

  const total = modo === 'individual' ? individuais.length : duplas.length
  if (individuais.length === 0) return null

  return (
    <>
      <div className="ini-sec"><h2>Força e entrosamento</h2></div>
      <div className="ini-nota">não é ranking e nunca zera</div>

      <div className="segmented" style={{ marginBottom: 8 }}>
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
      {/* uma linha so, a da aba aberta (dono, 07/11: os dois textos juntos ficavam longos) */}
      <p className="legenda-forca">
        {modo === 'individual' ? (
          <>
            <strong>Força</strong>: o nível de cada atleta pelos resultados
          </>
        ) : (
          <>
            <strong>Entrosamento</strong>: a dupla rende + ou − que o esperado
          </>
        )}
      </p>

      {modo === 'duplas' && duplas.length === 0 ? (
        <p className="tiny muted" style={{ margin: 0 }}>
          Nenhuma dupla jogou junta ainda.
        </p>
      ) : (
        <div className="ini-grupo">
          {modo === 'individual'
            ? individuais.slice(0, 5).map((l, i) => (
                // igual as duplas: a linha toda abre o perfil, com a seta mostrando que e tocavel (dono, 06/11)
                <button
                  key={l.player_id}
                  type="button"
                  className="ini-linha ini-chev"
                  disabled={!abrirPerfil}
                  onClick={() => abrirPerfil?.(l.player_id)}
                  aria-label={`Ver o perfil de ${nameOf(l.player_id)}`}
                >
                  <Colocacao pos={i + 1} v={variacao.individual.get(l.player_id)} />
                  <Avatar player={playerById(l.player_id)} size={34} />
                  {/* a forca colada no nome (dono, 06/11); o tracejado embaixo do nome diz que abre o perfil */}
                  <span className="row" style={{ flex: '0 1 13em', minWidth: 0, gap: 4 }}>
                    <span className="ellipsis nome-tocavel" style={{ fontWeight: 700 }}>
                      {nameOf(l.player_id)}
                    </span>
                    {l.emAvaliacao !== undefined && <span className="nowrap tiny muted">{avaliacaoCurta(l.emAvaliacao)}</span>}
                  </span>
                  {LIGA.id === 'misto' && (
                    <span className="nowrap tiny muted">{playerById(l.player_id)?.genero === 'F' ? '♀' : '♂'}</span>
                  )}
                  <span className="nowrap tiny" style={{ color: l.nivel.cor, fontWeight: 800 }}>
                    {l.nivel.emoji}
                  </span>
                  <span
                    className="nowrap"
                    style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {l.nota}
                  </span>
                  {/* a nota fica numa coluna logo depois do nome; a seta vai para a ponta */}
                  <span className="grow" />
                </button>
              ))
            : duplas.slice(0, 5).map((d, i) => (
                // a linha toda abre o perfil DA DUPLA (e nao o de cada uma)
                <button
                  key={d.key}
                  type="button"
                  className="ini-linha ini-chev"
                  onClick={() => setDuplaAberta({ a: d.a, b: d.b })}
                  aria-label={`Ver o perfil da dupla ${nameOf(d.a)} e ${nameOf(d.b)}`}
                >
                  <Colocacao pos={i + 1} v={variacao.duplas.get(d.key)} />
                  <Avatar player={playerById(d.a)} size={28} />
                  <Avatar player={playerById(d.b)} size={28} />
                  <span style={{ flex: '0 1 13em', minWidth: 0 }}>
                    {/* os dois nomes quebram em duas linhas em vez de cortar ("Brenda + Van…") */}
                    <span className="nome-tocavel" style={{ display: 'inline', fontWeight: 700, lineHeight: 1.25 }}>
                      <span className="nowrap">{nameOf(d.a)}</span> <span className="muted">+</span> <span className="nowrap">{nameOf(d.b)}</span>
                    </span>
                    <span className="tiny muted" style={{ display: 'block' }} title="Ajuste da força da dupla em relação à média individual; não soma pontos ao ranking.">
                      <span className="rotulo-entrosamento">Entrosamento</span>{' '}
                      <strong style={{ color: d.entrosamento > 0 ? 'var(--verde)' : d.entrosamento < 0 ? 'var(--danger)' : undefined }}>
                        {d.entrosamento > 0 ? '+' : ''}
                        {d.entrosamento}
                      </strong>
                    </span>
                  </span>
                  <span
                    className="nowrap"
                    style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {d.nota}
                  </span>
                  {/* a nota fica numa coluna logo depois do nome; a seta vai para a ponta */}
                  <span className="grow" />
                </button>
              ))}
        </div>
      )}

      {duplaAberta && (
        <Suspense fallback={null}>
          <PerfilDaDupla a={duplaAberta.a} b={duplaAberta.b} onClose={() => setDuplaAberta(null)} />
        </Suspense>
      )}

      {total > 5 && onVerTudo && (
        <div className="ini-grupo" style={{ marginTop: 10 }}>
          <button className="ini-linha ini-chev" onClick={onVerTudo}>
            <span className="g"><b>{modo === 'individual' ? `Ver todas as ${total} jogadoras` : `Ver as ${total} duplas`}</b></span>
          </button>
        </div>
      )}

      {/* o texto longo saiu (dono, 06/11): o que importa esta na nota do titulo; o misto ainda explica de onde veio */}
      {modo === 'individual' && LIGA.id === 'misto' && (
        <p className="tiny muted" style={{ marginTop: 8, marginBottom: 0 }}>
          Cada um <strong>começou</strong> com a força que tinha no seu campeonato (Play de Todas ou Play de Terça);
          daí em diante só os jogos do misto contam. A média hoje é {mediaDaForca(data)}.
        </p>
      )}
    </>
  )
}

/** Palavra da nota do titulo que rola ate o cartao que explica (Como pontua, Status). */
/** O numero da colocacao com o ▲/▼ desde o ultimo play embaixo (some sem mudanca). */
function Colocacao({ pos, v, vagas = 3 }: { pos: number; v?: number; vagas?: number }) {
  return (
    <span className="pos-com-delta">
      <span className={`rank-pos${pos <= vagas ? ` top${pos}` : ''}`}>{pos}</span>
      {v ? (
        <span className={`rank-delta ${v > 0 ? 'sobe' : 'desce'}`} aria-label={v > 0 ? `subiu ${v}` : `caiu ${-v}`}>
          {v > 0 ? '▲' : '▼'}
          {Math.abs(v)}
        </span>
      ) : null}
    </span>
  )
}

function IrPara({ alvo, children }: { alvo: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="nota-link"
      onClick={() => {
        const el = document.getElementById(alvo)
        if (el instanceof HTMLDetailsElement) el.open = true
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
    >
      {children}
    </button>
  )
}
