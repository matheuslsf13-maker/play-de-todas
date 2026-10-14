import { LIGA } from '../liga'

export type Genero = 'F' | 'M'

/**
 * SO NO APP MISTO: de qual campeonato a pessoa e. O cadastro vai para la -- o
 * Play de Todas ou o Play de Terca -- e ela aparece no app dele na hora. Nos
 * outros apps nao aparece nada.
 */
export default function EscolherGenero({ valor, onChange }: { valor: Genero | null; onChange: (g: Genero) => void }) {
  if (LIGA.id !== 'misto') return null
  return (
    <div className="field">
      <span>Campeonato</span>
      <div className="row wrap" style={{ gap: 6 }}>
        <button type="button" className={`chip ${valor === 'F' ? 'on' : 'off'}`} onClick={() => onChange('F')}>
          ♀ Feminino (Play de Todas)
        </button>
        <button type="button" className={`chip ${valor === 'M' ? 'on' : 'off'}`} onClick={() => onChange('M')}>
          ♂ Masculino (Play de Terça)
        </button>
      </div>
    </div>
  )
}

/** No misto o genero e obrigatorio; nos outros apps nao existe. */
export const precisaDeGenero = LIGA.id === 'misto'
