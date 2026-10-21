import { useEffect, useState, type KeyboardEvent } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { Input } from '@/components/ui/input'
import { ErroDoCampo } from '@/features/products/CamposFormulario'
import { PRODUTOS_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import { cn } from '@/lib/utils'
import { listarSugestoes } from '@/services/produtoService'
import type { CampoSugestaoProduto } from '@/types/produto'

/** Espera de digitacao antes de buscar sugestoes. */
const ATRASO_SUGESTOES_MS = 250

/** Sugestoes ficam sob o prefixo de produtos: salvar um produto as atualiza. */
function chaveDasSugestoes(campo: CampoSugestaoProduto, termo: string) {
  return [...PRODUTOS_QUERY_KEY, 'sugestoes', campo, termo] as const
}

/** Valor que so acompanha `valor` depois de `atrasoMs` sem mudancas. */
function useValorComAtraso(valor: string, atrasoMs: number): string {
  const [atrasado, setAtrasado] = useState(valor)
  useEffect(() => {
    const timer = window.setTimeout(() => setAtrasado(valor), atrasoMs)
    return () => window.clearTimeout(timer)
  }, [valor, atrasoMs])
  return atrasado
}

export interface CampoSugestaoProps {
  id: string
  rotulo: string
  campo: CampoSugestaoProduto
  valor: string
  onChange: (valor: string) => void
  onBlur?: () => void
  desabilitado?: boolean
  maxLength: number
  placeholder?: string
  erro?: string
}

/**
 * Texto livre com sugestoes dos valores ja usados na empresa (padrao ARIA
 * combobox com listbox). Aceita valor novo: a sugestao so ajuda a manter a
 * mesma grafia (ex.: "Golden" e nao "golden").
 */
export function CampoSugestao({
  id,
  rotulo,
  campo,
  valor,
  onChange,
  onBlur,
  desabilitado = false,
  maxLength,
  placeholder,
  erro,
}: CampoSugestaoProps) {
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(-1)
  const termo = useValorComAtraso(valor.trim(), ATRASO_SUGESTOES_MS)

  const sugestoesQuery = useQuery<string[]>({
    queryKey: chaveDasSugestoes(campo, termo),
    queryFn: () => listarSugestoes(campo, termo),
    enabled: aberto && !desabilitado,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })

  // O valor ja digitado igual (mesma grafia) nao precisa ser sugerido.
  const opcoes = (sugestoesQuery.data ?? []).filter((sugestao) => sugestao !== valor.trim())
  const listaVisivel = aberto && !desabilitado && opcoes.length > 0
  const idLista = `${id}-sugestoes`
  const idOpcao = (indice: number) => `${id}-sugestao-${indice}`
  const erroId = `${id}-erro`

  const fechar = () => {
    setAberto(false)
    setAtivo(-1)
  }

  const escolher = (sugestao: string) => {
    onChange(sugestao)
    fechar()
  }

  const aoTeclar = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!aberto) {
        setAberto(true)
        return
      }
      if (opcoes.length > 0) {
        setAtivo((atual) => (atual + 1) % opcoes.length)
      }
      return
    }
    if (event.key === 'ArrowUp') {
      if (listaVisivel) {
        event.preventDefault()
        setAtivo((atual) => (atual <= 0 ? opcoes.length - 1 : atual - 1))
      }
      return
    }
    if (event.key === 'Enter') {
      // Com uma sugestao destacada, Enter a escolhe (sem enviar o formulario).
      if (listaVisivel && ativo >= 0 && ativo < opcoes.length) {
        event.preventDefault()
        escolher(opcoes[ativo])
      }
      return
    }
    if (event.key === 'Escape' && listaVisivel) {
      event.preventDefault()
      fechar()
    }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listaVisivel}
          aria-controls={idLista}
          aria-activedescendant={listaVisivel && ativo >= 0 ? idOpcao(ativo) : undefined}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? erroId : undefined}
          autoComplete="off"
          value={valor}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={desabilitado}
          onChange={(event) => {
            onChange(event.target.value)
            setAberto(true)
            setAtivo(-1)
          }}
          onFocus={() => setAberto(true)}
          onClick={() => setAberto(true)}
          onBlur={() => {
            fechar()
            onBlur?.()
          }}
          onKeyDown={aoTeclar}
        />
        <ul
          id={idLista}
          role="listbox"
          aria-label={`Sugestões de ${rotulo.replace(/\s*\(opcional\)$/i, '').toLowerCase()}`}
          hidden={!listaVisivel}
          className="absolute top-full right-0 left-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {listaVisivel &&
            opcoes.map((sugestao, indice) => (
              <li
                key={sugestao}
                id={idOpcao(indice)}
                role="option"
                aria-selected={indice === ativo}
                // mousedown: escolhe antes do blur do campo fechar a lista.
                onMouseDown={(event) => {
                  event.preventDefault()
                  escolher(sugestao)
                }}
                onMouseEnter={() => setAtivo(indice)}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center rounded-sm px-3 text-sm',
                  indice === ativo && 'bg-accent text-accent-foreground',
                )}
              >
                {sugestao}
              </li>
            ))}
        </ul>
      </div>
      <ErroDoCampo id={erroId} mensagem={erro} />
    </div>
  )
}
