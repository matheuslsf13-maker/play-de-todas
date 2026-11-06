/**
 * ESMAECIDO NA BORDA DAS FILEIRAS ROLAVEIS (.chips-scroll)
 *
 * Abas como "Grupo 4" e "Grupo 5" ficavam escondidas a direita sem nada que
 * dissesse que da para arrastar. Aqui a fileira ganha a classe `mais-dir`
 * enquanto sobra conteudo a direita (o CSS faz o esmaecido) e perde ao chegar
 * no fim. Vale para toda .chips-scroll; so mede, nao mexe no conteudo.
 */
export function vigiarFileirasRolaveis(): () => void {
  const atualizar = (el: Element) => {
    const e = el as HTMLElement
    e.classList.toggle('mais-dir', e.scrollWidth - e.clientWidth - e.scrollLeft > 4)
  }
  const todas = () => document.querySelectorAll('.chips-scroll').forEach(atualizar)

  let quadro = 0
  const agendar = () => {
    cancelAnimationFrame(quadro)
    quadro = requestAnimationFrame(todas)
  }
  // scroll nao borbulha: captura serve para qualquer fileira, inclusive as de janelas
  const aoRolar = (ev: Event) => {
    if ((ev.target as Element | null)?.classList?.contains('chips-scroll')) atualizar(ev.target as Element)
  }
  document.addEventListener('scroll', aoRolar, true)
  window.addEventListener('resize', agendar)
  // so childList (nao atributos): trocar a classe nao dispara o proprio observador
  const obs = new MutationObserver(agendar)
  obs.observe(document.body, { childList: true, subtree: true, characterData: true })
  agendar()
  return () => {
    cancelAnimationFrame(quadro)
    document.removeEventListener('scroll', aoRolar, true)
    window.removeEventListener('resize', agendar)
    obs.disconnect()
  }
}
