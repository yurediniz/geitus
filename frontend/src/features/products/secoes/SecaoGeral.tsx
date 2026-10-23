import { useMemo } from 'react'
import { Controller, useFormContext } from 'react-hook-form'
import type { UseQueryResult } from '@tanstack/react-query'

import {
  AvisoCatalogo,
  CampoMoedaFormulario,
  CampoSelect,
  CampoTexto,
  ErroDoCampo,
} from '@/features/products/CamposFormulario'
import { CampoSugestao } from '@/features/products/CampoSugestao'
import {
  TAMANHO_MAXIMO_NOME_CURTO,
  nomeCurtoEfetivo,
  opcoesDeUnidade,
  type ProdutoFormValues,
} from '@/features/products/produtoFormulario'
import { SeletorCategoria } from '@/features/products/SeletorCategoria'
import type { Categoria, UnidadeMedida } from '@/types/catalogo'
import type { Produto } from '@/types/produto'

export interface SecaoGeralProps {
  /** Produto em edicao (null no cadastro): mantem unidade/categoria atuais mesmo inativas. */
  produto: Produto | null
  unidadesQuery: UseQueryResult<UnidadeMedida[]>
  categoriasQuery: UseQueryResult<Categoria[]>
  /** Sigla por id de unidade (lista + unidades do produto), para "Preço de venda (por KG)". */
  siglaPorId: ReadonlyMap<string, string>
  desabilitado: boolean
  somenteLeitura: boolean
  aoAlterarCampo: () => void
}

/**
 * Ajuda do nome curto: a previa do que sai no cupom (mesma regra do backend)
 * e o contador de caracteres.
 */
function AjudaNomeCurto({ nome, nomeCurto }: { nome: string; nomeCurto: string }) {
  const efetivo = nomeCurtoEfetivo(nome, nomeCurto)
  return (
    <span className="flex items-start justify-between gap-3">
      <span className="min-w-0 break-words">
        {efetivo === '' ? (
          'Usado no cupom e nos botões do PDV.'
        ) : (
          <>
            No cupom: <span className="font-medium text-foreground">{efetivo}</span>
          </>
        )}
      </span>
      <span className="shrink-0 tabular-nums">
        <span aria-hidden="true">
          {nomeCurto.length}/{TAMANHO_MAXIMO_NOME_CURTO}
        </span>
        <span className="sr-only">
          {nomeCurto.length} de {TAMANHO_MAXIMO_NOME_CURTO} caracteres
        </span>
      </span>
    </span>
  )
}

/**
 * Numero de registro do produto (so leitura): gerado pelo backend ao salvar e
 * imutavel; no cadastro ainda nao existe.
 */
function NumeroDoProduto({ numero }: { numero: number | null }) {
  return (
    <dl className="space-y-0.5">
      <dt className="text-sm text-muted-foreground">Nº do Produto</dt>
      <dd className={numero === null ? 'text-sm text-muted-foreground' : 'text-base font-semibold tabular-nums'}>
        {numero === null ? 'Será gerado ao salvar' : numero}
      </dd>
    </dl>
  )
}

/**
 * Secao Geral: o Nº do produto e o cadastro rapido (nome, unidade e preco de
 * venda, os essenciais para vender) primeiro; depois identificacao e descricao.
 * Os codigos ficam na secao Codigos e a unidade e embalagem, na Estoque. O
 * status fica no cabecalho da pagina.
 */
export function SecaoGeral({
  produto,
  unidadesQuery,
  categoriasQuery,
  siglaPorId,
  desabilitado,
  somenteLeitura,
  aoAlterarCampo,
}: SecaoGeralProps) {
  const {
    control,
    register,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<ProdutoFormValues>()

  const unidades = useMemo(() => unidadesQuery.data ?? [], [unidadesQuery.data])
  const categorias = useMemo(() => categoriasQuery.data ?? [], [categoriasQuery.data])
  const [unidadeIdAtual, nomeAtual, nomeCurtoAtual, custoAtual] = watch(['unidadeId', 'nome', 'nomeCurto', 'custo'])

  const opcoesUnidadeVenda = useMemo(
    () => opcoesDeUnidade(unidades, produto?.unidade ?? null),
    [unidades, produto],
  )

  const siglaVenda = siglaPorId.get(unidadeIdAtual)
  const carregandoUnidades = unidadesQuery.isPending

  /** Venda igual a compra (secao Estoque) deixa a compra sem sentido: limpa compra e fator. */
  const aoAlterarUnidadeVenda = (event: { target: { value: string } }) => {
    if (event.target.value !== '' && event.target.value === getValues('unidadeCompraId')) {
      setValue('unidadeCompraId', '', { shouldDirty: true })
      setValue('fatorConversao', '', { shouldDirty: true })
    }
    aoAlterarCampo()
  }

  return (
    <div className="space-y-6">
      <NumeroDoProduto numero={produto?.numero ?? null} />
      <div className="grid gap-4 md:grid-cols-2">
        <CampoTexto
          id="nome"
          label="Nome"
          obrigatorio
          erro={errors.nome?.message}
          inputProps={register('nome', { onChange: aoAlterarCampo })}
          disabled={desabilitado}
        />
        <CampoTexto
          id="nomeCurto"
          label="Nome curto (opcional)"
          erro={errors.nomeCurto?.message}
          ajuda={<AjudaNomeCurto nome={nomeAtual} nomeCurto={nomeCurtoAtual} />}
          inputProps={register('nomeCurto', { onChange: aoAlterarCampo })}
          disabled={desabilitado}
          maxLength={TAMANHO_MAXIMO_NOME_CURTO}
        />
        <div className="space-y-1.5">
          <CampoSelect
            id="unidadeId"
            label="Unidade de venda"
            obrigatorio
            erro={errors.unidadeId?.message}
            selectProps={register('unidadeId', { onChange: aoAlterarUnidadeVenda })}
            disabled={desabilitado || carregandoUnidades}
            opcaoVazia={carregandoUnidades ? 'Carregando unidades...' : 'Selecione a unidade'}
            opcoes={opcoesUnidadeVenda}
          />
          <AvisoCatalogo
            carregouComFalha={unidadesQuery.isError}
            mensagemFalha="Não foi possível carregar as unidades."
            onTentarNovamente={() => unidadesQuery.refetch()}
            semOpcoes={unidadesQuery.isSuccess && opcoesUnidadeVenda.length === 0}
            mensagemSemOpcoes="Nenhuma unidade ativa."
            linkSemOpcoes={somenteLeitura ? undefined : { to: '/produtos/unidades', rotulo: 'Cadastrar em Unidades' }}
          />
        </div>
        <CampoMoedaFormulario
          id="precoVenda"
          label={siglaVenda ? `Preço de venda (por ${siglaVenda})` : 'Preço de venda'}
          obrigatorio
          erro={errors.precoVenda?.message}
          // O custo fica na secao Precos; o aviso aparece aqui tambem, junto ao preco.
          custo={custoAtual}
          aoAlterar={aoAlterarCampo}
          disabled={desabilitado}
        />
        <div className="space-y-1.5">
          <label id="categoriaId-rotulo" htmlFor="categoriaId" className="text-sm font-medium">
            Categoria (opcional)
          </label>
          <Controller
            control={control}
            name="categoriaId"
            render={({ field }) => (
              <SeletorCategoria
                id="categoriaId"
                idRotulo="categoriaId-rotulo"
                categorias={categorias}
                valor={field.value}
                valorAtual={produto?.categoria ?? null}
                onChange={(categoriaId) => {
                  field.onChange(categoriaId)
                  aoAlterarCampo()
                }}
                podeCriar={!somenteLeitura}
                desabilitado={desabilitado || categoriasQuery.isPending}
              />
            )}
          />
          <AvisoCatalogo
            carregouComFalha={categoriasQuery.isError}
            mensagemFalha="Não foi possível carregar as categorias."
            onTentarNovamente={() => categoriasQuery.refetch()}
          />
        </div>
        <Controller
          control={control}
          name="marca"
          render={({ field }) => (
            <CampoSugestao
              id="marca"
              rotulo="Marca (opcional)"
              campo="marca"
              valor={field.value}
              onChange={(marca) => {
                field.onChange(marca)
                aoAlterarCampo()
              }}
              onBlur={field.onBlur}
              desabilitado={desabilitado}
              maxLength={100}
              placeholder="Ex.: Tio João"
              erro={errors.marca?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="fornecedor"
          render={({ field }) => (
            <CampoSugestao
              id="fornecedor"
              rotulo="Fornecedor principal (opcional)"
              campo="fornecedor"
              valor={field.value}
              onChange={(fornecedor) => {
                field.onChange(fornecedor)
                aoAlterarCampo()
              }}
              onBlur={field.onBlur}
              desabilitado={desabilitado}
              maxLength={100}
              erro={errors.fornecedor?.message}
            />
          )}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="descricao" className="text-sm font-medium">
          Descrição (opcional)
        </label>
        <textarea
          id="descricao"
          rows={3}
          disabled={desabilitado}
          aria-invalid={errors.descricao ? true : undefined}
          aria-describedby={errors.descricao ? 'descricao-erro' : undefined}
          placeholder="Observações e detalhes do produto"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
          {...register('descricao', { onChange: aoAlterarCampo })}
        />
        <ErroDoCampo id="descricao-erro" mensagem={errors.descricao?.message} />
      </div>
    </div>
  )
}
