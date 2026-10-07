import { useMemo, useState } from 'react'
import CenaDoHall from '../components/hall/CenaDoHall'
import type { ModoDoCeu } from '../lib/hall/relogio'
import { computeStreaks } from '../lib/streaks'
import { useStore } from '../lib/store'
import { dateLabel } from '../lib/types'

/**
 * HALL DAS DUQUESAS: a casa com deck onde vivem as meninas que ja foram
 * Duquesa da V3. Enquanto ninguem conquistou, mostra a menina de exemplo
 * (previa do ambiente) -- sem inventar conquista nem gravar nada.
 */
export default function Hall() {
  const { data, nameOf } = useStore()
  const duquesas = useMemo(() => computeStreaks(data).duquesas, [data])
  const [ceu, setCeu] = useState<ModoDoCeu>('auto')
  const [zoom, setZoom] = useState(1)
  const [hora, setHora] = useState(8)
  const depurar = typeof location !== 'undefined' && location.search.includes('depurar')

  // por enquanto so a de exemplo: o boneco de cada Duquesa depende da arte dela
  const meninas = useMemo(() => [{ id: 'exemplo', nome: 'Duquesa de exemplo' }], [])

  return (
    <>
      <div className="card hall-topo">
        <div className="section-title" style={{ margin: 0 }}>👑 Hall das Duquesas</div>
        <p className="tiny muted" style={{ margin: '4px 0 0' }}>
          A casa de quem já chegou a 5 pódios seguidos.{' '}
          {duquesas.length === 0
            ? 'Ninguém conquistou ainda — esta é uma prévia com a menina de exemplo.'
            : `${duquesas.length === 1 ? 'Uma Duquesa' : `${duquesas.length} Duquesas`} até agora.`}
        </p>
      </div>

      <div className="hall-palco">
        <CenaDoHall meninas={meninas} modoDoCeu={ceu} zoom={zoom} depurar={depurar} onHora={setHora} />
        <div className="hall-relogio">{String(Math.floor(hora)).padStart(2, '0')}h</div>
      </div>

      <div className="hall-controles">
        <div className="segmented">
          {(
            [
              ['auto', '🔁 Auto'],
              ['dia', '☀️ Dia'],
              ['noite', '🌙 Noite'],
            ] as [ModoDoCeu, string][]
          ).map(([m, rotulo]) => (
            <button key={m} className={ceu === m ? 'on' : ''} onClick={() => setCeu(m)}>
              {rotulo}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn ghost sm" aria-label="Afastar" onClick={() => setZoom((z) => Math.max(0.7, z - 0.25))}>➖</button>
          <button className="btn ghost sm" aria-label="Aproximar" onClick={() => setZoom((z) => Math.min(2.2, z + 0.25))}>➕</button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">🖼️ Galeria</div>
        {duquesas.length === 0 ? (
          <p className="tiny muted" style={{ margin: 0 }}>Quem será a primeira Duquesa?</p>
        ) : (
          <div className="stack">
            {duquesas.map((d, i) => (
              <div key={`${d.player_id}:${d.date}`} className="row">
                <span className="hall-numero">{i + 1}ª</span>
                <span className="grow" style={{ fontWeight: 700 }}>{nameOf(d.player_id)}</span>
                <span className="tiny muted">{dateLabel(d.date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
