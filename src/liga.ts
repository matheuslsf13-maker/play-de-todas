import { ligaDe } from '../liga.config'

/** A liga deste build (VITE_LIGA no momento do build; padrao: feminino). */
export const LIGA = ligaDe(import.meta.env.VITE_LIGA as string | undefined)
