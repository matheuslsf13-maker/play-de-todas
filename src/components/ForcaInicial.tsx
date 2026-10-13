import { useEffect, useState } from 'react'
import { nivelDeForca } from '../lib/forca'

/**
 * O NIVEL EM TRES TOQUES. Um numero de forca e dificil de chutar para quem
 * nunca jogou aqui -- quase ninguem usava. "Iniciante / intermediaria /
 * avancada" e o que a organizadora sabe de cara, e e exatamente a informacao
 * que uma partida de 4 games demora a dar (medido: uns 3 plays para encaixar
 * uma novata, com qualquer regra -- DECISOES.md). O numero continua ajustavel.
 */
export function niveisRapidos(media: number) {
  // em volta da MEDIA DE HOJE (a forca nao e mais soma zero: o meio anda)
  const arred = (v: number) => Math.round(v / 5) * 5
  return [
    { rotulo: '🌱 Iniciante', valor: arred(media - 60) },
    { rotulo: '⚖️ Intermediária', valor: media },
    { rotulo: '📈 Avançada', valor: arred(media + 60) },
  ]
}

/**
 * O ponto de partida do Elo, escolhido por quem organiza.
 *
 * O padrao e a MEDIA DE HOJE do grupo (`mediaDaForca`; gravado como nulo, ela
 * entra na media do dia em que estrear). Dar um ponto de partida diferente e
 * dizer ao app o que ele ainda nao sabe: que a estreante ja joga bem (ou ainda
 * nao). Depois disso as partidas mandam do mesmo jeito, e o historico inteiro e
 * recalculado a partir do novo ponto -- por isso o campo continua editavel.
 */
export default function ForcaInicial({
  valor,
  onChange,
  atual,
  media,
}: {
  valor: number
  onChange: (v: number) => void
  /** A media da forca hoje (o "meio" dos niveis). */
  media: number
  /** A nota de hoje, quando ja ha partidas. */
  atual?: number
}) {
  const nivel = nivelDeForca(valor, media)
  const PASSO = 25
  const MIN = 1200
  const MAX = 1800
  // o que esta sendo digitado e um rascunho: limitar a cada tecla tornava
  // impossivel digitar "1600" (o "1" virava 1200 antes do resto chegar)
  const [texto, setTexto] = useState(String(valor))
  useEffect(() => setTexto(String(valor)), [valor])
  const confirmarTexto = () => {
    const n = Math.round(Number(texto))
    if (texto.trim() === '' || !Number.isFinite(n)) {
      setTexto(String(valor))
      return
    }
    onChange(Math.min(MAX, Math.max(MIN, n)))
    setTexto(String(Math.min(MAX, Math.max(MIN, n))))
  }
  return (
    <div className="field" style={{ marginTop: 12 }}>
      <span>Força inicial</span>
      <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
        {niveisRapidos(media).map((n) => (
          <button
            key={n.rotulo}
            type="button"
            className={`chip ${valor === n.valor ? 'on' : 'off'}`}
            onClick={() => onChange(n.valor)}
          >
            {n.rotulo}
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => onChange(Math.max(MIN, valor - PASSO))}
          disabled={valor <= MIN}
        >
          −
        </button>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={MIN}
          max={MAX}
          step={PASSO}
          value={texto}
          style={{ textAlign: 'center', fontWeight: 800 }}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmarTexto}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => onChange(Math.min(MAX, valor + PASSO))}
          disabled={valor >= MAX}
        >
          +
        </button>
        <span className="nowrap tiny" style={{ color: nivel.cor, fontWeight: 800 }}>
          {nivel.emoji} {nivel.titulo}
        </span>
      </div>
      <em className="hint" style={{ marginTop: 6 }}>
        {valor === media
          ? `Na média do grupo hoje (${media}): o app aprende o nível com as partidas.`
          : valor > media
            ? `Começa ${valor - media} acima da média do grupo (${media}).`
            : `Começa ${media - valor} abaixo da média do grupo (${media}).`}
        {atual !== undefined && ` Hoje: ${atual} (mudar aqui recalcula tudo).`}
      </em>
    </div>
  )
}
