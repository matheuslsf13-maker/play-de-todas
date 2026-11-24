import { useEffect, useRef } from 'react'
import { LIGA } from '../liga'
import { useStore } from './store'
import { naoRenovaram } from './vagasDeMensalista'

/**
 * DIA 6, QUEM NAO RENOVOU VIRA AVULSA SOZINHA (dono, 24/11): antes era o "Passar para avulsa" do cartao das
 * vagas. So grava logada e depois da 1a carga do banco (o cache do celular pode nao ter o Pix de quem pagou).
 * A divida ou o credito da ficha ficam (aba Mensalistas, ex-mensalistas); para voltar: Forma de pagamento.
 */
export function useQuemNaoRenovou() {
  const { data, canEdit, atualizado, savePlayer } = useStore()
  const feitas = useRef(new Set<string>())
  useEffect(() => {
    if (LIGA.id !== 'feminino' || !canEdit || !atualizado) return
    for (const p of naoRenovaram(data)) {
      if (feitas.current.has(p.id)) continue
      feitas.current.add(p.id)
      void savePlayer({ ...p, categoria: 'avulsa', espera_mensalista: null, pago_mes: null, pago_avulso: false })
    }
  }, [data, canEdit, atualizado, savePlayer])
}
