import type {
  Acerto,
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
} from '../lib/types'
import { emptyData } from '../lib/types'
import { LOCAIS_INICIAIS, PLANOS_INICIAIS } from '../lib/checkins'
import { CHAVE } from '../lib/chaves'
import type { Repo } from './repo'
import {
  TETO_POR_VAGA,
  ativosEmOrdem,
  estaAberta,
  posicaoDe,
  validarNome,
  vinculoAutomatico,
  type Lista,
  type ListaCompleta,
  type NomeNaLista,
} from '../lib/listaDePresenca'
import { normalizar } from '../lib/roster'
import { aplicarMescla } from '../lib/campeonato'

const KEY = CHAVE.dados

function read(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyData()
    const parsed = JSON.parse(raw) as Partial<AppData>
    return {
      players: parsed.players ?? [],
      sessions: parsed.sessions ?? [],
      matches: parsed.matches ?? [],
      choices: parsed.choices ?? [],
      closures: parsed.closures ?? [],
      // a semente dos locais so entra quando a chave nunca foi gravada com
      // eles: uma lista esvaziada de proposito continua vazia
      checkinLocais: (parsed.checkinLocais ?? LOCAIS_INICIAIS.map((l) => ({ ...l }))).map((l: CheckinLocal) =>
        // locais gravados antes da afiliacao existir: os de hoje ganham a deles
        l.afiliacao === undefined ? { ...l, afiliacao: LOCAIS_INICIAIS.find((x) => x.id === l.id)?.afiliacao ?? null } : l,
      ),
      checkinContas: parsed.checkinContas ?? [],
      checkinDias: parsed.checkinDias ?? [],
      checkins: parsed.checkins ?? [],
      checkinPagamentos: parsed.checkinPagamentos ?? [],
      caixa: parsed.caixa ?? [],
      checkinAcertos: parsed.checkinAcertos ?? [],
      // os planos de hoje entram quando a chave nunca os teve (mesma regra dos locais)
      checkinPlanos: parsed.checkinPlanos ?? PLANOS_INICIAIS.map((p) => ({ ...p, cotas: { ...p.cotas } })),
    }
  } catch {
    return emptyData()
  }
}

function upsertEm<T extends { id: string }>(lista: T[], item: T): T[] {
  const i = lista.findIndex((x) => x.id === item.id)
  if (i >= 0) lista[i] = item
  else lista.push(item)
  return lista
}

function write(d: AppData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch (e) {
    console.error('nao foi possivel salvar localmente', e)
  }
}

/*
 * LISTA DE PRESENCA no modo local: repete as checagens de `lista_colocar` e
 * `lista_tirar` (supabase/31) com as regras puras, para testar e para o robo
 * de prints. O codigo do aparelho fica em claro: e tudo do mesmo navegador.
 */
type ListasLocais = { listas: Lista[]; nomes: NomeNaLista[]; aparelhos: Record<string, string> }

function lerListas(): ListasLocais {
  try {
    const raw = localStorage.getItem(CHAVE.listas)
    if (raw) return JSON.parse(raw) as ListasLocais
  } catch {
    /* sem localStorage: comeca vazio */
  }
  return { listas: [], nomes: [], aparelhos: {} }
}

const mudouALista = new EventTarget()

function gravarListas(l: ListasLocais) {
  try {
    localStorage.setItem(CHAVE.listas, JSON.stringify(l))
  } catch (e) {
    console.error('nao foi possivel salvar a lista localmente', e)
  }
  mudouALista.dispatchEvent(new Event('mudou'))
}

function completa(l: ListasLocais, lista: Lista | undefined): ListaCompleta | null {
  return lista ? { lista, nomes: l.nomes.filter((n) => n.lista_id === lista.id) } : null
}

/** Os indices unicos do banco: o mesmo nome, ou a mesma atleta, ativos duas vezes. */
function conflito(l: ListasLocais, listaId: string, nome: string, playerId: string | null, exceto?: string): boolean {
  return l.nomes.some(
    (n) =>
      n.lista_id === listaId && !n.saiu_em && n.id !== exceto &&
      (normalizar(n.nome) === normalizar(nome) || (!!playerId && n.player_id === playerId)),
  )
}

export const localRepo: Repo = {
  kind: 'local',
  async load() {
    return read()
  },
  async savePlayer(p: Player) {
    const d = read()
    const i = d.players.findIndex((x) => x.id === p.id)
    if (i >= 0) d.players[i] = p
    else d.players.push(p)
    write(d)
  },
  async deletePlayer(id: string) {
    const d = read()
    d.players = d.players.filter((p) => p.id !== id)
    // as contas de passe sao da menina; os lancamentos ficam (o relatorio da arena)
    d.checkinContas = d.checkinContas.filter((c) => c.player_id !== id)
    write(d)
  },
  async saveSession(s: PlaySession) {
    const d = read()
    const i = d.sessions.findIndex((x) => x.id === s.id)
    if (i >= 0) d.sessions[i] = s
    else d.sessions.push(s)
    write(d)
  },
  async mesclarNoPlay(sessionId: string, mescla: MesclaDoPlay) {
    const d = read()
    d.sessions = d.sessions.map((s) => (s.id === sessionId ? aplicarMescla(s, mescla) : s))
    write(d)
  },
  async anotarNoPlay(sessionId: string, evento: EventoDoPlay) {
    const d = read()
    d.sessions = d.sessions.map((s) => (s.id === sessionId ? { ...s, eventos: [...(s.eventos ?? []), evento] } : s))
    write(d)
  },
  async deleteSession(id: string) {
    const d = read()
    d.sessions = d.sessions.filter((s) => s.id !== id)
    d.matches = d.matches.filter((m) => m.session_id !== id)
    // o dia de check-in sobrevive ao play: so perde o vinculo
    d.checkinDias = d.checkinDias.map((x) => (x.session_id === id ? { ...x, session_id: null } : x))
    write(d)
  },
  async saveMatches(ms: Match[]) {
    const d = read()
    for (const m of ms) {
      const i = d.matches.findIndex((x) => x.id === m.id)
      if (i >= 0) d.matches[i] = m
      else d.matches.push(m)
    }
    write(d)
  },
  async saveChoice(choice: StreakChoice) {
    const d = read()
    const i = d.choices.findIndex((x) => x.id === choice.id)
    if (i >= 0) d.choices[i] = choice
    else d.choices.push(choice)
    write(d)
  },
  async saveClosure(closure: MonthClosure) {
    const d = read()
    const i = d.closures.findIndex((x) => x.id === closure.id)
    if (i >= 0) d.closures[i] = closure
    else d.closures.push(closure)
    write(d)
  },
  async deleteClosure(month: string) {
    const d = read()
    d.closures = d.closures.filter((c) => c.month !== month)
    write(d)
  },
  // ---- check-ins: espelha as cascatas e os "set null" que o banco faz sozinho
  async saveCheckinLocal(local: CheckinLocal) {
    const d = read()
    upsertEm(d.checkinLocais, local)
    write(d)
  },
  async deleteCheckinLocal(id: string) {
    const d = read()
    d.checkinLocais = d.checkinLocais.filter((l) => l.id !== id)
    d.checkins = d.checkins.map((c) => (c.local_id === id ? { ...c, local_id: null } : c))
    d.checkinContas = d.checkinContas.map((c) => (c.local_padrao_id === id ? { ...c, local_padrao_id: null } : c))
    write(d)
  },
  async saveCheckinConta(conta: CheckinConta) {
    const d = read()
    upsertEm(d.checkinContas, conta)
    write(d)
  },
  async deleteCheckinConta(id: string) {
    const d = read()
    d.checkinContas = d.checkinContas.filter((c) => c.id !== id)
    d.checkins = d.checkins.map((c) => (c.conta_id === id ? { ...c, conta_id: null } : c))
    write(d)
  },
  async saveCheckinDia(dia: CheckinDia) {
    const d = read()
    upsertEm(d.checkinDias, dia)
    write(d)
  },
  async deleteCheckinDia(id: string) {
    const d = read()
    d.checkinDias = d.checkinDias.filter((x) => x.id !== id)
    const idos = new Set(d.checkins.filter((c) => c.dia_id === id).map((c) => c.id))
    d.checkins = d.checkins.filter((c) => c.dia_id !== id)
    d.checkinPagamentos = d.checkinPagamentos.filter((p) => !idos.has(p.checkin_id))
    write(d)
  },
  async saveCheckin(checkin: Checkin) {
    const d = read()
    upsertEm(d.checkins, checkin)
    write(d)
  },
  async deleteCheckin(id: string) {
    const d = read()
    d.checkins = d.checkins.filter((c) => c.id !== id)
    d.checkinPagamentos = d.checkinPagamentos.filter((p) => p.checkin_id !== id)
    write(d)
  },
  async saveCheckinPagamento(pagamento: CheckinPagamento) {
    const d = read()
    const i = d.checkinPagamentos.findIndex((p) => p.checkin_id === pagamento.checkin_id)
    if (i >= 0) d.checkinPagamentos[i] = pagamento
    else d.checkinPagamentos.push(pagamento)
    write(d)
  },
  async deleteCheckinPagamento(checkinId: string) {
    const d = read()
    d.checkinPagamentos = d.checkinPagamentos.filter((p) => p.checkin_id !== checkinId)
    write(d)
  },
  async saveCaixa(lancamento: LancamentoDeCaixa) {
    const d = read()
    upsertEm(d.caixa, lancamento)
    write(d)
  },
  async deleteCaixa(id: string) {
    const d = read()
    d.caixa = d.caixa.filter((l) => l.id !== id)
    write(d)
  },
  async saveAcerto(acerto: Acerto) {
    const d = read()
    upsertEm(d.checkinAcertos, acerto)
    write(d)
  },
  async deleteAcerto(id: string) {
    const d = read()
    d.checkinAcertos = d.checkinAcertos.filter((a) => a.id !== id)
    write(d)
  },
  async savePlano(plano: Plano) {
    const d = read()
    upsertEm(d.checkinPlanos, plano)
    write(d)
  },
  async deletePlano(id: string) {
    const d = read()
    d.checkinPlanos = d.checkinPlanos.filter((p) => p.id !== id)
    d.checkinContas = d.checkinContas.map((c) => (c.plano_id === id ? { ...c, plano_id: null } : c))
    write(d)
  },
  async deleteMatchesOfSession(sessionId: string) {
    const d = read()
    d.matches = d.matches.filter((m) => m.session_id !== sessionId)
    write(d)
  },
  async carregarLista(ref) {
    const l = lerListas()
    return completa(l, l.listas.find((x) => ('codigo' in ref ? x.codigo === ref.codigo.toLowerCase() : x.id === ref.id)))
  },
  async listaAberta() {
    const l = lerListas()
    const agora = new Date()
    const aberta = l.listas.filter((x) => estaAberta(x, agora)).sort((a, b) => a.play_em.localeCompare(b.play_em))[0]
    return completa(l, aberta)
  },
  async listasRecentes(limite) {
    return lerListas().listas.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limite)
  },
  async colocarNaLista(codigo, texto, aparelho) {
    if (aparelho.length < 16 || aparelho.length > 100) return { ok: false, motivo: 'aparelho' }
    const v = validarNome(texto)
    if ('erro' in v) return { ok: false, motivo: 'nome' }
    const l = lerListas()
    const lista = l.listas.find((x) => x.codigo === codigo.trim().toLowerCase())
    if (!lista) return { ok: false, motivo: 'nao_existe' }
    if (!estaAberta(lista, new Date())) return { ok: false, motivo: 'fechada' }
    const ativos = ativosEmOrdem(l.nomes.filter((n) => n.lista_id === lista.id))
    if (ativos.some((n) => l.aparelhos[n.id] === aparelho)) return { ok: false, motivo: 'aparelho_ja_tem_nome' }
    const player = vinculoAutomatico(v.nome, read().players)
    if (player && ativos.some((n) => n.player_id === player)) return { ok: false, motivo: 'ja_na_lista' }
    if (ativos.some((n) => normalizar(n.nome) === normalizar(v.nome))) return { ok: false, motivo: 'repetido' }
    if (ativos.length >= lista.vagas * TETO_POR_VAGA) return { ok: false, motivo: 'cheia' }
    const novo: NomeNaLista = {
      id: crypto.randomUUID(), lista_id: lista.id, nome: v.nome, player_id: player,
      chegada: Math.max(0, ...l.nomes.map((n) => n.chegada)) + 1, ordem: null, origem: 'link', garantida: false,
      entrou_em: new Date().toISOString(), saiu_em: null, saiu_por: null, avisou_24h: null,
    }
    l.nomes.push(novo)
    l.aparelhos[novo.id] = aparelho
    gravarListas(l)
    return { ok: true, id: novo.id, posicao: posicaoDe(l.nomes.filter((n) => n.lista_id === lista.id), novo.id), vagas: lista.vagas }
  },
  async tirarDaLista(nomeId, aparelho) {
    const l = lerListas()
    const n = l.nomes.find((x) => x.id === nomeId && !x.saiu_em)
    const lista = n && l.listas.find((x) => x.id === n.lista_id)
    if (!n || !lista) return { ok: false, motivo: 'nao_esta' }
    if (!estaAberta(lista, new Date())) return { ok: false, motivo: 'fechada' }
    if (l.aparelhos[nomeId] !== aparelho) return { ok: false, motivo: 'nao_e_seu' }
    n.saiu_em = new Date().toISOString()
    n.saiu_por = 'atleta'
    gravarListas(l)
    return { ok: true }
  },
  async salvarLista(lista) {
    const l = lerListas()
    upsertEm(l.listas, lista)
    gravarListas(l)
  },
  async incluirNaLista(novos) {
    const l = lerListas()
    for (const x of novos) {
      if (conflito(l, x.lista_id, x.nome, x.player_id)) throw new Error('Esse nome (ou essa atleta) já está na lista')
      l.nomes.push({
        ...x, id: crypto.randomUUID(), chegada: Math.max(0, ...l.nomes.map((n) => n.chegada)) + 1,
        entrou_em: new Date().toISOString(), saiu_em: null, saiu_por: null, avisou_24h: null,
      })
    }
    gravarListas(l)
  },
  async mexerNoNome(id, campos) {
    const l = lerListas()
    const n = l.nomes.find((x) => x.id === id)
    if (!n) return
    const novo = { ...n, ...campos }
    if (!novo.saiu_em && conflito(l, n.lista_id, novo.nome, novo.player_id, id)) {
      throw new Error('Essa atleta já está na lista')
    }
    Object.assign(n, campos)
    gravarListas(l)
  },
  async trocarNaLista(a, b) {
    const l = lerListas()
    const na = l.nomes.find((x) => x.id === a && !x.saiu_em)
    const nb = l.nomes.find((x) => x.id === b && !x.saiu_em)
    if (!na || !nb || na.lista_id !== nb.lista_id) throw new Error('Os dois nomes têm de estar ativos na mesma lista')
    const ka = na.ordem ?? na.chegada
    na.ordem = nb.ordem ?? nb.chegada
    nb.ordem = ka
    gravarListas(l)
  },
  ouvirLista(_listaId, cb) {
    // a mesma aba (o evento do modulo) e outra aba (o evento storage)
    const naAba = () => cb()
    const outraAba = (e: StorageEvent) => {
      if (e.key === CHAVE.listas) cb()
    }
    mudouALista.addEventListener('mudou', naAba)
    window.addEventListener('storage', outraAba)
    return () => {
      mudouALista.removeEventListener('mudou', naAba)
      window.removeEventListener('storage', outraAba)
    }
  },
  async deletePhoto(_url: string) {
    // no modo local a foto vive dentro do proprio registro da jogadora
  },
  async uploadPhoto(_playerId: string, file: File) {
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result))
      fr.onerror = () => reject(fr.error)
      fr.readAsDataURL(file)
    })
  },
}
