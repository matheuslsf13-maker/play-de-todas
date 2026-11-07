import assert from 'node:assert/strict'
import test from 'node:test'
import { checkinsNaArena, contaDoAluguel } from '../src/lib/aluguel'
import { LOCAIS_INICIAIS, economiaDoAluguel, resumoDoCaixa } from '../src/lib/checkins'
import { emptyData, type Checkin, type LancamentoDeCaixa } from '../src/lib/types'

test('aluguel de janeiro: check-ins da V3 em dezembro (sem contar o uso do crédito) e o exemplo do dono', () => {
  const data = emptyData()
  data.checkinLocais = LOCAIS_INICIAIS
  const [v3, outra] = data.checkinLocais
  data.checkinDias = ['2026-12-03', '2026-12-10', '2027-01-07'].map((date) => ({
    id: date, date, session_id: null, titulo: null, valor_cheio: 50, valor_com_checkin: 20, created_at: '',
  }))
  const play = (id: string, extra: Partial<Checkin> = {}): Checkin => ({
    id, dia_id: '2026-12-03', player_id: id, local_id: v3.id, conta_id: null,
    modo: 'checkin', compareceu: true, checkin_confirmado: true, created_at: '', ...extra,
  })
  data.checkins = [
    ...Array.from({ length: 7 }, (_, i) => play(String(i))),
    play('origem', { compareceu: false, credito_checkin: true }),
    play('uso', { player_id: 'origem', dia_id: '2026-12-10', credito_de: 'origem' }),
    play('fora-da-v3', { local_id: outra.id }),
    play('outro-mes', { dia_id: '2027-01-07' }),
    play('integral', { modo: 'integral' }),
  ]
  data.mensalidadeItens = [{
    id: 'item', player_id: 'bia', tipo: 'checkin', date: '2026-12-15', mes: '2027-01',
    local_id: v3.id, conta_id: null, confirmado: true, valor: null, observacao: null, created_at: '',
  }]
  // 7 plays + o "nao veio, mas fez o check-in" + o da mensalidade; o USO do credito nao e check-in novo
  assert.equal(checkinsNaArena(data, v3.id, '2026-12'), 9)
  // o exemplo do dono: 10 check-ins no mes anterior
  assert.deepEqual(contaDoAluguel({ valorNoPlano: 1824, checkinsMesAnterior: 10 }), {
    semPlano: 1920, economia: 96, credito: 250, pagarNoPix: 1574,
  })
})

test('crédito acima do aluguel zera o Pix e devolve só o excedente', () => {
  assert.deepEqual(contaDoAluguel({ valorNoPlano: 95, checkinsMesAnterior: 4 }), {
    semPlano: 100, economia: 5, credito: 100, pagarNoPix: 0, sobraDeCredito: 5,
  })
})

test('mês sem check-ins paga exatamente o valor do plano', () => {
  const data = emptyData()
  data.checkinLocais = LOCAIS_INICIAIS
  const quantidade = checkinsNaArena(data, data.checkinLocais[0].id, '2026-12')
  assert.equal(quantidade, 0)
  assert.deepEqual(contaDoAluguel({ valorNoPlano: 99.99, checkinsMesAnterior: quantidade }), {
    semPlano: 105.25, economia: 5.26, credito: 0, pagarNoPix: 99.99,
  })
})

test('caixa de eventos: a economia dos alugueis no plano mensal, acumulada no resumo', () => {
  const data = emptyData()
  const aluguel = (id: string, date: string, extra: Partial<LancamentoDeCaixa>): LancamentoDeCaixa => ({
    id, date, descricao: '', categoria: 'aluguel', tipo: 'saida', valor: 1574, created_at: '', ...extra,
  })
  data.caixa = [
    aluguel('dez', '2026-12-10', { plano_mensal: true, valor_cobrado: 1824, checkins_abatidos: 10 }),
    aluguel('jan', '2027-01-10', { plano_mensal: false, valor_cobrado: 1920 }),
    aluguel('fev', '2027-02-10', { plano_mensal: true, valor_cobrado: 1824 }),
  ]
  assert.equal(economiaDoAluguel(data.caixa[0]), 96)
  assert.equal(economiaDoAluguel(data.caixa[1]), 0)
  const r = resumoDoCaixa(data)
  assert.deepEqual(r.map((x) => [x.eventos, x.eventosAcumulado, x.aluguel]), [[96, 96, 1574], [0, 96, 1574], [96, 192, 1574]])
})

test('substituta: metade do valor cheio do dia vai para o caixa de eventos', () => {
  const data = emptyData()
  data.checkinDias = [{ id: 'd', date: '2026-12-07', session_id: null, titulo: null, valor_cheio: 50, valor_com_checkin: 25, created_at: '' }]
  const c = (id: string, extra: Partial<Checkin>): Checkin => ({
    id, dia_id: 'd', player_id: id, conta_id: null, local_id: null, modo: 'integral', compareceu: true, checkin_confirmado: false, created_at: '', ...extra,
  })
  data.checkins = [c('sub', { substitui: 'mensalista' }), c('normal', {}), c('nao-veio', { substitui: 'mensalista', compareceu: false })]
  assert.deepEqual(resumoDoCaixa(data).map((r) => [r.eventos, r.eventosAcumulado]), [[25, 25]])
})
