import { useEffect, useMemo, useState } from 'react'
import { AvisoDoBanco } from '../components/AvisoDoBanco'
import ImportarLista from '../components/ImportarLista'
import { Avatar, Empty, Modal, StatBox, Stepper, shareOrCopy } from '../components/ui'
import {
  duplasDaFase2,
  duplasVivas,
  aplicarAjustesDeGrupo,
  duplasQueEntraram,
  formarGrupos,
  gruposEquilibrados,
  gerarFila,
  nomeDaRodada,
  rodadaDoMataMata,
  type Colocacao,
  type PlannedMatch,
  jogadorasDaPartida,
  ordemDeEspera,
  ordemPrevista,
  jogosDoRodizio,
  parceirasDoRodizio,
  repeticoesPorJogadora,
  partidasDoRodizio,
  quadrasSimultaneas,
  planToMatches,
  proximasDasQuadras,
  refazerFila,
} from '../lib/pairing'
import { normalizar } from '../lib/roster'
import { dayRankingText, scheduleText } from '../lib/share'
import { isPlayed, matchPoints } from '../lib/scoring'
import { loadFins, loadInicios, saveFins, saveInicios, type Horarios } from '../lib/emQuadra'
import {
  aplicarBye,
  balance,
  buildHistory,
  computeStats,
  type DuplaDoDia,
  DUPLAS_NO_PODIO,
  FORCA_PADRAO,
  pairKey,
  playedMatches,
  type PlayerStat,
  pontosDeBye,
  rankDuplasDoDia,
  rankPlayers,
  ratings,
} from '../lib/stats'
import { buildDayPoster, buildDayPosterGrupos, type PosterRow } from '../lib/poster'
import {
  MODOS,
  REGRA_PADRAO,
  TIES,
  escreverRegra,
  explicarRegra,
  decidiuNoTie,
  explicarGamesInvalido,
  explicarTieInvalido,
  gamesDoPerdedor,
  gamesDoVencedor,
  placarDoTie,
  placarDeGamesValido,
  pontosDoPerdedorNoTie,
  pontosDoVencedorNoTie,
  tieValido,
  lerRegra,
  type Modo,
  type Regra,
  type Tie,
} from '../lib/desempate'
import { ajusteDeEntrosamento, nivelDeForca, notaDeForca } from '../lib/forca'
import { OPCOES_DE_FASE, resumoDaFase } from '../lib/desempate'
import {
  CATEGORIAS,
  categoriaDe,
  confirmarPagamento,
  consumirAvulsos,
  situacaoDoAtleta,
  type Categoria,
} from '../lib/mensalidade'
import { computeStreaks, podiosDoDia, streakLevel, vagasDoPodio } from '../lib/streaks'
import { useWakeLock } from '../lib/wakelock'
import { useStore } from '../lib/store'
import {
  dateLabel,
  plural,
  todayISO,
  uid,
  type Match,
  type PlayFormat,
  type Player,
  type PlaySession,
} from '../lib/types'
import { RankTable } from './Ranking'

/** Os formatos, na ordem em que fazem sentido escolher. */
const FORMATOS: { valor: PlayFormat; rotulo: string; explica: string }[] = [
  {
    valor: 'todas',
    rotulo: '🔁 Todas com todas',
    explica: 'cada uma faz dupla com cada uma das outras, exatamente uma vez',
  },
  {
    valor: 'grupos-duplas',
    rotulo: '🤝 Grupos + duplas',
    explica: 'rodízio dentro do grupo, depois dupla fixa por colocação e mata-mata',
  },
  {
    valor: 'grupos',
    rotulo: '👥 Em grupos',
    explica: 'o mesmo rodízio dentro de cada grupo, e cada grupo tem o seu pódio',
  },
]

export default function Play({
  onToast,
  abrir,
  onAbriu,
}: {
  onToast: (m: string) => void
  abrir?: string | null
  onAbriu?: () => void
}) {
  const { data } = useStore()
  const [openId, setOpenId] = useState<string | null>(null)

  // veio da tela inicial pedindo para abrir um play especifico
  useEffect(() => {
    if (abrir) {
      setOpenId(abrir)
      onAbriu?.()
    }
  }, [abrir, onAbriu])
  const [creating, setCreating] = useState<Partial<PlaySession> | null>(null)

  const sessions = useMemo(
    () => [...data.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)),
    [data.sessions],
  )

  const open = sessions.find((s) => s.id === openId) ?? null

  if (creating) {
    return (
      <NewPlay
        preset={creating}
        onCancel={() => setCreating(null)}
        onCreated={(id) => { setCreating(null); setOpenId(id) }}
        onToast={onToast}
      />
    )
  }

  if (open) {
    return (
      <PlayDetail
        session={open}
        onBack={() => setOpenId(null)}
        onNext={(preset) => { setOpenId(null); setCreating(preset) }}
        onToast={onToast}
      />
    )
  }

  return <PlayList sessions={sessions} onOpen={setOpenId} onNew={() => setCreating({})} />
}

/* ------------------------------------------------------------------ lista */

function PlayList({
  sessions,
  onOpen,
  onNew,
}: {
  sessions: PlaySession[]
  onOpen: (id: string) => void
  onNew: () => void
}) {
  const { data, canEdit } = useStore()
  const [apagando, setApagando] = useState<PlaySession | null>(null)
  return (
    <>
      {canEdit && (
        <button className="btn pink block" style={{ marginBottom: 14 }} onClick={onNew}>
          🎾 Novo Play
        </button>
      )}
      <div className="card">
        <div className="section-title">📅 Plays</div>
        <AvisoDoBanco />
        {sessions.length === 0 ? (
          <Empty>Nenhum play ainda. Crie o primeiro e o app monta as duplas pra você.</Empty>
        ) : (
          <div className="stack">
            {sessions.map((s) => {
              const ms = data.matches.filter((m) => m.session_id === s.id)
              const done = ms.filter(isPlayed).length
              const grupos = s.groups?.length ?? 0
              return (
                <div key={s.id} className="row" style={{ borderBottom: '1px dashed var(--line)', paddingBottom: 10 }}>
                  <div className="grow" onClick={() => onOpen(s.id)} style={{ cursor: 'pointer', minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <strong className="ellipsis">{s.title}</strong>
                      <span className={`badge ${s.status}`}>{s.status === 'open' ? 'em andamento' : 'finalizado'}</span>
                      {s.ranked === false && <span className="badge avulso">avulso</span>}
                    </div>
                    <div className="tiny muted">
                      {dateLabel(s.date)} · {s.player_ids.length} jogadoras · {s.courts} quadras
                      {grupos > 1 && ` · ${grupos} grupos`} · {done}/{ms.length} partidas
                    </div>
                  </div>
                  <button className="btn ghost sm" onClick={() => onOpen(s.id)}>Abrir</button>
                  {canEdit && (
                    <button className="btn danger sm" onClick={() => setApagando(s)}>🗑</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      {apagando && <ConfirmarExclusao session={apagando} onClose={() => setApagando(null)} />}
    </>
  )
}

/**
 * Apagar um play tira os pontos das meninas do ranking do mes e pode derrubar
 * sequencias, entao nao basta um "ok": tem que escrever APAGAR.
 */
function ConfirmarExclusao({ session, onClose }: { session: PlaySession; onClose: () => void }) {
  const { data, nameOf, deleteSession } = useStore()
  const [texto, setTexto] = useState('')
  const PALAVRA = 'APAGAR'

  const jogadas = useMemo(
    () => playedMatches(data, { sessionId: session.id }),
    [data, session.id],
  )
  const perdas = useMemo(() => rankPlayers(computeStats(jogadas), nameOf), [jogadas, nameOf])
  const finalizado = session.status === 'finished'
  const avulso = session.ranked === false

  return (
    <Modal title="Apagar este play?" onClose={onClose}>
      <div className="banner err" style={{ marginTop: 0 }}>
        <strong>{session.title}</strong> — {dateLabel(session.date)}
        <br />
        Isso apaga <strong>{plural(jogadas.length, 'partida já jogada', 'partidas já jogadas')}</strong> e não tem como desfazer.
      </div>

      {perdas.length > 0 && (
        <>
          <p className="tiny muted" style={{ marginBottom: 6 }}>
            {avulso
              ? 'Este play é avulso, então nada sai do ranking do mês — mas estes pontos somem do histórico das jogadoras:'
              : 'Estes pontos saem do ranking do mês:'}
          </p>
          <div className="stack" style={{ marginBottom: 12 }}>
            {perdas.slice(0, 5).map((s) => (
              <div key={s.player_id} className="row tiny" style={{ gap: 8 }}>
                <span className="grow ellipsis">{nameOf(s.player_id)}</span>
                <strong style={{ color: 'var(--pink)' }}>−{s.points} pts</strong>
              </div>
            ))}
            {perdas.length > 5 && (
              <div className="tiny muted">e mais {plural(perdas.length - 5, 'jogadora')}.</div>
            )}
          </div>
        </>
      )}

      {finalizado && !avulso && (
        <div className="banner warn">
          🔥 Este play já foi finalizado. Apagar também <strong>refaz as sequências</strong>: quem
          subiu ao pódio nesse dia pode perder o status.
        </div>
      )}

      <label className="field">
        <span>Para confirmar, escreva {PALAVRA}</span>
        <input
          className="input"
          value={texto}
          autoCapitalize="characters"
          placeholder={PALAVRA}
          onChange={(e) => setTexto(e.target.value)}
        />
      </label>
      <button
        className="btn danger block"
        style={{ marginTop: 12 }}
        disabled={texto.trim().toUpperCase() !== PALAVRA}
        onClick={() => { void deleteSession(session.id); onClose() }}
      >
        🗑 Apagar o play e {plural(jogadas.length, 'o resultado', 'os resultados')}
      </button>
      <button className="btn ghost block sm" style={{ marginTop: 8 }} onClick={onClose}>
        Cancelar
      </button>
    </Modal>
  )
}

/* ------------------------------------------------------------- novo play */

function NewPlay({
  preset,
  onCancel,
  onCreated,
  onToast,
}: {
  preset: Partial<PlaySession>
  onCancel: () => void
  onCreated: (id: string) => void
  onToast: (m: string) => void
}) {
  const { data, saveSession, saveMatches, playerById, nameOf } = useStore()
  const [date, setDate] = useState(preset.date ?? todayISO())
  const [title, setTitle] = useState(preset.title ?? 'Play de Todas')
  const [courts, setCourts] = useState(preset.courts ?? 3)
  const [format, setFormat] = useState<PlayFormat>(preset.format ?? 'todas')
  const [porGrupo, setPorGrupo] = useState(8)
  /** Quantas duplas entram no mata-mata: 8 = 16 jogadoras, quartas de final. */
  const [duplasMM, setDuplasMM] = useState(8)
  /** Games que fecham a partida em cada fase: grupos, duplas, semi, final. */
  const [alvos, setAlvos] = useState<number[]>([4, 4, 4, 4])
  /** O desempate de cada fase, na mesma ordem. */
  const [desempates, setDesempates] = useState<string[]>(
    ['nenhum', 'nenhum', 'nenhum', 'nenhum'],
  )
  const [ranked, setRanked] = useState(preset.ranked ?? true)
  const [importando, setImportando] = useState(false)
  const [target, setTarget] = useState(preset.target ?? 4)
  const [regra, setRegra] = useState<Regra>(
    preset.desempate ? lerRegra(preset.desempate) : { ...REGRA_PADRAO },
  )
  const [selected, setSelected] = useState<string[]>(preset.player_ids ?? [])
  const [busy, setBusy] = useState(false)

  const available = [...data.players]
    .filter((p) => p.active || selected.includes(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  const forca = useMemo(() => ratings(data, date), [data, date])

  // no modo em grupos o app decide quantos grupos cabem: quem escolhe e o
  // tamanho, e a conta sai do numero de meninas que confirmaram
  const emDuplas = format === 'grupos-duplas'
  /**
   * A semente do sorteio entre as empatadas em forca.
   *
   * E semente, e nao sorteio a cada calculo, porque os grupos sao recalculados
   * a cada mudanca de dado -- um pagamento confirmado noutro celular ja basta
   * -- e as empatadas trocariam de grupo sozinhas na frente de quem organiza.
   * So o botao "sortear de novo" troca a semente.
   */
  const [sorteio, setSorteio] = useState(() => Math.floor(Math.random() * 2 ** 31))
  /**
   * AJUSTES NA MAO: quem foi movida e para qual grupo (indice).
   *
   * O app so conhece a forca de quem ja jogou; organizadora conhece o resto.
   * Os ajustes ficam por cima do sorteio e sobrevivem a marcar mais uma
   * presenca -- so um novo sorteio limpa tudo.
   */
  const [movidas, setMovidas] = useState<Record<string, number>>({})
  /** Quem esta selecionada para mudar de grupo. */
  const [movendo, setMovendo] = useState<string | null>(null)
  const gruposBase = useMemo(() => {
    if (selected.length < 8) return [selected]
    // no formato com fase 2 os grupos precisam ter a MESMA forca, senao ser 1a
    // vale mais num grupo do que no outro e a dupla da fase 2 fica injusta
    if (emDuplas) return gruposEquilibrados(selected, forca, porGrupo, sorteio)
    if (format === 'grupos') return formarGrupos(selected, forca, porGrupo, sorteio)
    return [selected]
  }, [format, emDuplas, selected, forca, porGrupo, sorteio])
  const grupos = useMemo(() => aplicarAjustesDeGrupo(gruposBase, movidas), [gruposBase, movidas])
  const tamanhos = grupos.map((g) => g.length)

  /** A forca media do grupo, na escala de 1500 -- a que aparece nas telas. */
  const mediaDeForca = (g: string[]) =>
    Math.round(g.reduce((t, id) => t + notaDeForca(forca.get(id) ?? 2), 0) / Math.max(1, g.length))

  /** A soma das notas -- cresce com o tamanho do grupo, entao so compara grupos do mesmo tamanho. */
  const somaDeForca = (g: string[]) =>
    g.reduce((t, id) => t + notaDeForca(forca.get(id) ?? 2), 0)

  function mover(id: string, para: number) {
    const de = grupos.findIndex((g) => g.includes(id))
    // um rodizio precisa de quatro: tirar a quarta deixaria o grupo sem partida
    if (de >= 0 && grupos[de].length <= 4) {
      onToast('O grupo ' + (de + 1) + ' ficaria com menos de 4 -- não dá para tirar ninguém dele')
      return
    }
    setMovidas((m) => ({ ...m, [id]: para }))
    setMovendo(null)
  }

  function sortearDeNovo() {
    setSorteio(Math.floor(Math.random() * 2 ** 31))
    setMovidas({})
    setMovendo(null)
  }

  // as quadras saem dos GRUPOS, nao do total: cada partida precisa de quatro do
  // mesmo grupo, entao dois grupos de 6 (12 meninas) enchem duas quadras e nao
  // tres, e sobram duas de cada grupo esperando
  const maxCourts = quadrasSimultaneas(tamanhos)
  const effCourts = Math.min(courts, maxCourts)
  /** O limite veio da divisao em grupos, e nao de faltar gente? */
  const travadoPorGrupo = grupos.length > 1 && maxCourts < Math.floor(selected.length / 4)

  const totalPartidas = tamanhos.reduce((t, n) => t + partidasDoRodizio(n), 0)
  const parceirasMin = Math.min(...tamanhos.map(parceirasDoRodizio))
  const parceirasMax = Math.max(...tamanhos.map(parceirasDoRodizio))
  // jogos e parceiras nao sao a mesma coisa: num grupo de 6 cada uma joga com
  // as outras 5 e ainda repete uma, entao sao 6 jogos para 5 parceiras
  /** A regra e o alvo que a fase de grupos vai usar: e dela que sai a estimativa de tempo. */
  const regraDaNoite = emDuplas ? lerRegra(desempates[0] ?? 'nenhum') : regra
  const minutosDaNoite = minutosDaPartida(emDuplas ? alvos[0] : target, regraDaNoite)
  const jogosMin = Math.min(...tamanhos.map(jogosDoRodizio))
  const jogosMax = Math.max(...tamanhos.map(jogosDoRodizio))
  const repetem = Math.max(...tamanhos.map(repeticoesPorJogadora))
  const restPorVez = selected.length - effCourts * 4

  /** Quem foi tocada mas esta devendo: abre o alerta que resolve na hora. */
  const [pendente, setPendente] = useState<Player | null>(null)
  /** Quem veio na lista colada mas nao pode entrar ainda. */
  const [barradas, setBarradas] = useState<string[]>([])

  /**
   * A lista colada passa pelo mesmo portao do toque na foto.
   *
   * Quem esta devendo nao entra escalada -- fica no aviso amarelo, com o mesmo
   * alerta que confirma o pagamento ou corrige a categoria. Escalar direto
   * seria o portao existir so para quem monta o play no dedo.
   */
  function aplicarLista(ids: string[]): number {
    const liberadas: string[] = []
    const devendo: string[] = []
    for (const id of ids) {
      const p = data.players.find((x) => x.id === id)
      if (p && !situacaoDoAtleta(p, data).liberado) devendo.push(id)
      else liberadas.push(id)
    }
    setSelected(liberadas)
    setBarradas(devendo)
    return liberadas.length
  }

  /** Resolveu o cadastro: sai do aviso e entra no play. */
  function liberar(p: Player) {
    setBarradas((cur) => cur.filter((id) => id !== p.id))
    setSelected((cur) => (cur.includes(p.id) ? cur : [...cur, p.id]))
  }

  /** "Todas" tambem respeita o cadastro: entra quem esta liberada. */
  function selecionarTodas() {
    setSelected(available.filter((p) => situacaoDoAtleta(p, data).liberado).map((p) => p.id))
  }

  function toggle(id: string) {
    const jogadora = data.players.find((p) => p.id === id)
    const jaEscolhida = selected.includes(id)
    // desmarcar nunca pede nada; so entrar no play exige cadastro em dia
    if (!jaEscolhida && jogadora && !situacaoDoAtleta(jogadora, data).liberado) {
      setPendente(jogadora)
      return
    }
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  async function create() {
    if (grupos.length > 1 && tamanhos.some((t) => t < 4)) {
      onToast('Todo grupo precisa de pelo menos 4 -- ajuste os grupos antes de gerar')
      return
    }
    if (selected.length < 4) {
      onToast('Precisa de pelo menos 4 jogadoras')
      return
    }
    setBusy(true)
    try {
      const emGrupos = (format === 'grupos' || emDuplas) && grupos.length > 1
      const fila = gerarFila({
        playerIds: selected,
        ratings: forca,
        history: buildHistory(playedMatches(data)),
        groups: emGrupos ? grupos : undefined,
      })
      const session: PlaySession = {
        id: uid(),
        date,
        title: title.trim() || 'Play de Todas',
        courts: effCourts,
        rounds: fila.length, // a coluna se chama rounds; hoje e o total de partidas
        target,
        desempate: escreverRegra(regra),
        // o tie sempre vai a 2; a coluna fica no banco so por compatibilidade
        desempate_vai2: true,
        player_ids: selected,
        status: 'open',
        created_at: new Date().toISOString(),
        format: emGrupos ? (emDuplas ? 'grupos-duplas' : 'grupos') : 'todas',
        groups: emGrupos ? grupos : null,
        duplas_mm: emGrupos && emDuplas ? duplasMM : null,
        alvos: emGrupos && emDuplas ? alvos : null,
        desempates: emGrupos && emDuplas ? desempates : null,
        ranked,
      }
      await saveSession(session)
      await saveMatches(planToMatches(session.id, fila))
      onToast('Partidas geradas! 🎾')
      onCreated(session.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card">
        <div className="row spread">
          <div className="section-title" style={{ margin: 0 }}>🎾 Novo Play</div>
          <button className="btn ghost sm" onClick={onCancel}>Cancelar</button>
        </div>
        <div className="row spread">
          <div className="section-title nowrap" style={{ margin: 0 }}>
            👯 Quem joga ({selected.length})
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn ghost sm" onClick={selecionarTodas}>Todas</button>
            <button className="btn ghost sm" onClick={() => setSelected([])}>Limpar</button>
          </div>
        </div>
        <button className="btn purple block sm" style={{ marginTop: 10 }} onClick={() => setImportando(true)}>
          📋 Colar lista de confirmação do grupo
        </button>

        {barradas.length > 0 && (
          <div className="banner warn" style={{ marginTop: 10 }}>
            <strong>
              {barradas.length === 1
                ? '1 da lista ficou de fora'
                : `${barradas.length} da lista ficaram de fora`}
            </strong>{' '}
            — cadastro a acertar. Toque no nome para confirmar o pagamento ou trocar a categoria.
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
              {barradas.map((id) => {
                const p = data.players.find((x) => x.id === id)
                if (!p) return null
                const sit = situacaoDoAtleta(p, data)
                return (
                  <button
                    key={id}
                    className="chip off"
                    style={{ borderColor: 'var(--danger)' }}
                    title={sit.rotulo}
                    onClick={() => setPendente(p)}
                  >
                    <Avatar player={playerById(p.id)} size={20} />
                    {p.nickname?.trim() || p.name}
                    <span style={{ color: 'var(--danger)' }}>●</span>
                  </button>
                )
              })}
            </div>
            <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setBarradas([])}>
              Deixar todas de fora deste play
            </button>
          </div>
        )}

        {available.length === 0 ? (
          <Empty icon="👯">
            Cadastre as jogadoras na aba <strong>Meninas</strong> — ou cole a lista do grupo no botão acima.
          </Empty>
        ) : (
          <div className="grade-atletas">
            {available.map((p) => {
              const on = selected.includes(p.id)
              const sit = situacaoDoAtleta(p, data)
              return (
                <button
                  key={p.id}
                  className={`chip ${on ? 'on' : 'off'}`}
                  style={!on && !sit.liberado ? { borderColor: 'var(--danger)', opacity: 0.65 } : undefined}
                  title={sit.liberado ? sit.rotulo : `${sit.rotulo} — toque para resolver`}
                  onClick={() => toggle(p.id)}
                >
                  <Avatar player={playerById(p.id)} size={22} />
                  <span className="nome-atleta">{p.nickname?.trim() || p.name}</span>
                  {!sit.liberado && <span style={{ color: 'var(--danger)' }}>●</span>}
                  {sit.alerta && <span title={sit.alerta}>⚠️</span>}
                </button>
              )
            })}
          </div>
        )}

        {selected.length >= 4 && (
          <div className="banner info" style={{ marginTop: 14, marginBottom: 0 }}>
            Com <strong>{selected.length} jogadoras</strong> dá para usar <strong>{plural(effCourts, 'quadra')}</strong> ao mesmo tempo
            {restPorVez > 0
              ? ` (${restPorVez} esperam a vez${grupos.length > 1 ? ', revezando dentro do próprio grupo' : ''}, e entra sempre quem está fora há mais tempo)`
              : ' (todas jogam ao mesmo tempo)'}.
            {effCourts < courts && ' Ajustei o número de quadras para caber todo mundo.'}
            <br />
            Para equilibrar as duplas e dividir os grupos, o app não usa o ranking do mês:
            usa uma nota própria em que <strong>vencer quem está jogando melhor vale mais</strong>{' '}
            do que vencer quem está jogando pior. Ela se atualiza a cada partida, então quem
            está em alta sobe de grupo sozinha — e a virada do mês não desequilibra nada.
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">🎾 Formato do play</div>
        <div className="stack" style={{ gap: 8 }}>
          {FORMATOS.map((f) => (
            <button
              key={f.valor}
              className={`opcao${format === f.valor ? ' on' : ''}`}
              onClick={() => {
                // o grupos+duplas e jogado em grupos de 4; nos outros o grupo
                // grande e que faz sentido, por isso o padrao muda junto
                if (f.valor === 'grupos-duplas' && !emDuplas) setPorGrupo(4)
                if (f.valor === 'grupos' && emDuplas) setPorGrupo(8)
                setFormat(f.valor)
              }}
            >
              <span className="opcao-marca">{format === f.valor ? '◉' : '○'}</span>
              <span className="grow" style={{ minWidth: 0 }}>
                <strong>{f.rotulo}</strong>
                <span className="tiny muted">{f.explica}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section-title">⚙️ Detalhes do play</div>
        <div className="stack" style={{ marginTop: 12 }}>
          <label className="field">
            <span>Nome do play</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="grid2">
            <label className="field">
              <span>Data</span>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <div className="field">
              <span>Quadras</span>
              <Stepper value={courts} min={1} max={12} onChange={setCourts} />
              <em className={`hint${selected.length >= 4 && effCourts < courts ? ' aviso' : ''}`}>
                {selected.length < 4
                  ? 'cada quadra comporta 4 meninas por vez'
                  : effCourts < courts
                    ? `só dá para usar ${effCourts}`
                    : 'quadras disponíveis hoje'}
              </em>
            </div>
          </div>

          {!emDuplas && (
            <div className="field">
              <span>Vai até</span>
              <Stepper value={target} min={1} max={21} onChange={setTarget} />
              <em className="hint">games para vencer a partida — o padrão é 4</em>
            </div>
          )}

          {!emDuplas && (
          <div className="field">
            <span>No {target - 1}x{target - 1}</span>
            <div className="row wrap" style={{ gap: 6 }}>
              {MODOS.map((d) => (
                <button
                  key={d.valor}
                  className={`chip ${regra.modo === d.valor ? 'on' : 'off'}`}
                  style={{ flex: 'none' }}
                  onClick={() => setRegra((r) => ({ ...r, modo: d.valor as Modo }))}
                >
                  {d.rotulo}
                </button>
              ))}
            </div>

            {/* o tamanho do tie so importa quando existe tie */}
            {regra.modo === 'vantagem-tie' && (
              <>
                <span style={{ marginTop: 12 }}>O tie do {target}x{target} é de</span>
                <div className="row wrap" style={{ gap: 6 }}>
                  {TIES.map((d) => (
                    <button
                      key={d.valor}
                      className={`chip ${regra.tie === d.valor ? 'on' : 'off'}`}
                      style={{ flex: 'none' }}
                      onClick={() => setRegra((r) => ({ ...r, tie: d.valor as Tie }))}
                    >
                      {d.rotulo}
                    </button>
                  ))}
                </div>
              </>
            )}

            <em className="hint" style={{ marginTop: 6 }}>{explicarRegra(target, regra)}</em>
          </div>
          )}

          {emDuplas && grupos.length > 1 && (
            <div className="toggle-card">
              <div className="field">
                <span>Games e desempate, por fase</span>
                <div className="stack" style={{ gap: 8 }}>
                  {['Grupos', 'Duplas fixas', 'Semifinal', 'Final'].map((rotulo, i) => (
                    <div key={rotulo} className="fase-box">
                      <span className="fase-nome">{rotulo}</span>
                      <Stepper
                        value={alvos[i]}
                        min={2}
                        max={12}
                        onChange={(v) => setAlvos((a) => a.map((x, k) => (k === i ? v : x)))}
                      />
                      <select
                        className="select"
                        style={{ marginTop: 6 }}
                        value={desempates[i] ?? 'nenhum'}
                        onChange={(e) =>
                          setDesempates((d) => d.map((x, k) => (k === i ? e.target.value : x)))
                        }
                      >
                        {OPCOES_DE_FASE.map((op) => (
                          <option key={op.valor} value={op.valor}>{op.rotulo}</option>
                        ))}
                      </select>
                      <em className="hint" style={{ marginTop: 4 }}>
                        {resumoDaFase(alvos[i], desempates[i] ?? 'nenhum')}
                      </em>
                    </div>
                  ))}
                </div>
                <em className="hint">
                  Cada fase fecha do seu jeito: os grupos podem ir no 4 seco e a final ir a 2 —
                  é o jogo que decide o dia.
                </em>
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <span>Duplas no mata-mata</span>
                <Stepper value={duplasMM} min={2} max={16} onChange={setDuplasMM} />
                <em className="hint">{descreverFase2(grupos, duplasMM)}</em>
              </div>
            </div>
          )}

          <div className={`toggle-card${ranked ? '' : ' avulso'}`}>
            <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} />
              <span className="grow">
                <strong>{ranked ? '🏆 Vale para o campeonato' : '🎈 Play avulso'}</strong>
                <span className="hint" style={{ marginTop: 2 }}>
                  {ranked
                    ? 'os pontos entram no ranking do mês e as sequências 🔥 correm normalmente'
                    : 'não soma pontos no ranking do mês e não mexe nas sequências 🔥 — mas conta no histórico da jogadora e no equilíbrio das duplas dos próximos plays'}
                </span>
              </span>
            </label>
          </div>

          {(format === 'grupos' || emDuplas) && (
            <div className="toggle-card">
              <div className="field" style={{ marginBottom: 0 }}>
                <span>Meninas por grupo</span>
                <Stepper value={porGrupo} min={4} max={12} onChange={setPorGrupo} />
                <em className="hint">
                  {selected.length < 8
                    ? 'com menos de 8 confirmadas não dá para dividir: vai sair um grupo só'
                    : `com ${selected.length} confirmadas o app monta ${descreverGrupos(tamanhos)} — ${
                        emDuplas
                          ? 'todos com a mesma força média, para ser 1ª valer o mesmo em qualquer grupo'
                          : 'grupo 1 com quem está jogando melhor'
                      }`}
                </em>
                {selected.length >= 8 && (
                  <>
                    <em className="hint" style={{ marginTop: 4 }}>
                      🔥 Cada grupo tem o seu pódio, e quem sobe segura a sequência:{' '}
                      <strong>{descreverPodios(tamanhos)}</strong>. Grupos menores deixam o status
                      fácil demais.
                    </em>
                    <em className="hint" style={{ marginTop: 4 }}>
                      🪑 {descreverFolga(tamanhos)}
                    </em>
                  </>
                )}
              </div>
            </div>
          )}

          {selected.length >= 4 && (
            <div className="banner info" style={{ marginTop: 8, marginBottom: 8 }}>
              🎾 Cada menina joga{' '}
              <strong>
                {jogosMin === jogosMax ? `${jogosMin} partidas` : `${jogosMin} a ${jogosMax} partidas`}
              </strong>{' '}
              esta noite — {totalPartidas} no total, em {effCourts}{' '}
              {effCourts === 1 ? 'quadra' : 'quadras'}: uns{' '}
              <strong>{duracaoEstimada(totalPartidas, effCourts, minutosDaNoite)}</strong>{' '}
              a uns {Math.round(minutosDaNoite)} min por partida, contando os games de quem perde
              {regraDaNoite.modo === 'alvo' ? '' : ' e o desempate'}.
            </div>
          )}
          <p className="tiny muted" style={{ margin: '2px 2px 0' }}>
            {selected.length < 4 ? (
              'Escolha as jogadoras abaixo para o app calcular as partidas.'
            ) : (
              <>
                <strong>{totalPartidas} partidas</strong> no total, entrando conforme as quadras vagam.
                Cada uma faz dupla com{' '}
                <strong>
                  {parceirasMin === parceirasMax
                    ? `as outras ${parceirasMin}`
                    : `${parceirasMin} a ${parceirasMax} parceiras`}
                </strong>
                , exatamente uma vez com cada, e joga{' '}
                <strong>
                  {jogosMin === jogosMax ? `${jogosMin} partidas` : `${jogosMin} a ${jogosMax} partidas`}
                </strong>{' '}
                — o mesmo tanto para todas.
                {repetem > 0 && (
                  <>
                    {' '}
                    Como as duplas não fecham em partidas inteiras, cada uma repete{' '}
                    <strong>{repetem === 1 ? '1 parceira' : `${repetem} parceiras`}</strong> — a
                    mesma quantidade para todas, para ninguém jogar a mais que as outras.
                  </>
                )}
              </>
            )}{' '}
            Quem vence leva <strong>os games que fez menos os da adversária</strong> em pontos
            (mínimo 1), e quem perde não pontua.
          </p>

          {selected.length >= 4 && effCourts < courts && travadoPorGrupo && (
            <div className="banner err" style={{ margin: '10px 0 0' }}>
              🏐 <strong>Não dá para usar {courts} quadras com {descreverGrupos(tamanhos)}.</strong>{' '}
              Cada partida precisa de <strong>quatro meninas do mesmo grupo</strong>, então um grupo
              de {Math.min(...tamanhos)} só enche{' '}
              {Math.floor(Math.min(...tamanhos) / 4) === 1
                ? 'uma quadra'
                : `${Math.floor(Math.min(...tamanhos) / 4)} quadras`}{' '}
              por vez — mesmo tendo {selected.length} jogadoras no total.
              <br />
              Vou montar o play com <strong>{plural(effCourts, 'quadra')}</strong>, e{' '}
              <strong>{restPorVez} ficam de fora</strong> por vez, revezando dentro do próprio
              grupo. Um grupo precisa de <strong>8 meninas para alimentar 2 quadras</strong>, 12
              para 3, e assim por diante — então, para usar as {courts}, aumente o tamanho do grupo.
            </div>
          )}

          {selected.length >= 4 && effCourts < courts && !travadoPorGrupo && (
            <div className="banner err" style={{ margin: '10px 0 0' }}>
              🏐 <strong>Não dá para usar {courts} quadras com {selected.length} jogadoras.</strong>{' '}
              Cada quadra ocupa 4 meninas ao mesmo tempo, então {courts} quadras precisam de{' '}
              <strong>{courts * 4} jogadoras</strong> jogando juntas —{' '}
              {courts * 4 - selected.length === 1
                ? 'falta 1 jogadora'
                : `faltam ${courts * 4 - selected.length} jogadoras`}.
              <br />
              Vou montar o play com <strong>{plural(effCourts, 'quadra')}</strong>
              {restPorVez > 0 && <>, revezando quem fica de fora</>}.
            </div>
          )}

          {selected.length >= 4 && effCourts === courts && restPorVez === 0 && (
            <div className="banner warn" style={{ margin: '10px 0 0' }}>
              🪑 Com <strong>{selected.length} jogadoras em {plural(effCourts, 'quadra')}</strong> todas
              jogam ao mesmo tempo e <strong>ninguém fica de fora</strong> — nem para descansar.
              <br />
              {/* o motivo muda conforme o grupo alimenta uma quadra ou varias:
                  com grupos de 4 cada grupo fica na sua quadra e nao espera
                  ninguem, so nao para de jogar */}
              {grupos.length > 1 && tamanhos.every((t) => t === 4) ? (
                <>
                  Num grupo de 4 <strong>não existe revezamento</strong>: são sempre as mesmas quatro
                  meninas, jogando as 3 partidas do grupo uma atrás da outra. Cada grupo fica na sua
                  quadra, então ninguém espera — mas ninguém respira também.
                </>
              ) : effCourts === 1 ? (
                <>
                  São sempre as mesmas quatro, jogando uma partida atrás da outra até o rodízio
                  acabar.
                </>
              ) : (
                <>
                  E as quadras nunca terminam juntas: a que acabar primeiro vai esperar, porque as
                  quatro meninas da próxima partida ainda estão jogando.
                </>
              )}
              <br />
              {grupos.length > 1 ? (
                <>
                  <strong>Grupos de 5, 9 ou 13</strong> são os melhores dos dois mundos: todas jogam
                  o mesmo tanto, nenhuma dupla repete, e sempre sobra alguém para entrar no lugar de
                  quem acabou de sair. Usar uma quadra a menos também resolve.
                </>
              ) : (
                <>
                  Com pelo menos <strong>4 de folga</strong> ({effCourts * 4 + 4} jogadoras para{' '}
                  {effCourts} quadras) o rodízio anda sozinho e todo mundo descansa entre um jogo e
                  outro.
                </>
              )}
            </div>
          )}

          {format === 'todas' && totalPartidas > 40 && (
            <div className="banner warn" style={{ margin: '10px 0 0' }}>
              ⏱️ São <strong>{totalPartidas} partidas</strong> e cada uma joga {jogosMax} vezes —
              pode ser longo para uma noite só. O modo <strong>em grupos</strong> resolve isso:
              com grupos de 8 cada menina joga 7 partidas.
            </div>
          )}

          {(format === 'grupos' || emDuplas) && grupos.length > 1 && (
            <div className="stack" style={{ marginTop: 4 }}>
              {grupos.map((g, i) => (
                <div key={i} className={`grupo-box ${classeDoGrupo(i + 1)}`}>
                  <div className="grupo-nome">
                    Grupo {i + 1} · {g.length} meninas · {partidasDoRodizio(g.length)} partidas
                  </div>
                  <div className="tiny muted" style={{ marginBottom: 6 }}>
                    💪 força média <strong>{mediaDeForca(g)}</strong>
                    {' · '}
                    {nivelDeForca(mediaDeForca(g)).emoji} {nivelDeForca(mediaDeForca(g)).titulo}
                    {' · '}
                    total <strong>{somaDeForca(g)}</strong>
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {g.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={`chip ${movendo === id ? 'on' : ''}`}
                        onClick={() => setMovendo(movendo === id ? null : id)}
                      >
                        {nameOf(id)}
                        <span className="tiny muted" style={{ fontWeight: 600 }}>
                          {notaDeForca(forca.get(id) ?? 2)}
                        </span>
                        {id in movidas ? ' ✏️' : ''}
                      </button>
                    ))}
                  </div>
                  {movendo && !g.includes(movendo) && (
                    <button
                      type="button"
                      className="btn ghost sm block"
                      style={{ marginTop: 8 }}
                      onClick={() => mover(movendo, i)}
                    >
                      ↪️ Mover {nameOf(movendo)} para o grupo {i + 1}
                    </button>
                  )}
                </div>
              ))}
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn ghost sm grow" onClick={sortearDeNovo}>
                  🎲 Sortear de novo
                </button>
                {Object.keys(movidas).length > 0 && (
                  <button type="button" className="btn ghost sm grow" onClick={() => setMovidas({})}>
                    ↩️ Desfazer ajustes
                  </button>
                )}
              </div>
              <em className="hint">
                Toque numa menina e escolha o grupo para onde ela vai. Quem já jogou entra pela
                força; quem está empatada (as estreantes) é sorteada, e cada “sortear de
                novo” muda esse sorteio.
              </em>
            </div>
          )}
        </div>
      </div>


      {pendente && (
        <ResolverCadastro
          jogadora={pendente}
          onClose={() => setPendente(null)}
          onLiberada={(p) => {
            setPendente(null)
            liberar(p)
          }}
        />
      )}

      {importando && (
        <ImportarLista
          onAplicar={aplicarLista}
          onClose={() => setImportando(false)}
          onToast={onToast}
        />
      )}

      <button className="btn pink block" disabled={selected.length < 4 || busy} onClick={() => void create()}>
        {busy ? 'Montando as duplas…' : `✨ Gerar ${totalPartidas || ''} partidas e começar`}
      </button>
    </>
  )
}

/**
 * Quanto dura um GAME, em media, em quadra. E a calibragem: uma partida ate
 * 4 leva uns 15 min, e ela tem em media 5,5 games (os 4 de quem ganha mais
 * uns 1,5 de quem perde) -- 15 / 5,5.
 */
const MINUTOS_POR_GAME = 15 / 5.5

/**
 * Quanto dura uma partida, em media, contando os games dos DOIS lados: quem
 * perde tambem joga, e um 6x5 e bem mais longo que um 6x0. Quem perde faz,
 * na media, metade do que podia (alvo - 1) / 2. O modo de desempate estica:
 * "so vai a 2" costuma render um game a mais, e o tie vale uns 1,5 (de 7) ou
 * 2 (de 10) games de tempo quando acontece.
 */
function minutosDaPartida(alvo: number, r: Regra): number {
  const doDesempate = r.modo === 'alvo' ? 0 : r.modo === 'vantagem' ? 1 : r.tie === 10 ? 2 : 1.5
  const games = alvo + (alvo - 1) / 2 + doDesempate
  return games * MINUTOS_POR_GAME
}

/**
 * "2h15" para a noite: rodadas de quadra cheia, cada uma durando o que uma
 * partida daquelas dura. Mais quadras, menos rodadas; alvo maior ou desempate
 * mais longo, rodada mais longa.
 */
function duracaoEstimada(partidas: number, quadras: number, minutosPorPartida: number): string {
  const min = Math.ceil(partidas / Math.max(1, quadras)) * Math.round(minutosPorPartida)
  const h = Math.floor(min / 60)
  const m = min % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

/** "2 grupos de 8" quando dao certo, "3 grupos: 7, 7 e 6" quando nao. */
function descreverGrupos(tamanhos: number[]): string {
  const n = tamanhos.length
  if (n === 1) return `1 grupo de ${tamanhos[0]}`
  if (tamanhos.every((t) => t === tamanhos[0])) return `${n} grupos de ${tamanhos[0]}`
  const lista = tamanhos.slice(0, -1).join(', ') + ' e ' + tamanhos[n - 1]
  return `${n} grupos: ${lista}`
}

/** Quantas de cada grupo ficam de fora por vez — 0 quer dizer sem descanso. */
function descreverFolga(tamanhos: number[]): string {
  const folgas = tamanhos.map((t) => t % 4)
  if (folgas.every((f) => f === 0)) {
    const t = Math.min(...tamanhos)
    return t === 4
      ? 'Grupos de 4 não revezam: as mesmas quatro jogam tudo, uma partida atrás da outra.'
      : 'Nenhum grupo tem folga: quem termina já volta, sem descanso entre as partidas.'
  }
  const min = Math.min(...folgas)
  const max = Math.max(...folgas)
  const quantas = min === max ? `${min}` : `${min} a ${max}`
  const verbo = max === 1 ? 'fica' : 'ficam'
  return `${quantas} de cada grupo ${verbo} de fora por vez, revezando — é o que dá descanso entre as partidas.`
}

/** "3 de cada 8 (38%)" — o quanto o pódio do grupo é disputado. */
function descreverPodios(tamanhos: number[]): string {
  const vagas = tamanhos.map(vagasDoPodio)
  const total = vagas.reduce((t, v) => t + v, 0)
  const jogadoras = tamanhos.reduce((t, v) => t + v, 0)
  const chance = Math.round((100 * total) / jogadoras)
  const iguais = tamanhos.every((t) => t === tamanhos[0])
  const detalhe = iguais ? `${vagas[0]} de cada ${tamanhos[0]}` : `${total} das ${jogadoras}`
  return `${detalhe} (${chance}%)`
}

/** Devolve a partida com uma jogadora trocada por outra. */
function trocarNaPartida(m: Match, sai: string, entra: string): Match {
  const troca = (id: string) => (id === sai ? entra : id)
  return {
    ...m,
    team_a: m.team_a.map(troca) as [string, string],
    team_b: m.team_b.map(troca) as [string, string],
  }
}

/* ------------------------------------------------------------- detalhe */

function PlayDetail({
  session,
  onBack,
  onNext,
  onToast,
}: {
  session: PlaySession
  onBack: () => void
  onNext: (preset: Partial<PlaySession>) => void
  onToast: (m: string) => void
}) {
  const { data, nameOf, playerById, canEdit, saveMatches, savePlayer, saveSession, replaceSessionMatches } =
    useStore()
  const [showRank, setShowRank] = useState(false)
  const [substituindo, setSubstituindo] = useState(false)
  const [arte, setArte] = useState<{ url: string; blob: Blob } | null>(null)
  const [gerando, setGerando] = useState(false)
  /** Partida escolhida na mao para uma quadra, no lugar da sugestao. */
  const [manuais, setManuais] = useState<Record<number, string>>({})
  const [escolhendo, setEscolhendo] = useState<number | null>(null)
  const [corrigindo, setCorrigindo] = useState<Match | null>(null)
  /** A regra do empate deste play. Plays antigos nao tem: e `nenhum`. */
  const regraDoPlay = lerRegra(session.desempate)

  const matches = useMemo(
    () =>
      data.matches
        .filter((m) => m.session_id === session.id)
        .sort((a, b) => a.round - b.round || a.court - b.court),
    [data.matches, session.id],
  )

  const soFase2 = session.format === 'grupos-duplas'

  /**
   * Quantos pontos fecham ESTA partida.
   *
   * Os quatro alvos configurados sao grupos / duplas / semifinal / final. No
   * mata-mata o numero da fase nao serve de indice -- com 20 jogadoras ha uma
   * rodada preliminar, e ai a semifinal cai na fase 4 e nao na 3. O que
   * identifica a rodada e QUANTOS JOGOS ela tem: 1 e a final, 2 e a semifinal.
   */
  /** So as partidas que valem no grupos+duplas: da fase 2 em diante. */
  const partidasDaFase2 = useMemo(
    () => matches.filter((m) => (m.fase ?? 1) >= 2 && isPlayed(m)),
    [matches],
  )

  /**
   * A regra do empate desta partida.
   *
   * No grupos+duplas cada fase tem a sua (`session.desempates`), pela mesma
   * conta do `alvoDe`. Nos outros formatos, e nos plays antigos, vale o
   * `desempate` unico do play.
   */
  /** O nome da rodada da partida (Final, Semifinal, Quartas de final...). */
  const rodadaDe = (m: Match): string => {
    const fase = m.fase ?? 1
    const entraram = duplasQueEntraram(session.duos ?? [], matches, fase)
    if (entraram > 0) return nomeDaRodada(entraram)
    // sem as duplas gravadas (play antigo) sobra contar os jogos da fase
    const jogos = matches.filter((x) => (x.fase ?? 1) === fase && !x.disputa_3o).length
    return jogos === 1 ? 'Final' : jogos === 2 ? 'Semifinal' : nomeDaRodada(jogos * 2)
  }

  /** Qual dos quatro alvos/desempates vale para a partida: 0 grupos, 1 duplas, 2 semi, 3 final. */
  const degrauDe = (m: Match): 0 | 1 | 2 | 3 => {
    if ((m.fase ?? 1) === 1) return 0
    const nome = rodadaDe(m)
    return nome === 'Final' ? 3 : nome === 'Semifinal' ? 2 : 1
  }

  const regraDe = (m: Match): Regra => {
    const lista = session.desempates
    if (!lista?.length) return lerRegra(session.desempate)
    return lerRegra(lista[degrauDe(m)])
  }

  /**
   * Que rodada do mata-mata e esta partida, para a quadra dizer.
   *
   * Sai do numero de jogos da fase, como o alvo -- e a disputa de 3o tem
   * nome proprio, senao ela apareceria como "final" por dividir a fase.
   */
  const rotuloDaPartida = (m: Match): string => {
    if (!soFase2 || (m.fase ?? 1) < 2) return ''
    if (m.disputa_3o) return '🥉 3º lugar'
    const nome = rodadaDe(m)
    return nome === 'Final' ? '🏆 Final' : nome.replace(' de final', '')
  }

  const alvoDe = (m: Match) => {
    const alvos = session.alvos
    if (!alvos?.length) return session.target
    return alvos[degrauDe(m)] ?? session.target
  }

  const daFase1 = useMemo(() => matches.filter((m) => (m.fase ?? 1) === 1), [matches])
  const daFase2 = useMemo(() => matches.filter((m) => (m.fase ?? 1) === 2), [matches])
  /** Todas as partidas do mata-mata (fase 2 em diante), por rodada. */
  const doMataMata = useMemo(() => matches.filter((m) => (m.fase ?? 1) >= 2), [matches])
  const ultimaFase = doMataMata.reduce((t, m) => Math.max(t, m.fase ?? 1), 1)
  // a disputa de 3o fica de fora: ela nao gera proxima rodada nem decide
  // quem segue vivo na chave
  const daUltimaRodada = doMataMata.filter(
    (m) => (m.fase ?? 1) === ultimaFase && !m.disputa_3o,
  )
  /** Quem ainda nao perdeu. Uma dupla so = ja tem campea. */
  const vivas = useMemo(
    () => (session.duos?.length ? duplasVivas(session.duos, doMataMata) : []),
    [session.duos, doMataMata],
  )
  /** A fase 1 acabou e a 2 ainda nao nasceu: e a hora de formar as duplas. */
  const podeGerarFase2 =
    soFase2 && daFase2.length === 0 && daFase1.length > 0 && daFase1.every(isPlayed)
  /** A rodada atual acabou e ainda ha mais de uma dupla viva. */
  const podeGerarRodada =
    soFase2 &&
    daFase2.length > 0 &&
    daUltimaRodada.length > 0 &&
    daUltimaRodada.every(isPlayed) &&
    vivas.length > 1
  const rotuloDaProxima = vivas.length > 1 ? nomeDaRodada(vivas.length) : ''
  /**
   * QUEM JÁ PASSOU, ENQUANTO A RODADA AINDA CORRE
   *
   * Com bye ou com a partida já lançada, a dupla está classificada e
   * ninguém precisa esperar o resto da rodada para saber -- nem ela, que quer
   * saber se dá tempo de ir tomar água, nem quem ainda joga, que quer saber
   * quem está esperando do outro lado.
   *
   * Some quando a rodada fecha (aí o cartão de montar a próxima assume) e na
   * final, que não tem próxima.
   */
  const jaClassificadas = useMemo(() => {
    if (!soFase2 || !session.duos?.length || !daUltimaRodada.length) return null
    const chave = (d: readonly string[]) => [...d].sort().join('|')
    const jogando = new Set<string>()
    for (const m of daUltimaRodada) {
      if (isPlayed(m)) continue
      jogando.add(chave(m.team_a))
      jogando.add(chave(m.team_b))
    }
    // rodada inteira lançada: quem avisa aí é o cartão da próxima fase
    if (!jogando.size) return null
    const passaram = vivas.filter((d) => !jogando.has(chave(d)))
    if (!passaram.length) return null
    // quantas entraram nesta rodada = as vivas mais as já eliminadas nela
    const entraram = vivas.length + daUltimaRodada.filter(isPlayed).length
    const restarao = entraram - daUltimaRodada.length
    if (restarao <= 1) return null
    const nome = nomeDaRodada(restarao).toLowerCase()
    return {
      duplas: passaram,
      onde: /^(quartas|oitavas)/.test(nome) ? `nas ${nome}` : `na ${nome}`,
    }
  }, [soFase2, session.duos, daUltimaRodada, vivas])

  /** Ha um proximo passo obrigatorio antes de encerrar o play? */
  const faltaFase = podeGerarFase2 || podeGerarRodada

  /** Os pontos que o bye pagou neste play (so existe no grupos+duplas). */
  const byeDoDia = useMemo(
    () => pontosDeBye([session], matches),
    [session, matches],
  )

  /** O podio do mata-mata, quando o play foi em grupos+duplas. */
  const duplasDoDia = useMemo(
    () =>
      soFase2
        ? rankDuplasDoDia(partidasDaFase2, nameOf, byeDoDia.porDupla, session.duos ?? undefined)
        : [],
    [soFase2, partidasDaFase2, nameOf, byeDoDia, session.duos],
  )

  const dayRows = useMemo(() => {
    const todas = playedMatches(data, { sessionId: session.id })
    // a fase de grupos so serviu para formar as duplas; da fase 2 em diante conta
    const ms = soFase2 ? todas.filter((m) => (m.fase ?? 1) >= 2) : todas
    return rankPlayers(aplicarBye(computeStats(ms), byeDoDia.porJogadora), nameOf)
  }, [data, session.id, nameOf, soFase2])

  /**
   * Como o dia e dividido para o podio.
   *
   * No formato com fase 2 nao ha divisao: os grupos ja se misturaram no
   * mata-mata, e o podio do dia e um so, pela campanha de cada uma da fase 2
   * em diante. Nos outros formatos continua sendo o grupo.
   */
  const podios = useMemo(
    () => podiosDoDia(dayRows, soFase2 ? null : session.groups),
    [dayRows, session.groups, soFase2],
  )

  /**
   * QUEM JA PODE IR EMBORA
   *
   * Nao basta "nao tem partida marcada": no grupos+duplas, entre o fim da
   * fase de grupos e a formacao das duplas todo mundo fica sem partida, e
   * ninguem esta liberada -- a proxima rodada ainda vai nascer.
   *
   * Entao sao duas condicoes: nenhuma partida sem placar, E nao seguir viva
   * na chave (nos outros formatos a fila ja nasce inteira, entao a primeira
   * condicao basta).
   */
  const jaPodemIr = useMemo(() => {
    // play encerrado nao libera ninguem: a noite acabou para todo mundo, e o
    // aviso viraria a lista inteira de quem jogou
    if (session.status === 'finished') return []
    const comJogo = new Set<string>()
    for (const m of matches) {
      if (isPlayed(m)) continue
      for (const id of jogadorasDaPartida(m)) comJogo.add(id)
    }
    if (soFase2) {
      // sem as duplas formadas, a fase 2 ainda vai escolher quem fica
      if (!session.duos?.length) return []
      const vivasAgora = new Set(vivas.flat())
      return session.player_ids.filter((id) => !comJogo.has(id) && !vivasAgora.has(id))
    }
    return session.player_ids.filter((id) => !comJogo.has(id))
  }, [matches, soFase2, session.duos, session.player_ids, session.status, vivas])

  const doneCount = matches.filter(isPlayed).length
  /** Quanto dura, em media, uma partida deste conjunto: no grupos+duplas cada fase tem alvo e regra proprios. */
  const minutosMedios = (ms: Match[]) =>
    ms.length === 0
      ? minutosDaPartida(session.target, regraDoPlay)
      : ms.reduce((t, m) => t + minutosDaPartida(alvoDe(m), regraDe(m)), 0) / ms.length

  /** "8 partidas", ou "7 a 9" quando um entra/sai deixou desigual. */
  const jogosPorPessoa = useMemo(() => {
    const n = new Map(session.player_ids.map((id) => [id, 0]))
    for (const m of matches) for (const id of jogadorasDaPartida(m)) if (n.has(id)) n.set(id, (n.get(id) ?? 0) + 1)
    const v = [...n.values()]
    if (v.length === 0) return '—'
    const min = Math.min(...v)
    const max = Math.max(...v)
    return min === max ? `${min} partidas` : `${min} a ${max} partidas`
  }, [matches, session.player_ids])
  const finished = session.status === 'finished'
  const grupos = session.groups ?? null
  /** A forca de cada pessoa na data do play, como ela estava ao montar os grupos. */
  const forcaDoDia = useMemo(() => ratings(data, session.date), [data, session.date])
  const grupoDe = useMemo(() => {
    const map = new Map<string, number>()
    grupos?.forEach((g, i) => g.forEach((id) => map.set(id, i + 1)))
    return map
  }, [grupos])

  // sequencias que avancaram neste play (so existe depois de finalizado);
  // da maior para a menor, porque a maior e o destaque do texto e do banner
  const passos = useMemo(
    () =>
      computeStreaks(data)
        .steps.filter((x) => x.session_id === session.id && x.streak >= 2)
        .sort((a, b) => b.streak - a.streak),
    [data, session.id],
  )
  const streaksDoDia = useMemo(
    () => new Map(passos.map((x) => [x.player_id, x.streak])),
    [passos],
  )

  /** Grupo escolhido para gerar o texto e a arte; null = o play inteiro. */
  const [grupoArte, setGrupoArte] = useState<number | null>(null)
  const podiosSel = useMemo(
    () => (grupoArte === null ? podios : podios.filter((p) => p.grupo === grupoArte)),
    [podios, grupoArte],
  )
  const rowsSel = useMemo(
    () => (grupoArte === null ? dayRows : dayRows.filter((s) => grupoDe.get(s.player_id) === grupoArte)),
    [dayRows, grupoDe, grupoArte],
  )
  // o destaque e a maior sequencia entre quem esta neste recorte
  const award = useMemo(() => {
    const aqui = new Set(podiosSel.flatMap((p) => p.rows.map((x) => x.player_id)))
    return passos.find((x) => aqui.has(x.player_id))
  }, [passos, podiosSel])
  const awardLevel = award ? streakLevel(award.streak) : null

  // inicios e fins guardados no proprio celular, para nao dependerem da volta
  // do banco (ver src/lib/emQuadra.ts)
  const [inicios, setInicios] = useState<Horarios>(() => loadInicios())
  const [fins, setFins] = useState<Horarios>(() => loadFins())

  function marcarInicio(id: string, quando: string | null) {
    setInicios((prev) => {
      const next = { ...prev }
      if (quando) next[id] = quando
      else delete next[id]
      saveInicios(next)
      return next
    })
  }

  function marcarFim(id: string, quando: string | null) {
    setFins((prev) => {
      const next = { ...prev }
      if (quando) next[id] = quando
      else delete next[id]
      saveFins(next)
      return next
    })
  }

  // limpa marcacoes de inicio de partidas que ja tem placar
  useEffect(() => {
    const vivas = new Set(matches.filter((m) => !isPlayed(m)).map((m) => m.id))
    const sujas = Object.keys(inicios).filter((id) => !vivas.has(id) && matches.some((m) => m.id === id))
    if (sujas.length === 0) return
    setInicios((prev) => {
      const next = { ...prev }
      for (const id of sujas) delete next[id]
      saveInicios(next)
      return next
    })
  }, [matches, inicios])

  const iniciada = (m: Match) => !isPlayed(m) && !!(m.started_at ?? inicios[m.id])

  /** Hora em que a partida entrou em quadra (banco ou celular), se estiver rolando. */
  function inicioDe(m: Match): string | null {
    if (isPlayed(m)) return null
    return m.started_at ?? inicios[m.id] ?? null
  }

  const emJogo = useMemo(() => matches.filter(iniciada), [matches, inicios])
  const pendentes = useMemo(
    () => matches.filter((m) => !isPlayed(m) && !iniciada(m)),
    [matches, inicios],
  )
  const jogadas = useMemo(() => matches.filter(isPlayed), [matches])

  const ocupadas = useMemo(() => {
    const s = new Set<string>()
    for (const m of emJogo) for (const id of jogadorasDaPartida(m)) s.add(id)
    return s
  }, [emJogo])

  /** Quantas partidas cada uma ja fez hoje. */
  const jogos = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of jogadas) for (const id of jogadorasDaPartida(m)) map.set(id, (map.get(id) ?? 0) + 1)
    return map
  }, [jogadas])

  /**
   * Fila de espera: 0 e quem esta fora ha mais tempo. Sem hora registrada
   * (banco antigo, outro aparelho) a jogadora conta como "jogou ha muito".
   */
  const espera = useMemo(() => {
    const ultimo = new Map<string, number>()
    for (const m of jogadas) {
      const iso = m.ended_at ?? fins[m.id] ?? null
      const t = iso ? Date.parse(iso) : 0
      for (const id of jogadorasDaPartida(m)) {
        ultimo.set(id, Math.max(ultimo.get(id) ?? 0, Number.isNaN(t) ? 0 : t))
      }
    }
    return ordemDeEspera(session.player_ids, (id) => ultimo.get(id) ?? null)
  }, [jogadas, fins, session.player_ids])

  const quadras = useMemo(
    () => Array.from({ length: Math.max(1, session.courts) }, (_, i) => i + 1),
    [session.courts],
  )
  const emQuadra = useMemo(() => {
    const map = new Map<number, Match>()
    for (const m of emJogo) if (!map.has(m.court)) map.set(m.court, m)
    return map
  }, [emJogo])
  const quadrasLivres = quadras.filter((q) => !emQuadra.has(q))

  /** Sugestao de proxima partida por quadra livre, respeitando escolhas na mao. */
  const proximas = useMemo(() => {
    const escolhidasNaMao = new Map<number, Match>()
    const reservadas = new Set<string>()
    for (const q of quadrasLivres) {
      const id = manuais[q]
      const m = id ? pendentes.find((x) => x.id === id) : undefined
      if (m) {
        escolhidasNaMao.set(q, m)
        reservadas.add(m.id)
      }
    }
    const restantes = quadrasLivres.filter((q) => !escolhidasNaMao.has(q))
    const ocupadasComManuais = new Set(ocupadas)
    for (const m of escolhidasNaMao.values()) {
      for (const id of jogadorasDaPartida(m)) ocupadasComManuais.add(id)
    }
    const auto = proximasDasQuadras({
      pendentes: pendentes.filter((m) => !reservadas.has(m.id)),
      ocupadas: ocupadasComManuais,
      espera,
      jogos,
      quadrasLivres: restantes,
    })
    return new Map([...escolhidasNaMao, ...auto])
  }, [quadrasLivres, manuais, pendentes, ocupadas, espera, jogos])

  /**
   * Quem nao esta disponivel para esta partida: as que estao em quadra agora e
   * as que ja foram escaladas para a proxima partida de outra quadra.
   */
  function ocupadasFora(m: Match): Set<string> {
    const fora = new Set<string>()
    for (const atual of [...emJogo, ...proximas.values()]) {
      if (atual.id === m.id) continue
      for (const id of jogadorasDaPartida(atual)) fora.add(id)
    }
    return fora
  }

  /** Quem nao esta nem jogando nem escalada para nenhuma quadra. */
  const livresAgora = useMemo(() => {
    const comprometidas = new Set(ocupadas)
    for (const m of proximas.values()) for (const id of jogadorasDaPartida(m)) comprometidas.add(id)
    return session.player_ids.filter((id) => !comprometidas.has(id))
  }, [ocupadas, proximas, session.player_ids])

  /**
   * A fila de verdade: o que sobra depois das quadras, na ordem em que deve
   * acontecer. Sem isto a tela mostrava a ordem de geracao, e quem tinha
   * acabado de jogar aparecia na frente de quem ainda nem tinha entrado.
   */
  const filaPrevista = useMemo(() => {
    const naQuadra = new Set([...proximas.values()].map((m) => m.id))
    const comprometidas = new Set(ocupadas)
    for (const m of proximas.values()) {
      for (const id of jogadorasDaPartida(m)) comprometidas.add(id)
    }
    return ordemPrevista({
      pendentes: pendentes.filter((m) => !naQuadra.has(m.id)),
      espera,
      ocupadas: comprometidas,
      jogadoras: session.player_ids,
    })
  }, [pendentes, proximas, ocupadas, espera, session.player_ids])

  /**
   * As duplas que jogam duas vezes no dia, por partida.
   *
   * Nao e sobra nem defeito: quando o grupo nao fecha certo (6, 7, 10, 11
   * meninas) algumas duplas repetem DE PROPOSITO, escolhidas para que cada
   * jogadora repita a mesma quantidade -- sem isso duas do grupo jogariam uma
   * partida a mais que as outras.
   */
  const duplasRepetidas = useMemo(() => {
    const vistas = new Map<string, string>() // dupla -> id da primeira partida
    const porPartida = new Map<string, string[]>() // partida -> duplas que repetem
    for (const m of matches) {
      for (const d of [m.team_a, m.team_b]) {
        const k = pairKey(d[0], d[1])
        if (vistas.has(k) && vistas.get(k) !== m.id) {
          const nomes = `${nameOf(d[0])} + ${nameOf(d[1])}`
          porPartida.set(m.id, [...(porPartida.get(m.id) ?? []), nomes])
        } else if (!vistas.has(k)) {
          vistas.set(k, m.id)
        }
      }
    }
    return porPartida
  }, [matches, nameOf])

  function setScore(m: Match, a: number | null, b: number | null, tie?: number | null) {
    // lancar o placar tambem encerra a partida: a quadra fica livre de novo
    const encerrando = a !== null && b !== null
    // corrigir um placar antigo nao muda a hora em que a partida terminou:
    // senao aquelas quatro voltariam para o fim da fila de espera
    const fim = encerrando ? m.ended_at ?? fins[m.id] ?? new Date().toISOString() : null
    marcarInicio(m.id, null)
    marcarFim(m.id, fim)
    // `tie` vem so quando a partida foi decidida no tie; apagar o placar limpa
    saveMatches([
      { ...m, score_a: a, score_b: b, tie: encerrando ? tie ?? null : null, started_at: null, ended_at: fim },
    ])
  }

  /** Botao "partida iniciada": e a partir daqui que o app sabe quem esta em quadra. */
  function iniciar(m: Match, quadra: number) {
    const agora = new Date().toISOString()
    marcarInicio(m.id, agora)
    setManuais((prev) => {
      const next = { ...prev }
      delete next[quadra]
      return next
    })
    saveMatches([{ ...m, court: quadra, started_at: agora }])
  }

  function cancelarInicio(m: Match) {
    marcarInicio(m.id, null)
    saveMatches([{ ...m, court: 0, started_at: null }])
  }

  useWakeLock(!finished)

  async function gerarArteDoDia() {
    setGerando(true)
    try {
      // o status vai em TODAS as do podio: quem olha a arte quer saber em que
      // degrau cada uma esta, nao so a campea
      const linhaDe = (s: (typeof dayRows)[number], comStatus: boolean): PosterRow => {
        const n = comStatus ? (streaksDoDia.get(s.player_id) ?? 0) : 0
        const lvl = n >= 2 ? streakLevel(n) : null
        return {
          name: nameOf(s.player_id),
          points: s.points,
          wins: s.wins,
          losses: s.losses,
          photo: playerById(s.player_id)?.photo_url ?? null,
          streak: n,
          statusTitle: lvl?.title,
          statusEmoji: lvl?.emoji,
          statusPoints: undefined,
        }
      }
      const logo = `${import.meta.env.BASE_URL}logo.png`
      /*
       * No grupos+duplas a arte coroa o PODIO DA CHAVE, nao os pontos.
       *
       * Cada dupla vira um bloco de duas linhas, com a mesma medalha para as
       * duas -- o mesmo desenho ja usado para os grupos, que empilha blocos e
       * continua legivel no celular.
       */
      if (soFase2 && duplasDoDia.length > 0) {
        const porId = new Map(dayRows.map((s) => [s.player_id, s]))
        const titulos = ['Campeãs do dia', 'Vice-campeãs', '3º lugar']
        const blocos = duplasDoDia.slice(0, 3).map((d, i) => ({
          titulo: titulos[i],
          medalha: i,
          rows: [d.a, d.b]
            .map((id) => porId.get(id))
            .filter((s): s is PlayerStat => Boolean(s))
            .map((s) => linhaDe(s, true)),
        }))
        const blob = await buildDayPosterGrupos(dateLabel(session.date), blocos, logo)
        setArte({ url: URL.createObjectURL(blob), blob })
        return
      }

      const um = podiosSel.length === 1 ? podiosSel[0] : null
      // o podio grande so serve para exatamente tres: com empate ou grupo
      // pequeno o podio tem outro tamanho, e aí vale o bloco empilhado
      const cabeNoPodioGrande = um !== null && (um.grupo === null || um.rows.length === 3)
      const blob = cabeNoPodioGrande
        ? await buildDayPoster(
            dateLabel(session.date),
            rowsSel.slice(0, 8).map((s, i) => linhaDe(s, i < um.rows.length)),
            logo,
            um.grupo === null ? 'RANKING DO DIA' : `RANKING DO DIA · GRUPO ${um.grupo}`,
          )
        : await buildDayPosterGrupos(
            dateLabel(session.date),
            podiosSel.map((p) => ({
              titulo: p.grupo === null ? 'Pódio do dia' : `Grupo ${p.grupo}`,
              rows: p.rows.map((s) => linhaDe(s, true)),
            })),
            logo,
          )
      setArte({ url: URL.createObjectURL(blob), blob })
    } catch (e) {
      onToast('Não consegui gerar a imagem')
      console.error(e)
    } finally {
      setGerando(false)
    }
  }

  async function salvarArte() {
    if (!arte) return
    const sufixo = grupoArte === null ? '' : `-grupo${grupoArte}`
    const arquivo = new File([arte.blob], `play-${session.date}${sufixo}.png`, { type: 'image/png' })
    const nav = navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean
      share?: (d: { files: File[]; text?: string }) => Promise<void>
    }
    if (nav.canShare?.({ files: [arquivo] }) && nav.share) {
      try {
        const deQuem = grupoArte === null ? '' : ` · Grupo ${grupoArte}`
        await nav.share({
          files: [arquivo],
          text: `${session.title} — ${dateLabel(session.date)}${deQuem} 🏐`,
        })
        return
      } catch {
        /* cancelou: cai para o download */
      }
    }
    const a = document.createElement('a')
    a.href = arte.url
    a.download = arquivo.name
    a.click()
    onToast('Imagem salva 📸')
  }

  /**
   * Refaz so o que ainda nao aconteceu: junta as duplas que ainda faltam
   * formar e monta as partidas em cima do que ja foi jogado hoje.
   */
  async function regenerarPendentes(sessao: PlaySession = session, silencioso = false) {
    const naFila = matches.filter((m) => !isPlayed(m) && !iniciada(m))
    if (naFila.length === 0 && !silencioso) {
      onToast('Não há partidas na fila para refazer')
      return
    }
    const fila = refazerFila({
      playerIds: sessao.player_ids,
      groups: sessao.groups ?? undefined,
      jogadas,
      ratings: ratings(data, session.date),
      entrosamento: ajusteDeEntrosamento(data),
      history: buildHistory(playedMatches(data).filter((m) => m.session_id !== session.id)),
      historyWeight: 1,
    })
    const preservadas = matches.filter((m) => isPlayed(m) || iniciada(m))
    // a fila nova entra depois da ultima posicao ja usada, para nao haver duas
    // partidas com o mesmo numero na lista
    const ultima = preservadas.reduce((n, m) => Math.max(n, m.round), 0)
    const novas = planToMatches(session.id, fila).map((m, i) => ({
      ...m,
      round: ultima + i + 1,
    }))
    await replaceSessionMatches(session.id, [...preservadas, ...novas])
    await saveSession({ ...sessao, rounds: preservadas.length + novas.length })
    if (!silencioso) {
      onToast(`${novas.length === 1 ? 'uma partida refeita' : `${novas.length} partidas refeitas`} 🔄`)
    }
  }

  /**
   * ENTRA / SAI NO MEIO DO PLAY
   *
   * O caso tipico: o play esta cheio, alguem faltou e outra pessoa quer a
   * vaga -- inclusive alguem de fora, que e cadastrada na hora. Tres jeitos
   * de encaixar quem entra:
   *
   *  - "no lugar": herda exatamente as partidas que quem saiu ainda nao jogou
   *    (e a vaga na dupla fixa, no grupos+duplas). Nada mais muda.
   *  - "grupo escolhido" / "deixar o app encaixar": entra no grupo escolhido
   *    (ou no de forca media mais proxima da sua) e a fila que ainda nao
   *    aconteceu e refeita em cima do que ja foi jogado.
   *
   * Quem esta em quadra agora nao sai: a partida iniciada precisa terminar.
   */
  async function substituir(p: {
    sai: string | null
    entra: { id: string } | { nome: string } | null
    onde: 'lugar' | 'auto' | 'grupo'
    grupo: number
  }) {
    const { sai, onde, grupo } = p
    if (!sai && !p.entra) return
    if (sai && matches.some((m) => iniciada(m) && jogadorasDaPartida(m).includes(sai))) {
      onToast(`${nameOf(sai)} está em quadra agora — lance o placar antes de tirá-la`)
      return
    }

    // quem entra: cadastrada, ou criada agora (reaproveitando se o nome ja existe)
    let entra: string | null = null
    // o nome de quem entra: quem e criada agora ainda nao esta no `data`
    // quando o toast sai, entao o nome vem do que foi digitado
    let nomeDeQuemEntra = ''
    if (p.entra && 'id' in p.entra) {
      entra = p.entra.id
      nomeDeQuemEntra = nameOf(entra)
    }
    if (p.entra && 'nome' in p.entra) {
      const nome = p.entra.nome.trim()
      if (!nome) return
      nomeDeQuemEntra = nome
      const existente = data.players.find((x) => normalizar(x.name) === normalizar(nome))
      if (existente) {
        entra = existente.id
      } else {
        const nova: Player = {
          id: uid(),
          name: nome,
          photo_url: null,
          active: true,
          created_at: new Date().toISOString(),
          categoria: 'isenta',
          pago_mes: null,
          pago_avulso: false,
        }
        await savePlayer(nova)
        entra = nova.id
      }
    }
    if (entra && session.player_ids.includes(entra)) {
      onToast(`${nomeDeQuemEntra} já está neste play`)
      return
    }

    const player_ids = session.player_ids.filter((id) => id !== sai)
    if (entra) player_ids.push(entra)

    // os grupos: tira quem saiu e poe quem entrou onde foi pedido
    let groups = session.groups ? session.groups.map((g) => g.filter((id) => id !== sai)) : null
    if (groups && entra) {
      let alvo: number
      if (onde === 'lugar' && sai) {
        alvo = Math.max(0, (session.groups as string[][]).findIndex((g) => g.includes(sai)))
      } else if (onde === 'grupo') {
        alvo = grupo
      } else if (groups.some((g) => g.length < 4)) {
        // quem saiu deixou um grupo sem os quatro do rodizio: o buraco vem
        // antes da forca, senao a troca seria recusada logo abaixo
        alvo = groups.findIndex((g) => g.length < 4)
      } else {
        // o grupo cuja forca media fica mais perto da dela
        const forcas = ratings(data, session.date)
        const minha = forcas.get(entra) ?? FORCA_PADRAO
        const media = (g: string[]) =>
          g.reduce((t, id) => t + (forcas.get(id) ?? FORCA_PADRAO), 0) / Math.max(1, g.length)
        alvo = groups.reduce(
          (melhor, g, i, todos) =>
            Math.abs(media(g) - minha) < Math.abs(media(todos[melhor]) - minha) ? i : melhor,
          0,
        )
      }
      groups = groups.map((g, i) => (i === alvo ? [...g, entra as string] : g))
    }
    if (groups && groups.some((g) => g.length < 4)) {
      onToast('Um grupo ficaria com menos de 4 — coloque alguém no lugar')
      return
    }

    const duos = session.duos
      ? session.duos.map((d) => d.map((id) => (id === sai && entra ? entra : id)) as [string, string])
      : session.duos
    const nova: PlaySession = { ...session, player_ids, groups, duos }

    if (onde === 'lugar' && sai && entra) {
      const trocadas = matches
        .filter((m) => !isPlayed(m) && jogadorasDaPartida(m).includes(sai))
        .map((m) => trocarNaPartida(m, sai, entra as string))
      if (trocadas.length) await saveMatches(trocadas)
      await saveSession(nova)
      onToast(`${nomeDeQuemEntra} entrou no lugar de ${nameOf(sai)} 🔁`)
      return
    }

    await saveSession(nova)
    await regenerarPendentes(nova, true)
    onToast(entra ? `${nomeDeQuemEntra} entrou no play 🔁` : `${nameOf(sai as string)} saiu do play`)
  }

  async function regenerate() {
    if (doneCount > 0 && !confirm('Já existem placares lançados. Gerar novas duplas apaga todos os resultados deste play. Continuar?')) return
    const fila = gerarFila({
      playerIds: session.player_ids,
      groups: session.groups ?? undefined,
      ratings: ratings(data, session.date),
      entrosamento: ajusteDeEntrosamento(data),
      history: buildHistory(playedMatches(data).filter((m) => m.session_id !== session.id)),
    })
    await replaceSessionMatches(session.id, planToMatches(session.id, fila))
    await saveSession({ ...session, rounds: fila.length })
    onToast('Novas duplas geradas 🔄')
  }

  async function gerarFase2() {
    const gruposDoPlay = session.groups
    if (!gruposDoPlay || gruposDoPlay.length < 2) {
      onToast('Este play não tem grupos')
      return
    }
    // classificacao dentro de cada grupo, so com as partidas da fase 1
    const colocacoes: Colocacao[] = []
    gruposDoPlay.forEach((g, gi) => {
      const doGrupo = new Set(g)
      const ms = daFase1.filter((m) => doGrupo.has(m.team_a[0]))
      const base = rankPlayers(computeStats(ms), nameOf).filter((r) => doGrupo.has(r.player_id))
      // `rankPlayers` ja ordena por pontos, diferenca de games e vitorias. O que
      // ele nao tem e o CONFRONTO DIRETO, que so faz sentido dentro do grupo:
      // empatado em tudo, fica na frente quem venceu quando as duas se
      // enfrentaram. O alfabetico continua como ultimo recurso, para a ordem
      // nunca depender do acaso.
      const rank = desempatarNoConfronto(base, ms)
      rank.forEach((r, k) => {
        colocacoes.push({
          id: r.player_id,
          grupo: gi,
          posicao: k + 1,
          pontos: r.points,
          saldo: r.wins - r.losses,
        })
      })
    })

    const duos = duplasDaFase2(colocacoes, session.duplas_mm ?? 8)
    if (duos.length < 2) {
      onToast('Poucas duplas para o mata-mata')
      return
    }
    const { byes, jogos } = rodadaDoMataMata(duos)
    const fila = jogos.map(([a, b]) => ({ team_a: a, team_b: b, grupo: 0, fase: 2 }))
    const novas = planToMatches(session.id, fila).map((m, i) => ({
      ...m,
      round: daFase1.length + i + 1,
    }))
    await saveSession({ ...session, duos, rounds: daFase1.length + novas.length })
    await saveMatches(novas)
    onToast(
      `${nomeDaRodada(duos.length)}: ${duos.length} duplas` +
        (byes.length ? `, ${byes.length} de bye 🤝` : ' 🤝'),
    )
  }

  /**
   * A proxima rodada do mata-mata: quem nao perdeu segue, na ordem de forca.
   *
   * Os byes da primeira rodada nao precisam ser guardados: quem nunca perdeu
   * esta vivo, e `duplasVivas` deduz isso das partidas ja lancadas.
   */
  async function gerarProximaRodada() {
    if (vivas.length < 2) {
      onToast('O mata-mata já tem campeã')
      return
    }
    const { jogos } = rodadaDoMataMata(vivas)
    const fase = ultimaFase + 1
    const fila: PlannedMatch[] = jogos.map(([a, b]) => ({ team_a: a, team_b: b, grupo: 0, fase }))

    /*
     * Vai sair a FINAL? Entao as duas que perderam a semi jogam o 3o lugar.
     *
     * Na mesma fase, para nao ficarem "acima" das finalistas na hora de
     * medir ate onde cada dupla chegou -- e marcada, para o app nao contar
     * essa partida como se a fase tivesse duas rodadas. Roda em paralelo com
     * a final, na quadra ao lado, entao nao alonga a noite.
     */
    if (vivas.length === 2) {
      const perdedoras = daUltimaRodada
        .filter(isPlayed)
        .map((m) =>
          ((m.score_a as number) > (m.score_b as number) ? m.team_b : m.team_a) as [string, string],
        )
      if (perdedoras.length === 2) {
        fila.push({
          team_a: perdedoras[0],
          team_b: perdedoras[1],
          grupo: 0,
          fase,
          disputa3o: true,
        })
      }
    }
    const novas = planToMatches(session.id, fila).map((m, i) => ({
      ...m,
      round: matches.length + i + 1,
    }))
    await saveSession({ ...session, rounds: matches.length + novas.length })
    await saveMatches(novas)
    onToast(`${nomeDaRodada(vivas.length)} montada 🥅`)
  }

  async function finish() {
    if (doneCount < matches.length && !confirm(`Ainda faltam ${matches.length - doneCount} partidas sem placar. Finalizar mesmo assim?`)) return
    await saveSession({ ...session, status: 'finished' })
    // o credito da avulsa vale por UM play: finalizado, ela volta a dever
    for (const p of consumirAvulsos(session.player_ids, data)) await savePlayer(p)
    setShowRank(true)
    onToast('Play finalizado! Pontos somados ao ranking do mês 🏆')
  }

  /** Troca as ocupadas por quem esta livre, mantendo equilibrio e duplas novas. */
  function trocar(m: Match, sai: string, entra: string) {
    saveMatches([trocarNaPartida(m, sai, entra)])
  }

  const editable = canEdit && !finished

  return (
    <>
      <div className="card">
        <div className="row spread">
          <button className="btn ghost sm" onClick={onBack}>← Plays</button>
          <span className="row" style={{ gap: 6 }}>
            {session.ranked === false && <span className="badge avulso">avulso</span>}
            <span className={`badge ${session.status}`}>{finished ? 'finalizado' : 'em andamento'}</span>
          </span>
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{session.title}</div>
          <div className="small" style={{ fontWeight: 700, marginTop: 2 }}>
            {session.ranked === false ? '🎈 Play avulso' : '🏆 Vale para o campeonato'}
            {' · '}
            {FORMATOS.find((f) => f.valor === (session.format ?? 'todas'))?.rotulo ?? session.format}
          </div>
          <div className="small muted">
            {dateLabel(session.date)} · {session.player_ids.length} jogadoras · {session.courts} quadras
            {grupos && grupos.length > 1 && ` · ${grupos.length} grupos`} · até {session.target} games
          </div>
          <div className="tiny muted" style={{ marginTop: 2 }}>
            {explicarRegra(session.target, regraDoPlay)}
          </div>
          {matches.length > 0 && (
            <div className="tiny" style={{ marginTop: 6, fontWeight: 700 }}>
              🎾 Cada menina joga <strong>{jogosPorPessoa}</strong>
              {' · '}
              {finished
                ? `noite de ${duracaoEstimada(matches.length, session.courts, minutosMedios(matches))}`
                : doneCount === 0
                  ? `noite de uns ${duracaoEstimada(matches.length, session.courts, minutosMedios(matches))}`
                  : `faltam ${matches.length - doneCount} partidas, uns ${duracaoEstimada(
                      matches.length - doneCount,
                      session.courts,
                      minutosMedios(matches.filter((m) => !isPlayed(m))),
                    )}`}
              <span className="muted" style={{ fontWeight: 500 }}>
                {' '}(uns {Math.round(minutosMedios(matches))} min por partida, com os games de quem perde e o desempate)
              </span>
            </div>
          )}
        </div>
        <div className="grid3" style={{ marginTop: 12 }}>
          <StatBox k="Partidas" v={`${doneCount}/${matches.length}`} />
          <StatBox k="Em quadra" v={emJogo.length} />
          <StatBox k="Líder do dia" v={<span style={{ fontSize: 13 }}>{dayRows[0] ? nameOf(dayRows[0].player_id).split(' ')[0] : '—'}</span>} />
        </div>
        <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
          <button className="btn ghost sm" onClick={async () => {
            const ok = await shareOrCopy(
              scheduleText(session.date, session.title, session.courts, matches, nameOf, grupos),
            )
            onToast(ok ? 'Partidas copiadas 💬' : 'Não consegui copiar')
          }}>💬 Enviar partidas</button>
          <button className="btn ghost sm" onClick={() => setShowRank(true)}>🏆 Ranking do dia</button>
          {editable && (
            <>
              {!finished && (
                <button className="btn ghost sm" onClick={() => setSubstituindo(true)}>
                  🔁 Entra / sai
                </button>
              )}
              <button className="btn ghost sm" onClick={() => void regenerarPendentes()}>
                🔄 Refazer a fila
              </button>
              <button className="btn ghost sm" onClick={() => void regenerate()}>♻️ Refazer tudo</button>
            </>
          )}
        </div>
      </div>

      {session.ranked === false && (
        <div className="banner info">
          🎈 <strong>Play avulso.</strong> Os pontos deste dia <strong>não entram no ranking
          do mês</strong> e não mexem nas sequências 🔥 — mas ficam no histórico de cada
          jogadora e continuam ajudando a equilibrar as duplas dos próximos plays.
        </div>
      )}

      {grupos && grupos.length > 1 && (
        <div className="card">
          <div className="section-title">👥 Grupos</div>
          <div className="stack">
            {grupos.map((g, i) => {
              const notas = g.map((id) => notaDeForca(forcaDoDia.get(id) ?? 2))
              const total = notas.reduce((t, x) => t + x, 0)
              const media = Math.round(total / Math.max(1, g.length))
              return (
                <div key={i} className={`grupo-box ${classeDoGrupo(i + 1)}`}>
                  <div className="grupo-nome">Grupo {i + 1} · {g.length} meninas</div>
                  <div className="tiny muted" style={{ marginBottom: 4 }}>
                    💪 força média <strong>{media}</strong>
                    {' · '}
                    {nivelDeForca(media).emoji} {nivelDeForca(media).titulo}
                    {' · '}
                    total <strong>{total}</strong>
                  </div>
                  <div className="tiny">
                    {g.map((id, k) => `${nameOf(id)} ${notas[k]}`).join(' · ')}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            Cada grupo é um rodízio próprio e tem o seu pódio (1º, 2º e 3º). Os pontos continuam
            individuais e a classificação do dia é uma só.
          </p>
        </div>
      )}

      <div className="card">
        <div className="section-title">🏐 Quadras agora</div>
        {jaClassificadas && (
          <div className="banner ok classificadas">
            🎟️ <strong>
              {jaClassificadas.duplas.length === 1 ? 'Já está' : 'Já estão'} {jaClassificadas.onde}
            </strong>{' '}
            {'—'}{' '}
            {jaClassificadas.duplas.map((d) => `${nameOf(d[0])} + ${nameOf(d[1])}`).join(', ')}.
          </div>
        )}
        {jaPodemIr.length > 0 && (
          <div className="banner ok livres">
            🚪 <strong>
              {jaPodemIr.length === 1 ? 'Já pode ir' : `Já podem ir (${jaPodemIr.length})`}
            </strong>{' '}
            — sem mais partida nesta noite:{' '}
            {jaPodemIr.map((id) => nameOf(id)).join(', ')}.
          </div>
        )}
        {matches.length === 0 ? (
          <Empty>Nenhuma partida gerada.</Empty>
        ) : (
          quadras.map((q) => {
            const atual = emQuadra.get(q)
            const proxima = proximas.get(q)
            const m = atual ?? proxima
            if (!m) {
              return (
                <QuadraEsperando
                  key={q}
                  quadra={q}
                  restam={pendentes.length}
                  livres={livresAgora}
                  editable={editable}
                  grupoDe={grupoDe}
                />
              )
            }
            return (
              <MatchCard
                key={m.id}
                match={m}
                quadra={q}
                target={alvoDe(m)}
                desempate={regraDe(m)}
                rodada={rotuloDaPartida(m)}
                editable={editable}
                iniciada={!!atual}
                inicio={inicioDe(m)}
                ocupadas={ocupadasFora(m)}
                jogando={ocupadas}
                grupo={(m.fase ?? 1) >= 2 ? undefined : grupoDe.get(m.team_a[0])}
                totalGrupos={grupos?.length ?? 1}
                repetida={(m.fase ?? 1) < 2 && duplasRepetidas.has(m.id)}
                espera={espera}
                onScore={setScore}
                onIniciar={() => iniciar(m, q)}
                onCancelarInicio={() => cancelarInicio(m)}
                onTrocar={(sai, entra) => trocar(m, sai, entra)}
                onTrocarPartida={pendentes.length > 1 ? () => setEscolhendo(q) : undefined}
                jogadorasDoPlay={session.player_ids}
              />
            )
          })
        )}
      </div>

      <ListaDePartidas
        titulo="⏭️ Próximas na fila"
        vazio="Nada na fila."
        rodape="A ordem segue quem está fora há mais tempo, igual às quadras — não é a ordem em que as partidas foram geradas. As duplas não mudam."
        partidas={filaPrevista}
        numerar
        jogos={jogos}
        grupoDe={grupoDe}
        totalGrupos={grupos?.length ?? 1}
        repetidas={duplasRepetidas}
        desempateDe={regraDe}
        emQuadra={ocupadas}
      />

      <ListaDePartidas
        titulo={`✅ Já jogadas (${jogadas.length})`}
        vazio="Nenhum placar lançado ainda."
        partidas={[...jogadas].reverse()}
        grupoDe={grupoDe}
        totalGrupos={grupos?.length ?? 1}
        repetidas={duplasRepetidas}
        desempateDe={regraDe}
        emQuadra={ocupadas}
        target={session.target}
        editable={editable}
        onCorrigir={(m) => setCorrigindo(m)}
      />

      {editable && faltaFase && (
        <div className="card" style={{ borderColor: 'var(--marca)' }}>
          <div className="section-title" style={{ marginTop: 0 }}>
            ⏭️ O play ainda tem fase pela frente
          </div>
          <p className="tiny muted" style={{ marginTop: 0 }}>
            {podeGerarFase2
              ? 'A fase de grupos acabou. O próximo passo é formar as duplas fixas e montar a chave do mata-mata — só depois disso o play tem pódio.'
              : `A rodada terminou e ainda há ${vivas.length} duplas vivas. Monte a próxima antes de encerrar.`}
          </p>
          <button
            className="btn pink block"
            onClick={() => void (podeGerarFase2 ? gerarFase2() : gerarProximaRodada())}
          >
            {podeGerarFase2
              ? '🤝 Montar as duplas e a chave'
              : vivas.length === 2
                ? '🥅 Montar final e 3º lugar'
                : `🥅 Montar ${rotuloDaProxima.toLowerCase()}`}
          </button>
        </div>
      )}

      {editable && (
        <button className={`btn ${faltaFase ? 'ghost' : 'teal'} block`} onClick={() => void finish()}>
          ✅ Finalizar o play e somar os pontos
        </button>
      )}

      {finished && canEdit && (
        <button
          className="btn purple block"
          onClick={() =>
            onNext({
              title: session.title,
              courts: session.courts,
              target: session.target,
              player_ids: session.player_ids,
              format: session.format,
              ranked: session.ranked,
            })
          }
        >
          ➡️ Gerar as duplas do próximo play
        </button>
      )}

      {substituindo && (
        <SubstituirJogadora
          session={session}
          onClose={() => setSubstituindo(false)}
          onAplicar={async (p) => {
            setSubstituindo(false)
            await substituir(p)
          }}
        />
      )}

      {corrigindo && (
        <CorrigirPlacar
          match={corrigindo}
          target={alvoDe(corrigindo)}
          desempate={regraDe(corrigindo)}
          onClose={() => setCorrigindo(null)}
          onScore={(a, b, tie) => { setScore(corrigindo, a, b, tie); setCorrigindo(null) }}
        />
      )}

      {escolhendo !== null && (
        <EscolherPartida
          quadra={escolhendo}
          partidas={pendentes}
          ocupadas={ocupadas}
          espera={espera}
          grupoDe={grupoDe}
          totalGrupos={grupos?.length ?? 1}
          onEscolher={(m) => {
            setManuais((prev) => ({ ...prev, [escolhendo]: m.id }))
            setEscolhendo(null)
          }}
          onClose={() => setEscolhendo(null)}
        />
      )}

      {arte && (
        <Modal
          title={`Play de ${dateLabel(session.date)}${grupoArte === null ? '' : ` — Grupo ${grupoArte}`}`}
          onClose={() => { URL.revokeObjectURL(arte.url); setArte(null) }}
        >
          <img src={arte.url} alt="Imagem do ranking do dia" style={{ width: '100%', borderRadius: 14 }} />
          <button className="btn pink block" style={{ marginTop: 12 }} onClick={() => void salvarArte()}>
            📲 Compartilhar / salvar imagem
          </button>
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            No celular também dá para segurar o dedo na imagem e escolher <em>salvar</em>.
          </p>
        </Modal>
      )}

      {showRank && (
        <Modal title={`Ranking do dia — ${dateLabel(session.date)}`} onClose={() => setShowRank(false)}>
          {dayRows.length === 0 ? (
            <Empty>Nenhum placar lançado ainda.</Empty>
          ) : (
            <>
              {award && awardLevel && (
                <div className="banner warn" style={{ background: 'var(--orange-suave)', color: 'var(--orange)' }}>
                  {awardLevel.emoji} <strong>{nameOf(award.player_id)}</strong> é {awardLevel.title.toLowerCase()}!
                  {' '}{award.streak} semanas seguidas no pódio do dia — status vale{' '}
                  <strong>{award.value} pontos</strong>, que ela decide se usa no fechamento do mês.
                  {award.usouVida && ' (uma vida foi consumida para segurar o status hoje)'}
                </div>
              )}
              {soFase2 && <DuplasDoDia linhas={duplasDoDia} />}
              {podios.length > 1 ? (
                podios.map((p) => (
                  <div key={p.grupo} style={{ marginBottom: 14 }}>
                    <div className="section-title" style={{ fontSize: 13 }}>
                      🏆 Pódio do grupo {p.grupo}
                    </div>
                    <RankTable rows={p.rows} fire={streaksDoDia} />
                  </div>
                ))
              ) : (
                <RankTable rows={dayRows} fire={streaksDoDia} />
              )}
              {podios.length > 1 && (
                <>
                  <div className="section-title" style={{ fontSize: 13 }}>📊 Classificação do dia</div>
                  <RankTable rows={dayRows} fire={streaksDoDia} />
                </>
              )}
              {podios.length > 1 && (
                <>
                  <div className="section-title" style={{ fontSize: 13, marginTop: 14 }}>
                    📤 Mandar no grupo
                  </div>
                  {/* chips e nao `segmented`: com 4 ou 5 grupos os botoes fixos
                      nao cabem na largura do celular */}
                  <div className="chips-scroll" style={{ marginBottom: 8 }}>
                    <button
                      className={`chip ${grupoArte === null ? 'on' : 'off'}`}
                      style={{ flex: 'none' }}
                      onClick={() => setGrupoArte(null)}
                    >
                      📋 Tudo
                    </button>
                    {podios.map((p) => (
                      <button
                        key={p.grupo}
                        className={`chip ${grupoArte === p.grupo ? 'on' : 'off'}`}
                        style={{ flex: 'none' }}
                        onClick={() => setGrupoArte(p.grupo)}
                      >
                        Grupo {p.grupo}
                      </button>
                    ))}
                  </div>
                  <p className="tiny muted" style={{ marginTop: 0, marginBottom: 8 }}>
                    O texto e a imagem saem só com {grupoArte === null ? 'todos os grupos' : `o grupo ${grupoArte}`},
                    já escrito de qual grupo se trata.
                  </p>
                </>
              )}
              <button
                className="btn pink block"
                style={{ marginTop: podios.length > 1 ? 0 : 12 }}
                onClick={async () => {
                  const ok = await shareOrCopy(
                    dayRankingText({
                      date: session.date,
                      title: session.title,
                      rows: rowsSel,
                      nameOf,
                      podios: podiosSel,
                      duplas: soFase2 ? duplasDoDia : undefined,
                      streaks: streaksDoDia,
                      award,
                    }),
                  )
                  onToast(ok ? 'Ranking do dia copiado 💬' : 'Não consegui copiar')
                }}
              >
                💬 Texto {grupoArte === null ? 'do dia' : `do grupo ${grupoArte}`} para o WhatsApp
              </button>
              <button
                className="btn purple block"
                style={{ marginTop: 8 }}
                disabled={gerando}
                onClick={() => void gerarArteDoDia()}
              >
                {gerando
                  ? 'Montando a arte…'
                  : `🏐 Imagem ${grupoArte === null ? 'do dia' : `do grupo ${grupoArte}`}`}
              </button>
            </>
          )}
        </Modal>
      )}
    </>
  )
}

/* ------------------------------------------------------------ partidas */

/**
 * Quadra vaga sem partida possivel: todas as partidas que faltam pegam
 * alguem que ja esta em quadra ou escalada para outra. Em vez de sugerir a
 * mesma menina em duas quadras, a tela diz o que esta travando e oferece
 * montar uma partida com quem esta livre.
 */
function QuadraEsperando({
  quadra,
  restam,
  livres,
  editable,
  grupoDe,
}: {
  quadra: number
  restam: number
  livres: string[]
  editable: boolean
  /** Grupo de cada jogadora, quando o play e em grupos. */
  grupoDe?: Map<string, number>
}) {
  const { nameOf } = useStore()
  const emGrupos = Boolean(grupoDe && grupoDe.size > 0)
  // quatro livres nao bastam: elas tem que ser do MESMO grupo
  const porGrupo = new Map<number, string[]>()
  if (emGrupos) {
    for (const id of livres) {
      const g = (grupoDe as Map<string, number>).get(id) ?? 0
      porGrupo.set(g, [...(porGrupo.get(g) ?? []), id])
    }
  }
  // (o pai decide: livre em grupo sem partida pendente nao adianta de nada)
  return (
    <div className="match vazia">
      <div className="match-head"><span>Quadra {quadra}</span><span>livre</span></div>
      {restam === 0 ? (
        <div className="tiny muted">
          Acabou a fila — todas as partidas já foram jogadas ou estão em quadra.
        </div>
      ) : (
        <>
          <div className="tiny muted">
            Nenhuma das {restam} partidas que faltam tem quatro meninas livres agora.
          </div>
          {livres.length > 0 ? (
            <>
              {emGrupos ? (
                <>
                  <div className="tiny" style={{ marginTop: 6 }}>
                    <strong>Livres agora:</strong>{' '}
                    {[...porGrupo.entries()]
                      .sort((x, y) => x[0] - y[0])
                      .map(([g, ids]) => `G${g}: ${ids.map(nameOf).join(', ')}`)
                      .join(' · ')}
                  </div>
                  <div className="tiny muted" style={{ marginTop: 4 }}>
                    Uma partida precisa de <strong>quatro do mesmo grupo</strong> — juntar meninas de
                    grupos diferentes não valeria para rodízio nenhum.
                  </div>
                </>
              ) : (
                <div className="tiny" style={{ marginTop: 6 }}>
                  <strong>Livres agora:</strong> {livres.map(nameOf).join(', ')}
                </div>
              )}
              {editable && (
                <div className="tiny muted" style={{ marginTop: 6 }}>
                  A quadra espera a próxima partida terminar — trocar meninas aqui desfaria uma dupla
                  do rodízio e daria um jogo a mais para uma e a menos para outra. Se alguém
                  <strong> precisou ir embora</strong>, troque a jogadora direto no card da partida.
                </div>
              )}
            </>
          ) : (
            <div className="tiny muted" style={{ marginTop: 6 }}>
              Todas as meninas estão em quadra. Assim que um placar for lançado, esta quadra recebe
              a próxima partida.
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Livre · escalada para a próxima de outra quadra · jogando agora. */
function Situacao({
  id,
  ocupadas,
  jogando,
}: {
  id: string
  ocupadas: Set<string>
  jogando: Set<string>
}) {
  const texto = jogando.has(id) ? 'em quadra' : ocupadas.has(id) ? 'próxima partida' : 'livre'
  const cor = jogando.has(id) ? 'var(--orange)' : ocupadas.has(id) ? 'var(--purple)' : 'var(--teal)'
  return (
    <span className="tiny nowrap" style={{ fontWeight: 800, color: cor }}>{texto}</span>
  )
}

/** A cor de um grupo, 1 a 8, repetindo da nona em diante. */
export function classeDoGrupo(grupo?: number | null): string {
  return grupo ? `g${((grupo - 1) % 8) + 1}` : ''
}

function GrupoTag({ grupo, total }: { grupo?: number; total: number }) {
  if (!grupo || total <= 1) return null
  return <span className={`grupo-tag ${classeDoGrupo(grupo)}`}>G{grupo}</span>
}

function Duo({ ids, ocupadas }: { ids: [string, string]; ocupadas?: Set<string> }) {
  const { nameOf, playerById } = useStore()
  return (
    <>
      <Avatar player={playerById(ids[0])} size={26} />
      <Avatar player={playerById(ids[1])} size={26} />
      <span className="names">
        {ids.map((id, i) => (
          <span key={id}>
            {i > 0 && <span className="muted"> + </span>}
            <span className={`nowrap${ocupadas?.has(id) ? ' ocupada' : ''}`}>
              {nameOf(id)}
              {ocupadas?.has(id) && ' ⏳'}
            </span>
          </span>
        ))}
      </span>
    </>
  )
}

function MatchCard({
  match,
  quadra,
  target,
  desempate,
  rodada,
  editable,
  iniciada,
  inicio,
  ocupadas,
  jogando,
  grupo,
  totalGrupos,
  repetida,
  espera,
  jogadorasDoPlay,
  onScore,
  onIniciar,
  onCancelarInicio,
  onTrocar,
  onTrocarPartida,
}: {
  match: Match
  quadra: number
  target: number
  desempate: Regra
  /** Nome da rodada do mata-mata, quando ha. */
  rodada?: string
  editable: boolean
  iniciada: boolean
  inicio: string | null
  /** Indisponiveis: jogando agora ou ja escaladas para outra quadra. */
  ocupadas: Set<string>
  /** Das indisponiveis, quem esta de fato com a partida rolando. */
  jogando: Set<string>
  grupo?: number
  totalGrupos: number
  repetida: boolean
  espera: Map<string, number>
  jogadorasDoPlay: string[]
  onScore: (m: Match, a: number | null, b: number | null, tie?: number | null) => void
  onIniciar: () => void
  onCancelarInicio: () => void
  onTrocar: (sai: string, entra: string) => void
  onTrocarPartida?: () => void
}) {
  const { nameOf } = useStore()
  const [winner, setWinner] = useState<'a' | 'b' | null>(null)
  /** Escolheu o placar em games decidido no tie; falta o placar do tie. */
  const [noTie, setNoTie] = useState<{ venceu: number; perdeu: number } | null>(null)
  /** Abriu os campos para digitar um placar que os botoes nao cobrem. */
  const [digitando, setDigitando] = useState(false)
  const [trocando, setTrocando] = useState(false)
  const noTime = jogadorasDaPartida(match)
  // com um grupo so a cor nao diz nada; com varios e o que identifica a quadra
  const corDoGrupo = totalGrupos > 1 ? classeDoGrupo(grupo) : ''

  const modalTroca = trocando && (
    <TrocarJogadoras
      noTime={noTime}
      ocupadas={ocupadas}
      jogando={jogando}
      espera={espera}
      jogadorasDoPlay={jogadorasDoPlay}
      onTrocar={(sai, entra) => { onTrocar(sai, entra); setTrocando(false) }}
      onClose={() => setTrocando(false)}
    />
  )

  const cabecalho = (
    <div className="match-head">
      <span>
        Quadra {quadra} <GrupoTag grupo={grupo} total={totalGrupos} />
        {rodada && <span className="rodada-tag">{rodada}</span>}
        {repetida && (
          <span
            className="repetida-tag"
            title="uma das duplas joga pela segunda vez, para todas fecharem com o mesmo número de partidas"
          >
            🔁
          </span>
        )}
      </span>
      <span>{iniciada ? '🟢 em quadra' : editable ? 'próxima' : 'sem placar'}</span>
    </div>
  )

  // ---- so leitura ----
  if (!editable) {
    return (
      <div className={`match ${corDoGrupo}${iniciada ? ' em-quadra' : ''}`}>
        {cabecalho}
        <div className="team"><Duo ids={match.team_a} /></div>
        <div className="vs">X</div>
        <div className="team"><Duo ids={match.team_b} /></div>
      </div>
    )
  }

  // o tie tem placar proprio, entao ele e um passo a parte
  if (winner && noTie) {
    const loserIds = winner === 'a' ? match.team_b : match.team_a
    return (
      <div className={`match live ${corDoGrupo}`}>
        <div className="match-head">
          <span>Quadra {quadra}</span>
          <button className="linkish" onClick={() => setNoTie(null)}>‹ voltar</button>
        </div>
        <div className="ask" style={{ marginTop: 0 }}>
          Quantos pontos <strong>{nameOf(loserIds[0])} + {nameOf(loserIds[1])}</strong> fez no tie?
        </div>
        <div className="games-row">
          {pontosDoPerdedorNoTie(desempate).map((p) => (
            <button
              key={p}
              className="game-btn"
              title={`${pontosDoVencedorNoTie(desempate, p)}x${p}`}
              onClick={() => {
                const a = winner === 'a' ? noTie.venceu : noTie.perdeu
                const b = winner === 'a' ? noTie.perdeu : noTie.venceu
                setNoTie(null)
                setWinner(null)
                onScore(match, a, b, p)
              }}
            >
              {pontosDoVencedorNoTie(desempate, p) === desempate.tie
                ? p
                : placarDoTie(desempate, p)}
            </button>
          ))}
          <button className="game-btn manual" onClick={() => setDigitando(true)}>✏️</button>
        </div>

        {digitando && (
          <PlacarManual
            vencedora="Venceu o tie"
            perdedora="Perdeu o tie"
            valida={(a, b) => tieValido(desempate, a, b)}
            explica={(a, b) => explicarTieInvalido(desempate, a, b)}
            onCancelar={() => setDigitando(false)}
            onConfirmar={(_v, perdeu) => {
              const a = winner === 'a' ? noTie.venceu : noTie.perdeu
              const b = winner === 'a' ? noTie.perdeu : noTie.venceu
              setDigitando(false)
              setNoTie(null)
              setWinner(null)
              onScore(match, a, b, perdeu)
            }}
          />
        )}
      </div>
    )
  }

  // ---- passo 2: quantos games a perdedora fez ----
  if (winner) {
    const loserIds = winner === 'a' ? match.team_b : match.team_a
    return (
      <div className={`match live ${corDoGrupo}`}>
        <div className="match-head">
          <span>Quadra {quadra}</span>
          <button className="linkish" onClick={() => setWinner(null)}>‹ voltar</button>
        </div>
        <div className="team win">
          <Duo ids={winner === 'a' ? match.team_a : match.team_b} />
          <span className="score-box">
            {desempate.modo !== 'alvo' && !desempate.tieDireto ? `${target}+` : target}
          </span>
        </div>
        <div className="ask">Quantos games <strong>{nameOf(loserIds[0])} + {nameOf(loserIds[1])}</strong> fez?</div>
        <div className="games-row">
          {gamesDoPerdedor(target, desempate).map((n) => {
            const venceu = gamesDoVencedor(target, desempate, n)
            return (
              <button
                key={n}
                className={`game-btn${decidiuNoTie(target, desempate, n) ? ' no-tie' : ''}`}
                title={
                  decidiuNoTie(target, desempate, n)
                    ? `${venceu}x${n}, decidida no tie`
                    : `${venceu}x${n}`
                }
                onClick={() => {
                  // o tie tem placar proprio: pergunta antes de gravar
                  if (decidiuNoTie(target, desempate, n)) {
                    setNoTie({ venceu, perdeu: n })
                    return
                  }
                  setWinner(null)
                  if (winner === 'a') onScore(match, venceu, n)
                  else onScore(match, n, venceu)
                }}
              >
                {decidiuNoTie(target, desempate, n)
                  ? '🎯 tie'
                  : venceu === target
                    ? n
                    : `${venceu}x${n}`}
              </button>
            )
          })}
          {desempate.modo === 'vantagem' && (
            <button className="game-btn manual" onClick={() => setDigitando(true)}>✏️</button>
          )}
        </div>

        {digitando && (
          <PlacarManual
            vencedora={(winner === 'a' ? match.team_a : match.team_b).map(nameOf).join(' + ')}
            perdedora={loserIds.map(nameOf).join(' + ')}
            valida={(a, b) => placarDeGamesValido(target, desempate, a, b)}
            explica={(a, b) => explicarGamesInvalido(target, desempate, a, b)}
            onCancelar={() => setDigitando(false)}
            onConfirmar={(venceu, perdeu) => {
              setDigitando(false)
              setWinner(null)
              if (winner === 'a') onScore(match, venceu, perdeu)
              else onScore(match, perdeu, venceu)
            }}
          />
        )}
      </div>
    )
  }

  // ---- passo 1: quem venceu ----
  return (
    <div className={`match live ${corDoGrupo}${iniciada ? ' em-quadra' : ''}`}>
      {cabecalho}

      {iniciada ? (
        <div className="row spread" style={{ marginBottom: 8 }}>
          <span className="tiny" style={{ fontWeight: 800, color: 'var(--teal)' }}>
            Jogando desde {horaCurta(inicio as string)} — lance o placar para encerrar
          </span>
          <button className="linkish" onClick={onCancelarInicio}>desfazer</button>
        </div>
      ) : (
        <button className="btn teal sm block" style={{ marginBottom: 8 }} onClick={onIniciar}>
          ▶️ Partida iniciada
        </button>
      )}

      {/*
        So da para lancar o placar depois de marcar a partida como iniciada.
        Sem isso a partida era gravada sem quadra e sem hora de inicio -- e sao
        esses dois dados que dizem quem esta em quadra e quem esta fora ha mais
        tempo. E tambem evita lancar sem querer o placar da quadra errada.
      */}
      <button className="pick-team" disabled={!iniciada} onClick={() => setWinner('a')}>
        <Duo ids={match.team_a} ocupadas={iniciada ? undefined : ocupadas} />
        <span className="pick-tag">venceu</span>
      </button>
      <div className="vs">X</div>
      <button className="pick-team" disabled={!iniciada} onClick={() => setWinner('b')}>
        <Duo ids={match.team_b} ocupadas={iniciada ? undefined : ocupadas} />
        <span className="pick-tag">venceu</span>
      </button>
      {!iniciada && (
        <p className="tiny muted" style={{ margin: '8px 0 0', textAlign: 'center' }}>
          Toque em <strong>Partida iniciada</strong> para poder lançar o placar.
        </p>
      )}

      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button className="btn ghost sm grow" onClick={() => setTrocando(true)}>🔄 Trocar jogadora</button>
        {!iniciada && onTrocarPartida && (
          <button className="btn ghost sm grow" onClick={onTrocarPartida}>⏭️ Outra partida</button>
        )}
      </div>
      {modalTroca}
    </div>
  )
}

/** Lista compacta de partidas (fila e já jogadas), colapsável. */
function ListaDePartidas({
  titulo,
  vazio,
  rodape,
  partidas,
  numerar,
  jogos,
  grupoDe,
  totalGrupos,
  repetidas,
  emQuadra,
  desempateDe,
  target,
  editable,
  onCorrigir,
}: {
  titulo: string
  vazio: string
  /** Explicacao curta embaixo da lista. */
  rodape?: string
  partidas: Match[]
  /** Numera pela posicao na lista (a ordem prevista), nao pelo campo do banco. */
  numerar?: boolean
  /** Quantas partidas cada jogadora ja fez hoje. */
  jogos?: Map<string, number>
  grupoDe: Map<string, number>
  totalGrupos: number
  repetidas: Map<string, string[]>
  emQuadra: Set<string>
  /** A regra do empate de cada partida, para escrever o placar do tie. */
  desempateDe?: (m: Match) => Regra
  target?: number
  editable?: boolean
  onCorrigir?: (m: Match) => void
}) {
  const { nameOf } = useStore()
  const [aberta, setAberta] = useState(false)
  const LIMITE = 5
  const visiveis = aberta ? partidas : partidas.slice(0, LIMITE)

  return (
    <div className="card">
      <div className="row spread">
        <div className="section-title" style={{ margin: 0 }}>{titulo}</div>
        {partidas.length > LIMITE && (
          <button className="btn ghost sm" onClick={() => setAberta((v) => !v)}>
            {aberta ? 'Ver menos' : `Ver todas (${partidas.length})`}
          </button>
        )}
      </div>
      {partidas.length === 0 ? (
        <Empty>{vazio}</Empty>
      ) : (
        <div className="stack" style={{ marginTop: 10 }}>
          {visiveis.map((m, i) => {
            const jogada = isPlayed(m)
            const [pa, pb] = jogada ? matchPoints(m.score_a as number, m.score_b as number) : [0, 0]
            const aWin = jogada && (m.score_a as number) > (m.score_b as number)
            // Quem ainda nao entrou em quadra nenhuma vez E esta esperando: e
            // por ela que o organizador procura. Quem esta jogando agora nao
            // conta como "ainda nao jogou", mesmo sem placar lancado.
            const novatas = jogos
              ? jogadorasDaPartida(m).filter(
                  (id) => (jogos.get(id) ?? 0) === 0 && !emQuadra.has(id),
                )
              : []
            return (
              <div key={m.id} className="fila-linha">
                <span className="fila-num">
                  {numerar ? `${i + 1}ª` : m.round}
                  <GrupoTag grupo={(m.fase ?? 1) >= 2 ? undefined : grupoDe.get(m.team_a[0])} total={totalGrupos} />
                </span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className={`fila-time${jogada && aWin ? ' venceu' : ''}`}>
                    {nameOf(m.team_a[0])} + {nameOf(m.team_a[1])}
                    {jogada && <b> {m.score_a}</b>}
                    {jogada && pa > 0 && <i> +{pa}</i>}
                  </span>
                  <span className={`fila-time${jogada && !aWin ? ' venceu' : ''}`}>
                    {nameOf(m.team_b[0])} + {nameOf(m.team_b[1])}
                    {jogada && <b> {m.score_b}</b>}
                    {jogada && pb > 0 && <i> +{pb}</i>}
                  </span>
                  {m.disputa_3o && (
                    <span className="tiny nowrap" style={{ color: 'var(--bronze)', fontWeight: 800 }}>
                      🥉 3º lugar
                    </span>
                  )}
                  {jogada && m.tie != null && desempateDe && (
                    <span className="tiny nowrap tie-tag" title="decidida no tie">
                      🎯 {placarDoTie(desempateDe(m), m.tie)}
                    </span>
                  )}
                  {repetidas.has(m.id) && (
                    <span className="tiny muted">
                      🔁 {(repetidas.get(m.id) as string[]).join(' e ')}{' '}
                      {(repetidas.get(m.id) as string[]).length > 1 ? 'jogam' : 'joga'} pela 2ª vez
                      — é o que deixa todas com o mesmo número de partidas
                    </span>
                  )}
                  {novatas.length > 0 && (
                    <span className="tiny" style={{ color: 'var(--teal)', fontWeight: 700 }}>
                      🆕 {novatas.length === 4
                        ? 'as quatro ainda estão esperando a primeira partida'
                        : `${novatas.map(nameOf).join(', ')} ainda não ${novatas.length === 1 ? 'entrou' : 'entraram'} em quadra`}
                    </span>
                  )}
                  {!jogada && jogadorasDaPartida(m).some((id) => emQuadra.has(id)) && (
                    <span className="tiny muted">⏳ tem gente desta partida em quadra agora</span>
                  )}
                </span>
                {jogada && editable && onCorrigir && (
                  <button
                    className="btn ghost sm"
                    title={`corrigir o placar (partida até ${target} pontos)`}
                    onClick={() => onCorrigir(m)}
                  >✏️</button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {rodape && partidas.length > 0 && (
        <p className="tiny muted" style={{ marginBottom: 0 }}>{rodape}</p>
      )}
    </div>
  )
}

/**
 * Corrige o placar de uma partida ja jogada, direto.
 *
 * Antes o botao apagava o placar e devolvia a partida para a fila -- com o
 * bloqueio de "so lanca depois de iniciar", ela ficaria presa la, parecendo
 * que sumiu. Aqui o placar e trocado sem a partida sair do lugar.
 */
function CorrigirPlacar({
  match,
  target,
  desempate,
  onScore,
  onClose,
}: {
  match: Match
  target: number
  desempate: Regra
  onScore: (a: number | null, b: number | null, tie?: number | null) => void
  onClose: () => void
}) {
  const { nameOf } = useStore()
  const [winner, setWinner] = useState<'a' | 'b' | null>(null)
  const [noTie, setNoTie] = useState<{ venceu: number; perdeu: number } | null>(null)

  // o tie tem placar proprio, entao ele e um passo a parte
  if (winner && noTie) {
    const perdedoras = winner === 'a' ? match.team_b : match.team_a
    return (
      <Modal title="Quantos pontos no tie?" onClose={onClose}>
        <button className="btn ghost sm" style={{ marginBottom: 10 }} onClick={() => setNoTie(null)}>
          ‹ voltar
        </button>
        <div className="ask" style={{ marginTop: 0 }}>
          Quantos pontos <strong>{nameOf(perdedoras[0])} + {nameOf(perdedoras[1])}</strong> fez no tie?
        </div>
        <div className="games-row">
          {pontosDoPerdedorNoTie(desempate).map((p) => (
            <button
              key={p}
              className="game-btn"
              title={`${pontosDoVencedorNoTie(desempate, p)}x${p}`}
                onClick={() =>
                  winner === 'a'
                    ? onScore(noTie.venceu, noTie.perdeu, p)
                    : onScore(noTie.perdeu, noTie.venceu, p)
                }
            >
              {pontosDoVencedorNoTie(desempate, p) === desempate.tie
                ? p
                : placarDoTie(desempate, p)}
            </button>
          ))}
        </div>
      </Modal>
    )
  }

  if (winner) {
    const perdedoras = winner === 'a' ? match.team_b : match.team_a
    return (
      <Modal title="Quantos games a perdedora fez?" onClose={onClose}>
        <button className="btn ghost sm" style={{ marginBottom: 10 }} onClick={() => setWinner(null)}>
          ‹ trocar quem venceu
        </button>
        <div className="ask" style={{ marginTop: 0 }}>
          <strong>{nameOf(perdedoras[0])} + {nameOf(perdedoras[1])}</strong>
        </div>
        <div className="games-row">
          {gamesDoPerdedor(target, desempate).map((n) => {
            const venceu = gamesDoVencedor(target, desempate, n)
            return (
              <button
                key={n}
                className={`game-btn${decidiuNoTie(target, desempate, n) ? ' no-tie' : ''}`}
                title={`${venceu}x${n}`}
                onClick={() => {
                  if (decidiuNoTie(target, desempate, n)) {
                    setNoTie({ venceu, perdeu: n })
                    return
                  }
                  winner === 'a' ? onScore(venceu, n) : onScore(n, venceu)
                }}
              >
                {decidiuNoTie(target, desempate, n)
                  ? '🎯 tie'
                  : venceu === target
                    ? n
                    : `${venceu}x${n}`}
              </button>
            )
          })}
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Corrigir o placar" onClose={onClose}>
      <p className="tiny muted" style={{ marginTop: 0 }}>
        Placar atual: <strong>{match.score_a} x {match.score_b}</strong>. Escolha quem venceu.
      </p>
      <button className="pick-team" onClick={() => setWinner('a')}>
        <Duo ids={match.team_a} />
        <span className="pick-tag">venceu</span>
      </button>
      <div className="vs">X</div>
      <button className="pick-team" onClick={() => setWinner('b')}>
        <Duo ids={match.team_b} />
        <span className="pick-tag">venceu</span>
      </button>
    </Modal>
  )
}

function horaCurta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Troca de jogadora em duas etapas, com linhas grandes.
 * Antes era um toque no nome dentro da partida -- no celular, com nome
 * comprido, o nome era cortado e nao dava para acertar o dedo nele.
 */
function TrocarJogadoras({
  noTime,
  ocupadas,
  jogando,
  espera,
  jogadorasDoPlay,
  onTrocar,
  onClose,
}: {
  noTime: string[]
  ocupadas: Set<string>
  jogando: Set<string>
  espera: Map<string, number>
  jogadorasDoPlay: string[]
  onTrocar: (sai: string, entra: string) => void
  onClose: () => void
}) {
  const { nameOf, playerById } = useStore()
  const [sai, setSai] = useState<string | null>(null)

  const candidatas = jogadorasDoPlay
    .filter((id) => !noTime.includes(id))
    .sort((a, b) => {
      const oa = ocupadas.has(a) ? 1 : 0
      const ob = ocupadas.has(b) ? 1 : 0
      // livres primeiro, e entre elas quem esta fora ha mais tempo
      return oa - ob || (espera.get(a) ?? 0) - (espera.get(b) ?? 0)
    })

  if (!sai) {
    return (
      <Modal title="Quem sai da partida?" onClose={onClose}>
        <div className="stack">
          {noTime.map((id) => (
            <button key={id} className="duo-row" onClick={() => setSai(id)}>
              <Avatar player={playerById(id)} size={38} />
              <span className="grow ellipsis" style={{ fontWeight: 700 }}>{nameOf(id)}</span>
              {ocupadas.has(id) && <Situacao id={id} ocupadas={ocupadas} jogando={jogando} />}
            </button>
          ))}
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`Quem entra no lugar de ${nameOf(sai)}?`} onClose={onClose}>
      <button className="btn ghost sm" style={{ marginBottom: 10 }} onClick={() => setSai(null)}>
        ‹ escolher outra
      </button>
      {candidatas.length === 0 ? (
        <Empty icon="👯">Todas as jogadoras já estão nesta partida.</Empty>
      ) : (
        <div className="stack">
          {candidatas.map((id) => (
            <button key={id} className="duo-row" onClick={() => onTrocar(sai, id)}>
              <Avatar player={playerById(id)} size={38} />
              <span className="grow ellipsis" style={{ fontWeight: 700 }}>{nameOf(id)}</span>
              <Situacao id={id} ocupadas={ocupadas} jogando={jogando} />
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}

/** Escolher na mao qual partida da fila entra nesta quadra. */
function EscolherPartida({
  quadra,
  partidas,
  ocupadas,
  espera,
  grupoDe,
  totalGrupos,
  onEscolher,
  onClose,
}: {
  quadra: number
  partidas: Match[]
  ocupadas: Set<string>
  espera: Map<string, number>
  grupoDe: Map<string, number>
  totalGrupos: number
  onEscolher: (m: Match) => void
  onClose: () => void
}) {
  const { nameOf } = useStore()
  const ordenadas = [...partidas].sort((a, b) => {
    const la = jogadorasDaPartida(a).every((id) => !ocupadas.has(id)) ? 0 : 1
    const lb = jogadorasDaPartida(b).every((id) => !ocupadas.has(id)) ? 0 : 1
    const ea = jogadorasDaPartida(a).reduce((t, id) => t + (espera.get(id) ?? 0), 0)
    const eb = jogadorasDaPartida(b).reduce((t, id) => t + (espera.get(id) ?? 0), 0)
    return la - lb || ea - eb || a.round - b.round
  })

  return (
    <Modal title={`Qual partida entra na quadra ${quadra}?`} onClose={onClose}>
      <p className="tiny muted" style={{ marginTop: 0 }}>
        As de cima são as que têm as quatro meninas livres e esperando há mais tempo.
      </p>
      <div className="stack">
        {ordenadas.slice(0, 30).map((m) => {
          const presas = jogadorasDaPartida(m).filter((id) => ocupadas.has(id))
          return (
            <button key={m.id} className="duo-row" onClick={() => onEscolher(m)} disabled={presas.length > 0}>
              <span className="fila-num">
                {m.round}
                <GrupoTag grupo={(m.fase ?? 1) >= 2 ? undefined : grupoDe.get(m.team_a[0])} total={totalGrupos} />
              </span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="fila-time">{nameOf(m.team_a[0])} + {nameOf(m.team_a[1])}</span>
                <span className="fila-time">{nameOf(m.team_b[0])} + {nameOf(m.team_b[1])}</span>
                {presas.length > 0 && (
                  <span className="tiny" style={{ color: 'var(--orange)' }}>
                    ⏳ {presas.map(nameOf).join(', ')} em quadra
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}


/**
 * A jogadora foi escolhida para o play mas esta devendo.
 *
 * Em vez de so bloquear, resolve na hora: confirma o pagamento ou corrige a
 * categoria -- porque quase sempre o bloqueio e cadastro errado (a convidada
 * que virou mensalista e ninguem trocou), nao inadimplencia de verdade. Mandar
 * a pessoa ate a aba Meninas e voltar faria perder a lista ja montada.
 */
function ResolverCadastro({
  jogadora,
  onClose,
  onLiberada,
}: {
  jogadora: Player
  onClose: () => void
  onLiberada: (p: Player) => void
}) {
  const { data, savePlayer } = useStore()
  const sit = situacaoDoAtleta(jogadora, data)
  const atual = categoriaDe(jogadora)

  async function pagar() {
    const p = confirmarPagamento(jogadora)
    await savePlayer(p)
    onLiberada(p)
  }

  async function mudarPara(c: Categoria) {
    // trocar de categoria zera o pagamento; virando convidada ja fica liberada
    const p: Player = { ...jogadora, categoria: c, pago_mes: null, pago_avulso: false }
    await savePlayer(p)
    if (situacaoDoAtleta(p, data).liberado) onLiberada(p)
    else onClose()
  }

  return (
    <Modal title={jogadora.nickname?.trim() || jogadora.name} onClose={onClose}>
      <div className="banner err" style={{ marginTop: 0 }}>
        🔴 <strong>{sit.rotulo}.</strong> {sit.comoResolver}
      </div>

      <button className="btn pink block" style={{ marginTop: 12 }} onClick={() => void pagar()}>
        ✅ Confirmar pagamento e escalar
      </button>
      <p className="tiny muted" style={{ marginTop: 6 }}>
        {atual === 'avulsa'
          ? 'Vale para este play; depois ela volta a aparecer como devendo.'
          : 'Vale até o fim do mês; na virada ela volta a aparecer como devendo.'}
      </p>

      <div className="section-title" style={{ fontSize: 13, marginTop: 14 }}>
        Ou corrija a categoria
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {CATEGORIAS.filter((c) => c.valor !== atual).map((c) => (
          <button key={c.valor} className="btn ghost block sm" onClick={() => void mudarPara(c.valor)}>
            {c.rotulo} — {c.explica}
          </button>
        ))}
      </div>

      <button className="btn ghost block sm" style={{ marginTop: 12 }} onClick={onClose}>
        Deixar de fora deste play
      </button>
    </Modal>
  )
}


/** Em uma frase: quantas duplas entram, quem fica de fora e onde comeca. */
function descreverFase2(grupos: string[][], duplasMM: number): string {
  const gente = grupos.reduce((t, g) => t + g.length, 0)
  const possiveis = Math.floor(gente / 2)
  const duplas = Math.min(possiveis, Math.max(2, duplasMM))
  const foraDoMataMata = gente - duplas * 2
  if (duplas < 2) return 'Poucas jogadoras para o mata-mata.'

  // com o total fora da potencia de 2, as melhores passam de bye
  let cabe = 1
  while (cabe < duplas) cabe *= 2
  const byes = cabe - duplas
  // o artigo vem junto do nome: "comeca em a semifinal" nao existe
  const nome =
    cabe === 2 ? 'na final' : cabe === 4 ? 'na semifinal' : cabe === 8 ? 'nas quartas' : `em ${cabe} duplas`
  const jogos = duplas - 1 // mata-mata: cada jogo elimina uma dupla

  return (
    `${duplas} duplas no mata-mata` +
    (foraDoMataMata > 0
      ? ` — as ${foraDoMataMata} piores da fase de grupos ficam de fora.`
      : ' — todo mundo entra.') +
    ` Começa ${nome}` +
    (byes > 0 ? `, com ${byes === 1 ? 'uma dupla passando' : `${byes} duplas passando`} de bye.` : '.') +
    ` São ${jogos} jogos até a campeã.`
  )
}

/**
 * Confronto direto, como ultimo criterio antes do alfabetico.
 *
 * Vale so dentro do grupo: na fase de grupos cada uma joga COM todas, entao duas
 * empatadas quase sempre ja se enfrentaram -- de lados opostos, com parceiros
 * diferentes. Quem levou a melhor nesses jogos fica na frente.
 *
 * Nao mexe em quem ja estava separado por pontos, diferenca de games ou
 * vitorias: so reordena blocos que empataram nos tres.
 */
function desempatarNoConfronto(rank: PlayerStat[], ms: Match[]): PlayerStat[] {
  const iguais = (a: PlayerStat, b: PlayerStat) =>
    a.points === b.points && balance(a) === balance(b) && a.wins === b.wins

  /** Saldo de games de `a` nas partidas em que enfrentou `b`. */
  const direto = (a: string, b: string): number => {
    let saldo = 0
    for (const m of ms) {
      if (m.score_a === null || m.score_b === null) continue
      const aEmA = m.team_a.includes(a)
      const bEmA = m.team_a.includes(b)
      if (aEmA === bEmA) continue // mesmo lado (ou fora): nao foi confronto
      saldo += aEmA ? m.score_a - m.score_b : m.score_b - m.score_a
    }
    return saldo
  }

  const out: PlayerStat[] = []
  let i = 0
  while (i < rank.length) {
    let j = i + 1
    while (j < rank.length && iguais(rank[i], rank[j])) j++
    const bloco = rank.slice(i, j)
    if (bloco.length > 1) {
      bloco.sort((x, y) => direto(y.player_id, x.player_id) - direto(x.player_id, y.player_id))
    }
    out.push(...bloco)
    i = j
  }
  return out
}

/**
 * O mata-mata do dia: o podio e a campanha de cada dupla.
 *
 * A ordem sai de `rankDuplasDoDia`, a mesma que decide quem segura o 🔥 --
 * um podio na tela que nao bate com o que vale para a sequencia seria bug
 * esperando para ser reportado.
 */
function DuplasDoDia({ linhas }: { linhas: DuplaDoDia[] }) {
  const { nameOf, playerById } = useStore()
  if (linhas.length === 0) return null

  const medalhas = ['🥇', '🥈', '🥉']
  const podio = linhas.slice(0, DUPLAS_NO_PODIO)

  return (
    <>
      <div className="section-title" style={{ fontSize: 13 }}>🏆 Pódio do dia</div>
      <div className="stack" style={{ gap: 8 }}>
        {podio.map((d, i) => (
          <div key={d.key} className={`podio-dupla p${i + 1}`}>
            <span style={{ fontSize: 22 }}>{medalhas[i]}</span>
            <Avatar player={playerById(d.a)} size={30} />
            <Avatar player={playerById(d.b)} size={30} />
            <span className="grow" style={{ minWidth: 0 }}>
              <strong className="ellipsis" style={{ display: 'block' }}>
                {nameOf(d.a)} + {nameOf(d.b)}
              </strong>
              <span className="tiny muted">
                {d.medalha === 3
                  ? 'dupla campeã do dia'
                  : d.medalha === 2
                    ? 'vice-campeã do dia'
                    : d.medalha === 1
                      ? 'venceu a disputa de 3º'
                      : `caiu ${d.saiuEm}`}{' '}
                · {d.wins}V {d.losses}D
              </span>
            </span>
            <span className="nowrap" style={{ fontWeight: 800 }}>{d.points} pts</span>
          </div>
        ))}
      </div>
      <p className="tiny muted" style={{ marginTop: 6 }}>
        Quem está nestas três duplas segura a sequência 🔥 do dia.
      </p>

      <div className="section-title" style={{ fontSize: 13, marginTop: 14 }}>
        🤝 Todas as duplas do mata-mata
      </div>
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th style={{ textAlign: 'left' }}>Dupla</th>
              <th>V</th>
              <th>D</th>
              <th>Pts</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((d, i) => (
              <tr key={d.key}>
                <td className={`rank-pos top${i + 1}`} style={{ fontWeight: 800 }}>{i + 1}</td>
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    <Avatar player={playerById(d.a)} size={24} />
                    <Avatar player={playerById(d.b)} size={24} />
                    <span className="ellipsis">
                      {nameOf(d.a)} + {nameOf(d.b)}
                    </span>
                  </div>
                </td>
                <td>{d.wins}</td>
                <td>{d.losses}</td>
                <td style={{ fontWeight: 800, color: 'var(--marca)' }}>{d.points}</td>
                <td>{d.saldo > 0 ? `+${d.saldo}` : d.saldo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted" style={{ marginTop: 6 }}>
        A ordem é até onde a dupla chegou; vitórias e saldo só desempatam dentro da mesma
        fase. Na tabela individual as duas de uma dupla empatam em tudo — ganharam e perderam
        as mesmas partidas —, e é por isso que a dupla é a medida do dia aqui.
      </p>
    </>
  )
}

/**
 * Placar digitado na mao, para o que os botoes nao cobrem.
 *
 * A conferencia nao e enfeite: um placar impossivel (um 8x5 num tie de 7)
 * entraria no ranking e no calculo de forca como se fosse real, e ninguem
 * notaria depois. Por isso o botao so libera quando o placar fecha com a
 * regra, e a frase diz qual seria o certo.
 */
function PlacarManual({
  vencedora,
  perdedora,
  valida,
  explica,
  onConfirmar,
  onCancelar,
}: {
  vencedora: string
  perdedora: string
  valida: (a: number, b: number) => boolean
  explica: (a: number, b: number) => string | null
  onConfirmar: (doVencedor: number, doPerdedor: number) => void
  onCancelar: () => void
}) {
  const [aTexto, setA] = useState('')
  const [bTexto, setB] = useState('')
  const a = Number(aTexto)
  const b = Number(bTexto)
  const preenchido = aTexto.trim() !== '' && bTexto.trim() !== ''
  const ok = preenchido && valida(a, b)
  const erro = preenchido ? explica(a, b) : null

  return (
    <div className="placar-manual">
      <div className="row" style={{ gap: 8 }}>
        <label className="field grow" style={{ marginBottom: 0 }}>
          <span className="ellipsis">{vencedora}</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            value={aTexto}
            autoFocus
            onChange={(e) => setA(e.target.value)}
          />
        </label>
        <label className="field grow" style={{ marginBottom: 0 }}>
          <span className="ellipsis">{perdedora}</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            value={bTexto}
            onChange={(e) => setB(e.target.value)}
          />
        </label>
      </div>

      {erro && (
        <p className="tiny" style={{ color: 'var(--danger)', marginTop: 8, marginBottom: 0 }}>
          {erro}
        </p>
      )}

      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn ghost grow sm" onClick={onCancelar}>Cancelar</button>
        <button className="btn pink grow sm" disabled={!ok} onClick={() => onConfirmar(a, b)}>
          Confirmar {ok ? `${a}x${b}` : ''}
        </button>
      </div>
    </div>
  )
}


/** O modal do entra/sai: quem sai, quem entra e onde entra. */
function SubstituirJogadora({
  session,
  onClose,
  onAplicar,
}: {
  session: PlaySession
  onClose: () => void
  onAplicar: (p: {
    sai: string | null
    entra: { id: string } | { nome: string } | null
    onde: 'lugar' | 'auto' | 'grupo'
    grupo: number
  }) => void
}) {
  const { data, nameOf } = useStore()
  const [sai, setSai] = useState<string>('')
  const [modo, setModo] = useState<'ninguem' | 'cadastrada' | 'nova'>('cadastrada')
  const [entraId, setEntraId] = useState<string>('')
  const [nome, setNome] = useState('')
  const [onde, setOnde] = useState<'lugar' | 'auto' | 'grupo'>('lugar')
  const [grupo, setGrupo] = useState(0)

  const grupos = session.groups ?? []
  const emFase2 = Boolean(session.duos?.length)
  const noPlay = new Set(session.player_ids)
  const fora = [...data.players]
    .filter((p) => p.active && !noPlay.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const entra = modo === 'ninguem' ? null : modo === 'nova' ? nome.trim() : entraId
  const temEntra = Boolean(entra)
  const temSai = Boolean(sai)

  // "no lugar" precisa de alguem saindo E alguem entrando; na fase 2 (duplas
  // fixas) e o unico jeito, porque a fila nao e mais um rodizio
  const podeLugar = temSai && temEntra
  const podeRefazer = !emFase2 && (temSai || temEntra)
  const ondeValido =
    onde === 'lugar' ? podeLugar : onde === 'grupo' ? podeRefazer && grupos.length > 1 && temEntra : podeRefazer
  const pronto = (temSai || temEntra) && (temEntra ? ondeValido : podeRefazer)

  return (
    <Modal title="🔁 Entra / sai" onClose={onClose}>
      <div className="field">
        <span>Quem sai</span>
        <select className="select" value={sai} onChange={(e) => setSai(e.target.value)}>
          <option value="">ninguém sai — só entra alguém</option>
          {session.player_ids.map((id) => (
            <option key={id} value={id}>{nameOf(id)}</option>
          ))}
        </select>
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <span>Quem entra</span>
        <div className="chips-scroll">
          {(
            [
              ['cadastrada', '👤 Já cadastrada'],
              ['nova', '➕ Alguém de fora'],
              ['ninguem', '🚪 Ninguém — só sai'],
            ] as const
          ).map(([v, r]) => (
            <button
              key={v}
              type="button"
              className={`chip ${modo === v ? 'on' : 'off'}`}
              style={{ flex: 'none' }}
              onClick={() => setModo(v)}
            >
              {r}
            </button>
          ))}
        </div>
        {modo === 'cadastrada' && (
          <select className="select" style={{ marginTop: 8 }} value={entraId} onChange={(e) => setEntraId(e.target.value)}>
            <option value="">escolha…</option>
            {fora.map((p) => (
              <option key={p.id} value={p.id}>{p.nickname?.trim() || p.name}</option>
            ))}
          </select>
        )}
        {modo === 'nova' && (
          <>
            <input
              className="input"
              style={{ marginTop: 8 }}
              placeholder="Nome de quem entra"
              value={nome}
              autoFocus
              onChange={(e) => setNome(e.target.value)}
            />
            <em className="hint" style={{ marginTop: 6 }}>
              Entra no cadastro agora, como isenta e com a força inicial padrão — dá para ajustar
              depois no perfil.
            </em>
          </>
        )}
      </div>

      {temEntra && (
        <div className="field" style={{ marginTop: 12 }}>
          <span>Onde ela entra</span>
          <div className="stack" style={{ gap: 6 }}>
            <label className={`fase-box${!podeLugar ? ' off' : ''}`} style={{ gap: 8 }}>
              <input type="radio" checked={onde === 'lugar'} disabled={!podeLugar} onChange={() => setOnde('lugar')} />
              <span>
                <strong>No lugar de quem saiu</strong>
                <br />
                <span className="tiny muted">herda as partidas que ainda não foram jogadas; nada mais muda</span>
              </span>
            </label>
            <label className={`fase-box${!podeRefazer ? ' off' : ''}`} style={{ gap: 8 }}>
              <input type="radio" checked={onde === 'auto'} disabled={!podeRefazer} onChange={() => setOnde('auto')} />
              <span>
                <strong>Deixar o app encaixar</strong>
                <br />
                <span className="tiny muted">
                  {grupos.length > 1 ? 'vai para o grupo de força mais parecida, e ' : ''}a fila que ainda
                  não aconteceu é refeita com ela
                </span>
              </span>
            </label>
            {grupos.length > 1 && (
              <label className={`fase-box${!podeRefazer ? ' off' : ''}`} style={{ gap: 8 }}>
                <input type="radio" checked={onde === 'grupo'} disabled={!podeRefazer} onChange={() => setOnde('grupo')} />
                <span className="grow">
                  <strong>Escolher o grupo</strong>
                  {onde === 'grupo' && (
                    <select className="select" style={{ marginTop: 6 }} value={grupo} onChange={(e) => setGrupo(Number(e.target.value))}>
                      {grupos.map((g, i) => (
                        <option key={i} value={i}>Grupo {i + 1} · {g.length} jogadoras</option>
                      ))}
                    </select>
                  )}
                </span>
              </label>
            )}
          </div>
          {emFase2 && (
            <em className="hint" style={{ marginTop: 6 }}>
              As duplas fixas já estão formadas: aqui só dá para entrar no lugar de quem sai.
            </em>
          )}
        </div>
      )}

      {!temEntra && temSai && emFase2 && (
        <div className="banner warn" style={{ marginTop: 8 }}>
          Com as duplas fixas formadas, alguém precisa entrar no lugar dela — senão a dupla fica sem par.
        </div>
      )}

      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <button className="btn ghost grow" onClick={onClose}>Cancelar</button>
        <button
          className="btn pink grow"
          disabled={!pronto}
          onClick={() =>
            onAplicar({
              sai: sai || null,
              entra: modo === 'ninguem' ? null : modo === 'nova' ? { nome } : { id: entraId },
              onde,
              grupo,
            })
          }
        >
          Aplicar
        </button>
      </div>
    </Modal>
  )
}
