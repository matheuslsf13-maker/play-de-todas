/* O enquadramento da foto na arte do podio (poster.ts) e na tela "Ajustar a foto" (BotoesDeFoto): a mesma conta nos dois. */

/** A faixa de cima da arte onde a foto aparece (o resto e o fundo escuro dos paineis). */
export const LARGURA_DA_ARTE = 1080
export const ALTURA_DA_FOTO = 820
/** Onde a foto comeca a sumir no escuro (fracao da ALTURA_DA_FOTO). */
export const INICIO_DO_SUMICO = 0.78

/** zoom >= 1 sobre o "cobrir a janela"; cx/cy = o ponto da foto (0 a 1) que fica no centro da janela. */
export type Enquadre = { zoom: number; cx: number; cy: number }
export const ENQUADRE_PADRAO: Enquadre = { zoom: 1, cx: 0.5, cy: 0.4 }

/** Onde desenhar a foto para cobrir a janela com o enquadre, sem deixar borda vazia. */
export function enquadrarFoto(fw: number, fh: number, jw: number, jh: number, e: Enquadre = ENQUADRE_PADRAO) {
  const escala = Math.max(jw / fw, jh / fh) * Math.max(1, e.zoom)
  const w = fw * escala
  const h = fh * escala
  const x = Math.min(0, Math.max(jw - w, jw / 2 - e.cx * w))
  const y = Math.min(0, Math.max(jh - h, jh / 2 - e.cy * h))
  return { x, y, w, h }
}
