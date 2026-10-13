import { useMemo, useState } from 'react'
import { historicoDaDupla } from '../lib/forca'
import { dateLabel, type AppData } from '../lib/types'
import Extremos from './Extremos'
import { diaMes, pontosComRotulo, rotuloEmbaixo } from './grafico'

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
  const H = 172
  const esq = 34
  const dir = 14
  const topo = 22
  const pe = 30
  const notas = [...pontos.map((p) => p.nota), base]
  const min = Math.min(...notas) - 8
  const max = Math.max(...notas) + 8
  const x = (i: number) => esq + (i * (W - esq - dir)) / (pontos.length - 1)
  const y = (v: number) => topo + ((max - v) * (H - topo - pe)) / Math.max(1, max - min)
  const ultimo = pontos[pontos.length - 1]
  const iu = pontos.length - 1
  const entrosamento = ultimo.nota - base
  const faixa = `M ${x(0)} ${y(base)} ${pontos.map((p, i) => `L ${x(i)} ${y(p.nota)}`).join(' ')} L ${x(iu)} ${y(base)} Z`
  const valores = pontos.map((p) => p.nota)
  const comRotulo = pontosComRotulo(valores, W - esq - dir)
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
        <defs>
          <linearGradient id="grad-dupla" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={entrosamento >= 0 ? 'var(--verde)' : 'var(--danger)'} stopOpacity="0.30" />
            <stop offset="1" stopColor={entrosamento >= 0 ? 'var(--verde)' : 'var(--danger)'} stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path d={faixa} fill="url(#grad-dupla)" />
        <Extremos y={y} esq={esq} fim={W - dir} max={Math.max(...valores)} min={Math.min(...valores)} referencia={base} topo={topo - 4} baixo={H - pe - 4} />
        {tocado !== null && (
          <line x1={x(tocado)} x2={x(tocado)} y1={topo - 6} y2={H - pe} stroke="var(--muted)" strokeDasharray="2 3" />
        )}
        {pontos.slice(1).map((p, i) => (
          <line key={p.sessionId} x1={x(i)} y1={y(pontos[i].nota)} x2={x(i + 1)} y2={y(p.nota)} stroke="var(--marca)" strokeWidth={2.4} strokeLinecap="round" />
        ))}
        {pontos.map((p, i) => {
          const destaque = i === iu || i === tocado
          const embaixo = rotuloEmbaixo(valores, i)
          return (
            <g key={p.sessionId + 'c'} style={{ cursor: 'pointer' }} onClick={() => setTocado(tocado === i ? null : i)}>
              <circle cx={x(i)} cy={y(p.nota)} r={12} fill="transparent" />
              {i === iu && <circle cx={x(i)} cy={y(p.nota)} r={8} fill="var(--marca)" opacity={0.18} />}
              <circle
                cx={x(i)} cy={y(p.nota)} r={destaque ? 5 : 3.6}
                fill={p.v > p.d ? 'var(--marca)' : 'var(--card)'} stroke="var(--marca)" strokeWidth={2}
              />
              {(comRotulo.has(i) || i === tocado) && (
                <text
                  x={x(i)}
                  y={embaixo ? y(p.nota) + 15 : y(p.nota) - 9}
                  textAnchor="middle"
                  fontSize={destaque ? 10 : 8.5}
                  fontWeight={destaque ? 800 : 600}
                  fill={destaque ? 'var(--marca)' : 'var(--text)'}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {p.nota}
                </text>
              )}
            </g>
          )
        })}
        <text x={x(0)} y={H - 8} fontSize="9" fill="var(--muted)">{diaMes(dateLabel(pontos[0].date))}</text>
        {tocado !== null && tocado !== 0 && tocado !== iu && (
          <text x={x(tocado)} y={H - 8} textAnchor="middle" fontSize="9" fontWeight={700} fill="var(--text)">
            {diaMes(dateLabel(pontos[tocado].date))}
          </text>
        )}
        <text x={x(iu)} y={H - 8} textAnchor="end" fontSize="9" fill="var(--muted)">{diaMes(dateLabel(ultimo.date))}</text>
      </svg>
      <p className="tiny muted" style={{ margin: '4px 0 0' }}>
        {sel
          ? `${dateLabel(sel.date)}: ${sel.v}V ${sel.d}D · força da dupla ${sel.nota}`
          : 'Ponto cheio: noite com mais vitórias. Toque num ponto para ver o dia.'}
      </p>
    </div>
  )
}
