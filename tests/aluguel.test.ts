import assert from 'node:assert/strict'
import test from 'node:test'
import { caixaDeEventos, checkinsNaArena, contaDoAluguel } from '../src/lib/aluguel'
import { LOCAIS_INICIAIS } from '../src/lib/checkins'
import { emptyData, type Checkin } from '../src/lib/types'

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

test('caixa de eventos soma somente as economias dos aluguéis', () => {
  const aluguel = contaDoAluguel({ valorNoPlano: 90.09, desconto: 0.1, checkinsMesAnterior: 2, valorPorCheckin: 12.34 })
  assert.deepEqual(aluguel, { semPlano: 100.1, economia: 10.01, credito: 24.68, pagarNoPix: 65.41 })
  assert.equal(caixaDeEventos([aluguel, { economia: 96 }]), 106.01)
  assert.equal(caixaDeEventos([]), 0)
})
