import { useEffect, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, Plus, ScanBarcode, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  MAXIMO_CODIGOS_BARRAS,
  avaliarNovoCodigo,
  type FormatosGravados,
} from '@/features/products/produtoFormulario'
import { detectarFormato } from '@/lib/codigoBarras'
import { cn } from '@/lib/utils'
import type { FormatoCodigoBarras } from '@/types/produto'

const AVISO_FORMATO_OUTRO =
  'Formato não reconhecido (não é EAN-8, EAN-13 nem UPC-A). Confira antes de salvar.'

const ROTULO_FORMATO: Readonly<Record<FormatoCodigoBarras, string>> = {
  EAN13: 'EAN-13',
  EAN8: 'EAN-8',
  UPCA: 'UPC-A',
  OUTRO: 'Outro formato',
}

/** Id do campo "Adicionar código" (o mesmo nas duas variantes: so uma aba fica montada). */
const ID_ENTRADA = 'codigosBarras'

export interface CampoCodigosBarrasProps {
  /** Codigos na ordem de exibicao (o primeiro aparece na listagem). */
  valor: string[]
  onChange: (valor: string[]) => void
  /** Texto digitado e ainda nao adicionado (controlado: fica no formulario). */
  entrada: string
  onEntradaChange: (entrada: string) => void
  /** Por que o texto digitado nao entrou na lista (repetido, digito invalido, limite). */
  erroEntrada?: string
  onErroEntradaChange: (erro: string | null) => void
  /**
   * Formatos dos codigos ja gravados no produto. Um codigo gravado como `OUTRO`
   * (ex.: EAN-13 migrado com digito invalido) e mantido sem bloqueio, como faz
   * o backend; so codigo novo com digito invalido e barrado.
   */
  formatosGravados: FormatosGravados
  desabilitado?: boolean
  /** Erro do formulario ou do backend (400/409) sobre os codigos. */
  erro?: string
  /**
   * `completa` (aba Codigos): lista com formato, reordenar e remover.
   * `compacta` (aba Geral): so adicionar e os codigos em etiquetas, com remover.
   */
  variante?: 'completa' | 'compacta'
}

/** Elemento que recebe o foco depois de reordenar ou remover. */
type FocoPendente = { tipo: 'entrada' } | { tipo: 'mover'; codigo: string; direcao: 'cima' | 'baixo' }

function idBotaoMover(codigo: string, direcao: 'cima' | 'baixo'): string {
  return `codigo-${direcao}-${codigo}`
}

/**
 * Codigos de barras do produto: adicionar (pensado para o leitor, que "digita"
 * o codigo e um Enter), remover e, na variante completa, reordenar com setas.
 * O formato e reconhecido pelo conteudo, como no backend.
 */
export function CampoCodigosBarras({
  valor,
  onChange,
  entrada,
  onEntradaChange,
  erroEntrada,
  onErroEntradaChange,
  formatosGravados,
  desabilitado = false,
  erro,
  variante = 'completa',
}: CampoCodigosBarrasProps) {
  const [anuncio, setAnuncio] = useState('')
  const [focoPendente, setFocoPendente] = useState<FocoPendente | null>(null)
  const compacta = variante === 'compacta'

  // Foco depois do render que reordenou/removeu: o botao da seta fica
  // desabilitado nas pontas, entao cai na outra seta do mesmo codigo.
  useEffect(() => {
    if (!focoPendente) {
      return
    }
    let alvo: HTMLElement | null
    if (focoPendente.tipo === 'entrada') {
      alvo = document.getElementById(ID_ENTRADA)
    } else {
      const outra = focoPendente.direcao === 'cima' ? 'baixo' : 'cima'
      const mesma = document.getElementById(idBotaoMover(focoPendente.codigo, focoPendente.direcao))
      alvo =
        mesma instanceof HTMLButtonElement && !mesma.disabled
          ? mesma
          : document.getElementById(idBotaoMover(focoPendente.codigo, outra))
    }
    alvo?.focus()
    setFocoPendente(null)
  }, [focoPendente])

  /** Codigo novo (nao gravado) com formato desconhecido: merece o aviso amarelo. */
  const ehOutroNovo = (codigo: string) =>
    !formatosGravados.has(codigo) && detectarFormato(codigo) === 'OUTRO'

  const adicionar = () => {
    const resultado = avaliarNovoCodigo(entrada, valor, formatosGravados)
    if (resultado.tipo === 'vazio') {
      onEntradaChange('')
      return
    }
    if (resultado.tipo === 'bloqueado') {
      // Mantem o texto para o usuario conferir a leitura.
      onErroEntradaChange(resultado.motivo)
      return
    }
    onChange(resultado.lista)
    onEntradaChange('')
    onErroEntradaChange(null)
    setAnuncio(`Código ${resultado.codigo} adicionado.`)
  }

  const aoTeclar = (event: KeyboardEvent<HTMLInputElement>) => {
    // Leitor de codigo de barras termina com Enter: adiciona, nunca envia o formulario.
    // Com Ctrl/Cmd e o atalho de salvar: fica para o formulario (que adiciona o pendente).
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      adicionar()
    }
  }

  const remover = (codigo: string) => {
    onChange(valor.filter((item) => item !== codigo))
    onErroEntradaChange(null)
    setAnuncio(`Código ${codigo} removido.`)
    setFocoPendente({ tipo: 'entrada' })
  }

  const mover = (indice: number, direcao: 'cima' | 'baixo') => {
    const destino = direcao === 'cima' ? indice - 1 : indice + 1
    if (destino < 0 || destino >= valor.length) {
      return
    }
    const nova = [...valor]
    const [codigo] = nova.splice(indice, 1)
    nova.splice(destino, 0, codigo)
    onChange(nova)
    setAnuncio(`Código ${codigo} movido para a posição ${destino + 1} de ${nova.length}.`)
    setFocoPendente({ tipo: 'mover', codigo, direcao })
  }

  const erroExibido = erroEntrada ?? erro
  const idAjuda = `${ID_ENTRADA}-ajuda`
  const idErro = `${ID_ENTRADA}-erro`
  const descricaoIds = [idAjuda, erroExibido ? idErro : null].filter(Boolean).join(' ')
  const ajuda = compacta
    ? 'Leia com o leitor ou digite e tecle Enter. Para reordenar, use a aba Códigos.'
    : `Até ${MAXIMO_CODIGOS_BARRAS} códigos. O primeiro é o exibido na lista de produtos.`

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={ID_ENTRADA} className="text-sm font-medium">
          {compacta ? 'Adicionar código de barras' : 'Adicionar código'}
        </label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <ScanBarcode
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id={ID_ENTRADA}
              value={entrada}
              onChange={(event) => {
                onEntradaChange(event.target.value)
                if (erroEntrada) {
                  onErroEntradaChange(null)
                }
              }}
              onKeyDown={aoTeclar}
              disabled={desabilitado}
              autoComplete="off"
              inputMode="text"
              placeholder={compacta ? 'Leia ou digite o código' : 'Leia com o leitor ou digite e tecle Enter'}
              aria-invalid={erroExibido ? true : undefined}
              aria-describedby={descricaoIds}
              className="h-11 pl-9 tabular-nums"
            />
          </div>
          <Button type="button" variant="outline" onClick={adicionar} disabled={desabilitado} className="h-11">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Adicionar
          </Button>
        </div>
        <p id={idAjuda} className="text-xs text-muted-foreground">
          {ajuda}
        </p>
        {erroExibido && (
          <p id={idErro} role="alert" className="text-sm text-destructive">
            {erroExibido}
          </p>
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {anuncio}
      </p>

      {compacta ? (
        <EtiquetasCodigos valor={valor} ehOutroNovo={ehOutroNovo} desabilitado={desabilitado} onRemover={remover} />
      ) : valor.length === 0 ? (
        <p className="rounded-md bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
          Nenhum código de barras cadastrado.
        </p>
      ) : (
        <ol aria-label="Códigos de barras do produto" className="space-y-2">
          {valor.map((codigo, indice) => {
            const formato = formatosGravados.get(codigo) ?? detectarFormato(codigo)
            const outro = formato === 'OUTRO'
            // Com um unico codigo nao ha o que reordenar: as setas somem.
            const podeReordenar = valor.length > 1
            return (
              <li key={codigo} className="rounded-md bg-muted/40 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1 font-medium break-all tabular-nums">{codigo}</span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                      outro ? 'bg-warning-soft text-warning-soft-foreground' : 'bg-info-soft text-info-soft-foreground',
                    )}
                  >
                    {outro && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
                    {ROTULO_FORMATO[formato]}
                  </span>
                  {indice === 0 && podeReordenar && <span className="text-xs text-muted-foreground">Principal</span>}
                  <div className="flex items-center">
                    {podeReordenar && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          id={idBotaoMover(codigo, 'cima')}
                          className="size-11"
                          onClick={() => mover(indice, 'cima')}
                          disabled={desabilitado || indice === 0}
                          aria-label={`Mover código ${codigo} para cima`}
                        >
                          <ArrowUp aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          id={idBotaoMover(codigo, 'baixo')}
                          className="size-11"
                          onClick={() => mover(indice, 'baixo')}
                          disabled={desabilitado || indice === valor.length - 1}
                          aria-label={`Mover código ${codigo} para baixo`}
                        >
                          <ArrowDown aria-hidden="true" />
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 text-muted-foreground hover:text-destructive"
                      onClick={() => remover(codigo)}
                      disabled={desabilitado}
                      aria-label={`Remover código ${codigo}`}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                {/* Aviso so para o que entrou agora: o gravado ja foi conferido (fica so o selo). */}
                {ehOutroNovo(codigo) && <p className="mt-1 text-xs text-warning-soft-foreground">{AVISO_FORMATO_OUTRO}</p>}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

interface EtiquetasCodigosProps {
  valor: string[]
  ehOutroNovo: (codigo: string) => boolean
  desabilitado: boolean
  onRemover: (codigo: string) => void
}

/** Variante compacta: os codigos em etiquetas, com remover (reordenar fica na aba Codigos). */
function EtiquetasCodigos({ valor, ehOutroNovo, desabilitado, onRemover }: EtiquetasCodigosProps) {
  if (valor.length === 0) {
    return null
  }
  const temOutroNovo = valor.some(ehOutroNovo)
  return (
    <div className="space-y-1.5">
      <ul aria-label="Códigos de barras do produto" className="flex flex-wrap gap-2">
        {valor.map((codigo) => {
          const outro = ehOutroNovo(codigo)
          return (
            <li
              key={codigo}
              className={cn(
                'inline-flex max-w-full items-center gap-1 rounded-md pl-3 text-sm font-medium tabular-nums',
                outro ? 'bg-warning-soft text-warning-soft-foreground' : 'bg-muted',
              )}
            >
              {outro && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              <span className="min-w-0 break-all">{codigo}</span>
              {outro && <span className="sr-only">(formato não reconhecido)</span>}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onRemover(codigo)}
                disabled={desabilitado}
                aria-label={`Remover código ${codigo}`}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          )
        })}
      </ul>
      {temOutroNovo && <p className="text-xs text-warning-soft-foreground">{AVISO_FORMATO_OUTRO}</p>}
    </div>
  )
}
