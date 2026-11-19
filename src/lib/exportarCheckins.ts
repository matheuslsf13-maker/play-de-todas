/**
 * AS PLANILHAS DOS CHECK-INS
 *
 * Duas exportacoes, as duas no formato da planilha que a organizadora usava:
 * o "Excel completo" (as abas dela -- Controle Play, Pagamentos e Resumo --
 * mais Saldos, com dinheiro, so para ela) e o "Excel das arenas" (uma aba por
 * arena, sem dinheiro, para mandar para cada uma conferir os check-ins do mes).
 */
import type { AppData } from './types'
import { dateLabel, monthLabel, monthOf, todayISO } from './types'
import {
  CATEGORIAS_DE_CAIXA,
  acertosDaMensalidade,
  acertosDe,
  contaDoItem,
  descontoDoAluguel,
  appDaConta,
  centavos,
  contaDoCheckin,
  economiaDoAluguel,
  saidasDosEventos,
  extratoDaAtleta,
  formatarReais,
  nomeDoTitular,
  pagamentoDoCheckin,
  planoDaConta,
  resumoDoCaixa,
  rotuloDoDia,
  rotuloDoTipo,
  saldoDaAtleta,
  saldoDoCheckin,
  statusDoCheckin,
  valorDevido,
  type Relatorio,
} from './checkins'
import { categoriaDe, CATEGORIAS } from './mensalidade'
import { filaDeEspera, limiteDeMensalistas, mensalistasAtivas, geridaNaAbaMensalistas } from './vagasDeMensalista'
import {
  MES_INICIAL, checkinsDaFicha, creditoDaMensalidade, dividaDaMensalidade, dinheiroDaFicha, faltaDaFicha, fichaDe, idDaFicha,
  mensalidadeDaData, mesAnterior, proximoMes, prazoDosCheckins, quitada, renovada, usosDoCreditoNaDivida, valorDaFicha, vencimento,
} from './fichaDaMensalidade'
import type { Celula, Planilha } from './xlsx'
import { checkinsNaArena } from './aluguel'

const SIM_NAO = (v: boolean) => (v ? 'Sim' : 'Não')

/**
 * O EXCEL DA ARENA (dono, 18/11): o que a funcionaria da arena precisa para conferir, sem nada do financeiro da
 * organizacao (quem deve, quem pagou o que). Uma aba por arena escolhida, no mesmo arquivo: os check-ins (dia, titular
 * da conta, app, atleta, confirmado ou pendente), o total com os pendentes e, na arena dos alugueis (a V3, a unica que
 * abate check-in), cada aluguel: o que ela cobrou, o desconto, quantos check-ins abateram (e de que mes), o que foi
 * pago no Pix, e se os check-ins abatidos batem com os listados na aba. `data` e `meses` (os meses do relatorio)
 * ligam os alugueis; sem eles sai so a lista de check-ins.
 */
export function planilhasDasArenas(rel: Relatorio, data?: AppData, meses: string[] = []): Planilha[] {
  const abas: Planilha[] = rel.blocos
    .filter((b) => b.linhas.length > 0 || (data && b.local && alugueisDaArena(data, b.local.nome, meses).length > 0))
    .map((b) => {
      const pendentes = b.linhas.filter((l) => !l.confirmado).length
      const linhas: Celula[][] = [
        ['Data', 'Dia', 'Titular da conta', 'App', 'Atleta', 'Check-in confirmado'],
        ...b.linhas.map((l) => [dateLabel(l.date), l.dia, l.titular, l.app, l.atleta, l.confirmado ? 'Sim' : 'Pendente']),
        [],
        ['Total de check-ins', b.linhas.length],
        ['Confirmados', b.linhas.length - pendentes],
        ['Pendentes (ainda a confirmar)', pendentes],
      ]
      const alugueis = data && b.local ? alugueisDaArena(data, b.local.nome, meses) : []
      if (data && b.local && alugueis.length > 0) {
        linhas.push([], ['ALUGUÉIS'], [
          'Data do pagamento', 'Descrição', 'Tipo', 'Valor cobrado', 'Desconto (%)', 'Check-ins de', 'Check-ins abatidos',
          'Abatido em check-ins', 'Pago no Pix', 'Check-ins feitos aqui nesse mês', 'Confere',
        ])
        for (const l of alugueis) {
          const mesDosCheckins = mesAnterior(monthOf(l.date))
          const abatidos = l.plano_mensal ? l.checkins_abatidos ?? 0 : 0
          const feitos = checkinsNaArena(data, b.local.id, mesDosCheckins)
          linhas.push([
            dateLabel(l.date), l.descricao, l.plano_mensal ? 'Mensal (contratado)' : 'Avulso',
            { reais: l.valor_cobrado ?? l.valor }, Math.round(descontoDoAluguel(l) * 1000) / 10,
            l.plano_mensal ? monthLabel(mesDosCheckins) : '', l.plano_mensal ? abatidos : '',
            { reais: centavos((l.valor_cobrado ?? l.valor) - l.valor) }, { reais: l.valor },
            l.plano_mensal ? feitos : '',
            // o abatido foi gravado no dia do aluguel; check-in lancado ou apagado depois faz a conta mudar
            l.plano_mensal ? (feitos === abatidos ? 'Sim' : `Não: ${feitos > abatidos ? `${feitos - abatidos} a mais` : `${abatidos - feitos} a menos`} na lista`) : '',
          ])
        }
      }
      return { nome: b.local?.nome ?? 'Sem arena', linhas }
    })
  if (abas.length === 0) abas.push({ nome: 'Check-ins', linhas: [['Nenhum check-in em ' + rel.periodo]] })
  return abas
}

/**
 * Os alugueis lancados com o valor que a arena cobrou: hoje so a V3 (o mesmo nome que o Caixa usa, /v3/), porque o
 * lancamento do caixa nao guarda a arena. Entra o aluguel pago num dos meses do relatorio ou o que abateu os check-ins
 * de um deles (o de dezembro paga os check-ins de novembro).
 * shortcut: arena do aluguel pelo nome "V3", trocar por uma coluna caixa.local_id quando houver aluguel de outra arena.
 */
function alugueisDaArena(data: AppData, nomeDaArena: string, meses: string[]) {
  if (!/v3/i.test(nomeDaArena)) return []
  const set = new Set(meses)
  return data.caixa
    .filter((l) => l.categoria === 'aluguel' && l.tipo === 'saida' && l.valor_cobrado)
    .filter((l) => set.size === 0 || set.has(monthOf(l.date)) || set.has(mesAnterior(monthOf(l.date))))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Os meses (AAAA-MM) de um relatorio por mes ou por periodo. */
export function mesesDoFiltro(f: { mes: string | null; de?: string | null; ate?: string | null }): string[] {
  if (f.mes) return [f.mes]
  if (!f.de || !f.ate) return []
  const out: string[] = []
  for (let m = monthOf(f.de); m <= monthOf(f.ate); m = proximoMes(m)) out.push(m)
  return out
}

function planilhaMensalidades(data: AppData, nome: (id: string) => string, mes: string | null, hoje: string): Planilha | null {
  // O item pode chegar antes do cabeçalho. A chave é a atleta e o mês, mesmo nesse caso.
  const chaves = new Map<string, { player_id: string; mes: string }>()
  for (const registro of [...data.mensalidades, ...data.mensalidadeItens]) {
    if (registro.mes < MES_INICIAL) continue
    if (!mes || registro.mes === mes) chaves.set(idDaFicha(registro.player_id, registro.mes), registro)
  }
  if (!chaves.size) return null

  const linhas: Celula[][] = [['Atleta', 'Mensalidade', 'Dinheiro', 'Check-ins', 'Abatimentos', 'Vale', 'Falta', 'Situação']]
  const detalhes: Celula[][] = [['Atleta', 'Mensalidade', 'Data', 'Tipo', 'Arena', 'Titular da conta', 'Valor', 'Confirmado', 'Observação']]
  const tipos = { checkin: 'Check-in', dinheiro: 'Pix', abatimento: 'Abatimento' }
  const ordenadas = [...chaves.values()].sort((a, b) => a.mes.localeCompare(b.mes)
    || nome(a.player_id).localeCompare(nome(b.player_id), 'pt-BR'))
  for (const { player_id, mes: competencia } of ordenadas) {
    const f = fichaDe(data, player_id, competencia)
    const atleta = nome(player_id)
    const periodo = monthLabel(competencia).toLowerCase().replace(' de ', '/')
    const falta = faltaDaFicha(f)
    const situacao = quitada(f) ? 'Quitada'
      : hoje > prazoDosCheckins(competencia) && renovada(f) ? `Deve ${formatarReais(falta)} - virou avulsa`
      : hoje > vencimento(competencia) && !renovada(f) ? 'Não renovou'
      : `Falta ${formatarReais(falta)}`
    const abatimentos = f.itens.filter(i => i.tipo === 'abatimento')
      .reduce((soma, i) => soma + (i.valor ?? 0), 0)
    linhas.push([atleta, periodo, { reais: dinheiroDaFicha(f) }, checkinsDaFicha(f),
      { reais: centavos(abatimentos) }, { reais: valorDaFicha(f) }, { reais: falta }, situacao])

    for (const i of f.itens.sort((a, b) => a.date.localeCompare(b.date))) {
      const conta = data.checkinContas.find(c => c.id === i.conta_id)
      const titular = conta ? nomeDoTitular(conta, nome(conta.player_id))
        : i.conta_id?.startsWith('principal:') ? nome(i.conta_id.slice('principal:'.length)) : atleta
      detalhes.push([atleta, periodo, dateLabel(i.date), tipos[i.tipo],
        data.checkinLocais.find(l => l.id === i.local_id)?.nome ?? '',
        i.tipo === 'checkin' ? titular : '', { reais: i.tipo === 'checkin' ? f.valor_checkin : i.valor ?? 0 },
        SIM_NAO(i.confirmado), i.observacao ?? ''])
    }
  }
  return { nome: 'Mensalidades', linhas: [...linhas, [], ...detalhes] }
}

/** Quem e mensalista, a fila de espera, o limite e o que cada uma deve ou tem de credito (a aba Mensalistas do app). */
function planilhaMensalistas(data: AppData, nome: (id: string) => string, hoje: string): Planilha | null {
  const fila = filaDeEspera(data)
  const gente = data.players.filter((p) => geridaNaAbaMensalistas(data, p, hoje))
  if (!gente.length && !fila.length) return null
  const limite = limiteDeMensalistas(data)
  const ocupadas = mensalistasAtivas(data, hoje).length
  const mesAtual = mensalidadeDaData(hoje)
  const rotuloDe = (p: (typeof data.players)[number]) => CATEGORIAS.find((c) => c.valor === categoriaDe(p))?.rotulo ?? ''
  const linhas: Celula[][] = [
    ['Limite de mensalistas', limite, 'Ocupadas', ocupadas, 'Vagas livres', Math.max(0, limite - ocupadas), 'Na lista de espera', fila.length],
    [],
    ['Atleta', 'Categoria', `Mensalidade de ${monthLabel(mesAtual).toLowerCase()}`, 'Valor da ficha', 'Falta', 'Deve (mensalidades anteriores)', 'Crédito da mensalidade'],
  ]
  for (const p of [...gente].sort((a, b) => nome(a.id).localeCompare(nome(b.id), 'pt-BR'))) {
    const f = fichaDe(data, p.id, mesAtual)
    const situacao = quitada(f) ? 'Quitada' : renovada(f) ? 'Renovada' : hoje > vencimento(mesAtual) ? 'Não renovou' : f.itens.length ? 'Falta renovar' : 'Nada registrado'
    linhas.push([nome(p.id), rotuloDe(p), situacao, { reais: valorDaFicha(f) }, { reais: faltaDaFicha(f) },
      { reais: dividaDaMensalidade(data, p.id, hoje).total }, { reais: creditoDaMensalidade(data, p.id, hoje).total }])
  }
  if (fila.length) {
    linhas.push([], ['Lista de espera', 'Posição', 'Pediu em'])
    fila.forEach((p, i) => linhas.push([nome(p.id), `${i + 1}º`, dateLabel((p.espera_mensalista as string).slice(0, 10))]))
  }
  return { nome: 'Mensalistas', linhas }
}

/**
 * O controle completo. `mes` nulo exporta tudo; com mes, so os lancamentos e
 * o caixa daquele mes (o resumo sai inteiro de todo jeito, e o acumulado
 * precisa dos meses anteriores).
 */
export function planilhasCompletas(data: AppData, nameOf: (id: string) => string, mes: string | null, hoje = todayISO()): Planilha[] {
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
        'Data', 'Dia', 'Atleta', 'Titular da conta', 'Plano', 'App', 'Arena', 'Modalidade', 'Compareceu',
        'Check-in confirmado', 'Valor devido', 'Valor pago', 'Crédito usado', 'Quitou de antes', 'Falta', 'Vira crédito',
        'Pagamento confirmado', 'Status', 'Substituta de', 'Check-in de crédito', 'Observação',
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
      comCheckin ? planoDaConta(data, conta).nome : '',
      comCheckin ? rotuloDoTipo(appDaConta(data, conta)) : '',
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
      c.substitui ? nome(c.substitui) : '',
      c.credito_checkin ? 'Sim (não veio, fez o check-in)' : c.credito_de ? 'Usou o de crédito' : '',
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
  // com o credito da mensalidade (o que foi pago sem renovar), como o saldo no app
  for (const x of [
    ...data.checkinAcertos,
    ...data.players.flatMap((p) => [
      ...acertosDaMensalidade(data, p.id),
      ...usosDoCreditoNaDivida(data, p.id).map((u) => ({ player_id: p.id, date: u.date, valor: -u.valor })),
    ]),
  ]) {
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

  // ---- Resumo: igual ao Resumo do Caixa no app (mensalidades e caixa de eventos inclusos, D47)
  const resumo: Planilha = {
    nome: 'Resumo',
    linhas: [
      [
        'Mês', 'Receita dos plays', 'Mensalidades', 'Receitas extras', 'Receita total', 'Aluguel', 'Brindes e presentes',
        'Confraternização', 'Outras despesas', 'Despesa total', 'Saldo do mês', 'Saldo acumulado',
        'Caixa de eventos (reserva)',
      ],
      ...resumoDoCaixa(data).map((r) => [
        monthLabel(r.mes), { reais: r.receitasPlay }, { reais: r.mensalidades }, { reais: r.receitasExtras },
        { reais: r.receitaTotal }, { reais: r.aluguel }, { reais: r.brindes }, { reais: r.confraternizacao },
        { reais: r.outras }, { reais: r.despesaTotal }, { reais: r.saldoDoMes }, { reais: r.saldoAcumulado },
        { reais: r.eventosAcumulado },
      ]),
    ],
  }

  // ---- Pagamentos: a aba de saidas da planilha (mais as receitas extras), uma por linha
  const pagoPelosEventos = new Map(saidasDosEventos(data).filter((x) => !x.devolucao).map((x) => [x.caixa_id, x.coberto]))
  const linhasDoCaixa: { date: string; linha: Celula[] }[] = [
    ...data.caixa
      .filter((l) => !mes || monthOf(l.date) === mes)
      .map((l) => ({
        date: l.date,
        linha: [
          dateLabel(l.date),
          l.descricao,
          l.transferencia
            ? l.tipo === 'saida' ? 'Transferência para a caixinha de eventos' : 'Devolução da caixinha ao caixa'
            : CATEGORIAS_DE_CAIXA.find((c) => c.valor === l.categoria)?.rotulo ?? l.categoria,
          l.tipo === 'entrada' ? 'Entrada' : 'Saída',
          { reais: l.tipo === 'entrada' ? l.valor : -l.valor },
          // aluguel da V3: o que ela cobrou, se foi no plano mensal, os check-ins abatidos e a economia que foi para o caixa de eventos
          l.valor_cobrado ? { reais: l.valor_cobrado } : '',
          l.categoria === 'aluguel' && l.valor_cobrado ? (l.plano_mensal ? 'Sim' : 'Não') : '',
          // o % de desconto e editavel nos dois tipos (script 40): a economia sai dele
          l.categoria === 'aluguel' && l.valor_cobrado ? Math.round(descontoDoAluguel(l) * 1000) / 10 : '',
          l.checkins_abatidos ?? '',
          economiaDoAluguel(l) ? { reais: economiaDoAluguel(l) } : '',
          pagoPelosEventos.get(l.id) ? { reais: -(pagoPelosEventos.get(l.id) as number) } : '',
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
          '', '', '', '', '', '',
        ] as Celula[],
      })),
  ]
  const pagamentos: Planilha = {
    nome: 'Pagamentos',
    linhas: [
      ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor', 'Aluguel: valor cobrado', 'Aluguel: plano mensal', 'Aluguel: desconto (%)', 'Aluguel: check-ins abatidos', 'Para o caixa de eventos', 'Pago pelo caixa de eventos'],
      ...linhasDoCaixa.sort((a, b) => a.date.localeCompare(b.date)).map((x) => x.linha),
    ],
  }

  // ---- Acertos: cada mexida no saldo fora de um play, uma por linha (o Saldos so mostra a soma). Inclui a divida
  // paga com check-in (script 41), o credito da mensalidade e o credito que cobriu a divida, que sao calculados.
  const linhasDeAcerto = data.players
    .flatMap((p) => acertosDe(data, p.id))
    .concat(data.checkinAcertos.filter((a) => !data.players.some((p) => p.id === a.player_id)))
    .filter((a) => !mes || monthOf(a.date) === mes)
    .sort((a, b) => a.date.localeCompare(b.date) || nome(a.player_id).localeCompare(nome(b.player_id), 'pt-BR'))
  const acertos: Planilha = {
    nome: 'Acertos',
    linhas: [
      ['Data', 'Atleta', 'Descrição', 'Efeito no saldo', 'Dinheiro de verdade', 'Pago com check-in', 'Arena', 'Titular da conta'],
      ...linhasDeAcerto.map((a): Celula[] => {
        const orig = a.credito_de ? data.checkins.find((c) => c.id === a.credito_de) : undefined
        const localId = orig ? orig.local_id : a.local_id
        const comCheckin = Boolean(orig || a.local_id)
        const conta = orig ? contaDoCheckin(data, orig) : comCheckin ? contaDoItem(data, { player_id: a.player_id, conta_id: a.conta_id ?? null }) : null
        const dataDoOrig = orig ? data.checkinDias.find((d) => d.id === orig.dia_id)?.date : undefined
        return [
          dateLabel(a.date), nome(a.player_id), a.descricao, { reais: a.valor }, SIM_NAO(a.dinheiro),
          orig ? `Check-in de crédito${dataDoOrig ? ` de ${dateLabel(dataDoOrig)}` : ''}` : comCheckin ? 'Sim' : '',
          comCheckin ? data.checkinLocais.find((l) => l.id === localId)?.nome ?? '' : '',
          conta ? nomeDoTitular(conta, nome(a.player_id)) : '',
        ]
      }),
    ],
  }

  const abas = [controle, pagamentos, resumo, saldos, acertos]
  const dados = { ...data, mensalidades: data.mensalidades ?? [], mensalidadeItens: data.mensalidadeItens ?? [] }
  if (!mes || mes >= MES_INICIAL) {
    const mensalidades = planilhaMensalidades(dados, nome, mes, hoje)
    if (mensalidades) abas.push(mensalidades)
  }
  const mensalistas = planilhaMensalistas(dados, nome, hoje)
  if (mensalistas) abas.push(mensalistas)
  return abas
}
