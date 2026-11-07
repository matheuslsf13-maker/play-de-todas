import { aplicarMescla } from './campeonato'
import { garantirQuadrasEmJogo, mudarQuadra, preservarQuadras } from './quadras'
import { juntarMensalidades } from './juntarMensalidades'
import type { WriteOp } from '../data/queue'
import type { AppData } from './types'

/** Aplica a operacao no estado local, para a tela responder na hora. */
export function aplicarNaStore(d: AppData, op: WriteOp, hasSupabase: boolean): AppData {
  switch (op.type) {
    case 'savePlayer':
      return { ...d, players: upsert(d.players, op.player) }
    case 'deletePlayer':
      return {
        ...d,
        mensalidadeItens: d.mensalidadeItens.map((i) => d.checkinContas.some((c) => c.id === i.conta_id && c.player_id === op.playerId)
          ? { ...i, conta_id: null } : i),
        players: d.players.filter((p) => p.id !== op.playerId),
        // as contas de passe sao da menina; os lancamentos ficam (relatorio da arena)
        checkinContas: d.checkinContas.filter((c) => c.player_id !== op.playerId),
      }
    case 'saveSession':
      return { ...d, sessions: upsert(d.sessions, preservarQuadras(op.session, d.sessions.find((s) => s.id === op.session.id))) }
    case 'mesclarNoPlay':
      return { ...d, sessions: d.sessions.map((s) => s.id !== op.sessionId ? s :
        op.mescla.campo === 'abrir_quadra' || op.mescla.campo === 'tirar_quadra'
          ? mudarQuadra(s, d.matches.filter((m) => m.session_id === s.id), op.mescla.campo, op.id, hasSupabase && !('quadras_abertas' in s))
          : aplicarMescla(s, op.mescla)) }
    case 'anotarNoPlay':
      return {
        ...d,
        sessions: d.sessions.map((s) => (s.id === op.sessionId ? { ...s, eventos: [...(s.eventos ?? []), op.evento] } : s)),
      }
    case 'deleteSession':
      return {
        ...d,
        sessions: d.sessions.filter((s) => s.id !== op.sessionId),
        matches: d.matches.filter((m) => m.session_id !== op.sessionId),
        // o dia de check-in sobrevive ao play: so perde o vinculo
        checkinDias: d.checkinDias.map((x) => (x.session_id === op.sessionId ? { ...x, session_id: null } : x)),
      }
    case 'saveMatches': {
      let matches = d.matches
      for (const m of op.matches) matches = upsert(matches, m)
      return { ...d, matches, sessions: d.sessions.map((s) => hasSupabase && !('quadras_abertas' in s) ? s : garantirQuadrasEmJogo(s, op.matches)) }
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
    // ---- check-ins: espelha as cascatas e os "set null" que o banco faz sozinho
    case 'saveCheckinLocal':
      return { ...d, checkinLocais: upsert(d.checkinLocais, op.local) }
    case 'deleteCheckinLocal':
      return {
        ...d,
        checkinLocais: d.checkinLocais.filter((l) => l.id !== op.localId),
        mensalidadeItens: d.mensalidadeItens.map((i) => i.local_id === op.localId ? { ...i, local_id: null } : i),
        checkins: d.checkins.map((c) => (c.local_id === op.localId ? { ...c, local_id: null } : c)),
        checkinContas: d.checkinContas.map((c) => (c.local_padrao_id === op.localId ? { ...c, local_padrao_id: null } : c)),
      }
    case 'saveCheckinConta':
      return { ...d, checkinContas: upsert(d.checkinContas, op.conta) }
    case 'deleteCheckinConta':
      return {
        ...d,
        checkinContas: d.checkinContas.filter((c) => c.id !== op.contaId),
        mensalidadeItens: d.mensalidadeItens.map((i) => i.conta_id === op.contaId ? { ...i, conta_id: null } : i),
        checkins: d.checkins.map((c) => (c.conta_id === op.contaId ? { ...c, conta_id: null } : c)),
      }
    case 'saveCheckinDia':
      return { ...d, checkinDias: upsert(d.checkinDias, op.dia) }
    case 'deleteCheckinDia': {
      const idos = new Set(d.checkins.filter((c) => c.dia_id === op.diaId).map((c) => c.id))
      return {
        ...d,
        checkinDias: d.checkinDias.filter((x) => x.id !== op.diaId),
        checkins: d.checkins.filter((c) => c.dia_id !== op.diaId),
        checkinPagamentos: d.checkinPagamentos.filter((p) => !idos.has(p.checkin_id)),
      }
    }
    case 'saveCheckin':
      return { ...d, checkins: upsert(d.checkins, op.checkin) }
    case 'deleteCheckin':
      return {
        ...d,
        checkins: d.checkins.filter((c) => c.id !== op.checkinId),
        checkinPagamentos: d.checkinPagamentos.filter((p) => p.checkin_id !== op.checkinId),
      }
    case 'saveCheckinPagamento': {
      const i = d.checkinPagamentos.findIndex((p) => p.checkin_id === op.pagamento.checkin_id)
      const lista = d.checkinPagamentos.slice()
      if (i < 0) lista.push(op.pagamento)
      else lista[i] = op.pagamento
      return { ...d, checkinPagamentos: lista }
    }
    case 'deleteCheckinPagamento':
      return { ...d, checkinPagamentos: d.checkinPagamentos.filter((p) => p.checkin_id !== op.checkinId) }
    case 'saveCaixa':
      return { ...d, caixa: upsert(d.caixa, op.lancamento) }
    case 'deleteCaixa':
      return { ...d, caixa: d.caixa.filter((l) => l.id !== op.lancamentoId) }
    case 'saveMensalidade':
      return { ...d, mensalidades: upsert(d.mensalidades, op.ficha) }
    case 'saveAjuste':
      return { ...d, ajustes: upsert(d.ajustes, op.ajuste) }
    case 'saveItemDaMensalidade':
      return { ...d, mensalidadeItens: upsert(d.mensalidadeItens, op.item) }
    case 'deleteItemDaMensalidade':
      return { ...d, mensalidadeItens: d.mensalidadeItens.filter((i) => i.id !== op.itemId) }
    case 'saveAcerto':
      return { ...d, checkinAcertos: upsert(d.checkinAcertos, op.acerto) }
    case 'deleteAcerto':
      return { ...d, checkinAcertos: d.checkinAcertos.filter((a) => a.id !== op.acertoId) }
    case 'savePlano':
      return { ...d, checkinPlanos: upsert(d.checkinPlanos, op.plano) }
    case 'deletePlano':
      return {
        ...d,
        checkinPlanos: d.checkinPlanos.filter((p) => p.id !== op.planoId),
        checkinContas: d.checkinContas.map((c) => (c.plano_id === op.planoId ? { ...c, plano_id: null } : c)),
      }
    case 'mergePlayers': {
      let matches = d.matches
      for (const m of op.matches) matches = upsert(matches, m)
      let sessions = d.sessions
      for (const s of op.sessions) sessions = upsert(sessions, s)
      // check-ins e contas secundarias passam para quem fica; a principal de
      // quem sai some (ops antigas na fila nao trazem estes campos)
      let checkins = d.checkins
      for (const c of op.checkins ?? []) checkins = upsert(checkins, c)
      let checkinContas = d.checkinContas.filter((c) => c.player_id !== op.fromId)
      for (const c of op.contas ?? []) checkinContas = upsert(checkinContas, c)
      let checkinAcertos = d.checkinAcertos
      for (const a of op.acertos ?? []) checkinAcertos = upsert(checkinAcertos, a)
      return {
        ...d,
        ...juntarMensalidades(d, op.fromId, op.intoId),
        players: d.players.filter((p) => p.id !== op.fromId),
        matches,
        sessions,
        checkins,
        checkinContas,
        checkinAcertos,
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
