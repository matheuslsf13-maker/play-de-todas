/**
 * A FORCA MAIS ALTA E A MAIS BAIXA que ja teve: duas linhas finas pontilhadas
 * atravessando o grafico, com o numero no eixo ("máx" e "mín" pequenos). Ficam
 * no lugar das marcas arredondadas do eixo, entao nao somam poluicao; quando um
 * extremo cai em cima da linha de referencia (a media), vira uma linha so.
 */
export default function Extremos({
  y,
  esq,
  fim,
  max,
  min,
  referencia,
}: {
  /** A escala vertical do grafico. */
  y: (v: number) => number
  /** Onde comeca e termina a area de desenho. */
  esq: number
  fim: number
  max: number
  min: number
  /** A linha tracejada de referencia (a media), que ja tem o numero dela. */
  referencia: number
}) {
  // perto demais (em pixels) da referencia ou um do outro: nao desenha de novo
  // (os numeros do eixo precisam de uns 14px um do outro para nao encostar)
  const colado = (a: number, b: number) => Math.abs(y(a) - y(b)) < 14
  const linhas: { v: number; rotulo: string; cor: string; embaixo: boolean }[] = []
  if (!colado(max, referencia)) linhas.push({ v: max, rotulo: 'máx', cor: 'var(--verde)', embaixo: false })
  if (!colado(min, referencia) && !colado(min, max)) linhas.push({ v: min, rotulo: 'mín', cor: 'var(--bronze)', embaixo: true })
  return (
    <g aria-hidden="true">
      {linhas.map((l) => (
        <g key={l.rotulo}>
          <line x1={esq} x2={fim} y1={y(l.v)} y2={y(l.v)} stroke={l.cor} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="1 3" />
          <text x={esq - 6} y={y(l.v) + 3} textAnchor="end" fontSize="9" fontWeight={800} fill={l.cor} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {l.v}
          </text>
          <text x={esq - 6} y={l.embaixo ? y(l.v) + 11 : y(l.v) - 6} textAnchor="end" fontSize="6.5" fill={l.cor} opacity={0.85}>
            {l.rotulo}
          </text>
        </g>
      ))}
    </g>
  )
}
