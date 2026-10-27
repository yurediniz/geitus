import { useEffect, useRef, useState, type DragEvent } from 'react'
import { ImageIcon, ImageOff, ImagePlus, Loader2, RefreshCw, RotateCw, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useUrlDoBlob, type ControleDaImagem } from '@/features/products/imagemPendente'
import { cn } from '@/lib/utils'

/** Acao no quadro, avisada a pagina. */
export type AcaoNaImagem = 'escolher' | 'girar' | 'remover'

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
  /** O produto foi salvo e esta imagem nao subiu: o aviso pede um novo Salvar. */
  naoEnviada?: boolean
  /** Uma acao na imagem (a pagina limpa o aviso de sucesso e, no remover, a falha anterior). */
  aoAlterar?: (acao: AcaoNaImagem) => void
}

const ID_ERRO = 'imagem-erro'

const TEXTO_PROCESSANDO = 'Processando imagem…'
const TEXTO_ENVIANDO = 'Enviando imagem…'

/** Aviso da mudanca pendente, abaixo das acoes. */
function avisoDaPendencia(imagem: ControleDaImagem, naoEnviada: boolean): string | null {
  if (imagem.pendente.tipo === 'nova') {
    return naoEnviada
      ? 'Esta imagem ainda não foi enviada. Toque em Salvar para tentar de novo.'
      : 'Imagem nova. Ela será gravada quando você salvar.'
  }
  if (imagem.pendente.tipo === 'remover') {
    return 'A imagem será removida quando você salvar.'
  }
  return null
}

/** Texto da regiao `aria-live`: o que esta acontecendo ou o que acabou de acontecer. */
function textoDoAnuncio(imagem: ControleDaImagem, enviando: boolean): string {
  if (enviando) {
    return TEXTO_ENVIANDO
  }
  if (imagem.processando) {
    return TEXTO_PROCESSANDO
  }
  if (imagem.ultimoResultado === 'pronta') {
    return 'Imagem pronta.'
  }
  return imagem.ultimoResultado === 'removida' ? 'Imagem removida.' : ''
}

function arrastaArquivos(event: DragEvent<HTMLDivElement>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

/**
 * Quadro da imagem do produto na secao Geral (spec de Produtos): a foto
 * inteira (sem cortar), "Sem imagem" sem ela, e as acoes Adicionar ou
 * Trocar, Girar e Remover. A mudanca so grava com o Salvar da tela. O
 * arrastar e soltar no quadro tem o botao como equivalente; o andamento e
 * anunciado numa regiao `aria-live` sempre montada.
 */
export function QuadroDaImagem({
  imagem,
  nomeDoProduto,
  somenteLeitura,
  desabilitado,
  enviando,
  naoEnviada = false,
  aoAlterar,
}: QuadroDaImagemProps) {
  const { gravada, pendente, processando, erro } = imagem
  const inputRef = useRef<HTMLInputElement>(null)
  const trocarRef = useRef<HTMLButtonElement>(null)
  const adicionarRef = useRef<HTMLButtonElement>(null)
  /** Para onde o foco vai quando a acao terminar (o botao clicado sai da tela). */
  const focoAoTerminar = useRef<'trocar' | 'adicionar' | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const [falhouAoCarregar, setFalhouAoCarregar] = useState<string | null>(null)

  const previa = useUrlDoBlob(pendente.tipo === 'nova' ? pendente.preparada.grande : null)
  const urlGravada = pendente.tipo === 'nenhuma' && gravada ? gravada.grandeUrl : null
  const gravadaNaoCarregou = urlGravada !== null && urlGravada === falhouAoCarregar
  const src = pendente.tipo === 'nova' ? previa : gravadaNaoCarregou ? null : urlGravada
  const temImagem = pendente.tipo === 'nova' || (pendente.tipo === 'nenhuma' && gravada !== null)
  const ocupado = processando || enviando
  const aceitaArquivo = !somenteLeitura && !desabilitado && !ocupado
  const aviso = avisoDaPendencia(imagem, naoEnviada)

  useEffect(() => {
    if (processando || focoAoTerminar.current === null) {
      return
    }
    if (focoAoTerminar.current === 'trocar' && pendente.tipo === 'nova') {
      trocarRef.current?.focus()
    } else if (focoAoTerminar.current === 'adicionar' && !temImagem) {
      adicionarRef.current?.focus()
    }
    focoAoTerminar.current = null
  }, [processando, pendente, temImagem])

  const escolher = (arquivo: File | undefined) => {
    if (arquivo && aceitaArquivo) {
      aoAlterar?.('escolher')
      focoAoTerminar.current = 'trocar'
      imagem.escolherArquivo(arquivo)
    }
  }

  const girar = () => {
    // aria-disabled (e nao disabled) enquanto processa: o foco fica no botao.
    if (processando) {
      return
    }
    aoAlterar?.('girar')
    imagem.girar()
  }

  const remover = () => {
    if (processando) {
      return
    }
    aoAlterar?.('remover')
    focoAoTerminar.current = 'adicionar'
    imagem.remover()
  }

  const abrirSeletor = () => {
    if (!processando) {
      inputRef.current?.click()
    }
  }

  // Arquivo arrastado e sempre tratado aqui (mesmo ocupado ou no modo leitura): sem o
  // preventDefault, o navegador abriria a foto e sairia da pagina.
  const aoArrastarPorCima = (event: DragEvent<HTMLDivElement>) => {
    if (!arrastaArquivos(event)) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = aceitaArquivo ? 'copy' : 'none'
    setArrastando(aceitaArquivo)
  }

  const aoSoltar = (event: DragEvent<HTMLDivElement>) => {
    if (!arrastaArquivos(event)) {
      return
    }
    event.preventDefault()
    setArrastando(false)
    escolher(event.dataTransfer.files[0])
  }

  /** Props comuns dos botoes de acao: desabilitados ao salvar, aria-disabled ao processar. */
  const propsDaAcao = {
    type: 'button' as const,
    variant: 'outline' as const,
    disabled: desabilitado,
    'aria-disabled': processando || undefined,
    'aria-describedby': erro ? ID_ERRO : undefined,
  }
  const classeDaAcao = 'min-h-11 aria-disabled:cursor-wait aria-disabled:opacity-50'

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
          // O leitor de tela ouve pela regiao aria-live abaixo.
          <p aria-hidden="true" className="flex flex-col items-center gap-2 px-2 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {enviando ? TEXTO_ENVIANDO : TEXTO_PROCESSANDO}
          </p>
        ) : src ? (
          <img
            src={src}
            alt={nomeDoProduto}
            onError={() => setFalhouAoCarregar(src)}
            className="h-full w-full object-contain"
          />
        ) : pendente.tipo === 'nova' ? null : gravadaNaoCarregou ? (
          <p className="flex flex-col items-center gap-2 px-2 text-center text-sm text-muted-foreground">
            <ImageOff className="h-8 w-8" aria-hidden="true" />
            Não foi possível mostrar a imagem.
          </p>
        ) : (
          <p className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-8 w-8" aria-hidden="true" />
            Sem imagem
          </p>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {textoDoAnuncio(imagem, enviando)}
      </p>

      {!somenteLeitura && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {temImagem ? (
              <>
                <Button
                  {...propsDaAcao}
                  ref={trocarRef}
                  className={classeDaAcao}
                  onClick={abrirSeletor}
                  aria-label="Trocar imagem"
                >
                  <RefreshCw aria-hidden="true" />
                  Trocar
                </Button>
                <Button {...propsDaAcao} className={classeDaAcao} onClick={girar} aria-label="Girar imagem">
                  <RotateCw aria-hidden="true" />
                  Girar
                </Button>
                <Button
                  {...propsDaAcao}
                  className={cn(classeDaAcao, 'text-destructive hover:text-destructive')}
                  onClick={remover}
                  aria-label="Remover imagem"
                >
                  <Trash2 aria-hidden="true" />
                  Remover
                </Button>
              </>
            ) : (
              <Button {...propsDaAcao} ref={adicionarRef} className={classeDaAcao} onClick={abrirSeletor}>
                <ImagePlus aria-hidden="true" />
                Adicionar imagem
              </Button>
            )}
          </div>
          {aviso && <p className="text-xs text-muted-foreground">{aviso}</p>}
          <p className="text-xs text-muted-foreground">
            Foto em JPG, PNG ou WebP, até 15 MB.
            <span className="hidden pointer-fine:inline"> Ou arraste a foto até o quadro.</span>
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
