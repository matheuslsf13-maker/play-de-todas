import { useMemo, useState } from 'react'
import { FORCA_MEDIA } from '../lib/forca'
import { isPlayed, matchPoints } from '../lib/scoring'
import { historicoDeForca } from '../lib/stats'
import { diaMes, pontosComRotulo, rotuloEmbaixo } from './grafico'
import { dateLabel, plural, type AppData } from '../lib/types'

/**
 * O DESEMPENHO DA MENINA AO LONGO DO TEMPO: a forca depois de cada play.
 *
 * E a forca, e nao os pontos do dia, porque ela ja desconta contra quem a
 * menina jogou -- pontos dependem do grupo e do formato da noite. Cada ponto
 * cheio e um play jogado; o vazado e uma falta que derrubou a nota. Tocar num
 * ponto mostra o dia.
 */
export default function GraficoDeForca({ data, playerId }: { data: AppData; playerId: string }) {
  const pontos = useMemo(() => historicoDeForca(data, playerId, true), [data, playerId])
  const [tocado, setTocado] = useState<number | null>(null)

  const jogados = pontos.filter((p) => p.jogou)
  // um play so ja tem o que mostrar se as faltas depois dele baixaram a nota
  const depoisDoInicio = pontos.filter((p) => p.sessionId !== 'inicio')
  if (jogados.length === 0 || depoisDoInicio.length < 2) {
    return (
      <p className="tiny muted" style={{ margin: '10px 0 0' }}>
        O gráfico aparece a partir do 2º play dela (ou quando uma falta baixar a nota).
      </p>
    )
  }

  // a tendencia: a nota de hoje contra a de 5 plays jogados atras (com um play
  // so, contra a dele: o que mudou depois foi a falta)
  const atras = jogados[Math.max(0, jogados.length - 6)]
  const agora = pontos[pontos.length - 1]
  const dif = agora.nota - atras.nota
  const nPlays = Math.min(5, jogados.length - 1)
  const periodo = nPlays === 0 ? 'desde o único play' : nPlays === 1 ? 'no último play' : `nos últimos ${nPlays} plays`
  const tendencia = Math.abs(dif) < 8 ? 'estável' : dif > 0 ? 'subindo' : 'descendo'

  // escala: os pontos e a media, com folga em cima (para os numeros) e embaixo (datas)
  const W = 320
  const H = 172
  const esq = 34
  const dir = 14
  const topo = 22
  const base = 30
  const notas = [...pontos.map((p) => p.nota), FORCA_MEDIA]
  const min = Math.min(...notas) - 8
  const max = Math.max(...notas) + 8
  const x = (i: number) => esq + (pontos.length === 1 ? 0 : (i * (W - esq - dir)) / (pontos.length - 1))
  const y = (v: number) => topo + ((max - v) * (H - topo - base)) / Math.max(1, max - min)
  // marcas do eixo: a media e os extremos arredondados de 10 em 10
  const marcas = [...new Set([Math.ceil(min / 10) * 10, FORCA_MEDIA, Math.floor(max / 10) * 10])].sort((a, b) => a - b)
  const valores = pontos.map((p) => p.nota)
  const comRotulo = pontosComRotulo(valores, W - esq - dir)
  const area = `M ${x(0)} ${H - base} ${pontos.map((p, i) => `L ${x(i)} ${y(p.nota)}`).join(' ')} L ${x(pontos.length - 1)} ${H - base} Z`
  const ultimo = pontos.length - 1

  const sel = tocado !== null ? pontos[tocado] : null
  const resumo = sel && sel.jogou ? resumoDoPlay(data, sel.sessionId, playerId) : null

  return (
    <div style={{ marginTop: 12 }}>
      <div className="row spread" style={{ alignItems: 'baseline' }}>
        <strong className="small">📈 Desempenho</strong>
        <span
          className="tiny"
          style={{
            fontWeight: 800,
            color: tendencia === 'subindo' ? 'var(--verde)' : tendencia === 'descendo' ? 'var(--danger)' : 'var(--muted)',
          }}
        >
          {dif > 0 ? `+${dif}` : dif} {periodo} · {tendencia}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Força ao longo do tempo: de ${pontos[0].nota} para ${agora.nota}`}
        style={{ display: 'block', marginTop: 6, overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="grad-forca" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--marca)" stopOpacity="0.32" />
            <stop offset="1" stopColor="var(--marca)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {marcas.map((v) => (
          <g key={v}>
            <line
              x1={esq}
              x2={W - dir}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--line)"
              strokeDasharray={v === FORCA_MEDIA ? '4 3' : '1 4'}
              strokeWidth={1}
            />
            <text x={esq - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">
              {v}
            </text>
          </g>
        ))}
        <text x={W - dir} y={y(FORCA_MEDIA) - 4} textAnchor="end" fontSize="8" fill="var(--muted)">
          média
        </text>
        <path d={area} fill="url(#grad-forca)" />
        {tocado !== null && (
          <line x1={x(tocado)} x2={x(tocado)} y1={topo - 6} y2={H - base} stroke="var(--muted)" strokeDasharray="2 3" />
        )}
        {/* a linha: cheia entre plays jogados, tracejada quando a queda veio de falta */}
        {pontos.slice(1).map((p, i) => (
          <line
            key={p.sessionId + i}
            x1={x(i)}
            y1={y(pontos[i].nota)}
            x2={x(i + 1)}
            y2={y(p.nota)}
            stroke="var(--marca)"
            strokeWidth={2.4}
            strokeDasharray={p.jogou ? undefined : '3 3'}
            strokeLinecap="round"
          />
        ))}
        {pontos.map((p, i) => {
          const destaque = i === ultimo || i === tocado
          const embaixo = rotuloEmbaixo(valores, i)
          return (
            <g key={p.sessionId + 'c' + i} style={{ cursor: 'pointer' }} onClick={() => setTocado(tocado === i ? null : i)}>
              {/* area de toque maior que o ponto: no celular o dedo erra */}
              <circle cx={x(i)} cy={y(p.nota)} r={12} fill="transparent" />
              {i === ultimo && <circle cx={x(i)} cy={y(p.nota)} r={8} fill="var(--marca)" opacity={0.18} />}
              <circle
                cx={x(i)}
                cy={y(p.nota)}
                r={destaque ? 5 : 3.6}
                // o ponto de partida e cinza; vazado e so falta
                fill={p.sessionId === 'inicio' ? 'var(--muted)' : p.jogou ? 'var(--marca)' : 'var(--card)'}
                stroke={p.sessionId === 'inicio' ? 'var(--muted)' : 'var(--marca)'}
                strokeWidth={2}
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
        <text x={x(0)} y={H - 8} fontSize="9" fill="var(--muted)">
          {diaMes(dateLabel(pontos[0].date))}
        </text>
        {tocado !== null && tocado !== 0 && tocado !== ultimo && (
          <text x={x(tocado)} y={H - 8} textAnchor="middle" fontSize="9" fontWeight={700} fill="var(--text)">
            {diaMes(dateLabel(pontos[tocado].date))}
          </text>
        )}
        <text x={x(ultimo)} y={H - 8} textAnchor="end" fontSize="9" fill="var(--muted)">
          {diaMes(dateLabel(agora.date))}
        </text>
      </svg>
      <p className="tiny muted" style={{ margin: '4px 0 0' }}>
        {sel
          ? sel.sessionId === 'inicio'
            ? `Ponto de partida: ${sel.nota}.`
            : sel.jogou
              ? `${dateLabel(sel.date)}: terminou o play com ${sel.nota}${resumo ? ` · ${resumo}` : ''}.`
              : `${dateLabel(sel.date)}: faltou, e a nota caiu para ${sel.nota}.`
          : 'Cada ponto cheio é um play; o vazado, uma falta que baixou a nota. Toque num ponto para ver o dia.'}
      </p>
    </div>
  )
}

/** "3V 1D · 7 pts" da menina naquele play. */
function resumoDoPlay(data: AppData, sessionId: string, id: string): string {
  let v = 0
  let d = 0
  let pts = 0
  for (const m of data.matches) {
    if (m.session_id !== sessionId || !isPlayed(m)) continue
    const naA = m.team_a.includes(id)
    const naB = m.team_b.includes(id)
    if (!naA && !naB) continue
    const [pa, pb] = matchPoints(m.score_a as number, m.score_b as number)
    const venceu = naA ? (m.score_a as number) > (m.score_b as number) : (m.score_b as number) > (m.score_a as number)
    if (venceu) {
      v++
      pts += naA ? pa : pb
    } else d++
  }
  return v + d === 0 ? '' : `${v}V ${d}D · ${plural(pts, 'ponto')}`
}
