import { supabase } from '../lib/supabase'
import type {
  Acerto,
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
import type { Repo } from './repo'

/**
 * Algo nao coube no banco porque uma migracao ainda nao rodou.
 *
 * Nao e reativo de proposito: quem le e a aba de atletas, que re-renderiza
 * a cada escrita -- entao o aviso aparece exatamente quando a tentativa
 * acontece, que e a hora em que ele importa.
 */
export const avisosDoBanco = {
  pagamento: false,
  colunas: new Set<string>(),
  /** Tabelas que o banco ainda nao tem (migracao por rodar): a aba que depende delas desliga a edicao. */
  tabelas: new Set<string>(),
}

/** Le uma coluna `numeric` do PostgREST, que pode vir como string. */
function numero(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

function client() {
  if (!supabase) throw new Error('Supabase nao configurado')
  return supabase
}

/**
 * O nome da coluna que o banco nao reconheceu, quando foi esse o problema.
 *
 * O PostgREST fala de dois jeitos, conforme o erro venha do cache de schema
 * ou do proprio Postgres:
 *
 *   Could not find the 'desempate' column of 'sessions' in the schema cache
 *   column sessions.desempate does not exist
 */
function colunaQueFaltou(msg?: string): string | null {
  if (!msg) return null
  const cache = msg.match(/Could not find the '([^']+)' column/)
  if (cache) return cache[1]
  const pg = msg.match(/column (?:[\w.]+\.)?"?([\w]+)"? does not exist/)
  if (pg) return pg[1]
  // violacao de restricao: a coluna existe mas nao aceita o valor
  const check = msg.match(/violates check constraint "\w*?_(\w+)_check"/)
  if (check) return check[1]
  return null
}

/**
 * Grava tirando so o que o banco nao aceita, uma coluna por vez.
 *
 * Tirar o bloco inteiro de uma vez -- como era antes -- faz o app perder
 * dados que o banco aceitaria de boa vontade, e em silencio. Aqui cada
 * tentativa devolve o nome de UMA coluna, ela sai, e o resto entra.
 */
async function upsertTolerante<T extends object>(tabela: string, dados: T | T[]): Promise<void> {
  const lista: Record<string, unknown>[] = (Array.isArray(dados) ? dados : [dados]).map((d) => ({
    ...(d as object),
  }))
  if (lista.length === 0) return

  for (let tentativa = 0; tentativa < 12; tentativa++) {
    const { error } = await client().from(tabela).upsert(lista)
    if (!error) return
    const coluna = colunaQueFaltou(error.message)
    if (!coluna || !(coluna in lista[0])) throw error
    for (const item of lista) delete item[coluna]
    avisosDoBanco.colunas.add(`${tabela}.${coluna}`)
    if (/categoria|pago_mes|pago_avulso/.test(coluna)) avisosDoBanco.pagamento = true
  }
  throw new Error(`Nao consegui gravar em ${tabela} depois de varias tentativas`)
}

export const supabaseRepo: Repo = {
  kind: 'supabase',
  async load(): Promise<AppData> {
    const sb = client()
    const [players, sessions, matches, choices, closures, locais, contas, dias, checkins, pagamentos, caixa, acertos] =
      await Promise.all([
        sb.from('players').select('*').order('name'),
        sb.from('sessions').select('*').order('date', { ascending: false }),
        sb.from('matches').select('*'),
        sb.from('streak_choices').select('*'),
        sb.from('month_closures').select('*'),
        sb.from('checkin_locais').select('*').order('ordem'),
        sb.from('checkin_contas').select('*'),
        sb.from('checkin_dias').select('*').order('date', { ascending: false }),
        sb.from('checkins').select('*'),
        // estas duas so quem esta logada le: para anon voltam vazias, sem erro
        sb.from('checkin_pagamentos').select('*'),
        sb.from('caixa').select('*'),
        sb.from('checkin_acertos').select('*'),
      ])
    const err = players.error || sessions.error || matches.error
    if (err) throw err
    // estas tabelas sao mais novas: se ainda nao foram criadas, o app segue
    // funcionando sem elas em vez de nao abrir
    if (choices.error) console.warn('streak_choices indisponível:', choices.error.message)
    if (closures.error) console.warn('month_closures indisponível:', closures.error.message)
    // as dos check-ins: alem do aviso, a aba desliga a edicao ate o script rodar
    // (uma escrita contra tabela inexistente travaria a fila para sempre)
    const doCheckin: [string, { error: { message: string } | null }][] = [
      ['checkin_locais', locais], ['checkin_contas', contas], ['checkin_dias', dias],
      ['checkins', checkins], ['checkin_pagamentos', pagamentos], ['caixa', caixa], ['checkin_acertos', acertos],
    ]
    for (const [nome, r] of doCheckin) {
      if (r.error) {
        console.warn(`${nome} indisponível:`, r.error.message)
        avisosDoBanco.tabelas.add(nome)
      } else {
        avisosDoBanco.tabelas.delete(nome)
      }
    }
    return {
      players: (players.data ?? []) as Player[],
      sessions: (sessions.data ?? []) as PlaySession[],
      matches: (matches.data ?? []) as Match[],
      choices: (choices.data ?? []) as StreakChoice[],
      closures: (closures.data ?? []) as MonthClosure[],
      checkinLocais: (locais.data ?? []) as CheckinLocal[],
      checkinContas: (contas.data ?? []) as CheckinConta[],
      checkinDias: ((dias.data ?? []) as CheckinDia[]).map((d) => ({
        ...d,
        valor_cheio: numero(d.valor_cheio),
        valor_com_checkin: numero(d.valor_com_checkin),
      })),
      checkins: (checkins.data ?? []) as Checkin[],
      checkinPagamentos: ((pagamentos.data ?? []) as CheckinPagamento[]).map((p) => ({
        ...p,
        valor_pago: numero(p.valor_pago),
        valor_devido: p.valor_devido === null || p.valor_devido === undefined ? null : numero(p.valor_devido),
      })),
      caixa: ((caixa.data ?? []) as LancamentoDeCaixa[]).map((c) => ({ ...c, valor: numero(c.valor) })),
      checkinAcertos: ((acertos.data ?? []) as Acerto[]).map((a) => ({ ...a, valor: numero(a.valor) })),
    }
  },
  async savePlayer(p: Player) {
    await upsertTolerante('players', p)
  },
  async deletePlayer(id: string) {
    const { error } = await client().from('players').delete().eq('id', id)
    if (error) throw error
  },
  async saveSession(s: PlaySession) {
    await upsertTolerante('sessions', s)
  },
  async deleteSession(id: string) {
    const sb = client()
    const m = await sb.from('matches').delete().eq('session_id', id)
    if (m.error) throw m.error
    const { error } = await sb.from('sessions').delete().eq('id', id)
    if (error) throw error
  },
  async saveMatches(ms: Match[]) {
    await upsertTolerante('matches', ms)
  },
  async deleteMatchesOfSession(sessionId: string) {
    const { error } = await client().from('matches').delete().eq('session_id', sessionId)
    if (error) throw error
  },
  async uploadPhoto(playerId: string, file: File) {
    const sb = client()
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${playerId}/${Date.now()}.${ext}`
    const up = await sb.storage.from('photos').upload(path, file, { upsert: true, cacheControl: '3600' })
    if (up.error) throw up.error
    const { data } = sb.storage.from('photos').getPublicUrl(path)
    return data.publicUrl
  },
  async saveChoice(choice: StreakChoice) {
    const { error } = await client().from('streak_choices').upsert(choice)
    if (error) throw error
  },
  async saveClosure(closure: MonthClosure) {
    const { error } = await client().from('month_closures').upsert(closure)
    if (error) throw error
  },
  async deleteClosure(month: string) {
    const { error } = await client().from('month_closures').delete().eq('month', month)
    if (error) throw error
  },
  // ---- check-ins (as cascatas e os "set null" sao do banco; ver 15-checkins.sql)
  async saveCheckinLocal(local: CheckinLocal) {
    await upsertTolerante('checkin_locais', local)
  },
  async deleteCheckinLocal(id: string) {
    const { error } = await client().from('checkin_locais').delete().eq('id', id)
    if (error) throw error
  },
  async saveCheckinConta(conta: CheckinConta) {
    await upsertTolerante('checkin_contas', conta)
  },
  async deleteCheckinConta(id: string) {
    const { error } = await client().from('checkin_contas').delete().eq('id', id)
    if (error) throw error
  },
  async saveCheckinDia(dia: CheckinDia) {
    await upsertTolerante('checkin_dias', dia)
  },
  async deleteCheckinDia(id: string) {
    const { error } = await client().from('checkin_dias').delete().eq('id', id)
    if (error) throw error
  },
  async saveCheckin(checkin: Checkin) {
    await upsertTolerante('checkins', checkin)
  },
  async deleteCheckin(id: string) {
    const { error } = await client().from('checkins').delete().eq('id', id)
    if (error) throw error
  },
  async saveCheckinPagamento(pagamento: CheckinPagamento) {
    await upsertTolerante('checkin_pagamentos', pagamento)
  },
  async deleteCheckinPagamento(checkinId: string) {
    const { error } = await client().from('checkin_pagamentos').delete().eq('checkin_id', checkinId)
    if (error) throw error
  },
  async saveCaixa(lancamento: LancamentoDeCaixa) {
    await upsertTolerante('caixa', lancamento)
  },
  async deleteCaixa(id: string) {
    const { error } = await client().from('caixa').delete().eq('id', id)
    if (error) throw error
  },
  async saveAcerto(acerto: Acerto) {
    await upsertTolerante('checkin_acertos', acerto)
  },
  async deleteAcerto(id: string) {
    const { error } = await client().from('checkin_acertos').delete().eq('id', id)
    if (error) throw error
  },
  async deletePhoto(url: string) {
    const marca = '/storage/v1/object/public/photos/'
    const i = url.indexOf(marca)
    if (i < 0) return // foto de outra origem: nada a apagar aqui
    const path = decodeURIComponent(url.slice(i + marca.length).split('?')[0])
    const { error } = await client().storage.from('photos').remove([path])
    if (error) console.warn('não consegui apagar a foto antiga:', error.message)
  },
  subscribe(cb: () => void) {
    const sb = client()
    const ch = sb
      .channel('play-de-todas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'streak_choices' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'month_closures' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkin_locais' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkin_contas' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkin_dias' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkin_pagamentos' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caixa' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkin_acertos' }, cb)
      .subscribe()
    return () => {
      void sb.removeChannel(ch)
    }
  },
}
