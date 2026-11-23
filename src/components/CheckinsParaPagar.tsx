import { useStore } from '../lib/store'
import { checkinJaFeito, contasDaAtleta, creditosDeCheckin, nomeDoTitular } from '../lib/checkins'
import { dateLabel } from '../lib/types'

/*
 * CHECK-INS PARA PAGAR (dono, 18/11): N check-ins, cada um com dia, conta e arena ("Check-in 2 de 2"), para
 * pagar divida de play (💰) ou a falta da mensalidade (ficha). Trava um check-in por conta por dia, em todos
 * os tipos (`checkinJaFeito`); se o dia ja tem um check-in de credito sem uso, oferece usar ele (so no 💰).
 */

export type CheckinParaPagar = { date: string; contaId: string | null; localId: string | null; credito?: string }

/** O problema de cada linha (nulo = ok). `outros`: check-ins que a mesma tela ja vai gravar (ex.: o do play). */
export function problemasDosCheckins(
  data: ReturnType<typeof useStore>['data'],
  playerId: string,
  linhas: CheckinParaPagar[],
  outros: { date: string; contaId: string | null }[] = [],
  ignorar: string[] = [],
): (string | null)[] {
  return linhas.map((l, i) => {
    if (l.credito) return null
    if (!l.date) return 'Escolha o dia.'
    if (!l.localId) return 'Escolha a arena.'
    const mesmo = (x: { date: string; contaId: string | null }) => x.date === l.date && x.contaId === l.contaId
    if (outros.some(mesmo) || linhas.slice(0, i).some((x) => !x.credito && mesmo(x))) return 'Esta conta já tem outro check-in neste dia, nesta mesma tela.'
    const ja = checkinJaFeito(data, playerId, l.contaId, l.date, ignorar)
    return ja ? `O check-in desta conta em ${dateLabel(l.date).slice(0, 5)} ${ja.texto}. Escolha outro dia ou outra conta.` : null
  })
}

export function CheckinsParaPagar({ playerId, linhas, onMudar, max, valorDeCada, aceitaCredito = false, creditoOcupado, outros, ignorar }: {
  playerId: string
  linhas: CheckinParaPagar[]
  onMudar: (l: CheckinParaPagar[]) => void
  max: number
  valorDeCada: number
  aceitaCredito?: boolean
  /** O check-in de credito que o proprio play desta tela usa: nao pode pagar a divida tambem. */
  creditoOcupado?: string | null
  outros?: { date: string; contaId: string | null }[]
  ignorar?: string[]
}) {
  const { data, nameOf } = useStore()
  const contas = contasDaAtleta(data, playerId)
  const locais = data.checkinLocais.filter((l) => l.ativo).sort((a, b) => a.ordem - b.ordem)
  const problemas = problemasDosCheckins(data, playerId, linhas, outros, ignorar)
  const creditos = aceitaCredito ? creditosDeCheckin(data, playerId, ignorar?.[0]).filter((c) => c.checkin.id !== creditoOcupado) : []
  const mudar = (i: number, m: Partial<CheckinParaPagar>) => onMudar(linhas.map((l, j) => (j === i ? { ...l, ...m } : l)))
  const nova = (): CheckinParaPagar => {
    // o check-in de credito livre ja vem preenchido (dono, 18/11): mostra o dia que ela tem; tocar em Trocar solta
    const livre = creditos.find((c) => !linhas.some((x) => x.credito === c.checkin.id))
    if (livre?.quando) return { date: livre.quando, contaId: null, localId: null, credito: livre.checkin.id }
    const ultima = linhas[linhas.length - 1]
    const principal = contas.find((c) => c.principal) ?? contas[0]
    return { date: '', contaId: ultima?.contaId ?? null, localId: ultima?.localId ?? principal?.local_padrao_id ?? locais[0]?.id ?? null }
  }
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row spread">
        <span className="small"><strong>Quantos check-ins</strong> <span className="muted">(R$ {valorDeCada.toFixed(2).replace('.', ',')} cada)</span></span>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn ghost sm" style={{ minWidth: 44, minHeight: 44 }} aria-label="Um check-in a menos" disabled={linhas.length === 0} onClick={() => onMudar(linhas.slice(0, -1))}>−</button>
          <strong style={{ minWidth: 20, textAlign: 'center' }}>{linhas.length}</strong>
          <button className="btn ghost sm" style={{ minWidth: 44, minHeight: 44 }} aria-label="Um check-in a mais" disabled={linhas.length >= max} onClick={() => onMudar([...linhas, nova()])}>+</button>
        </div>
      </div>
      {linhas.map((l, i) => {
        const ja = !l.credito && l.date ? checkinJaFeito(data, playerId, l.contaId, l.date, ignorar) : null
        const conta = contas.find((c) => (l.contaId === null ? c.principal : c.id === l.contaId))
        return (
          <div key={i} className="checkin-pagar">
            <div className="tiny muted" style={{ fontWeight: 700 }}>Check-in {i + 1} de {linhas.length}</div>
            {l.credito ? (
              <div className="row spread" style={{ gap: 8 }}>
                <span className="small valor-pos">Usa o check-in do dia {dateLabel(l.date).slice(0, 5)} (crédito, não gasta cota)</span>
                <button className="btn ghost sm" onClick={() => mudar(i, { credito: undefined, date: '' })}>Trocar</button>
              </div>
            ) : (
              <>
                <label className="field">
                  <span>Dia do check-in</span>
                  <input className="input" type="date" value={l.date} onChange={(e) => mudar(i, { date: e.target.value })} />
                </label>
                {contas.length > 1 && (
                  <div className="row wrap" style={{ gap: 6 }}>
                    {contas.map((c) => (
                      <button key={c.id} className={`chip ${conta?.id === c.id ? 'on' : ''}`} aria-pressed={conta?.id === c.id}
                        onClick={() => mudar(i, { contaId: c.principal ? null : c.id, ...(c.local_padrao_id ? { localId: c.local_padrao_id } : {}) })}>
                        {nomeDoTitular(c, nameOf(playerId))}
                      </button>
                    ))}
                  </div>
                )}
                <div className="row wrap" style={{ gap: 6 }}>
                  {locais.map((x) => (
                    <button key={x.id} className={`chip ${l.localId === x.id ? 'on' : ''}`} aria-pressed={l.localId === x.id} onClick={() => mudar(i, { localId: x.id })}>{x.nome}</button>
                  ))}
                </div>
                {problemas[i] && l.date && <span className="hint aviso" role="alert">⚠️ {problemas[i]}</span>}
                {(() => {
                  // o check-in de credito vale para o play OU para a divida, nunca os dois; escolhido numa linha, some das outras
                  const livres = creditos.filter((c) => !linhas.some((x) => x.credito === c.checkin.id))
                  if (livres.length === 0) return null
                  return (
                    <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
                      <span className="tiny muted">ou usar o check-in do dia</span>
                      {livres.map((c) => (
                        <button key={c.checkin.id} className={`chip ${ja?.credito?.id === c.checkin.id ? 'on' : ''}`} onClick={() => mudar(i, { credito: c.checkin.id, date: c.quando ?? l.date })}>
                          {c.quando ? dateLabel(c.quando).slice(0, 5) : '?'}
                        </button>
                      ))}
                    </div>
                  )
                })()}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
