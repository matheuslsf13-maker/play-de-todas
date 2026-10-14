import { ligaDe } from '../liga.config'

/** A liga deste build (VITE_LIGA no momento do build; padrao: feminino). */
export const LIGA = ligaDe(import.meta.env.VITE_LIGA as string | undefined)

/**
 * O logo, com a versao do build na URL. O arquivo nao tem hash no nome e o
 * service worker serve imagens do cache primeiro: sem a versao, quem ja tinha
 * aberto o app continuava vendo o logo antigo depois de um deploy (aconteceu
 * na troca para o Play de Terca).
 */
export const URL_DO_LOGO = `${import.meta.env.BASE_URL}logo.png?v=${__VERSAO__}`
