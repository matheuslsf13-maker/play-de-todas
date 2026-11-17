/**
 * Leva a leitura ao começo do conteúdo sem encostar no topo da página (dono, 17/11). No Safari do iPhone, rolar até
 * o y = 0 abre a barra do navegador e a tela dá um pulo: com a página rolada, a tela nova começa logo abaixo do topo
 * fino (o "Play de Todas" grande fica escondido, como estava); perto do topo, nada muda.
 */
export function subirAoConteudo() {
  const hero = document.querySelector('.topo-hero')
  const topo = document.querySelector('.topbar')
  if (!hero || !topo) return window.scrollTo(0, 0)
  const alvo = Math.max(0, Math.round(hero.getBoundingClientRect().bottom + window.scrollY - topo.getBoundingClientRect().height))
  if (window.scrollY > alvo) window.scrollTo(0, alvo)
}
