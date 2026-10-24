import { useState } from 'react'
import { ImageIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { ImagemDoProduto } from '@/types/produto'

export interface MiniaturaDoProdutoProps {
  imagem: ImagemDoProduto | null
  /** Tabela: quadro de 40 px; card: 56 px (spec Fase F §5.2). */
  tamanho: 'tabela' | 'card'
}

/**
 * Miniatura do produto na lista: a foto inteira no quadro, carregada sem
 * pressa e decorativa (`alt` vazio, o nome ja esta ao lado). Sem imagem, ou
 * se ela falhar ao carregar (URL vencida numa aba antiga), o icone neutro, no
 * mesmo tamanho, sem mexer no layout.
 */
export function MiniaturaDoProduto({ imagem, tamanho }: MiniaturaDoProdutoProps) {
  const [urlQueFalhou, setUrlQueFalhou] = useState<string | null>(null)
  const url = imagem?.miniaturaUrl ?? null
  const mostrarFoto = url !== null && url !== urlQueFalhou

  return (
    <div
      data-miniatura=""
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted',
        tamanho === 'tabela' ? 'size-10' : 'size-14',
      )}
    >
      {mostrarFoto ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setUrlQueFalhou(url)}
          className="h-full w-full object-contain"
        />
      ) : (
        <ImageIcon
          className={cn('text-muted-foreground/70', tamanho === 'tabela' ? 'size-4' : 'size-5')}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
