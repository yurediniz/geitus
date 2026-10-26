import { useState } from 'react'
import { Package } from 'lucide-react'

import { cn } from '@/lib/utils'

/** A miniatura do produto no PDV; sem imagem (ou se ela falhar), o icone neutro. */
export function MiniaturaDoProduto({ url, className }: { url: string | null; className?: string }) {
  const [falhou, setFalhou] = useState(false)
  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted', className)}>
      {url && !falhou ? (
        <img src={url} alt="" decoding="async" onError={() => setFalhou(true)} className="h-full w-full object-contain" />
      ) : (
        <Package className="size-1/3 min-h-5 min-w-5 text-muted-foreground/60" aria-hidden="true" />
      )}
    </div>
  )
}
