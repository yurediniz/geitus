import { useMemo } from 'react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import type { UseQueryResult } from '@tanstack/react-query'

import {
  AvisoCatalogo,
  CampoMoedaFormulario,
  CampoSelect,
  CampoTexto,
  ErroDoCampo,
} from '@/features/products/CamposFormulario'
import {
  TAMANHO_MAXIMO_NOME_CURTO,
  nomeCurtoEfetivo,
  opcoesDeUnidade,
  type ProdutoFormValues,
} from '@/features/products/produtoFormulario'
import { SeletorCategoria, SeletorMarca } from '@/features/products/SeletorCategoria'
import { CamposFornecedoresDoProduto } from '@/features/products/secoes/CamposFornecedoresDoProduto'
import { QuadroDaImagem, type AcaoNaImagem } from '@/features/products/secoes/QuadroDaImagem'
import type { ControleDaImagem } from '@/features/products/imagemPendente'
import type { Categoria, Marca, UnidadeMedida } from '@/types/catalogo'
import type { Produto } from '@/types/produto'

export interface SecaoGeralProps {
  /** Produto em edicao (null no cadastro): mantem unidade, categoria e marca atuais mesmo inativas. */
  produto: Produto | null
  unidadesQuery: UseQueryResult<UnidadeMedida[]>
  categoriasQuery: UseQueryResult<Categoria[]>
  marcasQuery: UseQueryResult<Marca[]>
  /** Sigla por id de unidade (lista + unidades do produto), para "Preço de venda (por KG)". */
  siglaPorId: ReadonlyMap<string, string>
  desabilitado: boolean
  somenteLeitura: boolean
  aoAlterarCampo: () => void
  /** Imagem gravada e a mudanca pendente (gravada com o Salvar da tela). */
  imagem: ControleDaImagem
  /** A imagem esta subindo, depois do Salvar. */
  enviandoImagem: boolean
  /** O produto foi salvo e a imagem pendente nao subiu. */
  imagemNaoEnviada: boolean
  /** Uma acao no quadro da imagem. */
  aoAlterarImagem: (acao: AcaoNaImagem) => void
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
 * Secao Geral (o Nº do produto fica na linha do titulo, na pagina): a imagem no topo (Fase F), o cadastro
 * rapido (nome, unidade e preco de venda, os essenciais para vender) primeiro; depois identificacao e descricao.
 * Os codigos ficam na secao Codigos e as embalagens, na Embalagens. O
 * status fica no cabecalho da pagina.
 */
export function SecaoGeral({
  produto,
  unidadesQuery,
  categoriasQuery,
  marcasQuery,
  siglaPorId,
  desabilitado,
  somenteLeitura,
  aoAlterarCampo,
  imagem,
  enviandoImagem,
  imagemNaoEnviada,
  aoAlterarImagem,
}: SecaoGeralProps) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<ProdutoFormValues>()

  const unidades = useMemo(() => unidadesQuery.data ?? [], [unidadesQuery.data])
  const categorias = useMemo(() => categoriasQuery.data ?? [], [categoriasQuery.data])
  const marcas = useMemo(() => marcasQuery.data ?? [], [marcasQuery.data])
  const [unidadeIdAtual, nomeAtual, nomeCurtoAtual, custoAtual] = useWatch({
    control,
    name: ['unidadeId', 'nome', 'nomeCurto', 'custo'],
  })

  const opcoesUnidadeVenda = useMemo(
    () => opcoesDeUnidade(unidades, produto?.unidade ?? null),
    [unidades, produto],
  )

  const siglaVenda = siglaPorId.get(unidadeIdAtual)
  const carregandoUnidades = unidadesQuery.isPending

  return (
    <div className="space-y-6">
      <QuadroDaImagem
        imagem={imagem}
        nomeDoProduto={nomeAtual.trim() || produto?.nome || 'Imagem do produto'}
        somenteLeitura={somenteLeitura}
        desabilitado={desabilitado}
        enviando={enviandoImagem}
        naoEnviada={imagemNaoEnviada}
        aoAlterar={aoAlterarImagem}
      />
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
            selectProps={register('unidadeId', { onChange: aoAlterarCampo })}
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
        <div className="space-y-1.5">
          <label id="marcaId-rotulo" htmlFor="marcaId" className="text-sm font-medium">
            Marca (opcional)
          </label>
          <Controller
            control={control}
            name="marcaId"
            render={({ field }) => (
              <SeletorMarca
                id="marcaId"
                idRotulo="marcaId-rotulo"
                marcas={marcas}
                valor={field.value}
                valorAtual={produto?.marca ?? null}
                onChange={(marcaId) => {
                  field.onChange(marcaId)
                  aoAlterarCampo()
                }}
                podeCriar={!somenteLeitura}
                desabilitado={desabilitado || marcasQuery.isPending}
                invalido={errors.marcaId !== undefined}
                idsDescricao={errors.marcaId ? 'marcaId-erro' : undefined}
              />
            )}
          />
          <ErroDoCampo id="marcaId-erro" mensagem={errors.marcaId?.message} />
          <AvisoCatalogo
            carregouComFalha={marcasQuery.isError}
            mensagemFalha="Não foi possível carregar as marcas."
            onTentarNovamente={() => marcasQuery.refetch()}
          />
        </div>
        <CamposFornecedoresDoProduto desabilitado={desabilitado} aoAlterarCampo={aoAlterarCampo} />
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
