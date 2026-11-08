import { useEffect, useState } from 'react'
import { formatarMinutos, horaLocal, type RitmoDaNoite } from '../lib/previsaoDaNoite'
import { plural } from '../lib/types'

/** Re-desenha a cada 20 s: os "ha quanto tempo" andam sozinhos com a tela parada. */
function useAgora(): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 20000)
    return () => window.clearInterval(t)
  }, [])
  return agora
}

/** "12 min", "1h05", "menos de 1 min": quanto passou desde `iso`. */
export function decorrido(iso: string, agora: number): string {
  const min = Math.floor((agora - new Date(iso).getTime()) / 60000)
  return min < 1 ? 'menos de 1 min' : formatarMinutos(min)
}

/** O tempo de uma partida em quadra, andando sozinho. */
export function TempoEmQuadra({ desde }: { desde: string }) {
  const agora = useAgora()
  return (
    <>
      Jogando há <span style={{ fontVariantNumeric: 'tabular-nums' }}>{decorrido(desde, agora)}</span> · desde {horaLocal(desde)}
    </>
  )
}

/**
 * O PAINEL DA NOITE, no topo do play rolando: quantas partidas ja foram, a
 * barra (jogadas, em quadra e, nos modos com fases, onde comeca o mata-mata),
 * quanto falta e a hora prevista do fim. E a mesma conta do cartao ao vivo da
 * tela inicial (`resumoAoVivo` + `restanteDaNoite`), agora no ritmo medido da
 * noite (`ritmoDaNoite`).
 */
export default function PainelDaNoite(p: {
  jogadas: number
  /** Todas as partidas da noite, contando o mata-mata ainda nao montado. */
  total: number
  jogando: number
  /** Onde o mata-mata comeca na barra (0 a 1), so nos formatos com fases. */
  marca: number | null
  falta: number
  minutos: number
  /** Ja entrou alguma partida em quadra (antes disso o "termina as" contaria a partir de agora). */
  comecou: boolean
  soFase2: boolean
  ritmo: RitmoDaNoite
  minutosCalibrados: number
  jogosPorPessoa: number | string
  /** Quando a 1a partida da noite entrou em quadra (null antes disso). */
  inicioDaNoite: string | null
}) {
  const agora = useAgora()
  const total = Math.max(1, p.total)
  const pctJogadas = Math.min(100, (100 * p.jogadas) / total)
  const pctJogando = Math.min(100 - pctJogadas, (100 * p.jogando) / total)
  const marca = p.marca != null && p.marca > 0 && p.marca < 1 ? p.marca : null
  const fim = horaLocal(new Date(agora + p.minutos * 60000).toISOString())
  const medido = p.ritmo.minutosMedidos !== null && p.ritmo.medidas >= 2
  const porPartida = Math.round(medido ? (p.ritmo.minutosMedidos as number) : p.minutosCalibrados)

  return (
    <div className="noite-painel">
      <div className="noite-topo">
        <div className="noite-contagem">
          <b>{p.jogadas}</b>
          <span>de {p.total} partidas</span>
        </div>
        {p.comecou && p.minutos > 0 ? (
          <div className="noite-fim" title="hora prevista do fim">
            <small>termina</small>
            <b>~{fim}</b>
          </div>
        ) : !p.comecou ? (
          <div className="noite-fim">
            <small>noite de</small>
            <b>~{formatarMinutos(p.minutos)}</b>
          </div>
        ) : null}
      </div>
      {p.inicioDaNoite && (
        <div className="noite-relogio">
          ▶️ Rolando há <b>{decorrido(p.inicioDaNoite, agora)}</b> · 1ª partida às {horaLocal(p.inicioDaNoite)}
        </div>
      )}

      <div
        className={`noite-barra${marca != null ? ' com-marca' : ''}`}
        role="progressbar"
        aria-label="Partidas jogadas"
        aria-valuemin={0}
        aria-valuemax={p.total}
        aria-valuenow={p.jogadas}
      >
        <span className="noite-jogadas" style={{ width: `${pctJogadas}%` }} />
        {pctJogando > 0 && <span className="noite-jogando" style={{ left: `${pctJogadas}%`, width: `${pctJogando}%` }} />}
        {marca != null && (
          <>
            <i className="noite-marca" style={{ left: `${marca * 100}%` }} />
            <small className="noite-marca-rotulo" aria-hidden="true" style={{ left: `clamp(30px, ${marca * 100}%, calc(100% - 30px))` }}>
              mata-mata
            </small>
          </>
        )}
      </div>

      <div className="noite-legenda">
        {p.comecou ? (
          <span>
            {p.falta > 0 ? `faltam ${plural(p.falta, 'partida')}` : 'falta montar a próxima fase'}
            {p.soFase2 ? ' + o mata-mata' : ''}
            {p.minutos > 0 ? ` · uns ${formatarMinutos(p.minutos)}` : ''}
          </span>
        ) : (
          <span>começa quando a 1ª partida entrar em quadra</span>
        )}
        {p.jogando > 0 && (
          <span className="noite-chip-jogando">
            <i /> {p.jogando} em quadra
          </span>
        )}
      </div>
      <div className="noite-rodape">
        🎾 Cada menina joga <strong>{p.jogosPorPessoa}</strong>
        {p.soFase2 ? ' na fase de grupos' : ''} · ⏱️ {medido ? `ritmo de hoje: ~${porPartida} min por partida` : `~${porPartida} min por partida`}
      </div>
    </div>
  )
}
