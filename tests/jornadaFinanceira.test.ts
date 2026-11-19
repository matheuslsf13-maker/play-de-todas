import test from 'node:test'
import assert from 'node:assert/strict'
import { prepararPagamento, pagarDividas, desfazerDoPlay, idDoLancamento } from '../src/lib/pagamentoNaLista'
import { checkinJaFeito, creditosDeCheckin, disponibilidade, extratoDaAtleta, relatorioDasArenas, resumoDoCaixa, saldoAntesDe, saldoDaAtleta } from '../src/lib/checkins'
import { checkinsNaArena } from '../src/lib/aluguel'
import { planilhasCompletas, planilhasDasArenas } from '../src/lib/exportarCheckins'
import { emptyData, type AppData, type Checkin, type CheckinDia, type PlaySession, type Player } from '../src/lib/types'

/* AS ACOES SE CRUZANDO (18/11): divida de play, check-in de credito, o 💰 pagando a divida com check-ins e dinheiro,
 * a cota da arena, o aluguel, o caixa, o Excel e apagar o play. Todas as contas tem de contar a mesma historia. */
const bia = { id: 'bia', name: 'Bia', categoria: 'avulsa', active: true } as Player
const dia = (id: string, date: string, session_id: string | null = null): CheckinDia =>
  ({ id, date, session_id, titulo: null, valor_cheio: 50, valor_com_checkin: 25, created_at: '' })

function cenario(): AppData {
  const d = emptyData()
  d.players = [bia]
  d.checkinLocais = [{ id: 'v3', nome: 'Arena V3', ordem: 0, ativo: true } as AppData['checkinLocais'][number]]
  d.checkinDias = [dia('d1', '2026-11-03'), dia('d2', '2026-11-10'), dia('d3', '2026-11-17', 's3')]
  d.sessions = [{ id: 's3', date: '2026-11-17', status: 'open', player_ids: ['bia'] } as unknown as PlaySession]
  // 03/11: jogou integral e nao pagou (deve 50)
  d.checkins = [{ id: 'c1', dia_id: 'd1', player_id: 'bia', conta_id: null, local_id: null, modo: 'integral', compareceu: true, checkin_confirmado: false } as Checkin,
    // 10/11: nao veio, mas fez o check-in na V3 -> check-in de credito
    { id: 'c2', dia_id: 'd2', player_id: 'bia', conta_id: null, local_id: 'v3', modo: 'checkin', compareceu: false, credito_checkin: true, checkin_confirmado: true } as Checkin]
  d.checkinPagamentos = [{ checkin_id: 'c1', valor_pago: 0, valor_devido: null, pagamento_confirmado: true, observacao: null } as AppData['checkinPagamentos'][number]]
  return d
}

test('jornada: a divida de 50 paga no 💰 com o check-in de credito + um check-in novo; o play pago em dinheiro', () => {
  const d = cenario()
  assert.equal(saldoDaAtleta(d, 'bia').saldo, -50)
  assert.equal(creditosDeCheckin(d, 'bia').length, 1)
  // 17/11, o 💰: integral (50) em dinheiro; a divida (50) com 2 check-ins de 25
  const lanc = prepararPagamento(d, d.checkinDias[2], 'bia', 'integral', 50)
  const plano = pagarDividas(d, 'bia', lanc.checkin.id, '2026-11-17',
    [{ date: '2026-11-17', contaId: null, localId: 'v3' }, { date: '2026-11-10', contaId: null, localId: null, credito: 'c2' }], 25, 0)
  assert.equal(plano.itens.length, 0, 'sem divida de mensalidade, nada na ficha')
  d.checkins.push(lanc.checkin)
  d.checkinPagamentos.push(lanc.pagamento)
  d.checkinAcertos.push(...plano.acertos)

  // saldo: tudo quitado, e o extrato, o saldo e o Excel contam o mesmo
  assert.equal(saldoDaAtleta(d, 'bia').saldo, 0)
  assert.equal(extratoDaAtleta(d, 'bia').at(-1)!.saldoDepois, 0)
  assert.equal(saldoAntesDe(d, 'bia'), 0)
  const abas = planilhasCompletas(d, (id) => id, '2026-11', '2026-11-18')
  const saldos = abas.find((a) => a.nome === 'Saldos')!.linhas
  assert.deepEqual(saldos[1].slice(6, 9), [{ reais: 0 }, { reais: 0 }, 'Em dia'])
  assert.equal(abas.find((a) => a.nome === 'Acertos')!.linhas.length, 3)

  // o credito foi gasto: some da lista e a trava do dia diz que ja foi usado
  assert.equal(creditosDeCheckin(d, 'bia').length, 0)
  assert.match(checkinJaFeito(d, 'bia', null, '2026-11-10')!.texto, /já foi gasto/)
  // o check-in novo da divida ocupa o dia na conta principal
  assert.match(checkinJaFeito(d, 'bia', null, '2026-11-17')!.texto, /dívida/)

  // cota da V3: o "nao veio" e o check-in novo da divida gastam; o uso do credito nao (12 - 2)
  assert.equal(disponibilidade(d, 'bia', '2026-11').porLocal.find((l) => l.local.id === 'v3')!.disponiveis, 10)
  // aluguel: a V3 abate os mesmos 2
  assert.equal(checkinsNaArena(d, 'v3', '2026-11'), 2)
  // relatorio da arena: os 3 dias, com o uso do credito marcado
  const v3 = planilhasDasArenas(relatorioDasArenas(d, { mes: '2026-11' }, (id) => id))[0].linhas
  assert.equal(v3.filter((l) => /\d\d\/\d\d\/\d{4}/.test(String(l[0]))).length, 3)

  // caixa: entrou so o dinheiro (50); check-in nao e receita
  assert.equal(resumoDoCaixa(d).find((r) => r.mes === '2026-11')!.receitasPlay, 50)

  // apagar o play de 17/11 desfaz o lancamento e os dois check-ins da divida: volta a dever 50 e o credito volta
  const des = desfazerDoPlay(d, d.sessions[0])
  assert.deepEqual(des.checkins, [idDoLancamento('d3', 'bia')])
  assert.deepEqual(new Set(des.acertos), new Set(plano.acertos.map((a) => a.id)))
  const depois = { ...d, checkins: d.checkins.filter((c) => !des.checkins.includes(c.id)), checkinAcertos: d.checkinAcertos.filter((a) => !des.acertos!.includes(a.id)), checkinDias: d.checkinDias.filter((x) => !des.dias.includes(x.id)) }
  assert.equal(saldoDaAtleta(depois, 'bia').saldo, -50)
  assert.equal(creditosDeCheckin(depois, 'bia').length, 1)
  assert.equal(checkinsNaArena(depois, 'v3', '2026-11'), 1)
})

test('jornada: pagar a mais vira credito, e o credito paga o play seguinte sozinho', () => {
  const d = cenario()
  const lanc = prepararPagamento(d, d.checkinDias[2], 'bia', 'integral', 120) // 50 do play + 50 da divida + 20 a mais
  d.checkins.push(lanc.checkin)
  d.checkinPagamentos.push(lanc.pagamento)
  assert.equal(saldoDaAtleta(d, 'bia').saldo, 20)
  // o check-in de credito continua livre (nao foi usado)
  assert.equal(creditosDeCheckin(d, 'bia').length, 1)
})

test('apagar um lancamento cujo check-in de credito ja pagou divida avisa; o lancamento com divida paga tambem', async () => {
  const { avisoAoApagarLancamentos } = await import('../src/lib/checkins')
  const d = cenario()
  assert.equal(avisoAoApagarLancamentos(d, ['c2']), '')
  const lanc = prepararPagamento(d, d.checkinDias[2], 'bia', 'integral', 50)
  d.checkinAcertos.push(...pagarDividas(d, 'bia', lanc.checkin.id, '2026-11-17', [{ date: '2026-11-10', contaId: null, localId: null, credito: 'c2' }], 25, 0).acertos)
  assert.match(avisoAoApagarLancamentos(d, ['c2']), /já foi usado para pagar dívida/)
  assert.match(avisoAoApagarLancamentos(d, [lanc.checkin.id]), /O check-in que pagou dívida junto com ele fica/)
})

test('Excel da arena: aluguel da V3 com os check-ins abatidos, o Pix e se bate com a lista; nada do financeiro', () => {
  const d = cenario()
  d.checkinLocais[0].nome = 'Arena V3'
  // dezembro paga os check-ins de novembro: a V3 cobrou 950, 5%, abateu 1 check-in (o "nao veio" de 10/11)
  d.caixa = [{ id: 'al', date: '2026-12-02', descricao: 'Aluguel dezembro', categoria: 'aluguel', tipo: 'saida', valor: 925, plano_mensal: true, valor_cobrado: 950, checkins_abatidos: 1, desconto: 0.05, created_at: '' }]
  const v3 = planilhasDasArenas(relatorioDasArenas(d, { mes: '2026-11' }, (id) => id), d, ['2026-11'])[0].linhas
  const txt = JSON.stringify(v3)
  assert.ok(!/dívida|devendo|pagou R\$/.test(txt), 'sem o financeiro da organizacao')
  assert.deepEqual(v3.find((l) => l[0] === 'Pendentes (ainda a confirmar)'), ['Pendentes (ainda a confirmar)', 0])
  const al = v3.find((l) => l[1] === 'Aluguel dezembro')!
  assert.deepEqual(al.slice(2), ['Mensal (contratado)', { reais: 950 }, 5, 'Novembro de 2026', 1, { reais: 25 }, { reais: 925 }, 1, 'Sim'])
  // um check-in novo na V3 depois do aluguel: a conta deixa de bater e a planilha diz quanto
  d.checkinAcertos.push({ id: 'divida:x:0', player_id: 'bia', date: '2026-11-20', valor: 25, dinheiro: false, descricao: '', created_at: '', conta_id: null, local_id: 'v3' })
  const de2 = planilhasDasArenas(relatorioDasArenas(d, { mes: '2026-11' }, (id) => id), d, ['2026-11'])[0].linhas.find((l) => l[1] === 'Aluguel dezembro')!
  assert.equal(de2.at(-1), 'Não: 1 a mais na lista')
})
