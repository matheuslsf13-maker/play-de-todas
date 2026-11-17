import { STREAK_LADDER } from '../lib/streaks'

const DEGRAUS: { emoji: string; titulo: string; from: number; anima: string }[] = [
  { emoji: '🏅', titulo: '1º pódio', from: 1, anima: 'reluz' },
  ...STREAK_LADDER.map((x) => ({
    emoji: x.emoji,
    titulo: x.title.replace(' da V3', '').replace(' do Play', ''),
    from: x.from,
    anima: ({ 2: 'chama', 3: 'raio', 4: 'brilho', 5: 'coroa' } as Record<number, string>)[x.from],
  })),
]

/**
 * O caminho do status (dono, 17/11): bolas de 1º pódio a 👑 ligadas por um traco que vai de borda a borda (nunca
 * por dentro do desenho). O que ela ja passou fica aceso e animado (a medalha reluz, o fogo mexe, o raio pisca,
 * o diamante cintila, a coroa flutua); o degrau de agora pulsa; o resto fica apagado.
 * `compacto` = sem os nomes embaixo (lista da tela inicial).
 */
export function CaminhoDoStatus({ seq, vezes, compacto = false }: { seq: number; vezes?: (from: number) => number; compacto?: boolean }) {
  const agora = DEGRAUS.reduce((m, d, i) => (seq >= d.from ? i : m), -1)
  return (
    <div
      className={`caminho${compacto ? ' compacto' : ''}`}
      role="img"
      aria-label={seq === 0 ? 'sem sequência' : `${seq} de ${DEGRAUS.length} pódios seguidos`}
    >
      {DEGRAUS.map((d, i) => {
        const n = vezes && d.from > 1 ? vezes(d.from) : 0
        const estado = i < agora ? 'feito' : i === agora ? 'agora' : 'falta'
        return (
          <div key={d.from} className={`caminho-degrau ${estado}`}>
            {i > 0 && <span className={`caminho-traco${i < agora ? ' aceso' : i === agora ? ' aceso chegando' : ''}`} aria-hidden="true" />}
            <span className={`caminho-bola${estado !== 'falta' ? ` ${d.anima}` : ''}`} aria-hidden="true">
              <span className="caminho-emoji">{d.emoji}</span>
            </span>
            {!compacto && (
              <span className="caminho-nome">
                {d.titulo}
                {n > 0 && <small>×{n}</small>}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
