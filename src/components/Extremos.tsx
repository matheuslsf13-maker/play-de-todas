/**
 * A FORCA MAIS ALTA E A MAIS BAIXA que ja teve, e a linha de referencia (a
 * media): tres linhas finas atravessando o grafico, com o numero no eixo ("máx",
 * "média", "mín" pequenos). As LINHAS ficam sempre no lugar certo; quando os
 * NUMEROS do eixo encostariam um no outro (notas parecidas, comum na dupla),
 * eles se afastam um pouco -- a linha nao some.
 */
export default function Extremos({
  y,
  esq,
  fim,
  max,
  min,
  referencia,
  topo,
  baixo,
}: {
  /** A escala vertical do grafico. */
  y: (v: number) => number
  /** Onde comeca e termina a area de desenho. */
  esq: number
  fim: number
  max: number
  min: number
  /** A linha tracejada de referencia (a media). */
  referencia: number
  /** Limites para os numeros do eixo nao sairem do grafico. */
  topo: number
  baixo: number
}) {
  type Linha = { v: number; rotulo: string; cor: string; traco: string; peso: number }
  // maxima ou minima exatamente na media: e a mesma linha, e o rotulo diz as duas coisas
  const naMedia = [max === referencia ? 'máx' : '', min === referencia && min !== max ? 'mín' : ''].filter(Boolean)
  const linhas: Linha[] = [
    { v: referencia, rotulo: ['média', ...naMedia].join(' · '), cor: 'var(--muted)', traco: '4 3', peso: 400 },
  ]
  if (max !== referencia) linhas.push({ v: max, rotulo: 'máx', cor: 'var(--verde)', traco: '1 3', peso: 800 })
  if (min !== referencia && min !== max) linhas.push({ v: min, rotulo: 'mín', cor: 'var(--bronze)', traco: '1 3', peso: 800 })

  // os numeros do eixo, de cima para baixo, com pelo menos ALTURA entre eles
  const ALTURA = 17
  const ordem = [...linhas].sort((a, b) => y(a.v) - y(b.v))
  const pos = ordem.map((l) => y(l.v))
  for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i], pos[i - 1] + ALTURA)
  const sobra = pos[pos.length - 1] - baixo
  if (sobra > 0) for (let i = 0; i < pos.length; i++) pos[i] -= sobra
  for (let i = pos.length - 2; i >= 0; i--) pos[i] = Math.min(pos[i], pos[i + 1] - ALTURA)
  if (pos[0] < topo) {
    const falta = topo - pos[0]
    for (let i = 0; i < pos.length; i++) pos[i] += falta
  }

  return (
    <g aria-hidden="true">
      {ordem.map((l, i) => (
        <g key={l.rotulo}>
          <line
            x1={esq}
            x2={fim}
            y1={y(l.v)}
            y2={y(l.v)}
            stroke={l.cor === 'var(--muted)' ? 'var(--line-2)' : l.cor}
            strokeOpacity={l.cor === 'var(--muted)' ? 1 : 0.6}
            strokeWidth={1}
            strokeDasharray={l.traco}
          />
          <text x={esq - 6} y={pos[i] + 1} textAnchor="end" fontSize="9" fontWeight={l.peso} fill={l.cor} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {l.v}
          </text>
          <text x={esq - 6} y={pos[i] + 8.5} textAnchor="end" fontSize="6.5" fill={l.cor} opacity={0.85}>
            {l.rotulo}
          </text>
        </g>
      ))}
    </g>
  )
}
