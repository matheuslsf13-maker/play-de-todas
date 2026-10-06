import { nivelDeForca, notaDeForca } from '../lib/forca'
import { nomeDaCategoria } from '../lib/campeonato'
import { partidasDoRodizio, quadrasSimultaneas } from '../lib/pairing'
import { plural } from '../lib/types'
import { Stepper } from './ui'

/**
 * O CARTAO DA DIVISAO DO CAMPEONATO, na criacao do play.
 *
 * Mostra categoria -> grupos -> meninas com a nota de forca, ja divididas pelo
 * app (as mais fortes na A, e dentro de cada categoria no grupo 1). Tocar numa
 * menina e escolher o destino move qualquer uma para qualquer categoria e
 * grupo -- a organizadora conhece quem o app ainda nao viu jogar.
 */
export default function DivisaoDoCampeonato({
  estrutura,
  forca,
  nameOf,
  classeDoGrupo,
  movendo,
  setMovendo,
  onMover,
  movidas,
  nCategorias,
  setNCategorias,
  gruposPorCategoria,
  setGruposPorCategoria,
  qtdQuadras,
  setQtdQuadras,
  onSortear,
  onDesfazer,
  selecionadas,
}: {
  estrutura: string[][][]
  forca: Map<string, number>
  nameOf: (id: string) => string
  classeDoGrupo: (grupo: number) => string
  movendo: string | null
  setMovendo: (id: string | null) => void
  onMover: (id: string, c: number, g: number) => void
  movidas: Record<string, { c: number; g: number }>
  nCategorias: number
  setNCategorias: (n: number) => void
  gruposPorCategoria: number
  setGruposPorCategoria: (n: number) => void
  qtdQuadras: number[]
  setQtdQuadras: (q: number[]) => void
  onSortear: () => void
  onDesfazer: () => void
  selecionadas: number
}) {
  const precisa = nCategorias * gruposPorCategoria * 4
  const media = (g: string[]) =>
    Math.round(g.reduce((t, id) => t + notaDeForca(forca.get(id) ?? 2), 0) / Math.max(1, g.length))
  /** Quantas quadras cada categoria usa de fato: nao passa do que os grupos dela enchem juntos. */
  const usadas = estrutura.map((gs, c) => Math.min(qtdQuadras[c] ?? 1, Math.max(1, quadrasSimultaneas(gs.map((g) => g.length)))))
  /** Primeira quadra de cada categoria: as quadras sao numeradas em sequencia (como sao gravadas). */
  const inicio = usadas.map((_, c) => usadas.slice(0, c).reduce((t, n) => t + n, 0) + 1)

  return (
    <div className="card">
      <div className="section-title">🏆 Categorias e grupos</div>
      <div className="grid2">
        <div className="field">
          <span>Categorias</span>
          <Stepper value={nCategorias} min={1} max={8} onChange={setNCategorias} />
          <em className="hint">
            {Array.from({ length: nCategorias }, (_, i) => nomeDaCategoria(i)).join(', ')} — a A com as mais fortes
          </em>
        </div>
        <div className="field">
          <span>Grupos por categoria</span>
          <Stepper value={gruposPorCategoria} min={2} max={4} onChange={setGruposPorCategoria} />
          <em className="hint">as mais fortes no grupo 1</em>
        </div>
      </div>

      {selecionadas < precisa ? (
        <div className="banner warn" style={{ marginTop: 10 }}>
          {plural(nCategorias, 'categoria')} com {plural(gruposPorCategoria, 'grupo')} cada precisam de pelo menos{' '}
          <strong>{precisa} meninas</strong> (4 por grupo) — hoje são {selecionadas}. Diminua as categorias ou os grupos.
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 10 }}>
          {estrutura.map((grupos, c) => {
            const tamanhos = grupos.map((g) => g.length)
            const cabem = Math.max(1, quadrasSimultaneas(tamanhos))
            const qtd = qtdQuadras[c] ?? 1
            const de = inicio[c]
            const ate = de + Math.min(qtd, cabem) - 1
            return (
              <div key={c} className="toggle-card">
                <div className="row spread" style={{ alignItems: 'baseline' }}>
                  <strong>Categoria {nomeDaCategoria(c)}</strong>
                  <span className="tiny muted">
                    {plural(grupos.flat().length, 'menina')} · {grupos.reduce((t, g) => t + partidasDoRodizio(g.length), 0)} partidas nos grupos
                  </span>
                </div>
                <div className="field" style={{ marginTop: 8 }}>
                  <span>Quadras da categoria {nomeDaCategoria(c)}</span>
                  <Stepper
                    value={qtd}
                    min={1}
                    max={6}
                    onChange={(v) => setQtdQuadras(qtdQuadras.map((x, k) => (k === c ? v : x)))}
                  />
                  <em className={`hint${qtd > cabem ? ' aviso' : ''}`}>
                    {de === ate ? `quadra ${de}` : `quadras ${de} a ${ate}`}
                    {qtd > cabem
                      ? ` — com ${plural(grupos.length, 'grupo')} só ${cabem === 1 ? 'uma joga' : `${cabem} jogam`} por vez; ${plural(qtd - cabem, 'quadra')} ficaria parada`
                      : ''}
                  </em>
                </div>
                <div className="stack" style={{ gap: 8 }}>
                  {grupos.map((g, gi) => (
                    // a cor e a da categoria: a mesma que as quadras dela vao ter
                    <div key={gi} className={`grupo-box ${classeDoGrupo(c + 1)}`}>
                      <div className="grupo-nome">
                        {nomeDaCategoria(c)} · grupo {gi + 1} · {plural(g.length, 'menina')} · {plural(partidasDoRodizio(g.length), 'partida')}
                      </div>
                      <div className="tiny muted" style={{ marginBottom: 6 }}>
                        💪 força média <strong>{media(g)}</strong> · {nivelDeForca(media(g)).emoji} {nivelDeForca(media(g)).titulo}
                      </div>
                      <div className="row wrap" style={{ gap: 6 }}>
                        {g.map((id) => (
                          <button
                            key={id}
                            type="button"
                            className={`chip ${movendo === id ? 'on' : ''}`}
                            onClick={() => setMovendo(movendo === id ? null : id)}
                          >
                            {nameOf(id)}
                            <span className="tiny muted" style={{ fontWeight: 600 }}>
                              {notaDeForca(forca.get(id) ?? 2)}
                            </span>
                            {id in movidas ? ' ✏️' : ''}
                          </button>
                        ))}
                      </div>
                      {movendo && !g.includes(movendo) && (
                        <button
                          type="button"
                          className="btn ghost sm block"
                          style={{ marginTop: 8 }}
                          onClick={() => onMover(movendo, c, gi)}
                        >
                          ↪️ Mover {nameOf(movendo)} para {nomeDaCategoria(c)} · grupo {gi + 1}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn ghost sm grow" onClick={onSortear}>
              🎲 Sortear de novo
            </button>
            {Object.keys(movidas).length > 0 && (
              <button type="button" className="btn ghost sm grow" onClick={onDesfazer}>
                ↩️ Desfazer ajustes
              </button>
            )}
          </div>
          <em className="hint">
            Toque numa menina e depois no botão do grupo para onde ela vai — qualquer categoria, qualquer grupo
            (nenhum grupo fica com menos de 4). Quem já jogou entra pela força; o sorteio só mexe nas empatadas, como
            as estreantes.
          </em>
        </div>
      )}
    </div>
  )
}
