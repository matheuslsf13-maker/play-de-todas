/**
 * CHECK-INS: a regra pura, sem React e sem banco.
 *
 * Tudo aqui e derivado dos dados brutos a cada leitura -- saldo, quantos
 * check-ins sobram, status, relatorios. Nada e acumulado em coluna: corrigir
 * um lancamento antigo corrige o presente sozinho, como no resto do app.
 */
import type {
  Acerto,
  AppData,
  AulaDaConta,
  Plano,
  CategoriaDeCaixa,
  Checkin,
  CheckinConta,
  CheckinDia,
  CheckinLocal,
  CheckinPagamento,
  PlaySession,
  TipoDeConta,
} from './types'
import { dateLabel, monthLabel, monthOf, todayISO } from './types'

/** Check-ins que uma conta de passe da por mes. */
export const COTA_MENSAL = 12

/**
 * Os locais de hoje, com ids fixos: sao os mesmos que o script 15 semeia no
 * banco, entao o modo local e o online falam da mesma "Arena V3".
 */
export const LOCAIS_INICIAIS: CheckinLocal[] = [
  { id: 'local-arena-v3', nome: 'Arena V3', ativo: true, ordem: 1 },
  { id: 'local-itaparica-beach', nome: 'Itaparica Beach', ativo: true, ordem: 2 },
  { id: 'local-gw-lider', nome: 'GW Líder', ativo: true, ordem: 3 },
]

/**
 * Os planos de hoje, com ids fixos (os mesmos que o script 18 semeia). A cota
 * e POR LOCAL: o Gold nao aceita a Itaparica; Gold+ e TotalPass aceitam as tres.
 */
export const PLANOS_INICIAIS: Plano[] = [
  { id: 'plano-wellhub-gold', nome: 'Wellhub Gold', app: 'wellhub', ativo: true, ordem: 1,
    cotas: { 'local-arena-v3': 12, 'local-gw-lider': 12 } },
  { id: 'plano-wellhub-gold-plus', nome: 'Wellhub Gold+', app: 'wellhub', ativo: true, ordem: 2,
    cotas: { 'local-arena-v3': 12, 'local-itaparica-beach': 12, 'local-gw-lider': 12 } },
  { id: 'plano-totalpass', nome: 'TotalPass', app: 'totalpass', ativo: true, ordem: 3,
    cotas: { 'local-arena-v3': 12, 'local-itaparica-beach': 12, 'local-gw-lider': 12 } },
]

/**
 * Quanto as aulas consomem da cota DO LOCAL no mes. E a conta da arena, nao do
 * app: 1 aula por semana cobra 8, 2 cobram 12, 3 cobram 16 -- 4 x (n + 1).
 * Passou da cota do local, a tela avisa: precisa de outra conta ou outro plano.
 */
export function consumoDasAulas(porSemana: number | null | undefined): number {
  if (!porSemana || porSemana <= 0) return 0
  return 4 * (porSemana + 1)
}

/** As aulas da conta; a conta antiga (`aulas_semana` na arena padrao) vira uma aula nesse local. */
export function aulasDaConta(conta: CheckinConta): AulaDaConta[] {
  if (conta.aulas && conta.aulas.length > 0) return conta.aulas.filter((a) => a.por_semana > 0)
  if (conta.aulas_semana && conta.local_padrao_id) return [{ local_id: conta.local_padrao_id, por_semana: conta.aulas_semana }]
  return []
}

/** Sem plano escolhido, a conta vale como antes: 12 em qualquer arena ativa. */
export function planoVirtual(data: AppData, app: TipoDeConta): Plano {
  return {
    id: '',
    nome: 'Sem plano',
    app,
    cotas: Object.fromEntries(data.checkinLocais.filter((l) => l.ativo).map((l) => [l.id, COTA_MENSAL])),
    ativo: true,
    ordem: 0,
  }
}

export function planoDaConta(data: AppData, conta: CheckinConta): Plano {
  return (conta.plano_id && data.checkinPlanos.find((p) => p.id === conta.plano_id)) || planoVirtual(data, conta.tipo)
}

/** O app que a arena ve: o do plano; nas contas antigas, o que estava na conta. */
export function appDaConta(data: AppData, conta: CheckinConta): TipoDeConta {
  const plano = conta.plano_id ? data.checkinPlanos.find((p) => p.id === conta.plano_id) : undefined
  return plano?.app ?? conta.tipo
}

/** Quantos check-ins o plano da num local (0 = nao aceita). */
export function cotaDoPlano(plano: Plano, localId: string): number {
  const n = plano.cotas[localId]
  return Number.isFinite(n) && n > 0 ? n : 0
}

export const TIPOS_DE_CONTA: { valor: TipoDeConta; rotulo: string }[] = [
  { valor: 'wellhub', rotulo: 'Wellhub' },
  { valor: 'totalpass', rotulo: 'TotalPass' },
  { valor: 'outro', rotulo: 'Outro' },
]

export function rotuloDoTipo(tipo: TipoDeConta | undefined): string {
  return TIPOS_DE_CONTA.find((t) => t.valor === tipo)?.rotulo ?? 'Outro'
}

/** As categorias do caixa, como na planilha da organizadora. */
export const CATEGORIAS_DE_CAIXA: { valor: CategoriaDeCaixa; rotulo: string; tipo: 'entrada' | 'saida' }[] = [
  { valor: 'extra', rotulo: 'Receita extra', tipo: 'entrada' },
  { valor: 'aluguel', rotulo: 'Aluguel', tipo: 'saida' },
  { valor: 'brinde', rotulo: 'Brindes', tipo: 'saida' },
  { valor: 'confraternizacao', rotulo: 'Confraternização', tipo: 'saida' },
  { valor: 'outra', rotulo: 'Outras despesas', tipo: 'saida' },
]

/* ------------------------------------------------------------------ contas */

export function idDaContaPrincipal(playerId: string): string {
  return `principal:${playerId}`
}

/** A principal de quem nunca teve a dela editada: existe na tela, nao no banco. */
export function contaPrincipalVirtual(playerId: string): CheckinConta {
  return {
    id: idDaContaPrincipal(playerId),
    player_id: playerId,
    nome: '',
    principal: true,
    tipo: 'wellhub',
    aulas_semana: null,
    plano_id: null,
    aulas: [],
    local_padrao_id: null,
    ativo: true,
    created_at: '',
  }
}

/** A principal primeiro (gravada ou virtual), depois as secundarias por nome. */
export function contasDaAtleta(
  data: AppData,
  playerId: string,
  opts: { incluirInativas?: boolean } = {},
): CheckinConta[] {
  const minhas = data.checkinContas.filter((c) => c.player_id === playerId)
  const principal = minhas.find((c) => c.principal) ?? contaPrincipalVirtual(playerId)
  const secundarias = minhas
    .filter((c) => !c.principal && (opts.incluirInativas || c.ativo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  return [principal, ...secundarias]
}

/** A conta de um lancamento: `conta_id` nulo e a principal da propria menina. */
export function contaDoCheckin(data: AppData, c: Checkin): CheckinConta {
  if (c.conta_id) {
    const achada = data.checkinContas.find((x) => x.id === c.conta_id)
    if (achada) return achada
  }
  return data.checkinContas.find((x) => x.player_id === c.player_id && x.principal) ?? contaPrincipalVirtual(c.player_id)
}

/** O nome que a arena ve: o titular da conta. Na principal, a propria menina. */
export function nomeDoTitular(conta: CheckinConta, nomeDaAtleta: string): string {
  return conta.principal || !conta.nome.trim() ? nomeDaAtleta : conta.nome.trim()
}

/* -------------------------------------------------------------------- dias */

export function rotuloDoDia(dia: CheckinDia, sessions: PlaySession[]): string {
  if (dia.titulo?.trim()) return dia.titulo.trim()
  const play = dia.session_id ? sessions.find((s) => s.id === dia.session_id) : null
  if (play) return play.title
  return `Check-in de ${dateLabel(dia.date)}`
}

/** Meses com dia de check-in ou play, mais o atual, do mais novo ao mais velho. */
export function mesesComCheckins(data: AppData): string[] {
  const set = new Set<string>()
  for (const d of data.checkinDias) set.add(monthOf(d.date))
  for (const s of data.sessions) set.add(monthOf(s.date))
  for (const l of data.caixa) set.add(monthOf(l.date))
  for (const a of data.checkinAcertos) set.add(monthOf(a.date))
  set.add(monthOf(todayISO()))
  return [...set].sort().reverse()
}

export function diasDoMes(data: AppData, mes: string): CheckinDia[] {
  return data.checkinDias.filter((d) => monthOf(d.date) === mes).sort((a, b) => b.date.localeCompare(a.date))
}

/** Datas sao strings YYYY-MM-DD: comparar como texto e comparar como data. */
export function diasNoIntervalo(data: AppData, de: string, ate: string): CheckinDia[] {
  return data.checkinDias.filter((d) => d.date >= de && d.date <= ate).sort((a, b) => b.date.localeCompare(a.date))
}

export function checkinsDoDia(data: AppData, diaId: string): Checkin[] {
  return data.checkins.filter((c) => c.dia_id === diaId)
}

export function checkinDaAtletaNoDia(data: AppData, diaId: string, playerId: string): Checkin | undefined {
  return data.checkins.find((c) => c.dia_id === diaId && c.player_id === playerId)
}

export function pagamentoDoCheckin(data: AppData, checkinId: string): CheckinPagamento | undefined {
  return data.checkinPagamentos.find((p) => p.checkin_id === checkinId)
}

/* ---------------------------------------------------------------- dinheiro */

/** Centavos: somar floats sem arredondar acumula 0,0000001 e vira "deve R$ 0,00". */
export function centavos(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * O que o lancamento deve: quem nao foi nao deve nada (o que pagou vira
 * credito); quem tem preco combinado usa o dele; senao, o do dia pelo modo.
 */
export function valorDevido(c: Checkin, dia: CheckinDia, pag?: CheckinPagamento): number {
  if (!c.compareceu) return 0
  if (pag && pag.valor_devido !== null && pag.valor_devido !== undefined) return centavos(pag.valor_devido)
  return centavos(c.modo === 'checkin' ? dia.valor_com_checkin : dia.valor_cheio)
}

/** Pago menos devido: positivo e credito para o proximo play, negativo e divida. */
export function saldoDoCheckin(c: Checkin, dia: CheckinDia, pag?: CheckinPagamento): number {
  return centavos((pag?.valor_pago ?? 0) - valorDevido(c, dia, pag))
}

export type Saldo = { pago: number; devido: number; acertos: number; saldo: number; lancamentos: number }

/**
 * O saldo da menina: tudo que pagou menos tudo que devia, mais os acertos.
 * Positivo e credito para o proximo play; negativo e o que falta. E a soma
 * de todos os lancamentos, entao apagar um dia devolve o credito sozinho.
 */
export function saldoDaAtleta(data: AppData, playerId: string): Saldo {
  const dias = new Map(data.checkinDias.map((d) => [d.id, d]))
  let pago = 0
  let devido = 0
  let lancamentos = 0
  for (const c of data.checkins) {
    if (c.player_id !== playerId) continue
    const dia = dias.get(c.dia_id)
    if (!dia) continue
    const pag = pagamentoDoCheckin(data, c.id)
    pago += pag?.valor_pago ?? 0
    devido += valorDevido(c, dia, pag)
    lancamentos++
  }
  const acertos = data.checkinAcertos.filter((a) => a.player_id === playerId).reduce((t, a) => t + a.valor, 0)
  return {
    pago: centavos(pago),
    devido: centavos(devido),
    acertos: centavos(acertos),
    saldo: centavos(pago - devido + acertos),
    lancamentos,
  }
}

/** O saldo da menina sem contar um lancamento (o que esta sendo editado): positivo e credito, negativo e divida. */
export function saldoAntesDe(data: AppData, playerId: string, semCheckinId?: string): number {
  const dias = new Map(data.checkinDias.map((d) => [d.id, d]))
  let saldo = data.checkinAcertos.filter((a) => a.player_id === playerId).reduce((t, a) => t + a.valor, 0)
  for (const c of data.checkins) {
    if (c.player_id !== playerId || c.id === semCheckinId) continue
    const dia = dias.get(c.dia_id)
    if (!dia) continue
    const pag = pagamentoDoCheckin(data, c.id)
    saldo += (pag?.valor_pago ?? 0) - valorDevido(c, dia, pag)
  }
  return centavos(saldo)
}

/** O credito que a menina tem para o proximo play. */
export function creditoDisponivel(data: AppData, playerId: string, semCheckinId?: string): number {
  return Math.max(0, saldoAntesDe(data, playerId, semCheckinId))
}

export type Movimento =
  | {
      tipo: 'lancamento'
      date: string
      checkin: Checkin
      dia: CheckinDia
      pag: CheckinPagamento | undefined
      devido: number
      pago: number
      /** Quanto do credito que ela tinha cobriu este play. */
      creditoUsado: number
      /** Quanto do que pagou a mais foi para quitar divida de antes. */
      dividaQuitada: number
      /** O que ainda falta deste play depois do credito (0 quando fechou). */
      falta: number
      /** O que pagou a mais e virou credito novo (depois de quitar o que devia). */
      sobra: number
      saldoDepois: number
    }
  | { tipo: 'acerto'; date: string; acerto: Acerto; saldoDepois: number }

/**
 * O extrato da menina, na ordem do calendario, com o saldo correndo: e aqui
 * que o credito de um play e "gasto" no seguinte. O credito nao e gravado em
 * lugar nenhum -- ele e o saldo que sobrou antes daquele dia.
 */
export function extratoDaAtleta(data: AppData, playerId: string): Movimento[] {
  const dias = new Map(data.checkinDias.map((d) => [d.id, d]))
  type Bruto = { date: string; criado: string; checkin?: Checkin; acerto?: Acerto }
  const brutos: Bruto[] = []
  for (const c of data.checkins) {
    if (c.player_id !== playerId) continue
    const dia = dias.get(c.dia_id)
    if (dia) brutos.push({ date: dia.date, criado: c.created_at, checkin: c })
  }
  for (const a of data.checkinAcertos) {
    if (a.player_id === playerId) brutos.push({ date: a.date, criado: a.created_at, acerto: a })
  }
  brutos.sort((a, b) => a.date.localeCompare(b.date) || a.criado.localeCompare(b.criado))
  let saldo = 0
  const extrato: Movimento[] = []
  for (const b of brutos) {
    if (b.acerto) {
      saldo = centavos(saldo + b.acerto.valor)
      extrato.push({ tipo: 'acerto', date: b.date, acerto: b.acerto, saldoDepois: saldo })
      continue
    }
    const checkin = b.checkin as Checkin
    const dia = dias.get(checkin.dia_id) as CheckinDia
    const pag = pagamentoDoCheckin(data, checkin.id)
    const devido = valorDevido(checkin, dia, pag)
    const pago = centavos(pag?.valor_pago ?? 0)
    const faltava = centavos(devido - pago)
    const creditoUsado = faltava > 0 ? Math.min(Math.max(0, saldo), faltava) : 0
    const pagouAMais = Math.max(0, -faltava)
    const dividaQuitada = Math.min(Math.max(0, -saldo), pagouAMais)
    saldo = centavos(saldo + pago - devido)
    extrato.push({
      tipo: 'lancamento', date: b.date, checkin, dia, pag, devido, pago,
      creditoUsado: centavos(creditoUsado),
      dividaQuitada: centavos(dividaQuitada),
      falta: centavos(Math.max(0, faltava - creditoUsado)),
      sobra: centavos(pagouAMais - dividaQuitada),
      saldoDepois: saldo,
    })
  }
  return extrato
}

export type StatusDoCheckin = 'regularizado' | 'verificar'

/**
 * Como na planilha: "Regularizado" quando o pagamento esta confirmado e, se
 * usou check-in, a arena confirmou o check-in. Sem os dados de pagamento
 * (quem nao esta logada) so o check-in conta.
 */
export function statusDoCheckin(c: Checkin, pag: CheckinPagamento | undefined, logada: boolean): StatusDoCheckin {
  const checkinOk = c.modo !== 'checkin' || c.checkin_confirmado || !c.compareceu
  if (!logada) return checkinOk ? 'regularizado' : 'verificar'
  return checkinOk && Boolean(pag?.pagamento_confirmado) ? 'regularizado' : 'verificar'
}

/* --------------------------------------------------------- disponibilidade */

export type UsoNoLocal = {
  local: CheckinLocal
  /** O plano da conta aceita este local. */
  aceita: boolean
  cota: number
  aulasPorSemana: number
  consumoAulas: number
  usadosEmPlays: number
  /** Pode ficar negativo: as aulas ja passaram da cota, ou um play a mais. A tela avisa, nao bloqueia. */
  disponiveis: number
}

export type UsoDaConta = {
  conta: CheckinConta
  plano: Plano
  locais: UsoNoLocal[]
  /** O que nao fecha nesta conta: aulas alem da cota, aula num local que o plano nao aceita. */
  avisos: string[]
}

export type Disponibilidade = {
  contas: UsoDaConta[]
  /** Somando as contas: quantos check-ins sobram para o play em cada arena. */
  porLocal: { local: CheckinLocal; disponiveis: number; aceita: boolean }[]
  avisos: string[]
}

/**
 * Quantos check-ins cada conta da menina ainda tem no mes, POR LOCAL: a cota
 * do plano naquele local, menos o que as aulas dali cobram, menos os plays
 * lancados ali nesta conta. Locais inativos so aparecem se ainda tem uso.
 */
export function disponibilidade(data: AppData, playerId: string, mes: string): Disponibilidade {
  const dias = new Map(data.checkinDias.map((d) => [d.id, d]))
  const locais = [...data.checkinLocais].sort((a, b) => a.ordem - b.ordem)
  const contas: UsoDaConta[] = contasDaAtleta(data, playerId).map((conta) => {
    const plano = planoDaConta(data, conta)
    const aulas = aulasDaConta(conta)
    const avisos: string[] = []
    const usos: UsoNoLocal[] = []
    for (const local of locais) {
      const cota = cotaDoPlano(plano, local.id)
      const aceita = cota > 0
      const aulasPorSemana = aulas.filter((a) => a.local_id === local.id).reduce((t, a) => t + a.por_semana, 0)
      const consumoAulas = consumoDasAulas(aulasPorSemana)
      const usadosEmPlays = data.checkins.filter((c) => {
        if (c.modo !== 'checkin' || !c.compareceu || c.local_id !== local.id) return false
        const dia = dias.get(c.dia_id)
        if (!dia || monthOf(dia.date) !== mes) return false
        return contaDoCheckin(data, c).id === conta.id
      }).length
      if (!local.ativo && !aceita && aulasPorSemana === 0 && usadosEmPlays === 0) continue
      if (aulasPorSemana > 0 && !aceita) {
        avisos.push(`${plano.nome} não aceita ${local.nome}: as aulas de lá precisam de outra conta ou outro plano.`)
      } else if (consumoAulas > cota && aceita) {
        avisos.push(
          `${aulasPorSemana} aula${aulasPorSemana === 1 ? '' : 's'} por semana em ${local.nome} cobram ${consumoAulas} e o ${plano.nome} dá ${cota}: precisa de conta secundária ou trocar o plano.`,
        )
      }
      const disponiveis = cota - consumoAulas - usadosEmPlays
      // play lancado alem do que sobrava: nao bloqueia, mas a organizadora precisa ver
      if (aceita && consumoAulas <= cota && disponiveis < 0) {
        avisos.push(`${conta.nome || 'A conta principal'} passou ${-disponiveis} check-in${disponiveis === -1 ? '' : 's'} da cota em ${local.nome} este mês.`)
      }
      usos.push({ local, aceita, cota, aulasPorSemana, consumoAulas, usadosEmPlays, disponiveis })
    }
    return { conta, plano, locais: usos, avisos }
  })
  const porLocal = locais
    .filter((l) => l.ativo || contas.some((c) => c.locais.some((u) => u.local.id === l.id)))
    .map((local) => {
      const usos = contas.flatMap((c) => c.locais.filter((u) => u.local.id === local.id && u.aceita))
      return { local, aceita: usos.length > 0, disponiveis: usos.reduce((t, u) => t + Math.max(0, u.disponiveis), 0) }
    })
  return { contas, porLocal, avisos: contas.flatMap((c) => c.avisos) }
}

/** Os livres de uma conta num local (0 quando o plano nao aceita). */
export function livresNoLocal(uso: UsoDaConta, localId: string | null): UsoNoLocal | undefined {
  return localId ? uso.locais.find((u) => u.local.id === localId) : undefined
}

/* -------------------------------------------------------------- relatorios */

export type FiltroDoRelatorio = {
  mes: string | null
  de: string | null
  ate: string | null
  /** Ids dos locais; null = todos. */
  locais: string[] | null
}

export type LinhaDoRelatorio = {
  date: string
  dia: string
  local: string
  atleta: string
  titular: string
  app: string
  modo: Checkin['modo']
  compareceu: boolean
  confirmado: boolean
}

export type BlocoDoRelatorio = { local: CheckinLocal | null; linhas: LinhaDoRelatorio[] }
export type Relatorio = { periodo: string; blocos: BlocoDoRelatorio[]; total: number }

export function periodoDoFiltro(f: FiltroDoRelatorio): string {
  if (f.de && f.ate) return `${dateLabel(f.de)} a ${dateLabel(f.ate)}`
  if (f.mes) return monthLabel(f.mes)
  return 'tudo'
}

/**
 * Os check-ins feitos em cada arena, para a arena conferir: data, o TITULAR
 * da conta (e esse nome que a arena tem), o app e a menina. Sem dinheiro --
 * isso e da organizacao, nao da arena. So os lancamentos com check-in.
 */
export function relatorioDasArenas(
  data: AppData,
  f: FiltroDoRelatorio,
  nameOf: (id: string) => string,
): Relatorio {
  const dias = (f.de && f.ate ? diasNoIntervalo(data, f.de, f.ate) : f.mes ? diasDoMes(data, f.mes) : data.checkinDias)
  const porId = new Map(dias.map((d) => [d.id, d]))
  const locais = [...data.checkinLocais].sort((a, b) => a.ordem - b.ordem)
  const escolhidos = f.locais ? new Set(f.locais) : null
  const blocos: BlocoDoRelatorio[] = []
  const linhasDe = (localId: string | null): LinhaDoRelatorio[] =>
    data.checkins
      .filter((c) => c.modo === 'checkin' && c.compareceu && (c.local_id ?? null) === localId && porId.has(c.dia_id))
      .map((c) => {
        const dia = porId.get(c.dia_id) as CheckinDia
        const conta = contaDoCheckin(data, c)
        const atleta = nameOf(c.player_id)
        return {
          date: dia.date,
          dia: rotuloDoDia(dia, data.sessions),
          local: locais.find((l) => l.id === localId)?.nome ?? 'Sem local',
          atleta: atleta === '—' ? '(atleta removida)' : atleta,
          titular: nomeDoTitular(conta, atleta),
          app: rotuloDoTipo(appDaConta(data, conta)),
          modo: c.modo,
          compareceu: c.compareceu,
          confirmado: c.checkin_confirmado,
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.titular.localeCompare(b.titular, 'pt-BR'))
  for (const l of locais) {
    if (escolhidos && !escolhidos.has(l.id)) continue
    const linhas = linhasDe(l.id)
    if (linhas.length > 0 || !escolhidos) blocos.push({ local: l, linhas })
  }
  if (!escolhidos) {
    const semLocal = linhasDe(null)
    if (semLocal.length > 0) blocos.push({ local: null, linhas: semLocal })
  }
  return { periodo: periodoDoFiltro(f), blocos, total: blocos.reduce((t, b) => t + b.linhas.length, 0) }
}

/** Texto para o WhatsApp: so *negrito* e _italico_, uma linha por check-in. */
export function textoDoRelatorio(rel: Relatorio): string {
  const partes: string[] = [`✅ *CHECK-INS — ${rel.periodo.toUpperCase()}*`, '_Play de Todas · Beach Tennis_']
  for (const b of rel.blocos) {
    partes.push(
      `\n*📍 ${b.local?.nome ?? 'Sem local'}* — ${b.linhas.length} check-in${b.linhas.length === 1 ? '' : 's'}\n` +
        (b.linhas.length === 0
          ? '_nenhum_'
          : b.linhas
              .map(
                (l) =>
                  `• ${dateLabel(l.date).slice(0, 5)} · ${l.titular}` +
                  (l.titular !== l.atleta ? ` _(${l.atleta})_` : '') +
                  ` · ${l.app}` +
                  (l.confirmado ? '' : ' · _a confirmar_'),
              )
              .join('\n')),
    )
  }
  partes.push(`\n*Total:* ${rel.total} check-in${rel.total === 1 ? '' : 's'}`)
  return partes.join('\n')
}

/* ------------------------------------------------------------------- caixa */

export type LinhaDoResumo = {
  mes: string
  receitasPlay: number
  receitasExtras: number
  receitaTotal: number
  aluguel: number
  brindes: number
  confraternizacao: number
  outras: number
  despesaTotal: number
  saldoDoMes: number
  saldoAcumulado: number
}

/**
 * O resumo da planilha, mes a mes: receita dos plays (a soma do que foi pago
 * nos lancamentos), receitas extras e as saidas por categoria, com o saldo
 * acumulado desde o primeiro mes com movimento.
 */
export function resumoDoCaixa(data: AppData): LinhaDoResumo[] {
  const dias = new Map(data.checkinDias.map((d) => [d.id, d]))
  const meses = new Set<string>()
  const porMes = new Map<string, LinhaDoResumo>()
  const linha = (mes: string): LinhaDoResumo => {
    meses.add(mes)
    let l = porMes.get(mes)
    if (!l) {
      l = { mes, receitasPlay: 0, receitasExtras: 0, receitaTotal: 0, aluguel: 0, brindes: 0, confraternizacao: 0, outras: 0, despesaTotal: 0, saldoDoMes: 0, saldoAcumulado: 0 }
      porMes.set(mes, l)
    }
    return l
  }
  for (const p of data.checkinPagamentos) {
    const c = data.checkins.find((x) => x.id === p.checkin_id)
    const dia = c ? dias.get(c.dia_id) : undefined
    if (!dia) continue
    linha(monthOf(dia.date)).receitasPlay += p.valor_pago
  }
  // um acerto com dinheiro e receita dos plays no mes em que aconteceu: a
  // divida paga depois entra (+), o credito devolvido sai (-); o perdao nao mexe
  for (const a of data.checkinAcertos) {
    if (a.dinheiro) linha(monthOf(a.date)).receitasPlay += a.valor
  }
  for (const l of data.caixa) {
    const r = linha(monthOf(l.date))
    if (l.tipo === 'entrada') r.receitasExtras += l.valor
    else if (l.categoria === 'aluguel') r.aluguel += l.valor
    else if (l.categoria === 'brinde') r.brindes += l.valor
    else if (l.categoria === 'confraternizacao') r.confraternizacao += l.valor
    else r.outras += l.valor
  }
  let acumulado = 0
  return [...meses]
    .sort()
    .map((mes) => {
      const r = porMes.get(mes) as LinhaDoResumo
      r.receitaTotal = centavos(r.receitasPlay + r.receitasExtras)
      r.despesaTotal = centavos(r.aluguel + r.brindes + r.confraternizacao + r.outras)
      r.saldoDoMes = centavos(r.receitaTotal - r.despesaTotal)
      acumulado = centavos(acumulado + r.saldoDoMes)
      r.saldoAcumulado = acumulado
      for (const k of ['receitasPlay', 'receitasExtras', 'aluguel', 'brindes', 'confraternizacao', 'outras'] as const) {
        r[k] = centavos(r[k])
      }
      return r
    })
}

/* ---------------------------------------------------------------- formatos */

const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatarReais(n: number): string {
  return reais.format(centavos(n))
}

/** "45", "45,50", "R$ 45,50", "1.250,00" -> numero em reais; texto sem numero -> null. */
export function lerValor(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.-]/g, '')
  if (!limpo) return null
  // com virgula, ela e o decimal e o ponto e milhar; sem virgula, o ponto e decimal
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  const n = Number(normalizado)
  return Number.isFinite(n) ? centavos(n) : null
}
