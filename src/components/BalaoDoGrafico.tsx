/**
 * O BALAO do ponto tocado nos graficos de forca (proposta aprovada, 08/11): em cima do ponto, a data e o placar do
 * dia numa linha pequena e, embaixo, a nota em destaque com quanto mexeu. So aparece com o ponto tocado.
 * Fica dentro da area do grafico: encosta nas bordas em vez de sair, e vai para baixo do ponto se nao cabe em cima.
 */
export function BalaoDoGrafico({
  x,
  y,
  titulo,
  nota,
  delta,
  deltaTexto,
  minX,
  maxX,
  topo,
}: {
  x: number
  y: number
  titulo: string
  nota: number
  /** Quanto mexeu na forca (para a cor); nulo = sem variacao para mostrar. */
  delta: number | null
  /** Ex.: "no play", "por falta". */
  deltaTexto: string
  minX: number
  maxX: number
  topo: number
}) {
  const sinal = delta === null ? '' : delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : '±0'
  const linha2 = `${nota}${sinal ? ` ${sinal} ${deltaTexto}` : ''}`
  const largura = Math.max(titulo.length * 4.7, linha2.length * 5.4) + 18
  const altura = 31
  const esq = Math.max(minX, Math.min(maxX - largura, x - largura / 2))
  const emCima = y - altura - 12 >= topo - 8
  const topoDoBalao = emCima ? y - altura - 12 : y + 12
  const cor = delta === null || delta === 0 ? 'var(--muted)' : delta > 0 ? 'var(--verde)' : 'var(--danger)'
  return (
    <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <rect x={esq} y={topoDoBalao} width={largura} height={altura} rx={9} fill="var(--card-2)" stroke="var(--line-2)" />
      <text x={esq + largura / 2} y={topoDoBalao + 12} textAnchor="middle" fontSize="8.5" fontWeight={600} fill="var(--muted)">
        {titulo}
      </text>
      <text x={esq + largura / 2} y={topoDoBalao + 25} textAnchor="middle" fontSize="11" fontWeight={800} fill="var(--text)" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {nota}
        {sinal && (
          <tspan fontSize="9.5" fill={cor} dx="4">
            {sinal} {deltaTexto}
          </tspan>
        )}
      </text>
    </g>
  )
}

/** A linha de baixo do grafico: a primeira data, a legenda dos pontos e a ultima data. */
export function LegendaDoGrafico({ inicio, fim, cheio, vazado }: { inicio: string; fim: string; cheio: string; vazado: string }) {
  return (
    <div className="legenda-grafico">
      <span className="nowrap">{inicio}</span>
      <span className="legenda-grafico-meio">
        <span><i className="bolinha cheia" /> {cheio}</span>
        <span><i className="bolinha vazada" /> {vazado}</span>
        <span>👆 toque num ponto</span>
      </span>
      <span className="nowrap">{fim}</span>
    </div>
  )
}
