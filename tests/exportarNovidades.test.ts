import test from 'node:test'
import assert from 'node:assert/strict'
import { planilhasCompletas } from '../src/lib/exportarCheckins'
import { emptyData, type Player } from '../src/lib/types'

/* O Excel completo traz o que entrou em novembro/2026: aluguel detalhado, substituta e a aba Mensalistas (limite e fila). */
const p = (id: string, extra: Partial<Player> = {}) => ({ id, name: id, active: true, categoria: 'avulsa', ...extra }) as Player

test('Pagamentos detalha o aluguel (cobrado, plano, check-ins abatidos, caixa de eventos)', () => {
  const d = emptyData()
  d.caixa = [{ id: 'a', date: '2026-11-08', descricao: 'Aluguel', categoria: 'aluguel', tipo: 'saida', valor: 800, plano_mensal: true, valor_cobrado: 950, checkins_abatidos: 6, created_at: '' }]
  const pg = planilhasCompletas(d, (id) => id, null, '2026-11-08').find((a) => a.nome === 'Pagamentos')!.linhas
  assert.equal(pg[0].length, pg[1].length)
  assert.deepEqual(pg[1].slice(5), [{ reais: 950 }, 'Sim', 6, { reais: 50 }])
})

test('aba Mensalistas: limite, vagas, deve/credito e a lista de espera', () => {
  const d = emptyData()
  d.players = [p('ana', { categoria: 'mensalista' }), p('bia', { espera_mensalista: '2026-11-07T12:00:00Z' })]
  d.ajustes = [{ id: 'limite_mensalistas', valor: 1, updated_at: '' }]
  const abas = planilhasCompletas(d, (id) => id, null, '2026-11-08')
  const m = abas.find((a) => a.nome === 'Mensalistas')!.linhas
  assert.deepEqual(m[0], ['Limite de mensalistas', 1, 'Ocupadas', 1, 'Vagas livres', 0, 'Na lista de espera', 1])
  assert.equal(m[3][0], 'ana')
  assert.ok(m.some((l) => l[0] === 'bia' && l[1] === '1º'))
})
