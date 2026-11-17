import assert from 'node:assert/strict'
import test from 'node:test'
import { entradasDosEventos, resumoDoCaixa, saidasDosEventos, saldoDosEventosEm } from '../src/lib/checkins'
import { emptyData, type LancamentoDeCaixa } from '../src/lib/types'

const l = (id: string, date: string, extra: Partial<LancamentoDeCaixa>): LancamentoDeCaixa => ({
  id, date, descricao: '', categoria: 'outra', tipo: 'saida', valor: 0, created_at: date, ...extra,
})

test('caixinha na mão: transferir e devolver não são receita nem despesa; entrada externa é receita extra', () => {
  const data = emptyData()
  data.caixa = [
    l('receita', '2026-12-01', { categoria: 'extra', tipo: 'entrada', valor: 500 }),
    l('guardar', '2026-12-02', { valor: 200, transferencia: true }),
    l('rifa', '2026-12-03', { categoria: 'extra', tipo: 'entrada', valor: 50, do_eventos: true }),
    l('devolver', '2026-12-04', { tipo: 'entrada', valor: 30, transferencia: true }),
  ]
  const [r] = resumoDoCaixa(data)
  assert.equal(r.receitasExtras, 550) // a rifa entra como receita; a devolucao nao
  assert.equal(r.despesaTotal, 0) // a transferencia nao e despesa
  assert.equal(r.saldoAcumulado, 550)
  assert.equal(r.eventosAcumulado, 220) // 200 + 50 - 30
  assert.equal(r.transferido, 170) // 200 guardados - 30 devolvidos
  assert.equal(r.saldoAcumulado - r.eventosAcumulado, 330) // livre no caixa
  assert.deepEqual(entradasDosEventos(data).map((e) => [e.origem, e.valor]), [['externa', 50], ['transferencia', 200]])
  assert.equal(saldoDosEventosEm(data, '2026-12-03'), 250)
})

test('caixinha na mão: gasto que passa da caixinha sai do caixa geral; desfazer a transferência refaz a conta', () => {
  const data = emptyData()
  data.caixa = [
    l('receita', '2026-12-01', { categoria: 'extra', tipo: 'entrada', valor: 500 }),
    l('guardar', '2026-12-02', { valor: 100, transferencia: true }),
    l('festa', '2026-12-05', { categoria: 'confraternizacao', valor: 150, do_eventos: true }),
  ]
  const [festa] = saidasDosEventos(data)
  assert.deepEqual([festa.coberto, festa.resto], [100, 50])
  assert.equal(resumoDoCaixa(data)[0].confraternizacao, 150) // o gasto inteiro na despesa
  assert.equal(resumoDoCaixa(data)[0].eventosAcumulado, 0)
  // desfazer a transferencia (apagar o lancamento): a festa sai toda do caixa geral, a caixinha nao fica negativa
  data.caixa = data.caixa.filter((x) => x.id !== 'guardar')
  assert.deepEqual(saidasDosEventos(data).map((x) => [x.coberto, x.resto]), [[0, 150]])
  assert.equal(resumoDoCaixa(data)[0].eventosAcumulado, 0)
})

test('caixinha na mão: devolver mais do que a caixinha tem só libera o que ela tem', () => {
  const data = emptyData()
  data.caixa = [
    l('guardar', '2026-12-02', { valor: 40, transferencia: true }),
    l('devolver', '2026-12-04', { tipo: 'entrada', valor: 100, transferencia: true }),
  ]
  const [r] = resumoDoCaixa(data)
  assert.equal(r.eventosAcumulado, 0)
  assert.equal(r.transferido, 0)
  assert.equal(r.saldoAcumulado, 0)
})
