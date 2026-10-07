import { test } from 'node:test'
import assert from 'node:assert/strict'
import { caminho, livre, objetosNaFrente, OBJETOS, yDaFrente } from '../src/lib/hall/mundo'
import { horaDoHall, MINUTOS_POR_DIA, noite } from '../src/lib/hall/relogio'

const corpo = (x: number, y: number) => ({ x0: x - 45, y0: y - 136, x1: x + 45, y1: y + 12 })

test('o caminho do deck ate a praia so pisa no chao livre', () => {
  const de = { x: 260, y: 340 }
  const para = { x: 700, y: 760 }
  const rota = caminho(de, para)
  assert.ok(rota.length > 1, 'tem que contornar a mesa e descer a escada')
  for (const p of rota) assert.ok(livre(p), `ponto fora do chao: ${p.x},${p.y}`)
  const fim = rota[rota.length - 1]
  assert.ok(Math.hypot(fim.x - para.x, fim.y - para.y) < 12)
})

test('ninguem atravessa a mesa: o caminho de um lado ao outro da a volta', () => {
  const rota = caminho({ x: 300, y: 330 }, { x: 540, y: 340 })
  const mesa = OBJETOS.find((o) => o.id === 'mesa')!
  for (let i = 1; i < rota.length; i++) {
    const a = rota[i - 1]
    const b = rota[i]
    for (let t = 0; t <= 1; t += 0.05) assert.ok(livre({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }), `cortou ${mesa.id}`)
  }
})

test('atras da mesa, o recorte da mesa fica na frente dela; na frente, nao', () => {
  const atras = objetosNaFrente({ x: 420, y: 345 }, corpo(420, 345)).map((o) => o.id)
  assert.ok(atras.includes('mesa'))
  const naFrente = objetosNaFrente({ x: 290, y: 412 }, corpo(290, 412)).map((o) => o.id)
  assert.ok(!naFrente.includes('planta-deck-esq'))
})

test('a linha do pe do objeto e interpolada e fica presa nas pontas', () => {
  const mesa = OBJETOS.find((o) => o.id === 'mesa')!
  assert.equal(yDaFrente(mesa, 420), 442)
  assert.equal(yDaFrente(mesa, 0), mesa.frente[0][1])
  assert.equal(yDaFrente(mesa, 2000), mesa.frente[mesa.frente.length - 1][1])
})

test('o dia do Hall passa acelerado e escurece aos poucos', () => {
  const dia = MINUTOS_POR_DIA * 60_000
  assert.equal(horaDoHall(0), 8)
  assert.ok(Math.abs(horaDoHall(dia / 2) - 20) < 1e-9)
  assert.equal(noite(12), 0)
  assert.equal(noite(22), 1)
  assert.ok(noite(18) > 0 && noite(18) < 1, 'por do sol e gradual')
  assert.equal(noite(22, 'dia'), 0)
  assert.equal(noite(12, 'noite'), 1)
})
