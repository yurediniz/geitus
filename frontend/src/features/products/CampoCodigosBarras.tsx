import { useEffect, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, Plus, ScanBarcode, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MAXIMO_CODIGOS_BARRAS } from '@/features/products/produtoFormulario'
import {
  detectarFormato,
  digitoVerificadorValido,
  ehCandidatoGs1,
  normalizarCodigo,
} from '@/lib/codigoBarras'
import { cn } from '@/lib/utils'
import type { FormatoCodigoBarras } from '@/types/produto'

/** Tamanho maximo de um codigo (coluna `VARCHAR(50)` do backend). */
const TAMANHO_MAXIMO_CODIGO = 50

const MENSAGEM_CODIGO_REPETIDO = 'Este código já está na lista.'
const MENSAGEM_DIGITO_INVALIDO = 'Dígito verificador inválido. Confira a leitura.'
const MENSAGEM_LIMITE_CODIGOS = `Limite de ${MAXIMO_CODIGOS_BARRAS} códigos de barras atingido.`
const MENSAGEM_CODIGO_LONGO = `O código deve ter no máximo ${TAMANHO_MAXIMO_CODIGO} caracteres.`
const AVISO_FORMATO_OUTRO =
  'Formato não reconhecido (não é EAN-8, EAN-13 nem UPC-A). Confira antes de salvar.'

const ROTULO_FORMATO: Readonly<Record<FormatoCodigoBarras, string>> = {
  EAN13: 'EAN-13',
  EAN8: 'EAN-8',
  UPCA: 'UPC-A',
  OUTRO: 'Outro formato',
}

export interface CampoCodigosBarrasProps {
  /** Codigos na ordem de exibicao (o primeiro aparece na listagem). */
  valor: string[]
  /**
   * Formatos dos codigos ja gravados no produto. Um codigo gravado como `OUTRO`
   * (ex.: EAN-13 migrado com digito invalido) e mantido sem bloqueio, como faz
   * o backend; so codigo novo com digito invalido e barrado.
   */
  formatosGravados: Record<string, FormatoCodigoBarras>
  onChange: (valor: string[]) => void
  desabilitado?: boolean
  /** Erro do formulario ou do backend (400/409) sobre os codigos. */
  erro?: string
}

/** Elemento que recebe o foco depois de reordenar ou remover. */
type FocoPendente = { tipo: 'entrada' } | { tipo: 'mover'; codigo: string; direcao: 'cima' | 'baixo' }

/** Por que o codigo nao pode entrar na lista (null = pode). */
function motivoBloqueio(
  codigo: string,
  lista: string[],
  formatosGravados: Record<string, FormatoCodigoBarras>,
): string | null {
  if (lista.includes(codigo)) {
    return MENSAGEM_CODIGO_REPETIDO
  }
  if (lista.length >= MAXIMO_CODIGOS_BARRAS) {
    return MENSAGEM_LIMITE_CODIGOS
  }
  if (codigo.length > TAMANHO_MAXIMO_CODIGO) {
    return MENSAGEM_CODIGO_LONGO
  }
  const jaGravado = formatosGravados[codigo] !== undefined
  if (!jaGravado && ehCandidatoGs1(codigo) && !digitoVerificadorValido(codigo)) {
    return MENSAGEM_DIGITO_INVALIDO
  }
  return null
}

function idBotaoMover(codigo: string, direcao: 'cima' | 'baixo'): string {
  return `codigo-${direcao}-${codigo}`
}

/**
 * Lista de codigos de barras do produto: adicionar (pensado para o leitor,
 * que "digita" o codigo e um Enter), remover e reordenar com setas.
 * O formato e reconhecido pelo conteudo, como no backend.
 */
export function CampoCodigosBarras({
  valor,
  formatosGravados,
  onChange,
  desabilitado = false,
  erro,
}: CampoCodigosBarrasProps) {
  const [entrada, setEntrada] = useState('')
  const [erroEntrada, setErroEntrada] = useState<string | null>(null)
  const [anuncio, setAnuncio] = useState('')
  const [focoPendente, setFocoPendente] = useState<FocoPendente | null>(null)

  // Foco depois do render que reordenou/removeu: o botao da seta fica
  // desabilitado nas pontas, entao cai na outra seta do mesmo codigo.
  useEffect(() => {
    if (!focoPendente) {
      return
    }
    let alvo: HTMLElement | null
    if (focoPendente.tipo === 'entrada') {
      alvo = document.getElementById('codigosBarras')
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

  const adicionar = () => {
    const codigo = normalizarCodigo(entrada)
    if (codigo === '') {
      setEntrada('')
      return
    }
    const bloqueio = motivoBloqueio(codigo, valor, formatosGravados)
    if (bloqueio) {
      // Mantem o texto para o usuario conferir a leitura.
      setErroEntrada(bloqueio)
      return
    }
    onChange([...valor, codigo])
    setEntrada('')
    setErroEntrada(null)
    setAnuncio(`Código ${codigo} adicionado.`)
  }

  const aoTeclar = (event: KeyboardEvent<HTMLInputElement>) => {
    // Leitor de codigo de barras termina com Enter: adiciona, nunca envia o formulario.
    if (event.key === 'Enter') {
      event.preventDefault()
      adicionar()
    }
  }

  const remover = (codigo: string) => {
    onChange(valor.filter((item) => item !== codigo))
    setErroEntrada(null)
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
  const descricaoIds = ['codigosBarras-ajuda', erroExibido ? 'codigosBarras-erro' : null].filter(Boolean).join(' ')

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="codigosBarras" className="text-sm font-medium">
          Adicionar código
        </label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <ScanBarcode
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="codigosBarras"
              value={entrada}
              onChange={(event) => {
                setEntrada(event.target.value)
                setErroEntrada(null)
              }}
              onKeyDown={aoTeclar}
              disabled={desabilitado}
              autoComplete="off"
              inputMode="text"
              placeholder="Leia com o leitor ou digite e tecle Enter"
              aria-invalid={erroExibido ? true : undefined}
              aria-describedby={descricaoIds}
              className="h-11 pl-9 tabular-nums"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={adicionar}
            disabled={desabilitado}
            className="h-11"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Adicionar
          </Button>
        </div>
        <p id="codigosBarras-ajuda" className="text-xs text-muted-foreground">
          Até {MAXIMO_CODIGOS_BARRAS} códigos. O primeiro é o exibido na lista de produtos.
        </p>
        {erroExibido && (
          <p id="codigosBarras-erro" role="alert" className="text-sm text-destructive">
            {erroExibido}
          </p>
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {anuncio}
      </p>

      {valor.length === 0 ? (
        <p className="rounded-md bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
          Nenhum código de barras cadastrado.
        </p>
      ) : (
        <ol aria-label="Códigos de barras do produto" className="space-y-2">
          {valor.map((codigo, indice) => {
            const formato = formatosGravados[codigo] ?? detectarFormato(codigo)
            const outro = formato === 'OUTRO'
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
                  {indice === 0 && valor.length > 1 && (
                    <span className="text-xs text-muted-foreground">Principal</span>
                  )}
                  <div className="flex items-center">
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
                {outro && <p className="mt-1 text-xs text-warning-soft-foreground">{AVISO_FORMATO_OUTRO}</p>}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
