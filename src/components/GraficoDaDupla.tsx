import { useMemo, useState } from 'react'
import { historicoDaDupla } from '../lib/forca'
import { dateLabel, type AppData } from '../lib/types'

/**
 * O DESEMPENHO DA DUPLA: a forca dela depois de cada play juntas (linha cheia)
 * contra o que a media das duas preve (tracejada). A faixa entre as duas e o
 * entrosamento: verde quando rendem mais juntas, cinza quando rendem menos.
 * Ponto cheio = noite com mais vitorias que derrotas; vazado = o contrario.
 */
export default function GraficoDaDupla({ data, a, b }: { data: AppData; a: string; b: string }) {
  const { base, pontos } = useMemo(() => historicoDaDupla(data, a, b), [data, a, b])
  const [tocado, setTocado] = useState<number | null>(null)

  if (pontos.length < 2) {
    return <p className="tiny muted" style={{ margin: '10px 0 0' }}>O gráfico aparece a partir do 2º play juntas.</p>
  }

  const W = 320
  const H = 150
  const esq = 34
  const dir = 10
  const topo = 10
  const pe = 22
  const notas = [...pontos.map((p) => p.nota), base]
  const min = Math.min(...notas) - 8
  const max = Math.max(...notas) + 8
  const x = (i: number) => esq + (i * (W - esq - dir)) / (pontos.length - 1)
  const y = (v: number) => topo + ((max - v) * (H - topo - pe)) / Math.max(1, max - min)
  const ultimo = pontos[pontos.length - 1]
  const entrosamento = ultimo.nota - base
  const faixa = `M ${x(0)} ${y(base)} ${pontos.map((p, i) => `L ${x(i)} ${y(p.nota)}`).join(' ')} L ${x(pontos.length - 1)} ${y(base)} Z`
  const sel = tocado !== null ? pontos[tocado] : null

  return (
    <div style={{ marginTop: 12 }}>
      <div className="row spread" style={{ alignItems: 'baseline' }}>
        <strong className="small">📈 Desempenho juntas</strong>
        <span className="tiny" style={{ fontWeight: 800, color: entrosamento > 0 ? 'var(--verde)' : entrosamento < 0 ? 'var(--danger)' : 'var(--muted)' }}>
          {entrosamento > 0 ? `+${entrosamento}` : entrosamento} sobre a média das duas
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Força da dupla: de ${pontos[0].nota} para ${ultimo.nota}`} style={{ display: 'block', marginTop: 6, overflow: 'visible' }}>
        <path d={faixa} fill={entrosamento >= 0 ? 'var(--verde)' : 'var(--muted)'} opacity={0.14} />
        <line x1={esq} x2={W - dir} y1={y(base)} y2={y(base)} stroke="var(--muted)" strokeDasharray="4 3" />
        <text x={esq - 6} y={y(base) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">{base}</text>
        <text x={W - dir} y={y(base) - 4} textAnchor="end" fontSize="8" fill="var(--muted)">média das duas</text>
        {pontos.slice(1).map((p, i) => (
          <line key={p.sessionId} x1={x(i)} y1={y(pontos[i].nota)} x2={x(i + 1)} y2={y(p.nota)} stroke="var(--marca)" strokeWidth={2} strokeLinecap="round" />
        ))}
        {pontos.map((p, i) => (
          <circle
            key={p.sessionId + 'c'}
            cx={x(i)} cy={y(p.nota)} r={tocado === i ? 6 : i === pontos.length - 1 ? 4.5 : 3.5}
            fill={p.v > p.d ? 'var(--marca)' : 'var(--card)'} stroke="var(--marca)" strokeWidth={2}
            style={{ cursor: 'pointer' }} onClick={() => setTocado(tocado === i ? null : i)}
          />
        ))}
        <text x={esq} y={H - 6} fontSize="9" fill="var(--muted)">{dateLabel(pontos[0].date)}</text>
        <text x={W - dir} y={H - 6} textAnchor="end" fontSize="9" fill="var(--muted)">{dateLabel(ultimo.date)}</text>
      </svg>
      <p className="tiny muted" style={{ margin: '4px 0 0' }}>
        {sel
          ? `${dateLabel(sel.date)}: ${sel.v}V ${sel.d}D · força da dupla ${sel.nota}`
          : 'Ponto cheio: noite com mais vitórias. Toque num ponto para ver o dia.'}
      </p>
    </div>
  )
}
