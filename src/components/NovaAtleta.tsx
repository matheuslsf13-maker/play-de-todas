import { useState } from 'react'
import ForcaInicial from './ForcaInicial'
import { Modal } from './ui'
import { CATEGORIAS, type Categoria } from '../lib/mensalidade'
import { normalizar } from '../lib/roster'
import { ELO_INICIAL } from '../lib/stats'
import { useStore } from '../lib/store'
import { uid, type Player } from '../lib/types'

/**
 * CADASTRAR NA HORA DE MONTAR O PLAY: a novata chegou e nao esta na lista.
 * Nome, quem paga e o nivel em tres toques -- e ela ja entra no play. Antes era
 * sair da tela, cadastrar em Meninas e voltar, perdendo a lista montada.
 */
export default function NovaAtleta({ onClose, onCriada }: { onClose: () => void; onCriada: (p: Player) => void }) {
  const { data, savePlayer } = useStore()
  const [nome, setNome] = useState('')
  const [apelido, setApelido] = useState('')
  const [categoria, setCategoria] = useState<Categoria>('isenta')
  const [forca, setForca] = useState(ELO_INICIAL)
  // ja existe alguem com esse nome? (o erro mais comum: cadastrar duas vezes)
  const chave = normalizar(nome)
  const parecida = chave.length >= 3
    ? data.players.find((p) => normalizar(p.name) === chave || normalizar(p.nickname ?? '') === chave)
    : undefined

  async function criar() {
    const n = nome.trim()
    if (!n) return
    const p: Player = {
      id: uid(),
      name: n,
      nickname: apelido.trim() || null,
      photo_url: null,
      active: true,
      created_at: new Date().toISOString(),
      categoria,
      pago_mes: null,
      pago_avulso: false,
      forca_inicial: forca === ELO_INICIAL ? null : forca,
    }
    await savePlayer(p)
    onCriada(p)
  }

  return (
    <Modal title="➕ Nova atleta" onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Nome</span>
          <input className="input" value={nome} autoFocus onChange={(e) => setNome(e.target.value)} />
        </label>
        {parecida && (
          <div className="banner warn" style={{ margin: 0 }}>
            Já existe <strong>{parecida.nickname?.trim() || parecida.name}</strong> no cadastro. Se for ela, feche e toque no
            nome dela na lista.
          </div>
        )}
        <label className="field">
          <span>Como o grupo chama (opcional)</span>
          <input className="input" value={apelido} onChange={(e) => setApelido(e.target.value)} />
        </label>
        <div className="field">
          <span>Quem paga</span>
          <div className="row wrap" style={{ gap: 6 }}>
            {CATEGORIAS.map((c) => (
              <button
                key={c.valor}
                type="button"
                className={`chip ${categoria === c.valor ? 'on' : 'off'}`}
                onClick={() => setCategoria(c.valor)}
              >
                {c.rotulo}
              </button>
            ))}
          </div>
        </div>
        <ForcaInicial valor={forca} onChange={setForca} />
        <button className="btn pink block" disabled={!nome.trim()} onClick={() => void criar()}>
          Cadastrar e colocar no play
        </button>
      </div>
    </Modal>
  )
}
