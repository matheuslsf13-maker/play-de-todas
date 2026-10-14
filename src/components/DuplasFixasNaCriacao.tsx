import { nivelDeForca, notaDeForca } from '../lib/forca'
import { mediaDaForca } from '../lib/stats'
import { useStore } from '../lib/store'
import { nomeDaCategoria } from '../lib/campeonato'
import { partidasEntreDuplas, type Duo } from '../lib/duplasFixas'
import { plural } from '../lib/types'
import { Stepper } from './ui'

/**
 * O CARTAO DAS DUPLAS FIXAS, na criacao do play.
 *
 * O app ja monta as duplas por nivel (forte com forte) e divide em categorias
 * pela forca da dupla. Tocar numa pessoa e depois noutra TROCA as duas de dupla;
 * com alguem tocado, cada categoria oferece "levar a dupla para ca". Quem
 * organiza conhece quem o app ainda nao viu jogar.
 */
export default function DuplasFixasNaCriacao({
  categorias,
  forca,
  nameOf,
  novatas,
  classeDoGrupo,
  tocada,
  setTocada,
  onTrocar,
  onMoverDupla,
  nCategorias,
  setNCategorias,
  qtdQuadras,
  setQtdQuadras,
  onRemontar,
  ajustada,
  semPar,
  mesmoGenero,
}: {
  categorias: Duo[][]
  forca: Map<string, number>
  nameOf: (id: string) => string
  novatas?: Set<string>
  classeDoGrupo: (grupo: number) => string
  tocada: string | null
  setTocada: (id: string | null) => void
  onTrocar: (a: string, b: string) => void
  onMoverDupla: (id: string, categoria: number) => void
  nCategorias: number
  setNCategorias: (n: number) => void
  qtdQuadras: number[]
  setQtdQuadras: (q: number[]) => void
  onRemontar: () => void
  ajustada: boolean
  semPar: string | null
  mesmoGenero: Duo[]
}) {
  const mediaHoje = mediaDaForca(useStore().data)
  const nota = (id: string) => notaDeForca(forca.get(id) ?? 2)
  const forcaDaDupla = (d: Duo) => Math.round((nota(d[0]) + nota(d[1])) / 2)
  const usadas = categorias.map((ds, c) => Math.min(qtdQuadras[c] ?? 1, Math.max(1, Math.floor(ds.length / 2))))
  const inicio = usadas.map((_, c) => usadas.slice(0, c).reduce((t, n) => t + n, 0) + 1)
  const total = categorias.reduce((t, c) => t + c.length, 0)

  function tocar(id: string) {
    if (!tocada) return setTocada(id)
    if (tocada === id) return setTocada(null)
    onTrocar(tocada, id)
    setTocada(null)
  }

  return (
    <div className="card">
      <div className="section-title">🔗 Duplas e categorias</div>
      <div className="field">
        <span>Categorias</span>
        <Stepper value={nCategorias} min={1} max={6} onChange={setNCategorias} />
        <em className="hint">
          {plural(total, 'dupla')} · {Array.from({ length: categorias.length }, (_, i) => nomeDaCategoria(i)).join(', ')} — a A com as duplas mais fortes
        </em>
      </div>

      {semPar && (
        <div className="banner warn" style={{ marginTop: 10 }}>
          ⚠️ <strong>{nameOf(semPar)}</strong> ficou sem dupla (número ímpar). Coloque mais alguém ou tire alguém da lista.
        </div>
      )}
      {mesmoGenero.length > 0 && (
        <div className="banner warn" style={{ marginTop: 10 }}>
          ⚖️ Faltou gente de um lado para tudo ser misto:{' '}
          {mesmoGenero.map((d) => `${nameOf(d[0])} + ${nameOf(d[1])}`).join(', ')}{' '}
          {mesmoGenero.length === 1 ? 'é dupla' : 'são duplas'} do mesmo gênero, por nível. Dá para trocar tocando nos nomes.
        </div>
      )}

      <div className="stack" style={{ marginTop: 10 }}>
        {categorias.map((duplas, c) => {
          const cabem = Math.max(1, Math.floor(duplas.length / 2))
          const qtd = qtdQuadras[c] ?? 1
          const de = inicio[c]
          const ate = de + Math.min(qtd, cabem) - 1
          const media = duplas.length ? Math.round(duplas.reduce((t, d) => t + forcaDaDupla(d), 0) / duplas.length) : 0
          const nivel = nivelDeForca(media, mediaHoje)
          const daqui = tocada ? duplas.some((d) => d.includes(tocada)) : true
          return (
            <div key={c} className={`grupo-box ${classeDoGrupo(c + 1)}`}>
              <div className="grupo-nome">
                Categoria {nomeDaCategoria(c)} · {plural(duplas.length, 'dupla')} · {plural(partidasEntreDuplas(duplas.length), 'partida')} na classificação
              </div>
              <div className="tiny muted" style={{ marginBottom: 6 }}>
                💪 força média <strong>{media}</strong> · {nivel.emoji} {nivel.titulo}
              </div>
              {duplas.length < 2 && (
                <em className="hint aviso" style={{ marginBottom: 6 }}>
                  ⚠️ Precisa de pelo menos 2 duplas — leve uma dupla para cá ou diminua as categorias
                </em>
              )}
              <div className="stack" style={{ gap: 6 }}>
                {duplas.map((d) => (
                  <div key={d.join('+')} className="row wrap" style={{ gap: 6 }}>
                    {d.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={`chip ${tocada === id ? 'on' : ''}`}
                        onClick={() => tocar(id)}
                      >
                        {nameOf(id)}
                        {novatas?.has(id) && <span className="tag-novata" title="primeiro play dela">🆕</span>}
                        <span className="tiny muted" style={{ fontWeight: 600 }}>{nota(id)}</span>
                      </button>
                    ))}
                    <span className="tiny muted">= {forcaDaDupla(d)}</span>
                  </div>
                ))}
              </div>
              {tocada && !daqui && (
                <button
                  type="button"
                  className="btn ghost sm block"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    onMoverDupla(tocada, c)
                    setTocada(null)
                  }}
                >
                  ↪️ Levar a dupla de {nameOf(tocada)} para a {nomeDaCategoria(c)}
                </button>
              )}
              <div className="field" style={{ marginTop: 8 }}>
                <span>Quadras da categoria {nomeDaCategoria(c)}</span>
                <Stepper
                  value={qtd}
                  min={1}
                  max={6}
                  onChange={(v) => setQtdQuadras(categorias.map((_, k) => (k === c ? v : qtdQuadras[k] ?? 1)))}
                />
                <em className={`hint${qtd > cabem ? ' aviso' : ''}`}>
                  {de === ate ? `quadra ${de}` : `quadras ${de} a ${ate}`}
                  {qtd > cabem ? ` — com ${plural(duplas.length, 'dupla')} só ${cabem === 1 ? 'uma partida' : `${cabem} partidas`} por vez` : ''}
                </em>
              </div>
            </div>
          )
        })}
      </div>

      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button type="button" className="btn ghost sm grow" onClick={onRemontar}>
          {ajustada ? '↩️ Voltar ao que o app montou' : '🔀 Montar de novo'}
        </button>
      </div>
      <em className="hint">
        Toque numa pessoa e depois noutra para trocar as duas de dupla. Com alguém tocado, a categoria
        mostra "levar a dupla para cá". O app monta por nível: forte com forte.
      </em>
    </div>
  )
}
