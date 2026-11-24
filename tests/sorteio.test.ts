import test from 'node:test'
import assert from 'node:assert/strict'
import { chances, concorrentes, fitaDaRoleta, pesoNoSorteio, sortear } from '../src/lib/sorteio'

test('sem bônus todas iguais; com bônus 1ª > 2ª > 3ª > resto', () => {
  assert.equal(pesoNoSorteio(1, 0), 1)
  assert.equal(pesoNoSorteio(1, 60), 1.6)
  assert.equal(pesoNoSorteio(2, 60), 1.4)
  assert.ok(Math.abs(pesoNoSorteio(3, 60) - 1.2) < 1e-9)
  assert.equal(pesoNoSorteio(4, 60), 1)
  const c = chances(['a', 'b', 'c', 'd'], new Map([['a', 1], ['b', 2], ['c', 3]]), 60)
  const soma = [...c.values()].reduce((s, x) => s + x, 0)
  assert.ok(Math.abs(soma - 1) < 1e-9)
  assert.ok(c.get('a')! > c.get('b')! && c.get('b')! > c.get('c')! && c.get('c')! > c.get('d')!)
})

test('sortear segue os pesos (rnd fixo) e a frequência bate com a chance', () => {
  const col = new Map([['a', 1]])
  assert.equal(sortear(['a', 'b'], col, 100, () => 0), 'a')
  assert.equal(sortear(['a', 'b'], col, 100, () => 0.99), 'b')
  assert.equal(sortear([], col, 0), null)
  let s = 7
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  let a = 0
  for (let i = 0; i < 20000; i++) if (sortear(['a', 'b'], col, 100, rnd) === 'a') a++
  assert.ok(Math.abs(a / 20000 - 2 / 3) < 0.02)
})

test('quem ganhou sai, salvo se pode repetir; a fita tem a vencedora no alvo', () => {
  assert.deepEqual(concorrentes(['a', 'b', 'c'], ['b'], false), ['a', 'c'])
  assert.deepEqual(concorrentes(['a', 'b', 'c'], ['b'], true), ['a', 'b', 'c'])
  const f = fitaDaRoleta(['a', 'b', 'c'], 'c', 30, 25)
  assert.equal(f.length, 30)
  assert.equal(f[25], 'c')
  // ciclo: em qualquer janela de n seguidas, todas diferentes (ninguem reaparece logo depois de passar)
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  for (let k = 0; k < 50; k++) {
    const g = fitaDaRoleta(ids, ids[k % 7], 64, 54)
    assert.equal(g[54], ids[k % 7])
    for (let i = 0; i + 7 <= 64; i++) assert.equal(new Set(g.slice(i, i + 7)).size, 7)
  }
  assert.deepEqual(fitaDaRoleta(['x'], 'x', 5, 3), ['x', 'x', 'x', 'x', 'x'])
})

test('freadas: só andam para frente, nunca voltam, e param dentro da sorteada (longe da borda)', async () => {
  const { FREADAS, posicaoNaFreada } = await import('../src/lib/sorteio')
  assert.ok(FREADAS.length >= 75)
  assert.equal(new Set(FREADAS.map((f) => f.nome)).size, FREADAS.length)
  assert.ok(!FREADAS.some((f) => f.nome.includes('volta')))
  const c0 = -52 * 104
  for (const f of FREADAS) {
    for (let k = 0; k < 40; k++) {
      const trechos = f.trechos()
      let antes = c0
      for (let ms = 0; ; ms += 16) {
        const r = posicaoNaFreada(c0, trechos, ms)
        assert.ok(r.c >= antes - 1e-9, `${f.nome} voltou em ${ms} ms`)
        antes = r.c
        if (r.acabou) break
      }
      assert.ok(antes >= -45 && antes <= 45, `${f.nome} parou em ${antes.toFixed(1)}`)
      const total = trechos.reduce((s, t) => s + t.ms, 0)
      assert.ok(total >= 2000 && total <= 16500, `${f.nome} dura ${total} ms`)
    }
  }
})
