import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { dateLabel, type Match } from '../lib/types'

/** Quantos plays aparecem antes do "ver mais". */
const PLAYS_POR_VEZ = 4

/**
 * O HISTORICO: as ultimas partidas, da mais recente para a mais antiga,
 * agrupadas por play. Do ponto de vista de uma jogadora (com quem jogou, contra
 * quem e o placar dela) ou de uma dupla (contra quem e o placar da dupla).
 */
export default function HistoricoDePartidas({
  partidas,
  jogadora,
  dupla,
}: {
  partidas: Match[]
  jogadora?: string
  dupla?: [string, string]
}) {
  const { data, nameOf } = useStore()
  const [mostrar, setMostrar] = useState(PLAYS_POR_VEZ)
  const sessao = useMemo(() => new Map(data.sessions.map((s) => [s.id, s])), [data.sessions])

  const porPlay = useMemo(() => {
    const doLado = (m: Match) =>
      jogadora ? m.team_a.includes(jogadora) : dupla ? dupla.every((id) => m.team_a.includes(id)) : true
    const minhas = partidas.filter((m) =>
      jogadora
        ? [...m.team_a, ...m.team_b].includes(jogadora)
        : dupla
          ? dupla.every((id) => m.team_a.includes(id)) || dupla.every((id) => m.team_b.includes(id))
          : false,
    )
    const grupos = new Map<string, Match[]>()
    for (const m of minhas) grupos.set(m.session_id, [...(grupos.get(m.session_id) ?? []), m])
    const chaveDoPlay = (sid: string) => `${sessao.get(sid)?.date ?? ''}|${sessao.get(sid)?.created_at ?? ''}`
    return [...grupos.entries()]
      .sort((x, y) => chaveDoPlay(y[0]).localeCompare(chaveDoPlay(x[0])))
      .map(([sid, ms]) => ({
        sid,
        // dentro do play: a que terminou por ultimo primeiro
        partidas: [...ms]
          .sort((x, y) => (y.ended_at ?? '').localeCompare(x.ended_at ?? '') || y.round - x.round)
          .map((m) => {
            const nossoLado = doLado(m)
            const nossos = nossoLado ? m.team_a : m.team_b
            const deles = nossoLado ? m.team_b : m.team_a
            const pro = (nossoLado ? m.score_a : m.score_b) as number
            const contra = (nossoLado ? m.score_b : m.score_a) as number
            return { m, parceira: jogadora ? nossos.find((x) => x !== jogadora) : undefined, deles, pro, contra }
          }),
      }))
  }, [partidas, jogadora, dupla, sessao])

  if (porPlay.length === 0) return <p className="tiny muted" style={{ margin: 0 }}>Nenhuma partida neste período.</p>

  return (
    <div className="stack" style={{ gap: 12 }}>
      {porPlay.slice(0, mostrar).map(({ sid, partidas: ps }) => {
        const v = ps.filter((p) => p.pro > p.contra).length
        const s = sessao.get(sid)
        return (
          <div key={sid}>
            <div className="row spread tiny" style={{ fontWeight: 800, marginBottom: 4 }}>
              <span className="muted">
                {dateLabel(s?.date ?? '')}
                {s?.ranked === false ? ' · avulso' : ''}
              </span>
              <span className="muted">{v}V {ps.length - v}D</span>
            </div>
            <div className="stack" style={{ gap: 3 }}>
              {ps.map(({ m, parceira, deles, pro, contra }) => (
                <div key={m.id} className="row small" style={{ gap: 8 }}>
                  <span style={{ width: 16, flex: 'none' }}>{pro > contra ? '✅' : '❌'}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    {parceira && (
                      <>
                        com <strong>{nameOf(parceira)}</strong>{' '}
                      </>
                    )}
                    <span className="muted">vs</span> {nameOf(deles[0])} + {nameOf(deles[1])}
                  </span>
                  <strong className="nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>{pro}x{contra}</strong>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {porPlay.length > mostrar && (
        <button className="btn ghost sm block" onClick={() => setMostrar(mostrar + PLAYS_POR_VEZ)}>
          Ver mais ({porPlay.length - mostrar} {porPlay.length - mostrar === 1 ? 'play' : 'plays'})
        </button>
      )}
    </div>
  )
}
