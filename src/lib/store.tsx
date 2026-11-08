import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { localRepo } from '../data/localRepo'
import { loadCache, loadQueue, saveCache, saveQueue, type WriteOp } from '../data/queue'
import type { Repo } from '../data/repo'
import { aplicarNaStore } from './reducerDaStore'
import { limparCadastro } from './roster'
import { computeStreaks, jaForamDuquesa } from './streaks'
import { LIGA } from '../liga'
import { avisosDoBanco, supabaseRepo } from '../data/supabaseRepo'
import { hasSupabase, supabase } from './supabase'
import type {
  Acerto,
  Mensalidade,
  Ajuste,
  ItemDaMensalidade,
  Plano,
  AppData,
  Checkin,
  CheckinConta,
  CheckinDia,
  CheckinLocal,
  CheckinPagamento,
  LancamentoDeCaixa,
  Match,
  MonthClosure,
  EventoDoPlay,
  MesclaDoPlay,
  PlaySession,
  Player,
  StreakChoice,
} from './types'
import { emptyData, uid } from './types'

export type SyncState = 'saved' | 'saving' | 'pending'

type Ctx = {
  data: AppData
  loading: boolean
  error: string | null
  online: boolean
  canEdit: boolean
  userEmail: string | null
  sync: SyncState
  pendingCount: number
  reload: () => Promise<void>
  repo: Repo
  savePlayer: (p: Player) => void
  deletePlayer: (id: string) => void
  saveSession: (s: PlaySession) => void
  anotarNoPlay: (sessionId: string, evento: EventoDoPlay) => void
  mesclarNoPlay: (sessionId: string, mescla: MesclaDoPlay) => void
  deleteSession: (id: string) => void
  saveMatches: (ms: Match[]) => void
  replaceSessionMatches: (sessionId: string, ms: Match[]) => void
  saveChoice: (choice: StreakChoice) => void
  /** Fecha o mes na mao (o botao "finalizar o mes"). */
  saveClosure: (closure: MonthClosure) => void
  deleteClosure: (month: string) => void
  /** Junta duas jogadoras numa so, preservando partidas, pontos e sequencia. */
  mergePlayers: (fromId: string, intoId: string) => void
  /* check-ins */
  saveCheckinLocal: (local: CheckinLocal) => void
  deleteCheckinLocal: (id: string) => void
  saveCheckinConta: (conta: CheckinConta) => void
  deleteCheckinConta: (id: string) => void
  saveCheckinDia: (dia: CheckinDia) => void
  deleteCheckinDia: (id: string) => void
  saveCheckin: (checkin: Checkin) => void
  deleteCheckin: (id: string) => void
  saveCheckinPagamento: (pagamento: CheckinPagamento) => void
  deleteCheckinPagamento: (checkinId: string) => void
  saveCaixa: (lancamento: LancamentoDeCaixa) => void
  deleteCaixa: (id: string) => void
  saveMensalidade: (ficha: Mensalidade) => void
  saveAjuste: (ajuste: Ajuste) => void
  saveItemDaMensalidade: (item: ItemDaMensalidade) => void
  deleteItemDaMensalidade: (id: string) => void
  saveAcerto: (acerto: Acerto) => void
  deleteAcerto: (id: string) => void
  savePlano: (plano: Plano) => void
  deletePlano: (id: string) => void
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  playerById: (id: string) => Player | undefined
  nameOf: (id: string) => string
  /** Quem ja foi Duquesa da V3: o nome fica dourado com a coroa para sempre. */
  duquesas: Set<string>
}

const StoreContext = createContext<Ctx | null>(null)

const applyLocally = (d: AppData, op: WriteOp) => aplicarNaStore(d, op, hasSupabase)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const repo = hasSupabase ? supabaseRepo : localRepo
  // no modo online o app abre com o ultimo estado conhecido, mesmo sem sinal
  const cached = hasSupabase ? loadCache<AppData>() : null
  // o cache gravado por uma versao anterior nao tem as chaves novas: sem o
  // espalhamento, `data.checkins.filter` quebraria na abertura
  const [data, setData] = useState<AppData>(() => (cached ? { ...emptyData(), ...cached } : emptyData()))
  // com dados em cache a tela ja aparece; a atualizacao vem em segundo plano
  const [loading, setLoading] = useState(cached === null)
  const [error, setError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [queue, setQueue] = useState<WriteOp[]>(() => (hasSupabase ? loadQueue() : []))
  const [syncing, setSyncing] = useState(false)

  const queueRef = useRef(queue)
  const draining = useRef(false)
  const retryTimer = useRef<number | null>(null)
  const reloadTimer = useRef<number | null>(null)

  useEffect(() => {
    queueRef.current = queue
    if (repo.kind === 'supabase') saveQueue(queue)
  }, [queue, repo.kind])

  const reload = useCallback(async () => {
    try {
      // sem isso, uma conexao que trava deixa o app preso em "Carregando..."
      const loaded = await withTimeout(repo.load(), 15000)
      // reaplica por cima o que ainda nao subiu, senao a tela "perde" o que
      // foi lancado sem sinal ate a fila terminar de enviar
      const d = queueRef.current.reduce(applyLocally, loaded)
      setData(d)
      if (repo.kind === 'supabase') saveCache(d)
      setError(null)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setLoading(false)
    }
  }, [repo])

  // tenta de novo sozinho quando a primeira carga falha (sinal ruim)
  useEffect(() => {
    if (!error || loading) return
    const t = window.setTimeout(() => void reload(), 15000)
    return () => window.clearTimeout(t)
  }, [error, loading, reload])

  /** Envia a fila de escritas, uma por vez, e tenta de novo se cair a rede. */
  const drain = useCallback(async () => {
    if (draining.current) return
    draining.current = true
    try {
      while (queueRef.current.length > 0) {
        const op = queueRef.current[0]
        setSyncing(true)
        try {
          await runOp(repo, op)
        } catch (e) {
          setError(messageOf(e))
          if (retryTimer.current) window.clearTimeout(retryTimer.current)
          retryTimer.current = window.setTimeout(() => void drain(), 5000)
          return
        }
        queueRef.current = queueRef.current.filter((x) => x.id !== op.id)
        setQueue(queueRef.current)
        setError(null)
        // A decisao pode ter mudado no banco enquanto este celular estava offline.
        if (op.type === 'mesclarNoPlay' && (op.mescla.campo === 'abrir_quadra' || op.mescla.campo === 'tirar_quadra')) await reload()
      }
    } finally {
      draining.current = false
      setSyncing(false)
    }
  }, [repo, reload])

  const push = useCallback(
    (op: WriteOp) => {
      if (op.type === 'saveAjuste' && (LIGA.id !== 'feminino' || (repo.kind === 'supabase' && avisosDoBanco.tabelas.has('ajustes')))) {
        throw new Error('Os ajustes precisam do script 35 no banco.')
      }
      if (op.type === 'saveMensalidade' || op.type === 'saveItemDaMensalidade' || op.type === 'deleteItemDaMensalidade') {
        if (LIGA.id !== 'feminino') throw new Error('Mensalidade disponível apenas no Play de Todas')
        const tabela = op.type === 'saveMensalidade' ? 'mensalidades' : 'mensalidade_itens'
        if (repo.kind === 'supabase' && avisosDoBanco.tabelas.has(tabela)) {
          throw new Error('Tabela de mensalidade indisponível. Confira o script 34.')
        }
      }
      setData((d) => {
        const next = applyLocally(d, op)
        if (repo.kind === 'supabase') saveCache(next)
        return next
      })
      queueRef.current = [...queueRef.current, op]
      setQueue(queueRef.current)
      void drain()
    },
    [drain, repo.kind],
  )

  useEffect(() => {
    void reload().then(() => void drain())
  }, [reload, drain])

  // volta o sinal -> tenta enviar o que ficou pendente
  useEffect(() => {
    const onOnline = () => void drain()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [drain])

  /*
   * VOLTOU PARA A TELA -> recarrega.
   *
   * O tempo real cobre o que acontece enquanto o app esta aberto. Mas no
   * celular a tela apaga, o app vai para segundo plano e a conexao cai; o
   * que a outra organizadora lancou nesse meio tempo nao e reenviado quando
   * a conexao volta. Entao, ao voltar para a tela, o app busca tudo de novo
   * -- sem sobrescrever escrita pendente, que sai primeiro.
   */
  useEffect(() => {
    const onVisivel = () => {
      if (document.visibilityState !== 'visible') return
      if (queueRef.current.length > 0) {
        void drain()
        return
      }
      void reload()
    }
    document.addEventListener('visibilitychange', onVisivel)
    window.addEventListener('focus', onVisivel)
    return () => {
      document.removeEventListener('visibilitychange', onVisivel)
      window.removeEventListener('focus', onVisivel)
    }
  }, [drain, reload])

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data: s }) => setUserEmail(s.session?.user.email ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      setUserEmail(s?.user.email ?? null)
      void drain()
      // o token mudou: o que veio sem ele (check-ins e caixa vazios pela RLS) precisa ser relido.
      // Sem isso a aba Check-ins ficava vazia ate sair e voltar (dono, 06/11). INITIAL_SESSION fica de fora: e a carga inicial.
      if (e === 'SIGNED_IN' || e === 'TOKEN_REFRESHED' || e === 'SIGNED_OUT') {
        if (reloadTimer.current) window.clearTimeout(reloadTimer.current)
        reloadTimer.current = window.setTimeout(() => {
          if (queueRef.current.length === 0) void reload()
        }, 300)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [drain, reload])

  // mudancas feitas por outra pessoa; nunca sobrescreve escrita pendente
  useEffect(() => {
    if (!repo.subscribe) return
    return repo.subscribe(() => {
      if (queueRef.current.length > 0) return
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current)
      reloadTimer.current = window.setTimeout(() => {
        if (queueRef.current.length === 0) void reload()
      }, 600)
    })
  }, [repo, reload])

  // so depende das partidas: nao recalcula a cada escrita na fila
  const duquesas = useMemo(() => jaForamDuquesa(computeStreaks(data)), [data])

  const value = useMemo<Ctx>(() => {
    const byId = new Map(data.players.map((p) => [p.id, p]))
    const sync: SyncState = queue.length === 0 ? 'saved' : syncing ? 'saving' : 'pending'
    return {
      data,
      loading,
      error,
      repo,
      online: repo.kind === 'supabase',
      canEdit: repo.kind === 'local' || userEmail !== null,
      userEmail,
      sync,
      pendingCount: queue.length,
      reload,
      // todo cadastro passa por aqui: o caractere invisivel colado do WhatsApp sai ao salvar
      savePlayer: (player) => push({ id: uid(), type: 'savePlayer', player: limparCadastro(player) }),
      deletePlayer: (playerId) => push({ id: uid(), type: 'deletePlayer', playerId }),
      saveSession: (session) => push({ id: uid(), type: 'saveSession', session }),
      anotarNoPlay: (sessionId, evento) => push({ id: uid(), type: 'anotarNoPlay', sessionId, evento }),
      mesclarNoPlay: (sessionId, mescla) => push({ id: uid(), type: 'mesclarNoPlay', sessionId, mescla }),
      deleteSession: (sessionId) => push({ id: uid(), type: 'deleteSession', sessionId }),
      saveMatches: (matches) => push({ id: uid(), type: 'saveMatches', matches }),
      replaceSessionMatches: (sessionId, matches) =>
        push({ id: uid(), type: 'replaceSessionMatches', sessionId, matches }),
      saveChoice: (choice) => push({ id: uid(), type: 'saveChoice', choice }),
      saveClosure: (closure) => push({ id: uid(), type: 'saveClosure', closure }),
      deleteClosure: (month) => push({ id: uid(), type: 'deleteClosure', month }),
      saveCheckinLocal: (local) => push({ id: uid(), type: 'saveCheckinLocal', local }),
      deleteCheckinLocal: (localId) => push({ id: uid(), type: 'deleteCheckinLocal', localId }),
      saveCheckinConta: (conta) => push({ id: uid(), type: 'saveCheckinConta', conta }),
      deleteCheckinConta: (contaId) => push({ id: uid(), type: 'deleteCheckinConta', contaId }),
      saveCheckinDia: (dia) => push({ id: uid(), type: 'saveCheckinDia', dia }),
      deleteCheckinDia: (diaId) => push({ id: uid(), type: 'deleteCheckinDia', diaId }),
      saveCheckin: (checkin) => push({ id: uid(), type: 'saveCheckin', checkin }),
      deleteCheckin: (checkinId) => push({ id: uid(), type: 'deleteCheckin', checkinId }),
      saveCheckinPagamento: (pagamento) => push({ id: uid(), type: 'saveCheckinPagamento', pagamento }),
      deleteCheckinPagamento: (checkinId) => push({ id: uid(), type: 'deleteCheckinPagamento', checkinId }),
      saveCaixa: (lancamento) => push({ id: uid(), type: 'saveCaixa', lancamento }),
      deleteCaixa: (lancamentoId) => push({ id: uid(), type: 'deleteCaixa', lancamentoId }),
      saveMensalidade: (ficha) => push({ id: uid(), type: 'saveMensalidade', ficha }),
      saveAjuste: (ajuste) => push({ id: uid(), type: 'saveAjuste', ajuste }),
      saveItemDaMensalidade: (item) => push({ id: uid(), type: 'saveItemDaMensalidade', item }),
      deleteItemDaMensalidade: (itemId) => push({ id: uid(), type: 'deleteItemDaMensalidade', itemId }),
      saveAcerto: (acerto) => push({ id: uid(), type: 'saveAcerto', acerto }),
      deleteAcerto: (acertoId) => push({ id: uid(), type: 'deleteAcerto', acertoId }),
      savePlano: (plano) => push({ id: uid(), type: 'savePlano', plano }),
      deletePlano: (planoId) => push({ id: uid(), type: 'deletePlano', planoId }),
      mergePlayers: (fromId, intoId) => {
        if (fromId === intoId) return
        const troca = (id: string) => (id === fromId ? intoId : id)
        // partidas: a duplicada vira a jogadora que fica
        const matches = data.matches
          .filter((m) => [...m.team_a, ...m.team_b].includes(fromId))
          .map((m) => ({
            ...m,
            team_a: m.team_a.map(troca) as [string, string],
            team_b: m.team_b.map(troca) as [string, string],
          }))
        // presenca nos plays, sem duplicar quem ja estava
        const sessions = data.sessions
          .filter((s) => s.player_ids.includes(fromId))
          .map((s) => ({ ...s, player_ids: [...new Set(s.player_ids.map(troca))] }))
        // check-ins de quem sai passam para quem fica; as contas secundarias
        // tambem, e a principal de quem sai so migra se quem fica nao tem a sua
        const checkins = data.checkins.filter((c) => c.player_id === fromId).map((c) => ({ ...c, player_id: intoId }))
        const temPrincipal = data.checkinContas.some((c) => c.player_id === intoId && c.principal)
        const contas = data.checkinContas
          .filter((c) => c.player_id === fromId && (!c.principal || !temPrincipal))
          .map((c) => (c.principal ? { ...c, id: `principal:${intoId}`, player_id: intoId } : { ...c, player_id: intoId }))
        const acertos = data.checkinAcertos.filter((a) => a.player_id === fromId).map((a) => ({ ...a, player_id: intoId }))
        push({ id: uid(), type: 'mergePlayers', fromId, intoId, matches, sessions, contas, checkins, acertos })
        // a fila de espera nao se perde: quem fica herda a posicao mais antiga das duas
        const de = data.players.find((p) => p.id === fromId)
        const em = data.players.find((p) => p.id === intoId)
        if (em && de?.espera_mensalista && (!em.espera_mensalista || de.espera_mensalista < em.espera_mensalista)) {
          push({ id: uid(), type: 'savePlayer', player: { ...em, espera_mensalista: de.espera_mensalista } })
        }
      },
      signIn: async (email, password) => {
        if (!supabase) return
        const { error: e } = await supabase.auth.signInWithPassword({ email, password })
        if (e) throw e
      },
      signOut: async () => {
        if (!supabase) return
        await supabase.auth.signOut()
      },
      playerById: (id) => byId.get(id),
      // o apelido e o nome de quadra: manda em ranking, partida, texto e arte.
      // O nome de cadastro so aparece na tela de Meninas.
      nameOf: (id) => {
        const p = byId.get(id)
        if (!p) return '—'
        return p.nickname?.trim() || p.name
      },
      duquesas,
    }
  }, [data, loading, error, repo, userEmail, reload, push, queue.length, syncing, duquesas])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

async function runOp(repo: Repo, op: WriteOp): Promise<void> {
  switch (op.type) {
    case 'savePlayer':
      return repo.savePlayer(op.player)
    case 'deletePlayer':
      return repo.deletePlayer(op.playerId)
    case 'saveSession':
      return repo.saveSession(op.session)
    case 'anotarNoPlay':
      return repo.anotarNoPlay(op.sessionId, op.evento)
    case 'mesclarNoPlay':
      return repo.mesclarNoPlay(op.sessionId, op.mescla, op.id)
    case 'deleteSession':
      return repo.deleteSession(op.sessionId)
    case 'saveMatches':
      return repo.saveMatches(op.matches)
    case 'replaceSessionMatches':
      await repo.deleteMatchesOfSession(op.sessionId)
      return repo.saveMatches(op.matches)
    case 'saveChoice':
      return repo.saveChoice(op.choice)
    case 'saveClosure':
      return repo.saveClosure(op.closure)
    case 'deleteClosure':
      return repo.deleteClosure(op.month)
    case 'saveCheckinLocal':
      return repo.saveCheckinLocal(op.local)
    case 'deleteCheckinLocal':
      return repo.deleteCheckinLocal(op.localId)
    case 'saveCheckinConta':
      return repo.saveCheckinConta(op.conta)
    case 'deleteCheckinConta':
      return repo.deleteCheckinConta(op.contaId)
    case 'saveCheckinDia':
      return repo.saveCheckinDia(op.dia)
    case 'deleteCheckinDia':
      return repo.deleteCheckinDia(op.diaId)
    case 'saveCheckin':
      return repo.saveCheckin(op.checkin)
    case 'deleteCheckin':
      return repo.deleteCheckin(op.checkinId)
    case 'saveCheckinPagamento':
      return repo.saveCheckinPagamento(op.pagamento)
    case 'deleteCheckinPagamento':
      return repo.deleteCheckinPagamento(op.checkinId)
    case 'saveCaixa':
      return repo.saveCaixa(op.lancamento)
    case 'deleteCaixa':
      return repo.deleteCaixa(op.lancamentoId)
    case 'saveMensalidade':
      return repo.saveMensalidade(op.ficha)
    case 'saveAjuste':
      return repo.saveAjuste(op.ajuste)
    case 'saveItemDaMensalidade':
      return repo.saveItemDaMensalidade(op.item)
    case 'deleteItemDaMensalidade':
      return repo.deleteItemDaMensalidade(op.itemId)
    case 'saveAcerto':
      return repo.saveAcerto(op.acerto)
    case 'deleteAcerto':
      return repo.deleteAcerto(op.acertoId)
    case 'savePlano':
      return repo.savePlano(op.plano)
    case 'deletePlano':
      return repo.deletePlano(op.planoId)
    case 'mergePlayers':
      await repo.saveMatches(op.matches)
      for (const s of op.sessions) await repo.saveSession(s)
      // reapontar ANTES de apagar: a cascata do banco levaria as contas junto
      for (const c of op.contas ?? []) await repo.saveCheckinConta(c)
      for (const c of op.checkins ?? []) await repo.saveCheckin(c)
      for (const a of op.acertos ?? []) await repo.saveAcerto(a)
      await repo.juntarMensalidades(op.fromId, op.intoId)
      return repo.deletePlayer(op.fromId)
  }
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore precisa estar dentro de <StoreProvider>')
  return ctx
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Sem resposta do servidor. Verifique sua conexão.')), ms)
    promise.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

function messageOf(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
