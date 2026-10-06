import { useCallback, useEffect, useMemo, useState } from 'react'
import { AvisoDoBanco } from '../components/AvisoDoBanco'
import ClassificacaoDosGrupos from '../components/ClassificacaoDosGrupos'
import DesempateEmQuadra from '../components/DesempateEmQuadra'
import DivisaoDoCampeonato from '../components/DivisaoDoCampeonato'
import {
  PONTUACAO_PADRAO,
  aplicarMovidasNoCampeonato,
  categoriaDaJogadora,
  categoriaDaPartida,
  categoriaTerminou,
  categoriasDoPlay,
  colocacoesDaCategoria,
  duosDaCategoria,
  pontosDeColocacao,
  quadrasEfetivas,
  separarParaRefazer,
  dividirEmCategorias,
  esperamOTerceiroLugar,
  estimativaDaNoite,
  minutosRestantesDaChave,
  montarCategorias,
} from '../lib/campeonato'
import ImportarLista from '../components/ImportarLista'
import { Avatar, Empty, Modal, StatBox, Stepper, baixarOuCompartilhar, shareOrCopy } from '../components/ui'
import {
  duplasDaFase2,
  duplasVivas,
  aplicarAjustesDeGrupo,
  duplasQueEntraram,
  formarGrupos,
  gerarFila,
  nomeDaRodada,
  rodadaDoMataMata,
  type PlannedMatch,
  jogadorasDaPartida,
  ordemDeEspera,
  jogosDoRodizio,
  parceirasDoRodizio,
  repeticoesPorJogadora,
  partidasDoRodizio,
  quadrasSimultaneas,
  planToMatches,
  refazerFila,
} from '../lib/pairing'
import { normalizar } from '../lib/roster'
import { dayRankingText, scheduleText } from '../lib/share'
import { isPlayed, matchPoints } from '../lib/scoring'
import {
  loadAusentes,
  loadFins,
  loadInicios,
  saveAusentes,
  saveFins,
  saveInicios,
  type Horarios,
} from '../lib/emQuadra'
import {
  aplicarBye,
  buildHistory,
  computeStats,
  type CriterioDoDia,
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
  aplicarColocacao,
  computeStatsComPontos,
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
import { filaPorGrupo, precisaRefazer, proximasPelaFila } from '../lib/fila'
import { hasSupabase, supabase } from '../lib/supabase'
import { avisosDoBanco } from '../data/supabaseRepo'
import {
  type DesempateDeGrupo,
  type EventoDoPlay,
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
/** O formato escolhido na tela: o campeonato e um `grupos-duplas` com categorias. */
type FormatoDaTela = PlayFormat | 'campeonato'

const FORMATOS: { valor: FormatoDaTela; rotulo: string; explica: string }[] = [
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
    valor: 'campeonato',
    rotulo: '🏆 Campeonato',
    explica: 'categorias por nível (A, B, C…), grupos em cada uma, duplas fixas e mata-mata, com pódio por categoria',
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
              const categorias = s.categorias?.length ?? 0
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
                      {categorias > 1 ? ` · ${categorias} categorias` : grupos > 1 ? ` · ${grupos} grupos` : ''} · {done}/{ms.length} partidas
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
  const [format, setFormat] = useState<FormatoDaTela>(
    (preset.categorias?.length ?? 0) > 1 ? 'campeonato' : (preset.format ?? 'todas'),
  )
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
  const emCampeonato = format === 'campeonato'
  const emDuplas = format === 'grupos-duplas' || emCampeonato
  /** Campeonato: quantas categorias e quantos grupos em cada uma. */
  const [nCategorias, setNCategorias] = useState(3)
  const [gruposPorCategoria, setGruposPorCategoria] = useState(2)
  /** Campeonato: quantas quadras cada categoria tem (null = dividir o total por igual). */
  const [qtdQuadrasEditada, setQtdQuadras] = useState<number[] | null>(null)
  /** Campeonato: ajustes na mao, menina -> categoria e grupo. */
  const [movidasCat, setMovidasCat] = useState<Record<string, { c: number; g: number }>>({})
  /** Pontos do mes por colocacao (grupos+duplas e campeonato). */
  const [pontuacao, setPontuacao] = useState<number[]>(preset.pontuacao ?? PONTUACAO_PADRAO)
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
    // grupos POR NIVEL tambem no grupos+duplas: com grupos equilibrados a 1a de
    // cada grupo era uma das mais fortes do dia, e "1a com 1a" virava uma
    // superdupla. Por nivel, a dupla das primeiras e favorita sem ser imbativel
    if (format === 'grupos' || format === 'grupos-duplas') return formarGrupos(selected, forca, porGrupo, sorteio)
    return [selected]
  }, [format, selected, forca, porGrupo, sorteio])
  /** Campeonato: [categoria][grupo][ids], ja com os ajustes na mao. */
  const estrutura = useMemo(
    () =>
      emCampeonato
        ? aplicarMovidasNoCampeonato(
            dividirEmCategorias(selected, forca, nCategorias, gruposPorCategoria, sorteio),
            movidasCat,
          )
        : [],
    [emCampeonato, selected, forca, nCategorias, gruposPorCategoria, sorteio, movidasCat],
  )
  /**
   * Quantas quadras cada categoria tem. O padrao e o que os grupos dela enchem
   * ao mesmo tempo (2 grupos de 4 = 2 quadras): no campeonato o numero de
   * quadras e por categoria, e a organizadora so mexe se tiver menos.
   */
  const qtdQuadras = useMemo(() => {
    const base = qtdQuadrasEditada ?? estrutura.map((gs) => Math.max(1, quadrasSimultaneas(gs.map((g) => g.length))))
    return Array.from({ length: nCategorias }, (_, i) => base[i] ?? 1)
  }, [qtdQuadrasEditada, nCategorias, estrutura])
  const grupos = useMemo(
    () => (emCampeonato ? estrutura.flat() : aplicarAjustesDeGrupo(gruposBase, movidas)),
    [emCampeonato, estrutura, gruposBase, movidas],
  )
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
    setMovidasCat({})
    setMovendo(null)
  }

  /** Campeonato: menina para outra categoria e grupo (o grupo de onde sai nao fica com menos de 4). */
  function moverNoCampeonato(id: string, c: number, g: number) {
    const de = estrutura.flat().find((x) => x.includes(id))
    if (de && de.length <= 4) {
      onToast('O grupo dela ficaria com menos de 4 -- não dá para tirar ninguém dele')
      return
    }
    setMovidasCat((m) => ({ ...m, [id]: { c, g } }))
    setMovendo(null)
  }

  /**
   * Campeonato: as quadras de cada categoria, numeradas em sequencia (A nas
   * primeiras), sem passar do que os grupos dela enchem ao mesmo tempo -- uma
   * quadra a mais so ficaria parada.
   */
  const quadrasDoCampeonato = useMemo(() => {
    let proxima = 1
    return estrutura.map((gs, c) => {
      const cabem = Math.max(1, quadrasSimultaneas(gs.map((g) => g.length)))
      const qtd = Math.min(qtdQuadras[c] ?? 1, cabem)
      const qs = Array.from({ length: qtd }, (_, i) => proxima + i)
      proxima += qtd
      return qs
    })
  }, [estrutura, qtdQuadras])

  // as quadras saem dos GRUPOS, nao do total: cada partida precisa de quatro do
  // mesmo grupo, entao dois grupos de 6 (12 meninas) enchem duas quadras e nao
  // tres, e sobram duas de cada grupo esperando
  const maxCourts = quadrasSimultaneas(tamanhos)
  // no campeonato as quadras sao por categoria, e quem decide e o cartao delas
  const effCourts = emCampeonato
    ? quadrasDoCampeonato.reduce((t, q) => t + q.length, 0)
    : Math.min(courts, maxCourts)
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
  /**
   * Com fases (grupos + duplas, campeonato), o tempo conta tambem o mata-mata,
   * rodada por rodada, com os games e o desempate de cada fase -- antes so a
   * fase de grupos entrava, e a noite parecia bem mais curta.
   */
  const tempoComFases = useMemo(() => {
    if (!emDuplas || selected.length < 8) return null
    return estimativaDaNoite({
      grupos: emCampeonato ? estrutura.map((c) => c.map((g) => g.length)) : [tamanhos],
      quadras: emCampeonato ? quadrasDoCampeonato.map((q) => q.length) : [effCourts],
      duplasMM,
      minutos: alvos.map((a, i) => minutosDaPartida(a, lerRegra(desempates[i] ?? 'nenhum'))),
    })
  }, [emDuplas, emCampeonato, selected.length, estrutura, tamanhos, quadrasDoCampeonato, effCourts, duplasMM, alvos, desempates])

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
    // sem o script 21 o banco descartaria as categorias e a tabela de pontos
    // calado, e o campeonato viraria um grupos+duplas comum. Pergunta ao banco
    // antes (a copia local nao serve: um play criado agora traz a chave mesmo
    // sem a coluna existir la)
    if (emDuplas && hasSupabase && supabase) {
      const { error } = await supabase.from('sessions').select('categorias, pontuacao, desempates_grupo, quadras_cedidas').limit(1)
      if (error) {
        onToast('Antes, rode o script 21-campeonato.sql no Supabase (pasta supabase/)')
        return
      }
    }
    if (emCampeonato && selected.length < nCategorias * gruposPorCategoria * 4) {
      onToast('Faltam meninas para essas categorias -- cada grupo precisa de pelo menos 4')
      return
    }
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
      const camp = emCampeonato ? montarCategorias(estrutura, quadrasDoCampeonato) : null
      const fila = gerarFila({
        playerIds: selected,
        ratings: forca,
        history: buildHistory(playedMatches(data)),
        groups: emGrupos ? (camp ? camp.groups : grupos) : undefined,
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
        groups: camp ? camp.groups : emGrupos ? grupos : null,
        categorias: camp ? camp.categorias : null,
        // pontos do mes pela colocacao final; plays antigos nao tem e seguem pelo placar
        pontuacao: emGrupos && emDuplas && ranked ? pontuacao : null,
        // todo play novo premia quem venceu mais; os antigos seguem por pontos
        criterio_dia: 'vitorias',
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
                if (f.valor === 'grupos-duplas' && format !== 'grupos-duplas') setPorGrupo(4)
                if (f.valor === 'grupos' && format !== 'grupos') setPorGrupo(8)
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

      {emCampeonato && (
        <DivisaoDoCampeonato
          estrutura={estrutura}
          forca={forca}
          nameOf={nameOf}
          classeDoGrupo={classeDoGrupo}
          movendo={movendo}
          setMovendo={setMovendo}
          onMover={moverNoCampeonato}
          movidas={movidasCat}
          nCategorias={nCategorias}
          setNCategorias={(n) => { setNCategorias(n); setQtdQuadras(null); setMovidasCat({}) }}
          gruposPorCategoria={gruposPorCategoria}
          setGruposPorCategoria={(n) => { setGruposPorCategoria(n); setMovidasCat({}) }}
          qtdQuadras={qtdQuadras}
          setQtdQuadras={setQtdQuadras}
          onSortear={sortearDeNovo}
          onDesfazer={() => setMovidasCat({})}
          selecionadas={selected.length}
        />
      )}

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
            {!emCampeonato && <div className="field">
              <span>Quadras</span>
              <Stepper value={courts} min={1} max={12} onChange={setCourts} />
              <em className={`hint${selected.length >= 4 && effCourts < courts ? ' aviso' : ''}`}>
                {selected.length < 4
                  ? 'cada quadra comporta 4 meninas por vez'
                  : effCourts < courts
                    ? `só dá para usar ${effCourts}`
                    : 'quadras disponíveis hoje'}
              </em>
            </div>}
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
                <span>Duplas no mata-mata{emCampeonato ? ', em cada categoria' : ''}</span>
                <Stepper value={duplasMM} min={2} max={16} onChange={setDuplasMM} />
                <em className="hint">
                  {emCampeonato
                    ? `na categoria A: ${descreverFase2(estrutura[0] ?? [], duplasMM)}`
                    : descreverFase2(grupos, duplasMM)}
                </em>
              </div>
            </div>
          )}

          <div className={`toggle-card${ranked ? '' : ' avulso'}`}>
            <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} />
              <span className="grow">
                <strong>{ranked ? '🏆 Vale para o ranking do mês' : '🎈 Play avulso'}</strong>
                <span className="hint" style={{ marginTop: 2 }}>
                  {ranked
                    ? 'os pontos entram no ranking do mês e as sequências 🔥 correm normalmente'
                    : 'não soma pontos no ranking do mês e não mexe nas sequências 🔥 — mas conta no histórico da jogadora e no equilíbrio das duplas dos próximos plays'}
                </span>
              </span>
            </label>
          </div>

          {emDuplas && ranked && (
            <div className="toggle-card">
              <div className="field" style={{ marginBottom: 0 }}>
                <span>Pontos no mês, pela colocação</span>
                <div className="grid2">
                  {['🥇 Campeã', '🥈 Vice', '🥉 3º lugar', 'Semifinal', 'Quartas ou antes', 'Fase de grupos'].map((rotulo, i) => (
                    <div key={rotulo} className="field" style={{ marginBottom: 0 }}>
                      <span>{rotulo}</span>
                      <Stepper
                        value={pontuacao[i] ?? 0}
                        min={0}
                        max={40}
                        onChange={(v) => setPontuacao((p) => p.map((x, k) => (k === i ? v : x)))}
                      />
                    </div>
                  ))}
                </div>
                <em className="hint">
                  Cada menina leva os pontos de até onde a dupla dela chegou{emCampeonato ? ', em cada categoria' : ''}. As
                  partidas não pontuam pelo placar: assim o título sempre vale mais que atropelar na semifinal.
                </em>
              </div>
            </div>
          )}

          {(format === 'grupos' || format === 'grupos-duplas') && (
            <div className="toggle-card">
              <div className="field" style={{ marginBottom: 0 }}>
                <span>Meninas por grupo</span>
                <Stepper value={porGrupo} min={4} max={12} onChange={setPorGrupo} />
                <em className="hint">
                  {selected.length < 8
                    ? 'com menos de 8 confirmadas não dá para dividir: vai sair um grupo só'
                    : `com ${selected.length} confirmadas o app monta ${descreverGrupos(tamanhos)} — grupo 1 com quem está jogando melhor`}
                </em>
              </div>
            </div>
          )}


          {(format === 'grupos' || format === 'grupos-duplas') && grupos.length > 1 && (
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

      {selected.length >= 4 && !(emDuplas && tamanhos.some((t) => t < 4)) && (
        <div className="card">
          <div className="section-title">📋 Como vai ser a noite</div>
          <div className="stack" style={{ gap: 6 }}>
            {/* as partidas: quantas por menina, o total e quanto tempo */}
            <div className="small">
              🎾 {emDuplas ? 'Na fase de grupos, cada' : 'Cada'} menina joga{' '}
              <strong>
                {jogosMin === jogosMax ? `${jogosMin} partidas` : `${jogosMin} a ${jogosMax} partidas`}
              </strong>{' '}
              ({totalPartidas} no total)
              {emDuplas && tempoComFases ? (
                <>
                  ; depois as duplas fixas vão para o mata-mata. ⏱️ Grupos uns{' '}
                  {formatarMinutos(Math.max(...tempoComFases.categorias.map((c) => c.grupos)))}, mata-mata uns{' '}
                  {formatarMinutos(Math.max(...tempoComFases.categorias.map((c) => c.mataMata)))} —{' '}
                  <strong>a noite toda, uns {formatarMinutos(tempoComFases.total)}</strong>
                  {emCampeonato ? ' (as categorias jogam ao mesmo tempo)' : ''}.
                </>
              ) : (
                <>
                  , uns <strong>{duracaoEstimada(totalPartidas, effCourts, minutosDaNoite)}</strong>.
                </>
              )}
            </div>
            {/* as duplas */}
            <div className="small">
              🤝 Faz dupla com{' '}
              {parceirasMin === parceirasMax ? `as outras ${parceirasMin}` : `${parceirasMin} a ${parceirasMax} parceiras`}
              {grupos.length > 1 ? ' do grupo' : ''}, uma vez com cada
              {repetem > 0 ? ` — e repete ${repetem === 1 ? '1 parceira' : `${repetem} parceiras`}, a mesma quantidade para todas` : ''}.
              {emDuplas && ' No mata-mata, 1ª com 1ª dos grupos.'}
            </div>
            {/* as quadras e o descanso */}
            <div className="small">
              🏐{' '}
              {emCampeonato ? (
                <>
                  Quadras:{' '}
                  {quadrasDoCampeonato
                    .map((q, c) => `${String.fromCharCode(65 + c)} ${q.length === 1 ? q[0] : `${q[0]}–${q[q.length - 1]}`}`)
                    .join(' · ')}
                  .
                </>
              ) : (
                <>
                  <strong>{plural(effCourts, 'quadra')}</strong> ao mesmo tempo
                  {restPorVez > 0 ? `, ${restPorVez} descansando por vez` : ''}.
                </>
              )}
              {/* o revezamento so faz sentido falar por grupo quando ha grupos */}
              {grupos.length > 1 && <> {descreverFolga(tamanhos)}</>}
            </div>
            {/* como pontua */}
            <div className="small">
              🏆{' '}
              {!ranked
                ? 'Play avulso: não soma no ranking do mês nem mexe no 🔥.'
                : emDuplas
                  ? `Pontos do mês pela colocação final${emCampeonato ? ', em cada categoria' : ''}; o pódio (campeã, vice e 3º) segura o 🔥.`
                  : `Quem vence leva os games que fez menos os da adversária (mínimo 1). O dia é por vitórias; ${
                      grupos.length > 1
                        ? `o pódio é por grupo: sobem ${descreverPodios(tamanhos)}, que seguram o 🔥.`
                        : 'o pódio é o top 3, que segura o 🔥.'
                    }`}
            </div>
          </div>
          {/* UM aviso so, e so quando precisa da atencao de quem organiza */}
          {!emCampeonato && effCourts < courts ? (
            <div className="banner warn" style={{ margin: '10px 0 0' }}>
              🏐 Só dá para usar <strong>{plural(effCourts, 'quadra')}</strong>:{' '}
              {travadoPorGrupo
                ? `cada partida precisa de 4 meninas do mesmo grupo, e ${descreverGrupos(tamanhos)} enchem só ${effCourts} por vez. Para usar as ${courts}, aumente o tamanho do grupo (8 enchem 2 quadras, 12 enchem 3).`
                : `${courts} quadras pedem ${courts * 4} meninas jogando juntas, e são ${selected.length}.`}
            </div>
          ) : format === 'todas' && totalPartidas > 40 ? (
            <div className="banner warn" style={{ margin: '10px 0 0' }}>
              ⏱️ {totalPartidas} partidas é longo para uma noite: o modo <strong>em grupos</strong> resolve (grupos de 8 =
              7 partidas por menina).
            </div>
          ) : !emDuplas && restPorVez === 0 && grupos.length <= 1 && effCourts > 1 ? (
            <div className="banner warn" style={{ margin: '10px 0 0' }}>
              🪑 Ninguém fica de fora: a quadra que acabar primeiro espera as outras. Com {effCourts * 4 + 4} meninas
              (ou uma quadra a menos) todo mundo descansa entre um jogo e outro.
            </div>
          ) : null}
        </div>
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
  return formatarMinutos(Math.ceil(partidas / Math.max(1, quadras)) * Math.round(minutosPorPartida))
}

/**
 * O podio da chave so existe depois da final: antes disso, quem venceu a
 * semifinal sairia no texto e na arte como "campea do dia".
 */
function soComCampea(linhas: DuplaDoDia[]): DuplaDoDia[] {
  return linhas.some((d) => d.medalha === 3) ? linhas : []
}

/** "Grupo 3" -- ou, no campeonato, "B · grupo 1". */
function nomeDoGrupoNoPlay(session: PlaySession, i: number): string {
  const cats = categoriasDoPlay(session)
  if (cats.length <= 1) return `Grupo ${i + 1}`
  const c = cats.find((x) => x.grupos.includes(i))
  return c ? `${c.nome} · grupo ${c.grupos.indexOf(i) + 1}` : `Grupo ${i + 1}`
}

/** "45 min", "2h", "1h35". */
function formatarMinutos(total: number): string {
  const min = Math.round(total)
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

/** Duplas que jogam pela 2ª vez numa partida, e se isso era do plano (grupo que nao fecha) ou veio de troca na mao. */
type Repeticao = { duplas: string[]; planejada: boolean }

/** "21h23", no fuso do aparelho. */
function horaLocal(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`
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
  const { data, nameOf, playerById, canEdit, saveMatches, savePlayer, saveSession, anotarNoPlay, mesclarNoPlay, replaceSessionMatches } =
    useStore()
  const [showRank, setShowRank] = useState(false)
  const [substituindo, setSubstituindo] = useState(false)
  const [arte, setArte] = useState<{ url: string; blob: Blob } | null>(null)
  const [gerando, setGerando] = useState(false)
  /** Partida escolhida na mao para uma quadra, no lugar da sugestao. */
  /**
   * A partida escolhida na mao para cada quadra ("Trocar esta partida por
   * outra"). Fica no play (script 22), para o outro celular nao mostrar outra
   * partida na mesma quadra; sem a coluna, so neste aparelho.
   */
  const [manuaisLocais, setManuaisLocais] = useState<Record<number, string>>({})
  const manuais = useMemo<Record<number, string>>(
    () => ('escolhas' in session && !avisosDoBanco.colunas.has('sessions.escolhas') ? (session.escolhas ?? {}) : manuaisLocais) as Record<number, string>,
    [session, manuaisLocais],
  )
  function escolherNaMao(quadra: number, matchId: string | null) {
    mesclarNoPlay(session.id, { campo: 'escolhas', quadra: String(quadra), matchId })
    setManuaisLocais((prev) => {
      const next = { ...prev }
      if (matchId) next[quadra] = matchId
      else delete next[quadra]
      return next
    })
  }
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
  /** As categorias do campeonato; sem elas, uma so (o grupos+duplas de sempre). */
  const cats = useMemo(() => categoriasDoPlay(session), [session])
  const ehCampeonato = cats.length > 1
  /** A categoria de uma partida (sai de quem joga nela, como o grupo). */
  const catDe = useCallback((m: Match) => Math.max(0, categoriaDaPartida(cats, session.groups, m)), [cats, session.groups])

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
    // a rodada e da chave da categoria da partida: cada uma tem a sua
    const ci = catDe(m)
    const daCategoria = matches.filter((x) => catDe(x) === ci)
    const entraram = duplasQueEntraram(duosDaCategoria(session, ci), daCategoria, fase)
    if (entraram > 0) return nomeDaRodada(entraram)
    // sem as duplas gravadas (play antigo) sobra contar os jogos da fase
    const jogos = daCategoria.filter((x) => (x.fase ?? 1) === fase && !x.disputa_3o).length
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

  /** "Grupo 3" -- ou, no campeonato, "B · grupo 1". */
  const nomeDoGrupo = (i: number): string => {
    if (!ehCampeonato) return `Grupo ${i + 1}`
    const c = cats.find((x) => x.grupos.includes(i))
    return c ? `${c.nome} · grupo ${c.grupos.indexOf(i) + 1}` : `Grupo ${i + 1}`
  }

  /** CAMPEONATO: categoria de cada menina (1 = A), para colorir as listas como os grupos. */
  const categoriaDe = useMemo(() => {
    const map = new Map<string, number>()
    if (ehCampeonato) for (const id of session.player_ids) map.set(id, Math.max(0, categoriaDaJogadora(cats, session.groups, id)) + 1)
    return map
  }, [ehCampeonato, session.player_ids, session.groups, cats])

  /** O que a quadra mostra: no campeonato, o grupo (ou a rodada); a categoria vai na etiqueta. */
  const rotuloDaQuadra = (m: Match): string => {
    if (!ehCampeonato) return rotuloDaPartida(m)
    const cat = cats[catDe(m)]
    // a letra da categoria ja vai na etiqueta colorida ao lado do numero da quadra
    if ((m.fase ?? 1) >= 2) return rotuloDaPartida(m)
    const g = (session.groups ?? []).findIndex((x) => x.includes(m.team_a[0]))
    return `grupo ${cat.grupos.indexOf(g) + 1}`
  }

  /**
   * CAMPEONATO: quem cuida de uma categoria so ve as quadras e a fila dela.
   * E preferencia de quem olha, nao estado do play: fica no aparelho.
   */
  const chaveDoFiltro = `play-de-todas:filtro-categoria:${session.id}`
  const [filtroCat, setFiltroCatState] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(chaveDoFiltro)
      return v === null ? null : Number(v)
    } catch {
      return null
    }
  })
  function setFiltroCat(v: number | null) {
    setFiltroCatState(v)
    try {
      if (v === null) localStorage.removeItem(chaveDoFiltro)
      else localStorage.setItem(chaveDoFiltro, String(v))
    } catch {
      /* sem armazenamento: o filtro so nao fica lembrado */
    }
  }

  const alvoDe = (m: Match) => {
    const alvos = session.alvos
    if (!alvos?.length) return session.target
    return alvos[degrauDe(m)] ?? session.target
  }

  /**
   * A CHAVE DE CADA CATEGORIA.
   *
   * No campeonato cada categoria tem a sua fase de grupos, as suas duplas e o
   * seu mata-mata, e anda no seu ritmo: a C pode estar na final enquanto a A
   * ainda joga os grupos. Sem categorias o play e uma so -- o grupos+duplas de
   * sempre -- e tudo abaixo vale do mesmo jeito.
   */
  const porCategoria = useMemo(
    () =>
      cats.map((cat, ci) => {
        const daqui = matches.filter((m) => catDe(m) === ci)
        const daFase1 = daqui.filter((m) => (m.fase ?? 1) === 1)
        const daFase2 = daqui.filter((m) => (m.fase ?? 1) === 2)
        /** Todas as partidas do mata-mata (fase 2 em diante), por rodada. */
        const doMataMata = daqui.filter((m) => (m.fase ?? 1) >= 2)
        const ultimaFase = doMataMata.reduce((t, m) => Math.max(t, m.fase ?? 1), 1)
        // a disputa de 3o fica de fora: ela nao gera proxima rodada nem decide
        // quem segue vivo na chave
        const daUltimaRodada = doMataMata.filter((m) => (m.fase ?? 1) === ultimaFase && !m.disputa_3o)
        const duos = duosDaCategoria(session, ci)
        /** Quem ainda nao perdeu. Uma dupla so = ja tem campea. */
        const vivas = duos.length ? duplasVivas(duos, doMataMata) : []
        /** A fase 1 acabou e a 2 ainda nao nasceu: e a hora de formar as duplas. */
        const podeGerarFase2 =
          soFase2 && daFase2.length === 0 && daFase1.length > 0 && daFase1.every(isPlayed)
        /** Empates em tudo que so a quadra resolve (simples 1x1 ou par ou impar). */
        const desempates = podeGerarFase2 ? colocacoesDaCategoria(session, ci, matches).pendentes : []
        /** A rodada atual acabou e ainda ha mais de uma dupla viva. */
        const podeGerarRodada =
          soFase2 &&
          daFase2.length > 0 &&
          daUltimaRodada.length > 0 &&
          daUltimaRodada.every(isPlayed) &&
          vivas.length > 1
        return {
          cat,
          ci,
          daqui,
          daFase1,
          daFase2,
          doMataMata,
          ultimaFase,
          daUltimaRodada,
          duos,
          vivas,
          podeGerarFase2,
          desempates,
          podeGerarRodada,
          rotuloDaProxima: vivas.length > 1 ? nomeDaRodada(vivas.length) : '',
          terminou: soFase2 && categoriaTerminou(session, ci, matches),
          porJogar: daqui.filter((m) => !isPlayed(m)).length,
        }
      }),
    [cats, matches, catDe, session, soFase2],
  )
  /** Todas as duplas ainda vivas, de todas as categorias. */
  const vivas = useMemo(() => porCategoria.flatMap((c) => c.vivas), [porCategoria])

  /**
   * QUEM JÁ PASSOU, ENQUANTO A RODADA AINDA CORRE (por categoria)
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
    if (!soFase2) return []
    const chave = (d: readonly string[]) => [...d].sort().join('|')
    const out: { categoria: string; duplas: [string, string][]; onde: string }[] = []
    for (const c of porCategoria) {
      if (!c.duos.length || !c.daUltimaRodada.length) continue
      const jogando = new Set<string>()
      for (const m of c.daUltimaRodada) {
        if (isPlayed(m)) continue
        jogando.add(chave(m.team_a))
        jogando.add(chave(m.team_b))
      }
      // rodada inteira lançada: quem avisa aí é o cartão da próxima fase
      if (!jogando.size) continue
      const passaram = c.vivas.filter((d) => !jogando.has(chave(d)))
      if (!passaram.length) continue
      // quantas entraram nesta rodada = as vivas mais as já eliminadas nela
      const entraram = c.vivas.length + c.daUltimaRodada.filter(isPlayed).length
      const restarao = entraram - c.daUltimaRodada.length
      if (restarao <= 1) continue
      const nome = nomeDaRodada(restarao).toLowerCase()
      out.push({
        categoria: ehCampeonato ? c.cat.nome : '',
        duplas: passaram,
        onde: /^(quartas|oitavas)/.test(nome) ? `nas ${nome}` : `na ${nome}`,
      })
    }
    return out
  }, [soFase2, porCategoria, ehCampeonato])

  /** Ha um proximo passo obrigatorio antes de encerrar o play? */
  const faltaFase = porCategoria.some((c) => c.podeGerarFase2 || c.podeGerarRodada)

  /** Onde a categoria esta: "grupos 4/6", "semifinal", "terminou 🏆". */
  const situacaoDaCategoria = (c: (typeof porCategoria)[number]): string => {
    if (c.terminou) return 'terminou 🏆'
    if (c.daFase2.length === 0) {
      const jogadas = c.daFase1.filter(isPlayed).length
      return jogadas === c.daFase1.length ? 'grupos ✔ — formar duplas' : `grupos ${jogadas}/${c.daFase1.length}`
    }
    const naQuadra = c.daUltimaRodada.find((m) => !isPlayed(m)) ?? c.daUltimaRodada[0]
    return naQuadra ? rotuloDaPartida(naQuadra).replace('🏆 ', '').toLowerCase() : 'mata-mata'
  }

  /** O que decide o ranking deste dia: gravado no play, para nao mudar depois. */
  const criterioDoDia: CriterioDoDia = session.criterio_dia ?? 'pontos'

  /** Os pontos que o bye pagou neste play (so existe no grupos+duplas). */
  const byeDoDia = useMemo(
    () => pontosDeBye([session], matches),
    [session, matches],
  )

  /** O podio do mata-mata, quando o play foi em grupos+duplas. */
  const duplasPorCategoria = useMemo(
    () =>
      soFase2
        ? cats.map((_, ci) => {
            const duos = duosDaCategoria(session, ci)
            return rankDuplasDoDia(
              partidasDaFase2.filter((m) => catDe(m) === ci),
              nameOf,
              byeDoDia.porDupla,
              duos.length ? duos : undefined,
            )
          })
        : [],
    [soFase2, cats, session, partidasDaFase2, nameOf, byeDoDia, catDe],
  )
  /** Os pontos por colocacao deste play (vazio sem tabela ou antes de alguma categoria terminar). */
  const colocacaoDoDia = useMemo(() => pontosDeColocacao(session, matches), [session, matches])
  /** CAMPEONATO: a categoria escolhida para o ranking, o texto e a arte (null = todas). */
  const [catArte, setCatArte] = useState<number | null>(null)
  /** O podio da chave no recorte escolhido (uma categoria so = o de sempre). */
  const duplasDoDia = useMemo(
    () => (catArte === null ? (duplasPorCategoria.length === 1 ? duplasPorCategoria[0] : []) : (duplasPorCategoria[catArte] ?? [])),
    [duplasPorCategoria, catArte],
  )

  const dayRows = useMemo(() => {
    const todas = playedMatches(data, { sessionId: session.id })
    // a fase de grupos so serviu para formar as duplas; da fase 2 em diante conta
    const ms = soFase2 ? todas.filter((m) => (m.fase ?? 1) >= 2) : todas
    // com tabela de colocacao os pontos do dia sao os da colocacao final
    if (soFase2 && session.pontuacao?.length) {
      // todas as partidas do dia (tambem as dos grupos): quem nao entrou na chave
      // aparece com os pontos de "fase de grupos" quando a categoria fecha
      return rankPlayers(aplicarColocacao(computeStatsComPontos([session], todas), pontosDeColocacao(session, todas)), nameOf)
    }
    return rankPlayers(aplicarBye(computeStats(ms), byeDoDia.porJogadora), nameOf, criterioDoDia)
  }, [data, session, nameOf, soFase2, criterioDoDia])

  /**
   * Como o dia e dividido para o podio.
   *
   * No formato com fase 2 nao ha divisao: os grupos ja se misturaram no
   * mata-mata, e o podio do dia e um so, pela campanha de cada uma da fase 2
   * em diante. Nos outros formatos continua sendo o grupo.
   */
  const podios = useMemo(
    () => podiosDoDia(dayRows, soFase2 ? null : session.groups, criterioDoDia),
    [dayRows, session.groups, soFase2, criterioDoDia],
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
      // categoria sem as duplas formadas: a fase 2 ainda vai escolher quem fica
      const vivasAgora = new Set(vivas.flat())
      // quem perdeu a semifinal ainda joga o 3o lugar (montado junto com a final)
      const terceiro = esperamOTerceiroLugar(session, matches)
      return session.player_ids.filter((id) => {
        const ci = Math.max(0, categoriaDaJogadora(cats, session.groups, id))
        if (!porCategoria[ci]?.duos.length) return false
        return !comJogo.has(id) && !vivasAgora.has(id) && !terceiro.has(id)
      })
    }
    return session.player_ids.filter((id) => !comJogo.has(id))
  }, [matches, soFase2, session.groups, session.player_ids, session.status, vivas, cats, porCategoria])

  /** Perderam a semifinal e ainda nao jogaram o 3o lugar (que nasce junto com a final). */
  const esperandoTerceiro = useMemo(() => {
    if (!soFase2) return []
    const t = esperamOTerceiroLugar(session, matches)
    const comJogo = new Set(matches.filter((m) => !isPlayed(m)).flatMap(jogadorasDaPartida))
    // quem ja tem o 3o lugar marcado aparece na fila, nao aqui
    return session.player_ids.filter((id) => t.has(id) && !comJogo.has(id))
  }, [soFase2, session, matches])

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
  const rowsSel = useMemo(() => {
    if (ehCampeonato) {
      return catArte === null
        ? dayRows
        : dayRows.filter((s) => categoriaDaJogadora(cats, session.groups, s.player_id) === catArte)
    }
    return grupoArte === null ? dayRows : dayRows.filter((s) => grupoDe.get(s.player_id) === grupoArte)
  }, [dayRows, grupoDe, grupoArte, ehCampeonato, catArte, cats, session.groups])
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
  /**
   * Quem ainda nao chegou: o app pula as partidas dela ate ser desmarcada.
   * Fica NO PLAY (script 22), para todos os celulares verem; sem a coluna, so
   * neste aparelho, como antes.
   */
  const [ausentesLocais, setAusentesLocais] = useState<Set<string>>(
    () => new Set(loadAusentes()[session.id] ?? []),
  )
  const ausentesNoPlay = 'ausentes' in session && avisosDoBanco.colunas.has('sessions.ausentes') === false
  const ausentes = useMemo(
    () => (ausentesNoPlay ? new Set(session.ausentes ?? []) : ausentesLocais),
    [ausentesNoPlay, session.ausentes, ausentesLocais],
  )
  const [marcandoAusentes, setMarcandoAusentes] = useState(false)
  function alternarAusente(id: string) {
    const ausente = !ausentes.has(id)
    mesclarNoPlay(session.id, { campo: 'ausentes', id, ausente })
    setAusentesLocais((prev) => {
      const next = new Set(prev)
      if (ausente) next.add(id)
      else next.delete(id)
      saveAusentes({ ...loadAusentes(), [session.id]: [...next] })
      return next
    })
  }

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

  /**
   * O inicio guardado neste aparelho so vale por uns minutos: ele cobre a
   * volta do banco atrasada logo depois do toque. Passado isso manda o banco --
   * senao, quando OUTRO celular cancelava o inicio, este continuava mostrando a
   * partida em quadra para sempre.
   */
  const inicioLocal = (id: string): string | null => {
    const t = inicios[id]
    return t && Date.now() - Date.parse(t) < 3 * 60 * 1000 ? t : null
  }
  const iniciada = (m: Match) => !isPlayed(m) && !!(m.started_at ?? inicioLocal(m.id))

  /** Hora em que a partida entrou em quadra (banco ou celular), se estiver rolando. */
  function inicioDe(m: Match): string | null {
    if (isPlayed(m)) return null
    return m.started_at ?? inicioLocal(m.id) ?? null
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

  /**
   * Quem nao pode entrar em quadra agora: quem esta jogando e quem ainda nao
   * chegou. Para a escolha da proxima partida da no mesmo -- a partida dela
   * espera -- mas na tela sao coisas diferentes, por isso dois conjuntos.
   */
  const indisponiveis = useMemo(() => {
    const s = new Set(ocupadas)
    for (const id of ausentes) if (session.player_ids.includes(id)) s.add(id)
    return s
  }, [ocupadas, ausentes, session.player_ids])

  /** Quantas partidas cada uma ja fez hoje. */
  const jogos = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of jogadas) for (const id of jogadorasDaPartida(m)) map.set(id, (map.get(id) ?? 0) + 1)
    return map
  }, [jogadas])

  /**
   * Quantas partidas SEGUIDAS cada uma acabou de jogar, contando as jogadas e
   * as que estao em quadra, na ordem em que terminaram -- dentro do grupo
   * dela: a quadra do outro grupo terminar nao e descanso para ninguem daqui.
   * E com isto que a proxima partida evita mandar alguem para a terceira.
   */
  const seguidas = useMemo(() => {
    const ordem = [...jogadas]
      .sort((a, b) => {
        const ta = Date.parse(a.ended_at ?? fins[a.id] ?? '') || 0
        const tb = Date.parse(b.ended_at ?? fins[b.id] ?? '') || 0
        return ta - tb || a.round - b.round
      })
      .concat(emJogo)
    const map = new Map<string, number>()
    for (const id of session.player_ids) {
      const grupo = grupos?.find((g) => g.includes(id)) ?? session.player_ids
      const doGrupo = ordem.filter((m) => grupo.includes(m.team_a[0]))
      let seq = 0
      for (let i = doGrupo.length - 1; i >= 0; i--) {
        if (!jogadorasDaPartida(doGrupo[i]).includes(id)) break
        seq++
      }
      map.set(id, seq)
    }
    return map
  }, [jogadas, emJogo, fins, session.player_ids, grupos])

  /** Duplas que ja jogaram ou estao jogando hoje: a segunda vez vai para o fim da fila. */
  const jaFormadas = useMemo(() => {
    const set = new Set<string>()
    for (const m of [...jogadas, ...emJogo]) {
      set.add(pairKey(m.team_a[0], m.team_a[1]))
      set.add(pairKey(m.team_b[0], m.team_b[1]))
    }
    return set
  }, [jogadas, emJogo])

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
  /**
   * CAMPEONATO: as quadras que cada categoria usa agora -- as fixas dela, e as
   * de quem ja terminou tudo (para a categoria escolhida, ou a com mais jogo).
   */
  const quadrasDaCategoria = useMemo(() => {
    if (!ehCampeonato) return null
    const base = quadrasEfetivas(
      cats,
      porCategoria.map((c) => c.terminou),
      porCategoria.map((c) => c.porJogar),
      session.quadras_cedidas,
      session.courts,
    )
    // quadra com jogo em andamento e de quem esta jogando nela: a conta de
    // "quem tem mais jogo" muda a cada rodada, e a partida nao pode mudar de
    // categoria (nem sumir do filtro de quem cuida dela) no meio do jogo
    for (const [q, m] of emQuadra) {
      const dona = catDe(m)
      base.forEach((qs, i) => {
        const k = qs.indexOf(q)
        if (k >= 0 && i !== dona) qs.splice(k, 1)
      })
      if (base[dona] && !base[dona].includes(q)) base[dona].push(q)
    }
    return base.map((qs) => [...qs].sort((a, b) => a - b))
  }, [ehCampeonato, cats, porCategoria, session.quadras_cedidas, session.courts, emQuadra, catDe])
  /** CAMPEONATO: de qual categoria a quadra e agora (null fora do campeonato). */
  const donaDa = (q: number): number | null => {
    if (!quadrasDaCategoria) return null
    const i = quadrasDaCategoria.findIndex((qs) => qs.includes(q))
    return i < 0 ? null : i
  }
  /**
   * QUANTO FALTA A NOITE, com o play rolando. Nos modos com fases conta
   * tambem o mata-mata que ainda nem foi montado, rodada por rodada, com o alvo
   * e o desempate de cada fase; no campeonato, por categoria (elas jogam ao
   * mesmo tempo, a noite acaba com a mais longa).
   */
  const restanteDaNoite = useMemo(() => {
    if (finished) return null
    const falta = matches.filter((m) => !isPlayed(m)).length
    if (!soFase2) {
      return {
        minutos: Math.ceil(falta / Math.max(1, session.courts)) * minutosMedios(matches.filter((m) => !isPlayed(m))),
        falta,
        categorias: [] as { nome: string; minutos: number; situacao: string }[],
      }
    }
    const minutos = [0, 1, 2, 3].map((d) =>
      minutosDaPartida(session.alvos?.[d] ?? session.target, lerRegra(session.desempates?.[d] ?? session.desempate)),
    )
    const categorias = porCategoria.map((c) => {
      const q = Math.max(1, quadrasDaCategoria?.[c.ci]?.length ?? session.courts)
      let t = Math.ceil(c.daFase1.filter((m) => !isPlayed(m)).length / q) * minutos[0]
      if (!c.duos.length) {
        // o mata-mata ainda nao existe: entra a chave inteira
        t += estimativaDaNoite({
          grupos: [c.cat.grupos.map((g) => session.groups?.[g]?.length ?? 0)],
          quadras: [q],
          duplasMM: session.duplas_mm ?? 8,
          minutos,
        }).categorias[0].mataMata
      } else {
        t += minutosRestantesDaChave({
          vivas: c.vivas.length,
          pendentesNaRodada: c.daUltimaRodada.filter((m) => !isPlayed(m)).length,
          degrauAtual: c.daUltimaRodada[0] ? degrauDe(c.daUltimaRodada[0]) : 3,
          teveSemi: c.duos.length >= 4,
          quadras: q,
          minutos,
        })
      }
      return { nome: c.cat.nome, minutos: c.terminou ? 0 : t, situacao: situacaoDaCategoria(c) }
    })
    return { minutos: Math.max(0, ...categorias.map((c) => c.minutos)), falta, categorias }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, matches, soFase2, session, porCategoria, quadrasDaCategoria])

  /** Quadra que mudou de dona: de qual categoria era e para qual foi. */
  const cessaoDa = (q: number): { de: number; para: number } | null => {
    if (!quadrasDaCategoria) return null
    const de = cats.findIndex((c) => c.quadras.includes(q))
    const para = quadrasDaCategoria.findIndex((qs) => qs.includes(q))
    // de = -1: quadra aberta a mais no meio do campeonato, de nenhuma categoria
    return para >= 0 && de !== para ? { de, para } : null
  }

  /** Sugestao de proxima partida por quadra livre, respeitando escolhas na mao. */
  /**
   * As partidas como a tela as ve: com o inicio e o fim guardados neste
   * aparelho quando o banco ainda nao devolveu (ver emQuadra.ts).
   */
  const matchesDaTela = useMemo(
    () =>
      matches.map((m) => {
        const inicio = inicioDe(m)
        const fim = m.ended_at ?? fins[m.id] ?? null
        return inicio !== m.started_at || fim !== m.ended_at ? { ...m, started_at: inicio, ended_at: fim } : m
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matches, inicios, fins],
  )

  /**
   * A FILA DE CADA GRUPO -- a que a tela mostra E a que as quadras consomem
   * (`proximasPelaFila`): a quadra que vaga pega a primeira partida da fila do
   * grupo dela com as quatro livres. Em 05/10 a lista era uma previsao feita de
   * um jeito e a quadra escolhia de outro, e a partida que entrava nao era a
   * escrita. Medido em tests/fila.test.ts.
   */
  const filas = useMemo(
    () =>
      filaPorGrupo({
        jogadoras: session.player_ids,
        grupos: grupos ?? null,
        matches: matchesDaTela,
        ausentes,
        quadras: session.courts,
      }),
    [session.player_ids, grupos, matchesDaTela, ausentes, session.courts],
  )

  /** Sugestao de proxima partida por quadra livre, respeitando escolhas na mao. */
  const proximas = useMemo(() => {
    const escolhidasNaMao = new Map<number, Match>()
    for (const q of quadrasLivres) {
      const id = manuais[q]
      const m = id ? pendentes.find((x) => x.id === id) : undefined
      // a escolha so vale se as quatro estiverem livres (ninguem em quadra)
      if (m && jogadorasDaPartida(m).every((x) => !ocupadas.has(x))) escolhidasNaMao.set(q, m)
    }
    const restantes = quadrasLivres.filter((q) => !escolhidasNaMao.has(q))
    const noite = { jogadoras: session.player_ids, grupos: grupos ?? null, matches: matchesDaTela, ausentes, quadras: session.courts }
    const reservadas = [...escolhidasNaMao.values()]
    const out = new Map(escolhidasNaMao)
    if (!quadrasDaCategoria) {
      for (const [q, m] of proximasPelaFila(noite, restantes, undefined, filas, reservadas)) out.set(q, m)
      return out
    }
    // CAMPEONATO: cada categoria nas quadras dela (mais as cedidas), com as
    // filas dos grupos dela; o grupo mora na sua quadra
    cats.forEach((cat, ci) => {
      const livresDaCat = restantes.filter((q) => quadrasDaCategoria[ci]?.includes(q))
      if (livresDaCat.length === 0) return
      const auto = proximasPelaFila(
        noite,
        livresDaCat,
        cat.quadras,
        cat.grupos.map((g) => filas[g] ?? []),
        [...reservadas, ...out.values()],
      )
      for (const [q, m] of auto) out.set(q, m)
    })
    return out
  }, [quadrasLivres, manuais, pendentes, ocupadas, session.player_ids, grupos, matchesDaTela, ausentes, session.courts, filas, quadrasDaCategoria, cats])


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
    return session.player_ids.filter((id) => !comprometidas.has(id) && !ausentes.has(id))
  }, [ocupadas, proximas, session.player_ids, ausentes])

  /**
   * "Proximas na fila": o que sobra das filas dos grupos depois das quadras,
   * intercalado pela posicao (a 1a de cada grupo, depois a 2a...), que e a
   * ordem em que vao acontecendo.
   */
  const filaPrevista = useMemo(() => {
    const naQuadra = new Set([...proximas.values()].map((m) => m.id))
    const restos = filas.map((f) => f.filter((m) => !naQuadra.has(m.id)))
    const out: Match[] = []
    for (let k = 0; restos.some((f) => k < f.length); k++) for (const f of restos) if (f[k]) out.push(f[k])
    return out
  }, [filas, proximas])

  /**
   * As duplas que jogam duas vezes no dia, por partida.
   *
   * Nao e sobra nem defeito: quando o grupo nao fecha certo (6, 7, 10, 11
   * meninas) algumas duplas repetem DE PROPOSITO, escolhidas para que cada
   * jogadora repita a mesma quantidade -- sem isso duas do grupo jogariam uma
   * partida a mais que as outras.
   */
  const duplasRepetidas = useMemo(() => {
    const vistas = new Map<string, Match>() // dupla -> primeira partida
    const porPartida = new Map<string, Repeticao>() // partida -> duplas que repetem
    /*
     * A repeticao veio de uma troca na mao? Com diario (script 20), so quando
     * a dupla tem quem ENTROU numa troca, em uma das duas partidas: a troca so
     * muda as duplas de quem entra. O tamanho de hoje do grupo nao serve para
     * isso -- um Entra / sai muda o tamanho e viraria as repeticoes do plano
     * em "troca na mao". Sem diario (plays antigos), vale o tamanho: o plano
     * so repete dupla quando o grupo nao fecha (6, 7, 10, 11...), e num grupo
     * de 8 toda repeticao veio de uma troca (21/09).
     */
    const eventos = session.eventos ?? []
    const trocas = eventos.filter((e) => e.tipo === 'troca' && e.round !== undefined && e.entra)
    const planejada = (d: [string, string], m: Match, primeira: Match) => {
      if (eventos.length > 0) {
        return !trocas.some((t) => d.includes(t.entra as string) && (t.round === m.round || t.round === primeira.round))
      }
      const g = grupos?.find((x) => x.includes(d[0]))
      return repeticoesPorJogadora(g ? g.length : session.player_ids.length) > 0
    }
    // so a fase 1: no mata-mata do grupos-duplas a dupla e fixa e joga toda partida junta
    for (const m of matches) {
      if ((m.fase ?? 1) >= 2) continue
      for (const d of [m.team_a, m.team_b]) {
        const k = pairKey(d[0], d[1])
        const primeira = vistas.get(k)
        if (primeira && primeira.id !== m.id) {
          const nomes = `${nameOf(d[0])} + ${nameOf(d[1])}`
          const antes = porPartida.get(m.id)
          porPartida.set(m.id, { duplas: [...(antes?.duplas ?? []), nomes], planejada: (antes?.planejada ?? true) && planejada(d, m, primeira) })
        } else if (!primeira) {
          vistas.set(k, m)
        }
      }
    }
    return porPartida
  }, [matches, nameOf, grupos, session.player_ids.length, session.eventos])

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
    // a escolha na mao foi cumprida: a quadra volta a seguir a fila
    if (manuais[quadra]) escolherNaMao(quadra, null)
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
      const recorte = ehCampeonato
        ? cats.map((c, ci) => ({ c, linhas: soComCampea(duplasPorCategoria[ci] ?? []) })).filter((_, ci) => catArte === null || catArte === ci)
        : [{ c: null, linhas: soComCampea(duplasDoDia) }]
      if (soFase2 && recorte.some((r) => r.linhas.length > 0)) {
        const porId = new Map(dayRows.map((s) => [s.player_id, s]))
        const titulos = ['Campeãs do dia', 'Vice-campeãs', '3º lugar']
        const blocos = recorte.flatMap(({ c, linhas }) =>
          linhas.slice(0, 3).map((d, i) => ({
            // no campeonato cada bloco diz de que categoria e
            titulo: c ? `${c.nome} · ${titulos[i]}` : titulos[i],
            medalha: i,
            rows: [d.a, d.b]
              .map((id) => porId.get(id))
              .filter((s): s is PlayerStat => Boolean(s))
              .map((s) => linhaDe(s, true)),
          })),
        )
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
    // no campeonato o recorte e a categoria; nos grupos, o grupo
    const recorte = ehCampeonato
      ? catArte === null ? null : `Categoria ${cats[catArte].nome}`
      : grupoArte === null ? null : `Grupo ${grupoArte}`
    const sufixo = recorte ? `-${recorte.toLowerCase().replace(/\s+/g, '')}` : ''
    const arquivo = new File([arte.blob], `play-${session.date}${sufixo}.png`, { type: 'image/png' })
    const deQuem = recorte ? ` · ${recorte}` : ''
    const resultado = await baixarOuCompartilhar(arquivo, `${session.title} — ${dateLabel(session.date)}${deQuem} 🏐`)
    if (resultado === 'baixou') onToast('Imagem salva 📸')
  }

  /**
   * Refaz so o que ainda nao aconteceu: junta as duplas que ainda faltam
   * formar e monta as partidas em cima do que ja foi jogado hoje.
   */
  async function regenerarPendentes(
    sessao: PlaySession = session,
    silencioso = false,
    /** `base`: as partidas ja com a troca aplicada; `fixa`: a partida trocada, que fica. */
    opcoes: { base?: Match[]; fixa?: string; automatico?: boolean } = {},
  ) {
    const base = opcoes.base ?? matches
    const fixa = (m: Match) => iniciada(m) || m.id === opcoes.fixa
    /*
     * SO OS GRUPOS EM QUE A CONTA NAO FECHA (`precisaRefazer`). Grupo certinho
     * fica como esta: em 05/10 o Refazer foi apertado 9 vezes num play que nao
     * precisava, e cada toque desmontava o rodizio de 6 que evita alguem
     * emendar 3 -- 14 das 18 meninas emendaram.
     */
    const gruposDoPlay = sessao.groups?.length ? sessao.groups : [sessao.player_ids]
    const precisam = gruposDoPlay.filter((g) => {
      const doGrupo = new Set(g)
      return precisaRefazer(g, base.filter((m) => doGrupo.has(m.team_a[0])))
    })
    if (precisam.length === 0) {
      if (!silencioso && !opcoes.automatico) onToast('A fila já está certa — nada para refazer ✅')
      return
    }
    const quemRefaz = new Set(precisam.flat())
    // so a fase de grupos que ainda nao comecou, e so dos grupos que precisam:
    // o mata-mata (de qualquer categoria) e os outros grupos ficam como estao
    const { naFila, preservadas } = separarParaRefazer(base, (m) => fixa(m) || !quemRefaz.has(m.team_a[0]))
    if (naFila.length === 0 && !silencioso && !opcoes.automatico) {
      onToast('Não há partidas na fila para refazer')
      return
    }
    const fila = refazerFila({
      playerIds: precisam.flat(),
      groups: sessao.groups?.length ? precisam : undefined,
      // a partida EM QUADRA (e a que acabou de ser trocada) conta como
      // acontecida: ela fica, entao a fila nova nao forma aquelas duplas de novo
      jogadas: preservadas.filter((m) => isPlayed(m) || fixa(m)),
      ratings: ratings(data, session.date),
      entrosamento: ajusteDeEntrosamento(data),
      history: buildHistory(playedMatches(data).filter((m) => m.session_id !== session.id)),
      historyWeight: 1,
    })
    // a fila nova entra depois da ultima posicao ja usada, para nao haver duas
    // partidas com o mesmo numero na lista
    const ultima = preservadas.reduce((n, m) => Math.max(n, m.round), 0)
    const novas = planToMatches(session.id, fila).map((m, i) => ({
      ...m,
      round: ultima + i + 1,
    }))
    await replaceSessionMatches(session.id, [...preservadas, ...novas])
    if (silencioso) {
      // veio do Entra / sai, que ja grava a sessao nova inteira (grupos e presenca mudaram)
      await saveSession({ ...sessao, rounds: preservadas.length + novas.length })
    } else {
      // so o total e o diario: regravar a sessao inteira daqui apagaria o que
      // outro celular mudou nela (duplas, desempates, quadras de outra categoria)
      mesclarNoPlay(session.id, { campo: 'rounds', minimo: preservadas.length + novas.length })
      anotarNoPlay(
        session.id,
        novoEvento(
          'refazer',
          `${opcoes.automatico ? 'Fila refeita sozinha depois da troca' : 'Refazer a fila'}: ${novas.length} partida${novas.length === 1 ? '' : 's'} refeita${novas.length === 1 ? '' : 's'}`,
        ),
      )
    }
    if (!silencioso) {
      onToast(
        opcoes.automatico
          ? 'Fila refeita para compensar a troca 🔄'
          : `${novas.length === 1 ? 'uma partida refeita' : `${novas.length} partidas refeitas`} 🔄`,
      )
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
    const quem = sai && entra ? `${nameOf(sai)} saiu, ${nomeDeQuemEntra} entrou` : sai ? `${nameOf(sai)} saiu` : `${nomeDeQuemEntra} entrou`
    const como = onde === 'lugar' ? 'no lugar dela' : onde === 'grupo' ? `no grupo ${grupo + 1}, fila refeita` : 'encaixe automático, fila refeita'
    const nova: PlaySession = comEvento({ ...session, player_ids, groups, duos }, 'entra-sai', `Entra / sai: ${quem} (${como})`)

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
    // a noite recomeca do zero: duplas, desempates e quadras cedidas tambem
    await saveSession(
      comEvento(
        { ...session, rounds: fila.length, duos: null, desempates_grupo: null, quadras_cedidas: null },
        'refazer-tudo',
        `Refazer tudo: ${fila.length} partidas novas`,
      ),
    )
    onToast('Novas duplas geradas 🔄')
  }

  /** Grava o desempate decidido em quadra (substitui o do mesmo conjunto de empatadas). */
  function salvarDesempate(grupo: number, ordem: string[], como: DesempateDeGrupo['como']) {
    mesclarNoPlay(session.id, { campo: 'desempates_grupo', d: { grupo, ordem, como, at: new Date().toISOString() } })
    const texto = `Desempate (${como === 'simples' ? 'simples 1x1' : 'par ou ímpar'}): ${ordem.map((id, i) => `${i + 1}ª ${nameOf(id)}`).join(', ')}`
    anotarNoPlay(session.id, novoEvento('desempate', texto))
    onToast('Desempate anotado ✅')
  }

  /** Montando duplas ou a proxima rodada agora: trava os botoes contra o toque duplo. */
  const [montando, setMontando] = useState(false)

  /** A proxima posicao livre na fila: depois de TODAS as partidas, de todas as categorias. */
  const proximaPosicao = () => matches.reduce((t, m) => Math.max(t, m.round), 0) + 1

  /**
   * FORMAR AS DUPLAS de uma categoria: 1a com 1a, pela classificacao de cada
   * grupo (vitorias, pontos, saldo, confronto justo e o desempate em quadra).
   * Com empate pendente nao forma: a organizadora decide em quadra antes.
   */
  async function gerarFase2(ci: number) {
    const c = porCategoria[ci]
    if (!c || c.cat.grupos.length < 2) {
      onToast('Esta categoria não tem grupos')
      return
    }
    const { colocacoes, pendentes } = colocacoesDaCategoria(session, ci, matches)
    if (pendentes.length > 0) {
      onToast('Antes, decida o empate em quadra (simples ou par ou ímpar)')
      return
    }
    const duos = duplasDaFase2(colocacoes, session.duplas_mm ?? 8)
    if (duos.length < 2) {
      onToast('Poucas duplas para o mata-mata')
      return
    }
    const { byes, jogos } = rodadaDoMataMata(duos)
    const fila = jogos.map(([a, b]) => ({ team_a: a, team_b: b, grupo: 0, fase: 2 }))
    const inicio = proximaPosicao()
    const novas = planToMatches(session.id, fila).map((m, i) => ({ ...m, round: inicio + i }))
    // so as duplas DESTA categoria, sobre o que esta no banco: outro celular
    // pode ter acabado de formar as de outra categoria
    const daCategoria = c.cat.grupos.flatMap((g) => session.groups?.[g] ?? [])
    mesclarNoPlay(session.id, { campo: 'duos', tirar: daCategoria, por: duos })
    mesclarNoPlay(session.id, { campo: 'rounds', minimo: matches.length + novas.length })
    await saveMatches(novas)
    onToast(
      `${ehCampeonato ? `Categoria ${c.cat.nome} — ` : ''}${nomeDaRodada(duos.length)}: ${duos.length} duplas` +
        (byes.length ? `, ${byes.length} de bye 🤝` : ' 🤝'),
    )
  }

  /**
   * A proxima rodada do mata-mata de uma categoria: quem nao perdeu segue, na
   * ordem de forca.
   *
   * Os byes da primeira rodada nao precisam ser guardados: quem nunca perdeu
   * esta vivo, e `duplasVivas` deduz isso das partidas ja lancadas.
   */
  async function gerarProximaRodada(ci: number) {
    const c = porCategoria[ci]
    if (!c || c.vivas.length < 2) {
      onToast('O mata-mata já tem campeã')
      return
    }
    const { jogos } = rodadaDoMataMata(c.vivas)
    const fase = c.ultimaFase + 1
    const fila: PlannedMatch[] = jogos.map(([a, b]) => ({ team_a: a, team_b: b, grupo: 0, fase }))

    /*
     * Vai sair a FINAL? Entao as duas que perderam a semi jogam o 3o lugar.
     *
     * Na mesma fase, para nao ficarem "acima" das finalistas na hora de
     * medir ate onde cada dupla chegou -- e marcada, para o app nao contar
     * essa partida como se a fase tivesse duas rodadas. Roda em paralelo com
     * a final, na quadra ao lado, entao nao alonga a noite.
     */
    if (c.vivas.length === 2) {
      const perdedoras = c.daUltimaRodada
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
    const inicio = proximaPosicao()
    const novas = planToMatches(session.id, fila).map((m, i) => ({ ...m, round: inicio + i }))
    mesclarNoPlay(session.id, { campo: 'rounds', minimo: matches.length + novas.length })
    await saveMatches(novas)
    onToast(`${ehCampeonato ? `Categoria ${c.cat.nome} — ` : ''}${nomeDaRodada(c.vivas.length)} montada 🥅`)
  }

  async function finish() {
    if (doneCount < matches.length && !confirm(`Ainda faltam ${matches.length - doneCount} partidas sem placar. Finalizar mesmo assim?`)) return
    // categoria que nao fechou a chave fica sem podio, sem fogo e sem pontos de colocacao
    if (faltaFase && !confirm(`${ehCampeonato ? 'Uma categoria ainda' : 'O play ainda'} tem fase pela frente (duplas ou próxima rodada). Sem ela não há pódio${session.pontuacao?.length ? ' nem pontos de colocação' : ''}. Finalizar mesmo assim?`)) return
    await saveSession({ ...session, status: 'finished' })
    // o credito da avulsa vale por UM play: finalizado, ela volta a dever
    for (const p of consumirAvulsos(session.player_ids, data)) await savePlayer(p)
    setShowRank(true)
    onToast('Play finalizado! Pontos somados ao ranking do mês 🏆')
  }

  /**
   * O DIARIO DO PLAY: cada intervencao na mao fica anotada na sessao, com hora
   * e quantas partidas ja tinham acontecido. Em 21/09 uma troca de jogadora
   * deixou uma dupla repetida no fim da noite e ninguem sabia dizer quando a
   * troca tinha sido feita -- o app nao guardava. Agora guarda.
   */
  function novoEvento(tipo: EventoDoPlay['tipo'], texto: string, extra?: Pick<EventoDoPlay, 'round' | 'entra'>): EventoDoPlay {
    return { at: new Date().toISOString(), tipo, texto, jogadas: matches.filter((m) => isPlayed(m)).length, ...extra }
  }
  function comEvento(sessao: PlaySession, tipo: EventoDoPlay['tipo'], texto: string): PlaySession {
    return { ...sessao, eventos: [...(sessao.eventos ?? []), novoEvento(tipo, texto)] }
  }

  /** Troca as ocupadas por quem esta livre, mantendo equilibrio e duplas novas. */
  function trocar(m: Match, sai: string, entra: string) {
    if (ocupadas.has(entra)) {
      onToast(`${nameOf(entra)} está em quadra agora — espere a partida dela acabar`)
      return
    }
    if (ausentes.has(entra)) {
      onToast(`${nameOf(entra)} ainda não chegou — desmarque em "⏳ Quem não chegou" quando ela aparecer`)
      return
    }
    const nova = trocarNaPartida(m, sai, entra)
    saveMatches([nova])
    // A FILA SE ARRUMA SOZINHA: a troca deixa uma com partida a mais e outra a
    // menos; o app refaz o que ainda nao comecou daquele grupo, mantendo esta
    // partida como ficou. Antes aparecia um aviso pedindo o Refazer, e
    // ninguem quer jogar com a fila errada
    void regenerarPendentes(session, false, {
      base: matches.map((x) => (x.id === nova.id ? nova : x)),
      fixa: nova.id,
      automatico: true,
    })
    // so o diario: a troca nao mexe na sessao, e grava-la inteira daqui
    // desfaria o que outro aparelho acabou de mudar nela
    anotarNoPlay(
      session.id,
      novoEvento(
        'troca',
        `Trocar jogadora na ${m.round}ª: ${nameOf(sai)} → ${nameOf(entra)} (${nameOf(nova.team_a[0])} + ${nameOf(nova.team_a[1])} × ${nameOf(nova.team_b[0])} + ${nameOf(nova.team_b[1])})`,
        { round: m.round, entra },
      ),
    )
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
            {session.ranked === false ? '🎈 Play avulso' : '🏆 Vale para o ranking'}
            {' · '}
            {FORMATOS.find((f) => f.valor === (ehCampeonato ? 'campeonato' : (session.format ?? 'todas')))?.rotulo ?? session.format}
            {' · '}
            {soFase2 && session.pontuacao?.length
              ? 'pontos pela colocação'
              : criterioDoDia === 'vitorias'
                ? 'dia por vitórias'
                : 'dia por pontos'}
          </div>
          <div className="small muted">
            {dateLabel(session.date)} · {session.player_ids.length} jogadoras · {session.courts} quadras
            {ehCampeonato
              ? ` · ${cats.length} categorias`
              : grupos && grupos.length > 1
                ? ` · ${grupos.length} grupos`
                : ''}
            {/* no grupos+duplas cada fase tem o seu alvo; o "ate N" unico enganaria */}
            {!(soFase2 && session.alvos?.length) && ` · até ${session.target} games`}
          </div>
          <div className="tiny muted" style={{ marginTop: 2 }}>
            {explicarRegra(session.target, regraDoPlay)}
          </div>
          {matches.length > 0 && (
            <div className="tiny" style={{ marginTop: 6, fontWeight: 700 }}>
              🎾 Cada menina joga <strong>{jogosPorPessoa}</strong>
              {soFase2 ? ' na fase de grupos' : ''}
              {' · '}
              {finished || !restanteDaNoite
                ? `noite de ${duracaoEstimada(matches.length, session.courts, minutosMedios(matches))}`
                : doneCount === 0 && emJogo.length === 0
                  ? // antes da primeira partida, "termina as" seria contado a partir de agora
                    `noite de uns ${formatarMinutos(restanteDaNoite.minutos)}${soFase2 ? ', contando o mata-mata' : ''}`
                  : `${restanteDaNoite.falta > 0 ? `faltam ${plural(restanteDaNoite.falta, 'partida')}` : 'falta montar a próxima fase'}${
                      soFase2 ? ' e o que vem do mata-mata' : ''
                    }, uns ${formatarMinutos(restanteDaNoite.minutos)} — termina por volta das ${horaLocal(
                      new Date(Date.now() + restanteDaNoite.minutos * 60000).toISOString(),
                    )}`}
            </div>
          )}
          {/* COMO VAI A NOITE: o resumo da criacao, para consultar com o play rolando */}
          {!finished && restanteDaNoite && (
            <details className="como-vai" style={{ marginTop: 6 }}>
              <summary className="tiny" style={{ fontWeight: 700, cursor: 'pointer' }}>📋 Como vai a noite</summary>
              <div className="stack tiny" style={{ gap: 4, marginTop: 6 }}>
                {restanteDaNoite.categorias.length > 1 &&
                  restanteDaNoite.categorias.map((c) => (
                    <div key={c.nome}>
                      <strong>Categoria {c.nome}</strong> · {c.situacao}
                      {c.minutos > 0 ? ` · falta uns ${formatarMinutos(c.minutos)}` : ''}
                    </div>
                  ))}
                <div>
                  ⏱️ Uns {Math.round(minutosMedios(matches))} min por partida, contando os games de quem perde e o desempate
                  {soFase2 ? ' (cada fase tem o seu alvo e o seu desempate)' : ''}.
                </div>
                <div>
                  🏆{' '}
                  {session.ranked === false
                    ? 'Play avulso: não soma no ranking do mês nem mexe no 🔥.'
                    : soFase2 && session.pontuacao?.length
                      ? `Pontos do mês pela colocação final${ehCampeonato ? ', em cada categoria' : ''}: ${session.pontuacao.join(' / ')} (campeã, vice, 3º, semifinal, quartas, grupos).`
                      : soFase2
                        ? 'O mata-mata pontua pelos games; o pódio é da chave.'
                        : 'Quem vence leva os games que fez menos os da adversária (mínimo 1). O dia é por vitórias.'}
                </div>
                <div>🔥 {soFase2 ? 'O pódio da chave (campeã, vice e 3º) segura o status.' : grupos && grupos.length > 1 ? 'O pódio de cada grupo segura o status.' : 'O top 3 segura o status.'}</div>
              </div>
            </details>
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
              // na ORDEM DA FILA: em quadra, as proximas das quadras e o resto da fila
              scheduleText(
                session.date,
                session.title,
                session.courts,
                [...emJogo, ...[...proximas.values()].filter((m) => !emJogo.some((x) => x.id === m.id)), ...filaPrevista],
                nameOf,
                grupos,
                { nomeDoGrupo, jogadas: doneCount },
              ),
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
                // no campeonato a cor e a da CATEGORIA, a mesma das quadras dela
                <div key={i} className={`grupo-box ${classeDoGrupo(ehCampeonato ? Math.max(0, cats.findIndex((c) => c.grupos.includes(i))) + 1 : i + 1)}`}>
                  <div className="grupo-nome">{nomeDoGrupo(i)} · {g.length} meninas</div>
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
        <div className="row spread" style={{ alignItems: 'baseline' }}>
          <div className="section-title">🏐 Quadras agora</div>
          {editable && !finished && (
            <div className="row" style={{ gap: 6 }}>
              {/* uma quadra vagou no meio da noite: entra na hora e ja puxa a proxima
                  da fila. Tirar so a ultima, e so vazia, para nao sumir com jogo em andamento */}
              {session.courts > 1 && (!ehCampeonato || !cats.some((c) => c.quadras.includes(session.courts))) && (
                <button
                  className="btn ghost sm"
                  disabled={emQuadra.has(session.courts)}
                  title={emQuadra.has(session.courts) ? `A quadra ${session.courts} está em jogo: lance o placar antes de tirá-la` : 'Tirar a última quadra'}
                  onClick={() => {
                    // conferido de novo aqui: a tela pode estar um passo atrasada em relacao ao banco
                    if (emQuadra.has(session.courts)) {
                      onToast(`A quadra ${session.courts} está em jogo — lance o placar antes de tirá-la`)
                      return
                    }
                    // so o numero de quadras: no campeonato outro celular pode ter mexido no resto
                    mesclarNoPlay(session.id, { campo: 'courts', valor: session.courts - 1 })
                    anotarNoPlay(session.id, novoEvento('quadra', `Quadra ${session.courts} tirada`))
                    onToast(`Agora são ${session.courts - 1} quadra${session.courts - 1 === 1 ? '' : 's'}`)
                  }}
                >
                  ➖ quadra
                </button>
              )}
              <button
                className="btn ghost sm"
                title="Abriu mais uma quadra"
                onClick={() => {
                  // no campeonato a quadra nova e "cedida": vai para a categoria com mais jogo
                  mesclarNoPlay(session.id, { campo: 'courts', valor: session.courts + 1 })
                  anotarNoPlay(session.id, novoEvento('quadra', `Quadra ${session.courts + 1} aberta`))
                  onToast(`Quadra ${session.courts + 1} aberta: já sugeri a próxima partida`)
                }}
              >
                ➕ quadra
              </button>
              <button className="btn ghost sm" onClick={() => setMarcandoAusentes(true)}>
                ⏳ Quem não chegou{ausentes.size > 0 ? ` (${ausentes.size})` : ''}
              </button>
            </div>
          )}
        </div>
        {ehCampeonato && (
          <div className="stack" style={{ gap: 6, marginBottom: 10 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              {porCategoria.map((c) => (
                <span key={c.ci} className="chip off" style={{ flex: 'none', cursor: 'default' }}>
                  <strong>{c.cat.nome}</strong>
                  <span className="tiny">{situacaoDaCategoria(c)}</span>
                </span>
              ))}
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="tiny muted">Ver:</span>
              <button className={`chip ${filtroCat === null ? 'on' : 'off'}`} style={{ flex: 'none' }} onClick={() => setFiltroCat(null)}>
                Todas
              </button>
              {cats.map((c, ci) => (
                <button key={ci} className={`chip ${filtroCat === ci ? 'on' : 'off'}`} style={{ flex: 'none' }} onClick={() => setFiltroCat(ci)}>
                  {c.nome}
                </button>
              ))}
            </div>
          </div>
        )}
        {ausentes.size > 0 && (
          <div className="banner warn" style={{ marginBottom: 10 }}>
            ⏳ <strong>Ainda não {ausentes.size === 1 ? 'chegou' : 'chegaram'}:</strong>{' '}
            {[...ausentes].map(nameOf).join(', ')}. As partidas {ausentes.size === 1 ? 'dela' : 'delas'}{' '}
            ficam para depois; quando chegar, desmarque que {ausentes.size === 1 ? 'ela entra' : 'elas entram'}{' '}
            na frente.
          </div>
        )}
        {jaClassificadas.map((j) => (
          <div key={j.categoria || 'unica'} className="banner ok classificadas">
            🎟️ <strong>
              {j.categoria && `Categoria ${j.categoria}: `}
              {j.duplas.length === 1 ? 'Já está' : 'Já estão'} {j.onde}
            </strong>{' '}
            {'—'}{' '}
            {j.duplas.map((d) => `${nameOf(d[0])} + ${nameOf(d[1])}`).join(', ')}.
          </div>
        ))}
        {!finished && esperandoTerceiro.length > 0 && (
          <div className="banner info">
            🥉 <strong>{esperandoTerceiro.length === 1 ? 'Espera' : 'Esperam'} o 3º lugar</strong> — joga junto com a final:{' '}
            {esperandoTerceiro.map(nameOf).join(', ')}.
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
        ) : ehCampeonato && filtroCat !== null && porCategoria[filtroCat]?.terminou ? (
          <Empty icon="🏆">
            A categoria {cats[filtroCat].nome} terminou — as quadras dela foram para quem ainda está jogando.
          </Empty>
        ) : (
          quadras.map((q) => {
            const atual = emQuadra.get(q)
            const proxima = proximas.get(q)
            const m = atual ?? proxima
            const cessao = cessaoDa(q)
            // quadra cedida por categoria que ja terminou: de onde veio, para quem foi,
            // e chips para a organizadora mandar para outra (vale em todos os celulares)
            const aviso = cessao && editable && (
              <div className="tiny muted row wrap" style={{ gap: 6, margin: '0 0 6px' }}>
                <span>
                  Quadra {q} · {cessao.de < 0 ? 'quadra a mais' : `cedida pela ${cats[cessao.de].nome}`} → <strong>{cats[cessao.para].nome}</strong>
                </span>
                {porCategoria
                  .filter((c) => !c.terminou && c.ci !== cessao.para)
                  .map((c) => (
                    <button
                      key={c.ci}
                      className="chip off"
                      style={{ padding: '2px 8px', fontSize: 11 }}
                      onClick={() => mesclarNoPlay(session.id, { campo: 'quadras_cedidas', quadra: String(q), categoria: c.ci })}
                    >
                      para a {c.cat.nome}
                    </button>
                  ))}
              </div>
            )
            if (filtroCat !== null && quadrasDaCategoria && !quadrasDaCategoria[filtroCat]?.includes(q) && !(m && catDe(m) === filtroCat)) return null
            if (!m) {
              return (
                <div key={q}>
                {aviso}
                <QuadraEsperando
                  key={q}
                  quadra={q}
                  restam={donaDa(q) === null ? pendentes.length : pendentes.filter((x) => catDe(x) === donaDa(q)).length}
                  livres={donaDa(q) === null ? livresAgora : livresAgora.filter((id) => categoriaDaJogadora(cats, session.groups, id) === donaDa(q))}
                  editable={editable}
                  grupoDe={grupoDe}
                />
                </div>
              )
            }
            return (
              <div key={m.id}>
              {aviso}
              <MatchCard
                match={m}
                quadra={q}
                target={alvoDe(m)}
                desempate={regraDe(m)}
                rodada={rotuloDaQuadra(m)}
                editable={editable}
                iniciada={!!atual}
                inicio={inicioDe(m)}
                ocupadas={ocupadasFora(m)}
                jogando={ocupadas}
                // no campeonato a cor do card e a da CATEGORIA, com a letra dela
                grupo={ehCampeonato ? catDe(m) + 1 : (m.fase ?? 1) >= 2 ? undefined : grupoDe.get(m.team_a[0])}
                totalGrupos={ehCampeonato ? cats.length : (grupos?.length ?? 1)}
                nomeDaTag={ehCampeonato ? cats[catDe(m)].nome : undefined}
                repetida={(m.fase ?? 1) < 2 && duplasRepetidas.has(m.id)}
                espera={espera}
                onScore={setScore}
                onIniciar={() => iniciar(m, q)}
                onCancelarInicio={() => cancelarInicio(m)}
                onTrocar={(sai, entra) => trocar(m, sai, entra)}
                onTrocarPartida={pendentes.length > 1 ? () => setEscolhendo(q) : undefined}
                // no campeonato a troca e dentro da categoria: uma menina de outra
                // categoria levaria a partida (e o rodizio) para a categoria dela
                jogadorasDoPlay={ehCampeonato ? cats[catDe(m)].grupos.flatMap((g) => session.groups?.[g] ?? []) : session.player_ids}
                mesmoGrupo={grupos?.find((g) => g.includes(m.team_a[0])) ?? null}
              />
              </div>
            )
          })
        )}
      </div>

      <ListaDePartidas
        titulo="⏭️ Próximas na fila"
        vazio="Nada na fila."
        rodape="É a ordem em que elas vão entrar: cada quadra que vaga pega a primeira do grupo dela com as quatro livres. Igual em todos os celulares."
        partidas={filtroCat === null || !ehCampeonato ? filaPrevista : filaPrevista.filter((m) => catDe(m) === filtroCat)}
        ausentes={ausentes}
        numerar
        jogos={jogos}
        grupoDe={ehCampeonato ? categoriaDe : grupoDe}
        totalGrupos={ehCampeonato ? cats.length : (grupos?.length ?? 1)}
        nomesDosGrupos={ehCampeonato ? cats.map((c) => c.nome) : undefined}
        repetidas={duplasRepetidas}
        desempateDe={regraDe}
        emQuadra={ocupadas}
      />

      <ListaDePartidas
        titulo={`✅ Já jogadas (${jogadas.length})`}
        vazio="Nenhum placar lançado ainda."
        partidas={
          ehCampeonato
            ? // por categoria (A, B, C), a mais recente primeiro em cada uma: misturadas pelo
              // horario, o divisor de fase ficava alternando entre as categorias
              [...jogadas]
                .reverse()
                .filter((m) => filtroCat === null || catDe(m) === filtroCat)
                .sort((x, y) => catDe(x) - catDe(y))
            : [...jogadas].reverse()
        }
        faseDe={
          soFase2
            ? (m) =>
                `${ehCampeonato ? `${cats[catDe(m)].nome} · ` : ''}${
                  (m.fase ?? 1) < 2 ? '👥 Fase de grupos' : '🤝 Duplas fixas · mata-mata'
                }`
            : undefined
        }
        grupoDe={ehCampeonato ? categoriaDe : grupoDe}
        totalGrupos={ehCampeonato ? cats.length : (grupos?.length ?? 1)}
        nomesDosGrupos={ehCampeonato ? cats.map((c) => c.nome) : undefined}
        repetidas={duplasRepetidas}
        desempateDe={regraDe}
        emQuadra={ocupadas}
        target={session.target}
        editable={editable}
        onCorrigir={(m) => setCorrigindo(m)}
      />

      {(session.eventos?.length ?? 0) > 0 && (
        <div className="card">
          <div className="section-title">🛠️ Intervenções nesta noite ({session.eventos?.length})</div>
          <p className="tiny muted" style={{ margin: '0 0 8px' }}>
            Tudo que foi feito na mão, com a hora e quantas partidas já tinham sido jogadas. É por aqui que se
            descobre depois por que uma dupla repetiu ou alguém ficou com uma partida a menos.
          </p>
          <div className="stack" style={{ gap: 6 }}>
            {[...(session.eventos ?? [])].reverse().map((e, i) => (
              <div key={`${e.at}-${i}`} className="fila-linha">
                <span className="fila-num">{horaLocal(e.at)}</span>
                <div className="grow">
                  <span className="fila-time">
                    {e.tipo === 'troca' ? '🔄' : e.tipo === 'entra-sai' ? '🔁' : e.tipo === 'quadra' ? '🏐' : '♻️'} {e.texto}
                  </span>
                  <span className="tiny muted">
                    {e.jogadas === 0
                      ? 'antes da primeira partida'
                      : `com ${plural(e.jogadas, 'partida')} já jogada${e.jogadas === 1 ? '' : 's'}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editable &&
        porCategoria
          .filter((c) => c.podeGerarFase2 || c.podeGerarRodada)
          .map((c) => (
            <div key={c.ci} className="card" style={{ borderColor: 'var(--marca)' }}>
              <div className="section-title" style={{ marginTop: 0 }}>
                ⏭️ {ehCampeonato ? `Categoria ${c.cat.nome}: ainda tem fase pela frente` : 'O play ainda tem fase pela frente'}
              </div>
              <p className="tiny muted" style={{ marginTop: 0 }}>
                {c.podeGerarFase2
                  ? `A fase de grupos${ehCampeonato ? ' desta categoria' : ''} acabou. O próximo passo é formar as duplas fixas (1ª com 1ª) e montar a chave do mata-mata — só depois disso ${ehCampeonato ? 'a categoria' : 'o play'} tem pódio.`
                  : `A rodada terminou e ainda há ${c.vivas.length} duplas vivas. Monte a próxima antes de encerrar.`}
              </p>
              {c.podeGerarFase2 &&
                c.desempates.map((d) => (
                  <DesempateEmQuadra
                    key={`${d.grupo}-${d.ids.join('|')}`}
                    titulo={`${ehCampeonato ? `${c.cat.nome} · ` : ''}grupo ${c.cat.grupos.indexOf(d.grupo) + 1}`}
                    ids={d.ids}
                    nameOf={nameOf}
                    onSalvar={(ordem, como) => salvarDesempate(d.grupo, ordem, como)}
                  />
                ))}
              <button
                className="btn pink block"
                disabled={montando || (c.podeGerarFase2 && c.desempates.length > 0)}
                onClick={async () => {
                  // um toque so: o segundo, antes de a tela atualizar, montaria a chave duas vezes
                  if (montando) return
                  setMontando(true)
                  try {
                    await (c.podeGerarFase2 ? gerarFase2(c.ci) : gerarProximaRodada(c.ci))
                  } finally {
                    setMontando(false)
                  }
                }}
              >
                {c.podeGerarFase2
                  ? `🤝 Montar as duplas e a chave${ehCampeonato ? ` da ${c.cat.nome}` : ''}`
                  : c.vivas.length === 2
                    ? '🥅 Montar final e 3º lugar'
                    : `🥅 Montar ${c.rotuloDaProxima.toLowerCase()}`}
              </button>
            </div>
          ))}

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

      {marcandoAusentes && (
        <Modal title="⏳ Quem ainda não chegou?" onClose={() => setMarcandoAusentes(false)}>
          <p className="tiny muted" style={{ marginTop: 0 }}>
            Marque quem está na lista mas ainda não apareceu. O app pula as partidas dela ao
            sugerir a próxima; quando ela chegar, desmarque — ela entra na frente, porque é quem
            está há mais tempo sem jogar. Se ela <strong>não vem</strong>, use o 🔁 Entra / sai.
          </p>
          <div className="stack">
            {session.player_ids.map((id) => (
              <button
                key={id}
                className={`duo-row${ausentes.has(id) ? ' off' : ''}`}
                onClick={() => alternarAusente(id)}
              >
                <Avatar player={playerById(id)} size={38} />
                <span className="grow ellipsis" style={{ fontWeight: 700 }}>{nameOf(id)}</span>
                <span className="tiny" style={{ fontWeight: 700 }}>
                  {ausentes.has(id) ? '⏳ não chegou' : '✅ aqui'}
                </span>
              </button>
            ))}
          </div>
          <button className="btn pink block" style={{ marginTop: 12 }} onClick={() => setMarcandoAusentes(false)}>
            Pronto
          </button>
        </Modal>
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
          ocupadas={indisponiveis}
          espera={espera}
          grupoDe={ehCampeonato ? categoriaDe : grupoDe}
          totalGrupos={ehCampeonato ? cats.length : (grupos?.length ?? 1)}
          nomesDosGrupos={ehCampeonato ? cats.map((c) => c.nome) : undefined}
          seguidas={seguidas}
          jaFormadas={jaFormadas}
          onEscolher={(m) => {
            escolherNaMao(escolhendo, m.id)
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
          {soFase2 && <ClassificacaoDosGrupos session={session} matches={matches} nameOf={nameOf} />}
          {dayRows.length === 0 ? (
            soFase2 ? null : <Empty>Nenhum placar lançado ainda.</Empty>
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
              {ehCampeonato && (
                <div className="chips-scroll" style={{ marginBottom: 8 }}>
                  <button className={`chip ${catArte === null ? 'on' : 'off'}`} style={{ flex: 'none' }} onClick={() => setCatArte(null)}>
                    🏆 Todas
                  </button>
                  {cats.map((c, ci) => (
                    <button key={ci} className={`chip ${catArte === ci ? 'on' : 'off'}`} style={{ flex: 'none' }} onClick={() => setCatArte(ci)}>
                      Categoria {c.nome}
                    </button>
                  ))}
                </div>
              )}
              {soFase2 &&
                (ehCampeonato
                  ? cats.map((c, ci) =>
                      (catArte === null || catArte === ci) && (duplasPorCategoria[ci]?.length ?? 0) > 0 ? (
                        <div key={ci}>
                          <div className="section-title" style={{ fontSize: 13 }}>Categoria {c.nome}</div>
                          <DuplasDoDia linhas={duplasPorCategoria[ci]} colocacao={colocacaoDoDia} porColocacao={Boolean(session.pontuacao?.length)} />
                        </div>
                      ) : null,
                    )
                  : <DuplasDoDia linhas={duplasDoDia} colocacao={colocacaoDoDia} porColocacao={Boolean(session.pontuacao?.length)} />)}
              {podios.length > 1 && (
                <>
                  {/* O seletor manda em tudo: a tabela abaixo, o texto e a imagem.
                      Geral primeiro, depois cada grupo. Chips e nao `segmented`:
                      com 4 ou 5 grupos os botoes fixos nao cabem no celular. */}
                  <div className="chips-scroll" style={{ marginBottom: 8 }}>
                    <button
                      className={`chip ${grupoArte === null ? 'on' : 'off'}`}
                      style={{ flex: 'none' }}
                      onClick={() => setGrupoArte(null)}
                    >
                      📋 Geral
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
                </>
              )}
              {podios.length > 1 && grupoArte === null && (
                <>
                  <div className="section-title" style={{ fontSize: 13 }}>
                    📋 Geral{' '}
                    <span className="tiny muted" style={{ fontWeight: 600 }}>
                      · {dayRows.length} jogadoras
                    </span>
                  </div>
                  <p className="tiny muted" style={{ marginTop: 0 }}>
                    Todas juntas, pelos pontos que vão para o ranking do mês. O pódio é por grupo —
                    toque num grupo para vê-lo com as medalhas.
                  </p>
                  <RankTable rows={dayRows} fire={streaksDoDia} vagas={0} />
                </>
              )}
              {podios.length > 1 &&
                grupoArte !== null &&
                podios
                  .filter((p) => p.grupo === grupoArte)
                  .map((p) => {
                    const doGrupo = new Set(p.membros)
                    return (
                      <div key={p.grupo}>
                        <div className="section-title" style={{ fontSize: 13 }}>
                          👥 Grupo {p.grupo}{' '}
                          <span className="tiny muted" style={{ fontWeight: 600 }}>
                            · {p.membros.length} jogadoras · pódio: {p.rows.length}
                          </span>
                        </div>
                        <RankTable
                          rows={dayRows.filter((s) => doGrupo.has(s.player_id))}
                          fire={streaksDoDia}
                          vagas={p.rows.length}
                        />
                      </div>
                    )
                  })}
              {podios.length <= 1 && <RankTable rows={ehCampeonato ? rowsSel : dayRows} fire={streaksDoDia} />}
              {podios.length > 1 && (
                <p className="tiny muted" style={{ marginTop: 10, marginBottom: 8 }}>
                  📤 O texto e a imagem saem com {grupoArte === null ? 'todos os grupos' : `só o grupo ${grupoArte}`},
                  já escrito de qual grupo se trata.
                </p>
              )}
              <button
                className="btn pink block"
                style={{ marginTop: podios.length > 1 ? 0 : 12 }}
                onClick={async () => {
                  // no campeonato sai um bloco por categoria, cada um carimbado
                  const texto = ehCampeonato
                    ? cats
                        .map((c, ci) => ({ c, ci }))
                        .filter(({ ci }) => catArte === null || catArte === ci)
                        // categoria que ainda nao tem resultado no mata-mata nao entra no texto
                        .filter(({ ci }) => dayRows.some((x) => categoriaDaJogadora(cats, session.groups, x.player_id) === ci))
                        .map(({ c, ci }) => {
                          const rows = dayRows.filter((x) => categoriaDaJogadora(cats, session.groups, x.player_id) === ci)
                          return dayRankingText({
                            date: session.date,
                            title: `${session.title} · Categoria ${c.nome}`,
                            rows,
                            nameOf,
                            podios: podiosDoDia(rows, null),
                            duplas: soComCampea(duplasPorCategoria[ci] ?? []),
                            streaks: streaksDoDia,
                          })
                        })
                        .join('\n\n')
                    : dayRankingText({
                        date: session.date,
                        title: session.title,
                        rows: rowsSel,
                        nameOf,
                        podios: podiosSel,
                        duplas: soFase2 ? soComCampea(duplasDoDia) : undefined,
                        streaks: streaksDoDia,
                        award,
                      })
                  const ok = await shareOrCopy(texto)
                  onToast(ok ? 'Ranking do dia copiado 💬' : 'Não consegui copiar')
                }}
              >
                💬 Texto{' '}
                {ehCampeonato
                  ? catArte === null
                    ? 'de todas as categorias'
                    : `da categoria ${cats[catArte].nome}`
                  : grupoArte === null
                    ? 'do dia'
                    : `do grupo ${grupoArte}`}{' '}
                para o WhatsApp
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

function GrupoTag({ grupo, total, nome }: { grupo?: number; total: number; nome?: string }) {
  if (!grupo || total <= 1) return null
  // no campeonato a cor e a letra sao da CATEGORIA (A, B, C...)
  return <span className={`grupo-tag ${classeDoGrupo(grupo)}`}>{nome ?? `G${grupo}`}</span>
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
  nomeDaTag,
  repetida,
  espera,
  jogadorasDoPlay,
  mesmoGrupo,
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
  /** Etiqueta da quadra no campeonato: a letra da categoria (A, B, C...). */
  nomeDaTag?: string
  repetida: boolean
  espera: Map<string, number>
  jogadorasDoPlay: string[]
  /** As jogadoras do grupo desta partida (null = play sem grupos). */
  mesmoGrupo?: string[] | null
  onScore: (m: Match, a: number | null, b: number | null, tie?: number | null) => void
  onIniciar: () => void
  onCancelarInicio: () => void
  onTrocar: (sai: string, entra: string) => void
  onTrocarPartida?: () => void
}) {
  const { nameOf } = useStore()
  const [winner, setWinner] = useState<'a' | 'b' | null>(null)
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
      mesmoGrupo={mesmoGrupo}
      onTrocar={(sai, entra) => { onTrocar(sai, entra); setTrocando(false) }}
      onClose={() => setTrocando(false)}
    />
  )

  const cabecalho = (
    <div className="match-head">
      <span>
        Quadra {quadra} <GrupoTag grupo={grupo} total={totalGrupos} nome={nomeDaTag} />
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

  // ---- passo 2: como terminou (placar inteiro, do lado de quem venceu) ----
  if (winner) {
    const vencedoras = winner === 'a' ? match.team_a : match.team_b
    const perdedoras = winner === 'a' ? match.team_b : match.team_a
    return (
      <div className={`match live ${corDoGrupo}`}>
        <div className="match-head">
          <span>Quadra {quadra}</span>
          <button className="linkish" onClick={() => setWinner(null)}>‹ voltar</button>
        </div>
        <div className="team win">
          <Duo ids={vencedoras} />
          <span className="score-box">🏆</span>
        </div>
        <ComoTerminou
          alvo={target}
          regra={desempate}
          vencedora={vencedoras.map(nameOf).join(' + ')}
          perdedora={perdedoras.map(nameOf).join(' + ')}
          onLancar={(venceu, perdeu, tie) => {
            setWinner(null)
            if (winner === 'a') onScore(match, venceu, perdeu, tie)
            else onScore(match, perdeu, venceu, tie)
          }}
        />
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
          <button className="btn ghost sm grow" onClick={onTrocarPartida}>🔀 Trocar por outra partida</button>
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
  nomesDosGrupos,
  repetidas,
  emQuadra,
  faseDe,
  ausentes,
  desempateDe,
  target,
  editable,
  onCorrigir,
}: {
  titulo: string
  vazio: string
  /** Quem ainda nao chegou: a partida dela ganha a etiqueta e vai ficando para o fim. */
  ausentes?: Set<string>
  /** Explicacao curta embaixo da lista. */
  rodape?: string
  partidas: Match[]
  /** Numera pela posicao na lista (a ordem prevista), nao pelo campo do banco. */
  numerar?: boolean
  /** Quantas partidas cada jogadora ja fez hoje. */
  jogos?: Map<string, number>
  grupoDe: Map<string, number>
  totalGrupos: number
  /** Campeonato: `grupoDe` traz a categoria (1 = A) e a etiqueta mostra a letra. */
  nomesDosGrupos?: string[]
  repetidas: Map<string, Repeticao>
  emQuadra: Set<string>
  /** Para separar as fases na lista: muda o rotulo, entra um divisor (grupos -> duplas fixas). */
  faseDe?: (m: Match) => string
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
            // quando a fase muda de uma linha para a outra, um divisor diz onde
            const fase = faseDe?.(m)
            const divisor = fase && (i === 0 || faseDe?.(visiveis[i - 1]) !== fase) ? fase : null
            return (
              <div key={m.id}>
              {divisor && <div className="fase-divisor">{divisor}</div>}
              <div className="fila-linha">
                <span className="fila-num">
                  {numerar ? `${i + 1}ª` : m.round}
                  <GrupoTag
                    grupo={nomesDosGrupos || (m.fase ?? 1) < 2 ? grupoDe.get(m.team_a[0]) : undefined}
                    total={totalGrupos}
                    nome={nomesDosGrupos?.[(grupoDe.get(m.team_a[0]) ?? 1) - 1]}
                  />
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
                  {ausentes && jogadorasDaPartida(m).some((id) => ausentes.has(id)) && (
                    <span className="tiny nowrap" style={{ color: 'var(--yellow)', fontWeight: 800 }}>
                      ⏳ espera {jogadorasDaPartida(m).filter((id) => ausentes.has(id)).map(nameOf).join(' e ')} chegar
                    </span>
                  )}
                  {jogada && m.tie != null && desempateDe && (
                    <span className="tiny nowrap tie-tag" title="decidida no tie">
                      🎯 {placarDoTie(desempateDe(m), m.tie)}
                    </span>
                  )}
                  {repetidas.has(m.id) && (
                    <span className="tiny muted">
                      🔁 {(repetidas.get(m.id) as Repeticao).duplas.join(' e ')}{' '}
                      {(repetidas.get(m.id) as Repeticao).duplas.length > 1 ? 'jogam' : 'joga'} pela 2ª vez
                      {(repetidas.get(m.id) as Repeticao).planejada
                        ? ' — é o que deixa todas com o mesmo número de partidas'
                        : ' — não estava no plano: veio de uma troca na mão. Refazer a fila compensa.'}
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

  if (winner) {
    const vencedoras = winner === 'a' ? match.team_a : match.team_b
    const perdedoras = winner === 'a' ? match.team_b : match.team_a
    return (
      <Modal title="Corrigir o placar" onClose={onClose}>
        <button className="btn ghost sm" style={{ marginBottom: 10 }} onClick={() => setWinner(null)}>
          ‹ trocar quem venceu
        </button>
        <ComoTerminou
          alvo={target}
          regra={desempate}
          vencedora={vencedoras.map(nameOf).join(' + ')}
          perdedora={perdedoras.map(nameOf).join(' + ')}
          onLancar={(venceu, perdeu, tie) =>
            winner === 'a' ? onScore(venceu, perdeu, tie) : onScore(perdeu, venceu, tie)
          }
        />
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
  mesmoGrupo,
  onTrocar,
  onClose,
}: {
  noTime: string[]
  ocupadas: Set<string>
  jogando: Set<string>
  espera: Map<string, number>
  jogadorasDoPlay: string[]
  mesmoGrupo?: string[] | null
  onTrocar: (sai: string, entra: string) => void
  onClose: () => void
}) {
  const { nameOf, playerById } = useStore()
  const [sai, setSai] = useState<string | null>(null)

  // quem e de outro grupo entra no rodizio errado: vai para o fim da lista,
  // com etiqueta, e so deve ser usada quando nao ha ninguem do grupo livre
  const deOutroGrupo = (id: string) => Boolean(mesmoGrupo && !mesmoGrupo.includes(id))
  const candidatas = jogadorasDoPlay
    .filter((id) => !noTime.includes(id))
    .sort((a, b) => {
      const ga = deOutroGrupo(a) ? 1 : 0
      const gb = deOutroGrupo(b) ? 1 : 0
      const oa = ocupadas.has(a) ? 1 : 0
      const ob = ocupadas.has(b) ? 1 : 0
      // do mesmo grupo primeiro, depois livres, e entre elas quem esta fora ha mais tempo
      return ga - gb || oa - ob || (espera.get(a) ?? 0) - (espera.get(b) ?? 0)
    })

  if (!sai) {
    return (
      <Modal title="Quem sai da partida?" onClose={onClose}>
        <div className="banner warn" style={{ marginBottom: 10 }}>
          Isto muda <strong>só esta partida</strong>: quem sai fica com uma a menos e quem entra
          com uma a mais, e as duplas desta partida deixam de ser as do rodízio. Se alguém{' '}
          <strong>saiu de vez</strong> ou <strong>chegou agora</strong>, use o{' '}
          <strong>🔁 Entra / sai</strong>, que arruma a fila inteira. Se for só esta partida, depois
          toque em <strong>🔄 Refazer a fila</strong> para o app compensar.
        </div>
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
            // quem esta em quadra agora nao pode entrar em outra partida: a
            // linha fica visivel (para se saber onde ela esta), mas nao entra
            <button
              key={id}
              className="duo-row"
              disabled={jogando.has(id)}
              title={jogando.has(id) ? `${nameOf(id)} está em quadra agora` : undefined}
              onClick={() => onTrocar(sai, id)}
            >
              <Avatar player={playerById(id)} size={38} />
              <span className="grow ellipsis" style={{ fontWeight: 700 }}>
                {nameOf(id)}
                {deOutroGrupo(id) && (
                  <span className="tiny" style={{ color: 'var(--yellow)', fontWeight: 700, display: 'block' }}>
                    ⚠️ de outro grupo — ela fica com uma partida a mais no grupo dela
                  </span>
                )}
              </span>
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
  nomesDosGrupos,
  seguidas,
  jaFormadas,
  onEscolher,
  onClose,
}: {
  quadra: number
  partidas: Match[]
  /** Quantas seguidas cada uma acabou de jogar: entrar agora seria a terceira? */
  seguidas?: Map<string, number>
  /** Duplas que ja jogaram hoje: esta partida e a segunda vez de uma delas? */
  jaFormadas?: Set<string>
  ocupadas: Set<string>
  espera: Map<string, number>
  grupoDe: Map<string, number>
  totalGrupos: number
  /** Campeonato: `grupoDe` traz a categoria (1 = A) e a etiqueta mostra a letra. */
  nomesDosGrupos?: string[]
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
    <Modal title={`Trocar a partida da quadra ${quadra} por qual?`} onClose={onClose}>
      <p className="tiny muted" style={{ marginTop: 0 }}>
        A fila já escolhe sozinha a próxima partida desta quadra — troque só se precisar (alguém
        pediu para esperar, por exemplo). A troca aparece em todos os celulares. As de cima são as
        que têm as quatro livres e esperando há mais tempo.
      </p>
      <div className="stack">
        {ordenadas.slice(0, 30).map((m) => {
          const presas = jogadorasDaPartida(m).filter((id) => ocupadas.has(id))
          const terceira = jogadorasDaPartida(m).filter((id) => (seguidas?.get(id) ?? 0) >= 2)
          const repetida =
            jaFormadas?.has(pairKey(m.team_a[0], m.team_a[1])) || jaFormadas?.has(pairKey(m.team_b[0], m.team_b[1]))
          return (
            <button key={m.id} className="duo-row" onClick={() => onEscolher(m)} disabled={presas.length > 0}>
              <span className="fila-num">
                {m.round}
                <GrupoTag
                  grupo={nomesDosGrupos || (m.fase ?? 1) < 2 ? grupoDe.get(m.team_a[0]) : undefined}
                  total={totalGrupos}
                  nome={nomesDosGrupos?.[(grupoDe.get(m.team_a[0]) ?? 1) - 1]}
                />
              </span>
              <span className="grow" style={{ minWidth: 0 }}>
                {(repetida || terceira.length > 0) && (
                  <span className="tiny" style={{ color: 'var(--yellow)', fontWeight: 700, display: 'block' }}>
                    {repetida ? '🔁 dupla repetida — melhor deixar para o fim' : ''}
                    {repetida && terceira.length > 0 ? ' · ' : ''}
                    {terceira.length > 0 ? `⚠️ ${terceira.map(nameOf).join(' e ')} jogaria a 3ª seguida` : ''}
                  </span>
                )}
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
 * O mata-mata do dia: o podio e a campanha de cada dupla.
 *
 * A ordem sai de `rankDuplasDoDia`, a mesma que decide quem segura o 🔥 --
 * um podio na tela que nao bate com o que vale para a sequencia seria bug
 * esperando para ser reportado.
 */
function DuplasDoDia({
  linhas,
  colocacao,
  porColocacao,
}: {
  linhas: DuplaDoDia[]
  /** Com tabela de colocacao, os pontos que cada uma leva (no lugar dos do placar). */
  colocacao?: Map<string, number>
  /** O play pontua por colocacao: antes de a categoria fechar, ainda nao ha pontos. */
  porColocacao?: boolean
}) {
  const { nameOf, playerById } = useStore()
  const pontosDa = (d: DuplaDoDia): number | string =>
    porColocacao ? (colocacao?.get(d.a) ?? '—') : d.points
  if (linhas.length === 0) return null

  const medalhas = ['🥇', '🥈', '🥉']
  const podio = linhas.slice(0, DUPLAS_NO_PODIO)
  // so ha podio quando a FINAL foi jogada: antes disso as medalhas por posicao
  // davam ouro e prata para quem estava na semifinal (12/10, no teste da organizacao)
  const temCampea = linhas.some((d) => d.medalha === 3)
  const situacao = (d: DuplaDoDia) => (d.viva ? 'segue na chave' : `caiu ${d.saiuEm}`)

  return (
    <>
      {!temCampea ? (
        <div className="banner info" style={{ marginBottom: 8 }}>
          🏆 <strong>Chave em andamento</strong> — o pódio aparece quando a final for lançada.
        </div>
      ) : (
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
            <span className="nowrap" style={{ fontWeight: 800 }}>{pontosDa(d)} pts</span>
          </div>
        ))}
      </div>
      <p className="tiny muted" style={{ marginTop: 6 }}>
        Quem está nestas três duplas segura a sequência 🔥 do dia.
      </p>
      </>
      )}

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
                <td className={`rank-pos${temCampea ? ` top${i + 1}` : ''}`} style={{ fontWeight: 800 }}>{i + 1}</td>
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    <Avatar player={playerById(d.a)} size={24} />
                    <Avatar player={playerById(d.b)} size={24} />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="ellipsis" style={{ display: 'block' }}>
                        {nameOf(d.a)} + {nameOf(d.b)}
                      </span>
                      {!temCampea && <span className="tiny muted">{situacao(d)}</span>}
                    </span>
                  </div>
                </td>
                <td>{d.wins}</td>
                <td>{d.losses}</td>
                <td style={{ fontWeight: 800, color: 'var(--marca)' }}>{pontosDa(d)}</td>
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
/**
 * COMO TERMINOU? -- o placar inteiro em cada botao, do lado de quem venceu.
 *
 * Antes eram duas perguntas pelo lado da PERDEDORA ("quantos games ela fez?",
 * depois "quantos pontos no tie?"), com botoes misturando so o numero dela e o
 * placar inteiro -- e na quadra todo mundo pensa "foi 5x4, tie 7x5". Agora: os
 * placares possiveis pela regra (4x0 ... 5x3, 5x4 🎯); tocou no do tie, a
 * linha do tie aparece logo abaixo (7x0 ... 7x5, 8x6...). O ✏️ digita qualquer
 * placar, para o tie que se arrastou alem dos botoes.
 */
function ComoTerminou({
  alvo,
  regra,
  vencedora,
  perdedora,
  onLancar,
}: {
  alvo: number
  regra: Regra
  /** "Ana + Bia" */
  vencedora: string
  perdedora: string
  onLancar: (doVencedor: number, doPerdedor: number, tieDoPerdedor: number | null) => void
}) {
  const [noTie, setNoTie] = useState<{ venceu: number; perdeu: number } | null>(null)
  const [digitando, setDigitando] = useState<'games' | 'tie' | null>(null)

  function escolher(venceu: number, perdeu: number) {
    // decidida no tie: o tie tem placar proprio, pergunta antes de gravar
    if (decidiuNoTie(alvo, regra, perdeu)) {
      setNoTie({ venceu, perdeu })
      setDigitando(null)
      return
    }
    onLancar(venceu, perdeu, null)
  }

  return (
    <div>
      <div className="ask" style={{ marginTop: 0 }}>
        Como terminou? <span className="muted">(placar de <strong>{vencedora}</strong>)</span>
      </div>
      <div className="games-row">
        {gamesDoPerdedor(alvo, regra).map((n) => {
          const venceu = gamesDoVencedor(alvo, regra, n)
          const tie = decidiuNoTie(alvo, regra, n)
          const marcado = noTie?.perdeu === n
          return (
            <button
              key={n}
              className={`game-btn${tie ? ' no-tie' : ''}${marcado ? ' marcado' : ''}`}
              title={tie ? `empatou em ${n}x${n} e foi para o tie: fica ${venceu}x${n}` : `${venceu}x${n}`}
              onClick={() => escolher(venceu, n)}
            >
              {/* o do tie mostra o EMPATE que levou a ele: "7x6" fazia parecer que o 7 veio antes */}
              {tie ? `${n}x${n} → tie` : `${venceu}x${n}`}
            </button>
          )
        })}
        <button className="game-btn manual" onClick={() => setDigitando(digitando === 'games' ? null : 'games')}>
          ✏️
        </button>
      </div>

      {digitando === 'games' && (
        <PlacarManual
          vencedora={vencedora}
          perdedora={perdedora}
          valida={(a, b) => placarDeGamesValido(alvo, regra, a, b)}
          explica={(a, b) => explicarGamesInvalido(alvo, regra, a, b)}
          onCancelar={() => setDigitando(null)}
          onConfirmar={(venceu, perdeu) => escolher(venceu, perdeu)}
        />
      )}

      {noTie && (
        <>
          <div className="ask">
            🎯 Foi para o tie no {noTie.perdeu}x{noTie.perdeu}: quem venceu o tie venceu a partida (fica{' '}
            {noTie.venceu}x{noTie.perdeu}). <strong>Placar do tie</strong>{' '}
            <span className="muted">(de {vencedora})</span>:
          </div>
          <div className="games-row">
            {pontosDoPerdedorNoTie(regra).map((p) => (
              <button
                key={p}
                className="game-btn"
                onClick={() => onLancar(noTie.venceu, noTie.perdeu, p)}
              >
                {placarDoTie(regra, p)}
              </button>
            ))}
            <button className="game-btn manual" onClick={() => setDigitando(digitando === 'tie' ? null : 'tie')}>
              ✏️
            </button>
          </div>
          {digitando === 'tie' && (
            <PlacarManual
              vencedora="Venceu o tie"
              perdedora="Perdeu o tie"
              valida={(a, b) => tieValido(regra, a, b)}
              explica={(a, b) => explicarTieInvalido(regra, a, b)}
              onCancelar={() => setDigitando(null)}
              onConfirmar={(_v, perdeu) => onLancar(noTie.venceu, noTie.perdeu, perdeu)}
            />
          )}
        </>
      )}
    </div>
  )
}

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
                        <option key={i} value={i}>
                          {nomeDoGrupoNoPlay(session, i)} · {g.length} jogadoras
                        </option>
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
