import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CatalogoNav } from '@/features/products/CatalogoNav'
import { useAuth } from '@/hooks/useAuth'
import { HttpError } from '@/services/httpClient'
import {
  atualizarProduto,
  cadastrarProduto,
  inativarProduto,
  listarProdutos,
  reativarProduto,
} from '@/services/produtoService'
import type { Produto, ProdutoRequest, ProdutoStatusFiltro } from '@/types/produto'

const PRODUTOS_QUERY_KEY = ['produtos'] as const

const textoOpcional = (max: number, mensagem: string) =>
  z.string().trim().max(max, mensagem)

const numeroObrigatorio = z.string().trim()
  .min(1, 'Informe o preço de venda.')
  .refine((valor) => Number.isFinite(Number(valor)), 'Informe um número válido.')
  .refine((valor) => Number(valor) >= 0, 'Preço de venda não pode ser negativo.')

const numeroOpcional = (mensagemNegativo: string) =>
  z.string().trim()
    .refine((valor) => valor === '' || Number.isFinite(Number(valor)), 'Informe um número válido.')
    .refine((valor) => valor === '' || Number(valor) >= 0, mensagemNegativo)

const produtoSchema = z.object({
  nome: z.string().trim()
    .min(1, 'Informe o nome do produto.')
    .max(150, 'Nome deve ter no máximo 150 caracteres.'),
  categoria: textoOpcional(100, 'Categoria deve ter no máximo 100 caracteres.'),
  marca: textoOpcional(100, 'Marca deve ter no máximo 100 caracteres.'),
  unidade: textoOpcional(20, 'Unidade deve ter no máximo 20 caracteres.'),
  descricao: textoOpcional(1000, 'Descrição deve ter no máximo 1000 caracteres.'),
  precoVenda: numeroObrigatorio,
  custo: numeroOpcional('Custo não pode ser negativo.'),
  precoMinimo: numeroOpcional('Preço mínimo não pode ser negativo.'),
  estoqueMinimo: numeroOpcional('Estoque mínimo não pode ser negativo.'),
  estoqueMaximo: numeroOpcional('Estoque máximo não pode ser negativo.'),
  pontoReposicao: numeroOpcional('Ponto de reposição não pode ser negativo.'),
  codigoBarras: textoOpcional(50, 'Código de barras deve ter no máximo 50 caracteres.'),
  sku: textoOpcional(50, 'SKU deve ter no máximo 50 caracteres.'),
}).superRefine((valores, ctx) => {
  const preenchido = (valor: string) => valor.trim() !== ''
  if (
    preenchido(valores.precoMinimo) &&
    preenchido(valores.precoVenda) &&
    Number(valores.precoMinimo) > Number(valores.precoVenda)
  ) {
    ctx.addIssue({
      path: ['precoMinimo'],
      code: z.ZodIssueCode.custom,
      message: 'Preço mínimo não pode ser maior que o preço de venda.',
    })
  }
  if (
    preenchido(valores.estoqueMaximo) &&
    preenchido(valores.estoqueMinimo) &&
    Number(valores.estoqueMaximo) < Number(valores.estoqueMinimo)
  ) {
    ctx.addIssue({
      path: ['estoqueMaximo'],
      code: z.ZodIssueCode.custom,
      message: 'Estoque máximo não pode ser menor que o estoque mínimo.',
    })
  }
})

type ProdutoFormValues = z.infer<typeof produtoSchema>

const valoresIniciais: ProdutoFormValues = {
  nome: '',
  categoria: '',
  marca: '',
  unidade: '',
  descricao: '',
  precoVenda: '',
  custo: '',
  precoMinimo: '',
  estoqueMinimo: '',
  estoqueMaximo: '',
  pontoReposicao: '',
  codigoBarras: '',
  sku: '',
}

function textoOuNulo(valor: string): string | null {
  const texto = valor.trim()
  return texto === '' ? null : texto
}

function numeroOuNulo(valor: string): number | null {
  const texto = valor.trim()
  return texto === '' ? null : Number(texto)
}

function montarRequest(valores: ProdutoFormValues): ProdutoRequest {
  return {
    nome: valores.nome.trim(),
    categoria: textoOuNulo(valores.categoria),
    marca: textoOuNulo(valores.marca),
    unidade: textoOuNulo(valores.unidade),
    descricao: textoOuNulo(valores.descricao),
    precoVenda: Number(valores.precoVenda),
    custo: numeroOuNulo(valores.custo),
    precoMinimo: numeroOuNulo(valores.precoMinimo),
    estoqueMinimo: numeroOuNulo(valores.estoqueMinimo),
    estoqueMaximo: numeroOuNulo(valores.estoqueMaximo),
    pontoReposicao: numeroOuNulo(valores.pontoReposicao),
    codigoBarras: textoOuNulo(valores.codigoBarras),
    sku: textoOuNulo(valores.sku),
  }
}

function valoresDoProduto(produto: Produto): ProdutoFormValues {
  return {
    nome: produto.nome,
    categoria: produto.categoria ?? '',
    marca: produto.marca ?? '',
    unidade: produto.unidade ?? '',
    descricao: produto.descricao ?? '',
    precoVenda: String(produto.precoVenda),
    custo: produto.custo === null ? '' : String(produto.custo),
    precoMinimo: produto.precoMinimo === null ? '' : String(produto.precoMinimo),
    estoqueMinimo: produto.estoqueMinimo === null ? '' : String(produto.estoqueMinimo),
    estoqueMaximo: produto.estoqueMaximo === null ? '' : String(produto.estoqueMaximo),
    pontoReposicao: produto.pontoReposicao === null ? '' : String(produto.pontoReposicao),
    codigoBarras: produto.codigoBarras ?? '',
    sku: produto.sku ?? '',
  }
}

function formatarMoeda(valor: number | null): string {
  if (valor === null) {
    return 'Não informado'
  }
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Quantidade formatada (pt-BR) com a unidade quando houver; "Não informado" se nula. */
function formatarQuantidade(valor: number | null, unidade: string | null): string {
  if (valor === null) {
    return 'Não informado'
  }
  const formatado = valor.toLocaleString('pt-BR')
  return unidade ? `${formatado} ${unidade}` : formatado
}

/** Percentual derivado (margem/markup) formatado como "X,XX%"; null quando não há custo. */
function formatarPercentual(valor: number | null): string | null {
  if (valor === null) {
    return null
  }
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

/** Mensagem amigavel (pt-BR) para falhas ao salvar, sem vazar detalhe interno. */
function mensagemErroSalvar(erro: unknown): string {
  if (erro instanceof HttpError) {
    if (erro.status === 409) {
      // Duplicidade de SKU ou código de barras: usa a mensagem do backend
      // quando houver, com fallback amigável.
      if (erro.message && erro.message.trim() !== '') {
        return erro.message
      }
      return 'Já existe um produto com este SKU ou código de barras nesta empresa.'
    }
    if (erro.status === 400) {
      const mensagensCampos = erro.campos ? Object.values(erro.campos).filter(Boolean) : []
      if (mensagensCampos.length > 0) {
        return mensagensCampos.join(' ')
      }
      if (erro.message && erro.message !== 'Dados invalidos.') {
        return erro.message
      }
      return 'Revise os dados do produto e tente novamente.'
    }
  }
  return 'Não foi possível salvar o produto. Tente novamente.'
}

/** Pagina inicial do modulo Produtos. */
export function ProdutosPage() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()
  const somenteLeitura = usuario?.perfil !== 'ADMIN'
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [status, setStatus] = useState<ProdutoStatusFiltro>('todos')
  const [formularioAberto, setFormularioAberto] = useState(false)
  const [produtoEmEdicao, setProdutoEmEdicao] = useState<Produto | null>(null)
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [acaoStatusId, setAcaoStatusId] = useState<number | null>(null)

  const produtosQueryKey = useMemo(
    () => [...PRODUTOS_QUERY_KEY, { busca: buscaAplicada, status }],
    [buscaAplicada, status],
  )

  const {
    data: produtos = [],
    isPending,
    isError,
    refetch,
  } = useQuery<Produto[]>({
    queryKey: produtosQueryKey,
    queryFn: () => listarProdutos({ busca: buscaAplicada, status }),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProdutoFormValues>({
    resolver: zodResolver(produtoSchema),
    defaultValues: valoresIniciais,
  })

  useEffect(() => {
    if (produtoEmEdicao) {
      reset(valoresDoProduto(produtoEmEdicao))
      return
    }
    reset(valoresIniciais)
  }, [produtoEmEdicao, reset])

  const salvarMutation = useMutation<Produto, unknown, ProdutoFormValues>({
    mutationFn: (valores) => {
      const request = montarRequest(valores)
      if (produtoEmEdicao) {
        return atualizarProduto(produtoEmEdicao.id, request)
      }
      return cadastrarProduto(request)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PRODUTOS_QUERY_KEY })
      setMensagemSucesso(produtoEmEdicao ? 'Produto atualizado com sucesso.' : 'Produto cadastrado com sucesso.')
      setErroSalvar(null)
      setFormularioAberto(false)
      setProdutoEmEdicao(null)
      reset(valoresIniciais)
    },
    onError: (erro) => {
      setMensagemSucesso(null)
      setErroSalvar(mensagemErroSalvar(erro))
    },
  })

  const statusMutation = useMutation<Produto, unknown, { produto: Produto; proximoAtivo: boolean }>({
    mutationFn: ({ produto, proximoAtivo }) =>
      proximoAtivo ? reativarProduto(produto.id) : inativarProduto(produto.id),
    onMutate: ({ produto }) => {
      setAcaoStatusId(produto.id)
    },
    onSuccess: async (_, { proximoAtivo }) => {
      await queryClient.invalidateQueries({ queryKey: PRODUTOS_QUERY_KEY })
      setErroGeral(null)
      setMensagemSucesso(proximoAtivo ? 'Produto reativado com sucesso.' : 'Produto inativado com sucesso.')
    },
    onError: () => {
      setMensagemSucesso(null)
      setErroGeral('Não foi possível alterar o status do produto. Tente novamente.')
    },
    onSettled: () => {
      setAcaoStatusId(null)
    },
  })

  const abrirNovoProduto = () => {
    setProdutoEmEdicao(null)
    setFormularioAberto(true)
    setMensagemSucesso(null)
    setErroSalvar(null)
    setErroGeral(null)
    reset(valoresIniciais)
  }

  const abrirEdicao = (produto: Produto) => {
    setProdutoEmEdicao(produto)
    setFormularioAberto(true)
    setMensagemSucesso(null)
    setErroSalvar(null)
    setErroGeral(null)
  }

  const cancelarFormulario = () => {
    setFormularioAberto(false)
    setProdutoEmEdicao(null)
    setErroSalvar(null)
    reset(valoresIniciais)
  }

  const aplicarBusca = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBuscaAplicada(busca.trim())
  }

  const aoAlterarCampo = () => {
    setMensagemSucesso(null)
    setErroGeral(null)
  }

  const aoSubmeter = (valores: ProdutoFormValues) => {
    setErroSalvar(null)
    setMensagemSucesso(null)
    salvarMutation.mutate(valores)
  }

  const salvando = salvarMutation.isPending

  return (
    <div className="space-y-6">
      <CatalogoNav />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produtos</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Cadastre e mantenha os itens físicos vendidos pela empresa.
          </p>
        </div>

        {!somenteLeitura && (
          <Button type="button" onClick={abrirNovoProduto}>
            <Plus className="h-4 w-4" />
            Novo produto
          </Button>
        )}
      </div>

      {somenteLeitura && (
        <div className="flex max-w-2xl items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" />
          <span>Somente administradores podem gerenciar produtos. Você está no modo leitura.</span>
        </div>
      )}

      {mensagemSucesso && (
        <div
          role="status"
          className="flex max-w-2xl items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{mensagemSucesso}</span>
        </div>
      )}

      {erroGeral && (
        <div
          role="alert"
          className="flex max-w-2xl items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{erroGeral}</span>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={aplicarBusca} className="grid gap-3 lg:grid-cols-[1fr_180px_auto]">
            <div className="space-y-1.5">
              <label htmlFor="busca-produto" className="text-sm font-medium">
                Busca
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="busca-produto"
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Nome, SKU ou código de barras"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="status-produto" className="text-sm font-medium">
                Status
              </label>
              <select
                id="status-produto"
                value={status}
                onChange={(event) => setStatus(event.target.value as ProdutoStatusFiltro)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="todos">Todos</option>
                <option value="ativos">Ativos</option>
                <option value="inativos">Inativos</option>
              </select>
            </div>

            <div className="flex items-end">
              <Button type="submit" variant="outline" className="w-full lg:w-auto">
                Buscar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {formularioAberto && (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>{produtoEmEdicao ? 'Editar produto' : 'Novo produto'}</CardTitle>
            <CardDescription>
              Preencha os campos essenciais. SKU e código de barras são opcionais.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(aoSubmeter)} noValidate className="space-y-4">
              {erroSalvar && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{erroSalvar}</span>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <CampoTexto
                  id="nome"
                  label="Nome"
                  erro={errors.nome?.message}
                  inputProps={register('nome', { onChange: aoAlterarCampo })}
                  disabled={salvando}
                />
                <CampoTexto
                  id="precoVenda"
                  label="Preço de venda"
                  erro={errors.precoVenda?.message}
                  inputProps={register('precoVenda', { onChange: aoAlterarCampo })}
                  disabled={salvando}
                  type="number"
                  step="0.01"
                  min="0"
                />
                <CampoTexto
                  id="categoria"
                  label="Categoria (opcional)"
                  erro={errors.categoria?.message}
                  inputProps={register('categoria', { onChange: aoAlterarCampo })}
                  disabled={salvando}
                  placeholder="Ex.: Mercearia"
                />
                <CampoTexto
                  id="unidade"
                  label="Unidade (opcional)"
                  erro={errors.unidade?.message}
                  inputProps={register('unidade', { onChange: aoAlterarCampo })}
                  disabled={salvando}
                  placeholder="Ex.: UN, kg, cx"
                />
                <CampoTexto
                  id="marca"
                  label="Marca (opcional)"
                  erro={errors.marca?.message}
                  inputProps={register('marca', { onChange: aoAlterarCampo })}
                  disabled={salvando}
                  placeholder="Ex.: Tio João"
                />
              </div>

              <div className="space-y-4 rounded-md bg-muted/40 p-4">
                <div>
                  <h3 className="text-sm font-medium">Custo, estoque e identificação (opcional)</h3>
                  <p className="text-xs text-muted-foreground">
                    Custo e preços, níveis de estoque, códigos e descrição. Preencha se fizer sentido para o seu negócio.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <CampoTexto
                    id="custo"
                    label="Custo (opcional)"
                    erro={errors.custo?.message}
                    inputProps={register('custo', { onChange: aoAlterarCampo })}
                    disabled={salvando}
                    type="number"
                    step="0.01"
                    min="0"
                  />
                  <CampoTexto
                    id="precoMinimo"
                    label="Preço mínimo (opcional)"
                    erro={errors.precoMinimo?.message}
                    inputProps={register('precoMinimo', { onChange: aoAlterarCampo })}
                    disabled={salvando}
                    type="number"
                    step="0.01"
                    min="0"
                  />
                  <CampoTexto
                    id="estoqueMinimo"
                    label="Estoque mínimo (opcional)"
                    erro={errors.estoqueMinimo?.message}
                    inputProps={register('estoqueMinimo', { onChange: aoAlterarCampo })}
                    disabled={salvando}
                    type="number"
                    step="0.001"
                    min="0"
                  />
                  <CampoTexto
                    id="estoqueMaximo"
                    label="Estoque máximo (opcional)"
                    erro={errors.estoqueMaximo?.message}
                    inputProps={register('estoqueMaximo', { onChange: aoAlterarCampo })}
                    disabled={salvando}
                    type="number"
                    step="0.001"
                    min="0"
                  />
                  <CampoTexto
                    id="pontoReposicao"
                    label="Ponto de reposição (opcional)"
                    erro={errors.pontoReposicao?.message}
                    inputProps={register('pontoReposicao', { onChange: aoAlterarCampo })}
                    disabled={salvando}
                    type="number"
                    step="0.001"
                    min="0"
                  />
                  <CampoTexto
                    id="codigoBarras"
                    label="Código de barras (opcional)"
                    erro={errors.codigoBarras?.message}
                    inputProps={register('codigoBarras', { onChange: aoAlterarCampo })}
                    disabled={salvando}
                  />
                  <CampoTexto
                    id="sku"
                    label="SKU (opcional)"
                    erro={errors.sku?.message}
                    inputProps={register('sku', { onChange: aoAlterarCampo })}
                    disabled={salvando}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="descricao" className="text-sm font-medium">
                    Descrição (opcional)
                  </label>
                  <textarea
                    id="descricao"
                    rows={3}
                    disabled={salvando}
                    aria-invalid={errors.descricao ? true : undefined}
                    aria-describedby={errors.descricao ? 'descricao-erro' : undefined}
                    placeholder="Observações e detalhes do produto"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    {...register('descricao', { onChange: aoAlterarCampo })}
                  />
                  {errors.descricao && (
                    <p id="descricao-erro" className="text-sm text-destructive">
                      {errors.descricao.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={cancelarFormulario} disabled={salvando}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={salvando}>
                  {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                  {salvando ? 'Salvando...' : 'Salvar produto'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lista de produtos</CardTitle>
          <CardDescription>
            {buscaAplicada
              ? `Resultados para "${buscaAplicada}".`
              : 'Produtos cadastrados na empresa autenticada.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando produtos...
            </p>
          )}

          {isError && (
            <div className="space-y-3">
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Não foi possível carregar os produtos.</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </div>
          )}

          {!isPending && !isError && produtos.length === 0 && (
            <div className="flex max-w-xl items-start gap-3 rounded-md border border-dashed p-4">
              <Package className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Nenhum produto encontrado.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cadastre o primeiro produto ou ajuste os filtros da busca.
                </p>
              </div>
            </div>
          )}

          {!isPending && !isError && produtos.length > 0 && (
            <div className="grid gap-3">
              {produtos.map((produto) => (
                <ProdutoItem
                  key={produto.id}
                  produto={produto}
                  somenteLeitura={somenteLeitura}
                  onEditar={() => abrirEdicao(produto)}
                  onAlterarStatus={() =>
                    statusMutation.mutate({ produto, proximoAtivo: !produto.ativo })
                  }
                  alterandoStatus={acaoStatusId === produto.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface CampoTextoProps {
  id: keyof ProdutoFormValues
  label: string
  erro?: string
  disabled?: boolean
  placeholder?: string
  type?: string
  step?: string
  min?: string
  inputProps: UseFormRegisterReturn
}

function CampoTexto({
  id,
  label,
  erro,
  disabled,
  placeholder,
  type = 'text',
  step,
  min,
  inputProps,
}: CampoTextoProps) {
  const erroId = `${id}-erro`
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        type={type}
        step={step}
        min={min}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? erroId : undefined}
        {...inputProps}
      />
      {erro && (
        <p id={erroId} className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  )
}

interface ProdutoItemProps {
  produto: Produto
  somenteLeitura: boolean
  onEditar: () => void
  onAlterarStatus: () => void
  alterandoStatus: boolean
}

function ProdutoItem({
  produto,
  somenteLeitura,
  onEditar,
  onAlterarStatus,
  alterandoStatus,
}: ProdutoItemProps) {
  const margem = formatarPercentual(produto.margem)
  const markup = formatarPercentual(produto.markup)

  return (
    <article className="rounded-md border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-medium">{produto.nome}</h2>
            {produto.marca && (
              <span className="truncate text-sm text-muted-foreground">{produto.marca}</span>
            )}
            <span
              className={
                produto.ativo
                  ? 'rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'
                  : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
              }
            >
              {produto.ativo ? 'Ativo' : 'Inativo'}
            </span>
          </div>

          <dl className="grid gap-x-4 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <dt className="font-medium text-foreground">Preço</dt>
              <dd>{formatarMoeda(produto.precoVenda)}</dd>
            </div>
            {produto.custo !== null && (
              <div>
                <dt className="font-medium text-foreground">Custo</dt>
                <dd>{formatarMoeda(produto.custo)}</dd>
              </div>
            )}
            {margem && (
              <div>
                <dt className="font-medium text-foreground">Margem</dt>
                <dd>{margem}</dd>
              </div>
            )}
            {markup && (
              <div>
                <dt className="font-medium text-foreground">Markup</dt>
                <dd>{markup}</dd>
              </div>
            )}
            {produto.precoMinimo !== null && (
              <div>
                <dt className="font-medium text-foreground">Preço mínimo</dt>
                <dd>{formatarMoeda(produto.precoMinimo)}</dd>
              </div>
            )}
            {produto.sku && (
              <div>
                <dt className="font-medium text-foreground">SKU</dt>
                <dd>{produto.sku}</dd>
              </div>
            )}
            {produto.codigoBarras && (
              <div>
                <dt className="font-medium text-foreground">Código de barras</dt>
                <dd>{produto.codigoBarras}</dd>
              </div>
            )}
            {produto.categoria && (
              <div>
                <dt className="font-medium text-foreground">Categoria</dt>
                <dd>{produto.categoria}</dd>
              </div>
            )}
            {produto.unidade && (
              <div>
                <dt className="font-medium text-foreground">Unidade</dt>
                <dd>{produto.unidade}</dd>
              </div>
            )}
            {produto.estoqueMinimo !== null && (
              <div>
                <dt className="font-medium text-foreground">Estoque mínimo</dt>
                <dd>{formatarQuantidade(produto.estoqueMinimo, produto.unidade)}</dd>
              </div>
            )}
            {produto.estoqueMaximo !== null && (
              <div>
                <dt className="font-medium text-foreground">Estoque máximo</dt>
                <dd>{formatarQuantidade(produto.estoqueMaximo, produto.unidade)}</dd>
              </div>
            )}
            {produto.pontoReposicao !== null && (
              <div>
                <dt className="font-medium text-foreground">Ponto de reposição</dt>
                <dd>{formatarQuantidade(produto.pontoReposicao, produto.unidade)}</dd>
              </div>
            )}
          </dl>
        </div>

        {!somenteLeitura && (
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onEditar}>
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAlterarStatus}
              disabled={alterandoStatus}
            >
              {alterandoStatus ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : produto.ativo ? (
                <XCircle className="h-4 w-4" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {produto.ativo ? 'Inativar' : 'Reativar'}
            </Button>
          </div>
        )}
      </div>
    </article>
  )
}
