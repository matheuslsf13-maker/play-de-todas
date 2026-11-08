import { useState, type ReactNode } from 'react'
import { useArrastarNoGrafico } from './ReguaDeForca'
import { chanceDeVitoria, textoDaForma, type Confronto, type PlacarDosConfrontos, type PontoComparado } from '../lib/comparar'
import { dateLabel } from '../lib/types'

/*
 * As pecas do comparador (atleta x atleta e dupla x dupla), no visual do Desempenho. A cor e sempre a mesma: verde
 * (--teal) e o lado A, rosa (--pink) e o lado B.
 */
const COR_A = 'var(--teal)'
const COR_B = 'var(--pink)'

/** "02/11" a partir de uma data ISO. */
export const diaMes = (iso: string) => dateLabel(iso).slice(0, 5)

export function Cartao({ titulo, explicacao, children }: { titulo: string; explicacao?: string; children: ReactNode }) {
  return (
    <div className="cp-cartao">
      <div className="cp-rotulo">{titulo}</div>
      {explicacao && <p className="cp-sub">{explicacao}</p>}
      {children}
    </div>
  )
}

/** O placar grande de um confronto (vitorias de cada lado) com a barra de quem venceu mais. */
export function PlacarGrande({ a, b, legenda }: { a: number; b: number; legenda: string }) {
  return (
    <>
      <div className="cp-placar">
        <b style={{ color: COR_A }}>{a}</b>
        <i>×</i>
        <b style={{ color: COR_B }}>{b}</b>
      </div>
      {a + b > 0 && (
        <div className="cp-dom" aria-hidden="true">
          {a > 0 && <i style={{ flex: a, background: COR_A }} />}
          {b > 0 && <i style={{ flex: b, background: COR_B }} />}
        </div>
      )}
      <div className="cp-legenda">{legenda}</div>
    </>
  )
}

/** A frase do confronto direto: quem venceu mais e os games de cada lado. */
export function legendaDoConfronto(p: PlacarDosConfrontos, nomeA: string, nomeB: string, total: number): string {
  if (total === 0) return 'ainda não se enfrentaram'
  const lider = p.vitoriasA > p.vitoriasB ? `${nomeA} venceu` : p.vitoriasB > p.vitoriasA ? `${nomeB} venceu` : 'empatados:'
  const n = Math.max(p.vitoriasA, p.vitoriasB)
  const frase = p.vitoriasA === p.vitoriasB ? `${lider} ${n} para cada` : `${lider} ${n} de ${total}`
  return `${frase} · games ${p.gamesA} × ${p.gamesB}`
}

/** Cada partida do confronto: os dois times, o placar e o vencedor em destaque. */
export function ListaDeConfrontos({ lista, nomeDe, limite = 3 }: { lista: Confronto[]; nomeDe: (t: [string, string]) => string; limite?: number }) {
  const [todos, setTodos] = useState(false)
  // da mais recente para a mais antiga
  const ordenada = [...lista].reverse()
  const vistos = todos ? ordenada : ordenada.slice(0, limite)
  if (lista.length === 0) return null
  return (
    <>
      <div className="cp-confrontos">
        {vistos.map((c) => (
          <div key={c.id} className="cp-confronto">
            <span className="cp-data">{diaMes(c.date)}</span>
            <span className={`cp-time ${c.venceuA ? 'ganhou' : ''}`}>{nomeDe(c.timeA)}</span>
            <span className="cp-pilula">{c.gamesA}×{c.gamesB}</span>
            <span className={`cp-time dir ${c.venceuA ? '' : 'ganhou-b'}`}>{nomeDe(c.timeB)}</span>
          </div>
        ))}
      </div>
      {ordenada.length > limite && (
        <button type="button" className="cp-ver-mais" aria-expanded={todos} onClick={() => setTodos(!todos)}>
          {todos ? 'Recolher' : `Ver os ${ordenada.length} confrontos`} <i>{todos ? '▴' : '▾'}</i>
        </button>
      )}
    </>
  )
}

export type LinhaDeBarra = { nome: string; a: number | null; b: number | null; textoA?: string; textoB?: string }

/** Frente a frente: barras espelhadas; a cor e de quem esta na frente (comparacao numerica, nunca de texto). */
export function BarrasDeComparacao({ linhas }: { linhas: LinhaDeBarra[] }) {
  return (
    <div>
      {linhas.map((l) => {
        const tem = l.a !== null && l.b !== null
        const maior = tem ? Math.max(Math.abs(l.a as number), Math.abs(l.b as number)) || 1 : 1
        const pa = tem ? (Math.abs(l.a as number) / maior) * 100 : 0
        const pb = tem ? (Math.abs(l.b as number) / maior) * 100 : 0
        const aFrente = tem && (l.a as number) > (l.b as number)
        const bFrente = tem && (l.b as number) > (l.a as number)
        return (
          <div key={l.nome} className="cp-barra">
            <span className="cp-valor" style={{ color: aFrente ? COR_A : undefined }}>{l.textoA ?? l.a ?? '—'}</span>
            <span>
              <span className="cp-nome-barra">{l.nome}</span>
              <span className="cp-trilho">
                <i className={aFrente ? 'a' : ''}><u style={{ width: `${pa}%` }} /></i>
                <i className={bFrente ? 'b' : ''}><u style={{ width: `${pb}%` }} /></i>
              </span>
            </span>
            <span className="cp-valor dir" style={{ color: bFrente ? COR_B : undefined }}>{l.textoB ?? l.b ?? '—'}</span>
          </div>
        )
      })}
      <div className="cp-legenda" style={{ textAlign: 'left', marginTop: 6 }}>A cor é de quem está na frente.</div>
    </div>
  )
}

/** As ultimas partidas de cada lado, da mais antiga para a mais nova; o anel marca a ultima. */
export function FormaRecente({ nomeA, ra, nomeB, rb }: { nomeA: string; ra: boolean[]; nomeB: string; rb: boolean[] }) {
  const lado = (nome: string, r: boolean[]) => (
    <div className="cp-forma-lado">
      <div className="cp-forma-nome">{nome}</div>
      <div className="cp-bolinhas" aria-label={textoDaForma(r)}>
        {r.map((v, i) => (
          <i key={i} className={`${v ? 'v' : 'd'}${i === r.length - 1 ? ' ultima' : ''}`}>{v ? 'V' : 'D'}</i>
        ))}
      </div>
      <small>{textoDaForma(r)}</small>
    </div>
  )
  return (
    <div className="cp-forma">
      {lado(nomeA, ra)}
      {lado(nomeB, rb)}
    </div>
  )
}

/** Quem esta na frente em cada ponto: verde = A, rosa = B (so entre pontos com as duas notas). */
function faixaDaFrente(pontos: PontoComparado[]): { cor: string; i: number }[] {
  return pontos.filter((p) => p.a !== null && p.b !== null).map((p, i) => ({ i, cor: (p.a as number) > (p.b as number) ? COR_A : (p.a as number) < (p.b as number) ? COR_B : 'var(--muted)' }))
}

/**
 * A forca das duas ao longo dos plays: cada linha e uma (verde = A, rosa = B). Tocar ou arrastar escolhe um play e o
 * balao mostra as duas notas; o numero final de cada linha fica na cor dela. `comFaixa` desenha embaixo quem estava
 * na frente em cada play.
 */
export function GraficoComparado({
  pontos,
  nomeA,
  nomeB,
  curtoA,
  curtoB,
  comFaixa,
}: {
  pontos: PontoComparado[]
  nomeA: string
  nomeB: string
  curtoA: string
  curtoB: string
  comFaixa?: boolean
}) {
  const [tocado, setTocado] = useState<number | null>(null)
  const W = 320
  const H = 160
  const mE = 34
  const mD = 46
  const mT = 40
  const mB = 14
  const arrastar = useArrastarNoGrafico({ n: pontos.length, larguraDoDesenho: W, esq: mE, dir: mD, larguraTotal: W, tocado, setTocado })
  const notas = pontos.flatMap((p) => [p.a, p.b]).filter((v): v is number => v !== null)
  if (pontos.length < 2 || notas.length < 2) {
    return <p className="cp-legenda">O gráfico aparece depois de mais um play.</p>
  }
  const min = Math.min(...notas) - 8
  const max = Math.max(...notas) + 8
  const x = (i: number) => mE + (i * (W - mE - mD)) / (pontos.length - 1)
  const y = (v: number) => mT + ((max - v) * (H - mT - mB)) / Math.max(1, max - min)
  const traco = (campo: 'a' | 'b') => {
    let d = ''
    pontos.forEach((p, i) => {
      const v = p[campo]
      if (v === null) return
      d += `${d ? ' L' : 'M'} ${x(i)} ${y(v)}`
    })
    return d
  }
  // as linhas de apoio: multiplos de 50 dentro da escala
  const marcas: number[] = []
  for (let v = Math.ceil(min / 50) * 50; v <= max; v += 50) marcas.push(v)
  const ultimo = (campo: 'a' | 'b') => {
    for (let i = pontos.length - 1; i >= 0; i--) if (pontos[i][campo] !== null) return { i, v: pontos[i][campo] as number }
    return null
  }
  const fa = ultimo('a')
  const fb = ultimo('b')
  const sel = tocado !== null ? pontos[tocado] : null
  const larguraDoBalao = 150
  const bx = tocado !== null ? Math.max(mE, Math.min(W - mD - larguraDoBalao + 20, x(tocado) - larguraDoBalao / 2)) : 0
  const faixa = faixaDaFrente(pontos)
  const aFrente = faixa.filter((f) => f.cor === COR_A).length

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Força de ${nomeA} e de ${nomeB} ao longo dos plays`} style={{ display: 'block', overflow: 'visible', touchAction: 'pan-y' }} {...arrastar}>
        {marcas.map((v) => (
          <g key={v}>
            <line x1={mE} x2={W - mD} y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x={mE - 6} y={y(v) + 3} textAnchor="end" fontSize="9.5" fill="var(--muted)">{v}</text>
          </g>
        ))}
        <path d={traco('b')} fill="none" stroke={COR_B} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        <path d={traco('a')} fill="none" stroke={COR_A} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        {fa && <circle cx={x(fa.i)} cy={y(fa.v)} r={4.4} fill={COR_A} />}
        {fb && <circle cx={x(fb.i)} cy={y(fb.v)} r={4.4} fill={COR_B} />}
        {fa && <text x={x(fa.i) + 9} y={y(fa.v) + 3.5} fontSize="11" fontWeight={800} fill={COR_A}>{fa.v}</text>}
        {fb && <text x={x(fb.i) + 9} y={y(fb.v) + 4} fontSize="11" fontWeight={800} fill={COR_B}>{fb.v}</text>}
        {sel && tocado !== null && (
          <g style={{ pointerEvents: 'none' }}>
            <line x1={x(tocado)} x2={x(tocado)} y1={mT - 4} y2={H - mB} stroke="var(--muted)" strokeDasharray="2 3" />
            {sel.a !== null && <circle cx={x(tocado)} cy={y(sel.a)} r={5} fill={COR_A} stroke="var(--card)" strokeWidth={2} />}
            {sel.b !== null && <circle cx={x(tocado)} cy={y(sel.b)} r={5} fill={COR_B} stroke="var(--card)" strokeWidth={2} />}
            <rect x={bx} y={2} width={larguraDoBalao} height={32} rx={10} fill="var(--card-2)" stroke="var(--line-2)" />
            <text x={bx + larguraDoBalao / 2} y={14} textAnchor="middle" fontSize="9" fill="var(--muted)">{diaMes(sel.date)}</text>
            <text x={bx + larguraDoBalao / 2} y={27} textAnchor="middle" fontSize="11" fontWeight={800}>
              <tspan fill={COR_A}>{curtoA} {sel.a ?? '—'}</tspan>
              <tspan fill="var(--muted)">  ·  </tspan>
              <tspan fill={COR_B}>{curtoB} {sel.b ?? '—'}</tspan>
            </text>
          </g>
        )}
      </svg>
      {comFaixa && faixa.length > 0 && (
        <>
          <div className="cp-faixa" aria-hidden="true">
            {faixa.map((f) => <i key={f.i} style={{ background: f.cor }} />)}
          </div>
          <p className="cp-legenda" style={{ textAlign: 'left', marginTop: 6 }}>
            Quem estava na frente em cada play: verde = {nomeA}, rosa = {nomeB}. {nomeA} ficou à frente em {aFrente} de {faixa.length}.
          </p>
        </>
      )}
      <div className="cp-chaves">
        <span><i style={{ background: COR_A }} />{nomeA} {fa && <b>{fa.v}</b>}</span>
        <span><i style={{ background: COR_B }} />{nomeB} {fb && <b>{fb.v}</b>}</span>
      </div>
    </div>
  )
}

/** A chance de cada lado numa partida entre os dois, pela forca de hoje (estimativa, nao promessa). */
export function ChanceEmQuadra({ notaA, notaB, nomeA, nomeB, aviso }: { notaA: number; notaB: number; nomeA: string; nomeB: string; aviso: string }) {
  const a = chanceDeVitoria(notaA, notaB)
  return (
    <>
      <div className="cp-chance" aria-label={`${nomeA} ${a}%, ${nomeB} ${100 - a}%`}>
        <div style={{ width: `${a}%`, background: 'var(--teal-suave)', color: COR_A }}>{nomeA} {a}%</div>
        <div style={{ width: `${100 - a}%`, background: 'var(--pink-suave)', color: COR_B, justifyContent: 'flex-end' }}>{100 - a}% {nomeB}</div>
      </div>
      <p className="cp-nota">{aviso}</p>
    </>
  )
}
