import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config'
import { LIGA } from '../liga'

// variavel de ambiente tem prioridade; senao usa o que estiver em src/config.ts
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || SUPABASE_URL
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || SUPABASE_ANON_KEY

export const hasSupabase = Boolean(url && key && url.startsWith('http'))

export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(url as string, key as string, {
      auth: { persistSession: true },
      // cada liga le e grava no seu schema: o masculino tem as mesmas tabelas,
      // com os mesmos nomes, em `masculino`; o login e o mesmo nas duas
      // (o `as` so acalma o tipo: as tabelas sao identicas nos dois schemas)
      db: { schema: LIGA.schema as 'public' },
    })
  : null
