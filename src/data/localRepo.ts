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
  PlaySession,
  Player,
  StreakChoice,
} from '../lib/types'
import { emptyData } from '../lib/types'
import { LOCAIS_INICIAIS, PLANOS_INICIAIS } from '../lib/checkins'
import { CHAVE } from '../lib/chaves'
import type { Repo } from './repo'

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
      checkinLocais: parsed.checkinLocais ?? LOCAIS_INICIAIS.map((l) => ({ ...l })),
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
