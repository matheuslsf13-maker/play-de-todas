import { useState, type CSSProperties } from 'react'
import { useStore } from '../lib/store'
import { plural, type Player } from '../lib/types'
import { categoriaDe } from '../lib/mensalidade'
import { VirarMensalista } from './VirarMensalista'
import { CHAVE_DO_LIMITE, filaDeEspera, geridaNaAbaMensalistas, limiteDeMensalistas, mensalistasAtivas, naoRenovaram, vagasLivres } from '../lib/vagasDeMensalista'

/*
 * 📅 VAGAS DE MENSALISTA (aba Meninas, so quem organiza; dono 07/11): quantas de quantas, o
 * limite editavel, a lista de espera na ordem do pedido e, com vaga aberta, a proxima com o
 * botao de confirmar (a organizadora decide; nada vira mensalista sozinho).
 */
export function VagasDeMensalista({ onToast }: { onToast: (m: string) => void }) {
  const { data, nameOf, savePlayer, saveAjuste } = useStore()
  const [editando, setEditando] = useState(false)
  const limite = limiteDeMensalistas(data)
  const [texto, setTexto] = useState(String(limite))
  const ocupadas = mensalistasAtivas(data).length
  const vagas = vagasLivres(data)
  const fila = filaDeEspera(data)
  const semRenovar = naoRenovaram(data)
  const exComSaldo = data.players.filter((p) => categoriaDe(p) !== 'mensalista' && geridaNaAbaMensalistas(data, p)).length
  const inativas = data.players.filter((p) => !p.active && categoriaDe(p) === 'mensalista').length
  /** A primeira da espera topou: abre o "Virar mensalista" (mes, valor e data do Pix; dono, 24/11). */
  const [topou, setTopou] = useState<Player | null>(null)

  // a ordem da espera e a data do pedido: trocar = trocar as datas (empate: a que sobe fica 1 ms antes)
  function trocar(i: number, j: number) {
    const a = fila[i], b = fila[j]
    const ta = a.espera_mensalista as string
    let tb = b.espera_mensalista as string
    if (ta === tb) tb = new Date(Date.parse(ta) + (j < i ? -1 : 1)).toISOString()
    savePlayer({ ...a, espera_mensalista: tb })
    savePlayer({ ...b, espera_mensalista: ta })
  }

  function salvarLimite() {
    const n = Number(texto)
    if (texto.trim() === '' || !Number.isInteger(n) || n < 0) return onToast('Digite um número inteiro.')
    try {
      saveAjuste({ id: CHAVE_DO_LIMITE, valor: n, updated_at: new Date().toISOString() })
      setEditando(false)
      onToast(`Limite de mensalistas: ${n}`)
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Não deu para salvar.')
    }
  }

  return (
    <div className="card">
      {topou && <VirarMensalista jogadora={topou} origem="fila" onClose={() => setTopou(null)} onToast={onToast} />}
      <div className="row spread" style={{ gap: 8 }}>
        <div className="section-title" style={{ margin: 0 }}>📅 Mensalistas: {ocupadas} de {limite}</div>
        {!editando && <button className="btn ghost sm" onClick={() => { setTexto(String(limite)); setEditando(true) }}>✏️ limite</button>}
      </div>
      {editando && (
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <input className="input" inputMode="numeric" style={{ width: 90 }} value={texto} onChange={(e) => setTexto(e.target.value)} />
          <button className="btn pink sm" onClick={salvarLimite}>Salvar</button>
          <button className="btn ghost sm" onClick={() => setEditando(false)}>Cancelar</button>
        </div>
      )}
      <div
        className={`vagas-barra${vagas <= 0 ? ' lotada' : ''}`}
        style={{ '--p': `${Math.min(100, (ocupadas / Math.max(1, limite)) * 100)}%` } as CSSProperties}
        role="progressbar"
        aria-valuenow={ocupadas}
        aria-valuemax={limite}
      >
        <span />
      </div>
      <p className="tiny muted" style={{ margin: '6px 0 0' }}>
        {vagas > 0 ? `${plural(vagas, 'vaga livre', 'vagas livres')}.` : 'Lotado: quem pedir entra na lista de espera.'}
        {ocupadas > limite && ` ${ocupadas - limite} acima do limite (ninguém sai sozinha).`}
      </p>
      {/* os numeros das telas nao batiam (revisao 08/11): diz o que conta na vaga e o que mais aparece na lista */}
      {(semRenovar.length > 0 || exComSaldo > 0 || inativas > 0) && (
        <p className="tiny muted" style={{ margin: '4px 0 0' }}>
          Na vaga contam só as ativas que renovaram.
          {semRenovar.length > 0 && ` A lista abaixo também tem ${plural(semRenovar.length, 'que não renovou', 'que não renovaram')}`}
          {exComSaldo > 0 && `${semRenovar.length > 0 ? ' e' : ' A lista abaixo também tem'} ${plural(exComSaldo, 'ex-mensalista com saldo', 'ex-mensalistas com saldo')}`}
          {(semRenovar.length > 0 || exComSaldo > 0) && '.'}
          {inativas > 0 && ` ${plural(inativas, 'mensalista inativa fica', 'mensalistas inativas ficam')} de fora.`}
        </p>
      )}
      {fila.length > 0 && (
        <div className="stack" style={{ gap: 6, marginTop: 10 }}>
          <strong className="small">⏳ Lista de espera</strong>
          {fila.map((p, i) => {
            const chamada = i === 0 && vagas > 0
            return (
              <div key={p.id} className={`ficha-item${chamada ? ' chamada' : ''}`}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="fila-pos" aria-label={`${i + 1}º`}>{i + 1}</span>
                  <span className="grow">{nameOf(p.id)}</span>
                  {/* a ordem da espera se troca na mao (dono, 24/11) */}
                  {i > 0 && <button className="btn ghost sm" aria-label={`Subir ${nameOf(p.id)} na fila`} onClick={() => trocar(i, i - 1)}>↑</button>}
                  {i < fila.length - 1 && <button className="btn ghost sm" aria-label={`Descer ${nameOf(p.id)} na fila`} onClick={() => trocar(i, i + 1)}>↓</button>}
                  {!chamada && <button className="btn ghost sm" aria-label={`Tirar ${nameOf(p.id)} da espera`} onClick={() => {
                    if (!confirm(`Tirar ${nameOf(p.id)} da lista de espera?`)) return
                    savePlayer({ ...p, espera_mensalista: null })
                  }}>✕</button>}
                </div>
                {chamada && (
                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                    <button className="btn ghost sm grow" aria-label={`${nameOf(p.id)} recusou`} onClick={() => {
                      if (!confirm(`${nameOf(p.id)} recusou a vaga? Ela sai da fila e a próxima é chamada.`)) return
                      savePlayer({ ...p, espera_mensalista: null })
                      onToast(`${nameOf(p.id)} saiu da fila`)
                    }}>Recusou</button>
                    <button className="btn teal sm grow" onClick={() => setTopou(p)}>✅ Topou e pagou</button>
                  </div>
                )}
              </div>
            )
          })}
          {vagas > 0 && (
            <span className="hint">Abriu vaga: chame <strong>{nameOf(fila[0].id)}</strong>. Pagou, toque em “Topou e pagou”; não quis, “Recusou” e a próxima é chamada.</span>
          )}
        </div>
      )}
    </div>
  )
}
