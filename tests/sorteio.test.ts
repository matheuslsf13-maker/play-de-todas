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
  assert.deepEqual(fitaDaRoleta(['x'], 'x', 5, 3), ['x', 'x', 'x', 'x', 'x'])
})
