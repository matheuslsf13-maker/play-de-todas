/**
 * AS PLANILHAS DOS CHECK-INS
 *
 * Duas exportacoes, as duas no formato da planilha que a organizadora usava:
 * o "Excel completo" (as abas dela -- Controle Play, Pagamentos e Resumo --
 * mais Saldos, com dinheiro, so para ela) e o "Excel das arenas" (uma aba por
 * arena, sem dinheiro, para mandar para cada uma conferir os check-ins do mes).
 */
import type { AppData } from './types'
import { dateLabel, monthLabel, monthOf } from './types'
import {
  CATEGORIAS_DE_CAIXA,
  contaDoCheckin,
  extratoDaAtleta,
  nomeDoTitular,
  pagamentoDoCheckin,
  resumoDoCaixa,
  rotuloDoDia,
  rotuloDoTipo,
  saldoDaAtleta,
  saldoDoCheckin,
  statusDoCheckin,
  valorDevido,
  type Relatorio,
} from './checkins'
import type { Celula, Planilha } from './xlsx'

const SIM_NAO = (v: boolean) => (v ? 'Sim' : 'Não')

/** Uma aba por arena: data, titular (o nome que a arena tem), app, a menina e se ja foi confirmado. */
export function planilhasDasArenas(rel: Relatorio): Planilha[] {
  const abas: Planilha[] = rel.blocos
    .filter((b) => b.linhas.length > 0)
    .map((b) => ({
      nome: b.local?.nome ?? 'Sem arena',
      linhas: [
        ['Data', 'Dia', 'Titular da conta', 'App', 'Atleta', 'Check-in confirmado'],
        ...b.linhas.map((l) => [dateLabel(l.date), l.dia, l.titular, l.app, l.atleta, SIM_NAO(l.confirmado)]),
      ],
    }))
  if (abas.length === 0) abas.push({ nome: 'Check-ins', linhas: [['Nenhum check-in em ' + rel.periodo]] })
  return abas
}

/**
 * O controle completo. `mes` nulo exporta tudo; com mes, so os lancamentos e
 * o caixa daquele mes (o resumo sai inteiro de todo jeito, e o acumulado
 * precisa dos meses anteriores).
 */
export function planilhasCompletas(data: AppData, nameOf: (id: string) => string, mes: string | null): Planilha[] {
  const dias = data.checkinDias
    .filter((d) => !mes || monthOf(d.date) === mes)
    .sort((a, b) => a.date.localeCompare(b.date))
  const porDia = new Map(dias.map((d) => [d.id, d]))
  const nome = (id: string) => {
    const n = nameOf(id)
    return n === '—' ? '(atleta removida)' : n
  }

  // ---- Controle Play: uma linha por lancamento, como a aba da planilha
  const controle: Planilha = {
    nome: 'Controle Play',
    linhas: [
      [
        'Data', 'Dia', 'Atleta', 'Titular da conta', 'App', 'Arena', 'Modalidade', 'Compareceu',
        'Check-in confirmado', 'Valor devido', 'Valor pago', 'Crédito usado', 'Quitou de antes', 'Falta', 'Vira crédito',
        'Pagamento confirmado', 'Status', 'Observação',
      ],
    ],
  }
  // credito usado, divida quitada e o que falta vem do extrato (o saldo correndo na ordem do calendario)
  const extratos = new Map<string, ReturnType<typeof extratoDaAtleta>>()
  const movimentoDe = (c: { id: string; player_id: string }) => {
    let e = extratos.get(c.player_id)
    if (!e) {
      e = extratoDaAtleta(data, c.player_id)
      extratos.set(c.player_id, e)
    }
    const m = e.find((x) => x.tipo === 'lancamento' && x.checkin.id === c.id)
    return m?.tipo === 'lancamento' ? m : null
  }
  const lancamentos = data.checkins
    .filter((c) => porDia.has(c.dia_id))
    .sort((a, b) => {
      const da = porDia.get(a.dia_id)!
      const db = porDia.get(b.dia_id)!
      return da.date.localeCompare(db.date) || nome(a.player_id).localeCompare(nome(b.player_id), 'pt-BR')
    })
  for (const c of lancamentos) {
    const dia = porDia.get(c.dia_id)!
    const conta = contaDoCheckin(data, c)
    const pag = pagamentoDoCheckin(data, c.id)
    const atleta = nome(c.player_id)
    const comCheckin = c.modo === 'checkin'
    controle.linhas.push([
      dateLabel(dia.date),
      rotuloDoDia(dia, data.sessions),
      atleta,
      comCheckin ? nomeDoTitular(conta, atleta) : '',
      comCheckin ? rotuloDoTipo(conta.tipo) : '',
      comCheckin ? data.checkinLocais.find((l) => l.id === c.local_id)?.nome ?? '' : '',
      comCheckin ? 'Check-in + valor' : 'Integral',
      SIM_NAO(c.compareceu),
      comCheckin ? SIM_NAO(c.checkin_confirmado) : '',
      { reais: valorDevido(c, dia, pag) },
      { reais: pag?.valor_pago ?? 0 },
      { reais: movimentoDe(c)?.creditoUsado ?? 0 },
      { reais: movimentoDe(c)?.dividaQuitada ?? 0 },
      { reais: movimentoDe(c)?.falta ?? Math.max(0, -saldoDoCheckin(c, dia, pag)) },
      { reais: movimentoDe(c)?.sobra ?? Math.max(0, saldoDoCheckin(c, dia, pag)) },
      SIM_NAO(Boolean(pag?.pagamento_confirmado)),
      statusDoCheckin(c, pag, true) === 'regularizado' ? 'Regularizado' : 'Verificar',
      pag?.observacao ?? '',
    ])
  }

  // ---- Saldos: o saldo de cada menina, mes a mes (a planilha nao tinha; e o que ela conferia na mao)
  type Acum = { playerId: string; lancamentos: number; devido: number; pago: number; acertos: number }
  const porAtletaMes = new Map<string, Acum>()
  const acum = (playerId: string, m: string) => {
    const chave = `${nome(playerId)}\u0000${m}`
    let a = porAtletaMes.get(chave)
    if (!a) {
      a = { playerId, lancamentos: 0, devido: 0, pago: 0, acertos: 0 }
      porAtletaMes.set(chave, a)
    }
    return a
  }
  for (const c of lancamentos) {
    const dia = porDia.get(c.dia_id)!
    const pag = pagamentoDoCheckin(data, c.id)
    const a = acum(c.player_id, monthOf(dia.date))
    a.lancamentos++
    a.devido += valorDevido(c, dia, pag)
    a.pago += pag?.valor_pago ?? 0
  }
  for (const x of data.checkinAcertos) {
    if (!mes || monthOf(x.date) === mes) acum(x.player_id, monthOf(x.date)).acertos += x.valor
  }
  const saldos: Planilha = {
    nome: 'Saldos',
    linhas: [['Atleta', 'Mês', 'Lançamentos', 'Devido', 'Pago', 'Acertos', 'Saldo do mês', 'Saldo de hoje', 'Situação']],
  }
  for (const [chave, a] of [...porAtletaMes.entries()].sort((x, y) => x[0].localeCompare(y[0], 'pt-BR'))) {
    const [atleta, m] = chave.split('\u0000')
    const saldoDoMes = Math.round((a.pago - a.devido + a.acertos) * 100) / 100
    // o saldo de hoje e o de todos os meses: e ele que diz se ha credito ou divida
    const hoje = saldoDaAtleta(data, a.playerId).saldo
    saldos.linhas.push([
      atleta, monthLabel(m), a.lancamentos, { reais: a.devido }, { reais: a.pago }, { reais: a.acertos },
      { reais: saldoDoMes }, { reais: hoje },
      hoje > 0 ? 'Crédito' : hoje < 0 ? 'Deve' : 'Em dia',
    ])
  }

  // ---- Resumo: igual a aba Resumo, todos os meses
  const resumo: Planilha = {
    nome: 'Resumo',
    linhas: [
      [
        'Mês', 'Receita dos plays', 'Receitas extras', 'Receita total', 'Aluguel', 'Brindes', 'Confraternização',
        'Outras despesas', 'Despesa total', 'Saldo do mês', 'Saldo acumulado',
      ],
      ...resumoDoCaixa(data).map((r) => [
        monthLabel(r.mes), { reais: r.receitasPlay }, { reais: r.receitasExtras }, { reais: r.receitaTotal },
        { reais: r.aluguel }, { reais: r.brindes }, { reais: r.confraternizacao }, { reais: r.outras },
        { reais: r.despesaTotal }, { reais: r.saldoDoMes }, { reais: r.saldoAcumulado },
      ]),
    ],
  }

  // ---- Pagamentos: a aba de saidas da planilha (mais as receitas extras), uma por linha
  const linhasDoCaixa: { date: string; linha: Celula[] }[] = [
    ...data.caixa
      .filter((l) => !mes || monthOf(l.date) === mes)
      .map((l) => ({
        date: l.date,
        linha: [
          dateLabel(l.date),
          l.descricao,
          CATEGORIAS_DE_CAIXA.find((c) => c.valor === l.categoria)?.rotulo ?? l.categoria,
          l.tipo === 'entrada' ? 'Entrada' : 'Saída',
          { reais: l.tipo === 'entrada' ? l.valor : -l.valor },
        ] as Celula[],
      })),
    // os acertos com dinheiro: a divida paga depois entra, o credito devolvido sai
    ...data.checkinAcertos
      .filter((a) => a.dinheiro && (!mes || monthOf(a.date) === mes))
      .map((a) => ({
        date: a.date,
        linha: [
          dateLabel(a.date),
          `${nome(a.player_id)} · ${a.descricao}`,
          'Acerto de atleta',
          a.valor >= 0 ? 'Entrada' : 'Saída',
          { reais: a.valor },
        ] as Celula[],
      })),
  ]
  const pagamentos: Planilha = {
    nome: 'Pagamentos',
    linhas: [
      ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor'],
      ...linhasDoCaixa.sort((a, b) => a.date.localeCompare(b.date)).map((x) => x.linha),
    ],
  }

  return [controle, pagamentos, resumo, saldos]
}
