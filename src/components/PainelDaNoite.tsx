import { useEffect, useState } from 'react'
import { formatarMinutos, horaLocal, type RitmoDaNoite } from '../lib/previsaoDaNoite'
import { plural } from '../lib/types'

/** Re-desenha a cada 20 s: a hora prevista do fim anda sozinha com a tela parada. */
function useAgora(): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 20000)
    return () => window.clearInterval(t)
  }, [])
  return agora
}

/** "12:34" ou "1:05:32": quanto passou desde `iso`, segundo a segundo. */
export function cronometro(iso: string, agora: number): string {
  const seg = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 1000))
  const h = Math.floor(seg / 3600)
  const mm = String(Math.floor((seg % 3600) / 60)).padStart(2, '0')
  const ss = String(seg % 60).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Cronometro que anda sozinho; so ele re-desenha a cada segundo, nao a tela toda. */
function Cronometro({ desde }: { desde: string }) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  return <span className="cronometro">{cronometro(desde, agora)}</span>
}

/** "● AO VIVO 12:34": bolinha verde pulsando + o tempo desde `desde`. */
export function AoVivo({ desde }: { desde: string }) {
  return (
    <span className="ao-vivo">
      <i className="ponto-vivo" aria-hidden="true" />
      Ao vivo <Cronometro desde={desde} />
    </span>
  )
}

/** Quadra com partida separada, mas sem "Partida iniciada": bolinha vermelha pulsando. */
export function AguardandoInicio() {
  return (
    <span className="aguardando-inicio">
      <i className="ponto-vivo vermelho" aria-hidden="true" />
      Aguardando início
    </span>
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
          <AoVivo desde={p.inicioDaNoite} /> <span>· 1ª partida às {horaLocal(p.inicioDaNoite)}</span>
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
        {/* o "em quadra" nasce do zero, por baixo das jogadas: as duas partes ficam coladas, sem o vao das pontas redondas */}
        {pctJogando > 0 && <span className="noite-jogando" style={{ width: `${pctJogadas + pctJogando}%`, ['--s' as string]: `${(pctJogadas / (pctJogadas + pctJogando)) * 100}%` }} />}
        <span className={`noite-jogadas brilho-vivo${pctJogando > 0 ? ' colada' : ''}`} style={{ width: `${pctJogadas}%` }} />
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
