import test from 'node:test'
import assert from 'node:assert/strict'
import { idDoLancamento, naoPago, pendentesDaLista, prepararPagamento } from '../src/lib/pagamentoNaLista'
import { saldoDaAtleta, statusDoCheckin, disponibilidade } from '../src/lib/checkins'
import type { Lista } from '../src/lib/listaDePresenca'
import { emptyData, type AppData, type Player } from '../src/lib/types'

/* O DIA DA LISTA ANDA COM ELA (dono, 19/11): a 1a avulsa cria o dia, cada avulsa entra pendente ("não pago"),
 * quem sai some se nao pagou, e o 💰 grava confirmado ou nao (o que fica "verificar"). */
const lista: Lista = { id: 'L1', codigo: 'x', titulo: 'Play', play_em: '2026-11-23T23:00:00Z', fecha_em: '2026-11-23T20:00:00Z', vagas: 16, texto: null, fechada: false, session_id: null, created_at: '' }
const p = (id: string, categoria: string, extra: Partial<Player> = {}) => ({ id, name: id, categoria, active: true, ...extra }) as Player

function cenario(): AppData {
  const d = emptyData()
  d.players = [p('ana', 'avulsa'), p('bia', 'avulsa'), p('isa', 'isenta'), p('paga', 'avulsa', { pago_avulso: true })]
  d.checkinLocais = [{ id: 'v3', nome: 'Arena V3', ordem: 0, ativo: true } as AppData['checkinLocais'][number]]
  return d
}
const aplicar = (d: AppData, r: ReturnType<typeof pendentesDaLista>) => {
  if (r.dia) d.checkinDias.push(r.dia)
  d.checkins.push(...r.gravar)
  d.checkins = d.checkins.filter((c) => !r.apagar.includes(c.id))
}

test('só isenta (ou paga por fora): nenhum dia', () => {
  const r = pendentesDaLista(cenario(), lista, [{ player_id: 'isa' }, { player_id: 'paga' }, { player_id: null }])
  assert.deepEqual(r, { dia: null, gravar: [], apagar: [] })
})

test('a 1ª avulsa cria o dia e entra integral, sem pagamento: não pago e devendo o cheio, sem gastar cota', () => {
  const d = cenario()
  const r = pendentesDaLista(d, lista, [{ player_id: 'isa' }, { player_id: 'ana', substitui: 'mari' }])
  assert.equal(r.dia?.date, '2026-11-23')
  assert.equal(r.gravar.length, 1)
  aplicar(d, r)
  const c = d.checkins[0]
  assert.equal(c.id, idDoLancamento(r.dia!.id, 'ana'))
  assert.equal(c.modo, 'integral')
  assert.equal(c.substitui, 'mari')
  assert.ok(naoPago(d, c))
  assert.equal(saldoDaAtleta(d, 'ana').saldo, -50)
  assert.equal(disponibilidade(d, 'ana', '2026-11').porLocal.find((l) => l.local.id === 'v3')!.disponiveis, 12)
  // de novo: nada a fazer (idempotente, dois celulares gravam o mesmo)
  assert.deepEqual(pendentesDaLista(d, lista, [{ player_id: 'ana' }]), { dia: null, gravar: [], apagar: [] })
})

test('saiu das confirmadas: a pendente sai; com pagamento lançado, fica', () => {
  const d = cenario()
  aplicar(d, pendentesDaLista(d, lista, [{ player_id: 'ana' }, { player_id: 'bia' }]))
  const dia = d.checkinDias[0]
  // Bia pagou pelo 💰, sem confirmar: verificar (não "não pago")
  const lanc = prepararPagamento(d, dia, 'bia', 'checkin', 25, { contaId: null, localId: 'v3' }, { pagamento: false, checkin: false })
  d.checkins = d.checkins.map((c) => (c.id === lanc.checkin.id ? lanc.checkin : c))
  d.checkinPagamentos.push(lanc.pagamento)
  assert.equal(lanc.pagamento.pagamento_confirmado, false)
  assert.equal(lanc.checkin.checkin_confirmado, false)
  assert.equal(naoPago(d, lanc.checkin), false)
  assert.equal(statusDoCheckin(lanc.checkin, lanc.pagamento, true), 'verificar')
  // as duas saem da lista: só a Ana (sem pagamento) sai do dia
  const r = pendentesDaLista(d, lista, [])
  assert.deepEqual(r.apagar, [idDoLancamento(dia.id, 'ana')])
  assert.equal(r.gravar.length, 0)
})

test('confirmado nos dois: regularizado; play já montado: a lista não mexe mais', () => {
  const d = cenario()
  aplicar(d, pendentesDaLista(d, lista, [{ player_id: 'ana' }]))
  const lanc = prepararPagamento(d, d.checkinDias[0], 'ana', 'checkin', 25, { contaId: null, localId: 'v3' }, { pagamento: true, checkin: true })
  assert.equal(statusDoCheckin(lanc.checkin, lanc.pagamento, true), 'regularizado')
  // sem o 7º argumento continua confirmado (quem já chamava assim)
  assert.equal(prepararPagamento(d, d.checkinDias[0], 'ana', 'integral', 50).pagamento.pagamento_confirmado, true)
  assert.deepEqual(pendentesDaLista(d, { ...lista, session_id: 's1' }, []), { dia: null, gravar: [], apagar: [] })
})
