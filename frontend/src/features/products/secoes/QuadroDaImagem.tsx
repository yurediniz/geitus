import { useRef, useState, type DragEvent } from 'react'
import { ImageIcon, ImagePlus, Loader2, RefreshCw, RotateCw, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useUrlDoBlob, type ControleDaImagem } from '@/features/products/imagemPendente'
import { cn } from '@/lib/utils'

export interface QuadroDaImagemProps {
  imagem: ControleDaImagem
  /** Texto alternativo da foto. */
  nomeDoProduto: string
  /** OPERADOR: ve a imagem, sem botoes nem arrastar e soltar. */
  somenteLeitura: boolean
  /** Salvando: as acoes ficam desabilitadas. */
  desabilitado: boolean
  /** A imagem esta subindo (depois do Salvar). */
  enviando: boolean
  /** Uma mudanca na imagem (para limpar o aviso de sucesso, como os campos). */
  aoAlterar?: () => void
}

const ID_ERRO = 'imagem-erro'

/**
 * Quadro da imagem do produto na secao Geral (spec Fase F §5.1): a foto
 * inteira (sem cortar), "Sem imagem" sem ela, e as acoes Adicionar ou
 * Trocar, Girar e Remover. A mudanca so grava com o Salvar da tela. O
 * arrastar e soltar no quadro tem o botao como equivalente.
 */
export function QuadroDaImagem({
  imagem,
  nomeDoProduto,
  somenteLeitura,
  desabilitado,
  enviando,
  aoAlterar,
}: QuadroDaImagemProps) {
  const { gravada, pendente, processando, erro } = imagem
  const inputRef = useRef<HTMLInputElement>(null)
  const [arrastando, setArrastando] = useState(false)
  const [falhouAoCarregar, setFalhouAoCarregar] = useState<string | null>(null)

  const previa = useUrlDoBlob(pendente.tipo === 'nova' ? pendente.preparada.grande : null)
  const urlGravada = pendente.tipo === 'nenhuma' && gravada ? gravada.grandeUrl : null
  const src = pendente.tipo === 'nova' ? previa : urlGravada !== falhouAoCarregar ? urlGravada : null
  const temImagem = pendente.tipo === 'nova' || (pendente.tipo === 'nenhuma' && gravada !== null)
  const ocupado = processando || enviando
  const acoesDesabilitadas = desabilitado || ocupado
  const podeEditar = !somenteLeitura

  const escolher = (arquivo: File | undefined) => {
    if (arquivo) {
      aoAlterar?.()
      imagem.escolherArquivo(arquivo)
    }
  }

  const aoArrastarPorCima = (event: DragEvent<HTMLDivElement>) => {
    // So arquivos (arrastar um texto ou um link nao destaca o quadro).
    if (!podeEditar || acoesDesabilitadas || !Array.from(event.dataTransfer.types).includes('Files')) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setArrastando(true)
  }

  const aoSoltar = (event: DragEvent<HTMLDivElement>) => {
    if (!podeEditar || acoesDesabilitadas) {
      return
    }
    event.preventDefault()
    setArrastando(false)
    escolher(event.dataTransfer.files[0])
  }

  const abrirSeletor = () => inputRef.current?.click()

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div
        data-testid="quadro-da-imagem"
        data-arrastando={arrastando ? 'true' : undefined}
        onDragOver={aoArrastarPorCima}
        onDragLeave={() => setArrastando(false)}
        onDrop={aoSoltar}
        className={cn(
          // Os filhos nao recebem o arrasto: passar sobre a foto nao dispara o dragleave do quadro.
          'relative flex aspect-square w-full max-w-60 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted transition-colors sm:w-40 [&>*]:pointer-events-none',
          arrastando && 'bg-accent ring-2 ring-primary',
        )}
      >
        {ocupado ? (
          <p role="status" className="flex flex-col items-center gap-2 px-2 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Processando imagem…
          </p>
        ) : src ? (
          <img
            src={src}
            alt={nomeDoProduto}
            onError={() => setFalhouAoCarregar(src)}
            className="h-full w-full object-contain"
          />
        ) : temImagem && pendente.tipo === 'nova' ? null : (
          <p className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-8 w-8" aria-hidden="true" />
            Sem imagem
          </p>
        )}
      </div>

      {podeEditar && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {temImagem ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={abrirSeletor}
                  disabled={acoesDesabilitadas}
                  aria-label="Trocar imagem"
                >
                  <RefreshCw aria-hidden="true" />
                  Trocar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                    aoAlterar?.()
                    imagem.girar()
                  }}
                  disabled={acoesDesabilitadas}
                  aria-label="Girar imagem"
                >
                  <RotateCw aria-hidden="true" />
                  Girar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 text-destructive hover:text-destructive"
                  onClick={() => {
                    aoAlterar?.()
                    imagem.remover()
                  }}
                  disabled={acoesDesabilitadas}
                  aria-label="Remover imagem"
                >
                  <Trash2 aria-hidden="true" />
                  Remover
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={abrirSeletor}
                disabled={acoesDesabilitadas}
                aria-describedby={erro ? ID_ERRO : undefined}
              >
                <ImagePlus aria-hidden="true" />
                Adicionar imagem
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            JPG, PNG ou WebP, até 15 MB. Você também pode arrastar a foto até o quadro.
          </p>
          {/* A mensagem chega depois da compressao: o alert a anuncia. */}
          {erro && (
            <p id={ID_ERRO} role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            aria-label="Escolher a imagem do produto"
            tabIndex={-1}
            className="hidden"
            onChange={(event) => {
              const arquivo = event.target.files?.[0]
              // Limpo para escolher o mesmo arquivo de novo disparar o change.
              event.target.value = ''
              escolher(arquivo)
            }}
          />
        </div>
      )}
    </div>
  )
}
