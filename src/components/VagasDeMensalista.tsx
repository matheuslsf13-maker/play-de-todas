import { useState } from 'react'
import { useStore } from '../lib/store'
import { plural } from '../lib/types'
import { CHAVE_DO_LIMITE, filaDeEspera, limiteDeMensalistas, mensalistasAtivas, vagasLivres } from '../lib/vagasDeMensalista'

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

  function salvarLimite() {
    const n = Number(texto)
    if (!Number.isInteger(n) || n < 0) return onToast('Digite um número inteiro.')
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
      <p className="tiny muted" style={{ margin: '6px 0 0' }}>
        {vagas > 0 ? `${plural(vagas, 'vaga livre', 'vagas livres')}.` : 'Lotado: quem pedir entra na lista de espera.'}
        {ocupadas > limite && ` ${ocupadas - limite} acima do limite (ninguém sai sozinha).`}
      </p>
      {fila.length > 0 && (
        <div className="stack" style={{ gap: 6, marginTop: 10 }}>
          <strong className="small">⏳ Lista de espera</strong>
          {fila.map((p, i) => (
            <div key={p.id} className="row ficha-item" style={{ gap: 8 }}>
              <span className="muted" style={{ fontWeight: 800 }}>{i + 1}º</span>
              <span className="grow">{nameOf(p.id)}</span>
              {i === 0 && vagas > 0 && (
                <button
                  className="btn teal sm"
                  onClick={() => {
                    savePlayer({ ...p, categoria: 'mensalista', espera_mensalista: null, pago_mes: null, pago_avulso: false })
                    onToast(`${nameOf(p.id)} agora é mensalista`)
                  }}
                >
                  ✅ Tornar mensalista
                </button>
              )}
              <button
                className="btn ghost sm"
                aria-label={`Tirar ${nameOf(p.id)} da espera`}
                onClick={() => {
                  if (!confirm(`Tirar ${nameOf(p.id)} da lista de espera?`)) return
                  savePlayer({ ...p, espera_mensalista: null })
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {vagas > 0 && <span className="hint">Abriu vaga: a próxima é <strong>{nameOf(fila[0].id)}</strong>. Confirme quando ela topar.</span>}
        </div>
      )}
    </div>
  )
}
