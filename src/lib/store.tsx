import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { localRepo } from '../data/localRepo'
import { loadCache, loadQueue, saveCache, saveQueue, type WriteOp } from '../data/queue'
import type { Repo } from '../data/repo'
import { supabaseRepo } from '../data/supabaseRepo'
import { hasSupabase, supabase } from './supabase'
import type { AppData, Match, MonthClosure, PlaySession, Player, StreakChoice } from './types'
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
  deleteSession: (id: string) => void
  saveMatches: (ms: Match[]) => void
  replaceSessionMatches: (sessionId: string, ms: Match[]) => void
  saveChoice: (choice: StreakChoice) => void
  /** Fecha o mes na mao (o botao "finalizar o mes"). */
  saveClosure: (closure: MonthClosure) => void
  deleteClosure: (month: string) => void
  /** Junta duas jogadoras numa so, preservando partidas, pontos e sequencia. */
  mergePlayers: (fromId: string, intoId: string) => void
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  playerById: (id: string) => Player | undefined
  nameOf: (id: string) => string
}

const StoreContext = createContext<Ctx | null>(null)

/** Aplica a operacao no estado local, para a tela responder na hora. */
function applyLocally(d: AppData, op: WriteOp): AppData {
  switch (op.type) {
    case 'savePlayer':
      return { ...d, players: upsert(d.players, op.player) }
    case 'deletePlayer':
      return { ...d, players: d.players.filter((p) => p.id !== op.playerId) }
    case 'saveSession':
      return { ...d, sessions: upsert(d.sessions, op.session) }
    case 'deleteSession':
      return {
        ...d,
        sessions: d.sessions.filter((s) => s.id !== op.sessionId),
        matches: d.matches.filter((m) => m.session_id !== op.sessionId),
      }
    case 'saveMatches': {
      let matches = d.matches
      for (const m of op.matches) matches = upsert(matches, m)
      return { ...d, matches }
    }
    case 'replaceSessionMatches':
      return {
        ...d,
        matches: [...d.matches.filter((m) => m.session_id !== op.sessionId), ...op.matches],
      }
    case 'saveChoice':
      return { ...d, choices: upsert(d.choices, op.choice) }
    case 'saveClosure':
      return { ...d, closures: upsert(d.closures, op.closure) }
    case 'deleteClosure':
      return { ...d, closures: d.closures.filter((c) => c.month !== op.month) }
    case 'mergePlayers': {
      let matches = d.matches
      for (const m of op.matches) matches = upsert(matches, m)
      let sessions = d.sessions
      for (const s of op.sessions) sessions = upsert(sessions, s)
      return {
        ...d,
        players: d.players.filter((p) => p.id !== op.fromId),
        matches,
        sessions,
      }
    }
  }
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id)
  if (i < 0) return [...list, item]
  const copy = list.slice()
  copy[i] = item
  return copy
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const repo = hasSupabase ? supabaseRepo : localRepo
  // no modo online o app abre com o ultimo estado conhecido, mesmo sem sinal
  const cached = hasSupabase ? loadCache<AppData>() : null
  const [data, setData] = useState<AppData>(() => cached ?? emptyData())
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
      }
    } finally {
      draining.current = false
      setSyncing(false)
    }
  }, [repo])

  const push = useCallback(
    (op: WriteOp) => {
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
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUserEmail(s?.user.email ?? null)
      void drain()
    })
    return () => sub.subscription.unsubscribe()
  }, [drain])

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
      savePlayer: (player) => push({ id: uid(), type: 'savePlayer', player }),
      deletePlayer: (playerId) => push({ id: uid(), type: 'deletePlayer', playerId }),
      saveSession: (session) => push({ id: uid(), type: 'saveSession', session }),
      deleteSession: (sessionId) => push({ id: uid(), type: 'deleteSession', sessionId }),
      saveMatches: (matches) => push({ id: uid(), type: 'saveMatches', matches }),
      replaceSessionMatches: (sessionId, matches) =>
        push({ id: uid(), type: 'replaceSessionMatches', sessionId, matches }),
      saveChoice: (choice) => push({ id: uid(), type: 'saveChoice', choice }),
      saveClosure: (closure) => push({ id: uid(), type: 'saveClosure', closure }),
      deleteClosure: (month) => push({ id: uid(), type: 'deleteClosure', month }),
      mergePlayers: (fromId, intoId) => {
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
        push({ id: uid(), type: 'mergePlayers', fromId, intoId, matches, sessions })
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
    }
  }, [data, loading, error, repo, userEmail, reload, push, queue.length, syncing])

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
    case 'mergePlayers':
      await repo.saveMatches(op.matches)
      for (const s of op.sessions) await repo.saveSession(s)
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
